"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const spec = "SPEC_ARCHITECT", sol = "SOL_ARCHITECT_PLANNER", dev = "CODEX_ASTRA_DEV", claude = "CLAUDE_AUDITOR";

// CLI giả: lượt đầu tiên của Codex (Sol) báo hết hạn mức như Codex thật, các lượt sau làm bình thường.
async function fixture(t, { webMode = "ok" } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-quota-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), `# Agent\n## [1] HIẾN PHÁP\n- Tên dự án: Thử hạn mức\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 2 - Thử\n- LAST_UPDATED_BY: ${spec}\n- NEXT_OWNER (MUTEX LOCK): ${sol}\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n`);
  git("add", "agent.md"); git("commit", "-qm", "init");
  const marker = path.join(temp, "da-het-han-muc"), fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, `const fs=require('fs');const role=process.argv[2],web=process.argv[3],marker=${JSON.stringify(marker)};
    if(role==='CLAUDE_WEB_PROMPT'){ if(web==='quota'){console.log(JSON.stringify({result:"Claude AI usage limit reached"}));process.exit(1);} console.log(JSON.stringify({result:"===MASTER_PROMPT===\\nBạn là Sol, kiến trúc sư. FILE: src/a.js ...\\n===CHUAN_DAU_RA===\\nIn nguyên văn Vùng [3] và dòng JSON bàn giao."}));return; }
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo.'}));return;}
    if(role==='${sol}'&&!fs.existsSync(marker)){fs.writeFileSync(marker,'1');console.log(JSON.stringify({type:'error',message:"You've hit your usage limit. Upgrade to Pro or try again in 3 minutes."}));process.exit(1);}
    const next={SOL_ARCHITECT_PLANNER:'CODEX_ASTRA_DEV',CODEX_ASTRA_DEV:'CLAUDE_AUDITOR',CLAUDE_AUDITOR:'SPEC_ARCHITECT'}[role];
    console.log(JSON.stringify({result:'Xong lượt.\\n'+JSON.stringify({role,next_owner:next,files:[],claim_fixed:[]})}));`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries([spec, sol, dev, claude, "CLAUDE_REPORTER", "CLAUDE_WEB_PROMPT"].map((role) => [role, [process.execPath, fake, role, webMode, "{prompt}"]]))));
  const ctl = createCtl({ dir });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  ctl.ws.add(repo);
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, ...await r.json() };
  };
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const until = async (id, ok, what) => { for (let i = 0; i < 200; i++) { const run = ctl.autopilot.get(id); if (ok(run)) return run; await sleep(50); } assert.fail("Không tới " + what + ": " + JSON.stringify(ctl.autopilot.get(id))); };
  const wait = (id, status) => until(id, (r) => r.status === status, status);
  return { ctl, repo, call, wait, until };
}

test("hết hạn mức: luồng chờ đúng giờ CLI báo, không báo lỗi, không tính vào giới hạn lượt", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t);
  const started = Date.now();
  const r = await call("/autopilot", { workspace: repo, task: "Thiết kế API đăng nhập", maxSteps: 3 });
  const run = await wait(r.run.id, "waiting_quota");
  assert.equal(run.wait.role, sol); assert.equal(run.wait.providerName, "Codex");
  assert.equal(run.wait.source, "thông báo của CLI");
  assert.ok(run.wait.until >= started + 4 * 60000 - 2000 && run.wait.until <= Date.now() + 4 * 60000 + 2000, "3 phút + 1 phút dự phòng");
  assert.match(run.wait.message, /usage limit/);
  assert.equal(run.steps[0].quota, true);
  assert.equal(ctl.runner.get(run.steps[0].jobId).decided, "rejected", "bàn giao hỏng của lượt hết hạn mức không chặn lượt chạy lại");
  assert.equal(ctl.autopilot.busy(repo), true, "dự án vẫn bận, không nhận luồng khác");
  assert.equal(ctl.runner.status(repo).turn.nextOwner, sol, "lượt giữ nguyên để chạy lại");
  // CEO bấm "Chạy lại ngay": chạy lại đúng lượt Sol rồi đi tiếp hết chuỗi trong giới hạn 3 lượt
  assert.equal((await call(`/autopilot/${run.id}/resume`, {})).run.status, "running");
  const done = await wait(run.id, "awaiting_approval");
  assert.deepEqual(done.steps.map((s) => s.role), [sol, sol, dev, claude]);
  assert.equal(done.problem, "", "lượt hết hạn mức không bị tính là lỗi hay vượt giới hạn");
});

