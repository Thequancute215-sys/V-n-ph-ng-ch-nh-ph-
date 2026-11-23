// Rà file chữ mà AI sẽ đọc (README, *.md, AGENTS.md, CLAUDE.md, .cursorrules…) trước khi cho AI chạy TOÀN QUYỀN trên máy
// (CEO chọn 03/11/2026). Có câu nhắm vào AI, lệnh tải-và-chạy, lệnh phá hoại, đụng file khóa, gửi dữ liệu ra ngoài,
// chỉ dẫn giấu trong chú thích HTML hay ký tự ẩn thì chặn chạy và báo CEO; CEO xem và duyệt thì chạy bình thường.
// Duyệt gắn với "dấu vân tay" của các điểm bất thường: file đổi thêm điểm mới thì phải duyệt lại.
// Chỉ dùng quy tắc so mẫu (không gọi AI): không tốn hạn mức, kết quả lặp lại được; có thể báo nhầm, CEO là người quyết.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { maskSecrets } = require("../lib/mask");
const { writeAtomic } = require("../lib/ghi-file");

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "env", "__pycache__", "dist", "build", ".next", ".nuxt", "vendor", "target", ".tox", ".mypy_cache", ".pytest_cache", "coverage", "site-packages"]);
const TEXT_FILE = /(\.(md|mdx|mdc|markdown|prompt)|^\.(cursorrules|windsurfrules|clinerules))$/i;
const MAX_FILES = 500, MAX_BYTES = 1024 * 1024;

// [mã, tên tiếng Việt, mẫu]. Mẫu chạy trên từng dòng.
const RULES = [
  ["prompt", "Câu nhắm vào AI (đòi bỏ qua chỉ dẫn / đổi vai)", /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier|system|existing)\s+(instructions?|prompts?|rules?|guidelines?)|(bỏ qua|phớt lờ|quên|bỏ hết)\s+(mọi|tất cả|các|hết)?\s*(chỉ dẫn|hướng dẫn|lệnh|quy tắc|luật)\s*(trước|ở trên|cũ|hệ thống)|\byou are now (a|an|the)\b|\bnew system prompt\b|\bjailbreak\b|\bDAN mode\b/i],
  ["prompt", "Câu ra lệnh cho AI chạy / tải / gửi / xoá", /\b(AI|LLM|assistants?|agents?|claude|codex|copilot|gpt|gemini|antigravity)\b.{0,50}\b(must|should|need to|have to|phải|hãy|cần)\b.{0,80}(\b(run|execute)\s+(this|the following|these|a|the)?\s*(command|script|code|shell)|\bchạy\s+(lệnh|câu lệnh|đoạn lệnh|script|đoạn mã)|\b(curl|wget|download|tải về)\b|\b(send|upload|post|gửi|tải lên)\b.{0,40}\b(to|tới|lên|cho)\s+(https?:|server|máy chủ|địa chỉ)|\b(delete|xoá|xóa)\s+(all|every|tất cả|toàn bộ|mọi)|\bgit\s+push)/i],
  ["exec", "Tải mã từ mạng rồi chạy ngay", /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|Invoke-Expression|python3?|node|pwsh|powershell)\b|\b(iex|Invoke-Expression)\s*[(\s]\s*[(\s]*(iwr|irm|New-Object|Invoke-WebRequest|Invoke-RestMethod|\[)|powershell[^\n]*\s-(e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{20,}/i],
  ["destroy", "Lệnh phá hoại / không hoàn tác được", /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(--no-preserve-root\s+)?(\/|~|\$HOME|\/\*|\*)(\s|$)|\b(del|erase)\s+\/[sq]\b.*\b[a-z]:\\|\b(rd|rmdir)\s+\/s\b.*\b[a-z]:\\|\bformat\s+[a-z]:|\bgit\s+push\s+(\S+\s+)*(--force\b|-f\b)|\bnpm\s+publish\b|\bmkfs\.|\bdd\s+if=.*of=\/dev\//i],
  ["secret", "Đọc / gửi file khóa, tài khoản", /\b(cat|type|đọc|read|gửi|send|upload|post|copy|cp|in ra|print|exfiltrate)\b.{0,60}(id_rsa|id_ed25519|\.ssh\/|auth\.json|\.credentials\.json|keys\.json|\.aws\/credentials|wallet\.dat|Login Data|Cookies|\.npmrc|\.pypirc|\.git-credentials)/i],
  ["exfil", "Địa chỉ hay dùng để lấy trộm dữ liệu", /\b(webhook\.site|requestbin|pipedream\.net|ngrok\.io|ngrok-free\.app|discord(app)?\.com\/api\/webhooks|pastebin\.com\/raw|transfer\.sh|interact\.sh|oast\.(fun|pro|live|site)|burpcollaborator|canarytokens)\b/i],
  ["hidden", "Ký tự ẩn / đảo chiều chữ (giấu nội dung khỏi mắt người)", /[​-‍⁠‪-‮⁦-⁩­]/],
  ["blob", "Khối chữ mã hoá dài (có thể giấu lệnh)", /(?<!base64,)(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{240,}={0,2}/],
];
// Chú thích HTML (không hiện khi xem README) có nhắc tới AI hoặc ra lệnh.
const COMMENT = /<!--([\s\S]*?)-->/g;
const COMMENT_AI = /\b(AI|LLM|assistant|agent|claude|codex|gpt|gemini|copilot|instruction|prompt|chỉ dẫn|hãy|must|ignore|execute|run)\b/i;

function listFiles(root) {
  const files = [];
  let truncated = false;
  function walk(dir, depth) {
    if (depth > 8) { truncated = true; return; }
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { truncated = true; return; }
    for (const entry of items) {
      if (entry.isSymbolicLink()) {
        if (TEXT_FILE.test(entry.name)) truncated = true;
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full, depth + 1);
      } else if (entry.isFile() && TEXT_FILE.test(entry.name) && !(dir === root && entry.name === "agent.md")) {
        if (files.length >= MAX_FILES) { truncated = true; return; }
        files.push(full);
      }
    }
  }
  walk(root, 0);
  return { files, truncated };
}

function scanText(text, rel) {
  const found = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [kind, name, re] of RULES) {
      if (kind === "hidden" && i === 0 && line.indexOf("﻿") === 0 && !re.test(line.slice(1))) continue;
      const m = re.exec(line);
      if (m) found.push({ file: rel, line: i + 1, kind, name, text: maskSecrets(line.trim()).replace(/[​-‍⁠‪-‮⁦-⁩­]/g, "⟨ký tự ẩn⟩").slice(0, 240) });
    }
  });
  for (const m of text.matchAll(COMMENT)) {
    if (!COMMENT_AI.test(m[1])) continue;
    const line = text.slice(0, m.index).split(/\r?\n/).length;
    found.push({ file: rel, line, kind: "comment", name: "Chỉ dẫn giấu trong chú thích HTML (không hiện khi xem README)", text: maskSecrets(m[0].replace(/\s+/g, " ")).slice(0, 240) });
  }
  return found;
}

