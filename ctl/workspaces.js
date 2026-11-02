// Workspace đã đăng ký = vùng duy nhất ctl được chạy lệnh và đọc/ghi file. Mọi đường dẫn đi qua realpath trước khi so,
// nên "..", symlink/junction trỏ ra ngoài, hay ổ đĩa khác đều bị chặn (PATH_ESCAPE).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { maskSecrets } = require("../lib/mask");

// Chỉ đọc vùng có thật; không lấy NEXT_OWNER hoặc OPEN trong ví dụ ở vùng khác.
function readProgress(text) {
  const lines = maskSecrets(text).split(/\r?\n/), sections = new Map();
  let section = null;
  for (const line of lines) {
    const heading = /^#{1,6}\s+\[(\d+(?:\.\d+)*)\]\s*(.*)/.exec(line);
    if (heading) { section = { id: heading[1], title: `[${heading[1]}] ${heading[2]}`, lines: [] }; sections.set(section.id, section); }
    else if (section) section.lines.push(line);
  }
  const body = (id) => (sections.get(id)?.lines || []).join("\n");
  const field = (id, key) => new RegExp(`^\\s*-\\s*${key}[^:\\n]*:[ \\t]*(.*)$`, "m").exec(body(id))?.[1]?.trim() || null;
  // Chỉ lấy mã vai (NEXT_OWNER có thể kèm ghi chú phía sau).
  const role = (key) => /^[A-Z_]+/.exec(field("4", key) || "")?.[0] || null;
  const phase = field("4", "CURRENT_PHASE"), nextOwner = role("NEXT_OWNER"), lastUpdatedBy = role("LAST_UPDATED_BY");
  const openBlockers = [...sections.values()].filter((s) => /^5(?:\.|$)/.test(s.id)).flatMap((s) => s.lines)
    .filter((l) => /^\s*-\s*\[ \]\s+OPEN\b/.test(l)).map((line) => {
      const text = line.replace(/^\s*-\s*\[ \]\s+OPEN\s*/, "").trim();
      return { id: /^([^\s:[\]]+)/.exec(text)?.[1] || null,
        level: /\b(CRITICAL|HIGH|MEDIUM|LOW|P[0-3])\b/i.exec(text)?.[1]?.toUpperCase() || null, text };
    });
  const placeholder = /\[(?:Chưa\s|Chờ\s|Tên tính năng|Bước 1|Mất mạng|Tool name|Session\s*\/|Chống prompt|ví dụ|Layout tổng quan|State cần|Cache keys|Cơ chế stream|File HTML)[^\]]*\]|\{\{[^}]+\}\}/i;
  const emptySections = [...sections.values()].filter((s) => /^[123](?:\.|$)/.test(s.id) && placeholder.test(s.lines.join("\n"))).map((s) => s.title);
  const duties = {
    SPEC_ARCHITECT: "viết đặc tả sản phẩm và thiết kế giao diện ở Vùng [2]",
    SOL_ARCHITECT_PLANNER: "chốt công nghệ Vùng [1] và lập kiến trúc, kế hoạch ở Vùng [3]",
    CLAUDE_AUDITOR: "kiểm duyệt và ghi kết quả, chốt chặn ở Vùng [5]",
    CODEX_ASTRA_DEV: "viết code, kiểm thử và ghi CLAIM_FIXED ở Vùng [4.1] để Claude kiểm lại",
    SOL_ARCHITECT_ADVISOR: "đối chiếu code với đặc tả, kiến trúc và ghi nhận xét ở Vùng [4.1]",
  };
  const nextStep = (duties[nextOwner] ? `${nextOwner} cần ${duties[nextOwner]}.` : "Chưa xác định được vai giữ lượt hợp lệ trong Vùng [4]; cần kiểm tra sổ agent.md.") +
    ` Còn ${openBlockers.length} blocker OPEN${openBlockers.length ? "; chưa được tăng Phase" : ""}.`;
  return { phase, nextOwner, lastUpdatedBy, auditStatus: field("5", "AUDIT_STATUS"), openBlockers,
    log41: (sections.get("4.1")?.lines || []).filter((l) => l.trim()).slice(-25), emptySections, nextStep };
}

