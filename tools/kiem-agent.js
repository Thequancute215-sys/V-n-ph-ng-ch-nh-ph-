#!/usr/bin/env node
// Kiểm agent.md theo giao thức đội AI (lib/kiem-agent.js). CI của GitHub chạy lệnh này trên mỗi PR; AI và CEO chạy tay cũng được.
//   node tools/kiem-agent.js                 kiểm agent.md hiện tại ở thư mục đang đứng
//   node tools/kiem-agent.js <đường dẫn>     kiểm một file agent.md khác
//   node tools/kiem-agent.js --tu <nhánh>    thêm: kiểm mọi commit sửa agent.md từ chỗ rẽ khỏi <nhánh> (vd. origin/main)
// Mã thoát: 0 đạt, 1 có lỗi, 2 không đọc được file hoặc git.
"use strict";
const fs = require("fs");
const path = require("path");
const { checkText, checkHistory } = require("../lib/kiem-agent");

const args = process.argv.slice(2);
const at = args.indexOf("--tu");
const from = at >= 0 ? args[at + 1] : null;
if (at >= 0 && (!from || from.startsWith("--"))) { console.error("Thiếu tên nhánh sau --tu (vd. --tu origin/main)"); process.exit(2); }
const file = path.resolve(args.find((a, i) => !a.startsWith("--") && (at < 0 || i !== at + 1)) || "agent.md");

let txt;
try { txt = fs.readFileSync(file, "utf8"); } catch { console.error("Không đọc được " + file); process.exit(2); }
let fail = 0;
const loi = checkText(txt);
console.log((loi.length ? "✗ " : "✓ ") + path.basename(file) + (loi.length ? "" : ": đạt"));
for (const l of loi) console.log("   - " + l);
fail += loi.length;

if (from) {
  let rows;
  try { rows = checkHistory(path.dirname(file), from); } catch (e) { console.error("Không đọc được lịch sử git từ " + from + ": " + String(e.stderr || e.message).trim()); process.exit(2); }
  console.log(rows.length ? `Commit sửa agent.md từ ${from}: ${rows.length}` : `Không có commit nào sửa agent.md từ ${from}`);
  for (const r of rows) {
    console.log((r.loi.length ? "✗ " : "✓ ") + r.commit + " " + r.subject.slice(0, 100));
    for (const l of r.loi) console.log("   - " + l);
    for (const c of r.canhBao) console.log("   ! " + c);
    fail += r.loi.length;
  }
}
process.exit(fail ? 1 : 0);
