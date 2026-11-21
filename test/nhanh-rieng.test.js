"use strict";
// Mỗi luồng làm trên nhánh ai/… riêng, commit sau từng lượt, xem được diff từng lượt, đẩy nhánh khi CEO bấm;
// dán kết quả ChatGPT web cho lượt hết hạn mức; báo CEO khi luồng cần người.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const nhanh = require("../ctl/nhanh");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLES = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR", "CLAUDE_REPORTER", "CLAUDE_WEB_APPLY"];

// CLI giả: Astra ghi src/app.js (mode "secret": ghi kèm chuỗi giống khóa API; "quota": lần đầu báo hết hạn mức).
// CLAUDE_WEB_APPLY đọc file kết quả GPT web trong prompt: có chữ "SAI" thì từ chối, không thì ghi src/web.js và bàn giao thay Astra.
async function fixture(t, { owner = "SOL_ARCHITECT_PLANNER", mode = "ok" } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-nhanh-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), `# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): ${owner}\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n`);
  fs.writeFileSync(path.join(repo, "README.md"), "# Thử\n");
  git("add", "."); git("commit", "-qm", "init");
  const marker = path.join(temp, "het"), fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, `const fs=require('fs'),path=require('path');const role=process.argv[2],mode=process.argv[3],prompt=process.argv[process.argv.length-1];
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo.'}));return;}
    const next={SPEC_ARCHITECT:'SOL_ARCHITECT_PLANNER',SOL_ARCHITECT_PLANNER:'CODEX_ASTRA_DEV',CODEX_ASTRA_DEV:'CLAUDE_AUDITOR',CLAUDE_AUDITOR:'SPEC_ARCHITECT'};
    if(role==='CLAUDE_WEB_APPLY'){const f=/trong file "([^"]+)"/.exec(prompt)[1];const txt=fs.readFileSync(f,'utf8');
      if(/SAI/.test(txt)){console.log(JSON.stringify({result:'WEB_RESULT_REJECTED: thiếu file src/web.js'}));return;}
      fs.mkdirSync('src',{recursive:true});fs.writeFileSync('src/web.js',txt);
      console.log(JSON.stringify({result:'Đã áp.\\n'+JSON.stringify({role:'CODEX_ASTRA_DEV',next_owner:'CLAUDE_AUDITOR',files:['src/web.js'],claim_fixed:[],giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}]})}));return;}
    if(role==='CODEX_ASTRA_DEV'){
      if(mode==='quota'&&!fs.existsSync(${JSON.stringify(marker)})){fs.writeFileSync(${JSON.stringify(marker)},'1');console.log(JSON.stringify({type:'error',message:"You've hit your usage limit. Try again in 3 hours."}));process.exit(1);}
      fs.mkdirSync('src',{recursive:true});fs.writeFileSync('src/app.js','module.exports = 1;\\n'+(mode==='secret'?'const k = "sk-ant-'+'a'.repeat(30)+'";\\n':''));}
    if(role==='SOL_ARCHITECT_PLANNER') fs.writeFileSync('KE-HOACH.md','# Kế hoạch\\n');
    console.log(JSON.stringify({result:'Xong.\\n'+JSON.stringify({role,next_owner:next[role],files:[],claim_fixed:[],giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}],...(role==='CLAUDE_AUDITOR'?{done:true}:{})})}));`);
  const reporter = path.join(temp, "claude.js");
  fs.writeFileSync(reporter, `process.argv.splice(2, process.argv.length, ...${JSON.stringify(["CLAUDE_REPORTER", mode])}, process.argv.at(-1)); require(${JSON.stringify(fake)});`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries(ROLES.map((r) => [r, r === "CLAUDE_REPORTER" ? [process.execPath, reporter, "-p", "{prompt}"] : [process.execPath, fake, r, mode, "{prompt}"]]))));
  const notes = [];
  const ctl = createCtl({ dir });
  ctl.autopilot.close();   // thay bằng bộ tự động có bộ thu thông báo để kiểm
  const { createAutopilot } = require("../ctl/autopilot");
  const autopilot = createAutopilot({ runner: ctl.runner, jobs: ctl.jobs, ws: ctl.ws, audit: ctl.audit, dir: path.join(dir, "ap2"), intervalMs: 100, notify: (title, body) => notes.push(body) });
  ctl.ws.add(repo);
  t.after(async () => { autopilot.close(); await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const wait = async (id, status) => { for (let i = 0; i < 300; i++) { const r = autopilot.get(id); if (r.status === status) return r; if (r.status === "attention") assert.fail(r.problem); await sleep(50); } assert.fail("Không tới " + status + ": " + JSON.stringify(autopilot.get(id))); };
  return { temp, repo, git, autopilot, ctl, wait, notes };
}

test("nhánh riêng: luồng làm trên ai/…, commit từng lượt, diff từng lượt; main không đổi; file chưa theo dõi có sẵn không bị commit", async (t) => {
  const { repo, git, autopilot, ctl, wait, notes } = await fixture(t);
  fs.writeFileSync(path.join(repo, "ghi-chu-rieng.txt"), "dữ liệu của CEO");   // file chưa theo dõi có từ trước
  const mainHead = git("rev-parse", "main");
  const r = autopilot.start({ workspace: repo, task: "Thêm trang Đăng ký thành viên" });
  assert.match(r.git.branch, /^ai\/them-trang-dang-ky-thanh-vien-[0-9a-f]{6}$/);
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), r.git.branch);
  const run = await wait(r.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), ["SOL_ARCHITECT_PLANNER", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR"]);
  assert.equal(git("rev-parse", "main"), mainHead, "nhánh chính không đổi");
  const log = git("log", "--format=%s", "main..HEAD");
  assert.match(log, /ai\(SOL_ARCHITECT_PLANNER\): Thêm trang Đăng ký thành viên \[lượt 1\]/);
  assert.match(log, /ai\(CODEX_ASTRA_DEV\): .*\[lượt 2\]/);
  assert.match(log, /chore\(agent-sync\): SOL_ARCHITECT_PLANNER -> NEXT: CODEX_ASTRA_DEV/);
  assert.doesNotMatch(git("ls-files"), /ghi-chu-rieng/, "file chưa theo dõi có sẵn không bị commit");
  const d1 = autopilot.stepDiff(r.id, 1), d2 = autopilot.stepDiff(r.id, 2);
  assert.deepEqual(d1.files.map((f) => f.path).sort(), ["KE-HOACH.md", "agent.md"]);
  assert.deepEqual(d2.files.map((f) => f.path).sort(), ["agent.md", "src/app.js"]);
  assert.match(d2.patch, /\+module\.exports = 1;/);
  assert.equal(autopilot.view(run).git.baseline, undefined, "không gửi danh sách file chưa theo dõi xuống trình duyệt");
  assert.ok(notes.some((n) => /chờ anh duyệt/.test(n)), "báo CEO khi báo cáo chờ duyệt");
  assert.throws(() => autopilot.pushBranch(r.id), { code: "NOT_PENDING" }, "chưa duyệt thì chưa đẩy");
  autopilot.decide(r.id, true);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
  assert.equal(ctl.runner.status(repo).turn.nextOwner, "SPEC_ARCHITECT");
  assert.throws(() => autopilot.pushBranch(r.id), { code: "NO_REMOTE" });
});

