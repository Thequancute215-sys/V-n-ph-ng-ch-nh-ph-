"use strict";
// CEO yêu cầu 03/11/2026: mỗi lượt của Hinata, Sol, Astra phải giải thích (vấn đề, đã làm, vì sao, cách khác và vì sao bỏ)
// để CEO duyệt; thiếu thì trả lại đúng lượt đó một lần; Claude nhận lời giải thích kèm mốc diff để đối chiếu.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { checkHandoff, checkExplain } = require("../ctl/handoff");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLES = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR", "CLAUDE_REPORTER"];
const GOOD = [{ van_de: "Trang đăng nhập trả 500 khi thiếu email (src/app.js:12 đọc body.email.trim())", da_lam: "Thêm kiểm tra email trong src/app.js trước khi trim, trả 400", vi_sao: "Lỗi do dữ liệu người dùng phải trả 400 có thông báo, không phải 500",
  phuong_an_khac: [{ cach: "Bắt mọi lỗi bằng try/catch toàn cục", vi_sao_khong: "Che mất lỗi thật và vẫn trả mã sai cho người dùng" }] }];

test("schema giai_thich: bắt buộc với Hinata/Sol/Astra, không bắt buộc với Claude; chặn chữ mẫu và viết cho có", () => {
  const base = { next_owner: "CLAUDE_AUDITOR", files: [], claim_fixed: [] };
  assert.match(checkHandoff({ role: "CODEX_ASTRA_DEV", ...base }, "CODEX_ASTRA_DEV").join(), /^giai_thich bắt buộc/);
  for (const role of ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR"]) assert.ok(checkHandoff({ role, ...base, next_owner: "CODEX_ASTRA_DEV" }, role).some((x) => x.startsWith("giai_thich")), role);
  assert.deepEqual(checkHandoff({ role: "CLAUDE_AUDITOR", ...base, next_owner: "CODEX_ASTRA_DEV" }, "CLAUDE_AUDITOR"), []);
  assert.deepEqual(checkHandoff({ role: "CODEX_ASTRA_DEV", ...base, giai_thich: GOOD }, "CODEX_ASTRA_DEV"), []);
  assert.deepEqual(checkExplain([{ ...GOOD[0], phuong_an_khac: [] }]), [], "không có cách khác hợp lý thì [] vẫn hợp lệ");
  assert.match(checkExplain([{ ...GOOD[0], vi_sao: "ok" }]).join(), /vi_sao .*15–2000/);
  assert.match(checkExplain([{ ...GOOD[0], van_de: "<vấn đề/lỗi và nguyên nhân gốc của thay đổi>" }]).join(), /chữ mẫu/);
  assert.match(checkExplain([{ ...GOOD[0], da_lam: "Đã sửa." + " ".repeat(10) }]).join(), /chữ mẫu|15–2000/);
  assert.match(checkExplain([{ ...GOOD[0], phuong_an_khac: [{ cach: "khác" }] }]).join(), /phuong_an_khac\[1\]/);
  assert.match(checkExplain(Array(21).fill(GOOD[0])).join(), /tối đa 20/);
  assert.ok(checkExplain([]).length && checkExplain("chuỗi").length && checkExplain([null]).length);
  // giai_thich sai mà Claude có gửi thì vẫn bị kiểm
  assert.ok(checkHandoff({ role: "CLAUDE_AUDITOR", ...base, next_owner: "CODEX_ASTRA_DEV", giai_thich: [{}] }, "CLAUDE_AUDITOR").length);
});

// CLI giả: Astra lần đầu theo `astra` ("thieu": bàn giao không giải thích; "luon-thieu": lần nào cũng thiếu), lần sau có giải thích (kèm token để kiểm che khóa).
// Claude in ra mình có nhận được phần giải thích kèm mốc diff hay không.
async function fixture(t, astra) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-giaithich-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): CODEX_ASTRA_DEV\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n");
  git("add", "."); git("commit", "-qm", "init");
  const count = path.join(temp, "dem"), fake = path.join(temp, "cli.cjs");
  const good = JSON.stringify([{ ...GOOD[0], vi_sao: GOOD[0].vi_sao + " (token=abc123)" }]);
  fs.writeFileSync(fake, `const fs=require('fs');const role=process.argv[2],prompt=process.argv[process.argv.length-1];
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo: '+(prompt.includes('GIẢI THÍCH CỦA CÁC LƯỢT')?'có giải thích':'không có giải thích')}));return;}
    if(role==='CLAUDE_AUDITOR'){const m=/GIẢI THÍCH CỦA CÁC LƯỢT[\\s\\S]*?git diff ([0-9a-f]+)\\.\\.([0-9a-f]+)/.exec(prompt);
      console.log(JSON.stringify({result:'VÌ SAO LÀM VẬY & PHƯƠNG ÁN KHÁC: '+(m?'đã đối chiếu '+m[1]+'..'+m[2]:'KHÔNG CÓ GIẢI THÍCH')+'\\n'+JSON.stringify({role,next_owner:'SPEC_ARCHITECT',files:[],claim_fixed:[],done:true})}));return;}
    const n=(fs.existsSync(${JSON.stringify(count)})?+fs.readFileSync(${JSON.stringify(count)},'utf8'):0)+1;fs.writeFileSync(${JSON.stringify(count)},String(n));
    fs.mkdirSync('src',{recursive:true});fs.writeFileSync('src/app.js','// lần '+n+'\\n');
    const h={role,next_owner:'CLAUDE_AUDITOR',files:['src/app.js'],claim_fixed:[]};
    const missing=${JSON.stringify(astra)}==='luon-thieu'||(${JSON.stringify(astra)}==='thieu'&&n===1);
    if(!missing)h.giai_thich=${good};
    if(!missing&&n>1&&!prompt.includes('LƯỢT TRƯỚC CỦA BẠN BỊ TRẢ LẠI'))h.giai_thich=[];
    console.log(JSON.stringify({result:'Xong.\\n'+JSON.stringify(h)}));`);
  const reporter = path.join(temp, "claude.js");
  fs.writeFileSync(reporter, `process.argv.splice(2, process.argv.length, ...${JSON.stringify(["CLAUDE_REPORTER"])}, process.argv.at(-1)); require(${JSON.stringify(fake)});`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries(ROLES.map((r) => [r, r === "CLAUDE_REPORTER" ? [process.execPath, reporter, "-p", "{prompt}"] : [process.execPath, fake, r, "{prompt}"]]))));
  const ctl = createCtl({ dir });
  ctl.ws.add(repo);
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const wait = async (id) => { for (let i = 0; i < 300; i++) { const r = ctl.autopilot.get(id); if (["awaiting_approval", "attention"].includes(r.status)) return r; await sleep(50); } assert.fail(JSON.stringify(ctl.autopilot.get(id))); };
  return { ctl, repo, wait, count: () => Number(fs.readFileSync(count, "utf8")) };
}

