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

const ID = "chrome-devtools";
const GOI = "chrome-devtools-mcp";
const PHIEN_BAN = "1.12.0";   // phát hành 22/10/2026; 1.13.0 (11/11) còn quá mới lúc chọn 17/11/2026
const CO = ["--headless", "--isolated", "--no-usage-statistics", "--no-performance-crux", "--no-file-navigations", "--redactNetworkHeaders",
  "--screenshotFormat", "jpeg", "--screenshotMaxWidth", "1280", "--viewport", "1280x800",
  "--no-page-id-routing"];   // mỗi lượt một Chrome riêng: không cần bắt AI ghi kèm pageId cho mọi lệnh (dễ gọi sai)

// Phần cài/chạy dùng chung với các MCP CEO duyệt thêm (ctl/mcp-may.js).
const may = () => require("./mcp-may");
const thuMuc = (dir) => path.join(dir, "mcp", ID);
const trangThai = (dir) => may().trangThai(dir, DEF);
const lenh = (dir, node = process.execPath) => may().lenh(dir, DEF, node);
const cai = (dir, opts) => may().cai(dir, DEF, opts);

// Câu nhắc trong lời giao việc của phòng được bật.
const HUONG_DAN = "Chrome DevTools (MCP chrome-devtools): mở Chrome ẩn để kiểm trang thật — bấm/gõ, chụp ảnh, đọc lỗi console và mạng, " +
  "đo tốc độ tải (LCP), kiểm bàn phím/a11y, giả lập điện thoại 375px. Chỉ mở localhost của dự án hoặc trang công khai; mỗi lượt là hồ sơ Chrome tạm, " +
  "KHÔNG đăng nhập tài khoản thật, không nhập mật khẩu hay khóa.";

const DEF = { id: ID, name: "Chrome DevTools", nhom: "kiem-thu", goi: GOI, phienBan: PHIEN_BAN, args: CO, bin: GOI, huongDan: HUONG_DAN,
  note: "Chạy trên máy: Chrome ẩn, hồ sơ tạm, không gửi thống kê" };

module.exports = { ID, GOI, PHIEN_BAN, CO, HUONG_DAN, DEF, thuMuc, trangThai, lenh, cai };
