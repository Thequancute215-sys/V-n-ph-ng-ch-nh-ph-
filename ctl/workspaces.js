// Workspace đã đăng ký = vùng duy nhất ctl được chạy lệnh và đọc/ghi file. Mọi đường dẫn đi qua realpath trước khi so,
// nên "..", symlink/junction trỏ ra ngoài, hay ổ đĩa khác đều bị chặn (PATH_ESCAPE).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const MAX_READ = 2 * 1024 * 1024;
const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
const inside = (root, p) => { const rel = path.relative(root, p); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
const err = (code, msg) => Object.assign(new Error(msg), { code });

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
    q.add.run(real, path.basename(real), Date.now());
    audit.log(actor, "workspace.add", real);
    if (!active) active = real;
    return list().find((w) => same(w.path, real));
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

  function switchTo(p, actor = "ceo") { const w = find(p); active = w.path; audit.log(actor, "workspace.switch", w.path); return w; }
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

  return { list, add, remove, find, switchTo, current, resolve, MAX_READ };
}

module.exports = { createWorkspaces };