test("Astra quên giải thích: trả lại đúng Astra một lần (kèm lý do), lần hai đủ thì đi tiếp; Claude nhận giải thích kèm mốc diff", async (t) => {
  const { ctl, repo, wait, count } = await fixture(t, "thieu");
  const r = ctl.autopilot.start({ workspace: repo, task: "Sửa lỗi đăng nhập" });
  const run = await wait(r.id);
  assert.equal(run.status, "awaiting_approval", run.problem);
  assert.deepEqual(run.steps.map((s) => s.role), ["CODEX_ASTRA_DEV", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR"]);
  assert.equal(count(), 2, "Astra chạy đúng 2 lần");
  assert.match(run.steps[0].explainRejected, /^giai_thich bắt buộc/);
  assert.equal(ctl.runner.get(run.steps[0].jobId).decided, "rejected", "bàn giao thiếu giải thích không được duyệt");
  assert.equal(run.steps[1].explainRetried, true);
  assert.equal(run.steps[1].explain[0].phuong_an_khac[0].cach, GOOD[0].phuong_an_khac[0].cach);
  assert.match(run.steps[1].explain[0].vi_sao, /token=‹ẩn›/, "giải thích lưu lại đã che khóa");
  const s1 = run.steps[1];
  assert.match(run.report, new RegExp("đã đối chiếu " + s1.base.slice(0, 10) + "\\.\\." + s1.head.slice(0, 10)), "Claude nhận đúng mốc diff của lượt Astra");
  assert.equal(ctl.autopilot.view(run).steps[1].explain.length, 1, "giải thích có trong dữ liệu gửi trình duyệt");
});

test("Astra lần hai vẫn không giải thích: không trả lại vô hạn, dừng và báo CEO", async (t) => {
  const { ctl, repo, wait, count } = await fixture(t, "luon-thieu");
  const r = ctl.autopilot.start({ workspace: repo, task: "Sửa lỗi đăng nhập" });
  const run = await wait(r.id);
  await sleep(300);
  assert.equal(count(), 2, "chỉ trả lại 1 lần");
  assert.match(run.problem, /giai_thich bắt buộc/);
  assert.equal(run.steps.filter((s) => s.role === "CLAUDE_AUDITOR").length, 0, "không cho qua tới nghiệm thu");
});

test("giao diện: hiện giải thích (đã escape), cảnh báo lượt thiếu giải thích, ghi lượt bị trả lại", () => {
  delete globalThis.RepoProgress;
  require("../public/progress-view.js");
  const { explainHtml } = globalThis.RepoProgress;
  const html = explainHtml({ status: "awaiting_approval", jobId: "x", steps: [
    { role: "CODEX_ASTRA_DEV", jobId: "a", explainRejected: "giai_thich bắt buộc" },
    { role: "CODEX_ASTRA_DEV", jobId: "b", explain: [{ van_de: "<script>alert(1)</script>", da_lam: "Sửa a.js", vi_sao: "Vì vậy", phuong_an_khac: [{ cach: "Cách B", vi_sao_khong: "Chậm hơn" }] }] },
    { role: "SOL_ARCHITECT_PLANNER", jobId: "c" },
    { role: "CLAUDE_AUDITOR", jobId: "d" } ] });
  assert.match(html, /<details class="explain" open>/);
  assert.match(html, /1\/3 lượt có giải thích/);
  assert.ok(!html.includes("<script>alert"), "nội dung AI được escape");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Cách B — <i>không chọn vì<\/i> Chậm hơn/);
  assert.match(html, /Bị trả lại một lần vì: giai_thich bắt buộc/);
  assert.match(html, /Lượt 3 · SOL_ARCHITECT_PLANNER.*⚠️ Lượt này không có giải thích/s);
  assert.equal(explainHtml({ steps: [{ role: "CLAUDE_AUDITOR", jobId: "d" }] }), "", "lượt của Claude không bắt buộc");
});
