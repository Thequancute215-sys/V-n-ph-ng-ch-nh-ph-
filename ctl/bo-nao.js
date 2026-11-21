// Bộ não của văn phòng nằm trong sổ ctl, có lịch sử Git riêng.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { maskSecrets } = require("../lib/mask");
const { writeAtomic, renameRetry } = require("../lib/ghi-file");

const THU_MUC = {
  "tri-nho": ["Trí nhớ", "Ghi lại quyết định và kinh nghiệm cần nhớ qua nhiều phiên."],
  wiki: ["Wiki", "Ghi cách làm, khái niệm và hướng dẫn dùng chung trong đội."],
  nguon: ["Nguồn", "Ghi nguồn tham khảo và xuất xứ của thông tin dùng trong bộ não."],
  "cong-su": ["Cộng sự", "Mô tả nhiệm vụ, phạm vi và ghi chú của CEO cho từng vai."],
};
const CONG_SU = {
  SPEC_ARCHITECT: ["Hinata (Antigravity)", "Đặc tả sản phẩm, luồng sử dụng và thiết kế giao diện.", "Không viết mã nguồn hoặc duyệt thay đội trưởng."],
  SOL_ARCHITECT_PLANNER: ["Sol (Codex)", "Lập kiến trúc, kế hoạch và hợp đồng API.", "Không triển khai mã hoặc thay đổi chốt chặn kiểm duyệt."],
  CODEX_ASTRA_DEV: ["Astra (Codex)", "Triển khai backend, API, dữ liệu và hạ tầng theo kế hoạch.", "Không viết giao diện hoặc đổi kiến trúc và kết quả duyệt."],
  FRONTEND_UIUX_DEV: ["Kakashi (Antigravity)", "Triển khai giao diện và kết nối API theo hợp đồng.", "Không sửa backend hoặc thay đổi đặc tả thiết kế."],
  CLAUDE_AUDITOR: ["Claude (đội trưởng)", "Duyệt kiến trúc và kết quả, quản lý chốt chặn và điều phối đội.", "Không tự phát hành khi chưa có yêu cầu của CEO."],
  SOL_ARCHITECT_ADVISOR: ["Sol (Codex)", "Đối chiếu mã nguồn với kế hoạch, đặc tả và hợp đồng API.", "Không sửa mã hoặc tự đóng chốt chặn."],
};
const MAU = [
  ...Object.entries(THU_MUC).map(([tm, [ten, moTa]]) => [tm + "/README.md", `# ${ten}\n\n${moTa}\n`]),
  ...Object.entries(CONG_SU).map(([vai, [ten, viec, ranhGioi]]) => ["cong-su/" + vai + ".md",
    `# ${ten}\n\n## Vai\n\n${vai}\n\n## Việc chính\n\n${viec}\n\n## Ranh giới\n\n${ranhGioi}\n\n## Ghi chú CEO\n`]),
];
const MAX_BYTES = 512 * 1024;
const FILE_RONG = process.platform === "win32" ? "NUL" : "/dev/null";
const GIT_CONFIG = [
  "-c", "user.name=Văn phòng AI", "-c", "user.email=vp@local", "-c", "core.autocrlf=false",
  "-c", "commit.gpgsign=false", "-c", "core.hooksPath=.git/vp-no-hooks", "-c", "core.fsmonitor=false",
  "-c", "core.attributesFile=" + FILE_RONG,
];
const err = (code, message) => Object.assign(new Error(message), { code });
const bam = (data) => createHash("sha1").update(data).digest("hex");
const tenHopLe = (ten) => !ten.startsWith(".") && !ten.endsWith(".") && !ten.includes("..") &&
  /^[A-Za-z0-9đĐ_.\-\u0300\u0301\u0302\u0303\u0306\u0309\u031b\u0323]+$/u.test(ten.normalize("NFD")) &&
  !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(ten);
function kiemDuongDan(p, thuMuc = false) {
  if (typeof p !== "string") throw err("BAD_REQUEST", "Cần đường dẫn Markdown trong bộ não.");
  const cap = p.split("/");
  if (cap.length > 4 || !Object.hasOwn(THU_MUC, cap[0]) || !cap.every(tenHopLe) ||
      (!thuMuc && (cap.length < 2 || !/\.md$/i.test(cap.at(-1))))) {
    throw err("BAD_REQUEST", "Đường dẫn bộ não không hợp lệ.");
  }
  return cap;
}

