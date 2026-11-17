// Chrome DevTools MCP (CEO yêu cầu 17/11/2026): cho AI mở Chrome thật để kiểm giao diện, bàn phím/a11y, tốc độ tải (LCP),
// lỗi console, mạng. Bộ skill chrome-devtools (ctl/skill-mac-dinh.json) cần máy chủ này mới chạy được.
// - Cài vào thư mục dữ liệu văn phòng (~/.van-phong-ao/mcp/chrome-devtools), GHIM phiên bản đã qua ít nhất 2 tuần,
//   không chạy script cài (--ignore-scripts; gói đóng sẵn, không có thư viện con). Không dùng `npx …@latest`.
// - KHÔNG đăng ký chung vào cấu hình Claude/Codex của máy: văn phòng chỉ gắn vào lượt của phòng được bật trên trang
//   Kết nối (ctl/runner.js), nên các phiên Claude Code/Codex khác của CEO không phải gánh thêm mô tả công cụ.
// - Mỗi lượt: Chrome ẩn (headless), hồ sơ tạm xoá khi đóng (không thấy tài khoản CEO đã đăng nhập), không gửi thống kê
//   sử dụng hay link trang lên Google (CrUX), không mở file: trên máy, che header nhạy cảm, ảnh chụp JPEG ≤1280px cho đỡ token.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ID = "chrome-devtools";
const GOI = "chrome-devtools-mcp";
const PHIEN_BAN = "1.12.0";   // phát hành 22/10/2026; 1.13.0 (11/11) còn quá mới lúc chọn 17/11/2026
const CO = ["--headless", "--isolated", "--no-usage-statistics", "--no-performance-crux", "--no-file-navigations", "--redactNetworkHeaders",
  "--screenshotFormat", "jpeg", "--screenshotMaxWidth", "1280", "--viewport", "1280x800",
  "--no-page-id-routing"];   // mỗi lượt một Chrome riêng: không cần bắt AI ghi kèm pageId cho mọi lệnh (dễ gọi sai)

const thuMuc = (dir) => path.join(dir, "mcp", ID);
const goiDir = (dir) => path.join(thuMuc(dir), "node_modules", GOI);

// Bản đang cài trên máy (null = chưa cài hoặc hỏng).
function trangThai(dir) {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(goiDir(dir), "package.json"), "utf8"));
    const bin = typeof pj.bin === "string" ? pj.bin : pj.bin && pj.bin[GOI];
    const entry = bin && path.resolve(goiDir(dir), bin);
    if (!entry || !entry.startsWith(path.resolve(goiDir(dir))) || !fs.existsSync(entry)) return { daCai: false, phienBan: pj.version || null, canBan: PHIEN_BAN };
    return { daCai: true, phienBan: pj.version, canBan: PHIEN_BAN, dungBan: pj.version === PHIEN_BAN, entry };
  } catch { return { daCai: false, phienBan: null, canBan: PHIEN_BAN }; }
}

// Lệnh chạy máy chủ cho một lượt: node + file của gói (không qua npx, không qua .cmd của npm). Chưa cài thì null.
function lenh(dir, node = process.execPath) {
  const t = trangThai(dir);
  if (!t.daCai) return null;
  return { command: node.replace(/\\/g, "/"), args: [t.entry.replace(/\\/g, "/"), ...CO] };
}

// Cài/nâng đúng PHIEN_BAN. Chỉ chạy khi CEO bấm Cài trên trang Kết nối hoặc chạy tools/cai-chrome-devtools.js.
function cai(dir, { run = execFile, npm = process.platform === "win32" ? "npm.cmd" : "npm" } = {}) {
  fs.mkdirSync(thuMuc(dir), { recursive: true });
  const args = ["install", "--prefix", thuMuc(dir), `${GOI}@${PHIEN_BAN}`, "--ignore-scripts", "--save-exact", "--no-fund", "--no-audit", "--no-update-notifier"];
  return new Promise((resolve, reject) => {
    // npm.cmd trên Windows cần shell; đối số đều là chuỗi cố định của văn phòng, không có gì từ người dùng.
    run(npm, args, { timeout: 5 * 60 * 1000, windowsHide: true, shell: process.platform === "win32", maxBuffer: 4 << 20 }, (e, out, er) => {
      const t = trangThai(dir);
      if (e || !t.daCai || !t.dungBan) return reject(Object.assign(new Error("Cài Chrome DevTools MCP lỗi: " + String(er || out || (e && e.message) || "không thấy gói sau khi cài").trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 400)), { code: "BAD_REQUEST" }));
      resolve(t);
    });
  });
}

// Câu nhắc trong lời giao việc của phòng được bật.
const HUONG_DAN = "Chrome DevTools (MCP chrome-devtools): mở Chrome ẩn để kiểm trang thật — bấm/gõ, chụp ảnh, đọc lỗi console và mạng, " +
  "đo tốc độ tải (LCP), kiểm bàn phím/a11y, giả lập điện thoại 375px. Chỉ mở localhost của dự án hoặc trang công khai; mỗi lượt là hồ sơ Chrome tạm, " +
  "KHÔNG đăng nhập tài khoản thật, không nhập mật khẩu hay khóa.";

module.exports = { ID, GOI, PHIEN_BAN, CO, HUONG_DAN, thuMuc, trangThai, lenh, cai };
