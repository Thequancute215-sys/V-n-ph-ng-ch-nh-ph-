// Chạy song song Astra (backend) và Kakashi (frontend) — CEO duyệt 16/11/2026, bước 2 của quy trình "hợp đồng trước, code sau".
// Chỉ mở khi hợp đồng giao tiếp đã chốt (contract/api.json đúng cấu trúc, khai đủ thư mục backend và frontend trong x-thu-muc).
// Rào chắn để hai AI không giẫm lên nhau:
//   - mỗi bên làm trong một git worktree riêng (HEAD tách rời, tách từ cùng một mốc), không chung thư mục, không chung index;
//   - mỗi bên chỉ được sửa thư mục của mình theo x-thu-muc, không tự xoá file đang theo dõi, không ghi agent.md
//     (văn phòng ghi [4.1] và khoá lượt thay, sau khi gộp);
//   - hợp đồng phải khớp phần của bên đó (ctl/runner.js kiểm sau lượt). Sai thì bên đó bị trả lại sửa một lần.
// Cả hai đạt thì văn phòng commit phần của từng bên trong worktree, gộp lần lượt vào nhánh của luồng (thư mục làm việc khác
// nhau nên không xung đột; có xung đột thì huỷ gộp và báo CEO), rồi ghi agent.md bằng hai commit đúng giao thức:
// "CODEX_ASTRA_DEV -> NEXT: FRONTEND_UIUX_DEV" và "FRONTEND_UIUX_DEV -> NEXT: SOL_ARCHITECT_ADVISOR".
// Không tạo nhánh (worktree tách rời HEAD), không push, không xoá nhánh. Worktree tạm được gỡ sau khi gộp xong hoặc khi bỏ.
"use strict";
const fs = require("fs");
const path = require("path");
const nhanh = require("./nhanh");
const { readTurn, setTurn } = require("./handoff");
const kiemHopDong = require("../lib/kiem-hop-dong");
const kiemAgent = require("../lib/kiem-agent");
const { looksLikeKey } = require("../lib/mask");

const err = (code, message) => Object.assign(new Error(message), { code });
const VAI = { CODEX_ASTRA_DEV: "backend", FRONTEND_UIUX_DEV: "frontend" };
const tryGit = (root, args, opts) => { try { return nhanh.git(root, args, opts).trim(); } catch { return null; } };
const chuan = (d) => String(d).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
const trongThuMuc = (f, dirs) => dirs.some((d) => { const n = chuan(d); return !n || n === "." || f === n || f.startsWith(n + "/"); });

// Có chạy song song được không. Trả { ok, why } hoặc { ok: true, thuMuc: { backend, frontend } }.
function dieuKien(root) {
  if (!nhanh.isRepo(root)) return { ok: false, why: "dự án không phải repo git" };
  if (nhanh.agentMdLocal(root)) return { ok: false, why: "agent.md chỉ giữ trên máy (repo công khai): worktree không có sổ" };
  let r;
  try { r = kiemHopDong.kiemRepo(root); } catch (e) { return { ok: false, why: "không đọc được hợp đồng: " + e.message }; }
  if (!r.coHopDong) return { ok: false, why: "chưa có hợp đồng contract/api.json" };
  const cauTruc = r.loi.filter((l) => !/^(Backend|Frontend) /.test(l));
  if (cauTruc.length) return { ok: false, why: "hợp đồng chưa đạt: " + cauTruc[0] };
  const tm = (r.doc && r.doc["x-thu-muc"]) || {};
  const be = Array.isArray(tm.backend) ? tm.backend.filter((d) => chuan(d) && chuan(d) !== ".") : [];
  const fe = Array.isArray(tm.frontend) ? tm.frontend.filter((d) => chuan(d) && chuan(d) !== ".") : [];
  if (!be.length || !fe.length) return { ok: false, why: "hợp đồng chưa khai đủ thư mục backend và frontend (x-thu-muc)" };
  if (be.some((b) => fe.some((f) => trongThuMuc(chuan(f), [b]) || trongThuMuc(chuan(b), [f])))) return { ok: false, why: "thư mục backend và frontend chồng nhau: không tách được phần của từng bên" };
  if (nhanh.dirty(root).length) return { ok: false, why: "repo đang có thay đổi chưa commit" };
  // Claude trả blocker về Astra (sửa lỗi): sửa lần lượt, không mở lại song song (Kakashi không phải làm lại phần không lỗi).
  try { if (kiemAgent.parse(fs.readFileSync(path.join(root, "agent.md"), "utf8")).open.length) return { ok: false, why: "còn blocker [ ] OPEN: sửa lỗi chạy lần lượt" }; } catch {}
  return { ok: true, thuMuc: { backend: be, frontend: fe } };
}

