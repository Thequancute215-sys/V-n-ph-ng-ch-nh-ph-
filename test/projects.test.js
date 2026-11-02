"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createCtl } = require("../ctl/main");

async function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-projects-"));
  const dir = path.join(tmp, "ctl"), a = path.join(tmp, "alpha"), b = path.join(tmp, "beta");
  for (const [root, phase, owner] of [[a, "Phase 7", "CODEX_ASTRA_DEV"], [b, "Phase 2", "CLAUDE_AUDITOR"]]) {
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "agent.md"), `- CURRENT_PHASE: ${phase}\n- NEXT_OWNER: ${owner}\n- LAST_UPDATED_BY: SOL_ARCHITECT_PLANNER\n- [ ] OPEN ngoài vùng\n## [5] KIỂM DUYỆT\n- AUDIT_STATUS: PASS\n  - [ ] OPEN P7-H01\n- [x] RESOLVED P7-H02\n${root === a ? "- [ ] OPEN P7-M01\n" : ""}## [6] KHÁC\n- [ ] OPEN ngoài vùng\n`);
  }
  fs.mkdirSync(path.join(dir, "autopilot"), { recursive: true });
  for (const [id, workspace, status] of [["auto-a", a, "awaiting_approval"], ["auto-b", b, "done"]]) {
    fs.writeFileSync(path.join(dir, "autopilot", id + ".json"), JSON.stringify({ id, workspace, status, task: "token=privatevalue " + "việc ".repeat(80), steps: [{ role: "CLAUDE_AUDITOR", prompt: "hidden-step-prompt" }], createdAt: 100, updatedAt: 200, report: "hidden-report" }));
  }
  const ctl = createCtl({ dir });
  ctl.ws.add(a); ctl.ws.add(b);
  const db = new DatabaseSync(path.join(dir, "ctl.db"));
  const insert = db.prepare("INSERT INTO jobs (id, kind, agent, workspace, argv, status, started_at, ended_at, timeout_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1000)");
  const job = (id, workspace, status, end, opts = {}) => insert.run(id, opts.kind || "cmd", opts.agent || "ceo", workspace,
    JSON.stringify(opts.argv || ["C:\\tools\\node.exe", "/project/check.js", "--check", "hidden-fourth-arg"]), status, 1000, end);
  await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok));
  const call = async () => {
    const r = await fetch("http://127.0.0.1:" + ctl.server.address().port + "/projects", { headers: { Authorization: "Bearer " + ctl.token } });
    assert.equal(r.status, 200);
    return (await r.json()).projects;
  };
  return { tmp, ctl, db, a, b, job, call, cleanup: async () => { db.close(); await ctl.close(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test("projects: hai workspace có lượt, kiểm duyệt và blocker đúng vùng", async () => {
  const f = await fixture();
  try {
    const p = await f.call();
    assert.equal(p.length, 2);
    assert.deepEqual(p.map((x) => [x.name, x.active, x.turn.phase, x.turn.nextOwner, x.openBlockers]), [
      ["alpha", true, "Phase 7", "CODEX_ASTRA_DEV", 2], ["beta", false, "Phase 2", "CLAUDE_AUDITOR", 1],
    ]);
    assert.equal(p[0].auditStatus, "PASS");
    assert.equal(p[0].turn.lastUpdatedBy, "SOL_ARCHITECT_PLANNER");
    assert.equal(p[0].problem, null);
    f.db.prepare("INSERT INTO handoffs (job_id, workspace, role, problems) VALUES (?, ?, ?, ?)").run("handoff-a", f.a, "CLAUDE_AUDITOR", "[]");
    assert.equal((await f.call())[0].handoffPending, "handoff-a");
  } finally { await f.cleanup(); }
});

test("projects: lọc job theo workspace, đếm đủ và lấy 10 việc kết thúc mới nhất", async () => {
  const f = await fixture();
  try {
    f.job("running-a", process.platform === "win32" ? f.a.toUpperCase() : f.a, "running", null);
    f.job("running-b", f.b, "running", null);
    f.job("done-b", f.b, "done", 90000);
    f.job("pending-a", f.a, "pending_approval", null);
    for (let i = 0; i < 110; i++) f.job("done-a-" + i, f.a, "done", 2000 + i * 1000);
    f.job("rejected-a", f.a, "rejected", 200000);
    const [a, b] = await f.call();
    assert.deepEqual(a.running.map((j) => j.id), ["running-a"]);
    assert.deepEqual(b.running.map((j) => j.id), ["running-b"]);
    assert.deepEqual(b.recent.map((j) => j.id), ["done-b"]);
    assert.equal(a.recent.length, 10);
    assert.deepEqual(a.recent.slice(0, 3).map((j) => j.id), ["rejected-a", "done-a-109", "done-a-108"]);
    assert.equal(a.recent[1].durationS, 110);
    assert.equal(a.recent[1].label, "node.exe check.js --check");
    assert.deepEqual(a.counts, { done: 110, pending_approval: 1, rejected: 1, running: 1 });
  } finally { await f.cleanup(); }
});

test("projects: chỉ trả tóm tắt, không prompt/argv đầy đủ; che khóa trước khi cắt", async () => {
  const f = await fixture();
  try {
    f.job("ai-a", f.a, "done", 3000, { kind: "ai", agent: "CODEX_ASTRA_DEV", argv: ["cli", "hidden-ai-prompt", "token=privatevalue"] });
    f.job("cmd-a", f.a, "done", 4000, { argv: ["node", "--token", "privatevalue", "hidden-fourth-arg"] });
    const p = await f.call(), text = JSON.stringify(p);
    for (const hidden of ["hidden-ai-prompt", "hidden-fourth-arg", "privatevalue", "hidden-step-prompt", "hidden-report", '"argv"', '"prompt"']) assert.ok(!text.includes(hidden), hidden);
    assert.equal(p[0].recent[1].label, "CODEX_ASTRA_DEV");
    assert.equal(p[0].runs[0].id, "auto-a");
    assert.equal(p[1].runs[0].id, "auto-b");
    assert.equal(p[0].runs[0].steps, 1);
    assert.equal(p[0].runs[0].roles, "CLAUDE_AUDITOR");
    assert.ok(p[0].runs[0].task.length <= 200);
    assert.deepEqual(Object.keys(p[0].recent[0]).sort(), ["id", "agent", "kind", "status", "startedAt", "endedAt", "durationS", "label"].sort());
  } finally { await f.cleanup(); }
});

test("projects: thư mục bị mất vẫn có phần tử và problem, không làm hỏng dự án khác", async () => {
  const f = await fixture();
  try {
    fs.rmSync(f.a, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    const p = await f.call();
    assert.equal(p.length, 2);
    assert.equal(p[0].path, f.a);
    assert.equal(p[0].turn, null);
    assert.ok(p[0].problem);
    assert.equal(p[0].openBlockers, null);
    assert.equal(p[1].problem, null);
    assert.equal(p[1].turn.phase, "Phase 2");
  } finally { await f.cleanup(); }
});
