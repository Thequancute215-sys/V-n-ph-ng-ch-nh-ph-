"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLES = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR", "CLAUDE_REPORTER"];

async function fixture(t, owner, mode = "ok") {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-ytuong-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), `# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): ${owner}\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n`);
  git("add", "agent.md"); git("commit", "-qm", "init");
  const fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, `const role=process.argv[2],mode=process.argv[3];
    if(mode==='slow'){setInterval(()=>{},1000);return;}
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo.'}));return;}
    const next={SPEC_ARCHITECT:'SOL_ARCHITECT_PLANNER',SOL_ARCHITECT_PLANNER:'CODEX_ASTRA_DEV',CODEX_ASTRA_DEV:'CLAUDE_AUDITOR',CLAUDE_AUDITOR:'SPEC_ARCHITECT'}[role];
    console.log(JSON.stringify({result:'Xong.\\n'+JSON.stringify({role,next_owner:next,files:[],claim_fixed:[],giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}],...(role==='CLAUDE_AUDITOR'?{done:true}:{})})}));`);
  const reporter = path.join(temp, "claude.js");
  fs.writeFileSync(reporter, `process.argv.splice(2, process.argv.length, ...${JSON.stringify(["CLAUDE_REPORTER", mode])}, process.argv.at(-1)); require(${JSON.stringify(fake)});`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries(ROLES.map((r) => [r, r === "CLAUDE_REPORTER" ? [process.execPath, reporter, "-p", "{prompt}"] : [process.execPath, fake, r, mode, "{prompt}"]]))));
  const createdRepos = [];
  const github = {
    createRepo: async ({ name }) => { createdRepos.push(name); return { fullName: "fixture/" + name }; },
    open: () => ({ status: "done", workspace: repo }),
  };
  const ctl = createCtl({ dir, duAnOptions: { github } });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  ctl.ws.add(repo);
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, ...await r.json() };
  };
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return { ctl, repo, git, call, createdRepos };
}

test("ý tưởng: lưu, kiểm dữ liệu vào, chỉ hiện ở đúng dự án", async (t) => {
  const { repo, call } = await fixture(t, "SPEC_ARCHITECT");
  assert.equal((await call("/ideas", { workspace: repo, title: "  " })).status, 400);
  assert.equal((await call("/ideas", { workspace: repo, title: "x", detail: "a".repeat(2401) })).status, 400);
  const r = await call("/ideas", { workspace: repo, title: "Trang đăng ký thành viên", detail: "Thành viên CLB tự đăng ký" });
  assert.equal(r.status, 201); assert.equal(r.idea.run, null);
  const list = await call("/ideas?workspace=" + encodeURIComponent(repo));
  assert.deepEqual(list.ideas.map((i) => i.title), ["Trang đăng ký thành viên"]);
});

test("ý tưởng: đúng lượt Hinata thì giao ngay, lượt đầu tiên của luồng là SPEC_ARCHITECT", async (t) => {
  const { ctl, repo, call } = await fixture(t, "SPEC_ARCHITECT");
  const { idea } = await call("/ideas", { workspace: repo, title: "Trang đăng ký" });
  const started = await call(`/ideas/${idea.id}/start`, {});
  assert.equal(started.status, 200); assert.ok(started.idea.runId); assert.equal(started.idea.forcedFrom, null);
  for (let i = 0; i < 200 && ctl.autopilot.get(started.idea.runId).status === "running"; i++) await sleep(50);
  const run = ctl.autopilot.get(started.idea.runId);
  assert.equal(run.steps[0].role, "SPEC_ARCHITECT");
  assert.match(run.task, /Ý TƯỞNG MỚI CỦA CEO: Trang đăng ký/);
  assert.equal((await call("/ideas?workspace=" + encodeURIComponent(repo))).ideas[0].run.id, run.id);
});

