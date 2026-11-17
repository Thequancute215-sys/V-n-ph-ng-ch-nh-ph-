// Kết nối (MCP) theo phòng (CEO yêu cầu 07/11/2026): kết nối là của chung văn phòng, nhưng mỗi phòng chỉ bật vài kết nối
// đúng phần việc của mình. Lượt AI chạy chỉ thấy kết nối của phòng nó: đỡ tốn token (bớt mô tả công cụ) và đỡ rủi ro
// (AI kiểm duyệt không động vào Canva, AI đặc tả không động vào Supabase…). CEO sửa trên trang Kết nối; lưu ở mcp-phong.json.
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../lib/ghi-file");
const { CATALOG } = require("./ket-noi-danh-muc");

// Phòng chạy lượt làm việc và AI của phòng. Pain (điều hành) chỉ báo cáo, chỉ đọc file: không cần kết nối.
const PHONG = { hinata: "agy", itachi: "codex", sasuke: "codex", kakashi: "agy", sakura: "claude" };
const ROLE_PHONG = (role = "") => role.startsWith("FRONTEND_") ? "kakashi" : role === "SPEC_ARCHITECT" || role.startsWith("AGY_") ? "hinata" : role.startsWith("SOL_") ? "itachi"
  : role.startsWith("CODEX_") ? "sasuke" : role.startsWith("CLAUDE_") ? "sakura" : null;
// Mặc định theo phần việc trong agent.md:
const MAC_DINH = {
  hinata: ["figma", "canva", "webflow", "notion"],          // đặc tả & UI/UX: bản thiết kế, tài liệu sản phẩm
  itachi: ["notion", "gitbook", "supabase", "cloudflare"],   // kiến trúc: tài liệu, schema DB, hạ tầng
  sasuke: ["supabase", "cloudflare", "gitbook"],              // lập trình backend: DB, hạ tầng, tài liệu API
  kakashi: ["figma", "canva", "webflow"],                     // frontend & UI/UX: dựng giao diện theo bản thiết kế
  sakura: ["notion", "gitbook", "supabase", "google-docs", "google-drive", "chrome-devtools"], // kiểm duyệt: đối chiếu tài liệu, cấu hình DB, kiểm giao diện thật
};

// Kết nối dùng được cho AI của phòng: Claude cần tên kết nối claude.ai, Codex/Antigravity cần URL MCP; nhóm gửi/triển khai thì không.
function hopLe(id, room) {
  const c = CATALOG.find((x) => x.id === id);
  const ai = PHONG[room];
  if (!c || !ai || c.chan) return false;
  if (c.nhom === "sang-tao") return true;
  if (c.may) return ai === "claude" || ai === "codex";   // MCP chạy trên máy: văn phòng tự gắn vào lượt Claude/Codex (Antigravity chạy nền chưa nạp MCP)
  return ai === "claude" ? Boolean(c.claude) : Boolean(c.url);
}

function read(dir) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(path.join(dir, "mcp-phong.json"), "utf8")) || {}; } catch {}
  const out = {};
  for (const room of Object.keys(PHONG)) out[room] = (Array.isArray(saved[room]) ? saved[room] : MAC_DINH[room]).filter((id) => hopLe(id, room));
  return out;
}

function save(dir, room, ids) {
  if (!PHONG[room]) throw Object.assign(new Error("Phòng không chạy lượt làm việc: " + room), { code: "BAD_REQUEST" });
  if (!Array.isArray(ids)) throw Object.assign(new Error("ids phải là danh sách"), { code: "BAD_REQUEST" });
  const bad = ids.filter((id) => !hopLe(String(id), room));
  if (bad.length) throw Object.assign(new Error("Phòng " + room + " không dùng được: " + bad.join(", ")), { code: "BAD_REQUEST" });
  const all = read(dir);
  all[room] = [...new Set(ids.map(String))];
  writeAtomic(path.join(dir, "mcp-phong.json"), JSON.stringify(all, null, 2));
  return all;
}

// Tên công cụ MCP của Claude: "claude.ai Google Drive" -> mcp__claude_ai_Google_Drive (khớp mọi công cụ của kết nối đó).
const claudeTool = (name) => "mcp__" + (name.startsWith("claude.ai ") ? "claude_ai_" + name.slice(10) : name).replace(/[^A-Za-z0-9_-]/g, "_");

// Cờ thêm vào lệnh của lượt `role` để chỉ bật kết nối của phòng.
// known: { claude: [tên kết nối Claude], codex: [tên server Codex] } đọc từ `mcp list` (trang Kết nối); chưa đọc thì dùng danh mục.
function argsFor(kind, role, dir, known = {}) {
  const room = ROLE_PHONG(role);
  if (!room) return { args: [], ids: [] };
  const ids = read(dir)[room];
  const on = new Set(ids);
  if (kind === "claude") {
    // Tắt mọi kết nối Claude không thuộc phòng, kể cả kết nối ngoài danh mục; nhóm gửi/triển khai đã nằm trong CHAN_CLAUDE.
    const names = new Set([...CATALOG.filter((c) => c.claude && !c.chan).map((c) => c.claude), ...(known.claude || [])]);
    const keep = new Set(CATALOG.filter((c) => on.has(c.id) || c.chan).map((c) => c.claude || c.id));
    const off = [...names].filter((n) => !keep.has(n)).map(claudeTool);
    return { args: off.length ? ["--disallowedTools", ...off] : [], ids, room };
  }
  if (kind === "codex") {
    // Codex còn có app kết nối của tài khoản ChatGPT (codex_apps: Canva, Notion, Figma…) không theo phòng: tắt hẳn, chỉ dùng MCP đã thêm.
    // Chỉ tắt server đã có trong cấu hình Codex (tắt server chưa khai báo làm Codex báo lỗi cấu hình).
    const servers = known.codex || [];
    const off = servers.filter((s) => CATALOG.some((c) => c.id === s) && !on.has(s));
    return { args: ["-c", "features.apps=false", ...off.flatMap((s) => ["-c", `mcp_servers.${s}.enabled=false`])], ids, room };
  }
  return { args: [], ids, room };   // Antigravity: chạy nền chưa nạp MCP (kiểm 07/11/2026), chỉ nhắc trong lời giao việc
}

// Câu nhắc trong lời giao việc: phòng bạn được dùng kết nối nào.
function note(role, dir) {
  const room = ROLE_PHONG(role);
  if (!room) return "";
  const ids = read(dir)[room];
  const names = ids.map((id) => (CATALOG.find((c) => c.id === id) || {}).name).filter(Boolean);
  // Chrome DevTools chạy trên máy: chỉ nhắc cách dùng khi máy đã cài (chưa cài thì lượt không có công cụ này).
  const cdt = require("./chrome-devtools");
  const them = ids.includes(cdt.ID) && cdt.trangThai(dir).daCai ? "\n" + cdt.HUONG_DAN : "";
  return "\nKết nối (MCP) dành cho phòng bạn: " + (names.length ? names.join(", ") : "không có") + ". Kết nối khác đã tắt cho lượt này; cần thì ghi vào giai_thich để CEO bật trên trang Kết nối." + them;
}

module.exports = { PHONG, MAC_DINH, ROLE_PHONG, hopLe, read, save, argsFor, note, claudeTool };
