// Tắt ctl khi chạy dưới `npm run all`: Windows không có SIGTERM thật (kill = giết cứng, ctl không kịp dừng việc → tiến trình mồ côi),
// nên tiến trình cha báo tắt qua IPC ("stop"); cha chết thì kênh IPC đứt và ctl cũng tự tắt. Cả hai đường phải dừng hết cây việc đang chạy.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { alive } = require("../lib/proc");

const MAIN = path.join(__dirname, "..", "ctl", "main.js");
const NODE = process.execPath;
const TREE = `const s=()=>require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1e3)"],{stdio:"ignore"});const a=s(),b=s();console.log(a.pid+","+b.pid);setInterval(()=>{},1e3);`;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const hang = (ms) => new Promise((ok) => setTimeout(() => ok("treo"), ms).unref()); // hạn chờ, không giữ test chạy thêm

function call(port, token, method, p, body) {
  return new Promise((ok, bad) => {
    const h = { host: "127.0.0.1:" + port, authorization: "Bearer " + token };
    if (body !== undefined) h["content-type"] = "application/json";
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: h }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} ok({ status: res.statusCode, json: j, text: b }); });
    });
    r.on("error", bad); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

// Khởi động ctl thật (tiến trình riêng, có kênh IPC như dưới `npm run all`), chạy 1 cây 3 tiến trình qua API, trả PID cả cây.
async function startCtlWithTree(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-tat-"));
  const home = path.join(tmp, "home"), ws = path.join(tmp, "du-an");
  fs.mkdirSync(ws, { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(NODE, [MAIN], { env: { ...process.env, VP_HOME: home, CTL_PORT: String(port) }, stdio: ["ignore", "ignore", "inherit", "ipc"] });
  t.after(() => { if (alive(child.pid)) child.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
  const tokenFile = path.join(home, "ctl-token");
  let token = "";
  for (let i = 0; i < 100 && !token; i++) { try { token = fs.readFileSync(tokenFile, "utf8").trim(); } catch { await sleep(50); } }
  assert.ok(token, "ctl không ghi token");
  for (let i = 0; i < 100; i++) { try { if ((await call(port, token, "GET", "/health")).status === 200) break; } catch { await sleep(50); } }
  assert.strictEqual((await call(port, token, "POST", "/workspaces", { path: ws })).status, 201);
  const p = await call(port, token, "POST", "/jobs", { kind: "cmd", workspace: ws, argv: ["node", "-e", TREE] });
  assert.strictEqual(p.status, 202, p.text); // node -e ngoài danh sách: chờ duyệt
  const a = await call(port, token, "POST", `/jobs/${p.json.job.id}/approve`, {});
  assert.strictEqual(a.status, 200, a.text);
  const job = a.json.job;
  let kids = [];
  for (let i = 0; i < 60 && !kids.length; i++) {
    const t2 = (await call(port, token, "GET", `/jobs/${job.id}/log`)).text.trim();
    if (t2.includes(",")) kids = t2.split(",").map(Number); else await sleep(50);
  }
  assert.ok(kids.length === 2 && alive(job.pid) && kids.every(alive), "cây việc chưa chạy đủ");
  return { child, pids: [job.pid, ...kids], tokenFile };
}

async function gone(pids, ms) { const until = Date.now() + ms; while (Date.now() < until) { if (!pids.some(alive)) return true; await sleep(100); } return false; }

test("tiến trình cha gửi 'stop' qua IPC → ctl dừng cả cây việc rồi thoát, xóa token", async (t) => {
  const { child, pids, tokenFile } = await startCtlWithTree(t);
  const exited = new Promise((ok) => child.on("exit", ok));
  child.send("stop");
  assert.strictEqual(await Promise.race([exited, hang(10000)]), 0);
  assert.ok(await gone(pids, 3000), "còn tiến trình mồ côi: " + pids.filter(alive).join(","));
  assert.ok(!fs.existsSync(tokenFile), "token chưa bị xóa");
});

test("tiến trình cha chết (kênh IPC đứt) → ctl vẫn dừng cả cây việc rồi thoát", async (t) => {
  const { child, pids } = await startCtlWithTree(t);
  const exited = new Promise((ok) => child.on("exit", ok));
  child.disconnect();
  assert.strictEqual(await Promise.race([exited, hang(10000)]), 0);
  assert.ok(await gone(pids, 3000), "còn tiến trình mồ côi: " + pids.filter(alive).join(","));
});
