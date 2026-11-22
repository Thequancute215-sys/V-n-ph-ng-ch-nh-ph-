// Đường /quyen của ctl (OS-2, CEO duyệt 21/11/2026): đọc mức quyền đang áp của từng vai, đặt mức theo vai, từ chối dữ liệu lạ.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createCtl } = require("../ctl/main");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-quyen-api-"));
let ctl, port;
function call(method, p, body) {
  return new Promise((ok, bad) => {
    const h = { host: "127.0.0.1:" + port, authorization: "Bearer " + ctl.token };
    if (body !== undefined) h["content-type"] = "application/json";
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: h }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok({ status: res.statusCode, json: JSON.parse(b || "null") }));
    });
    r.on("error", bad); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
test.before(async () => { ctl = createCtl({ dir }); await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok)); port = ctl.server.address().port; });
test.after(async () => { await ctl.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test("GET /quyen: mặc định cũ (toàn quyền chung) → mọi vai làm việc ở mức toan, có danh sách vai", async () => {
  const r = await call("GET", "/quyen");
  assert.equal(r.status, 200);
  assert.equal(r.json.quyen.toanQuyen, true);
  assert.ok(r.json.quyen.roles.includes("CODEX_ASTRA_DEV"));
  for (const role of r.json.quyen.roles) assert.equal(r.json.quyen.muc[role], "toan", role);
});

test("POST /quyen theo vai: chỉ vai đó đổi, ghi xuống quyen.json; tắt công tắc chung thì vai chưa đặt về nhap", async () => {
  let r = await call("POST", "/quyen", { role: "CODEX_ASTRA_DEV", muc: "doc" });
  assert.equal(r.status, 200);
  assert.equal(r.json.quyen.muc.CODEX_ASTRA_DEV, "doc");
  assert.equal(r.json.quyen.muc.CLAUDE_AUDITOR, "toan");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "quyen.json"), "utf8")).vai.CODEX_ASTRA_DEV, "doc");
  r = await call("POST", "/quyen", { toanQuyen: false });
  assert.equal(r.json.quyen.muc.CLAUDE_AUDITOR, "nhap");
  assert.equal(r.json.quyen.muc.CODEX_ASTRA_DEV, "doc", "mức đặt riêng thắng công tắc chung");
});

test("POST /quyen từ chối vai chỉ đọc, vai lạ và mức lạ (400), không ghi gì", async () => {
  const truoc = fs.readFileSync(path.join(dir, "quyen.json"), "utf8");
  for (const body of [{ role: "CLAUDE_CHAT", muc: "toan" }, { role: "CLAUDE_REPORTER", muc: "nhap" }, { role: "AI_LA", muc: "doc" }, { role: "CODEX_ASTRA_DEV", muc: "sieu" }, {}]) {
    const r = await call("POST", "/quyen", body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(fs.readFileSync(path.join(dir, "quyen.json"), "utf8"), truoc);
});
