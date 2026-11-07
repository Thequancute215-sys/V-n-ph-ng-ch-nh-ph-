#!/usr/bin/env node
// Kiểm agent.md theo giao thức đội AI. CI của GitHub chạy lệnh này trên mỗi PR; AI và CEO chạy tay cũng được.
//   node tools/kiem-agent.js                 kiểm agent.md hiện tại ở thư mục đang đứng
//   node tools/kiem-agent.js <đường dẫn>     kiểm một file agent.md khác
//   node tools/kiem-agent.js --tu <nhánh>    thêm: kiểm mọi commit sửa agent.md từ chỗ rẽ khỏi <nhánh> (vd. origin/main)
//   node tools/kiem-agent.js --neu-co        không có agent.md thì bỏ qua
// Mã thoát: 0 đạt, 1 có lỗi, 2 không đọc được file hoặc git. Toàn bộ logic ở lib/kiem-agent.js (file đó tự chạy được,
// văn phòng chép nguyên nó sang repo dự án).
"use strict";
process.exitCode = require("../lib/kiem-agent").main(process.argv.slice(2));
