"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { checkHandoff } = require("../ctl/handoff");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Codex giả nhận lệnh giống codex thật ("exec … prompt") và in lại tham số; Claude lần đầu nâng effort cho Astra rồi trả về, lần sau nghiệm thu.
async function fixture(t, claudePlan) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-model-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 3\n- LAST_UPDATED_BY: SPEC_ARCHITECT\n- NEXT_OWNER (MUTEX LOCK): SOL_ARCHITECT_PLANNER\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n");
  git("add", "agent.md"); git("commit", "-qm", "init");
  const count = path.join(temp, "claude-count"), fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, `const fs=require('fs');const args=process.argv.slice(2);const prompt=args[args.length-1];
    const role=(/Bạn là (\\w+)/.exec(prompt)||[])[1];
    console.log(JSON.stringify({argv:args.slice(0,-1)}));
    let h;
    if(role==='CLAUDE_AUDITOR'){const n=fs.existsSync(${JSON.stringify(count)})?Number(fs.readFileSync(${JSON.stringify(count)},'utf8')):0;fs.writeFileSync(${JSON.stringify(count)},String(n+1));
      const plan=${JSON.stringify(claudePlan)}[n]||{next_owner:'SPEC_ARCHITECT',done:true};h={role,files:[],claim_fixed:[],giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}],...plan};}
    else h={role,next_owner:{SOL_ARCHITECT_PLANNER:'CODEX_ASTRA_DEV',CODEX_ASTRA_DEV:'CLAUDE_AUDITOR'}[role],files:[],claim_fixed:[],giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}]};
    console.log(JSON.stringify({result:'Xong.\\n'+JSON.stringify(h)}));`);
  const codex = [process.execPath, fake, "exec", "--json", "{prompt}"];
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify({ SOL_ARCHITECT_PLANNER: codex, SOL_ARCHITECT_ADVISOR: codex, CODEX_ASTRA_DEV: codex,
    CLAUDE_AUDITOR: [process.execPath, fake, "-p", "{prompt}"], CLAUDE_REPORTER: [process.execPath, fake, "-p", "{prompt}"], SPEC_ARCHITECT: [process.execPath, fake, "-p", "{prompt}"] }));
  const ctl = createCtl({ dir });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  ctl.ws.add(repo);
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const argvOf = (jobId) => JSON.parse(ctl.jobs.rawLog(jobId).split(/\r?\n/).find((l) => l.startsWith('{"argv"'))).argv;
  const wait = async (id, status) => { for (let i = 0; i < 200; i++) { const r = ctl.autopilot.get(id); if (r.status === status) return r; if (r.status === "attention") assert.fail(r.problem); await sleep(50); } assert.fail("Không tới " + status + ": " + JSON.stringify(ctl.autopilot.get(id))); };
  return { ctl, repo, argvOf, wait };
}

// Mức suy nghĩ do ctl/dieu-phoi.js chọn theo độ khó (CEO duyệt 11/11/2026): Sol lập kiến trúc là việc nặng (xhigh),
// Astra viết code việc thường (high, CEO chọn 22/11/2026); đội trưởng đặt rõ mức thì thắng điều phối tự động.
test("Codex: Sol chạy gpt-6.2-sol mức xhigh (kiến trúc), Astra gpt-6.2-astra mức high; đội trưởng nâng Astra lên xhigh không cần hỏi CEO", async (t) => {
  const { ctl, repo, argvOf, wait } = await fixture(t, [{ next_owner: "CODEX_ASTRA_DEV", effort: "xhigh" }]);
  const run = await wait(ctl.autopilot.start({ workspace: repo, task: "Viết API đăng nhập" }).id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => [s.role, s.model, s.effort]), [
    ["SOL_ARCHITECT_PLANNER", "gpt-6.2-sol", "xhigh"],
    ["CODEX_ASTRA_DEV", "gpt-6.2-astra", "high"],
    ["CLAUDE_AUDITOR", undefined, undefined],
    ["CODEX_ASTRA_DEV", "gpt-6.2-astra", "xhigh"],
    ["CLAUDE_AUDITOR", undefined, undefined],
  ]);
  assert.deepEqual(argvOf(run.steps[0].jobId), ["exec", "-m", "gpt-6.2-sol", "-c", "model_reasoning_effort=xhigh", "--json"]);
  assert.equal(run.steps[0].tier, "nang"); assert.equal(run.steps[1].tier, "vua");
  assert.match(run.steps[3].tierWhy.join(" | "), /đội trưởng đặt mức xhigh/);
  assert.deepEqual(argvOf(run.steps[3].jobId), ["exec", "-m", "gpt-6.2-astra", "-c", "model_reasoning_effort=xhigh", "--json"]);
  assert.deepEqual(argvOf(run.steps[2].jobId), ["-p"], "Claude không bị gắn cờ của Codex");
  assert.equal(run.question, null, "nâng effort không tạo câu hỏi cho CEO");
});

