// Ghi file kiểu "ghi ra file tạm rồi đổi tên" để không bao giờ để lại file ghi dở.
// Windows hay tạm khoá file vừa tạo (phần mềm diệt virus đang quét, tiến trình khác đang đọc): đổi tên báo
// EPERM / EBUSY / EACCES. Thử lại tối đa khoảng 2 giây thay vì làm hỏng thao tác (sổ luồng, sổ xuất bản, token…).
"use strict";
const fs = require("fs");

const LOCKED = new Set(["EPERM", "EBUSY", "EACCES"]);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function renameRetry(from, to, tries = 40) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (e) { if (!LOCKED.has(e.code) || i >= tries) throw e; pause(50); }
  }
}

function writeAtomic(file, data, mode = 0o600) {
  fs.writeFileSync(file + ".tmp", data, { mode });
  renameRetry(file + ".tmp", file);
}

module.exports = { writeAtomic, renameRetry };
