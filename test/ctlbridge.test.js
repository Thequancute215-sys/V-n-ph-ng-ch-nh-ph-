"use strict";
// Thử thật 16/11/2026: hỏi /ctl cách nhau ~5 giây thì thỉnh thoảng nhận 503 "Không kết nối được OS Controller" vì cầu nối
// dùng lại kết nối mà ctl vừa đóng (keep-alive). Cầu nối giờ mở kết nối mới cho mỗi yêu cầu.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

test("cầu nối ctl không dùng lại kết nối (tránh 503 giả khi ctl vừa đóng kết nối rảnh)", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-bridge-"));
  fs.writeFileSync(path.join(home, "ctl-token"), "tok");
  const seen = [];
  const ctl = http.createServer((req, res) => { seen.push(req.headers.connection); res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}'); });
  ctl.keepAliveTimeout = 30;
  await new Promise((r) => ctl.listen(0, "127.0.0.1", r));
  const old = { home: process.env.VP_HOME, port: process.env.CTL_PORT };
  process.env.VP_HOME = home; process.env.CTL_PORT = String(ctl.address().port);
  t.after(() => { ctl.close(); process.env.VP_HOME = old.home; process.env.CTL_PORT = old.port; if (old.home === undefined) delete process.env.VP_HOME; if (old.port === undefined) delete process.env.CTL_PORT; fs.rmSync(home, { recursive: true, force: true }); });
  const { call, proxy } = require("../lib/ctlbridge");
  for (let i = 0; i < 6; i++) {
    const r = await call("GET", "/dieu-phoi");
    assert.equal(r && r.status, 200, "lần " + i);
    await new Promise((r) => setTimeout(r, 30));   // đúng lúc ctl đóng kết nối rảnh
  }
  // Đường /ctl/* của trình duyệt (proxy) cũng vậy.
  const front = http.createServer((req, res) => proxy(req, res));
  await new Promise((r) => front.listen(0, "127.0.0.1", r));
  t.after(() => front.close());
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`http://127.0.0.1:${front.address().port}/ctl/dieu-phoi`);
    assert.equal(r.status, 200, "proxy lần " + i); await r.text();
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.ok(seen.length >= 12 && seen.every((c) => c === "close"), "mọi yêu cầu tới ctl đều Connection: close: " + seen.join(","));
});
