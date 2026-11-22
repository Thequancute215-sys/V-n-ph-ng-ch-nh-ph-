// MCP chạy trên máy (CEO 17/11/2026): máy chủ MCP cài từ npm vào thư mục dữ liệu văn phòng (~/.van-phong-ao/mcp/<id>),
// GHIM phiên bản, không chạy script cài, chạy bằng node + file của gói (không npx). Văn phòng chỉ gắn vào lượt Claude/Codex
// của phòng được bật trên trang Kết nối (ctl/runner.js) — không đăng ký chung vào cấu hình CLI của máy.
// Hai nguồn: Chrome DevTools (có sẵn, ctl/chrome-devtools.js) và MCP CEO duyệt từ trang Repo & Skill (mcp-them.json,
// ctl/skill-duyet.js). Antigravity chạy nền chưa nạp MCP nên chỉ phòng Claude/Codex dùng được.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const GOI_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]{0,100}$/;
const BAN_RE = /^\d+\.\d+\.\d+$/;           // chỉ bản phát hành chính thức (không -beta, không dải phiên bản)
const ARG_RE = /^[A-Za-z0-9@._:\/=+,-]{1,120}$/;
const err = (code, message) => Object.assign(new Error(message), { code });
const fileThem = (dir) => path.join(dir, "mcp-them.json");

// Định nghĩa hợp lệ: { id, name, goi, phienBan, args[], bin?, huongDan?, note?, repo?, commit?, them? }
function kiemDef(d) {
  if (!d || !ID_RE.test(d.id)) throw err("BAD_CATALOG", "id MCP không hợp lệ: " + (d && d.id));
  if (!GOI_RE.test(String(d.goi || ""))) throw err("BAD_CATALOG", "tên gói npm không hợp lệ: " + d.goi);
  if (!BAN_RE.test(String(d.phienBan || ""))) throw err("BAD_CATALOG", "phiên bản phải là x.y.z: " + d.id);
  if (!Array.isArray(d.args) || d.args.length > 30 || !d.args.every((a) => typeof a === "string" && ARG_RE.test(a))) throw err("BAD_CATALOG", "đối số chạy không hợp lệ: " + d.id);
  if (d.bin !== undefined && !/^[a-z0-9@._\/-]{1,120}$/i.test(d.bin)) throw err("BAD_CATALOG", "bin không hợp lệ: " + d.id);
  return d;
}
const thuMuc = (dir, def) => path.join(dir, "mcp", def.id);
const goiDir = (dir, def) => path.join(thuMuc(dir, def), "node_modules", ...def.goi.split("/"));

// MCP CEO đã duyệt thêm trên máy này. Mục hỏng thì bỏ qua, không làm hỏng văn phòng.
function danhSachThem(dir) {
  let ds = [];
  try { ds = JSON.parse(fs.readFileSync(fileThem(dir), "utf8")).mcp || []; } catch {}
  return ds.filter((d) => { try { kiemDef(d); return true; } catch { return false; } });
}
// Tất cả MCP chạy trên máy: có sẵn (Chrome DevTools) + CEO duyệt. Trùng id thì bản có sẵn thắng.
function tatCa(dir) {
  const goc = [require("./chrome-devtools").DEF];
  return [...goc, ...danhSachThem(dir).filter((d) => !goc.some((g) => g.id === d.id))];
}
const tim = (dir, id) => tatCa(dir).find((d) => d.id === id) || null;

function themMcp(dir, def) {
  kiemDef(def);
  if (def.id === require("./chrome-devtools").ID) throw err("SKILL_DA_CO", "Trùng tên với MCP có sẵn: " + def.id);
  let d = { mcp: [] };
  try { d = JSON.parse(fs.readFileSync(fileThem(dir), "utf8")); if (!Array.isArray(d.mcp)) d.mcp = []; } catch {}
  d.ghi_chu = "MCP CEO duyệt thêm trên máy này (trang Repo & Skill). Mỗi mục ghim gói npm + phiên bản; văn phòng cài vào mcp/<id>, không chạy script cài.";
  d.mcp = d.mcp.filter((x) => x && x.id !== def.id).concat(def);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fileThem(dir), JSON.stringify(d, null, 2));
  return def;
}

// Bản đang cài: đọc package.json của gói, tìm file chạy (bin, chỉ file .js/.mjs/.cjs nằm trong gói).
function trangThai(dir, def) {
  const can = { daCai: false, phienBan: null, canBan: def.phienBan };
  try {
    const g = goiDir(dir, def), pj = JSON.parse(fs.readFileSync(path.join(g, "package.json"), "utf8"));
    const binMap = typeof pj.bin === "string" ? { [pj.name]: pj.bin } : pj.bin || {};
    const rel = def.bin ? binMap[def.bin] : binMap[def.goi.split("/").pop()] || Object.values(binMap)[0];
    const entry = rel && path.resolve(g, rel);
    if (!entry || !entry.startsWith(path.resolve(g)) || !/\.(c|m)?js$/.test(entry) || !fs.existsSync(entry)) return { ...can, phienBan: pj.version || null };
    return { daCai: true, phienBan: pj.version, canBan: def.phienBan, dungBan: pj.version === def.phienBan, entry };
  } catch { return can; }
}

function lenh(dir, def, node = process.execPath) {
  const t = trangThai(dir, def);
  if (!t.daCai) return null;
  return { command: node.replace(/\\/g, "/"), args: [t.entry.replace(/\\/g, "/"), ...def.args] };
}

// Cài/nâng đúng def.phienBan (tải từ npm: chỉ khi CEO bấm Cài / Duyệt).
function cai(dir, def, { run = execFile, npm = process.platform === "win32" ? "npm.cmd" : "npm" } = {}) {
  kiemDef(def);
  fs.mkdirSync(thuMuc(dir, def), { recursive: true });
  const args = ["install", "--prefix", thuMuc(dir, def), `${def.goi}@${def.phienBan}`, "--ignore-scripts", "--save-exact", "--no-fund", "--no-audit", "--no-update-notifier"];
  return new Promise((resolve, reject) => {
    // npm.cmd trên Windows cần shell; tên gói và phiên bản đã qua kiemDef (chỉ chữ thường, số, . _ - @ /), đường dẫn nằm trong ngoặc kép.
    const a = process.platform === "win32" ? args.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : args;
    run(npm, a, { timeout: 5 * 60 * 1000, windowsHide: true, shell: process.platform === "win32", maxBuffer: 4 << 20 }, (e, out, er) => {
      const t = trangThai(dir, def);
      if (e || !t.daCai || !t.dungBan) return reject(err("BAD_REQUEST", `Cài ${def.name || def.goi} lỗi: ` + String(er || out || (e && e.message) || "không thấy gói hoặc file chạy sau khi cài").trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 400)));
      resolve(t);
    });
  });
}

// Dòng danh mục cho trang Kết nối / chia phòng.
const catalogMay = (dir) => tatCa(dir).map((d) => ({ id: d.id, name: d.name, nhom: d.nhom || "them", may: true, note: d.note || null }));

module.exports = { ID_RE, GOI_RE, BAN_RE, ARG_RE, kiemDef, danhSachThem, tatCa, tim, themMcp, trangThai, lenh, cai, catalogMay, thuMuc };
