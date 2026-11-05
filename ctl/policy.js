// Chính sách chạy lệnh (Kiến trúc A, Vùng [3] agent.md):
//  - "allow":   chạy ngay (đọc trạng thái, test, commit cục bộ…).
//  - "approve": CEO phải bấm duyệt lần hai mới chạy (mọi thứ ngoài danh sách, lệnh đẩy ra ngoài, lệnh xóa không lấy lại được).
//  - "deny":    không bao giờ chạy qua ctl (shell, trình thông dịch tùy ý).
// Lưu ý thật: lệnh "allow" như `npm test` vẫn chạy script trong dự án, nên ranh giới thật là: chỉ trong workspace đã đăng ký +
// nhật ký kiểm toán + Kill-Switch + CEO duyệt mọi thứ khác. Danh sách này chặn lệnh phá hoại phổ biến, không phải hộp cát.
"use strict";
const fs = require("fs");
const path = require("path");

const SHELLS = /^(cmd|powershell|pwsh|bash|sh|zsh|fish|wsl|perl|ruby|cscript|wscript|mshta|rundll32|regsvr32|reg|certutil|bitsadmin)(\.exe)?$/i;
const PYTHON = /^(python\d*(\.\d+)?|py)$/i;
// Script nằm trong workspace: đường dẫn tương đối, không "..", không ổ đĩa / UNC (cwd của việc luôn là gốc workspace).
const inWorkspace = (p) => !!p && !/^([a-z]:|[\\/])/i.test(p) && !String(p).split(/[\\/]/).includes("..");

const GIT_ALLOW = new Set(["status", "diff", "log", "show", "fetch", "add", "commit", "stash", "blame", "rev-parse", "ls-files", "remote", "tag", "switch"]);
const GIT_DANGER = [
  (a) => a[0] === "push",                                                   // đẩy ra GitHub: ra ngoài máy
  (a) => a[0] === "reset" && a.includes("--hard"),
  (a) => a[0] === "clean",
  (a) => a[0] === "checkout" && a.includes("--"),                           // bỏ thay đổi chưa commit
  (a) => a[0] === "branch" && a.some((x) => /^-(d|D|-delete|f|-force)$/.test(x)),
  (a) => a[0] === "stash" && ["drop", "clear"].includes(a[1]),
  (a) => a[0] === "remote" && a.length > 1 && a[1] !== "-v" && a[1] !== "show",
  (a) => a[0] === "tag" && a.length > 1,
  (a) => a.some((x) => /^--?(force|exec|upload-pack|receive-pack)/.test(x) || /^-c$/.test(x)),
  // Thoát khỏi workspace: -C <thư mục khác>, --git-dir/--work-tree; --output ghi file ra bất kỳ đâu (git log/diff --output=…).
  (a) => a.some((x) => /^-C/.test(x) || /^--(git-dir|work-tree|namespace|output|config-env)/.test(x)),
  (a) => a[0] === "rebase" || a[0] === "filter-branch" || a[0] === "gc",
];
const GH_ALLOW = [/^(pr|issue) (list|view|status|diff|checks)$/, /^repo (list|view)$/, /^run (list|view)$/, /^auth status$/];
const NPM_ALLOW = new Set(["test", "t", "ci", "ls", "outdated", "audit"]);

// path.win32.basename tách được cả "\\" lẫn "/", nên "C:\\Windows\\System32\\cmd.exe" luôn nhận ra là cmd dù ctl chạy trên hệ nào.
const base = (p) => path.win32.basename(String(p)).replace(/\.(exe|cmd|bat|com)$/i, "").toLowerCase();

