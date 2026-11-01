// Phase 3 (OS Controller lõi): nghiệm thu theo Vùng [3] của agent.md.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createCtl } = require("../ctl/main");
const { alive } = require("../lib/proc");
const { maskSecrets, cleanEnv } = require("../lib/mask");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-ctl-"));
let ctl, port;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const NODE = process.execPath;
// Tiến trình cha sinh 2 tiến trình con, in PID con, cả ba cùng treo: tổng cộng cây 3 tiến trình.
const TREE = `const s=()=>require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1e3)"],{stdio:"ignore"});const a=s(),b=s();console.log(a.pid+","+b.pid);setInterval(()=>{},1e3);`;

function call(method, p, { token = ctl.token, headers = {}, body } = {}) {
  return new Promise((ok, bad) => {
    const h = { host: "127.0.0.1:" + port, ...headers };
    if (token) h.authorization = "Bearer " + token;
    if (body !== undefined) h["content-type"] = h["content-type"] || "application/json";
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: h }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} ok({ status: res.statusCode, json: j, text: b, headers: res.headers }); });
    });
    r.on("error", bad); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function childPids(jobId) {
  for (let i = 0; i < 40; i++) { const t = (await call("GET", `/jobs/${jobId}/log`)).text.trim(); if (t.includes(",")) return t.split(",").map(Number); await sleep(50); }
  throw new Error("không đọc được PID con");
}

