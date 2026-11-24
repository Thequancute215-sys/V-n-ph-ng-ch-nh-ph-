"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createQuyen, ROLES_LAM_VIEC } = require("../ctl/quyen");
const { createRunner, AGENTS, FULL_ROLES, fullAccessArgs, readOnlyArgs, withMcp } = require("../ctl/runner");

const ASTRA = "CODEX_ASTRA_DEV", CLAUDE = "CLAUDE_AUDITOR", AGY = "FRONTEND_UIUX_DEV";
const CHI_DOC = Object.keys(AGENTS).filter((role) => /REPORTER$|_CHAT$|_WEB_PROMPT$/.test(role));

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-quyen-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const file = path.join(dir, "quyen.json"), config = path.join(dir, "ctl-agents.json"), log = [], jobs = [];
  const audit = { log: (...args) => log.push(args) };
  const quyen = createQuyen({ dir, audit });
  const root = path.join(dir, "repo");
  fs.mkdirSync(root);
  const turn = (role) => fs.writeFileSync(path.join(root, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- NEXT_OWNER (MUTEX LOCK): " + role + "\n");
  const scan = { require: () => {} };
  const runner = createRunner({ dir, audit, db: { prepare: () => ({ get: () => null }) }, ws: { find: () => ({ path: root }) },
    jobs: { aiBusy: () => false, start: (job) => (jobs.push(job), job) }, scanner: scan });
  const run = (role) => { turn(role); return runner.run({ workspace: root, role, task: "việc thử riêng" }); };
  return { quyen, file, config, log, jobs, runner, run, scan, root, turn };
}

test("đọc và ghi ba mức, giữ trường cũ, từ chối vai và mức lạ", (t) => {
  const { quyen, file, log } = fixture(t);
  assert.deepEqual(quyen.doc(), { toanQuyen: true, vai: {} });
  for (const invalid of ["{hỏng", "null", '{"toanQuyen":"false"}', '{"vai":[]}']) {
    fs.writeFileSync(file, invalid);
    const { toanQuyen, vai, loi } = quyen.doc();
    assert.equal(toanQuyen, false);
    assert.deepEqual(vai, {});
    assert.match(loi, /Toàn quyền đang tắt/);
    assert.equal(quyen.mucCua(ASTRA), "nhap");
  }
  assert.deepEqual(quyen.dat({ role: ASTRA, muc: "doc" }), { toanQuyen: false, vai: { [ASTRA]: "doc" } });
  assert.deepEqual(quyen.doc(), { toanQuyen: false, vai: { [ASTRA]: "doc" } });
  fs.writeFileSync(file, JSON.stringify({ toanQuyen: false, vai: { [CLAUDE]: "nhap" }, khac: { giu: true } }));
  assert.equal(quyen.mucCua(ASTRA), "nhap");
  assert.deepEqual([...FULL_ROLES], ROLES_LAM_VIEC);
  assert.deepEqual(quyen.dat({ role: ASTRA, muc: "doc" }, "ceo"), { toanQuyen: false, vai: { [CLAUDE]: "nhap", [ASTRA]: "doc" } });
  assert.deepEqual(log.at(-1), ["ceo", "quyen.dat", ASTRA, { muc: "doc" }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).khac, { giu: true });
  quyen.dat({ toanQuyen: true }, "ceo");
  assert.equal(quyen.mucCua(ASTRA), "doc");
  assert.equal(quyen.mucCua(AGY), "toan");
  for (const input of [{ role: "vai_la", muc: "doc" }, { role: ASTRA, muc: "write" }, { toanQuyen: "false" }, { role: ASTRA, muc: "toan", toanQuyen: true }, {}])
    assert.throws(() => quyen.dat(input, "ceo"), { code: "BAD_REQUEST" });
  for (const role of CHI_DOC) assert.throws(() => quyen.dat({ role, muc: "toan" }, "ceo"), { code: "BAD_REQUEST" });
  fs.writeFileSync(file, JSON.stringify({ toanQuyen: true, vai: Object.fromEntries(CHI_DOC.map((role) => [role, "toan"])) }));
  for (const role of CHI_DOC) assert.equal(quyen.mucCua(role), "doc", role);
  assert.deepEqual(quyen.doc(), { toanQuyen: true, vai: {} });
});

test("file quyền cũ giữ argv của từng vai làm việc khi bật và tắt toàn quyền", (t) => {
  const { file, run, runner, root, turn } = fixture(t);
  for (const toanQuyen of [false, true]) {
    fs.writeFileSync(file, JSON.stringify({ toanQuyen }));
    assert.equal(runner.fullOn(), toanQuyen);
    for (const role of ROLES_LAM_VIEC) {
      const mach = AGENTS[role].argv;
      const prepared = toanQuyen ? fullAccessArgs(mach) : mach;
      const isApply = role.endsWith("_WEB_APPLY");
      const target = isApply ? ASTRA : role;
      if (isApply) turn(target);
      const job = isApply ? runner.applyWeb({ workspace: root, role: target, applier: role.startsWith("CLAUDE") ? "claude" : "codex" }) : run(role);
      const prompt = job.argv.find((x) => x.startsWith("Bạn là "));
      assert.ok(prompt);
      assert.equal(prompt.includes("BẠN ĐANG CHẠY TOÀN QUYỀN"), toanQuyen, role);
      const args = job.argv.map((x) => x === prompt ? "{prompt}" : x).filter((x, i, a) => {
        const modelFlag = (flag, value) => ["-m", "--model", "--effort"].includes(flag) || (flag === "-c" && value?.startsWith("model_reasoning_effort="));
        return isApply || !modelFlag(x, a[i + 1]) && !modelFlag(a[i - 1], x);
      });
      assert.deepEqual(args, withMcp(prepared, target, path.dirname(file)), role);
    }
  }
});

test("cờ chỉ đọc giữ model, effort, prompt và loại cấu hình cấp thêm quyền", () => {
  const c = readOnlyArgs(["C:/CLI/Claude.cmd", "-p", "{prompt}", "--model=sonnet", "--effort", "high", "--allowedTools", "Read", "Edit",
    "Bash(npm test:*)", "--allowed-tools=Write", "--tools", "Write", "--permission-mode=acceptEdits", "--dangerously-skip-permissions", "--mcp-config", "custom.json"]);
  for (const x of ["-p", "{prompt}", "--model=sonnet", "--effort", "high", "plan", "Read,Grep,Glob"]) assert.ok(c.includes(x), x);
  for (const x of ["Read", "Edit", "Write", "Bash(npm test:*)", "custom.json"]) assert.ok(!c.includes(x), x);
  const prefix = ["C:\\Node\\node.exe", "--preserve-symlinks-main", "C:\\CLI\\codex.js"];
  const d = readOnlyArgs([...prefix, "exec", "--json", "--approve-for-me", "--not-so-yolo", "--yolo", "--full-auto", "--dangerously-bypass-approvals-and-sandbox",
    "--sandbox=danger-full-access", "-s", "workspace-write", "-sdanger-full-access", "--add-dir", "C:/", "--profile", "writer",
    "-m", "gpt-6-astra", "-c", "model_reasoning_effort=high", "--config=sandbox_mode=danger-full-access", "{prompt}"]);
  const at = d.indexOf("exec");
  assert.deepEqual(d.slice(at, at + 3), ["exec", "--sandbox", "read-only"]);
  assert.deepEqual(d.slice(0, prefix.length), prefix);
  for (const x of ["--json", "-m", "gpt-6-astra", "-c", "model_reasoning_effort=high", "{prompt}"]) assert.ok(d.includes(x), x);
  assert.ok(!d.some((x) => /danger|approve-for-me|full-auto|yolo|workspace-write|add-dir|writer|--profile/.test(x)));
  const g = readOnlyArgs(["C:/app/agy.exe", "-p", "{prompt}", "--mode=accept-edits", "--settings", "writer", "--dangerously-skip-permissions", "--model", "gemini", "--effort", "low"]);
  const settings = JSON.parse(g[g.indexOf("--settings") + 1]);
  assert.equal(g[g.indexOf("--mode") + 1], "plan");
  assert.ok(settings.permissions.deny.includes("write_file(*)"));
  assert.doesNotMatch(JSON.stringify(settings), /git pull|npm/);
  for (const x of ["--model", "gemini", "--effort", "low", "{prompt}"]) assert.ok(g.includes(x), x);
  for (const args of [c, d, g]) assert.ok(!args.some((x) => /allowed[-Tt]ools|dangerously|acceptEdits|accept-edits/.test(x)));
  assert.throws(() => readOnlyArgs(["node.exe", "other.js", "{prompt}"]), { code: "BAD_CONFIG" });
});

test("runner áp quyền trên lệnh tùy chỉnh, ghi kiểm toán và giữ cổng rà soát cho mức toàn quyền", (t) => {
  const { file, config, run, runner, log, jobs, scan } = fixture(t);
  const commands = {
    [CLAUDE]: ["claude.exe", "-p", "{prompt}", "--permission-mode", "acceptEdits", "--allowedTools", "Read", "Write"],
    [ASTRA]: ["C:/node/node.exe", "--preserve-symlinks", "C:/cli/codex.js", "exec", "--json", "--approve-for-me", "-m", "custom", "-c", "model_reasoning_effort=high", "{prompt}"],
    [AGY]: ["C:/path/agy.exe", "-p", "{prompt}", "--mode", "accept-edits", "--settings", "original"],
  };
  fs.writeFileSync(config, JSON.stringify(commands));
  fs.writeFileSync(file, JSON.stringify({ toanQuyen: false, vai: Object.fromEntries(Object.keys(commands).map((r) => [r, "doc"])) }));
  scan.require = () => { throw Object.assign(new Error("Chờ duyệt"), { code: "NEEDS_SCAN_APPROVAL" }); };
  assert.equal(runner.fullOn(), false);
  for (const role of Object.keys(commands)) {
    const { argv } = run(role);
    const prompt = argv.find((x) => x.includes("việc thử riêng"));
    assert.match(prompt, /Đề xuất \(chỉ đọc\).*không sửa file.*JSON bàn giao/);
    assert.match(prompt, /"role":"[^"]+","next_owner"/);
    assert.equal(log.at(-1)[3].muc, "doc");
    assert.ok(!argv.some((x) => /accept-edits|approve-for-me|allowedTools|acceptEdits/.test(x)));
  }
  runner.quyen.dat({ role: ASTRA, muc: "toan" }, "ceo");
  assert.equal(runner.fullOn(), true, "có vai toàn quyền dù công tắc chung tắt");
  assert.throws(() => run(ASTRA), { code: "NEEDS_SCAN_APPROVAL" });
  assert.equal(jobs.length, 3);
  scan.require = () => {};
  assert.ok(run(ASTRA).argv.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.equal(log.at(-1)[3].muc, "toan");
});

test("báo cáo, chat, soạn prompt và áp kết quả web đều giữ trần chỉ đọc", (t) => {
  const { runner, config, root, turn, log } = fixture(t);
  fs.writeFileSync(config, JSON.stringify({
    CLAUDE_REPORTER: ["claude", "-p", "{prompt}", "--dangerously-skip-permissions", "--allowed-tools", "Write"],
    CODEX_CHAT: ["codex", "exec", "--approve-for-me", "{prompt}"],
    [ASTRA]: ["C:/node/node.exe", "--preserve-symlinks", "C:/cli/codex.js", "exec", "--json", "--approve-for-me", "{prompt}"],
  }));
  const report = runner.report({ workspace: root, task: "thử", evidence: "bằng chứng" });
  assert.ok(report.argv.includes("Read,Grep,Glob"));
  assert.equal(log.at(-1)[3].muc, "doc");
  assert.ok(!report.argv.includes("--dangerously-skip-permissions"));
  const chat = runner.chatArgv("astra");
  assert.ok(chat.includes("read-only"));
  assert.ok(!chat.includes("--approve-for-me"));
  const web = runner.webPrompt({ workspace: root, role: ASTRA, task: "thử", writer: "codex" });
  assert.deepEqual(web.argv.slice(0, 6), ["C:/node/node.exe", "--preserve-symlinks", "C:/cli/codex.js", "exec", "--sandbox", "read-only"]);
  runner.quyen.dat({ role: ASTRA, muc: "doc" }, "ceo");
  turn(ASTRA);
  const proposal = runner.applyWeb({ workspace: root, role: ASTRA, file: "ket-qua.txt" });
  assert.ok(proposal.argv.includes("Read,Grep,Glob"));
  assert.ok(!proposal.argv.includes("--dangerously-skip-permissions"));
  assert.match(proposal.argv.find((x) => x.includes("ket-qua.txt")), /Đề xuất \(chỉ đọc\)/);
  runner.quyen.dat({ role: ASTRA, muc: "toan" }, "ceo");
  runner.quyen.dat({ role: "CLAUDE_WEB_APPLY", muc: "doc" }, "ceo");
  assert.ok(runner.applyWeb({ workspace: root, role: ASTRA, file: "ket-qua.txt" }).argv.includes("Read,Grep,Glob"));
});