test("hết hạn mức: tới giờ mở lại thì tự chạy tiếp; giờ từ bộ theo dõi hạn mức được ưu tiên", async (t) => {
  const { ctl, repo, call, wait, until } = await fixture(t);
  const reset = new Date(Date.now() + 2 * 3600000).toISOString();
  ctl.quotas.snapshot = () => ({ providers: [{ id: "codex", status: "ready", buckets: [{ remainingPercent: 0, resetAt: reset }] }] });
  const r = await call("/autopilot", { workspace: repo, task: "Thiết kế API", maxSteps: 3 });
  const run = await wait(r.run.id, "waiting_quota");
  assert.equal(run.wait.source, "theo dõi hạn mức");
  assert.equal(run.wait.until, Date.parse(reset) + 60000);
  ctl.autopilot.get(run.id).wait.until = Date.now() - 1;   // giả lập đã tới giờ mở lại
  await until(run.id, (x) => x.steps.length > 1, "chạy lại");
  assert.equal((await wait(run.id, "awaiting_approval")).steps[1].role, sol);
});

test("master prompt: Claude còn hạn mức thì đội trưởng soạn, tách đúng prompt và chuẩn đầu ra", async (t) => {
  const { ctl, repo, call, wait, until } = await fixture(t);
  const r = await call("/autopilot", { workspace: repo, task: "Thiết kế API đăng nhập" });
  await wait(r.run.id, "waiting_quota");
  assert.equal((await call("/autopilot/nope/web-prompt", {})).status, 404);
  const asked = await call(`/autopilot/${r.run.id}/web-prompt`, {});
  assert.equal(asked.status, 202); assert.equal(asked.run.web.status, "writing"); assert.equal(asked.run.web.writer, "Claude (đội trưởng)");
  assert.deepEqual(asked.run.web.quotas.map((q) => q.id), ["codex", "claude", "antigravity"]);
  const run = await until(r.run.id, (x) => x.web?.status === "ready", "soạn xong");
  assert.match(run.web.prompt, /^Bạn là Sol/); assert.match(run.web.spec, /Vùng \[3\]/); assert.equal(run.web.note, "");
  assert.equal(run.status, "waiting_quota", "soạn prompt không làm luồng chạy tiếp");
  const job = ctl.jobs.get(run.web.jobId);
  assert.equal(job.agent, "CLAUDE_WEB_PROMPT");
});

test("master prompt: Claude cũng hết hạn mức thì dùng mẫu từ agent.md, ghi rõ không kèm mã nguồn", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t);
  ctl.quotas.snapshot = () => ({ providers: [{ id: "claude", status: "ready", buckets: [{ remainingPercent: 0, resetAt: new Date(Date.now() + 3600000).toISOString() }] }] });
  const r = await call("/autopilot", { workspace: repo, task: "Thiết kế API đăng nhập" });
  await wait(r.run.id, "waiting_quota");
  const run = (await call(`/autopilot/${r.run.id}/web-prompt`, {})).run;
  assert.equal(run.web.status, "ready"); assert.equal(run.web.writer, "Mẫu tự động từ agent.md");
  assert.match(run.web.note, /không kèm mã nguồn/);
  assert.match(run.web.prompt, /Thiết kế API đăng nhập/); assert.match(run.web.prompt, /Tên dự án: Thử hạn mức/);
  assert.match(run.web.spec, /"role":"SOL_ARCHITECT_PLANNER"/);
  assert.equal(run.web.quotas.find((q) => q.id === "claude").state, "hết");
});

test("master prompt: Claude báo hết hạn mức giữa chừng thì chuyển sang mẫu; dừng được luồng đang chờ", async (t) => {
  const { ctl, repo, call, wait, until } = await fixture(t, { webMode: "quota" });
  const r = await call("/autopilot", { workspace: repo, task: "Thiết kế API" });
  await wait(r.run.id, "waiting_quota");
  await call(`/autopilot/${r.run.id}/web-prompt`, {});
  const run = await until(r.run.id, (x) => x.web?.status === "ready", "soạn xong");
  assert.equal(run.web.writer, "Mẫu tự động từ agent.md"); assert.match(run.web.note, /Claude vừa báo hết hạn mức/);
  assert.equal((await call(`/autopilot/${r.run.id}/stop`, {})).run.status, "stopped");
  assert.equal(ctl.autopilot.busy(repo), false);
  assert.equal((await call(`/autopilot/${r.run.id}/resume`, {})).status, 409);
});
