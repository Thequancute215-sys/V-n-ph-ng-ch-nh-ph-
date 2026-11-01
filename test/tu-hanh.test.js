// Chu trình tự hành (CEO quyết 02/11/2026): nạp repo mới tự sinh agent.md; bàn giao hợp lệ thì ctl tự duyệt + chạy vai kế tiếp,
// dừng ở đúng các điều kiện ngắt mạch. CLI AI thật được thay bằng script node giả (qua ctl-agents.json).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const { createCtl } = require("../ctl/main");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-tu-hanh-"));
const dir = path.join(tmp, "home"), repo = path.join(tmp, "repo"), counter = path.join(tmp, "dem-claude");
let ctl, port;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const AGENT_MD = "# AGENT.MD\n## [4] KHÓA LƯỢT & NHẬT KÝ\n- CURRENT_PHASE: Phase 1 - Thử\n- LAST_UPDATED_BY: CEO\n- NEXT_OWNER (MUTEX LOCK): CLAUDE_AUDITOR\n";

function call(method, p, body) {
  return new Promise((ok, bad) => {
    const h = { host: "127.0.0.1:" + port, authorization: "Bearer " + ctl.token };
    if (body !== undefined) h["content-type"] = "application/json";
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: h }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} ok({ status: res.statusCode, json: j, text: b }); });
    });
    r.on("error", bad); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
// AI giả. Claude: lần thứ doneAt trở đi thêm "done":true (doneAt = 0: không bao giờ xong). Codex: in thêm `extra` trước JSON.
const claude = (doneAt) => [process.execPath, "-e", `const fs=require("fs"),f=${JSON.stringify(counter)};const n=(fs.existsSync(f)?+fs.readFileSync(f,"utf8"):0)+1;fs.writeFileSync(f,String(n));
console.log(JSON.stringify(Object.assign({role:"CLAUDE_AUDITOR",next_owner:"CODEX_ASTRA_DEV",files:["agent.md"],claim_fixed:[]},${doneAt}&&n>=${doneAt}?{done:true}:{})))`, "{prompt}"];
const codex = (extra = "", json = true) => [process.execPath, "-e", `console.log(${JSON.stringify(extra)});${json ? 'console.log(JSON.stringify({role:"CODEX_ASTRA_DEV",next_owner:"CLAUDE_AUDITOR",files:["a.js"],claim_fixed:[]}))' : ""}`, "{prompt}"];
const agents = (m) => fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(m));
function reset(settings) {
  fs.writeFileSync(path.join(repo, "agent.md"), AGENT_MD);
  git(repo, "commit", "-qam", "trả lượt về Claude", "--allow-empty");
  fs.rmSync(counter, { force: true });
  ctl.runner.setSettings({ autoDispatch: true, maxTurns: 5, maxRework: 2, ...settings }, "test");
}
async function chainEnd() {
  for (let i = 0; i < 300; i++) { const c = ctl.runner.status(repo).auto.chain; if (c && c.stopped && !ctl.jobs.aiBusy(fs.realpathSync(repo))) return c; await sleep(50); }
  throw new Error("chu trình không dừng");
}
const syncs = () => git(repo, "log", "--format=%s").split("\n").filter((s) => s.startsWith("chore(agent-sync)"));