function statNeuCo(file) {
  try { return fs.lstatSync(file); }
  catch (e) { if (e.code !== "ENOENT") throw e; return null; }
}
function trong(root, file) {
  const rel = path.relative(root, fs.realpathSync(file));
  return rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}
function ghiAnToan(file, data) {
  // Dùng thư mục tạm riêng để tên .tmp của writeAtomic không trùng file đã có.
  const tam = fs.mkdtempSync(path.join(path.dirname(file), ".vp-ghi-"));
  const ban = path.join(tam, "ban");
  try { writeAtomic(ban, data); renameRetry(ban, file); }
  finally {
    for (const p of [ban, ban + ".tmp"]) if (statNeuCo(p)) fs.unlinkSync(p);
    fs.rmdirSync(tam);
  }
}

function createBoNao({ dir, audit, now = Date.now }) {
  let root;
  let daKhoiTao = false;

  function git(args, { cwd = root, rieng = true, ngay = false, chapNhan = [], input } = {}) {
    // Kho riêng chỉ dùng cấu hình cần thiết cho việc lưu nội dung tại chỗ.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: FILE_RONG, GIT_ATTR_NOSYSTEM: "1" });
    if (ngay) env.GIT_AUTHOR_DATE = env.GIT_COMMITTER_DATE = new Date(now()).toISOString();
    try {
      return execFileSync("git", [
        ...GIT_CONFIG, "--literal-pathspecs", ...(rieng ? ["--git-dir=.git", "--work-tree=."] : []), ...args,
      ], { cwd, env, windowsHide: true, timeout: 15000, encoding: "utf8", input,
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
    } catch (e) {
      if (e.code === "ENOENT") throw err("NO_GIT", "Máy chưa có Git để lưu lịch sử bộ não.");
      if (chapNhan.includes(e.status)) return null;
      throw err("CONFLICT", "Git không thực hiện được thao tác bộ não: " + maskSecrets(String(e.stderr || e.message)).trim().slice(0, 1200));
    }
  }

  function kiemRepo() {
    if (!statNeuCo(root)?.isDirectory() || !trong(path.dirname(root), root) ||
        !statNeuCo(path.join(root, ".git"))?.isDirectory() || !trong(root, path.join(root, ".git"))) {
      throw err("BAD_REQUEST", "Thư mục bộ não hoặc kho Git không hợp lệ.");
    }
  }

  function resolve(p, { taoCha = false, thuMuc = false } = {}) {
    const cap = kiemDuongDan(p, thuMuc);
    let file = root;
    let stat = null;
    for (const [i, ten] of cap.entries()) {
      file = path.join(file, ten);
      const laThuMuc = thuMuc || i < cap.length - 1;
      stat = statNeuCo(file);
      if (!stat && laThuMuc && taoCha) {
        fs.mkdirSync(file);
        stat = fs.lstatSync(file);
      }
      if (!stat) return { file: path.join(root, ...cap), stat: null };
      if (stat.isSymbolicLink() || !trong(root, file) ||
          (laThuMuc ? !stat.isDirectory() : !stat.isFile() || stat.nlink > 1)) {
        throw err("BAD_REQUEST", "Đường dẫn bộ não đi qua liên kết hoặc sai loại file.");
      }
    }
    return { file, stat };
  }

  function khoiTao() {
    if (daKhoiTao) { kiemRepo(); return; }
    fs.mkdirSync(dir, { recursive: true });
    const thuMucDuLieu = fs.realpathSync(dir);
    root = path.join(thuMucDuLieu, "bo-nao");
    git(["--version"], { cwd: thuMucDuLieu, rieng: false });
    if (!statNeuCo(root)) fs.mkdirSync(root);
    if (!statNeuCo(root)?.isDirectory() || !trong(thuMucDuLieu, root)) {
      throw err("BAD_REQUEST", "Thư mục bộ não không hợp lệ.");
    }
    if (!statNeuCo(path.join(root, ".git"))) git(["init", "--template="], { rieng: false });
    kiemRepo();
    if (git(["rev-parse", "--verify", "HEAD"], { chapNhan: [128] }) === null) {
      for (const [p, noiDung] of MAU) {
        const { file, stat } = resolve(p, { taoCha: true });
        if (!stat) fs.writeFileSync(file, noiDung, { flag: "wx", mode: 0o600 });
        else if (fs.readFileSync(file, "utf8") !== noiDung) throw err("CONFLICT", "File khởi tạo đã có nội dung riêng: " + p);
      }
      const paths = MAU.map(([p]) => p);
      git(["add", "--", ...paths]);
      git(["commit", "--only", "-m", "bo-nao: khởi tạo", "--", ...paths], { ngay: true });
    }
    daKhoiTao = true;
  }

  function cay() {
    khoiTao();
    const ds = [];
    function them(p, thuMuc) {
      let muc;
      try { muc = resolve(p, { thuMuc }); }
      catch (e) { if (e.code === "BAD_REQUEST") return; throw e; }
      if (!muc.stat) return;
      ds.push({ p, thuMuc, kichThuoc: muc.stat.size, suaLuc: muc.stat.mtime.toISOString() });
      if (thuMuc && p.split("/").length < 4) {
        for (const con of fs.readdirSync(muc.file, { withFileTypes: true })) {
          if (con.isDirectory() || con.isFile()) them(p + "/" + con.name, con.isDirectory());
        }
      }
    }
    for (const tm of Object.keys(THU_MUC)) them(tm, true);
    return ds;
  }

  function doc(p) {
    kiemDuongDan(p);
    khoiTao();
    const { file, stat } = resolve(p);
    if (!stat) throw err("NOT_FOUND", "Không có file bộ não: " + p);
    if (stat.size > MAX_BYTES) throw err("TOO_LARGE", "File bộ não vượt 512 KB.");
    const data = fs.readFileSync(file);
    return { p, noiDung: data.toString("utf8"), ma: bam(data) };
  }

  function tieuDe(lyDo, macDinh) {
    if (lyDo !== undefined && typeof lyDo !== "string") throw err("BAD_REQUEST", "Lý do phải là văn bản.");
    if (lyDo && maskSecrets(lyDo) !== lyDo) throw err("SECRET", "Lý do có chuỗi giống khóa.");
    return "bo-nao: " + (lyDo?.trim().replace(/\s+/g, " ") || macDinh);
  }

  function thayDoi(p, maTruoc, suaFile) {
    const head = git(["rev-parse", "HEAD"]).trim();
    const staged = git(["diff", "--cached", "--quiet", "--", p], { chapNhan: [1] });
    if (staged === null) throw err("CONFLICT", "File đã được đưa vào vùng chờ commit: " + p);
    if (statNeuCo(path.join(root, ".git", "REVERT_HEAD")) || statNeuCo(path.join(root, ".git", "sequencer"))) {
      throw err("CONFLICT", "Kho Git đang có thao tác hoàn tác chưa kết thúc.");
    }
    const { file, stat } = resolve(p);
    const cu = stat ? fs.readFileSync(file) : null;
    if ((cu ? bam(cu) : null) !== maTruoc) throw err("CONFLICT", "File đã thay đổi, hãy đọc lại trước khi lưu.");
    try {
      suaFile();
      return git(["rev-parse", "HEAD"]).trim().slice(0, 7);
    } catch (e) {
      // Nếu commit chưa thành công, giữ nguyên phiên bản CEO đang có trước thao tác.
      if (git(["rev-parse", "HEAD"]).trim() === head) {
        git(["restore", "--staged", "--", p], { chapNhan: [1] });
        if (cu) ghiAnToan(file, cu);
        else if (statNeuCo(file)) fs.unlinkSync(file);
      }
      throw e;
    }
  }

  function ghi({ p, noiDung, goc, lyDo } = {}, actor = "ceo") {
    kiemDuongDan(p);
    if (typeof noiDung !== "string") throw err("BAD_REQUEST", "Nội dung phải là văn bản.");
    if (Buffer.byteLength(noiDung) > MAX_BYTES) throw err("TOO_LARGE", "Nội dung vượt 512 KB.");
    if (maskSecrets(noiDung) !== noiDung) throw err("SECRET", "Nội dung có chuỗi giống khóa.");
    const message = tieuDe(lyDo, "sửa " + p);
    khoiTao();
    const { stat } = resolve(p);
    const cu = stat ? doc(p) : null;
    if (cu && goc !== cu.ma) throw err("CONFLICT", "File đã thay đổi, hãy đọc lại trước khi lưu.");
    const ma = bam(noiDung);
    let commit = null;
    if (cu?.ma !== ma) {
      const { file } = resolve(p, { taoCha: true });
      commit = thayDoi(p, cu?.ma ?? null, () => {
        ghiAnToan(file, noiDung);
        git(["add", "--", p]);
        git(["commit", "--only", "-F", "-", "--", p], { ngay: true, input: message });
      });
    }
    audit?.log(actor, "bo_nao.ghi", p);
    return { p, ma, commit };
  }

  function xoa({ p, goc, lyDo } = {}, actor = "ceo") {
    kiemDuongDan(p);
    if (/^[^/]+\/README\.md$/i.test(p)) throw err("BAD_REQUEST", "Không xóa README của thư mục gốc.");
    const message = tieuDe(lyDo, "xóa " + p);
    if (goc !== doc(p).ma) throw err("CONFLICT", "File đã thay đổi, hãy đọc lại trước khi xóa.");
    const commit = thayDoi(p, goc, () => {
      git(["rm", "-f", "--", p]);
      git(["commit", "--only", "-F", "-", "--", p], { ngay: true, input: message });
    });
    audit?.log(actor, "bo_nao.xoa", p);
    return { p, commit };
  }

  function lichSu(p) {
    if (p != null) kiemDuongDan(p);
    khoiTao();
    const log = git(["log", "-30", "--format=%x1e%H%x00%cI%x00%s", "--name-only", "--no-renames", "-z", "--", ...(p ? [p] : [])]);
    return log.split("\x1e").filter(Boolean).map((muc) => {
      const [hash, luc, thongDiep, ...files] = muc.split("\0");
      return { commit: hash.slice(0, 7), luc: new Date(luc).toISOString(), thongDiep, file: files.flatMap((f) => {
        const rel = f.replace(/^\n/, "");
        try { kiemDuongDan(rel); return [rel]; } catch { return []; }
      }) };
    });
  }

  function maCommit(commit) {
    if (typeof commit !== "string" || !/^[0-9a-f]{7,40}$/.test(commit)) throw err("BAD_REQUEST", "Mã commit không hợp lệ.");
    khoiTao();
    const hash = git(["rev-parse", "--verify", commit + "^{commit}"], { chapNhan: [128] })?.trim();
    if (!hash || git(["merge-base", "--is-ancestor", hash, "HEAD"], { chapNhan: [1] }) === null) {
      throw err("NOT_FOUND", "Không có commit trong lịch sử bộ não.");
    }
    return hash;
  }

  function ban(p, commit) {
    kiemDuongDan(p);
    const hash = maCommit(commit);
    const blob = hash + ":" + p;
    if (git(["cat-file", "-t", blob], { chapNhan: [128] })?.trim() !== "blob") {
      throw err("NOT_FOUND", "File không có ở commit này.");
    }
    if (Number(git(["cat-file", "-s", blob])) > MAX_BYTES) throw err("TOO_LARGE", "File bộ não vượt 512 KB.");
    return { p, noiDung: git(["cat-file", "blob", blob]), commit: hash.slice(0, 7) };
  }

  function hoanTac(commit, actor = "ceo") {
    const hash = maCommit(commit);
    if (git(["rev-parse", "--verify", hash + "^"], { chapNhan: [128] }) === null) {
      throw err("BAD_REQUEST", "Không hoàn tác commit khởi tạo bộ não.");
    }
    const gitDir = path.join(root, ".git");
    const dangHoanTac = () => statNeuCo(path.join(gitDir, "REVERT_HEAD")) || statNeuCo(path.join(gitDir, "sequencer"));
    if (dangHoanTac() || git(["status", "--porcelain", "--untracked-files=no"]).trim()) {
      throw err("CONFLICT", "Bộ não có thay đổi chưa lưu hoặc thao tác Git đang dở.");
    }
    try { git(["revert", "--no-edit", hash], { ngay: true }); }
    catch (e) { if (dangHoanTac()) git(["revert", "--abort"]); throw e; }
    const moi = git(["rev-parse", "HEAD"]).trim().slice(0, 7);
    audit?.log(actor, "bo_nao.hoan_tac", commit, { commit: moi });
    return { commit: moi };
  }

  return { cay, doc, ghi, xoa, lichSu, ban, hoanTac };
}

module.exports = { createBoNao };
