// Chu trình tự động hoàn toàn (CEO quyết 02/11/2026) trên bộ máy duy nhất ctl/autopilot.js:
// ngắt mạch (lộ khóa, Codex sửa quá 2 lần, "done"), Claude hỏi CEO (ask_ceo) rồi chạy tiếp theo phương án CEO chọn,
// trả lời câu hỏi khi chạy tay, và nạp repo mới tự sinh agent.md. CLI AI thật được thay bằng script node giả.
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
const SPEC = "SPEC_ARCHITECT", SOL = "SOL_ARCHITECT_PLANNER", DEV = "CODEX_ASTRA_DEV", CLAUDE = "CLAUDE_AUDITOR";
const ASK = { question: "Sol thêm hàng đợi Redis không cần thiết: đốt chi phí, khó bảo trì.", options: [
  { id: "A", label: "Bắt Sol cắt hàng đợi", next_owner: SOL, task: "Cắt hàng đợi Redis khỏi Vùng [3]" },
  { id: "B", label: "Giữ hướng hiện tại", next_owner: DEV }] };

// AI giả: argv = [vai, kịch bản, thư mục đếm, prompt]. Mỗi vai đếm số lần được gọi để kịch bản đổi theo lượt.
const FAKE = `const fs=require("fs"),path=require("path");const [role,mode,dir,prompt]=process.argv.slice(2);
const f=path.join(dir,role);const n=(fs.existsSync(f)?+fs.readFileSync(f,"utf8"):0)+1;fs.writeFileSync(f,String(n));
const out=(o)=>console.log(JSON.stringify({result:"Xong lượt.\\n"+JSON.stringify(Object.assign({role,files:[],claim_fixed:[]},o))}));
if(role==="CLAUDE_REPORTER"){console.log(JSON.stringify({result:"Claude báo cáo: luồng dừng, CEO xem."}));process.exit(0);}
if(mode==="ask"){
  if(role==="CLAUDE_AUDITOR"&&n===1){if(!prompt.includes('"ask_ceo"'))process.exit(4);out({next_owner:"CODEX_ASTRA_DEV",ask_ceo:${JSON.stringify(ASK)}});return;}
  if(role==="SOL_ARCHITECT_PLANNER"){if(!prompt.includes("Cắt hàng đợi Redis")||!prompt.includes("chọn A"))process.exit(3);out({next_owner:"CLAUDE_AUDITOR"});return;}
  if(role==="CLAUDE_AUDITOR"){out({next_owner:"CODEX_ASTRA_DEV",done:true});return;}
}
if(mode==="done"&&role==="CLAUDE_AUDITOR"){out({next_owner:"CODEX_ASTRA_DEV",done:true});return;}
if(mode==="key"&&role==="CODEX_ASTRA_DEV")console.log("đã đặt khóa sk-ant-"+"a".repeat(40));
if(role==="CLAUDE_AUDITOR")return out({next_owner:"CODEX_ASTRA_DEV"}); // mode rework: Claude luôn trả về Codex
out({next_owner:"CLAUDE_AUDITOR"});`;

async function fixture(t, mode, nextOwner = CLAUDE) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-tu-hanh-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo"), counts = path.join(temp, "dem");
  fs.mkdirSync(dir); fs.mkdirSync(repo); fs.mkdirSync(counts);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), `# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1 - Thử\n- LAST_UPDATED_BY: CEO\n- NEXT_OWNER (MUTEX LOCK): ${nextOwner}\n`);
  git("add", "agent.md"); git("commit", "-qm", "init");
  const fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, FAKE);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries([SPEC, SOL, DEV, CLAUDE, "CLAUDE_REPORTER"].map((role) => [role, [process.execPath, fake, role, mode, counts, "{prompt}"]]))));
  const ctl = createCtl({ dir });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  ctl.ws.add(repo);
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, ...await r.json() };
  };
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  const wait = async (id, status) => { for (let i = 0; i < 300; i++) { const run = ctl.autopilot.get(id); if (run.status === status) return run; if (run.status === "attention") assert.fail(run.problem); await sleep(50); } assert.fail("Không tới " + status + ": " + JSON.stringify(ctl.autopilot.get(id))); };
  return { ctl, repo, git, call, wait };
}