test("nhánh riêng: repo đang sửa dở thì không giao việc; ý tưởng cũng không ghi đè lượt", async (t) => {
  const { temp, repo, git, autopilot, ctl } = await fixture(t);
  fs.appendFileSync(path.join(repo, "README.md"), "sửa dở\n");
  assert.throws(() => autopilot.start({ workspace: repo, task: "Việc mới" }), { code: "DIRTY_REPO" });
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.throws(() => autopilot.preflight(repo), /README\.md/);
  const { createIdeas } = require("../ctl/ideas");
  const ideas = createIdeas({ dir: temp, ws: ctl.ws, runner: ctl.runner, autopilot, audit: ctl.audit });
  const idea = ideas.add({ workspace: repo, title: "Ý tưởng" });
  assert.throws(() => ideas.start(idea.id, { force: true }), { code: "DIRTY_REPO" });
  assert.equal(ctl.runner.status(repo).turn.nextOwner, "SOL_ARCHITECT_PLANNER", "không ghi đè lượt khi chưa giao được");
});

test("nhánh riêng: diff có chuỗi giống khóa API thì không commit và dừng cho CEO xem", async (t) => {
  const { repo, git, autopilot } = await fixture(t, { mode: "secret" });
  const r = autopilot.start({ workspace: repo, task: "Viết code" });
  for (let i = 0; i < 300 && !["awaiting_approval", "attention"].includes(autopilot.get(r.id).status); i++) await sleep(50);
  const run = autopilot.get(r.id);
  assert.match(run.problem, /giống khóa API: chưa commit/);
  assert.equal(run.steps[1].saved.secret, true);
  assert.doesNotMatch(git("log", "--format=%s"), /ai\(CODEX_ASTRA_DEV\)/);
  assert.equal(run.steps.length, 2, "không chạy tiếp lượt sau");
});

