// Mỗi luồng tự động làm trên nhánh riêng `ai/<việc>-<mã>` (CEO duyệt 02/11/2026): code của AI không nằm thẳng trên nhánh chính.
// Sau mỗi lượt, file AI đổi được commit lên nhánh đó ("ai(VAI): …"), nên xem được diff từng lượt; CEO duyệt báo cáo rồi bấm
// "Đẩy nhánh" thì mới push và mở trang tạo PR trên GitHub. Không bao giờ push --force, merge hay xóa nhánh.
// Chỉ thêm file AI mới tạo hoặc file đang được git theo dõi: file chưa theo dõi có sẵn từ trước (có thể là .env, dữ liệu riêng) không bị commit.
"use strict";
const { execFileSync } = require("child_process");
const { resolveProgram } = require("./policy");
const { looksLikeKey, maskSecrets } = require("../lib/mask");

const err = (code, message) => Object.assign(new Error(message), { code });
const PATCH_MAX = 300 * 1024;

function git(root, args, { timeout = 15000, input } = {}) {
  const prog = resolveProgram("git");
  if (args[0] === "commit") {
    const id = (key, fallback) => { try { return execFileSync(prog[0], [...prog.slice(1), "config", "--get", key], { cwd: root, encoding: "utf8", timeout: 5000, windowsHide: true }).trim() || fallback; } catch { return fallback; } };
    args = ["-c", "user.name=" + id("user.name", "Van phong AI"), "-c", "user.email=" + id("user.email", "van-phong-ai@localhost"), ...args];
  }
  return execFileSync(prog[0], [...prog.slice(1), ...args], { cwd: root, encoding: "utf8", timeout, windowsHide: true, input, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: ["pipe", "pipe", "pipe"] });
}
const tryGit = (root, args, opts) => { try { return git(root, args, opts).trim(); } catch { return null; } };
const isRepo = (root) => tryGit(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
const head = (root) => tryGit(root, ["rev-parse", "HEAD"]);
const branchOf = (root) => tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
const untracked = (root) => (tryGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]) || "").split("\0").filter(Boolean);

// agent.md chỉ giữ trên máy (repo công khai: .git/info/exclude hoặc .gitignore, và chưa từng được commit).
const agentMdLocal = (root) => isRepo(root) && tryGit(root, ["check-ignore", "-q", "--", "agent.md"]) !== null && tryGit(root, ["ls-files", "--error-unmatch", "--", "agent.md"]) === null;

// File đang theo dõi bị sửa mà chưa commit (agent.md không tính: bộ điều phối tự commit sổ khi chuyển lượt).
function dirty(root) {
  let out = "";   // không trim: dòng porcelain bắt đầu bằng dấu cách (" M file")
  try { out = git(root, ["status", "--porcelain", "--untracked-files=no"]); } catch {}
  return out.split(/\r?\n/).filter(Boolean)
    .map((l) => l.slice(3)).filter((f) => f !== "agent.md");
}

// Tên nhánh: bỏ dấu tiếng Việt, chỉ giữ chữ số và gạch nối.
function slug(text) {
  const s = String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "");
  return s || "viec";
}

