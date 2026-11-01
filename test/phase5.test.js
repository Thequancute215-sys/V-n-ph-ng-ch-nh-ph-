// Phase 5: chạy lượt AI theo NEXT_OWNER, đọc JSON bàn giao, CEO duyệt chuyển lượt → commit chore(agent-sync).
// CLI AI thật được thay bằng script node giả (qua ctl-agents.json) để test chạy được không cần mạng/tài khoản.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const { createCtl } = require("../ctl/main");
const { findHandoff, checkHandoff } = require("../ctl/handoff");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-p5-"));
const dir = path.join(tmp, "home"), repo = path.join(tmp, "repo");
let ctl, port;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim();
const AGENT_MD = "# AGENT.MD\n## [4] KHÓA LƯỢT & NHẬT KÝ\n- CURRENT_PHASE: Phase 2 - Thử\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): CODEX_ASTRA_DEV\n";
// AI giả: in sự kiện JSONL như codex exec --json, câu trả lời cuối chứa dòng bàn giao; kiểm prompt có nhận đúng vai.
const FAKE = (out) => [process.execPath, "-e", `const p=process.argv[1]; if(!p.includes("CODEX_ASTRA_DEV")) process.exit(3); console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:${JSON.stringify(out)}}}))`, "{prompt}"];

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
async function handoffOf(id) { for (let i = 0; i < 100; i++) { const h = ctl.runner.get(id); if (h) return h; await sleep(50); } throw new Error("không có bàn giao"); }
const setFake = (out) => fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify({ CODEX_ASTRA_DEV: FAKE(out) }));

