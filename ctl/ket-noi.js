// Kết nối (MCP) của đội AI (CEO yêu cầu 07/11/2026): trang "Kết nối" trong văn phòng liệt kê từng kết nối, AI nào đã
// có, phòng nào dùng; thêm kết nối cho Codex (Sol, Astra) và Antigravity (Hinata). Claude có sẵn kết nối của tài khoản claude.ai.
// Chính sách CEO chọn: "đọc + làm việc, chặn gửi" — khi AI chạy toàn quyền, các kết nối gửi ra ngoài nhân danh CEO
// (email, lịch, họp, triển khai, Composio làm được mọi thứ) bị chặn; cần dùng thì AI hỏi CEO.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const err = (code, message) => Object.assign(new Error(message), { code });
const ROOMS = { claude: ["pain", "sakura"], codex: ["itachi", "sasuke"], agy: ["hinata"] };
// nhom: tai-lieu | thiet-ke | du-lieu | gui | trien-khai | sang-tao. url: có thì thêm được cho Codex/Antigravity (OAuth).
// claude: tên kết nối trong `claude mcp list` (tài khoản claude.ai). chan: bị chặn khi chạy toàn quyền.
const CATALOG = [
  { id: "notion", name: "Notion", nhom: "tai-lieu", claude: "claude.ai Notion", url: "https://mcp.notion.com/mcp" },
  { id: "figma", name: "Figma", nhom: "thiet-ke", claude: "claude.ai Figma", url: "https://mcp.figma.com/mcp" },
  { id: "canva", name: "Canva", nhom: "thiet-ke", claude: "claude.ai Canva", url: "https://mcp.canva.com/mcp" },
  { id: "webflow", name: "Webflow", nhom: "thiet-ke", claude: "claude.ai Webflow", url: "https://mcp.webflow.com/mcp" },
  { id: "gitbook", name: "GitBook", nhom: "tai-lieu", claude: "claude.ai GitBook MCP", url: "https://mcp.gitbook.com/mcp" },
  { id: "supabase", name: "Supabase", nhom: "du-lieu", claude: "claude.ai Supabase", url: "https://mcp.supabase.com/mcp" },
  { id: "cloudflare", name: "Cloudflare", nhom: "du-lieu", claude: "claude.ai Cloudflare Developer Platform", url: "https://bindings.mcp.cloudflare.com/mcp" },
  { id: "google-drive", name: "Google Drive", nhom: "tai-lieu", claude: "claude.ai Google Drive" },
  { id: "google-docs", name: "Google Docs", nhom: "tai-lieu", claude: "claude.ai Google Docs" },
  { id: "google-sheets", name: "Google Sheets", nhom: "du-lieu", claude: "claude.ai Google Sheets" },
  { id: "google-slides", name: "Google Slides", nhom: "tai-lieu", claude: "claude.ai Google Slides" },
  { id: "blaze-sql", name: "Blaze SQL", nhom: "du-lieu", claude: "claude.ai Blaze SQL" },
  { id: "claude-docs", name: "Claude Docs", nhom: "tai-lieu", claude: "claude.ai Claude Docs" },
  { id: "gmail", name: "Gmail", nhom: "gui", claude: "claude.ai Gmail", chan: ["mcp__claude_ai_Gmail"] },
  { id: "google-calendar", name: "Google Calendar", nhom: "gui", claude: "claude.ai Google Calendar", chan: ["mcp__claude_ai_Google_Calendar"] },
  { id: "zoom", name: "Zoom", nhom: "gui", claude: "claude.ai Zoom for Claude", chan: ["mcp__claude_ai_Zoom_for_Claude"] },
  { id: "composio", name: "Composio", nhom: "gui", claude: "claude.ai Composio", chan: ["mcp__claude_ai_Composio"] },
  { id: "vercel", name: "Vercel", nhom: "trien-khai", claude: "claude.ai Vercel", chan: ["mcp__claude_ai_Vercel"] },
  { id: "appdeploy", name: "AppDeploy", nhom: "trien-khai", claude: "claude.ai AppDeploy", chan: ["mcp__claude_ai_AppDeploy"] },
  // App sáng tạo (CEO 07/11/2026: văn phòng làm app và công cụ là chính, chỉ giữ CapCut): cài app trước, nối MCP sau.
  { id: "capcut", name: "CapCut", nhom: "sang-tao", app: ["D:/Apps/CapCut", "%LOCALAPPDATA%/CapCut"] },
];
// Notion có công cụ tạo/sửa/huỷ sự kiện lịch (gửi lời mời cho người khác): cũng chặn.
const CHAN_THEM = ["mcp__claude_ai_Notion__notion-calendar-create-events", "mcp__claude_ai_Notion__notion-calendar-update-events", "mcp__claude_ai_Notion__notion-calendar-cancel-events"];
const CHAN_CLAUDE = [...CATALOG.flatMap((c) => c.chan || []), ...CHAN_THEM];