// Nhánh mặc định của remote (main/master), để so xem nhánh ai/ cũ đã được merge chưa.
function defaultBranch(root) {
  const r = tryGit(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (r) return r.replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (tryGit(root, ["rev-parse", "--verify", "--quiet", "refs/heads/" + b])) return b;
  return null;
}

// Kiểm trước khi giao việc: repo có file đang sửa dở thì không tạo nhánh (tránh trộn việc của CEO vào commit của AI).
function preflight(root) {
  if (!isRepo(root)) return { repo: false };
  if (!head(root)) throw err("NO_COMMIT", "Repo chưa có commit nào: commit lần đầu rồi mới giao việc.");
  const d = dirty(root);
  if (d.length) throw err("DIRTY_REPO", `Repo có ${d.length} file đang sửa chưa commit (${d.slice(0, 5).join(", ")}${d.length > 5 ? "…" : ""}). Commit hoặc cất (git stash) trước khi giao việc, để code của AI nằm riêng trên nhánh mới.`);
  return { repo: true };
}

// Tạo nhánh cho luồng. Đang đứng trên nhánh ai/ cũ đã được merge vào nhánh chính trên GitHub thì về nhánh chính
// (cập nhật fast-forward) rồi mới tách; chưa merge thì tách tiếp từ nhánh đó để không mất việc trước.
function prepare(root, { task, id }) {
  if (!preflight(root).repo) return null;
  const notes = [];
  let from = branchOf(root);
  const main = defaultBranch(root);
  if (from && from.startsWith("ai/") && main && tryGit(root, ["remote", "get-url", "origin"])) {
    if (tryGit(root, ["fetch", "--quiet", "origin", main], { timeout: 30000 }) !== null && tryGit(root, ["merge-base", "--is-ancestor", "HEAD", "origin/" + main]) !== null) {
      if (tryGit(root, ["switch", main]) !== null && tryGit(root, ["merge", "--ff-only", "origin/" + main]) !== null) { notes.push(`Nhánh ${from} đã được merge: về ${main} và cập nhật từ GitHub.`); from = main; }
      else { tryGit(root, ["switch", from]); notes.push(`Không cập nhật được ${main}: tách tiếp từ ${from}.`); }
    } else notes.push(`Nhánh ${from} chưa được merge vào ${main} (hoặc không đọc được GitHub): việc mới tách tiếp từ ${from}.`);
  }
  const name = "ai/" + slug(task) + "-" + String(id).slice(-6);
  try { git(root, ["switch", "-c", name]); } catch (e) { throw err("GIT_BRANCH", "Không tạo được nhánh " + name + ": " + maskSecrets(String(e.stderr || e.message)).slice(0, 300)); }
  return { branch: name, from, startHead: head(root), baseline: untracked(root), pushed: null, notes };
}

// Commit những gì AI vừa đổi trong lượt (trừ agent.md: bộ điều phối commit riêng khi chuyển lượt).
// Trả { commit } , { skipped } khi không có gì, hoặc { secret } khi diff có chuỗi giống khóa API (bỏ stage, không commit).
function save(root, g, message) {
  if (!g || branchOf(root) !== g.branch) return { skipped: "không đứng trên nhánh của luồng" };
  const known = new Set(g.baseline);
  const fresh = untracked(root).filter((f) => !known.has(f) && f !== "agent.md");
  tryGit(root, ["add", "-u", "--", ".", ":(exclude)agent.md"]);
  for (let i = 0; i < fresh.length; i += 100) tryGit(root, ["add", "--", ...fresh.slice(i, i + 100)]);
  const staged = tryGit(root, ["diff", "--cached", "--name-only"]);
  if (!staged) return { skipped: "không có thay đổi" };
  if (looksLikeKey(tryGit(root, ["diff", "--cached"]) || "")) { tryGit(root, ["reset", "--quiet"]); return { secret: true }; }
  try { git(root, ["commit", "--quiet", "--no-verify", "-m", message]); } catch (e) { tryGit(root, ["reset", "--quiet"]); return { error: maskSecrets(String(e.stderr || e.message)).slice(0, 300) }; }
  return { commit: tryGit(root, ["rev-parse", "--short", "HEAD"]) };
}

// File đang theo dõi bị xoá so với mốc đầu lượt (kể cả khi AI đã tự commit việc xoá).
function deleted(root, from) {
  if (!from) return [];
  return (tryGit(root, ["diff", "--name-only", "--diff-filter=D", "-z", from]) || "").split("\0").map((x) => x.trim()).filter(Boolean);
}
// Khôi phục các file đang theo dõi về bản ở mốc đầu lượt. Trả danh sách khôi phục được.
function restore(root, from, paths) {
  const ok = [];
  for (const p of paths) if (tryGit(root, ["checkout", from, "--", p]) !== null) ok.push(p);
  return ok;
}

// File đổi và diff giữa hai mốc (một lượt của AI). Diff bị che khóa và cắt ở 300 KB.
function diff(root, from, to) {
  if (!from) throw err("NO_GIT", "Lượt này không có mốc git (dự án không phải repo git).");
  const range = [from, to || "HEAD"];
  const files = (tryGit(root, ["diff", "--numstat", ...range]) || "").split(/\r?\n/).filter(Boolean).map((l) => {
    const [a, d, ...p] = l.split("\t");
    return { path: p.join("\t"), added: a === "-" ? null : Number(a), removed: d === "-" ? null : Number(d) };
  });
  let patch = tryGit(root, ["diff", "--no-color", ...range]) || "";
  const cut = patch.length > PATCH_MAX;
  patch = maskSecrets(cut ? patch.slice(0, PATCH_MAX) : patch);
  const commits = (tryGit(root, ["log", "--format=%h%x09%s", range[0] + ".." + range[1]]) || "").split(/\r?\n/).filter(Boolean).map((l) => { const [hash, ...s] = l.split("\t"); return { hash, subject: maskSecrets(s.join("\t")).slice(0, 200) }; });
  return { from, to: to || head(root), files, commits, patch, truncated: cut };
}

// Đẩy nhánh lên GitHub (không --force) và trả link trang tạo PR. Chỉ chạy khi CEO bấm nút.
function push(root, g) {
  const remote = tryGit(root, ["remote", "get-url", "origin"]);
  if (!remote) throw err("NO_REMOTE", "Repo không có remote origin: không đẩy được nhánh.");
  try { git(root, ["push", "--set-upstream", "origin", g.branch], { timeout: 120000 }); }
  catch (e) { throw err("GIT_PUSH", "Không đẩy được nhánh " + g.branch + ": " + maskSecrets(String(e.stderr || e.message)).split(/\r?\n/).filter(Boolean).slice(-3).join(" ").slice(0, 400)); }
  const clean = remote.replace(/\/\/[^@/]+@/, "//");   // bỏ user:token@ nếu có
  return { at: Date.now(), remote: clean, compareUrl: compareUrl(clean, defaultBranch(root) || g.from || "main", g.branch) };
}
// Trang tạo PR trên GitHub cho nhánh; remote không phải GitHub thì null.
function compareUrl(remote, main, branch) {
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote);
  const enc = (b) => b.split("/").map(encodeURIComponent).join("/");
  return m ? `https://github.com/${m[1]}/${m[2]}/compare/${enc(main)}...${enc(branch)}?expand=1` : null;
}

module.exports = { git, preflight, prepare, save, diff, push, compareUrl, head, branchOf, defaultBranch, slug, isRepo, agentMdLocal, deleted, restore, untracked };