test("ý tưởng: sai lượt thì phải có CEO xác nhận ghi đè; ghi đè chuyển lượt cho Hinata và commit agent.md", async (t) => {
  const { ctl, repo, git, call } = await fixture(t, "CODEX_ASTRA_DEV", "slow");
  const main = git("rev-parse", "main");
  const { idea } = await call("/ideas", { workspace: repo, title: "Báo cáo tuần" });
  const denied = await call(`/ideas/${idea.id}/start`, {});
  assert.equal(denied.status, 409); assert.equal(denied.code, "NEEDS_SPEC_TURN"); assert.match(denied.error, /CODEX_ASTRA_DEV/);
  assert.equal(ctl.runner.status(repo).turn.nextOwner, "CODEX_ASTRA_DEV", "chưa xác nhận thì không đổi lượt");
  const forced = await call(`/ideas/${idea.id}/start`, { force: true });
  assert.equal(forced.status, 200); assert.equal(forced.idea.forcedFrom, "CODEX_ASTRA_DEV");
  assert.equal(git("rev-parse", "main"), main);
  assert.match(git("show", "main:agent.md"), /NEXT_OWNER.*CODEX_ASTRA_DEV/);
  assert.match(git("branch", "--show-current"), /^ai\//);
  assert.equal(git("rev-parse", "HEAD^"), main);
  assert.match(git("log", "-1", "--format=%s"), /^chore\(agent-sync\): CEO -> NEXT: SPEC_ARCHITECT — FORCE_OVERRIDE ý tưởng mới: Báo cáo tuần/);
  for (let i = 0; i < 200 && !ctl.autopilot.get(forced.idea.runId).steps.length; i++) await sleep(30);
  assert.equal(ctl.autopilot.get(forced.idea.runId).steps[0].role, "SPEC_ARCHITECT");
});

test("ý tưởng: lỗi tạo nhánh thì không đổi lượt hay thêm commit vào main", async (t) => {
  const { ctl, repo, git, call } = await fixture(t, "CODEX_ASTRA_DEV");
  const main = git("rev-parse", "main");
  git("branch", "ai"); // Cản việc tạo ref ai/<tên> mà không cần sửa Git config.
  const { idea } = await call("/ideas", { workspace: repo, title: "Nhánh không tạo được" });
  const started = await call(`/ideas/${idea.id}/start`, { force: true });
  assert.equal(started.code, "GIT_BRANCH");
  assert.equal(git("rev-parse", "main"), main);
  assert.equal(ctl.runner.status(repo).turn.nextOwner, "CODEX_ASTRA_DEV");
  assert.equal(ctl.autopilot.list().length, 0);
});

for (const [trackedIgnore, launch] of [[false, true], [true, true], [true, false]]) {
  test(`dự án phim: khung được commit trên nhánh riêng (.gitignore tracked=${trackedIgnore}, giao Hinata=${launch})`, async (t) => {
    const { ctl, repo, git, call } = await fixture(t, "CLAUDE_AUDITOR", "slow");
    if (trackedIgnore) {
      fs.writeFileSync(path.join(repo, ".gitignore"), "out/\n");
      git("add", ".gitignore"); git("commit", "-qm", "ignore đầu");
    }
    const main = git("rev-parse", "main");
    fs.writeFileSync(path.join(repo, "ghi-chu-rieng.txt"), "ghi chú của CEO");

    const created = await call("/du-an-moi", { ten: "phim-thu", yTuong: "Một bộ phim kiểm thử nhỏ", loai: "phim", caiBoKiem: false, giaoHinata: launch });
    assert.equal(created.status, 202, JSON.stringify(created));
    const id = created.duAnMoi.id;
    let result;
    for (let i = 0; i < 100; i++) {
      result = (await call("/du-an-moi/" + id)).duAnMoi;
      if (result.trangThai !== "dang") break;
      await sleep(50);
    }

    assert.equal(result.trangThai, "xong", JSON.stringify(result.buoc));
    assert.equal(git("rev-parse", "main"), main);
    const branch = git("branch", "--show-current");
    assert.match(branch, /^ai\//);
    const frame = git("log", "--format=%H", "-1", "--", "phim.json");
    assert.ok(frame);
    assert.deepEqual(git("diff-tree", "--no-commit-id", "--name-only", "-r", frame).split(/\r?\n/), [".gitignore", "PHIM.md", "kich-ban.md", "phim.json"]);
    assert.equal(JSON.parse(git("show", frame + ":phim.json")).ten, "phim-thu");
    const ignore = git("show", frame + ":.gitignore");
    assert.match(ignore, /^media\/$/m);
    if (trackedIgnore) assert.match(ignore, /^out\/$/m);
    assert.equal(fs.readFileSync(path.join(repo, "ghi-chu-rieng.txt"), "utf8"), "ghi chú của CEO");
    assert.equal(git("ls-files", "--", "ghi-chu-rieng.txt"), "");
    const [run] = ctl.autopilot.list();
    if (launch) {
      assert.equal(run.git.branch, branch);
      assert.equal(run.steps[0].role, "SPEC_ARCHITECT");
    } else assert.equal(run, undefined);
  });
}

for (const trackedIgnore of [false, true]) {
  for (const launch of [false, true]) {
    test(`dự án phim: thử lại sau khi Git không lưu được khung (.gitignore tracked=${trackedIgnore}, giao Hinata=${launch})`, async (t) => {
      const { ctl, repo, git, call, createdRepos } = await fixture(t, "CLAUDE_AUDITOR", "slow");
      if (trackedIgnore) {
        fs.writeFileSync(path.join(repo, ".gitignore"), "out/\n");
        git("add", ".gitignore"); git("commit", "-qm", "ignore đầu");
      }
      const main = git("rev-parse", "main");
      fs.writeFileSync(path.join(repo, "ghi-chu-rieng.txt"), "ghi chú của CEO");

      const create = async () => {
        const created = await call("/du-an-moi", { ten: "phim-thu-lai", yTuong: "Một bộ phim để kiểm thử lại", loai: "phim", caiBoKiem: false, giaoHinata: launch });
        assert.equal(created.status, 202, JSON.stringify(created));
        for (let i = 0; i < 200; i++) {
          const { duAnMoi } = await call("/du-an-moi/" + created.duAnMoi.id);
          if (duAnMoi.trangThai !== "dang") return duAnMoi;
          await sleep(50);
        }
        assert.fail("Hết giờ tạo khung cho dự án thử");
      };
      git("config", "gpg.program", path.join(repo, "gpg-khong-co-trong-fixture"));
      git("config", "commit.gpgsign", "true");
      const failed = await create();
      assert.equal(failed.trangThai, "loi");
      assert.match(failed.buoc.find((b) => b.id === "khung-phim").ghiChu, /Không commit được khuôn hồ sơ phim.*gpg/s);
      assert.equal(git("status", "--porcelain"), "?? ghi-chu-rieng.txt");
      assert.equal(git("rev-parse", "HEAD"), main);
      assert.equal(ctl.autopilot.list().length, 0);

      git("config", "commit.gpgsign", "false");
      const retried = await create();
      assert.equal(retried.trangThai, "xong", JSON.stringify(retried.buoc));
      assert.deepEqual(createdRepos, ["phim-thu-lai"]);
      assert.equal(git("rev-parse", "main"), main);
      assert.equal(git("status", "--porcelain"), "?? ghi-chu-rieng.txt");
      assert.equal(fs.readFileSync(path.join(repo, "ghi-chu-rieng.txt"), "utf8"), "ghi chú của CEO");
      assert.equal(git("worktree", "list", "--porcelain").split(/\r?\n/).filter((l) => l.startsWith("worktree ")).length, 1);
      assert.deepEqual(git("ls-tree", "--name-only", "HEAD").split(/\r?\n/), [".gitignore", "PHIM.md", "agent.md", "kich-ban.md", "phim.json"]);
      assert.match(git("show", "HEAD:.gitignore"), /^media\/$/m);
      if (trackedIgnore) assert.match(git("show", "HEAD:.gitignore"), /^out\/$/m);
      const [run] = ctl.autopilot.list();
      if (launch) assert.equal(run.steps[0].role, "SPEC_ARCHITECT");
      else assert.equal(run, undefined);
    });
  }
}

test("ý tưởng: dự án đang bận thì không đổi lượt, không chạy chồng", async (t) => {
  const { ctl, repo, call } = await fixture(t, "SOL_ARCHITECT_PLANNER", "slow");
  ctl.autopilot.start({ workspace: repo, task: "Việc đang làm" });
  const { idea } = await call("/ideas", { workspace: repo, title: "Ý tưởng khác" });
  const r = await call(`/ideas/${idea.id}/start`, { force: true });
  assert.equal(r.status, 409); assert.equal(r.code, "AI_BUSY");
  assert.equal(ctl.runner.status(repo).turn.nextOwner, "SOL_ARCHITECT_PLANNER");
});
