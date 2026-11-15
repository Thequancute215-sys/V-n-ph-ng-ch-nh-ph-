"use strict";
// Windows PowerShell 5.1 đọc file .ps1 không có BOM theo bảng mã ANSI: tiếng Việt vỡ và script báo lỗi cú pháp.
// Mọi script .ps1 trong repo phải lưu UTF-8 có BOM.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("mọi file .ps1 lưu UTF-8 có BOM để chạy được trên PowerShell 5.1", () => {
  const goc = path.join(__dirname, "..");
  const ds = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".git"].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".ps1")) ds.push(p); } };
  walk(goc);
  assert.ok(ds.length >= 1);
  for (const f of ds) assert.deepEqual([...fs.readFileSync(f).subarray(0, 3)], [0xef, 0xbb, 0xbf], path.relative(goc, f) + " thiếu BOM");
});