test.before(async () => {
  fs.mkdirSync(repo, { recursive: true });
  git("init", "-q"); git("config", "user.email", "test@local"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(repo, "agent.md"), AGENT_MD);
  git("add", "agent.md"); git("commit", "-qm", "khởi tạo");
  ctl = createCtl({ dir });
  await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok));
  port = ctl.server.address().port;
  await call("POST", "/workspaces", { path: repo });
});
test.after(async () => { await ctl.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test("tìm dòng bàn giao trong văn bản thường, JSON claude và JSONL codex", () => {
  const h = { role: "CLAUDE_AUDITOR", next_owner: "CODEX_ASTRA_DEV", files: [], claim_fixed: [] };
  assert.deepStrictEqual(findHandoff("xong việc\n" + JSON.stringify(h)), h);
  assert.deepStrictEqual(findHandoff(JSON.stringify({ type: "result", result: "Báo cáo...\n" + JSON.stringify(h) })), h);
  assert.deepStrictEqual(findHandoff('{"type":"x"}\n' + JSON.stringify({ item: { text: "a {\"role\":\"giả\"} b\n" + JSON.stringify(h) } })), h);
  assert.strictEqual(findHandoff("không có gì"), null);
  assert.deepStrictEqual(checkHandoff(h, "CLAUDE_AUDITOR"), []);
  assert.ok(checkHandoff({ ...h, next_owner: "HACKER" }, "CLAUDE_AUDITOR").length);
  assert.ok(checkHandoff({ ...h, claim_fixed: ["xoá hết"] }, "CLAUDE_AUDITOR").length);
  assert.ok(checkHandoff(h, "CODEX_ASTRA_DEV").length, "role phải khớp vai đang chạy");
});

test("không phải lượt của vai → 409; Antigravity không có CLI → 422", async () => {
  assert.strictEqual((await call("POST", "/ai/run", { workspace: repo, role: "CLAUDE_AUDITOR" })).status, 409);
  assert.strictEqual((await call("POST", "/ai/run", { workspace: repo, role: "SPEC_ARCHITECT" })).status, 422);
  const s = (await call("GET", "/ai/status?workspace=" + encodeURIComponent(repo))).json;
  assert.strictEqual(s.turn.nextOwner, "CODEX_ASTRA_DEV");
  assert.strictEqual(s.runnable, true);
});

test("lượt AI chạy, bàn giao hợp lệ, CEO duyệt → agent.md đổi lượt + commit chore(agent-sync)", async () => {
  setFake('Đã sửa xong.\n{"role":"CODEX_ASTRA_DEV","next_owner":"SOL_ARCHITECT_ADVISOR","files":["a.js"],"claim_fixed":["P2-C03"]}');
  const r = await call("POST", "/ai/run", { workspace: repo, role: "CODEX_ASTRA_DEV", task: "sửa P2-C03" });
  assert.strictEqual(r.status, 201, r.text);
  assert.strictEqual(r.json.job.kind, "ai");
  assert.strictEqual((await call("POST", "/ai/run", { workspace: repo, role: "CODEX_ASTRA_DEV" })).status, 409, "chỉ 1 lượt AI mỗi workspace");
  const h = await handoffOf(r.json.job.id);
  assert.deepStrictEqual(h.problems, []);
  assert.strictEqual(h.next_owner, "SOL_ARCHITECT_ADVISOR");
  assert.strictEqual((await call("GET", "/handoffs")).json.handoffs.length, 1);

  const a = await call("POST", `/handoffs/${r.json.job.id}/approve`, {});
  assert.strictEqual(a.status, 200, a.text);
  assert.match(fs.readFileSync(path.join(repo, "agent.md"), "utf8"), /NEXT_OWNER \(MUTEX LOCK\): SOL_ARCHITECT_ADVISOR/);
  assert.match(fs.readFileSync(path.join(repo, "agent.md"), "utf8"), /LAST_UPDATED_BY: CODEX_ASTRA_DEV/);
  assert.strictEqual(git("log", "-1", "--format=%s"), "chore(agent-sync): CODEX_ASTRA_DEV -> NEXT: SOL_ARCHITECT_ADVISOR");
  assert.strictEqual(git("status", "--porcelain"), "");
  assert.strictEqual((await call("POST", `/handoffs/${r.json.job.id}/approve`, {})).status, 409, "không duyệt 2 lần");
  assert.strictEqual((await call("GET", "/handoffs")).json.handoffs.length, 0);
});

test("bàn giao sai schema hoặc thiếu → không duyệt được, agent.md giữ nguyên", async () => {
  fs.writeFileSync(path.join(repo, "agent.md"), AGENT_MD); git("commit", "-qam", "trả lượt về Astra để thử");
  setFake('{"role":"CODEX_ASTRA_DEV","next_owner":"CODEX_ASTRA_DEV","files":[],"claim_fixed":[]}');
  const r = await call("POST", "/ai/run", { workspace: repo, role: "CODEX_ASTRA_DEV" });
  const h = await handoffOf(r.json.job.id);
  assert.ok(h.problems.length);
  assert.strictEqual((await call("POST", `/handoffs/${r.json.job.id}/approve`, {})).status, 422);
  assert.match(fs.readFileSync(path.join(repo, "agent.md"), "utf8"), /NEXT_OWNER \(MUTEX LOCK\): CODEX_ASTRA_DEV/);

  setFake("Tôi quên in JSON.");
  const r2 = await call("POST", "/ai/run", { workspace: repo, role: "CODEX_ASTRA_DEV" });
  const h2 = await handoffOf(r2.json.job.id);
  assert.deepStrictEqual(h2.problems, ["Không tìm thấy dòng JSON bàn giao trong log"]);
  assert.strictEqual((await call("POST", `/handoffs/${r2.json.job.id}/reject`, {})).json.handoff.decided, "rejected");
});

test("CLI AI không nhận biến môi trường chứa khóa", async () => {
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify({ CODEX_ASTRA_DEV: [process.execPath, "-e", "console.log('K=' + (process.env.OPENAI_API_KEY || 'khong'))", "{prompt}"] }));
  process.env.OPENAI_API_KEY = "sk-" + "q".repeat(30);
  try {
    const r = await call("POST", "/ai/run", { workspace: repo, role: "CODEX_ASTRA_DEV" });
    await handoffOf(r.json.job.id);
    assert.match(ctl.jobs.rawLog(r.json.job.id), /K=khong/);
  } finally { delete process.env.OPENAI_API_KEY; }
});
