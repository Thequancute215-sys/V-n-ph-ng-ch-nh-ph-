// Táº¯t ctl khi cháº¡y dÆ°á»›i `npm run all`: Windows khÃ´ng cÃ³ SIGTERM tháº­t (kill = giáº¿t cá»©ng, ctl khÃ´ng ká»‹p dá»«ng viá»‡c â†’ tiáº¿n trÃ¬nh má»“ cÃ´i),
// nÃªn tiáº¿n trÃ¬nh cha bÃ¡o táº¯t qua IPC ("stop"); cha cháº¿t thÃ¬ kÃªnh IPC Ä‘á»©t vÃ  ctl cÅ©ng tá»± táº¯t. Cáº£ hai Ä‘Æ°á»ng pháº£i dá»«ng háº¿t cÃ¢y viá»‡c Ä‘ang cháº¡y.
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
const hang = (ms) => new Promise((ok) => setTimeout(() => ok("treo"), ms).unref()); // háº¡n chá», khÃ´ng giá»¯ test cháº¡y thÃªm

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

// Khá»Ÿi Ä‘á»™ng ctl tháº­t (tiáº¿n trÃ¬nh riÃªng, cÃ³ kÃªnh IPC nhÆ° dÆ°á»›i `npm run all`), cháº¡y 1 cÃ¢y 3 tiáº¿n trÃ¬nh qua API, tráº£ PID cáº£ cÃ¢y.
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
  assert.ok(token, "ctl khÃ´ng ghi token");
  for (let i = 0; i < 100; i++) { try { if ((await call(port, token, "GET", "/health")).status === 200) break; } catch { await sleep(50); } }
  assert.strictEqual((await call(port, token, "POST", "/workspaces", { path: ws })).status, 201);
  const p = await call(port, token, "POST", "/jobs", { kind: "cmd", workspace: ws, argv: ["node", "-e", TREE] });
  assert.strictEqual(p.status, 202, p.text); // node -e ngoÃ i danh sÃ¡ch: chá» duyá»‡t
  const a = await call(port, token, "POST", `/jobs/${p.json.job.id}/approve`, {});
  assert.strictEqual(a.status, 200, a.text);
  const job = a.json.job;
  let kids = [];
  for (let i = 0; i < 60 && !kids.length; i++) {
    const t2 = (await call(port, token, "GET", `/jobs/${job.id}/log`)).text.trim();
    if (t2.includes(",")) kids = t2.split(",").map(Number); else await sleep(50);
  }
  assert.ok(kids.length === 2 && alive(job.pid) && kids.every(alive), "cÃ¢y viá»‡c chÆ°a cháº¡y Ä‘á»§");
  return { child, pids: [job.pid, ...kids], tokenFile };
}

async function gone(pids, ms) { const until = Date.now() + ms; while (Date.now() < until) { if (!pids.some(alive)) return true; await sleep(100); } return false; }

test("tiáº¿n trÃ¬nh cha gá»­i 'stop' qua IPC â†’ ctl dá»«ng cáº£ cÃ¢y viá»‡c rá»“i thoÃ¡t, xÃ³a token", async (t) => {
  const { child, pids, tokenFile } = await startCtlWithTree(t);
  const exited = new Promise((ok) => child.on("exit", ok));
  child.send("stop");
  assert.strictEqual(await Promise.race([exited, hang(10000)]), 0);
  assert.ok(await gone(pids, 3000), "cÃ²n tiáº¿n trÃ¬nh má»“ cÃ´i: " + pids.filter(alive).join(","));
  assert.ok(!fs.existsSync(tokenFile), "token chÆ°a bá»‹ xÃ³a");
});

test("tiáº¿n trÃ¬nh cha cháº¿t (kÃªnh IPC Ä‘á»©t) â†’ ctl váº«n dá»«ng cáº£ cÃ¢y viá»‡c rá»“i thoÃ¡t", async (t) => {
  const { child, pids } = await startCtlWithTree(t);
  const exited = new Promise((ok) => child.on("exit", ok));
  child.disconnect();
  assert.strictEqual(await Promise.race([exited, hang(10000)]), 0);
  assert.ok(await gone(pids, 3000), "cÃ²n tiáº¿n trÃ¬nh má»“ cÃ´i: " + pids.filter(alive).join(","));
});