test("Claude hỏi CEO trong luồng tự động: chờ, CEO chọn A → Sol nhận lệnh + quyết định, chạy tiếp tới khi Claude xong", async (t) => {
  const { ctl, repo, git, call, wait } = await fixture(t, "ask");
  const r = await call("/autopilot", { workspace: repo, task: "Thẩm định kiến trúc" });
  assert.equal(r.status, 201);
  const asked = await wait(r.run.id, "awaiting_answer");
  assert.equal(asked.question.options.length, 2);
  assert.equal(ctl.autopilot.busy(repo), true, "đang chờ CEO thì không giao việc khác");
  assert.equal((await call(`/handoffs/${asked.question.jobId}/approve`, {})).code, "NEEDS_ANSWER", "phải chọn phương án, không duyệt thẳng");
  assert.equal((await call(`/autopilot/${r.run.id}/answer`, { option: "Z" })).status, 400);
  const a = await call(`/autopilot/${r.run.id}/answer`, { option: "A" });
  assert.equal(a.status, 200, JSON.stringify(a));
  assert.match(git("log", "--format=%s"), /CLAUDE_AUDITOR -> NEXT: SOL_ARCHITECT_PLANNER — CEO chọn A/);
  const done = await wait(r.run.id, "awaiting_approval");
  assert.deepEqual(done.steps.map((s) => s.role), [CLAUDE, SOL, CLAUDE]);
  assert.equal(done.decisions[0].option, "A");
  assert.equal(done.problem, "");
  assert.ok(ctl.audit.recent(200).some((x) => x.action === "autopilot.answer"));
});

test("ngắt mạch: log có chuỗi giống khóa API → không tự duyệt, Claude báo cáo cho CEO", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t, "key", DEV);
  const r = await call("/autopilot", { workspace: repo, task: "Thử lộ khóa" });
  const run = await wait(r.run.id, "awaiting_approval");
  assert.match(run.problem, /giống khóa API/);
  assert.equal(run.steps.length, 1);
  assert.notEqual(ctl.runner.get(run.steps[0].jobId).decided, "approved");
});

test("ngắt mạch: Claude trả việc về Codex quá 2 lần → dừng, CEO quyết", async (t) => {
  const { repo, call, wait } = await fixture(t, "rework", DEV);
  const r = await call("/autopilot", { workspace: repo, task: "Sửa mãi không xong", maxSteps: 12 });
  const run = await wait(r.run.id, "awaiting_approval");
  assert.match(run.problem, /Codex đã sửa 2 lần/);
  assert.deepEqual(run.steps.map((s) => s.role), [DEV, CLAUDE, DEV, CLAUDE, DEV, CLAUDE]);
});

test("Claude báo done:true thì luồng kết thúc chờ CEO duyệt báo cáo, kể cả khi next_owner là Codex", async (t) => {
  const { ctl, repo, call, wait } = await fixture(t, "done", DEV);
  const r = await call("/autopilot", { workspace: repo, task: "Làm rồi nghiệm thu" });
  const run = await wait(r.run.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), [DEV, CLAUDE]);
  assert.equal(run.problem, "");
  assert.equal(ctl.runner.get(run.finalHandoffId).decided, null, "kết quả cuối vẫn chờ CEO duyệt");
});

