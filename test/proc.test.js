// P2-C03: nút phanh khẩn cấp phải dừng thật cả tiến trình cha lẫn tiến trình con.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("child_process");
const { killTree, alive } = require("../lib/proc");

test("dừng cả cây tiến trình (cha + con) và xác nhận PID đã mất", async () => {
  // Tiến trình cha sinh một tiến trình con, in PID con ra rồi cả hai cùng treo.
  const script = `const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1e3)"],{stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1e3);`;
  const parent = spawn(process.execPath, ["-e", script], { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "ignore"] });
  const childPid = await new Promise((ok) => parent.stdout.once("data", (b) => ok(Number(String(b).trim()))));
  assert.ok(alive(parent.pid) && alive(childPid));

  const t0 = Date.now();
  const r = await killTree(parent.pid);
  assert.deepStrictEqual(r, { ok: true });
  assert.ok(Date.now() - t0 < 2000, "phải dừng xong dưới 2 giây");
  await new Promise((ok) => setTimeout(ok, 100));
  assert.ok(!alive(parent.pid), "tiến trình cha còn sống");
  assert.ok(!alive(childPid), "tiến trình con còn sống");
});

test("từ chối PID không hợp lệ và PID của chính máy chủ", async () => {
  assert.strictEqual((await killTree("abc")).ok, false);
  assert.strictEqual((await killTree(1)).ok, false);
  assert.strictEqual((await killTree(process.pid)).ok, false);
});
