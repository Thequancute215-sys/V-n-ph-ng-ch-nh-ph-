// Kết nối (MCP) của đội AI (CEO yêu cầu 07/11/2026): trang "Kết nối" trong văn phòng liệt kê từng kết nối, AI nào đã
// có, phòng nào dùng; thêm kết nối cho Codex (Sol, Astra) và Antigravity (Hinata). Claude có sẵn kết nối của tài khoản claude.ai.
// Chính sách CEO chọn: "đọc + làm việc, chặn gửi" — khi AI chạy toàn quyền, các kết nối gửi ra ngoài nhân danh CEO
// (email, lịch, họp, triển khai, Composio làm được mọi thứ) bị chặn; cần dùng thì AI hỏi CEO.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const err = (code, message) => Object.assign(new Error(message), { code });
const { CATALOG, CHAN_CLAUDE } = require("./ket-noi-danh-muc");
const phong = require("./mcp-phong");      // mỗi phòng chỉ bật vài kết nối đúng phần việc
const mcpMay = require("./mcp-may");        // MCP chạy trên máy: Chrome DevTools + MCP CEO duyệt thêm

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
  let cache = null, cacheAt = 0, loading = null, last = null;   // last: lần đọc gần nhất, giữ cả khi cache bị xoá
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
      loading = loading || load().then((r) => { cache = last = r; cacheAt = Date.now(); return r; }).finally(() => { loading = null; });
      await loading;
    }
    const s = cache;
    const giao = phong.read(dir);
    // Danh mục + MCP chạy trên máy CEO duyệt thêm (ctl/mcp-may.js) chưa có trong danh mục.
    const dsMay = mcpMay.tatCa(dir);
    const danhMuc = [...CATALOG, ...mcpMay.catalogMay(dir).filter((m) => !CATALOG.some((c) => c.id === m.id))];
    const rows = danhMuc.map((c) => {
      // MCP chạy trên máy: không đăng ký vào CLI, văn phòng gắn vào lượt; trạng thái = đã cài đúng bản chưa.
      if (c.may) {
        const def = dsMay.find((d) => d.id === c.id);
        const t = def ? mcpMay.trangThai(dir, def) : { daCai: false }, st = t.daCai ? (t.dungBan ? "da-cau-hinh" : "cu") : "chua-co";
        const ai = { claude: st, codex: st, agy: "khong-ho-tro" };
        const rooms = Object.keys(phong.PHONG).filter((k) => giao[k].includes(c.id));
        return { id: c.id, name: c.name, nhom: c.nhom, url: null, chan: false, note: c.note || null, web: false, app: null, may: true,
          goi: def && def.goi, repo: def && def.repo || null, phienBan: t.phienBan, canBan: t.canBan, ai, rooms, ready: Object.fromEntries(rooms.map((k) => [k, t.daCai])),
          coTheGiao: Object.keys(phong.PHONG).filter((k) => phong.hopLe(c.id, k, dir)) };
      }
      const ai = {
        // App sáng tạo: MCP chạy trên máy (vd. capcut) nối cho AI nào thì hiện ở cột AI đó.
        claude: s.claude[c.claude || c.id] || (c.claude || c.nhom === "sang-tao" ? "chua-co" : "khong-ho-tro"),
        codex: s.codex[c.id] || (c.url || c.nhom === "sang-tao" ? "chua-co" : "khong-ho-tro"),
        agy: s.agy[c.id] || (c.url || c.nhom === "sang-tao" ? "chua-co" : "khong-ho-tro"),
      };
      // Thư mục có file thật mới tính là đã cài (thư mục rỗng tạo sẵn khi cài hỏng không tính)
      const app = c.app ? c.app.map(expand).some((p) => { try { return fs.readdirSync(p).length > 0; } catch { return false; } }) : null;
      // rooms: phòng CEO giao kết nối này; ready: AI của phòng đó đã kết nối được chưa; coTheGiao: phòng có thể giao.
      const rooms = Object.keys(phong.PHONG).filter((k) => giao[k].includes(c.id));
      const ready = Object.fromEntries(rooms.map((k) => [k, /^da-/.test(ai[phong.PHONG[k]])]));
      const coTheGiao = Object.keys(phong.PHONG).filter((k) => phong.hopLe(c.id, k));
      return { id: c.id, name: c.name, nhom: c.nhom, url: c.url || null, chan: Boolean(c.chan), note: c.note || null, web: Boolean(c.web), app, ai, rooms, ready, coTheGiao };
    });
    // Kết nối riêng của máy (vd. đã tự thêm) không có trong danh mục
    const known = new Set(danhMuc.flatMap((c) => [c.claude, c.id]));
    const extra = [...Object.keys(s.claude).filter((k) => !known.has(k)).map((k) => ({ ai: "claude", name: k, state: s.claude[k] })),
      ...Object.keys(s.codex).filter((k) => !known.has(k)).map((k) => ({ ai: "codex", name: k, state: s.codex[k] })),
      ...Object.keys(s.agy).filter((k) => !known.has(k)).map((k) => ({ ai: "agy", name: k, state: s.agy[k] }))];
    return { rows, extra, errors: s.errors, checkedAt: new Date(cacheAt).toISOString(), chanClaude: CHAN_CLAUDE, phong: giao, phongAi: phong.PHONG };
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

  // Cài MCP chạy trên máy (CEO bấm Cài trên trang Kết nối): tải đúng phiên bản đã ghim, không chạy script cài.
  let dangCai = null;
  async function caiMay(id) {
    const def = mcpMay.tim(dir, id);
    if (!def) throw err("BAD_REQUEST", "Không có kết nối chạy trên máy: " + id);
    if (dangCai) throw err("TOO_MANY", "Đang cài, chờ xong đã");
    dangCai = mcpMay.cai(dir, def);
    try { const t = await dangCai; audit.log("ceo", "mcp.cai_may", id, { phienBan: t.phienBan, ok: true }); }
    catch (e) { audit.log("ceo", "mcp.cai_may", id, { ok: false }); throw e; }
    finally { dangCai = null; }
    return status();
  }

  // CEO chọn kết nối cho một phòng trên trang Kết nối.
  async function setPhong(room, ids) {
    phong.save(dir, room, ids);
    audit.log("ceo", "mcp.phong", room, { ids });
    return status();
  }

  // Tên kết nối đã đọc được của Claude và Codex: runner dùng để tắt kết nối không thuộc phòng khi chạy lượt.
  const known = () => (last ? { claude: Object.keys(last.claude), codex: Object.keys(last.codex) } : {});

  return { status, add, login, setPhong, caiMay, known, CATALOG };
}

module.exports = { createConnectors, CATALOG, CHAN_CLAUDE, parseClaude, parseCodex, parseAgy };