test.before(async () => {
  fs.mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q"); git(repo, "config", "user.email", "test@local"); git(repo, "config", "user.name", "test");
  fs.writeFileSync(path.join(repo, "agent.md"), AGENT_MD);
  git(repo, "add", "agent.md"); git(repo, "commit", "-qm", "khởi tạo");
  ctl = createCtl({ dir });
  await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok));
  port = ctl.server.address().port;
  await call("POST", "/workspaces", { path: repo });
});
test.after(async () => { await ctl.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test("tự hành: Claude → Codex → Claude nghiệm thu xong, ctl tự duyệt từng lượt và dừng báo hoàn tất", async () => {
  reset();
  agents({ CLAUDE_AUDITOR: claude(2), CODEX_ASTRA_DEV: codex() });
  const before = syncs().length;
  const r = await call("POST", "/ai/run", { workspace: repo, role: "CLAUDE_AUDITOR", task: "thêm hàm cộng" });
  assert.strictEqual(r.status, 201, r.text);
  const c = await chainEnd();
  assert.strictEqual(c.stopped.finished, true, c.stopped.reason);
  assert.deepStrictEqual(c.roles, ["CLAUDE_AUDITOR", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR"]);
  assert.strictEqual(syncs().length - before, 3, "mỗi lượt phải có 1 commit chore(agent-sync)");
  assert.strictEqual((await call("GET", "/handoffs")).json.handoffs.length, 0, "không còn bàn giao nào chờ CEO");
  const acts = ctl.audit.recent(200).map((a) => a.actor + ":" + a.action);
  assert.ok(acts.includes("auto-dispatch:handoff.approve") && acts.includes("ctl:auto.finished"));
});

test("ngắt mạch: đủ maxTurns lượt thì dừng, lượt kế tiếp chờ CEO", async () => {
  reset({ maxTurns: 2 });
  agents({ CLAUDE_AUDITOR: claude(0), CODEX_ASTRA_DEV: codex() });
  await call("POST", "/ai/run", { workspace: repo, role: "CLAUDE_AUDITOR" });
  const c = await chainEnd();
  assert.strictEqual(c.turns, 2);
  assert.match(c.stopped.reason, /đủ 2 lượt/);
  assert.strictEqual(ctl.runner.status(repo).turn.nextOwner, "CLAUDE_AUDITOR");
  assert.strictEqual(ctl.runner.status(repo).runnable, true);
});

test("ngắt mạch: Claude trả về Codex quá maxRework lần thì dừng", async () => {
  reset({ maxTurns: 10, maxRework: 1 });
  agents({ CLAUDE_AUDITOR: claude(0), CODEX_ASTRA_DEV: codex() });
  await call("POST", "/ai/run", { workspace: repo, role: "CLAUDE_AUDITOR" });
  const c = await chainEnd();
  assert.match(c.stopped.reason, /Codex đã sửa 1 lần/);
  assert.deepStrictEqual(c.roles, ["CLAUDE_AUDITOR", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR"]);
});

test("ngắt mạch: bàn giao thiếu JSON hoặc log có chuỗi giống khóa thì không tự duyệt, để CEO quyết", async () => {
  for (const [cx, why] of [[codex("quên in JSON", false), /không bàn giao được/], [codex("sk-ant-" + "a".repeat(40)), /giống khóa/]]) {
    reset();
    agents({ CLAUDE_AUDITOR: claude(0), CODEX_ASTRA_DEV: cx });
    await call("POST", "/ai/run", { workspace: repo, role: "CLAUDE_AUDITOR" });
    const c = await chainEnd();
    assert.match(c.stopped.reason, why);
    const open = (await call("GET", "/handoffs")).json.handoffs;
    assert.strictEqual(open.length, 1, "bàn giao của Codex phải nằm chờ CEO");
    assert.strictEqual((await call("POST", `/handoffs/${open[0].job_id}/reject`, {})).status, 200);
  }
});

test("tắt tự hành: bàn giao chờ duyệt tay như cũ; cài đặt sai bị từ chối", async () => {
  reset({ autoDispatch: false });
  agents({ CLAUDE_AUDITOR: claude(0) });
  const r = await call("POST", "/ai/run", { workspace: repo, role: "CLAUDE_AUDITOR" });
  for (let i = 0; i < 100 && !ctl.runner.get(r.json.job.id); i++) await sleep(50);
  assert.strictEqual(ctl.runner.get(r.json.job.id).decided, null);
  assert.strictEqual(ctl.runner.status(repo).auto.enabled, false);
  assert.strictEqual((await call("POST", `/handoffs/${r.json.job.id}/reject`, {})).status, 200);
  assert.strictEqual((await call("POST", "/settings", { maxTurns: 99 })).status, 400);
  assert.strictEqual((await call("POST", "/settings", { autoDispatch: "có" })).status, 400);
  assert.strictEqual((await call("GET", "/settings")).json.settings.autoDispatch, false);
});

test("nạp repo chưa có agent.md: tự tạo theo mẫu v2.2, lượt đầu cho Claude, lần duyệt đầu commit luôn agent.md", async () => {
  const fresh = path.join(tmp, "repo-moi");
  fs.mkdirSync(fresh);
  git(fresh, "init", "-q"); git(fresh, "config", "user.email", "test@local"); git(fresh, "config", "user.name", "test");
  fs.writeFileSync(path.join(fresh, "pyproject.toml"), "[project]\nname='x'\n");
  const r = await call("POST", "/workspaces", { path: fresh });
  assert.strictEqual(r.status, 201, r.text);
  assert.deepStrictEqual(r.json.workspace.agentMd, { created: true, stack: ["Python"] });
  const md = fs.readFileSync(path.join(fresh, "agent.md"), "utf8");
  assert.match(md, /- Tên dự án: repo-moi/);
  assert.match(md, /NEXT_OWNER \(MUTEX LOCK\): CLAUDE_AUDITOR/);
  assert.doesNotMatch(md, /\{\{/);
  // Đăng ký lại không ghi đè agent.md đã có (kể cả bản người dùng đã sửa).
  fs.appendFileSync(path.join(fresh, "agent.md"), "- ghi chú của CEO\n");
  assert.strictEqual((await call("POST", "/workspaces", { path: fresh })).json.workspace.agentMd.created, false);
  assert.match(fs.readFileSync(path.join(fresh, "agent.md"), "utf8"), /ghi chú của CEO/);
  // Duyệt tay lượt đầu: agent.md chưa được git theo dõi vẫn commit được.
  ctl.runner.setSettings({ autoDispatch: false }, "test");
  agents({ CLAUDE_AUDITOR: claude(0) });
  const run = await call("POST", "/ai/run", { workspace: fresh, role: "CLAUDE_AUDITOR" });
  assert.strictEqual(run.status, 201, run.text);
  for (let i = 0; i < 100 && !ctl.runner.get(run.json.job.id); i++) await sleep(50);
  const a = await call("POST", `/handoffs/${run.json.job.id}/approve`, {});
  assert.strictEqual(a.status, 200, a.text);
  assert.strictEqual(git(fresh, "log", "-1", "--format=%s"), "chore(agent-sync): CLAUDE_AUDITOR -> NEXT: CODEX_ASTRA_DEV");
  assert.strictEqual(git(fresh, "ls-files", "agent.md"), "agent.md");
});
