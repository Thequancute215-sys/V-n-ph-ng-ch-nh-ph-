"use strict";
// Windows tạm khoá file vừa ghi (diệt virus quét, tiến trình khác đang đọc) làm đổi tên báo EPERM/EBUSY:
// ghi sổ phải thử lại chứ không làm hỏng lượt xuất bản, sổ luồng hay token (gặp thật 05–06/11/2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeAtomic, renameRetry } = require("../lib/ghi-file");

test("ghi file: Windows khoá tạm vài lần thì thử lại tới khi được; lỗi khác hoặc khoá mãi thì báo", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-ghi-")), f = path.join(dir, "so.json");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const real = fs.renameSync;
  let fails = 0;
  t.mock.method(fs, "renameSync", (a, b) => { if (fails-- > 0) throw Object.assign(new Error("khoá"), { code: ["EPERM", "EBUSY", "EACCES"][fails % 3] }); return real(a, b); });
  fails = 3;
  writeAtomic(f, '{"a":1}');
  assert.equal(fs.readFileSync(f, "utf8"), '{"a":1}');
  assert.equal(fs.existsSync(f + ".tmp"), false);

  fails = 1000;
  assert.throws(() => renameRetry(f, f + ".x", 3), /khoá/, "khoá mãi thì báo lỗi sau số lần thử");
  fails = 0;
  t.mock.method(fs, "renameSync", () => { throw Object.assign(new Error("không có"), { code: "ENOENT" }); });
  assert.throws(() => renameRetry(f, f + ".x"), (e) => e.code === "ENOENT", "lỗi khác thì báo ngay, không thử lại");
});
