// Cập nhật app Văn phòng AI bằng một nút (CEO duyệt 07/11/2026): không bắt người dùng xoá đi tải lại.
// Kênh "phat-hanh" (mặc định): chỉ nhận bản CEO đã phát hành, tức tag vX.Y.Z trên GitHub. Merge vào main KHÔNG tự tới
// máy người dùng, vì "đồng ý merge không có nghĩa là đồng ý phát hành". Kênh "main" (đặt updateChannel trong config.json)
// dành cho máy của đội phát triển muốn chạy bản mới nhất của main.
// Chỉ cập nhật kiểu fast-forward: máy có commit riêng hay file đang sửa thì từ chối, không bao giờ ghi đè việc của người dùng.
// Dữ liệu (data/, config.json, ~/.van-phong-ao) nằm ngoài git nên giữ nguyên; sổ ctl.db tự nâng cấp khi mở (ctl/db.js).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { writeAtomic } = require("./ghi-file");

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const CHANNELS = ["phat-hanh", "main"];
const HOME = () => process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
const STATE_FILE = () => path.join(HOME(), "cap-nhat.json");
const LOG_FILE = () => path.join(HOME(), "logs", "cap-nhat.log");
const err = (code, message) => Object.assign(new Error(message), { code });
const firstLine = (e) => String((e && (e.stderr || e.message)) || e || "").trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || "lỗi không rõ";

// Lệnh git không bao giờ hỏi mật khẩu trên terminal (chạy nền sẽ treo): thiếu quyền thì báo lỗi.
function gitIn(root) {
  return (args, { timeout = 30000 } = {}) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).replace(/\s+$/, "");   // giữ khoảng trắng đầu: " M file" của git status
}

