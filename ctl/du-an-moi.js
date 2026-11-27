// Tạo dự án mới (CEO duyệt 16/11/2026: "gợi ý tên + tự làm khi duyệt").
// 1. Gợi ý: CEO gõ ý tưởng → văn phòng đề xuất 3 tên repo kèm mô tả (Claude Haiku, rẻ; lỗi thì đặt tên theo quy tắc từ chữ
//    của ý tưởng) và kiểm tên nào còn trống trên tài khoản GitHub đang đăng nhập. Bước này KHÔNG tạo gì.
// 2. Duyệt: CEO chọn/sửa tên rồi bấm duyệt → chạy quy trình khởi động, từng bước có trạng thái để giao diện theo dõi:
//    tạo repo (mặc định riêng tư) → tải về D:\Projects và mở làm dự án (agent.md theo mẫu v2.2) → lưu ý tưởng →
//    cài bộ kiểm chu trình CI (mở nhánh + link PR, không tự merge) → giao Hinata đặc tả (bước 1 của chu trình /bcc).
//    Bước nào lỗi thì dừng ở đó, ghi rõ lý do; các bước đã xong giữ nguyên (không xoá repo đã tạo).
"use strict";
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { resolveProgram } = require("./policy");
const nhanh = require("./nhanh");
const fs = require("fs");
const path = require("path");
const { cleanEnv, maskSecrets } = require("../lib/mask");
const { writeAtomic } = require("../lib/ghi-file");

const err = (code, message) => Object.assign(new Error(message), { code });
const TEN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const STOP = new Set(["app", "cho", "cua", "va", "la", "mot", "nhung", "cac", "de", "voi", "ve", "trong", "tren", "duoc", "co", "khong", "nguoi", "toi", "minh", "lam", "giup", "the", "a", "an", "and", "for", "of", "to", "with"]);

// "Ứng dụng học tiếng Anh cho trẻ em" → "ung-dung-hoc-tieng-anh"; bỏ dấu, bỏ từ đệm, tối đa 4 từ.
function slug(text, max = 4) {
  const words = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w && !STOP.has(w));
  return words.slice(0, max).join("-").slice(0, 40).replace(/-+$/, "");
}
function chuanTen(t) {
  const s = String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return TEN.test(s) ? s : null;
}
// Tên theo quy tắc khi không gọi được AI: 3 biến thể từ chữ của ý tưởng.
function goiYQuyTac(yTuong) {
  const a = slug(yTuong, 4), b = slug(yTuong, 2), out = [];
  for (const t of [a, b && b + "-app", b && b + "-ai"]) { const c = chuanTen(t); if (c && !out.includes(c)) out.push(c); }
  if (!out.length) out.push("du-an-" + crypto.randomBytes(2).toString("hex"));
  return out.map((ten) => ({ ten, moTa: String(yTuong).trim().split(/\r?\n/)[0].slice(0, 200) }));
}

// Gọi Claude Haiku một lượt, không công cụ, tối đa 60 giây. Ý tưởng là chữ của CEO; kết quả được kiểm lại bằng chuanTen.
function goiYClaude(yTuong) {
  const prompt = "Đặt 3 tên repo GitHub cho ý tưởng dự án dưới đây. Tên: tiếng Anh hoặc tiếng Việt không dấu, chữ thường, số và gạch ngang, 3–40 ký tự, ngắn, dễ nhớ, nói đúng sản phẩm. " +
    "Mỗi tên kèm một câu mô tả tiếng Việt (dưới 150 ký tự) dùng làm mô tả repo. Chỉ trả về JSON đúng dạng: [{\"ten\":\"...\",\"mo_ta\":\"...\"}] — không thêm chữ nào khác.\n\nÝ TƯỞNG:\n" + yTuong;
  return new Promise((resolve, reject) => {
    let prog;
    try { prog = resolveProgram("claude"); } catch { return reject(new Error("Không tìm thấy Claude CLI")); }
    const child = spawn(prog[0], [...prog.slice(1), "-p", prompt, "--model", "haiku", "--output-format", "json", "--max-turns", "1", "--tools", ""],
      { cwd: os.tmpdir(), env: cleanEnv(), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error("Claude gợi ý tên quá 60 giây")); }, 60000);
    child.stdout.on("data", (d) => { out += d; if (out.length > 200000) child.kill(); });
    child.on("error", () => { clearTimeout(timer); reject(new Error("Không chạy được Claude CLI")); });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const text = String(JSON.parse(out).result || "");
        const m = /\[[\s\S]*\]/.exec(text);
        const arr = JSON.parse(m ? m[0] : text);
        resolve(arr.map((x) => ({ ten: chuanTen(x.ten), moTa: String(x.mo_ta || x.moTa || "").slice(0, 200) })).filter((x) => x.ten));
      } catch { reject(new Error("Claude trả gợi ý không đúng dạng")); }
    });
  });
}