// Đọc `claude mcp list` / `agy mcp list` (chữ) và `codex mcp list --json`.
function parseClaude(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(.+?): \S+.* - (.)\s*(.+)$/.exec(line.trim());
    if (m) out[m[1]] = /connected/i.test(m[3]) && !/needs/i.test(m[3]) ? "da-ket-noi" : /auth/i.test(m[3]) ? "can-dang-nhap" : "loi";
  }
  return out;
}
function parseCodex(text) {
  const out = {};
  try { for (const s of JSON.parse(String(text).slice(String(text).indexOf("[")))) out[s.name] = s.enabled === false ? "tat" : /not.?logged|unauth|needs/i.test(String(s.auth_status || s.auth || "")) ? "can-dang-nhap" : "da-cau-hinh"; } catch {}
  return out;
}
function parseAgy(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) { const m = /^\s*[-*•]?\s*([\w.-]+)\s*[:(\s]/.exec(line); if (m && !/^(No|Name|NAME)$/.test(m[1]) && /https?:|stdio|http/i.test(line)) out[m[1]] = "da-cau-hinh"; }
  return out;
}
const expand = (p) => p.replace(/%(\w+)%/g, (_, k) => process.env[k] || "");

function createConnectors({ runner, audit, dir, run = execFile }) {
  let cache = null, cacheAt = 0, loading = null;
  const cli = (kind) => runner.cliOf(kind);   // [chương trình, ...đối số trước lệnh con]
  const exec = (argv, timeout = 60000) => new Promise((resolve) => {
    run(argv[0], argv.slice(1), { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } }, (e, stdout, stderr) => resolve({ ok: !e, out: String(stdout || "") + String(stderr || ""), error: e && e.message }));
  });

  async function load() {
    const [c, x, a] = await Promise.all([exec([...cli("claude"), "mcp", "list"], 90000), exec([...cli("codex"), "mcp", "list", "--json"]), exec([...cli("agy"), "mcp", "list"])]);
    return { claude: parseClaude(c.out), codex: parseCodex(x.out), agy: parseAgy(a.out), errors: { claude: c.ok ? null : c.error, codex: x.ok ? null : x.error, agy: a.ok ? null : a.error } };
  }

  async function status({ fresh = false } = {}) {
    if (fresh || !cache || Date.now() - cacheAt > 5 * 60 * 1000) {
      loading = loading || load().then((r) => { cache = r; cacheAt = Date.now(); return r; }).finally(() => { loading = null; });
      await loading;
    }
    const s = cache;
    const rows = CATALOG.map((c) => {
      const ai = {
        // App sáng tạo: MCP chạy trên máy (vd. capcut) nối cho AI nào thì hiện ở cột AI đó.
        claude: s.claude[c.claude || c.id] || (c.claude || c.nhom === "sang-tao" ? "chua-co" : "khong-ho-tro"),
        codex: s.codex[c.id] || (c.url || c.nhom === "sang-tao" ? "chua-co" : "khong-ho-tro"),
        agy: s.agy[c.id] || (c.url || c.nhom === "sang-tao" ? "chua-co" : "khong-ho-tro"),
      };
      // Thư mục có file thật mới tính là đã cài (thư mục rỗng tạo sẵn khi cài hỏng không tính)
      const app = c.app ? c.app.map(expand).some((p) => { try { return fs.readdirSync(p).length > 0; } catch { return false; } }) : null;
      const rooms = Object.entries(ai).filter(([, v]) => /da-/.test(v)).flatMap(([k]) => ROOMS[k]);
      return { id: c.id, name: c.name, nhom: c.nhom, url: c.url || null, chan: Boolean(c.chan), note: c.note || null, web: Boolean(c.web), app, ai, rooms: c.chan ? [] : rooms };
    });
    // Kết nối riêng của máy (vd. đã tự thêm) không có trong danh mục
    const known = new Set(CATALOG.flatMap((c) => [c.claude, c.id]));
    const extra = [...Object.keys(s.claude).filter((k) => !known.has(k)).map((k) => ({ ai: "claude", name: k, state: s.claude[k] })),
      ...Object.keys(s.codex).filter((k) => !known.has(k)).map((k) => ({ ai: "codex", name: k, state: s.codex[k] })),
      ...Object.keys(s.agy).filter((k) => !known.has(k)).map((k) => ({ ai: "agy", name: k, state: s.agy[k] }))];
    return { rows, extra, errors: s.errors, checkedAt: new Date(cacheAt).toISOString(), chanClaude: CHAN_CLAUDE };
  }

  // Thêm kết nối cho Codex hoặc Antigravity. Kết nối nhóm gửi/triển khai không thêm cho các AI chạy toàn quyền.
  async function add(id, ai) {
    const c = CATALOG.find((x) => x.id === id);
    if (c && c.chan) throw err("COMMAND_DENIED", c.name + " thuộc nhóm gửi/triển khai: CEO đã chọn chặn với AI chạy toàn quyền.");
    if (!c || !c.url) throw err("BAD_REQUEST", "Kết nối này không thêm được cho Codex/Antigravity: " + id);
    if (!["codex", "agy"].includes(ai)) throw err("BAD_REQUEST", "Chỉ thêm cho codex hoặc agy");
    const argv = ai === "codex" ? [...cli("codex"), "mcp", "add", c.id, "--url", c.url] : [...cli("agy"), "mcp", "add", c.id, c.url];
    const r = await exec(argv, 30000);
    audit.log("ceo", "mcp.add", c.id, { ai, ok: r.ok });
    // Codex tự chuyển sang đăng nhập OAuth ngay khi thêm (Notion, Figma…) và chờ CEO bấm trong trình duyệt: cấu hình đã ghi,
    // hết giờ chờ thì coi là đã thêm, trang hiện "Cần đăng nhập" để CEO bấm Đăng nhập Codex lúc tiện.
    if (!r.ok && !(ai === "codex" && /OAuth|Authorize/i.test(r.out))) throw err("BAD_REQUEST", "Thêm " + c.name + " cho " + ai + " lỗi: " + (r.out || r.error).slice(-400));
    cache = null;
    return status();
  }

  // Codex đăng nhập kết nối bằng OAuth: mở trình duyệt để CEO tự bấm cho phép (văn phòng không giữ mật khẩu).
  async function login(id) {
    const c = CATALOG.find((x) => x.id === id && x.url);
    if (!c) throw err("BAD_REQUEST", "Không có kết nối " + id);
    const r = await exec([...cli("codex"), "mcp", "login", c.id], 5 * 60 * 1000);
    audit.log("ceo", "mcp.login", c.id, { ok: r.ok });
    if (!r.ok) throw err("BAD_REQUEST", "Đăng nhập " + c.name + " cho Codex chưa xong: " + (r.out || r.error).slice(-400));
    cache = null;
    return status();
  }

  return { status, add, login, CATALOG };
}

module.exports = { createConnectors, CATALOG, CHAN_CLAUDE, parseClaude, parseCodex, parseAgy };