// ---- Thư viện ngoài (CEO yêu cầu 03/11/2026): nguồn lạ, tên nhái thư viện nổi tiếng, script tự chạy khi cài ----
const POPULAR = {
  npm: ["react", "react-dom", "express", "lodash", "axios", "chalk", "commander", "debug", "moment", "request", "vue", "next", "typescript", "webpack", "vite", "eslint", "prettier", "jest", "mocha", "dotenv", "cross-env", "colors", "uuid", "yargs", "fs-extra", "body-parser", "cors", "jsonwebtoken", "bcrypt", "mongoose", "socket.io", "electron", "puppeteer", "playwright", "three", "node-fetch", "ws", "rimraf", "glob", "minimist", "semver", "nodemon", "esbuild", "rollup", "tailwindcss", "zod", "dayjs", "classnames", "redux", "jquery", "bootstrap", "underscore", "async", "coffee-script", "babel-cli", "event-stream"],
  pypi: ["requests", "numpy", "pandas", "flask", "django", "urllib3", "setuptools", "pip", "scipy", "matplotlib", "pillow", "boto3", "selenium", "playwright", "beautifulsoup4", "pyyaml", "cryptography", "pytest", "fastapi", "uvicorn", "sqlalchemy", "httpx", "aiohttp", "openai", "anthropic", "tensorflow", "torch", "colorama", "python-dateutil", "jinja2", "pydantic", "click", "rich", "websockets", "pywin32", "psutil", "lxml", "certifi", "idna", "charset-normalizer", "google-generativeai", "pyinstaller"],
};
const norm = (n) => String(n).toLowerCase().replace(/[-_.]+/g, "-");
// Khoảng cách sửa đổi (có tính đảo hai ký tự kề nhau) giữa hai tên; chỉ cần biết có bằng 1 hay không.
function near(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length] === 1;
}
const lookalike = (name, list) => { const n = norm(name); return list.includes(n) ? null : list.find((p) => near(n, p)) || null; };
const RISKY_SCRIPT = /\b(curl|wget|Invoke-WebRequest|iwr|irm|Invoke-Expression|iex|powershell|pwsh|base64|eval|bash\s+-c|sh\s+-c|node\s+-e|python3?\s+-c)\b|\|\s*(sh|bash)\b|https?:\/\//i;
const NON_REGISTRY = /^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:|link:)|^[\w.-]+\/[\w.-]+(#.*)?$/i;

function depFiles(root) {
  const files = [];
  let truncated = false;
  const manifest = /^(package\.json|package-lock\.json|pyproject\.toml|requirements[\w.-]*\.(txt|in|lock))$/i;
  const walk = (dir, depth) => {
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { truncated = true; return; }
    for (const d of items) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (depth < 3 && !SKIP_DIRS.has(d.name)) walk(full, depth + 1);
      } else if (manifest.test(d.name)) {
        if (!d.isFile() || files.length >= 50) { truncated = true; continue; }
        files.push(full);
      }
    }
  };
  walk(root, 0);
  return { files, truncated };
}