test.before(async () => { ctl = createCtl({ dir }); await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok)); port = ctl.server.address().port; });
test.after(async () => { await ctl.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("thiếu hoặc sai token → 401", async () => {
  assert.strictEqual((await call("GET", "/health", { token: null })).status, 401);
  assert.strictEqual((await call("GET", "/health", { token: "x".repeat(64) })).status, 401);
  assert.strictEqual((await call("GET", "/health")).status, 200);
});

test("Host lạ (DNS rebinding) → 403 dù có token", async () => {
  assert.strictEqual((await call("GET", "/health", { headers: { host: "evil.example:7790" } })).status, 403);
});

test("POST từ trang lạ → 403 dù có token", async () => {
  assert.strictEqual((await call("POST", "/kill-all", { body: {}, headers: { origin: "https://evil.example" } })).status, 403);
  assert.strictEqual((await call("POST", "/kill-all", { body: {}, headers: { "content-type": "text/plain" } })).status, 403);
});

test("chưa có route chạy lệnh qua HTTP ở Phase 3", async () => {
  assert.strictEqual((await call("POST", "/jobs", { body: { argv: ["node", "-v"] } })).status, 404);
});

test("Kill-All dừng cả cây 3 tiến trình dưới 2 giây", async () => {
  const j = ctl.jobs.start({ agent: "test", argv: [NODE, "-e", TREE] });
  const kids = await childPids(j.id);
  assert.ok(alive(j.pid) && kids.every(alive));
  const t0 = Date.now();
  const r = await call("POST", "/kill-all", { body: {} });
  assert.strictEqual(r.status, 200, r.text);
  assert.ok(Date.now() - t0 < 2000, "phải dừng xong dưới 2 giây");
  await sleep(100);
  assert.ok(!alive(j.pid), "tiến trình cha còn sống");
  assert.ok(kids.every((p) => !alive(p)), "tiến trình con còn sống");
  assert.strictEqual(ctl.jobs.get(j.id).status, "killed");
});

test("dừng từng việc; dừng lại việc đã dừng → 409; việc không tồn tại → 404", async () => {
  const j = ctl.jobs.start({ agent: "test", argv: [NODE, "-e", "setInterval(()=>{},1e3)"] });
  assert.strictEqual((await call("POST", `/jobs/${j.id}/kill`, { body: {} })).status, 200);
  assert.strictEqual(ctl.jobs.get(j.id).status, "killed");
  assert.strictEqual((await call("POST", `/jobs/${j.id}/kill`, { body: {} })).status, 409);
  assert.strictEqual((await call("POST", `/jobs/khong-co/kill`, { body: {} })).status, 404);
});

test("việc quá timeout tự chuyển 'timeout' và tiến trình bị dừng", async () => {
  const j = ctl.jobs.start({ agent: "test", argv: [NODE, "-e", "setInterval(()=>{},1e3)"], timeoutMs: 1000 });
  for (let i = 0; i < 60 && ctl.jobs.get(j.id).status === "running"; i++) await sleep(100);
  assert.strictEqual(ctl.jobs.get(j.id).status, "timeout");
  assert.ok(!alive(j.pid));
});

test("việc chạy xong ghi 'done' + exit_code; lệnh không tồn tại ghi 'failed'", async () => {
  const ok = ctl.jobs.start({ agent: "test", argv: [NODE, "-e", "console.log('xin chào')"] });
  const bad = ctl.jobs.start({ agent: "test", argv: ["khong-co-chuong-trinh-nay-xyz"] });
  for (let i = 0; i < 50 && [ok, bad].some((j) => ctl.jobs.get(j.id).status === "running"); i++) await sleep(100);
  assert.strictEqual(ctl.jobs.get(ok.id).status, "done");
  assert.strictEqual(ctl.jobs.get(ok.id).exit_code, 0);
  assert.strictEqual(ctl.jobs.get(bad.id).status, "failed");
  assert.match((await call("GET", `/jobs/${ok.id}/log`)).text, /xin chào/);
});

test("log trả về đã che khóa; tiến trình con không thấy biến môi trường chứa khóa", async () => {
  process.env.VP_TEST_API_KEY = "sk-ant-" + "z".repeat(30);
  try {
    const j = ctl.jobs.start({ agent: "test", argv: [NODE, "-e", "console.log('env=' + (process.env.VP_TEST_API_KEY || 'khong-co')); console.log('token=abc123secret ghp_' + 'a'.repeat(20))"] });
    for (let i = 0; i < 50 && ctl.jobs.get(j.id).status === "running"; i++) await sleep(100);
    const t = (await call("GET", `/jobs/${j.id}/log`)).text;
    assert.match(t, /env=khong-co/);
    assert.doesNotMatch(t, /abc123secret|ghp_a/);
  } finally { delete process.env.VP_TEST_API_KEY; }
  assert.ok(!("OPENAI_API_KEY" in cleanEnv({ OPENAI_API_KEY: "x", PATH: "/bin" })));
  assert.strictEqual(maskSecrets("password: hunter2"), "password: ‹ẩn›");
});

test("giám sát trả về CPU/RAM máy và từng việc đang chạy", async () => {
  const j = ctl.jobs.start({ agent: "test", argv: [NODE, "-e", "setInterval(()=>{},1e3)"] });
  const m = (await call("GET", "/monitor")).json;
  assert.ok(m.ok && m.memTotalMb > 0 && typeof m.cpuPct === "number");
  assert.ok(m.jobs.some((x) => x.id === j.id && x.pid === j.pid));
  await ctl.jobs.kill(j.id);
});

test("nhật ký kiểm toán ghi đủ và không sửa được", async () => {
  const actions = ctl.audit.recent(500).map((a) => a.action);
  for (const a of ["job.start", "job.kill", "job.kill_all", "job.timeout", "job.exit", "auth.fail"]) assert.ok(actions.includes(a), "thiếu " + a);
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(dir, "ctl.db"));
  try {
    assert.throws(() => db.exec("UPDATE audit SET action = 'xoa-dau-vet'"), /audit chỉ được thêm/);
    assert.throws(() => db.exec("DELETE FROM audit"), /quá 90 ngày/);
  } finally { db.close(); }
});

test("giới hạn số việc chạy cùng lúc", async () => {
  const { MAX_RUNNING } = require("../ctl/jobs");
  const started = [];
  try {
    for (let i = 0; i < MAX_RUNNING; i++) started.push(ctl.jobs.start({ agent: "test", argv: [NODE, "-e", "setInterval(()=>{},1e3)"] }));
    assert.throws(() => ctl.jobs.start({ agent: "test", argv: [NODE, "-v"] }), /đang chạy/);
  } finally { await ctl.jobs.killAll("test"); }
});
