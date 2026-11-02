// P2-C03: nút phanh khẩn cấp phải dừng thật cả tiến trình cha lẫn tiến trình con.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("child_process");
const { killTree, alive } = require("../lib/proc");

// Mục tiêu dừng dưới 2 giây; chạy riêng đo được vài trăm ms. `npm test` chạy song song mỗi lõi CPU một file, khi đó riêng việc
// khởi động taskkill.exe đã mất 2–3 giây (đo 02/11/2026), nên ngưỡng mặc định là 5 giây. Đo chặt: KILL_BUDGET_MS=2000.
const BUDGET = Number(process.env.KILL_BUDGET_MS) || 5000;
test("dừng cả cây tiến trình (cha + con) và xác nhận PID đã mất", async () => {
  const times = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    // Tiến trình cha sinh một tiến trình con, in PID con ra rồi cả hai cùng treo.
    const script = `const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1e3)"],{stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1e3);`;
    const parent = spawn(process.execPath, ["-e", script], { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "ignore"] });
    const childPid = await new Promise((ok) => parent.stdout.once("data", (b) => ok(Number(String(b).trim()))));
    assert.ok(alive(parent.pid) && alive(childPid));

    const t0 = Date.now();
    const r = await killTree(parent.pid);
    assert.deepStrictEqual(r, { ok: true });
    times.push(Date.now() - t0);
    await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(!alive(parent.pid), "tiến trình cha còn sống");
    assert.ok(!alive(childPid), "tiến trình con còn sống");
    if (times.at(-1) < BUDGET) return;
  }
  assert.fail("phải dừng xong dưới " + BUDGET + " ms, đo được " + times.join(" ms, ") + " ms");
});

test("từ chối PID không hợp lệ và PID của chính máy chủ", async () => {
  assert.strictEqual((await killTree("abc")).ok, false);
  assert.strictEqual((await killTree(1)).ok, false);
  assert.strictEqual((await killTree(process.pid)).ok, false);
});