// Tạo hai worktree tách rời HEAD từ cùng mốc; bản của Kakashi ghi khoá lượt FRONTEND_UIUX_DEV (chỉ trong worktree, không commit)
// để bộ chạy lượt nhận đúng vai.
function tao(root, { id, dir }) {
  const base = nhanh.head(root);
  if (!base) throw err("NO_COMMIT", "Repo chưa có commit nào.");
  const goc = path.join(dir, "song-song", String(id).replace(/[^\w.-]/g, "_"));
  fs.mkdirSync(goc, { recursive: true });
  const wt = {};
  try {
    for (const [vai, ten] of [["CODEX_ASTRA_DEV", "be"], ["FRONTEND_UIUX_DEV", "fe"]]) {
      const p = path.join(goc, ten);
      if (fs.existsSync(p)) { tryGit(root, ["worktree", "remove", "--force", p]); fs.rmSync(p, { recursive: true, force: true }); }
      nhanh.git(root, ["worktree", "add", "--detach", "--force", p, base], { timeout: 120000 });
      wt[vai] = p;
    }
    const t = readTurn(wt.FRONTEND_UIUX_DEV);
    setTurn(wt.FRONTEND_UIUX_DEV, t.lastUpdatedBy || "CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV");
  } catch (e) { don(root, { wt }); throw e; }
  return { base, wt };
}

// Rào chắn sau lượt của một bên: file đổi ngoài thư mục của mình, file đang theo dõi bị xoá. agent.md không tính (văn phòng ghi lại).
function phamVi(wt, base, vai, thuMuc) {
  const dirs = thuMuc[VAI[vai]] || [];
  // --no-renames: đổi tên/di chuyển file tính là xoá + thêm, để không lách được rào chắn bằng git mv.
  const ds = (loc) => (tryGit(wt, ["diff", "--no-renames", "--name-only", "-z", ...(loc ? ["--diff-filter=" + loc] : []), base]) || "").split("\0").map(chuan).filter(Boolean);
  const xoa = new Set(ds("D"));
  const doi = new Set([...ds(null), ...nhanh.untracked(wt).map(chuan)]);
  const loi = [];
  for (const f of doi) if (f !== "agent.md" && !xoa.has(f) && !trongThuMuc(f, dirs)) loi.push(`song-song: ${vai} sửa ${f} ngoài phần của mình (${dirs.join(", ")}). File chung (package.json, lockfile, docs/…) thuộc bên nào thì Sol ghi trong x-thu-muc của bên đó; bên kia ghi yêu cầu vào giai_thich`);
  for (const f of xoa) if (f !== "agent.md") loi.push(`song-song: ${vai} tự xoá ${f} (chỉ Claude được xoá; ghi đề nghị vào de_nghi_xoa)`);
  return loi.slice(0, 20);
}