function cmpTag(a, b) {
  const x = TAG.exec(a).slice(1).map(Number), y = TAG.exec(b).slice(1).map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function readVersion(text) { try { return String(JSON.parse(text).version || "") || null; } catch { return null; } }
function localVersion(root) { try { return readVersion(fs.readFileSync(path.join(root, "package.json"), "utf8")); } catch { return null; } }

// Tình trạng cập nhật. fetch: tải tag/nhánh mới từ GitHub trước (cần mạng); không thì chỉ dùng những gì máy đã có.
// state: khong-phai-git | chua-phat-hanh | moi-nhat | co-ban-moi | lech. canUpdate chỉ true khi co-ban-moi và không có lý do chặn.
function check(root, { channel = "phat-hanh", fetch = false, git = gitIn(root) } = {}) {
  if (!CHANNELS.includes(channel)) channel = "phat-hanh";
  const out = { channel, version: localVersion(root), head: null, branch: null, target: null, state: null, commits: [], dirty: [], reasons: [], fetchedAt: null, fetchError: null, canUpdate: false };
  const tryGit = (args) => { try { return git(args); } catch { return null; } };
  out.head = tryGit(["rev-parse", "HEAD"]);
  if (!out.head) { out.state = "khong-phai-git"; out.reasons.push("Thư mục văn phòng không phải bản sao git: cài bằng git clone thì mới dùng được nút Cập nhật."); return out; }
  out.branch = tryGit(["symbolic-ref", "--short", "-q", "HEAD"]);
  if (fetch) {
    try { git(channel === "main" ? ["fetch", "--quiet", "--tags", "origin", "main"] : ["fetch", "--quiet", "--tags", "origin"], { timeout: 120000 }); out.fetchedAt = new Date().toISOString(); }
    catch (e) { out.fetchError = "Không tải được bản mới từ GitHub (mạng hoặc quyền truy cập repo): " + firstLine(e); }
  }
  let ref, name;
  if (channel === "main") { ref = "refs/remotes/origin/main"; name = "main"; }
  else {
    const tags = (tryGit(["tag", "-l", "v*"]) || "").split(/\r?\n/).filter((t) => TAG.test(t)).sort(cmpTag);
    if (!tags.length) { out.state = "chua-phat-hanh"; return out; }
    name = tags[tags.length - 1]; ref = "refs/tags/" + name;
  }
  const sha = tryGit(["rev-parse", "--verify", "--quiet", ref + "^{commit}"]);
  if (!sha) { out.state = "chua-phat-hanh"; return out; }
  out.target = { name, sha, version: readVersion(tryGit(["show", sha + ":package.json"])), notes: channel === "main" ? null : (tryGit(["tag", "-l", "--format=%(contents)", name]) || "").slice(0, 3000) || null };
  const ancestor = (a, b) => { try { git(["merge-base", "--is-ancestor", a, b]); return true; } catch { return false; } };
  if (ancestor(sha, out.head)) out.state = "moi-nhat";
  else if (ancestor(out.head, sha)) {
    out.state = "co-ban-moi";
    out.commits = (tryGit(["log", "--no-merges", "--format=%h%x1f%s", "-50", out.head + ".." + sha]) || "").split(/\r?\n/).filter(Boolean).map((l) => { const [hash, subject] = l.split("\x1f"); return { hash, subject }; });
  } else {
    out.state = "lech";
    out.reasons.push(`Bản trên máy có commit riêng không nằm trong ${name}: không cập nhật tự động để khỏi mất việc của anh. Đưa các commit đó lên GitHub (PR) hoặc nhờ đội AI xử lý.`);
  }
  out.dirty = (tryGit(["status", "--porcelain", "--untracked-files=no"]) || "").split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
  if (out.state === "co-ban-moi" && out.dirty.length) out.reasons.push(`Có ${out.dirty.length} file của app đang bị sửa (${out.dirty.slice(0, 5).join(", ")}): cập nhật sẽ ghi đè, nên dừng. Cất hoặc bỏ thay đổi đó trước.`);
  out.canUpdate = out.state === "co-ban-moi" && !out.reasons.length;
  return out;
}

// Áp bản mới: chỉ fast-forward từ đúng `from` (HEAD lúc kiểm) tới `to`. Kiểm lại ngay trước khi đổi vì người dùng có thể vừa sửa gì đó.
function apply(root, { from, to }, git = gitIn(root)) {
  if (git(["rev-parse", "HEAD"]) !== from) throw err("CHANGED", "Bản trên máy đã đổi từ lúc kiểm: mở lại trang Cập nhật và kiểm lại.");
  if (git(["status", "--porcelain", "--untracked-files=no"])) throw err("DIRTY", "Có file của app đang bị sửa: không cập nhật.");
  try { git(["merge-base", "--is-ancestor", from, to]); } catch { throw err("NOT_FF", "Bản mới không nối tiếp bản trên máy: không cập nhật."); }
  git(["merge", "--ff-only", "--quiet", to]);
  if (git(["rev-parse", "HEAD"]) !== to) throw err("FAILED", "Cập nhật xong nhưng HEAD không ở bản mới.");
}

// Quay về bản trước khi bản mới không chạy được. --keep: giữ thay đổi chưa commit (nếu có) và từ chối nếu phải ghi đè chúng.
function rollback(root, from, git = gitIn(root)) {
  git(["reset", "--keep", from]);
}

// Tải tag/nhánh mới không chặn tiến trình (ctl vẫn trả lời yêu cầu khác trong lúc chờ mạng).
function fetchAsync(root, channel = "phat-hanh") {
  const { execFile } = require("child_process");
  const args = channel === "main" ? ["fetch", "--quiet", "--tags", "origin", "main"] : ["fetch", "--quiet", "--tags", "origin"];
  return new Promise((resolve) => execFile("git", args, { cwd: root, windowsHide: true, timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    (e, stdout, stderr) => resolve({ at: new Date().toISOString(), error: e ? "Không tải được bản mới từ GitHub (mạng hoặc quyền truy cập repo): " + firstLine({ stderr, message: e.message }) : null })));
}

// Các bước của một lần cập nhật, chạy trong tiến trình riêng (scripts/cap-nhat.js) vì phải tắt cả văn phòng.
// stopApp / startApp / healthy: hàm async trả true/false (tiêm vào để test được). Kết quả cuối: xong | da-quay-lai | loi.
async function runUpdate({ root, from, to, name, stopApp, startApp, healthy, log = () => {}, git = gitIn(root) }) {
  const step = (status, message = null) => { log(status + (message ? ": " + message : "")); return writeState({ status, from, to, name, message, log: LOG_FILE() }); };
  step("dang-tat");
  if (!(await stopApp())) return step("loi", "Không tắt được văn phòng để cập nhật. Bản trên máy giữ nguyên.");
  step("dang-cap-nhat");
  try { apply(root, { from, to }, git); }
  catch (e) {
    const back = await startApp();
    return step("loi", "Không cập nhật được: " + firstLine(e) + (back ? ". Văn phòng chạy lại bản cũ." : ". Văn phòng chưa bật lại được: chạy npm run app."));
  }
  step("dang-khoi-dong");
  if ((await startApp()) && (await healthy())) return step("xong", "Đã lên " + name + ".");
  step("dang-quay-lai", "Bản " + name + " không chạy được: quay về bản cũ.");
  await stopApp();
  try { rollback(root, from, git); } catch (e) { return step("loi", "Bản " + name + " không chạy được và không quay về bản cũ được: " + firstLine(e) + ". Nhờ đội AI xem log " + LOG_FILE() + "."); }
  return (await startApp())
    ? step("da-quay-lai", "Bản " + name + " không chạy được trên máy này nên văn phòng đã quay về bản cũ. Dữ liệu giữ nguyên. Báo đội AI kèm log " + LOG_FILE() + ".")
    : step("loi", "Đã quay về bản cũ nhưng văn phòng chưa bật lại được: chạy npm run app.");
}

function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE(), "utf8")); } catch { return null; } }
function writeState(state) {
  fs.mkdirSync(HOME(), { recursive: true });
  const s = { ...state, at: new Date().toISOString() };
  writeAtomic(STATE_FILE(), JSON.stringify(s, null, 2));
  return s;
}
// Đang có lần cập nhật chạy dở (chưa xong, chưa lỗi) trong 10 phút gần đây.
const RUNNING = ["bat-dau", "dang-tat", "dang-cap-nhat", "dang-khoi-dong", "dang-quay-lai"];
function busy(state = readState(), now = Date.now()) {
  return !!state && RUNNING.includes(state.status) && now - Date.parse(state.at || 0) < 10 * 60 * 1000;
}

module.exports = { TAG, CHANNELS, HOME, STATE_FILE, LOG_FILE, gitIn, cmpTag, localVersion, check, apply, rollback, fetchAsync, runUpdate, readState, writeState, busy, firstLine };