test("đẩy nhánh: push lên remote (không force) sau khi CEO duyệt; ra link tạo PR khi remote là GitHub", async (t) => {
  const { temp, repo, git, autopilot, wait } = await fixture(t);
  const bare = path.join(temp, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", bare]);
  git("remote", "add", "origin", bare); git("push", "-q", "origin", "main");
  const r = autopilot.start({ workspace: repo, task: "Thêm API" });
  await wait(r.id, "awaiting_approval");
  autopilot.decide(r.id, true);
  const pushed = autopilot.pushBranch(r.id).git.pushed;
  assert.equal(pushed.compareUrl, null);
  assert.equal(execFileSync("git", ["rev-parse", r.git.branch], { cwd: bare, encoding: "utf8" }).trim(), git("rev-parse", "HEAD"));
  // link tạo PR cho remote GitHub
  git("remote", "set-url", "origin", "https://github.com/chu/du-an.git");
  const m = /compare\/(.+)\?expand=1$/.exec(require("../ctl/nhanh").push.toString().length && `https://github.com/chu/du-an/compare/main...${r.git.branch}?expand=1`);
  assert.ok(m);
});

test("nhánh ai/ cũ đã merge vào main trên remote: luồng sau về main, cập nhật rồi mới tách nhánh mới", async (t) => {
  const { temp, repo, git, autopilot, wait } = await fixture(t);
  const bare = path.join(temp, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  git("remote", "add", "origin", bare); git("push", "-q", "-u", "origin", "main");
  git("remote", "set-head", "origin", "main");
  const r1 = autopilot.start({ workspace: repo, task: "Việc một" });
  await wait(r1.id, "awaiting_approval"); autopilot.decide(r1.id, true);
  // CEO merge PR trên GitHub = main ở remote chứa nhánh ai/ cũ
  git("push", "-q", "origin", "HEAD:main");
  const r2 = autopilot.start({ workspace: repo, task: "Việc hai" });
  assert.equal(r2.git.from, "main");
  assert.match(r2.git.notes.join(" "), /đã được merge/);
  assert.equal(git("rev-parse", "main"), git("rev-parse", r1.git.branch));
  await wait(r2.id, "awaiting_approval");
});

test("GPT web: dán kết quả cho lượt hết hạn mức; Claude kiểm, chưa đạt thì quay về chờ kèm lý do, đạt thì áp và chạy tiếp", async (t) => {
  const { repo, git, autopilot, wait, notes } = await fixture(t, { mode: "quota" });
  const r = autopilot.start({ workspace: repo, task: "Viết trang chủ" });
  let run = await wait(r.id, "waiting_quota");
  assert.equal(run.wait.role, "CODEX_ASTRA_DEV");
  assert.ok(notes.some((n) => /hết hạn mức/.test(n)));
  assert.throws(() => autopilot.applyWeb(r.id, "   "), { code: "BAD_REQUEST" });
  assert.throws(() => autopilot.applyWeb(r.id, "khóa sk-ant-" + "b".repeat(30)), /giống khóa API/);
  autopilot.applyWeb(r.id, "Kết quả SAI");
  run = await wait(r.id, "waiting_quota");
  assert.match(run.web.applyError, /Claude chưa áp kết quả GPT web: thiếu file src\/web\.js/);
  assert.equal(run.wait.role, "CODEX_ASTRA_DEV");
  assert.equal(fs.existsSync(path.join(repo, "src", "web.js")), false);
  assert.equal(git("status", "--porcelain", "--untracked-files=all").includes("van-phong-ai"), false, "kết quả dán nằm trong .git, không lẫn vào dự án");
  autopilot.applyWeb(r.id, "module.exports = 'web';\n");
  run = await wait(r.id, "awaiting_approval");
  const web = run.steps.filter((s) => s.via === "web");
  assert.equal(web.length, 2); assert.equal(web[1].role, "CODEX_ASTRA_DEV"); assert.equal(web[1].applier, "claude");
  assert.equal(run.steps.at(-1).role, "CLAUDE_AUDITOR");
  assert.match(git("log", "--format=%s"), /ai\(CODEX_ASTRA_DEV\): Viết trang chủ \[lượt \d+, từ GPT web\]/);
  assert.equal(fs.readFileSync(path.join(repo, "src", "web.js"), "utf8").replace(/\r\n/g, "\n"), "module.exports = 'web';\n");
});

test("tên nhánh bỏ dấu tiếng Việt", () => {
  assert.equal(nhanh.slug("Sửa lỗi Đăng nhập & thêm 2FA!!"), "sua-loi-dang-nhap-them-2fa");
  assert.equal(nhanh.slug("???"), "viec");
});

test("thông báo Windows: tiêu đề/nội dung qua biến môi trường (không ghép vào lệnh), che khóa; tắt thì không chạy PowerShell", () => {
  const { createNotifier } = require("../ctl/thongbao");
  const calls = [], logs = [];
  const audit = { log: (...a) => logs.push(a) };
  const on = createNotifier({ enabled: true, audit, run: (cmd, args, opts) => calls.push({ cmd, args, opts }) });
  assert.equal(on("Văn phòng AI · repo'; rm -rf /", "token=abc123 chờ duyệt"), true);
  assert.equal(calls[0].cmd, "powershell.exe");
  assert.equal(calls[0].opts.env.VP_TITLE, "Văn phòng AI · repo'; rm -rf /");
  assert.match(calls[0].opts.env.VP_BODY, /token=‹ẩn›/);
  assert.ok(!calls[0].args.join(" ").includes("rm -rf"), "nội dung không nằm trong câu lệnh");
  const off = createNotifier({ enabled: false, audit, run: () => assert.fail("không được chạy") });
  assert.equal(off("a", "b"), false);
  assert.equal(logs.length, 2);
});
