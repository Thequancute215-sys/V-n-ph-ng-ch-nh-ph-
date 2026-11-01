// P2-C05: khóa API lưu ngoài thư mục mã nguồn, kiểm tra định dạng, báo lỗi thay vì nuốt im.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const keys = require("../lib/keys");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-keys-"));
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

test("lưu khóa hợp lệ vào ~/.van-phong-ao/keys.json", () => {
  const r = keys.save("claude", "sk-ant-" + "a".repeat(30), home);
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(keys.has("claude", home), true);
  assert.strictEqual(keys.file(home), path.join(home, ".van-phong-ao", "keys.json"));
  if (process.platform !== "win32") assert.strictEqual(fs.statSync(keys.file(home)).mode & 0o777, 0o600);
});
test("từ chối nhà cung cấp lạ và khóa sai định dạng", () => {
  assert.strictEqual(keys.save("evil", "sk-" + "a".repeat(30), home).ok, false);
  assert.strictEqual(keys.save("gpt", "<script>", home).ok, false);
  assert.strictEqual(keys.has("gpt", home), false);
});
test("báo lỗi khi không ghi được", () => {
  const blocked = path.join(home, "file-chan");
  fs.writeFileSync(blocked, "");
  const r = keys.save("gpt", "sk-" + "b".repeat(30), blocked);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Không ghi được/);
});