// Dự án phim (Xưởng phim AI, P1): sau khi tải repo về, đặt khuôn hồ sơ phim. Không ghi đè file đã có trong repo;
// .gitignore đã có thì chỉ thêm dòng media/ (ảnh, giọng, clip nặng không vào git).
const LOAI = ["phan-mem", "phim"];
const KHUNG_PHIM = path.join(__dirname, "khung", "phim");
const FILE_KHUNG = ["phim.json", "kich-ban.md", "PHIM.md"];
const VIEC_PHIM = "DỰ ÁN PHIM (Xưởng phim AI). Đọc PHIM.md trước. Việc của lượt này: viết kịch bản vào kich-ban.md và chia cảnh vào phim.json " +
  "(lời dẫn, khung hình, nhân vật, máy quay, số câu từng cảnh); người thật trong phim khai ở nguoi_that với dong_y: false để CEO xác nhận. " +
  "Chạy `node $env:XUONG_PHIM_CONG_CU kiem` trước khi bàn giao.\n\nÝ TƯỞNG CỦA CEO:\n";
const thongTinFile = (root, f) => fs.lstatSync(path.join(root, f), { throwIfNoEntry: false });

function datKhungPhim(root, ten, giu = new Set()) {
  const da = [];
  for (const f of FILE_KHUNG) {
    const dich = path.join(root, f);
    if (giu.has(f) || thongTinFile(root, f)) continue;
    let noiDung = fs.readFileSync(path.join(KHUNG_PHIM, f), "utf8");
    if (f === "phim.json") { const j = JSON.parse(noiDung); j.ten = ten; noiDung = JSON.stringify(j, null, 2) + "\n"; }
    fs.writeFileSync(dich, noiDung, { flag: "wx" });
    da.push(f);
  }
  if (!giu.has(".gitignore")) {
    const gi = path.join(root, ".gitignore");
    const info = thongTinFile(root, ".gitignore");
    if (info && !info.isFile()) throw err("GIT_BRANCH", ".gitignore phải là file thường để đặt khuôn phim.");
    const cu = info ? fs.readFileSync(gi, "utf8") : null;
    if (cu === null) { fs.copyFileSync(path.join(KHUNG_PHIM, "gitignore.txt"), gi, fs.constants.COPYFILE_EXCL); da.push(".gitignore"); }
    else if (!/^\/?media\/?\s*$/m.test(cu)) { fs.appendFileSync(gi, (cu.endsWith("\n") || !cu ? "" : "\n") + "media/\n"); da.push(".gitignore (thêm media/)"); }
  }
  fs.mkdirSync(path.join(root, "media", "giong"), { recursive: true });
  return { da };
}