const maskValues = (value) => typeof value === "string" ? maskSecrets(value) : Array.isArray(value) ? value.map(maskValues) :
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskValues(v)])) : value;

const MAX_READ = 2 * 1024 * 1024;
const TEMPLATE = path.join(__dirname, "agent-template.md");
// Nhận diện công nghệ theo file đánh dấu ở gốc repo (chỉ để điền Vùng [1]; Sol chốt Tech Stack thật ở Vùng [3]).
const STACKS = [
  [["package.json"], "Node.js / TypeScript"], [["pyproject.toml", "requirements.txt", "setup.py"], "Python"],
  [["Cargo.toml"], "Rust"], [["go.mod"], "Go"], [["CMakeLists.txt", "Makefile"], "C/C++"],
  [["pom.xml", "build.gradle", "build.gradle.kts"], "Java / Kotlin"],
];
const detectStack = (root) => STACKS.filter(([files]) => files.some((f) => fs.existsSync(path.join(root, f)))).map(([, name]) => name);
const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
const inside = (root, p) => { const rel = path.relative(root, p); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
const err = (code, msg) => Object.assign(new Error(msg), { code });
// Lệnh git chỉ đọc; lỗi (không phải repo, chưa có commit…) trả null để báo "không có", không đoán.
const gitRead = (root, args) => {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 8000, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 4 * 1024 * 1024 }).trim(); }
  catch { return null; }
};
const README = ["README.md", "readme.md", "README.MD", "Readme.md", "README"];

