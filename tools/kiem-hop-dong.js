#!/usr/bin/env node
// Kiểm hợp đồng giao tiếp Backend ↔ Frontend (contract/api.json). CI của GitHub chạy lệnh này trên mỗi PR; AI và CEO chạy tay cũng được.
//   node tools/kiem-hop-dong.js                          kiểm contract/api.json và mã backend/frontend ở thư mục đang đứng
//   node tools/kiem-hop-dong.js --neu-co                 không có contract/api.json thì bỏ qua
//   node tools/kiem-hop-dong.js --kiem-mau <Tên> <file>  kiểm một giá trị JSON thật (file hoặc - để đọc từ stdin) theo hợp đồng
// Mã thoát: 0 đạt, 1 lệch hợp đồng, 2 không đọc được file. Toàn bộ logic ở lib/kiem-hop-dong.js (file đó tự chạy được,
// văn phòng chép nguyên nó sang repo dự án).
"use strict";
process.exitCode = require("../lib/kiem-hop-dong").main(process.argv.slice(2));