// Chuẩn bị commit trong worktree riêng. Git báo lỗi thì thư mục dự án vẫn sạch để thử lại.
function luuKhungPhim(root, ten, git) {
  if (!git) return { ...datKhungPhim(root, ten), giu: [], commit: null };

  const tmp = path.join(os.tmpdir(), "vp-khung-phim-" + crypto.randomBytes(8).toString("hex"));
  let daTaoWorktree = false;
  let da, giu, commit;
  try {
    nhanh.git(root, ["worktree", "add", "--quiet", "--detach", tmp, git.startHead], { timeout: 60000 });
    daTaoWorktree = true;
    const files = [...FILE_KHUNG, ".gitignore"];
    giu = files.filter((f) => thongTinFile(root, f) && !thongTinFile(tmp, f));
    if (giu.includes(".gitignore")) {
      // Giữ nguyên file ngoài Git của CEO, đồng thời tránh để công cụ tự lưu media vào Git.
      try { nhanh.git(root, ["check-ignore", "-q", "--", "media/"]); }
      catch { throw err("GIT_BRANCH", "Hãy thêm media/ vào .gitignore đang lưu trên máy rồi thử lại."); }
    }
    ({ da } = datKhungPhim(tmp, ten, new Set(giu)));
    if (da.length) {
      nhanh.git(tmp, ["add", "--", ...files.filter((f) => !giu.includes(f))]);
      const saved = nhanh.save(tmp, { branch: "HEAD", baseline: [] }, "chore(phim): đặt khuôn hồ sơ phim");
      if (saved.secret) throw err("SECRET", "Git phát hiện nội dung giống khóa trong khuôn hồ sơ phim.");
      if (!saved.commit) throw err("GIT_BRANCH", saved.error || saved.skipped);
      if (nhanh.branchOf(root) !== git.branch || nhanh.head(root) !== git.startHead) {
        throw err("GIT_BRANCH", "Nhánh dự án đã thay đổi trong lúc chuẩn bị khuôn phim.");
      }
      nhanh.git(root, ["merge", "--ff-only", "--no-overwrite-ignore", "--quiet", nhanh.head(tmp)]);
      commit = saved.commit;
    }
    fs.mkdirSync(path.join(root, "media", "giong"), { recursive: true });
  } catch (e) {
    if (e.code === "SECRET") throw e;
    throw err("GIT_BRANCH", "Không commit được khuôn hồ sơ phim: " + maskSecrets(String(e.stderr || e.message)).slice(0, 250));
  } finally {
    if (daTaoWorktree) {
      try { nhanh.git(root, ["worktree", "remove", "--force", tmp], { timeout: 60000 }); } catch { /* Git có thể còn giữ worktree tạm nếu Windows khóa file. */ }
    }
  }
  return { da, giu, commit };
}

// Tài liệu CEO đính kèm vào mô tả dự án mới (CEO 28/11/2026): đặc tả, ảnh phác thảo, tài liệu tham khảo để Hinata và đội
// hình dung rõ sản phẩm. Lưu vào thư mục tai-lieu-y-tuong/ của repo vừa tải về và ghi vào .git/info/exclude: CHỈ nằm trên
// máy, không commit, không đẩy lên GitHub (tài liệu riêng của CEO), cây làm việc vẫn sạch để chu trình tạo nhánh bình thường.
const DINH_KEM = { thuMuc: "tai-lieu-y-tuong", toiDa: 5, moiTep: 4 * 1024 * 1024, tong: 10 * 1024 * 1024 };
const DUOI_DINH_KEM = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"]);
// Giới hạn thân yêu cầu POST /du-an-moi: base64 dài thêm 1/3, cộng chỗ cho ý tưởng và tên tệp.
const DINH_KEM_BODY = Math.ceil(DINH_KEM.tong / 3) * 4 + 64 * 1024;

