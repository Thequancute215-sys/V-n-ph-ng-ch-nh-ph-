"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { createAutopilot } = require("../ctl/autopilot");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const spec = "SPEC_ARCHITECT", sol = "SOL_ARCHITECT_PLANNER", dev = "CODEX_ASTRA_DEV", claude = "CLAUDE_AUDITOR";

async function fixture(t, mode = "normal", ctlOpts = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-auto-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), `# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 7 - Thử tự động\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): ${spec}\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n`);
  git("add", "agent.md"); git("commit", "-qm", "init");
  const fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, `const role=process.argv[2],mode=process.argv[3];
    if(role==='CLAUDE_REPORTER'){ console.log(JSON.stringify({result:mode==='bad-quota'?"You've hit your session limit · resets 2:50am (Asia/Bangkok)":'Claude báo cáo: luồng đã dừng, cần CEO xem nguyên nhân.'}));process.exit(mode==='bad-quota'?1:0); }
    if(mode==='slow'){setInterval(()=>{},1000);return;}
    if(mode.startsWith('bad')){console.log('Không có dòng bàn giao');process.exit(0);}
    let next={SPEC_ARCHITECT:'SOL_ARCHITECT_PLANNER',SOL_ARCHITECT_PLANNER:'CODEX_ASTRA_DEV',CODEX_ASTRA_DEV:'CLAUDE_AUDITOR',CLAUDE_AUDITOR:'SPEC_ARCHITECT'}[role];
    // sol-tu-tro: Sol ghi next_owner trùng vai mình ở lượt đầu; được trả lại (lời giao có "BỊ TRẢ LẠI") thì sửa đúng.
    if(mode==='sol-tu-tro'&&role==='SOL_ARCHITECT_PLANNER'&&!/BỊ TRẢ LẠI/.test(process.argv[4]||''))next=role;
    console.log(JSON.stringify({result:(role==='CLAUDE_AUDITOR'?'Claude báo cáo: đã kiểm thử và hoàn tất.\\n':'Xong lượt.\\n')+JSON.stringify({role,next_owner:next,files:[],claim_fixed:[],giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}]})}));`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries([spec, sol, dev, claude, "CLAUDE_REPORTER"].map((role) => [role, [process.execPath, fake, role, mode, "{prompt}"]]))));
  const ctl = createCtl({ dir, ...ctlOpts });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  ctl.ws.add(repo);
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, ...await r.json() };
  };
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  const wait = async (id, status) => { for (let i = 0; i < 200; i++) { const run = ctl.autopilot.get(id); if (run.status === status) return run; if (run.status === "attention") assert.fail(run.problem); await sleep(50); } assert.fail("Không tới " + status + ": " + JSON.stringify(ctl.autopilot.get(id))); };
  return { ctl, dir, repo, git, call, wait };
}

test("cả chuỗi tự bàn giao nội bộ; dừng ở Claude chờ CEO, không tự duyệt kết quả cuối", async (t) => {
  const { ctl, repo, call, wait, git } = await fixture(t);
  const response = await call("/autopilot", { workspace: repo, task: "Thực hiện việc kiểm thử trong dự án này" });
  assert.equal(response.status, 201);
  const run = await wait(response.run.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), [spec, sol, dev, claude]);
  assert.match(run.report, /Claude báo cáo/);
  assert.equal(ctl.runner.get(run.finalHandoffId).decided, null);
  assert.equal(ctl.runner.status(repo).turn.nextOwner, claude);
  assert.equal((await call("/ai/run", { workspace: repo, role: claude })).status, 409);
  assert.equal((await call("/autopilot", { workspace: repo, task: "khác" })).status, 409);
  assert.equal((await call(`/autopilot/${run.id}/approve`, {})).run.status, "approved");
  assert.equal(ctl.runner.status(repo).turn.nextOwner, spec);
  assert.equal(git("status", "--porcelain"), "");
  assert.equal((await call(`/autopilot/${run.id}/approve`, {})).status, 409);
  await sleep(700); assert.equal(ctl.jobs.list().length, 4);
});

test("bàn giao sai: Claude báo cáo lỗi; nhận báo cáo không duyệt bàn giao sai", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t, "bad");
  const r = await call("/autopilot", { workspace: repo, task: "Thử lỗi bàn giao" });
  const run = await wait(r.run.id, "awaiting_approval");
  assert.match(run.problem, /Không tìm thấy/);
  assert.match(run.report, /Claude báo cáo/);
  assert.equal(run.finalHandoffId, null);
  const invalid = run.steps[0].jobId;
  assert.notEqual(ctl.runner.get(invalid).decided, "approved");
  assert.equal((await call(`/autopilot/${run.id}/approve`, {})).run.status, "acknowledged");
  assert.equal(ctl.runner.get(invalid).decided, "rejected");
  assert.equal(ctl.runner.status(repo).turn.nextOwner, spec);
  assert.equal(ctl.autopilot.busy(repo), false);
});