// Commit phần việc của từng bên trong worktree (trừ agent.md), gộp vào thư mục chính, rồi ghi agent.md hai commit đúng giao thức.
// handoffs: { CODEX_ASTRA_DEV: payload, FRONTEND_UIUX_DEV: payload } (dòng JSON bàn giao đã hợp lệ).
function gop(root, ss, { task = "", handoffs = {}, branch = null }) {
  const tieuDe = String(task).split(/\r?\n/)[0].slice(0, 60);
  if (branch && nhanh.branchOf(root) !== branch) throw err("NOT_ON_BRANCH", `Repo chính không còn đứng trên nhánh ${branch} của luồng: không gộp phần chạy song song vào nhánh khác`);
  const dau = {};
  for (const vai of ["CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV"]) {
    const wt = ss.wt[vai];
    tryGit(wt, ["checkout", ss.base, "--", "agent.md"]);   // sổ do văn phòng ghi sau khi gộp
    tryGit(wt, ["add", "-A", "--", ".", ":(exclude)agent.md"]);
    if (tryGit(wt, ["diff", "--cached", "--name-only"])) {
      if (looksLikeKey(tryGit(wt, ["diff", "--cached"]) || "")) throw err("SECRET", `Phần của ${vai} có chuỗi giống khóa API: chưa gộp, CEO kiểm tra worktree ${wt}`);
      nhanh.git(wt, ["commit", "--quiet", "--no-verify", "-m", `ai(${vai}, song song): ${tieuDe}`]);
    }
    dau[vai] = nhanh.head(wt);
  }
  const gopVao = [];
  for (const vai of ["CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV"]) {
    const c = dau[vai];
    if (!c || c === ss.base) continue;
    try {
      nhanh.git(root, ["merge", "--no-ff", "--no-commit", c], { timeout: 60000 });
      nhanh.git(root, ["commit", "--quiet", "--no-verify", "-m", `Gộp phần ${vai} (chạy song song): ${tieuDe}`]);
      gopVao.push(vai);
    } catch (e) {
      tryGit(root, ["merge", "--abort"]);
      throw err("MERGE_CONFLICT", `Gộp phần ${vai} bị xung đột git: đã huỷ gộp, worktree vẫn giữ ở ${ss.wt[vai]} để CEO xem`);
    }
  }
  // agent.md: hai lần chuyển lượt như khi chạy lần lượt (CI kiểm từng commit theo vai trong message)
  const dong = (vai) => {
    const h = handoffs[vai] || {};
    const files = (Array.isArray(h.files) ? h.files : []).slice(0, 6).join(", ") + (Array.isArray(h.files) && h.files.length > 6 ? `… (+${h.files.length - 6})` : "");
    const claim = Array.isArray(h.claim_fixed) && h.claim_fixed.length ? " | " + h.claim_fixed.slice(0, 6).join("; ") : "";
    return `- ${vai} (song song): ${files || "không đổi file"}${claim}`.slice(0, 400);
  };
  const ghi = (vai, next) => {
    const f = path.join(root, "agent.md");
    let txt = fs.readFileSync(f, "utf8");
    const nl = txt.includes("\r\n") ? "\r\n" : "\n";
    const m = /^###\s*\[4\.1\][^\n]*\n/m.exec(txt);
    if (m) {
      const tu = m.index + m[0].length, sau = txt.slice(tu).search(/^#{2,3}\s*\[/m);
      const het = sau < 0 ? txt.length : tu + sau;
      // Mỗi vai một dòng "(song song)": có rồi thì thay, chưa có thì thêm nếu [4.1] còn chỗ (tối đa 25 dòng không rỗng — Luật 2).
      const dongs = txt.slice(tu, het).replace(/\s+$/, "").split(/\r?\n/);
      const cu = dongs.findIndex((l) => l.startsWith(`- ${vai} (song song):`));
      if (cu >= 0) dongs[cu] = dong(vai);
      else if (dongs.filter((l) => l.trim()).length < 25) dongs.push(dong(vai));
      const khoi = dongs.join(nl).replace(/\s+$/, "");
      txt = txt.slice(0, tu) + (khoi ? khoi + nl : "") + nl + txt.slice(het);
    }
    fs.writeFileSync(f, txt);
    setTurn(root, vai, next);
    if (!nhanh.agentMdLocal(root)) nhanh.git(root, ["commit", "--quiet", "--no-verify", "-m", `chore(agent-sync): ${vai} -> NEXT: ${next} — chạy song song`, "--", "agent.md"]);
  };
  ghi("CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV");
  ghi("FRONTEND_UIUX_DEV", "SOL_ARCHITECT_ADVISOR");
  return { gopVao, dau };
}

// Gỡ worktree tạm (không xoá nhánh nào: worktree tách rời HEAD).
function don(root, ss) {
  for (const wt of Object.values((ss && ss.wt) || {})) { tryGit(root, ["worktree", "remove", "--force", wt]); try { fs.rmSync(wt, { recursive: true, force: true }); } catch {} }
  tryGit(root, ["worktree", "prune"]);
}

// Trước khi trả lại một bên: đưa agent.md trong worktree về như lúc giao (AI có thể đã tự sửa khoá lượt), để bên đó chạy lại được.
function datLaiSo(ss, vai) {
  const wt = ss.wt[vai];
  tryGit(wt, ["checkout", ss.base, "--", "agent.md"]);
  if (vai === "FRONTEND_UIUX_DEV") { const t = readTurn(wt); setTurn(wt, t.lastUpdatedBy || "CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV"); }
}

module.exports = { VAI, dieuKien, tao, phamVi, gop, don, datLaiSo, trongThuMuc };
