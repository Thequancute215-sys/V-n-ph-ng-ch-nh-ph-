#!/usr/bin/env node
// Công cụ hồ sơ phim cho đội AI và CEO (lib/phim.js). Chạy trong thư mục dự án phim, hoặc truyền đường dẫn.
//   node tools/phim.js kiem [thu-muc] [--json]   kiểm phim.json (thoát 1 khi có lỗi)
//   node tools/phim.js dong-bo [thu-muc]         chốt giay từng cảnh theo media/giong/voice.json rồi ghi lại phim.json
// Trong lượt AI, đường dẫn công cụ này có ở biến XUONG_PHIM_CONG_CU.
"use strict";
const fs = require("fs");
const path = require("path");
const { kiem, dongBoGiong } = require("../lib/phim");

function docJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); }
  catch (e) { if (e.code === "ENOENT") return undefined; throw new Error(path.basename(p) + " không đọc được: " + e.message); }
}

function main(argv) {
  const [lenh, ...con] = argv;
  const json = con.includes("--json");
  const thuMuc = path.resolve(con.find((a) => !a.startsWith("--")) || ".");
  const fPhim = path.join(thuMuc, "phim.json"), fGiong = path.join(thuMuc, "media", "giong", "voice.json");
  if (!["kiem", "dong-bo"].includes(lenh)) {
    console.log("Dùng: node tools/phim.js kiem|dong-bo [thu-muc] [--json]");
    return 2;
  }
  const phim = docJson(fPhim);
  if (phim === undefined) { console.error("Không có phim.json trong " + thuMuc); return 1; }
  const giong = docJson(fGiong) || null;

  if (lenh === "dong-bo") {
    if (!giong) { console.error("Chưa có giọng đọc: " + fGiong); return 1; }
    const { phim: moi, doi } = dongBoGiong(phim, giong);
    fs.writeFileSync(fPhim, JSON.stringify(moi, null, 2) + "\n");
    console.log(doi.length ? doi.map((d) => `${d.ma}: ${d.cu ?? "—"} → ${d.moi} giây`).join("\n") : "Thời lượng cảnh đã khớp giọng đọc, không đổi gì.");
    const kq = kiem(moi, { giong });
    return kq.ok ? 0 : (console.error(kq.loi.map((l) => "✖ " + l.chiTiet).join("\n")), 1);
  }

  const kq = kiem(phim, { giong });
  if (json) { console.log(JSON.stringify(kq, null, 2)); return kq.ok ? 0 : 1; }
  for (const l of kq.loi) console.log("✖ [" + l.ma + "] " + l.chiTiet);
  for (const w of kq.canhBao) console.log("⚠ [" + w.ma + "] " + w.chiTiet);
  if (kq.chiPhi) console.log(`Chi phí tối đa ước tính: $${kq.chiPhi.usdToiDa} · ${kq.chiPhi.giayQuay} giây quay · ${kq.chiPhi.soAnh} ảnh` + (kq.chiPhi.luotFlow ? ` · ${kq.chiPhi.luotFlow} lượt Flow` : ""));
  console.log(kq.ok ? "✓ Hồ sơ phim hợp lệ." : `Có ${kq.loi.length} lỗi phải sửa trước khi quay.`);
  return kq.ok ? 0 : 1;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error("✖ " + e.message); process.exitCode = 1; }
}
module.exports = { main };