function kiemDinhKem(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw err("BAD_REQUEST", "Tài liệu đính kèm phải là danh sách tệp.");
  if (list.length > DINH_KEM.toiDa) throw err("BAD_REQUEST", "Đính kèm tối đa " + DINH_KEM.toiDa + " tệp.");
  const out = [];
  let tong = 0;
  for (const x of list) {
    if (!x || typeof x.ten !== "string" || typeof x.base64 !== "string") throw err("BAD_REQUEST", "Tệp đính kèm không hợp lệ.");
    // Chỉ giữ tên tệp (bỏ đường dẫn), ký tự an toàn; tên trùng thì thêm số.
    let ten = x.ten.split(/[\\/]/).pop().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}_.() -]/gu, "-").replace(/^[.\s]+/, "").trim().slice(-100);
    const duoi = path.extname(ten).toLowerCase();
    if (!ten || !DUOI_DINH_KEM.has(duoi)) throw err("BAD_REQUEST", "Tệp \"" + x.ten.slice(0, 80) + "\" không đính kèm được. Nhận: " + [...DUOI_DINH_KEM].join(", ") + ".");
    const bytes = Buffer.from(x.base64, "base64");
    if (!bytes.length || bytes.toString("base64") !== x.base64.replace(/\s/g, "")) throw err("BAD_REQUEST", "Tệp \"" + ten + "\" rỗng hoặc không đọc được.");
    if (bytes.length > DINH_KEM.moiTep) throw err("TOO_LARGE", "Tệp \"" + ten + "\" lớn quá " + DINH_KEM.moiTep / 1048576 + " MB.");
    tong += bytes.length;
    if (tong > DINH_KEM.tong) throw err("TOO_LARGE", "Tổng tài liệu đính kèm lớn quá " + DINH_KEM.tong / 1048576 + " MB.");
    for (let i = 2; out.some((o) => o.ten.toLowerCase() === ten.toLowerCase()); i++) ten = path.basename(ten, duoi).replace(/ \(\d+\)$/, "") + " (" + i + ")" + duoi;
    out.push({ ten, bytes });
  }
  return out;
}

// Ghi tệp vào repo (không ghi đè tệp đã có) và thêm thư mục vào .git/info/exclude. Trả danh sách tên đã lưu.
function luuDinhKem(root, files) {
  let gitPath = null;
  try { gitPath = nhanh.git(root, ["rev-parse", "--git-path", "info/exclude"]).trim(); } catch {}
  if (gitPath) {
    const f = path.resolve(root, gitPath);
    let txt = "";
    try { txt = fs.readFileSync(f, "utf8"); } catch {}
    if (!new RegExp("^/?" + DINH_KEM.thuMuc + "/?\\s*$", "m").test(txt)) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.appendFileSync(f, (txt && !txt.endsWith("\n") ? "\n" : "") + "# Văn phòng AI: tài liệu CEO đính kèm khi tạo dự án, chỉ giữ trên máy\n/" + DINH_KEM.thuMuc + "/\n");
    }
  }
  const dir = path.join(root, DINH_KEM.thuMuc);
  const info = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw err("PATH_ESCAPE", DINH_KEM.thuMuc + " trong repo phải là thư mục thường.");
  fs.mkdirSync(dir, { recursive: true });
  const da = [];
  for (const { ten, bytes } of files) {
    let dich = ten;
    for (let i = 2; fs.existsSync(path.join(dir, dich)); i++) dich = path.basename(ten, path.extname(ten)) + " (" + i + ")" + path.extname(ten);
    fs.writeFileSync(path.join(dir, dich), bytes, { flag: "wx" });
    da.push(dich);
  }
  return da;
}

// Dòng giao việc kèm theo ý tưởng: ngắn, vì mô tả ý tưởng (ctl/ideas.js) tối đa 2400 ký tự.
const loiDinhKem = (ds) => ds.length ? "\n\nTÀI LIỆU CEO ĐÍNH KÈM (" + ds.length + " tệp, đọc hết trước khi làm; chỉ có trên máy, không commit): " +
  ds.map((t) => DINH_KEM.thuMuc + "/" + t).join(", ").slice(0, 600) : "";

