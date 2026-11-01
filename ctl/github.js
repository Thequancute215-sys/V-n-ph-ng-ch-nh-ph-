"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { cleanEnv } = require("../lib/mask");

const err = (code, message) => Object.assign(new Error(message), { code });
const validName = (name) => typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(name) && !name.split("/").some((s) => s === "." || s === "..");
const inside = (root, target) => { const rel = path.relative(root, target); return !rel.startsWith("..") && !path.isAbsolute(rel); };

function git(args, input, cwd = os.tmpdir()) {
  return new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024,
      env: { ...cleanEnv(), GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } }, (e, out) => e ? reject(err("GITHUB_AUTH", "Không đọc được đăng nhập GitHub đã lưu trên máy. Mở Git Credential Manager để đăng nhập lại.")) : resolve(out));
    child.stdin.on("error", () => {});
    child.stdin.end(input || "");
  });
}

// Credential chỉ tồn tại trong bộ nhớ phía ctl, không ghi file, log hoặc trả xuống trình duyệt.
async function credential() {
  const text = await git(["-c", "credential.interactive=false", "credential", "fill"], "protocol=https\nhost=github.com\n\n");
  const fields = Object.fromEntries(text.trim().split(/\r?\n/).map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
  if (!fields.password) throw err("GITHUB_AUTH", "Chưa có đăng nhập GitHub trong Git Credential Manager.");
  return fields.password;
}

function remoteName(url) {
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^\s?#]+?)(?:\.git)?\/?$/i.exec(String(url).trim());
  return m && validName(m[1]) ? m[1].toLowerCase() : null;
}

function createGitHub({ ws, jobs, audit, select, projectsDir = path.join(os.homedir(), "Projects"), getCredential = credential, fetcher = fetch, runGit = git }) {
  const operations = new Map();
  let closed = false;
  async function api(route) {
    const token = await getCredential();
    let response;
    try { response = await fetcher("https://api.github.com" + route, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "VanPhongAI" }, signal: AbortSignal.timeout(15000), redirect: "error" }); }
    catch { throw err("GITHUB_OFFLINE", "Không kết nối được GitHub. Kiểm tra mạng rồi thử lại."); }
    if (!response.ok) {
      if (response.status === 401) throw err("GITHUB_AUTH", "Đăng nhập GitHub đã hết hạn. Đăng nhập lại bằng Git Credential Manager.");
      if (response.status === 403 || response.status === 429) throw err("GITHUB_LIMIT", "GitHub đang giới hạn yêu cầu hoặc tài khoản chưa được cấp quyền truy cập repo này.");
      if (response.status === 404) throw err("NOT_FOUND", "Không tìm thấy repo hoặc tài khoản chưa có quyền đọc.");
      throw err("GITHUB_OFFLINE", "GitHub trả về lỗi HTTP " + response.status + ". Thử lại sau.");
    }
    return { data: await response.json(), more: /rel="next"/.test(response.headers.get("link") || "") };
  }
  async function list(page = 1) {
    page = Number(page);
    if (!Number.isInteger(page) || page < 1 || page > 100) throw err("BAD_REQUEST", "Trang repo không hợp lệ");
    const [user, repos] = await Promise.all([api("/user"), api("/user/repos?per_page=100&sort=updated&direction=desc&page=" + page)]);
    if (!Array.isArray(repos.data)) throw err("GITHUB_OFFLINE", "GitHub trả danh sách repo không hợp lệ.");
    return { account: { login: user.data.login, url: "https://github.com/" + user.data.login }, page, hasMore: repos.more,
      repositories: repos.data.filter((r) => validName(r.full_name)).map((r) => ({ fullName: r.full_name, description: String(r.description || "").slice(0, 500), private: !!r.private, archived: !!r.archived, defaultBranch: r.default_branch || null, url: "https://github.com/" + r.full_name })) };
  }
  async function local(fullName) {
    const registered = ws.list().map((w) => w.path), candidates = new Set([ws.current(), ...registered].filter(Boolean));
    // Chỉ xem các thư mục dự án ngay dưới Projects; không quét đệ quy toàn máy.
    try { for (const d of fs.readdirSync(projectsDir, { withFileTypes: true })) if (d.isDirectory()) candidates.add(path.join(projectsDir, d.name)); } catch {}
    candidates.add(path.join(projectsDir, ...fullName.split("/")));
    for (const candidate of candidates) {
      if (!fs.existsSync(path.join(candidate, ".git"))) continue;
      try { if (remoteName(await runGit(["remote", "get-url", "origin"], null, candidate)) === fullName.toLowerCase()) return candidate; } catch {}
    }
    return null;
  }
  async function perform(op) {
    const { data: repo } = await api("/repos/" + op.fullName);
    if (!validName(repo.full_name) || repo.full_name.toLowerCase() !== op.fullName.toLowerCase()) throw err("BAD_REQUEST", "Repo đã đổi tên; tải lại danh sách để chọn.");
    if (closed) return;
    let root = await local(op.fullName);
    if (closed) return;
    if (!root) {
      fs.mkdirSync(projectsDir, { recursive: true });
      const base = fs.realpathSync(projectsDir), [owner, name] = op.fullName.split("/");
      const ownerDir = path.join(base, owner);
      fs.mkdirSync(ownerDir, { recursive: true });
      if (!inside(base, fs.realpathSync(ownerDir))) throw err("PATH_ESCAPE", "Thư mục đích trỏ ra ngoài Projects.");
      root = path.join(ownerDir, name);
      if (fs.existsSync(root)) throw err("CHANGED", "Đã có thư mục " + root + ". Văn phòng giữ nguyên thư mục này; chọn hoặc đăng ký đúng bản sao trong bảng điều khiển máy.");
      // Giữ chỗ bằng mkdir độc quyền; không bao giờ clone đè lên dữ liệu có sẵn.
      fs.mkdirSync(root);
      op.message = "Đang tải repo về máy…";
      const result = await new Promise((resolve, reject) => {
        try {
          const job = jobs.start({ kind: "cmd", agent: "GitHub", workspace: ownerDir,
            argv: ["git", "-c", "credential.interactive=false", "clone", "--", "https://github.com/" + op.fullName + ".git", root], timeoutMs: 10 * 60 * 1000, onExit: resolve });
          op.jobId = job.id;
        } catch (e) { reject(e); }
      });
      if (closed) return;
      if (result.status !== "done") throw err("GITHUB_CLONE", "Tải repo kết thúc với trạng thái " + result.status + ". Thư mục được giữ tại " + root + "; xem nhật ký " + op.jobId + ".");
      op.cloned = true;
    }
    if (closed) return;
    const workspace = ws.add(root, "ceo-github");
    select(workspace.path);
    op.status = "done"; op.workspace = workspace.path;
    op.hasAgent = fs.existsSync(path.join(workspace.path, "agent.md"));
    op.message = op.hasAgent ? "Đã mở repo. Có thể giao việc cho đội AI." : "Đã mở repo. Repo chưa có agent.md; cần thiết lập sổ đội AI trước khi giao việc tự động.";
    audit.log("ceo", "github.open", op.fullName, { workspace: workspace.path, cloned: !!op.cloned });
  }
  function open(fullName) {
    if (!validName(fullName)) throw err("BAD_REQUEST", "Tên repo phải có dạng chu-so-huu/ten-repo.");
    if (Array.from(operations.values()).some((op) => op.status === "running")) throw err("AI_BUSY", "Đang mở một repo. Chờ xong rồi chọn tiếp.");
    if (operations.size >= 30) operations.delete(operations.keys().next().value);
    const op = { id: crypto.randomUUID(), fullName, status: "running", message: "Đang kiểm tra repo và bản sao trên máy…" };
    operations.set(op.id, op);
    perform(op).catch((e) => { if (closed) return; op.status = "failed"; op.code = e.code || "GITHUB_CLONE"; op.message = e.message; audit.log("ctl", "github.open_failed", fullName, { code: op.code, message: op.message }); });
    return { ...op };
  }
  function get(id) { const op = operations.get(id); if (!op) throw err("NOT_FOUND", "Không tìm thấy phiên mở repo; kiểm tra lại dự án đang chọn."); return { ...op }; }
  return { list, open, get, close: () => { closed = true; } };
}
module.exports = { createGitHub, remoteName };