function classify(argv) {
  if (!Array.isArray(argv) || !argv.length || !argv.every((a) => typeof a === "string" && a.length < 8000 && !a.includes("\0")))
    return { decision: "deny", reason: "argv phải là mảng chuỗi hợp lệ" };
  const prog = base(argv[0]), a = argv.slice(1);
  if (SHELLS.test(prog)) return { decision: "deny", reason: prog + " là shell/trình thông dịch: không chạy qua ctl" };
  if (prog === "git") {
    if (!a.length) return { decision: "allow", reason: "git" };
    if (GIT_DANGER.some((f) => f(a))) return { decision: "approve", reason: "git " + a[0] + ": thao tác đẩy ra ngoài hoặc không lấy lại được" };
    if (a[0] === "pull") return a.includes("--ff-only") ? { decision: "allow", reason: "git pull --ff-only" } : { decision: "approve", reason: "git pull không --ff-only có thể tạo merge" };
    if (a[0] === "branch" || GIT_ALLOW.has(a[0])) return { decision: "allow", reason: "git " + a[0] };
    return { decision: "approve", reason: "git " + a[0] + " ngoài danh sách" };
  }
  if (prog === "npm") {
    if (NPM_ALLOW.has(a[0])) return { decision: "allow", reason: "npm " + a[0] };
    if (a[0] === "run" && a[1] && !a.slice(2).some((x) => x.startsWith("--") && x !== "--")) return { decision: "allow", reason: "npm run " + a[1] };
    return { decision: "approve", reason: "npm " + (a[0] || "") + " (cài gói, publish…) cần duyệt" };
  }
  if (prog === "node") {
    if (a[0] === "--test" || a[0] === "--version" || a[0] === "-v") return { decision: "allow", reason: "node " + a[0] };
    if (a[0] && /\.(c|m)?js$/i.test(a[0]) && inWorkspace(a[0])) return { decision: "allow", reason: "chạy script node trong workspace: " + a[0] };
    return { decision: "approve", reason: "node chạy mã tùy ý cần duyệt" };
  }
  if (PYTHON.test(prog)) {
    if (!a.length) return { decision: "deny", reason: "python không đối số là shell tương tác: không chạy qua ctl" };
    // Chỉ xét cờ đứng TRƯỚC script/module; đối số sau script là của script. -c (chuỗi mã) và -i (tương tác) bị chặn kể cả gộp như -ic.
    let i = 0;
    for (; i < a.length && a[i].startsWith("-") && a[i] !== "-m"; i++)
      if (/^-[^-]*[ci]/.test(a[i]) || /^--(command|interactive)/.test(a[i])) return { decision: "deny", reason: "python " + a[i] + " (chạy chuỗi mã / tương tác) bị chặn" };
    if (a[i] === "-m") return ["pytest", "unittest"].includes(a[i + 1]) ? { decision: "allow", reason: "python -m " + a[i + 1] + " (kiểm thử)" } : { decision: "approve", reason: "python -m " + (a[i + 1] || "") + " cần duyệt" };
    if (i === 0 && a[0] && /\.pyw?$/i.test(a[0]) && inWorkspace(a[0])) return { decision: "allow", reason: "chạy script python trong workspace: " + a[0] };
    return { decision: "approve", reason: "lệnh python ngoài danh sách cần duyệt" };
  }
  if (prog === "pytest" || prog === "py.test") return { decision: "allow", reason: "pytest (kiểm thử)" };
  if (prog === "cargo" && ["test", "build", "check", "fmt", "clippy"].includes(a[0])) return { decision: "allow", reason: "cargo " + a[0] };
  if (prog === "go" && ["test", "build", "vet", "fmt"].includes(a[0])) return { decision: "allow", reason: "go " + a[0] };
  if (prog === "docker") {
    // Đọc trạng thái và build trên máy: chạy ngay. Đẩy image, đăng nhập kho, chạy/xoá container: CEO duyệt (xuất bản dùng nút riêng ctl/xuat-ban.js).
    if (["version", "info", "images", "ps", "build"].includes(a[0]) || (a[0] === "compose" && ["build", "config", "ps"].includes(a[1]))) return { decision: "allow", reason: "docker " + a.slice(0, a[0] === "compose" ? 2 : 1).join(" ") };
    return { decision: "approve", reason: "docker " + (a[0] || "") + " (đẩy image, đăng nhập, chạy/xoá container) cần duyệt" };
  }
  if (prog === "gh") {
    const sub = a.slice(0, 2).join(" ");
    if (GH_ALLOW.some((r) => r.test(sub))) return { decision: "allow", reason: "gh " + sub + " (chỉ đọc)" };
    return { decision: "approve", reason: "gh " + sub + " có thể ghi lên GitHub" };
  }
  return { decision: "approve", reason: prog + " ngoài danh sách cho phép" };
}

// Tìm chương trình để chạy KHÔNG qua shell. Windows: .exe dùng thẳng; .cmd (npm, claude/codex cài bằng npm) thì đọc file .cmd
// lấy đường dẫn .js và chạy bằng node, vì Node cấm spawn .cmd khi shell:false (và chạy qua cmd.exe thì chèn lệnh được).
function resolveProgram(name, env = process.env) {
  const win = process.platform === "win32";
  if (base(name) === "npm") {
    const roots = [path.dirname(process.execPath), path.join(path.dirname(process.execPath), "..", "lib")];
    for (const r of roots) { const js = path.join(r, "node_modules", "npm", "bin", "npm-cli.js"); if (fs.existsSync(js)) return [process.execPath, js]; }
  }
  if (base(name) === "node") return [process.execPath];
  if (path.isAbsolute(name)) return fromFile(name);
  const exts = win ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.toLowerCase()) : [""];
  for (const dir of String(env.PATH || env.Path || "").split(path.delimiter).filter(Boolean)) {
    for (const ext of win && path.extname(name) ? [""] : exts) {
      const f = path.join(dir, name + ext);
      try { if (fs.statSync(f).isFile()) return fromFile(f); }
      catch (e) {
        // Windows: python/winget cài từ Microsoft Store là "App Execution Alias" trong WindowsApps; statSync báo EACCES
        // nhưng lstat đọc được và spawn chạy được bình thường.
        if (win && e.code === "EACCES" && /\.exe$/i.test(f)) { try { fs.lstatSync(f); return [f]; } catch {} }
      }
    }
  }
  throw new Error("Không tìm thấy chương trình " + name + " trong PATH");

  function fromFile(f) {
    if (!/\.(cmd|bat)$/i.test(f)) return [f];
    const txt = fs.readFileSync(f, "utf8");
    const m = /"%~?dp0%?\\([^"]+\.(?:c?js|mjs))"/i.exec(txt);
    if (!m) throw new Error(path.basename(f) + " là file .cmd không chạy an toàn được nếu không qua shell");
    return [process.execPath, path.join(path.dirname(f), m[1])];
  }
}

module.exports = { classify, resolveProgram };