test("hết giới hạn lượt: không chạy vô hạn, Claude tổng hợp phần còn vướng", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t);
  const r = await call("/autopilot", { workspace: repo, task: "Chạy tối đa hai lượt", maxSteps: 2 });
  const run = await wait(r.run.id, "awaiting_approval");
  assert.equal(run.steps.length, 2);
  assert.match(run.problem, /giới hạn/);
  assert.equal(ctl.jobs.list().length, 3);
  assert.equal(ctl.runner.status(repo).turn.nextOwner, sol);
});

test("Claude hết lượt: báo đúng giới hạn, không báo thành công và có thể đóng lỗi để giao lại", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t, "bad-quota");
  const r = await call("/autopilot", { workspace: repo, task: "Thử giới hạn tài khoản" });
  const run = await wait(r.run.id, "attention");
  assert.match(run.problem, /hết lượt phiên/);
  assert.equal(ctl.autopilot.busy(repo), true);
  assert.equal((await call(`/autopilot/${run.id}/approve`, {})).run.status, "acknowledged");
  assert.equal(ctl.autopilot.busy(repo), false);
  assert.equal(ctl.runner.status(repo).handoffPending, null);
});

test("CEO dừng luồng thì không tự chạy tiếp hoặc tự gọi Claude", async (t) => {
  const { ctl, repo, call } = await fixture(t, "slow");
  const r = await call("/autopilot", { workspace: repo, task: "Việc chạy chậm" });
  const stopped = await call(`/autopilot/${r.run.id}/stop`, {});
  assert.equal(stopped.run.status, "stopped");
  await sleep(900);
  assert.equal(ctl.jobs.list().length, 1);
  assert.equal(ctl.jobs.get(r.run.jobId).status, "killed");
  assert.equal(ctl.autopilot.busy(repo), false);
});

test("kill-all hủy luôn luồng, không phát sinh tiến trình bù", async (t) => {
  const { ctl, repo, call } = await fixture(t, "slow");
  const r = await call("/autopilot", { workspace: repo, task: "Thử phanh khẩn cấp" });
  assert.equal((await call("/kill-all", {})).status, 200);
  await sleep(900);
  assert.equal(ctl.autopilot.get(r.run.id).status, "stopped");
  assert.equal(ctl.jobs.list().length, 1);
});

test("khởi động lại không tự chạy lại việc dang dở; trạng thái báo cáo được giữ", async (t) => {
  const { ctl, dir, repo, call } = await fixture(t, "slow");
  const r = await call("/autopilot", { workspace: repo, task: "Việc đang dang dở" });
  ctl.autopilot.close();
  await ctl.jobs.killAll("test");
  const restored = createAutopilot({ runner: ctl.runner, jobs: ctl.jobs, ws: ctl.ws, audit: ctl.audit, dir });
  try {
    assert.equal(restored.get(r.run.id).status, "attention");
    await sleep(700); assert.equal(ctl.jobs.list().length, 1);
  } finally { restored.close(); }
});

test("Antigravity đang tạm đổi tài khoản để đọc hạn mức (AGY_BUSY): luồng chờ rồi chạy lại đúng lượt đó, không dừng, không gọi Claude báo cáo", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t, "normal", { autopilotOptions: { choAgyMs: 300 } });
  const that = ctl.runner.run; let lan = 0;
  ctl.runner.run = (o, actor) => { if (o.role === sol && lan++ === 0) throw Object.assign(new Error("Văn phòng đang tạm đổi sang tài khoản Antigravity nghỉ"), { code: "AGY_BUSY" }); return that(o, actor); };
  const response = await call("/autopilot", { workspace: repo, task: "Thực hiện việc kiểm thử trong dự án này" });
  const run = await wait(response.run.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), [spec, sol, dev, claude], "chạy lại đúng lượt Sol, không lặp lượt Hinata");
  assert.equal(lan, 2);
  assert.ok(ctl.audit.recent(200).some((a) => a.action === "step.wait_agy"));
});

test("bàn giao sai mẫu (Sol ghi next_owner trùng vai mình): trả lại đúng lượt đó một lần, sửa xong thì luồng chạy tiếp", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t, "sol-tu-tro");
  const response = await call("/autopilot", { workspace: repo, task: "Thực hiện việc kiểm thử trong dự án này" });
  const run = await wait(response.run.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), [spec, sol, sol, dev, claude], "Sol được trả lại một lần rồi luồng chạy tiếp");
  assert.equal(run.steps[2].explainRetried, true);
  assert.match(run.steps[1].explainRejected, /next_owner không được trùng vai hiện tại/);
  assert.equal(ctl.runner.get(run.steps[1].jobId).decided, "rejected");
  assert.ok(ctl.audit.recent(200).some((a) => a.action === "explain.retry"));
});

test("nhánh của luồng chỉ có trên máy: lời giao dặn AI bỏ qua git pull --ff-only đầu phiên (thử thật speak-coach: Sol dừng vì pull lỗi)", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t);
  const response = await call("/autopilot", { workspace: repo, task: "Thực hiện việc kiểm thử trong dự án này" });
  const run = await wait(response.run.id, "awaiting_approval");
  const argv = (ctl.jobs.get(run.steps[0].jobId).argv || []).join(" ");
  assert.match(argv, /BỎ QUA bước git pull --ff-only đầu phiên/);
});