test("Codex: chỉ đội trưởng đặt được effort; 'ultra' và giá trị lạ bị từ chối; lệnh tự cấu hình -m được giữ nguyên", async () => {
  const base = { files: [], claim_fixed: [] };
  assert.deepEqual(checkHandoff({ role: "CLAUDE_AUDITOR", next_owner: "CODEX_ASTRA_DEV", effort: "xhigh", ...base }, "CLAUDE_AUDITOR"), []);
  assert.match(checkHandoff({ role: "CODEX_ASTRA_DEV", next_owner: "CLAUDE_AUDITOR", effort: "high", ...base }, "CODEX_ASTRA_DEV").join(), /chỉ CLAUDE_AUDITOR/);
  assert.match(checkHandoff({ role: "CLAUDE_AUDITOR", next_owner: "CODEX_ASTRA_DEV", effort: "ultra", ...base }, "CLAUDE_AUDITOR").join(), /effort phải là/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-model2-"));
  try {
    const dir = path.join(tmp, "home"), repo = path.join(tmp, "repo"); fs.mkdirSync(dir); fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "agent.md"), "- LAST_UPDATED_BY: X\n- NEXT_OWNER: CODEX_ASTRA_DEV\n");
    const fake = path.join(tmp, "f.cjs"); fs.writeFileSync(fake, "console.log(JSON.stringify({argv:process.argv.slice(2,-1)}))");
    fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify({ CODEX_ASTRA_DEV: [process.execPath, fake, "exec", "-m", "gpt-6-sol", "{prompt}"] }));
    const ctl = createCtl({ dir }); ctl.ws.add(repo);
    assert.throws(() => ctl.runner.run({ workspace: repo, role: "CODEX_ASTRA_DEV", effort: "ultra" }), /Mức suy luận/);
    const job = ctl.runner.run({ workspace: repo, role: "CODEX_ASTRA_DEV", effort: "max" });
    for (let i = 0; i < 100 && ctl.jobs.get(job.id).status === "running"; i++) await sleep(30);
    assert.deepEqual(JSON.parse(ctl.jobs.rawLog(job.id).split(/\r?\n/)[0]).argv, ["exec", "-c", "model_reasoning_effort=max", "-m", "gpt-6-sol"]);
    await ctl.close();
  } finally { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

// CEO chọn model ngoài chế độ tự động (16/11/2026): cố định model + mức cho phòng Itachi thì Sol chạy đúng model đó.
test("Codex: CEO cố định gpt-6.1-terra mức ultra cho Itachi thì Sol chạy đúng như vậy, Astra vẫn tự động", async (t) => {
  const { ctl, repo, argvOf, wait } = await fixture(t, []);
  ctl.runner.dieuPhoi.save({ coDinh: { itachi: { model: "gpt-6.1-terra", effort: "ultra" } } });
  const run = await wait(ctl.autopilot.start({ workspace: repo, task: "Viết API đăng nhập" }).id, "awaiting_approval");
  assert.deepEqual(argvOf(run.steps[0].jobId), ["exec", "-m", "gpt-6.1-terra", "-c", "model_reasoning_effort=ultra", "--json"]);
  assert.equal(run.steps[0].model, "gpt-6.1-terra");
  assert.deepEqual(argvOf(run.steps[1].jobId), ["exec", "-m", "gpt-6.2-astra", "-c", "model_reasoning_effort=high", "--json"]);
});