function createDuAnMoi({ github, ideas, boKiem, dir = null, audit = { log() {} }, goiYAi = goiYClaude, cho = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now }) {
  const ops = new Map();
  // Repo văn phòng đã tạo (lưu xuống đĩa để còn sau khi ctl khởi động lại): bước sau lỗi thì duyệt lại cùng tên sẽ làm tiếp
  // từ bước tải về, không báo "tên đã có". Chỉ làm tiếp repo do chính văn phòng tạo trong 7 ngày, không đụng repo cũ của anh.
  const daTaoFile = dir ? path.join(dir, "du-an-moi.json") : null;
  let daTaoMem = [];
  const daTao = () => { if (!daTaoFile) return daTaoMem; try { const d = JSON.parse(fs.readFileSync(daTaoFile, "utf8")); return Array.isArray(d.daTao) ? d.daTao : []; } catch { return []; } };
  const ghiDaTao = (list) => { const keep = list.filter((x) => now() - Date.parse(x.luc) < 7 * 86400000).slice(-50); if (daTaoFile) writeAtomic(daTaoFile, JSON.stringify({ daTao: keep }, null, 2)); else daTaoMem = keep; };
  const timDaTao = (ten) => daTao().find((x) => x.ten === ten && now() - Date.parse(x.luc) < 7 * 86400000) || null;

  // Một lượt gợi ý tại một thời điểm (mỗi lượt chạy một tiến trình Claude): cùng ý tưởng thì dùng chung, ý tưởng khác thì báo bận.
  let goiYDang = null;
  function goiY(yTuong) {
    yTuong = String(yTuong || "").trim();
    if (goiYDang) { if (goiYDang.yTuong === yTuong) return goiYDang.p; throw err("AI_BUSY", "Đang gợi ý tên cho một ý tưởng khác: chờ xong (tối đa 1 phút) rồi thử lại."); }
    const p = goiYMot(yTuong).finally(() => { goiYDang = null; });
    goiYDang = { yTuong, p };
    return p;
  }
  async function goiYMot(yTuong) {
    if (yTuong.length < 10 || yTuong.length > 2000) throw err("BAD_REQUEST", "Ý tưởng dài 10–2000 ký tự: viết vài câu sản phẩm làm gì, cho ai.");
    let ds = [], nguon = "ai", ghiChu = "";
    try {
      for (const x of await goiYAi(yTuong)) {   // chuẩn hoá mọi tên AI trả về, bỏ tên hỏng và tên trùng
        const ten = chuanTen(x && x.ten);
        if (ten && !ds.some((d) => d.ten === ten) && ds.length < 3) ds.push({ ten, moTa: String((x && x.moTa) || "").slice(0, 200) });
      }
    } catch (e) { ghiChu = e.message; }
    if (ds.length < 3) { nguon = ds.length ? "ai" : "quy-tac"; for (const g of goiYQuyTac(yTuong)) if (ds.length < 3 && !ds.some((x) => x.ten === g.ten)) ds.push(g); }
    let login = null;
    try { login = await github.login(); } catch (e) { ghiChu = (ghiChu ? ghiChu + "; " : "") + e.message; }
    const goi = await Promise.all(ds.map(async (g) => {
      let conTrong = null;
      if (login) { try { conTrong = !(await github.exists(login + "/" + g.ten)); } catch {} }
      return { ...g, conTrong };
    }));
    return { login, goiY: goi, nguon, ghiChu };
  }

  const BUOC = [["repo", "Tạo repo riêng tư trên GitHub"], ["tai-ve", "Tải về máy và mở làm dự án (agent.md)"], ["dinh-kem", "Lưu tài liệu đính kèm vào dự án (chỉ trên máy)"],["khung-phim", "Đặt khuôn hồ sơ phim (phim.json, kịch bản)"], ["y-tuong", "Lưu ý tưởng vào dự án"],
    ["bo-kiem", "Cài bộ kiểm chu trình CI (mở nhánh, chờ anh merge)"], ["hinata", "Giao Hinata viết đặc tả (bước 1 của chu trình)"]];

  // Quy trình khởi động sau khi CEO bấm duyệt. Trả ngay phiên làm việc; giao diện hỏi lại GET /du-an-moi/:id.
  function tao({ ten, moTa = "", yTuong = "", rieng = true, caiBoKiem = true, giaoHinata = true, loai = "phan-mem", dinhKem = null } = {}, actor = "ceo") {
    const t = chuanTen(ten);
    if (!t || t !== String(ten).trim()) throw err("BAD_REQUEST", "Tên repo chỉ gồm chữ thường không dấu, số và gạch ngang, 3–40 ký tự.");
    if (!LOAI.includes(loai)) throw err("BAD_REQUEST", "Loại dự án phải là " + LOAI.join(" hoặc ") + ".");
    yTuong = String(yTuong || "").trim();
    if (yTuong.length < 10 || yTuong.length > 2000) throw err("BAD_REQUEST", "Ý tưởng dài 10–2000 ký tự.");
    const tep = kiemDinhKem(dinhKem);   // kiểm trước khi tạo repo: tệp sai thì không tạo gì
    if ([...ops.values()].some((o) => o.trangThai === "dang")) throw err("AI_BUSY", "Đang tạo một dự án khác. Chờ xong rồi tạo tiếp.");
    if (ops.size >= 20) ops.delete(ops.keys().next().value);
    const op = { id: "da-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex"), ten: t, loai, rieng: rieng !== false, trangThai: "dang", batDau: new Date().toISOString(),
      buoc: BUOC.filter(([id]) => (id !== "khung-phim" || loai === "phim") && (id !== "dinh-kem" || tep.length))   // chỉ hiện bước khuôn phim / đính kèm khi có
        .map(([id, ten]) => ({ id, ten, trangThai: (id === "bo-kiem" && !caiBoKiem) || (id === "hinata" && !giaoHinata) ? "bo-qua" : "cho", ghiChu: "" })) };
    ops.set(op.id, op);
    audit.log(actor, "du_an_moi.duyet", t, { loai, rieng: op.rieng, caiBoKiem, giaoHinata, dinhKem: tep.length }, "approved");
    chay(op, { moTa: String(moTa || "").slice(0, 350), yTuong, tep }).catch(() => {});
    return view(op);
  }

  async function chay(op, { moTa, yTuong, tep = [] }) {
    const b = (id) => op.buoc.find((x) => x.id === id);
    const lam = async (id, fn) => {
      const s = b(id);
      if (!s || s.trangThai === "bo-qua") return null;
      s.trangThai = "dang";
      try { const r = await fn(s); s.trangThai = "xong"; return r; }
      catch (e) { s.trangThai = "loi"; s.ghiChu = String(e.message).slice(0, 300); throw e; }
    };
    try {
      const repo = await lam("repo", async (s) => {
        // Văn phòng đã tạo repo này ở lần duyệt trước (bước sau bị lỗi): làm tiếp, không tạo lại.
        const cu = timDaTao(op.ten);
        if (cu) { op.fullName = cu.fullName; op.url = "https://github.com/" + cu.fullName; s.ghiChu = op.url + " · đã tạo ở lần trước, làm tiếp"; return { fullName: cu.fullName }; }
        let r;
        try { r = await github.createRepo({ name: op.ten, description: moTa, isPrivate: op.rieng }); }
        catch (e) {
          // Mất mạng / quá giờ có thể xảy ra SAU khi GitHub đã tạo repo: kiểm lại, có thì coi như đã tạo.
          if (e.code !== "GITHUB_OFFLINE") throw e;
          let login = null; try { login = await github.login(); } catch {}
          if (!login || !(await github.exists(login + "/" + op.ten).catch(() => false))) throw e;
          r = { fullName: login + "/" + op.ten, url: "https://github.com/" + login + "/" + op.ten };
        }
        ghiDaTao([...daTao().filter((x) => x.ten !== op.ten), { ten: op.ten, fullName: r.fullName, luc: new Date(now()).toISOString() }]);
        op.fullName = r.fullName; op.url = r.url || "https://github.com/" + r.fullName; s.ghiChu = op.url;
        return r;
      });
      const root = await lam("tai-ve", async (s) => {
        // Đang mở repo khác thì chờ; GitHub vừa tạo repo đôi khi chưa thấy ngay (404) thì thử lại vài lần.
        let o = null;
        for (let lan = 0; lan < 6; lan++) {
          try { o = github.open(repo.fullName); }
          catch (e) { if (e.code === "AI_BUSY" && lan < 5) { await cho(5000); continue; } throw e; }
          for (let i = 0; i < 1200 && o.status === "running"; i++) { await cho(500); o = github.get(o.id); }
          if (o.status === "done" || o.code !== "NOT_FOUND" || lan === 5) break;
          await cho(3000);
        }
        if (!o || o.status !== "done") throw err("GITHUB_CLONE", (o && o.message) || "Không tải được repo về máy.");
        s.ghiChu = o.workspace + (o.agentMdCreated ? " · đã tạo agent.md theo mẫu" : "");
        op.workspace = o.workspace;
        return o.workspace;
      });
      const phim = op.loai === "phim";
      const datKhung = (git) => {
        const s = b("khung-phim");
        s.trangThai = "dang";
        try {
          const { da, giu, commit } = luuKhungPhim(root, op.ten, git);
          s.ghiChu = da.length ? "Đã đặt: " + da.join(", ") : "Repo đã có đủ khuôn";
          if (commit) s.ghiChu += " · " + git.branch + " · " + commit;
          if (giu.length) s.ghiChu += " · Giữ trên máy: " + giu.join(", ");
          s.trangThai = "xong";
        } catch (e) {
          s.trangThai = "loi";
          s.ghiChu = String(e.message).slice(0, 300);
          throw e;
        }
      };
      if (phim && b("hinata").trangThai === "bo-qua") {
        await lam("khung-phim", () => datKhung(nhanh.prepare(root, { task: "khung-phim-" + op.ten, id: op.id })));
      }
      const daLuu = (await lam("dinh-kem", (s) => { const da = luuDinhKem(root, tep); s.ghiChu = DINH_KEM.thuMuc + "/: " + da.join(", "); return da; })) || [];
      const ghiChuTep = loiDinhKem(daLuu);
      let detail = phim ? VIEC_PHIM + yTuong : yTuong;
      if (detail.length + ghiChuTep.length > 2400) detail = detail.slice(0, 2400 - ghiChuTep.length - 1) + "…";   // ideas.add nhận tối đa 2400 ký tự
      const idea = await lam("y-tuong", async () => ideas.add({ workspace: root, title: (phim ? "🎬 " : "") + op.ten + ": " + yTuong.split(/\r?\n/)[0].slice(0, 150),
        detail: detail + ghiChuTep }));
      try {
        await lam("bo-kiem", async (s) => { const r = boKiem.install(root, "ceo"); s.ghiChu = r && r.last && r.last.compareUrl ? "Mở PR: " + r.last.compareUrl : "Đã đẩy nhánh bộ kiểm"; });
      } catch { /* thiếu bộ kiểm không chặn việc giao Hinata: ghi lỗi ở bước, làm tiếp */ }
      // Repo vừa tạo: agent.md mẫu đặt lượt đầu cho Claude; anh đã duyệt tạo dự án kèm "giao Hinata" nên ghi đè lượt sang Hinata.
      await lam("hinata", (s) => {
        const r = ideas.start(idea.id, phim ? { force: true, prepare: datKhung } : { force: true });
        s.ghiChu = r.runId ? "Luồng " + r.runId : "";
      });
      op.trangThai = op.buoc.some((x) => x.trangThai === "loi") ? "xong-mot-phan" : "xong";
    } catch { op.trangThai = "loi"; }
    op.xongLuc = new Date().toISOString();
    audit.log("ctl", "du_an_moi.ket_qua", op.ten, { trangThai: op.trangThai, buoc: op.buoc.map((x) => x.id + ":" + x.trangThai) });
  }

  const view = (op) => JSON.parse(JSON.stringify(op));
  function get(id) { const op = ops.get(id); if (!op) throw err("NOT_FOUND", "Không có phiên tạo dự án " + id); return view(op); }
  return { goiY, tao, get };
}

module.exports = { createDuAnMoi, slug, chuanTen, goiYQuyTac, goiYClaude, datKhungPhim, kiemDinhKem, luuDinhKem, DINH_KEM, DINH_KEM_BODY, LOAI };