test("chạy tay: Claude hỏi → nút phương án qua /handoffs/:id/answer, không tự chạy tiếp", async (t) => {
  const { ctl, repo, git, call } = await fixture(t, "ask");
  const job = (await call("/ai/run", { workspace: repo, role: CLAUDE })).job;
  for (let i = 0; i < 100 && !ctl.runner.get(job.id); i++) await sleep(50);
  const a = await call(`/handoffs/${job.id}/answer`, { option: "B" });
  assert.equal(a.status, 200, JSON.stringify(a));
  assert.equal(a.handoff.next, DEV);
  assert.match(git("log", "-1", "--format=%s"), /NEXT: CODEX_ASTRA_DEV — CEO chọn B/);
  await sleep(300);
  assert.equal(ctl.jobs.list().length, 1, "chạy tay thì không tự chạy lượt kế tiếp");
});

test("schema câu hỏi CEO: chỉ CLAUDE_AUDITOR được hỏi, 2–4 phương án hợp lệ", () => {
  const base = { next_owner: DEV, files: [], claim_fixed: [] };
  assert.deepEqual(checkHandoff({ role: CLAUDE, ...base, ask_ceo: ASK }, CLAUDE), []);
  assert.ok(checkHandoff({ role: DEV, ...base, next_owner: CLAUDE, ask_ceo: ASK }, DEV).some((p) => /chỉ CLAUDE_AUDITOR/.test(p)));
  for (const bad of [{ question: "Q", options: [ASK.options[0]] }, { question: "", options: ASK.options }, { question: "Q", options: [ASK.options[0], { id: "A", label: "trùng" }] },
    { question: "Q", options: [ASK.options[0], { id: "B", label: "z", next_owner: CLAUDE }] }])
    assert.ok(checkHandoff({ role: CLAUDE, ...base, ask_ceo: bad }, CLAUDE).length, JSON.stringify(bad));
  assert.ok(checkHandoff({ role: CLAUDE, ...base, done: "có" }, CLAUDE).length);
});

test("nạp repo chưa có agent.md: tự tạo theo mẫu v2.2, lượt đầu cho Claude, lần duyệt đầu commit luôn agent.md", async (t) => {
  const { ctl, call } = await fixture(t, "rework");
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "vp-repo-moi-"));
  t.after(() => fs.rmSync(fresh, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", a, { cwd: fresh, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.email", "test@local"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(fresh, "pyproject.toml"), "[project]\nname='x'\n");
  const r = await call("/workspaces", { path: fresh });
  assert.equal(r.status, 201, JSON.stringify(r));
  assert.deepEqual(r.workspace.agentMd, { created: true, stack: ["Python"] });
  const md = fs.readFileSync(path.join(fresh, "agent.md"), "utf8");
  assert.match(md, new RegExp("- Tên dự án: " + path.basename(fresh)));
  assert.match(md, /NEXT_OWNER \(MUTEX LOCK\): CLAUDE_AUDITOR/);
  assert.doesNotMatch(md, /\{\{/);
  // Đăng ký lại không ghi đè agent.md đã có (kể cả bản người dùng đã sửa).
  fs.appendFileSync(path.join(fresh, "agent.md"), "- ghi chú của CEO\n");
  assert.equal((await call("/workspaces", { path: fresh })).workspace.agentMd.created, false);
  assert.match(fs.readFileSync(path.join(fresh, "agent.md"), "utf8"), /ghi chú của CEO/);
  // Duyệt tay lượt đầu: agent.md chưa được git theo dõi vẫn commit được.
  const run = await call("/ai/run", { workspace: fresh, role: CLAUDE });
  assert.equal(run.status, 201, JSON.stringify(run));
  for (let i = 0; i < 100 && !ctl.runner.get(run.job.id); i++) await sleep(50);
  const a = await call(`/handoffs/${run.job.id}/approve`, {});
  assert.equal(a.status, 200, JSON.stringify(a));
  assert.equal(git("log", "-1", "--format=%s"), "chore(agent-sync): CLAUDE_AUDITOR -> NEXT: CODEX_ASTRA_DEV");
  assert.equal(git("ls-files", "agent.md"), "agent.md");
});
