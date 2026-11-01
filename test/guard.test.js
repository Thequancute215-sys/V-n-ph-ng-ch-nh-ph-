// P2-C05 + CSRF /chat/send: trang lạ không được ghi vào máy chủ văn phòng.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { checkWrite, checkHost } = require("../lib/guard");

const req = (headers, method = "POST") => ({ method, headers: { host: "localhost:7788", "content-type": "application/json", ...headers } });

test("cho phép POST từ chính văn phòng", () => {
  assert.strictEqual(checkWrite(req({ origin: "http://localhost:7788", "sec-fetch-site": "same-origin" }), { hasKey: false }), null);
});
test("cho phép công cụ dòng lệnh (không có Origin)", () => {
  assert.strictEqual(checkWrite(req({}), { hasKey: false }), null);
});
test("GET không bị chặn", () => {
  assert.strictEqual(checkWrite(req({ origin: "https://evil.example" }, "GET"), { hasKey: false }), null);
});
test("chặn Origin trang lạ", () => {
  assert.ok(checkWrite(req({ origin: "https://evil.example" }), { hasKey: false }));
});
test("chặn Sec-Fetch-Site cross-site dù không có Origin", () => {
  assert.ok(checkWrite(req({ "sec-fetch-site": "cross-site" }), { hasKey: false }));
});
test("chặn form text/plain (CSRF không cần preflight)", () => {
  assert.ok(checkWrite(req({ "content-type": "text/plain" }), { hasKey: false }));
});
test("chặn DNS rebinding: Host lạ khi chưa bật khóa xem", () => {
  assert.ok(checkWrite(req({ host: "evil.example:7788", origin: "http://evil.example:7788" }), { hasKey: false }));
});
test("DNS rebinding với GET: tên miền lạ bị chặn khi chưa bật khóa; địa chỉ IP trong LAN vẫn xem được", () => {
  const get = (host) => ({ method: "GET", headers: { host } });
  assert.ok(checkHost(get("evil.example:7788"), { hasKey: false }));
  assert.strictEqual(checkHost(get("localhost:7788"), { hasKey: false }), null);
  assert.strictEqual(checkHost(get("192.168.1.20:7788"), { hasKey: false }), null);
  assert.strictEqual(checkHost(get("[::1]:7788"), { hasKey: false }), null);
  assert.strictEqual(checkHost(get("evil.example:7788"), { hasKey: true }), null);
});
test("Host lạ (đường hầm điện thoại) được phép khi đã bật khóa xem và Origin khớp", () => {
  assert.strictEqual(checkWrite(req({ host: "vp.trycloudflare.com", origin: "https://vp.trycloudflare.com" }), { hasKey: true }), null);
});