function createWorkspaces(db, audit) {
  const q = {
    all: db.prepare("SELECT path, name, added_at FROM workspaces ORDER BY added_at"),
    get: db.prepare("SELECT path, name, added_at FROM workspaces WHERE path = ?"),
    add: db.prepare("INSERT OR IGNORE INTO workspaces (path, name, added_at) VALUES (?, ?, ?)"),
    del: db.prepare("DELETE FROM workspaces WHERE path = ?"),
  };
  let active = null;

  function list() { return q.all.all().map((w) => ({ ...w, active: !!active && same(w.path, active) })); }

  function add(p, actor = "ceo") {
    let real;
    try { real = fs.realpathSync(path.resolve(String(p || ""))); } catch { throw err("NOT_FOUND", "Không có thư mục " + p); }
    if (!fs.statSync(real).isDirectory()) throw err("NOT_DIR", real + " không phải thư mục");
    // Chặn cả ổ đĩa, thư mục người dùng và mọi thư mục chứa nó (C:\Users…).
    if (same(real, path.parse(real).root) || inside(real, os.homedir())) throw err("TOO_BROAD", "Không đăng ký cả ổ đĩa hay cả thư mục người dùng");
    // Thư mục nằm TRONG thư mục người dùng mà bắt đầu bằng "." (~/.ssh, ~/.claude, ~/.van-phong-ao…) chứa khóa đăng nhập.
    if (inside(os.homedir(), real) && path.relative(os.homedir(), real).split(path.sep)[0].startsWith(".")) throw err("TOO_SENSITIVE", "Không đăng ký thư mục cấu hình ẩn (.ssh, .claude, .codex…)");
    // Windows không phân biệt hoa/thường và realpath giữ nguyên cách gõ: dùng lại đường dẫn đã lưu để không sinh 2 dòng cho 1 thư mục.
    const dup = q.all.all().find((w) => same(w.path, real));
    if (dup) real = dup.path;
    const agentMd = initAgentMd(real, actor);
    q.add.run(real, path.basename(real), Date.now());
    audit.log(actor, "workspace.add", real);
    if (!active) active = real;
    return { ...list().find((w) => same(w.path, real)), agentMd };
  }

  // Repo mới chưa có giao thức: tạo agent.md v2.2 từ mẫu, lượt đầu cho CLAUDE_AUDITOR (CEO quyết 02/11/2026: mọi repo tự chạy chu trình).
  // Không bao giờ ghi đè agent.md đã có (cờ "wx"). Không tự commit: lần "Duyệt chuyển lượt" đầu tiên sẽ commit cùng lượt.
  function initAgentMd(root, actor) {
    const f = path.join(root, "agent.md");
    if (fs.existsSync(f)) return { created: false };
    const stack = detectStack(root);
    const text = fs.readFileSync(TEMPLATE, "utf8").split("{{TEN_DU_AN}}").join(path.basename(root)).split("{{CONG_NGHE}}").join(stack.join(", ") || "chưa nhận diện được");
    try { fs.writeFileSync(f, text, { flag: "wx" }); } catch (e) { if (e.code === "EEXIST") return { created: false }; throw err("WRITE_FAILED", "Không tạo được agent.md: " + e.message); }
    audit.log(actor, "workspace.init_agent_md", root, { stack });
    return { created: true, stack };
  }

  function remove(p, actor = "ceo") {
    const w = find(p);
    q.del.run(w.path);
    if (active && same(active, w.path)) active = null;
    audit.log(actor, "workspace.remove", w.path);
  }

  function find(p) {
    let real;
    try { real = fs.realpathSync(path.resolve(String(p || ""))); } catch { throw err("WORKSPACE_DENIED", "Workspace không tồn tại: " + p); }
    const w = q.all.all().find((x) => same(x.path, real));
    if (!w) throw err("WORKSPACE_DENIED", "Chưa đăng ký workspace " + real);
    return w;
  }

  // Chọn dự án nào cũng kiểm agent.md: dự án đăng ký từ trước khi có tính năng tự tạo vẫn được tạo khi chọn lại.
  function switchTo(p, actor = "ceo") {
    const w = find(p);
    active = w.path;
    audit.log(actor, "workspace.switch", w.path);
    let agentMd;
    try { agentMd = initAgentMd(w.path, actor); } catch (e) { agentMd = { created: false, error: e.message }; }
    return { ...w, agentMd };
  }

  // Repo công khai: agent.md (Vùng [5] có thể ghi lỗ hổng chưa sửa) chỉ giữ trên máy, không commit.
  function excludeAgentMd(p, actor = "ctl") {
    const root = find(p).path;
    const rel = gitRead(root, ["rev-parse", "--git-path", "info/exclude"]);
    if (!rel) return false;
    const f = path.resolve(root, rel);
    let txt = "";
    try { txt = fs.readFileSync(f, "utf8"); } catch {}
    if (/^\/?agent\.md\s*$/m.test(txt)) return false;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, (txt && !txt.endsWith("\n") ? "\n" : "") + "# Văn phòng AI: repo công khai, agent.md chỉ giữ trên máy\n/agent.md\n");
    audit.log(actor, "workspace.exclude_agent_md", root);
    return true;
  }

  // Đọc thật repo đang chọn: git, công nghệ, README, sổ agent.md. Mục nào không đọc được thì để null kèm lý do.
  function overview(p) {
    const root = find(p).path;
    const isRepo = gitRead(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
    let repo = null;
    if (isRepo) {
      const log = gitRead(root, ["log", "-5", "--format=%h%x09%cr%x09%s"]);
      const status = gitRead(root, ["status", "--porcelain"]);
      repo = {
        branch: gitRead(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
        commits: (log || "").split("\n").filter(Boolean).map((l) => { const [hash, when, ...s] = l.split("\t"); return { hash, when, subject: s.join("\t").slice(0, 200) }; }),
        changed: status === null ? null : status.split("\n").filter(Boolean).length,
        remote: (gitRead(root, ["remote", "get-url", "origin"]) || "").replace(/\/\/[^@/]+@/, "//") || null,   // bỏ user:token@ nếu có
        agentMdTracked: gitRead(root, ["ls-files", "--error-unmatch", "--", "agent.md"]) !== null,
        agentMdIgnored: gitRead(root, ["check-ignore", "-q", "--", "agent.md"]) !== null,
      };
    }
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.name !== ".git").map((d) => d.name + (d.isDirectory() ? "/" : "")).sort(); } catch {}
    let readme = null;
    for (const name of README) {
      try {
        const line = fs.readFileSync(path.join(root, name), "utf8").slice(0, 4000).split(/\r?\n/).map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l && !l.startsWith("<!--") && !l.startsWith("!["));
        if (line) { readme = { file: name, firstLine: line.slice(0, 300) }; break; }
      } catch {}
    }
    const agentMd = { exists: fs.existsSync(path.join(root, "agent.md")) };
    let progress = null, progressReason = "Dự án chưa có agent.md nên chưa đọc được tiến độ theo giao thức.";
    if (agentMd.exists) {
      try {
        const agentPath = resolve(root, "agent.md").real;
        if (fs.statSync(agentPath).size > MAX_READ) throw new Error("agent.md vượt giới hạn đọc 2 MB");
        const txt = fs.readFileSync(agentPath, "utf8");
        progress = readProgress(txt); progressReason = null;
        Object.assign(agentMd, { phase: progress.phase, nextOwner: progress.nextOwner, lastUpdatedBy: progress.lastUpdatedBy });
        if (!progress.nextOwner) agentMd.problem = "agent.md không có dòng NEXT_OWNER trong Vùng [4]";
        agentMd.auditStatus = progress.auditStatus;
        agentMd.openBlockers = progress.openBlockers.map((b) => ("[ ] OPEN " + b.text).slice(0, 300));
      } catch (e) { progressReason = "Không đọc được tiến độ: " + e.message; agentMd.problem = e.message; }
    }
    return maskValues({ workspace: root, name: path.basename(root), readAt: Date.now(), isRepo, repo, stack: detectStack(root), entries: entries.slice(0, 40), totalEntries: entries.length, readme, agentMd, progress, progressReason });
  }
  function current() { if (!active) { const a = q.all.all()[0]; active = a ? a.path : null; } return active; }

  // Đổi (workspace, đường dẫn tương đối) thành đường dẫn thật nằm trong workspace. forWrite: file có thể chưa có, kiểm thư mục cha.
  function resolve(ws, rel, { forWrite = false } = {}) {
    const root = find(ws).path;
    // "\\" coi như dấu phân cách trên mọi hệ: "..\\ngoai" không lọt qua kiểm tra khi ctl chạy trên Linux/macOS.
    const target = path.resolve(root, String(rel || ".").replace(/\\/g, "/"));
    if (!inside(root, target)) throw err("PATH_ESCAPE", "Đường dẫn ra ngoài workspace");
    if (forWrite && path.relative(root, target).split(path.sep).some((x) => x.toLowerCase() === ".git")) throw err("PATH_DENIED", "Không ghi thẳng vào .git");
    let real;
    try { real = fs.realpathSync(target); }
    catch (e) {
      if (!forWrite || e.code !== "ENOENT") throw err("NOT_FOUND", "Không có " + rel);
      let parent;
      try { parent = fs.realpathSync(path.dirname(target)); } catch { throw err("NOT_FOUND", "Không có thư mục cha của " + rel); }
      if (!inside(root, parent)) throw err("PATH_ESCAPE", "Thư mục cha ra ngoài workspace");
      real = path.join(parent, path.basename(target));
    }
    if (!inside(root, real)) throw err("PATH_ESCAPE", "Đường dẫn (qua symlink) ra ngoài workspace");
    const parts = path.relative(root, real).split(path.sep);
    if (forWrite && parts.some((x) => x.toLowerCase() === ".git")) throw err("PATH_DENIED", "Không ghi thẳng vào .git");
    return { root, real, rel: path.relative(root, real).split(path.sep).join("/") };
  }

  return { list, add, remove, find, switchTo, current, resolve, overview, excludeAgentMd, MAX_READ };
}

module.exports = { createWorkspaces };
