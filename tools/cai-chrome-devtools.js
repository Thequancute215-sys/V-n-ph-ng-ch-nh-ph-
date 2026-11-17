#!/usr/bin/env node
// Cài / kiểm Chrome DevTools MCP cho văn phòng (ctl/chrome-devtools.js). Cũng bấm được nút "Cài trên máy" ở trang Kết nối.
//   node tools/cai-chrome-devtools.js        kiểm: đã cài chưa, đúng bản đã ghim chưa
//   node tools/cai-chrome-devtools.js cai    tải đúng bản đã ghim vào ~/.van-phong-ao/mcp/chrome-devtools (không chạy script cài)
// Bật cho phòng nào: trang Kết nối của văn phòng (mặc định Sakura).
"use strict";
const os = require("os");
const path = require("path");
const cdt = require("../ctl/chrome-devtools");

const dir = process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
(async () => {
  if (process.argv[2] === "cai") {
    console.log(`Cài ${cdt.GOI}@${cdt.PHIEN_BAN} vào ${cdt.thuMuc(dir)}…`);
    try { const t = await cdt.cai(dir); console.log("Xong: bản " + t.phienBan + ". Bật cho phòng nào ở trang Kết nối của văn phòng."); }
    catch (e) { console.error(e.message); process.exitCode = 1; }
    return;
  }
  const t = cdt.trangThai(dir);
  console.log(t.daCai ? `${t.dungBan ? "✓" : "↻"} Đã cài bản ${t.phienBan}${t.dungBan ? "" : " (cần " + t.canBan + ": chạy với đối số cai)"}` : "✗ Chưa cài: chạy `node tools/cai-chrome-devtools.js cai`");
  process.exitCode = t.daCai && t.dungBan ? 0 : 1;
})();
