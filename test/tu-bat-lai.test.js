"use strict";
// App bật ngầm (npm run app / cùng Windows) chạy chay-tat-ca.js --tu-bat-lai: bên nào sập thì tự bật lại, sập liên tục thì tắt hẳn.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { killTree, alive } = require("../lib/proc");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCRIPT = path.join(__dirname, "..", "scripts", "chay-tat-ca.js");

// ctl giả: đếm số lần được bật; `crash` lần đầu thì thoát mã 1, `always` thì lần nào cũng thoát. Văn phòng giả chạy mãi.
function setup(t, mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-batlai-"));
  const count = path.join(dir, "count");
  fs.writeFileSync(path.join(dir, "ctl.js"), `const fs=require('fs');const n=(fs.existsSync(${JSON.stringify(count)})?+fs.readFileSync(${JSON.stringify(count)},'utf8'):0)+1;fs.writeFileSync(${JSON.stringify(count)},String(n));
    if(${JSON.stringify(mode)}==='always'||(${JSON.stringify(mode)}==='crash'&&n===1))process.exit(1);
    setInterval(()=>{},1000);process.on('message',m=>{if(m==='stop')process.exit(0)});process.on('disconnect',()=>process.exit(0));`);
  fs.writeFileSync(path.join(dir, "office.js"), "setInterval(()=>{},1000);process.on('disconnect',()=>process.exit(0));");
  const kids = JSON.stringify({ ctl: path.join(dir, "ctl.js"), office: path.join(dir, "office.js") });
  const run = (args) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, VP_TEST_KIDS: kids }, stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; p.stderr.on("data", (b) => (err += b));
    p.done = new Promise((ok) => p.on("exit", (c) => ok(c)));
    p.err = () => err;
    t.after(async () => { if (alive(p.pid)) await killTree(p.pid); });
    return p;
  };
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const runs = () => (fs.existsSync(count) ? Number(fs.readFileSync(count, "utf8")) : 0);
  return { run, runs };
}

test("--tu-bat-lai: ctl sập thì được bật lại, văn phòng vẫn chạy", async (t) => {
  const { run, runs } = setup(t, "crash");
  const p = run(["--tu-bat-lai"]);
  for (let i = 0; i < 100 && runs() < 2; i++) await sleep(100);
  assert.equal(runs(), 2, "ctl được bật lại đúng 1 lần");
  assert.ok(alive(p.pid), "bộ chạy vẫn sống");
  assert.match(p.err(), /tự bật lại sau 3s \(lần 1\/5/);
});

test("--tu-bat-lai: sập liên tục quá 5 lần trong 10 phút thì tắt hẳn, không lặp vô hạn", async (t) => {
  const { run, runs } = setup(t, "always");
  const p = run(["--tu-bat-lai"]);
  const code = await Promise.race([p.done, sleep(40000).then(() => "treo")]);
  assert.notEqual(code, "treo");
  assert.equal(runs(), 6);
  assert.match(p.err(), /sập 6 lần trong 10 phút: tắt hẳn/);
});

test("không cờ (npm run all): một bên chết thì tắt cả hai như cũ", async (t) => {
  const { run, runs } = setup(t, "crash");
  const p = run([]);
  const code = await Promise.race([p.done, sleep(15000).then(() => "treo")]);
  assert.notEqual(code, "treo");
  assert.equal(runs(), 1);
});