function scanDependencyFiles(root) {
  let { files, truncated } = depFiles(root);
  const found = [];
  const add = (file, line, kind, name, text) => found.push({ file, line, kind, name, text: maskSecrets(String(text)).slice(0, 240) });
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, "/"), base = path.basename(f).toLowerCase();
    let text;
    try {
      if (fs.statSync(f).size > 20 * MAX_BYTES) { truncated = true; continue; }
      text = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
    } catch { truncated = true; continue; }
    const lineOf = (needle) => Math.max(1, text.split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1);
    if (base === "package.json") {
      let pkg; try { pkg = JSON.parse(text); } catch { truncated = true; continue; }
      if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) { truncated = true; continue; }
      for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        for (const [name, spec] of Object.entries(pkg[group] || {})) {
          if (typeof spec === "string" && NON_REGISTRY.test(spec.trim()) && !/^workspace:/.test(spec)) add(rel, lineOf(`"${name}"`), "dep-source", "Thư viện lấy từ nguồn ngoài kho npm chuẩn", `${name}: ${spec}`);
          const like = lookalike(name, POPULAR.npm);
          if (like) add(rel, lineOf(`"${name}"`), "dep-name", `Tên thư viện gần giống "${like}" (có thể là hàng nhái)`, `${name}: ${spec}`);
        }
      }
      for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish"]) {
        const cmd = pkg.scripts && pkg.scripts[hook];
        if (typeof cmd === "string" && RISKY_SCRIPT.test(cmd)) add(rel, lineOf(`"${hook}"`), "dep-script", "Script tự chạy khi cài có lệnh tải mạng / chạy mã", `${hook}: ${cmd}`);
      }
    } else if (base === "package-lock.json") {
      let lock; try { lock = JSON.parse(text); } catch { truncated = true; continue; }
      if (!lock || typeof lock !== "object" || Array.isArray(lock)) { truncated = true; continue; }
      const odd = [], scripts = [];
      for (const [p, info] of Object.entries(lock.packages || {})) {
        if (!p || !info || info.link) continue;
        const name = p.replace(/^.*node_modules\//, "");
        if (info.resolved && !/^https:\/\/registry\.npmjs\.org\//.test(info.resolved)) odd.push(`${name} ← ${info.resolved}`);
        if (info.hasInstallScript) scripts.push(name);
      }
      if (odd.length) add(rel, 1, "dep-source", `${odd.length} thư viện tải từ ngoài registry.npmjs.org`, odd.slice(0, 8).join("; "));
      if (scripts.length) add(rel, 1, "dep-script", `${scripts.length} thư viện chạy script khi cài (thường gặp ở thư viện build như esbuild; xem có tên lạ không)`, scripts.slice(0, 15).join(", "));
    } else {
      text.split(/\r?\n/).forEach((l, i) => {
        const line = l.trim();
        if (!line || line.startsWith("#")) return;
        if (/(^|\s)(--extra-index-url|--index-url|-i\s|--trusted-host|--find-links|-f\s)|git\+|https?:\/\/\S+\.(whl|zip|tar\.gz)|@\s*https?:\/\//i.test(line)) add(rel, i + 1, "dep-source", "Thư viện / kho cài đặt ngoài PyPI chuẩn", line);
        const m = base.endsWith(".toml") ? /^"?([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(==|>=|<=|~=|>|<|!=|;|"|$)/.exec(line.replace(/^dependencies\s*=\s*\[/, "")) : /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(line);
        const like = m && lookalike(m[1], POPULAR.pypi);
        if (like) add(rel, i + 1, "dep-name", `Tên thư viện gần giống "${like}" (có thể là hàng nhái)`, line);
      });
    }
  }
  return { findings: found, truncated };
}

function scanDeps(root) { return scanDependencyFiles(root).findings; }

function scan(root) {
  let { files, truncated } = listFiles(root);
  const findings = [];
  for (const f of files) {
    let text;
    try {
      const st = fs.statSync(f);
      if (st.size > MAX_BYTES) {
        truncated = true;
        findings.push({ file: path.relative(root, f).replace(/\\/g, "/"), line: 0,
          kind: "big", name: "File chữ quá lớn, không rà hết được", text: Math.round(st.size / 1024) + " KB" });
        continue;
      }
      text = fs.readFileSync(f, "utf8");
    } catch { truncated = true; continue; }
    findings.push(...scanText(text, path.relative(root, f).replace(/\\/g, "/")));
  }
  const deps = scanDependencyFiles(root);
  truncated ||= deps.truncated;
  for (const f of deps.findings) findings.push(f);
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  // Dấu vân tay không theo số dòng: thêm dòng phía trên không bắt duyệt lại, đổi nội dung bất thường thì có.
  const fingerprint = findings.length ? crypto.createHash("sha256").update(findings.map((x) => x.file + "|" + x.kind + "|" + x.text).sort().join("\n")).digest("hex").slice(0, 16) : null;
  return { files: files.length, truncated, findings: findings.slice(0, 200), total: findings.length, fingerprint };
}

const err = (code, message) => Object.assign(new Error(message), { code });

// Lưu lần CEO duyệt theo dự án; báo CEO (thông báo máy) mỗi dấu vân tay một lần.
function createScanner({ dir, audit, notify = () => {} }) {
  const file = path.join(dir, "ra-soat.json");
  let approvals = {};
  try { approvals = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const save = () => writeAtomic(file, JSON.stringify(approvals));
  const told = new Set(), cache = new Map();
  const key = (root) => (process.platform === "win32" ? root.toLowerCase() : root);

  const incomplete = "Rà soát chưa đọc được toàn bộ phạm vi. Chọn mức quyền thấp hơn hoặc xử lý phần chưa quét trước khi bật Toàn quyền.";

  function status(root, { fresh = true } = {}) {
    const hit = cache.get(key(root));
    const r = !fresh && hit && Date.now() - hit.at < 30000 ? hit.r : scan(root);
    cache.set(key(root), { at: Date.now(), r });
    const a = approvals[key(root)];
    const approved = !r.truncated && (!r.fingerprint || Boolean(a && a.fingerprint === r.fingerprint));
    if (!approved && !told.has(root + r.fingerprint)) {
      told.add(root + r.fingerprint);
      audit.log("ctl", "scan.flag", root, { total: r.total, fingerprint: r.fingerprint });
      try { notify("Văn phòng AI · " + path.basename(root), r.truncated ? incomplete : `Phát hiện ${r.total} điểm bất thường trong file .md: AI chưa được chạy toàn quyền. Anh xem và duyệt ở mục Việc chờ anh duyệt.`); } catch {}
    }
    return { ...r, approved, approvedAt: approved && a ? a.at : null };
  }
  // Chặn chạy toàn quyền khi còn điểm bất thường chưa duyệt.
  function require(root) {
    const s = status(root);
    if (s.truncated) throw Object.assign(err("NEEDS_SCAN_APPROVAL", incomplete), { scan: s });
    if (!s.approved) throw Object.assign(err("NEEDS_SCAN_APPROVAL", `Phát hiện ${s.total} điểm bất thường trong file .md của dự án (ví dụ ${s.findings[0].file}:${s.findings[0].line} — ${s.findings[0].name}). AI chưa được chạy toàn quyền: anh xem và duyệt ở mục "Việc chờ anh duyệt".`), { scan: s });
    return s;
  }
  function approve(root, fingerprint, actor = "ceo") {
    const s = scan(root);
    if (s.truncated) throw Object.assign(err("NEEDS_SCAN_APPROVAL", incomplete), { scan: s });
    if (!s.fingerprint) return { approved: true, ...s };
    if (fingerprint !== s.fingerprint) throw err("CHANGED", "File .md đã đổi sau khi anh xem: tải lại danh sách bất thường rồi duyệt lại.");
    approvals[key(root)] = { fingerprint, at: Date.now(), total: s.total };
    save();
    audit.log(actor, "scan.approve", root, { fingerprint, total: s.total }, "approved");
    return { approved: true, ...s };
  }
  return { status, require, approve };
}

module.exports = { scan, scanText, scanDeps, near, createScanner, RULES };
