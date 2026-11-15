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
const { cleanEnv } = require("../lib/mask");

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

function createDuAnMoi({ github, ideas, boKiem, audit = { log() {} }, goiYAi = goiYClaude, cho = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const ops = new Map();

  async function goiY(yTuong) {
    yTuong = String(yTuong || "").trim();
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

  const BUOC = [["repo", "Tạo repo riêng tư trên GitHub"], ["tai-ve", "Tải về máy và mở làm dự án (agent.md)"], ["y-tuong", "Lưu ý tưởng vào dự án"],
    ["bo-kiem", "Cài bộ kiểm chu trình CI (mở nhánh, chờ anh merge)"], ["hinata", "Giao Hinata viết đặc tả (bước 1 của chu trình)"]];

  // Quy trình khởi động sau khi CEO bấm duyệt. Trả ngay phiên làm việc; giao diện hỏi lại GET /du-an-moi/:id.
  function tao({ ten, moTa = "", yTuong = "", rieng = true, caiBoKiem = true, giaoHinata = true } = {}, actor = "ceo") {
    const t = chuanTen(ten);
    if (!t || t !== String(ten).trim()) throw err("BAD_REQUEST", "Tên repo chỉ gồm chữ thường không dấu, số và gạch ngang, 3–40 ký tự.");
    yTuong = String(yTuong || "").trim();
    if (yTuong.length < 10 || yTuong.length > 2000) throw err("BAD_REQUEST", "Ý tưởng dài 10–2000 ký tự.");
    if ([...ops.values()].some((o) => o.trangThai === "dang")) throw err("AI_BUSY", "Đang tạo một dự án khác. Chờ xong rồi tạo tiếp.");
    if (ops.size >= 20) ops.delete(ops.keys().next().value);
    const op = { id: "da-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex"), ten: t, rieng: rieng !== false, trangThai: "dang", batDau: new Date().toISOString(),
      buoc: BUOC.map(([id, ten]) => ({ id, ten, trangThai: (id === "bo-kiem" && !caiBoKiem) || (id === "hinata" && !giaoHinata) ? "bo-qua" : "cho", ghiChu: "" })) };
    ops.set(op.id, op);
    audit.log(actor, "du_an_moi.duyet", t, { rieng: op.rieng, caiBoKiem, giaoHinata }, "approved");
    chay(op, { moTa: String(moTa || "").slice(0, 350), yTuong }).catch(() => {});
    return view(op);
  }

  async function chay(op, { moTa, yTuong }) {
    const b = (id) => op.buoc.find((x) => x.id === id);
    const lam = async (id, fn) => {
      const s = b(id);
      if (s.trangThai === "bo-qua") return null;
      s.trangThai = "dang";
      try { const r = await fn(s); s.trangThai = "xong"; return r; }
      catch (e) { s.trangThai = "loi"; s.ghiChu = String(e.message).slice(0, 300); throw e; }
    };
    try {
      const repo = await lam("repo", async (s) => { const r = await github.createRepo({ name: op.ten, description: moTa, isPrivate: op.rieng }); op.fullName = r.fullName; op.url = r.url; s.ghiChu = r.url; return r; });
      const root = await lam("tai-ve", async (s) => {
        let o = github.open(repo.fullName);
        for (let i = 0; i < 1200 && o.status === "running"; i++) { await cho(500); o = github.get(o.id); }
        if (o.status !== "done") throw err("GITHUB_CLONE", o.message || "Không tải được repo về máy.");
        s.ghiChu = o.workspace + (o.agentMdCreated ? " · đã tạo agent.md theo mẫu" : "");
        op.workspace = o.workspace;
        return o.workspace;
      });
      const idea = await lam("y-tuong", async () => ideas.add({ workspace: root, title: op.ten + ": " + yTuong.split(/\r?\n/)[0].slice(0, 150), detail: yTuong }));
      try {
        await lam("bo-kiem", async (s) => { const r = boKiem.install(root, "ceo"); s.ghiChu = r && r.last && r.last.compareUrl ? "Mở PR: " + r.last.compareUrl : "Đã đẩy nhánh bộ kiểm"; });
      } catch { /* thiếu bộ kiểm không chặn việc giao Hinata: ghi lỗi ở bước, làm tiếp */ }
      // Repo vừa tạo: agent.md mẫu đặt lượt đầu cho Claude; anh đã duyệt tạo dự án kèm "giao Hinata" nên ghi đè lượt sang Hinata.
      await lam("hinata", async (s) => { const r = ideas.start(idea.id, { force: true }); s.ghiChu = r.runId ? "Luồng " + r.runId : ""; });
      op.trangThai = op.buoc.some((x) => x.trangThai === "loi") ? "xong-mot-phan" : "xong";
    } catch { op.trangThai = "loi"; }
    op.xongLuc = new Date().toISOString();
    audit.log("ctl", "du_an_moi.ket_qua", op.ten, { trangThai: op.trangThai, buoc: op.buoc.map((x) => x.id + ":" + x.trangThai) });
  }

  const view = (op) => JSON.parse(JSON.stringify(op));
  function get(id) { const op = ops.get(id); if (!op) throw err("NOT_FOUND", "Không có phiên tạo dự án " + id); return view(op); }
  return { goiY, tao, get };
}

module.exports = { createDuAnMoi, slug, chuanTen, goiYQuyTac, goiYClaude };
