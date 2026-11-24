"use strict";
// Chạy song song Astra (backend) + Kakashi (frontend) theo hợp đồng giao tiếp (giao thức [8], CEO duyệt 16/11/2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const songSong = require("../ctl/song-song");
const kiemAgent = require("../lib/kiem-agent");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOP_DONG = {
  openapi: "3.0.3", info: { title: "Thử", version: "1.0.0" },
  "x-thu-muc": { backend: ["server"], frontend: ["client"] }, "x-tien-to-api": "/api",
  paths: { "/api/bai": { get: { operationId: "listBai", responses: { 200: { description: "ok" } } } } },
};
const AGENT = (next) => `# Agent\n## [1] HIẾN PHÁP DỰ ÁN\n- Tên dự án: Thử\n## [2] ĐẶC TẢ\n- F1: Thử\n## [3] KIẾN TRÚC\n- API Contract: contract/api.json\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 2 - Thử\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): ${next}\n\n### [4.1] NHẬT KÝ PHASE HIỆN TẠI (tối đa 25 dòng)\n- File đã sửa: [Chưa có]\n\n### [4.2] LƯU TRỮ PHASE ĐÃ XONG\n- (Chưa có)\n\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n`;

async function fixture(t, mode = "dung") {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-songsong-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.mkdirSync(path.join(repo, "contract")); fs.writeFileSync(path.join(repo, "contract", "api.json"), JSON.stringify(HOP_DONG, null, 2));
  fs.writeFileSync(path.join(repo, "agent.md"), AGENT("CODEX_ASTRA_DEV"));
  fs.writeFileSync(path.join(repo, "README.md"), "# Thử\n");
  git("add", "-A"); git("commit", "-qm", "init");
  const fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, `const fs=require('fs'),path=require('path');const role=process.argv[2],mode=process.argv[3],prompt=process.argv[4]||'';
    const tra=/BỊ TRẢ LẠI/.test(prompt);
    const ghi=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo.'}));process.exit(0);}
    let next={CODEX_ASTRA_DEV:'SOL_ARCHITECT_ADVISOR',FRONTEND_UIUX_DEV:'SOL_ARCHITECT_ADVISOR',SOL_ARCHITECT_ADVISOR:'CLAUDE_AUDITOR',CLAUDE_AUDITOR:'SPEC_ARCHITECT'}[role];
    let files=[];
    if(role==='CODEX_ASTRA_DEV'){if(!/CHẠY SONG SONG/.test(prompt))process.exit(3);ghi('server/routes.js',"app.get('/api/bai', list);\\n");files=['server/routes.js'];}
    if(role==='FRONTEND_UIUX_DEV'){if(!/CHẠY SONG SONG/.test(prompt))process.exit(3);ghi('client/api.js',"export const list = () => fetch('/api/bai');\\n");files=['client/api.js'];
      if(mode==='lan'&&!tra){ghi('server/hack.js','// Kakashi sửa lấn sang backend\\n');files.push('server/hack.js');}
      if(mode==='lan'&&tra){try{fs.unlinkSync('server/hack.js');}catch{}}}
    // cham: Kakashi chạy lâu (để CEO kịp thao tác giữa chừng trong test)
    if(mode==='cham'&&role==='FRONTEND_UIUX_DEV'){const t=Date.now();while(Date.now()-t<4000){}}
    console.log(JSON.stringify({result:'Xong.'+String.fromCharCode(10)+JSON.stringify({role,next_owner:next,files,claim_fixed:[],done:role==='CLAUDE_AUDITOR'?true:undefined,giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}]})}));`);
  const reporter = path.join(temp, "claude.js");
  fs.writeFileSync(reporter, `process.argv.splice(2, process.argv.length, ...${JSON.stringify(["CLAUDE_REPORTER", mode])}, process.argv.at(-1)); require(${JSON.stringify(fake)});`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries(["CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV", "SOL_ARCHITECT_ADVISOR", "CLAUDE_AUDITOR", "CLAUDE_REPORTER", "SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER"].map((r) => [r, r === "CLAUDE_REPORTER" ? [process.execPath, reporter, "-p", "{prompt}"] : [process.execPath, fake, r, mode, "{prompt}"]]))));
  fs.writeFileSync(path.join(dir, "quyen.json"), JSON.stringify({ toanQuyen: false }));
  const ctl = createCtl({ dir });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  ctl.ws.add(repo);
  const call = async (p, body) => { const r = await fetch("http://127.0.0.1:" + ctl.server.address().port + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, ...await r.json() }; };
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const wait = async (id, status) => { for (let i = 0; i < 400; i++) { const run = ctl.autopilot.get(id); if (run.status === status) return run; if (run.status === "attention") assert.fail(run.problem); await sleep(50); } assert.fail("Không tới " + status + ": " + JSON.stringify(ctl.autopilot.get(id)).slice(0, 2000)); };
  return { ctl, repo, git, call, wait, dir };
}

test("điều kiện chạy song song: cần hợp đồng đạt, đủ hai thư mục không chồng nhau, repo sạch", async (t) => {
  const { repo, git } = await fixture(t);
  assert.equal(songSong.dieuKien(repo).ok, true);
  const hd = JSON.parse(fs.readFileSync(path.join(repo, "contract", "api.json"), "utf8"));
  fs.writeFileSync(path.join(repo, "contract", "api.json"), JSON.stringify({ ...hd, "x-thu-muc": { backend: ["src"], frontend: ["src/ui"] } }));
  assert.match(songSong.dieuKien(repo).why, /chồng nhau/);
  fs.writeFileSync(path.join(repo, "contract", "api.json"), JSON.stringify({ ...hd, "x-thu-muc": { backend: ["server"] } }));
  assert.match(songSong.dieuKien(repo).why, /chưa khai đủ thư mục/);
  git("checkout", "--", "contract/api.json");
  fs.appendFileSync(path.join(repo, "README.md"), "sửa dở\n");
  assert.match(songSong.dieuKien(repo).why, /chưa commit/);
  git("checkout", "--", "README.md");
  fs.rmSync(path.join(repo, "contract"), { recursive: true });
  assert.match(songSong.dieuKien(repo).why, /chưa có hợp đồng/);
});

test("luồng tự chạy: tới lượt Astra thì Astra + Kakashi chạy song song, gộp hai phần, agent.md hai commit đúng giao thức, rồi sang Sol cố vấn", async (t) => {
  const { ctl, repo, git, call, wait } = await fixture(t);
  const base = git("rev-parse", "HEAD");
  const r = await call("/autopilot", { workspace: repo, task: "Làm API danh sách bài và giao diện gọi nó" });
  assert.equal(r.status, 201);
  const run = await wait(r.run.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), ["CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV", "SOL_ARCHITECT_ADVISOR", "CLAUDE_AUDITOR"]);
  assert.ok(run.steps[0].songSong && run.steps[1].songSong);
  // Diff từng lượt (CEO và Claude xem): mỗi bên chỉ thấy đúng phần của mình
  assert.deepEqual(ctl.autopilot.stepDiff(run.id, 1).files.map((f) => f.path), ["server/routes.js"]);
  assert.deepEqual(ctl.autopilot.stepDiff(run.id, 2).files.map((f) => f.path), ["client/api.js"]);
  assert.equal(fs.readFileSync(path.join(repo, "server", "routes.js"), "utf8").includes("/api/bai"), true, "phần của Astra đã vào nhánh");
  assert.equal(fs.readFileSync(path.join(repo, "client", "api.js"), "utf8").includes("/api/bai"), true, "phần của Kakashi đã vào nhánh");
  const log = git("log", "--format=%s", base + "..HEAD");
  assert.match(log, /chore\(agent-sync\): CODEX_ASTRA_DEV -> NEXT: FRONTEND_UIUX_DEV — chạy song song/);
  assert.match(log, /chore\(agent-sync\): FRONTEND_UIUX_DEV -> NEXT: SOL_ARCHITECT_ADVISOR — chạy song song/);
  assert.match(log, /Gộp phần CODEX_ASTRA_DEV \(chạy song song\)/);
  assert.match(log, /Gộp phần FRONTEND_UIUX_DEV \(chạy song song\)/);
  const md = fs.readFileSync(path.join(repo, "agent.md"), "utf8");
  assert.match(md, /- CODEX_ASTRA_DEV \(song song\): server\/routes.js/);
  assert.match(md, /- FRONTEND_UIUX_DEV \(song song\): client\/api.js/);
  const lich = kiemAgent.checkHistory(repo, base).filter((x) => /chạy song song/.test(x.subject));
  assert.equal(lich.length, 2);
  for (const x of lich) assert.deepEqual(x.loi, [], x.subject + ": " + x.loi.join("; "));
  assert.equal(git("worktree", "list").split("\n").length, 1, "worktree tạm đã gỡ");
  assert.ok(ctl.audit.recent(300).some((a) => a.action === "song_song.gop"));
  assert.ok(!git("branch", "--list").includes("song"), "không tạo nhánh nào");
});

test("rà soát khi chạy song song: hạ quyền riêng Astra không mở tiếp nếu Kakashi vẫn Toàn quyền", async (t) => {
  const { ctl, repo, call } = await fixture(t);
  const runOriginal = ctl.runner.run;
  t.mock.method(ctl.runner, "run", (opts, actor) => {
    if (opts.role === "FRONTEND_UIUX_DEV") {
      throw Object.assign(new Error("Rà soát thử chưa hoàn tất"), {
        code: "NEEDS_SCAN_APPROVAL", scan: { total: 0, fingerprint: null, truncated: true },
      });
    }
    return runOriginal(opts, actor);
  });
  const { run } = await call("/autopilot", { workspace: repo, task: "Thử nhịp song song" });
  assert.equal(run.status, "awaiting_scan");
  assert.equal(run.scan.role, "FRONTEND_UIUX_DEV");
  assert.equal(run.scan.songSong, true);

  const p = "/scan?workspace=" + encodeURIComponent(repo);
  await call("/quyen", { role: "FRONTEND_UIUX_DEV", muc: "toan" });
  assert.equal((await call(p)).canResumeLimited, false);
  await call("/quyen", { role: "FRONTEND_UIUX_DEV", muc: "nhap" });
  assert.equal((await call(p)).canResumeLimited, true);
});

test("rào chắn: Kakashi sửa lấn sang thư mục backend thì bị trả lại riêng một lần, sửa xong thì gộp bình thường", async (t) => {
  const { repo, call, wait } = await fixture(t, "lan");
  const r = await call("/autopilot", { workspace: repo, task: "Làm API danh sách bài và giao diện gọi nó" });
  const run = await wait(r.run.id, "awaiting_approval");
  const kakashi = run.steps.filter((s) => s.role === "FRONTEND_UIUX_DEV");
  assert.equal(kakashi.length, 2, "Kakashi chạy hai lần");
  assert.equal(run.steps.filter((s) => s.role === "CODEX_ASTRA_DEV").length, 1, "Astra không phải chạy lại");
  assert.match(kakashi[0].explainRejected, /song-song: FRONTEND_UIUX_DEV sửa server\/hack.js ngoài phần của mình/);
  assert.equal(kakashi[1].explainRetried, true);
  assert.ok(!fs.existsSync(path.join(repo, "server", "hack.js")), "file lấn sang không vào nhánh");
  assert.ok(fs.existsSync(path.join(repo, "client", "api.js")));
});

test("CEO thao tác giữa chừng: duyệt tay bàn giao song song bị chặn; từ chối tay thì luồng dừng, không gộp phần đó, worktree được gỡ", async (t) => {
  const { ctl, repo, git, call, wait } = await fixture(t, "cham");
  const base = git("rev-parse", "HEAD");
  const r = await call("/autopilot", { workspace: repo, task: "Làm API danh sách bài và giao diện gọi nó" });
  let astra = null;
  for (let i = 0; i < 200 && !astra; i++) { const run = ctl.autopilot.get(r.run.id); const st = run.steps.find((s) => s.role === "CODEX_ASTRA_DEV"); if (st && ctl.runner.get(st.jobId)) astra = st.jobId; else await sleep(50); }
  assert.ok(astra, "Astra đã bàn giao");
  assert.throws(() => ctl.runner.approve(astra, "ceo"), { code: "SONG_SONG" });
  ctl.runner.reject(astra, "ceo");
  const run = await wait(r.run.id, "awaiting_approval");
  assert.match(run.problem, /CEO đã từ chối bàn giao của Astra/);
  assert.ok(!fs.existsSync(path.join(repo, "server", "routes.js")), "phần CEO từ chối không được gộp");
  assert.equal(git("rev-parse", "HEAD"), base);
  for (let i = 0; i < 100 && git("worktree", "list").split("\n").length > 1; i++) await sleep(50);
  assert.equal(git("worktree", "list").split("\n").length, 1, "worktree đã gỡ");
});

test("CEO dừng một lượt đang chạy song song từ bảng điều khiển: cả luồng dừng, bên còn lại bị huỷ, worktree được gỡ", async (t) => {
  const { ctl, repo, git, call } = await fixture(t, "cham");
  const r = await call("/autopilot", { workspace: repo, task: "Làm API danh sách bài và giao diện gọi nó" });
  let kakashi = null;
  for (let i = 0; i < 200 && !kakashi; i++) { const st = ctl.autopilot.get(r.run.id).steps.find((s) => s.role === "FRONTEND_UIUX_DEV"); if (st) kakashi = st.jobId; else await sleep(50); }
  ctl.autopilot.cancelJob(kakashi); await ctl.jobs.kill(kakashi, "ceo");
  const run = ctl.autopilot.get(r.run.id);
  assert.equal(run.status, "stopped");
  for (let i = 0; i < 100 && git("worktree", "list").split("\n").length > 1; i++) await sleep(50);
  assert.equal(git("worktree", "list").split("\n").length, 1, "worktree đã gỡ");
  await sleep(700);
  assert.equal(ctl.autopilot.get(r.run.id).status, "stopped", "không chạy báo cáo Claude sau khi CEO dừng");
});

test("rào chắn và sổ: đổi tên file ra ngoài phần mình bị bắt; [4.1] gần đầy không vượt 25 dòng; còn blocker OPEN thì không chạy song song", async (t) => {
  const { repo, git, dir } = await fixture(t);
  fs.mkdirSync(path.join(repo, "client")); fs.writeFileSync(path.join(repo, "client", "a.js"), "x\n"); git("add", "-A"); git("commit", "-qm", "a");
  const ss = songSong.tao(repo, { id: "thu", dir });
  t.after(() => songSong.don(repo, ss));
  const wt = ss.wt.FRONTEND_UIUX_DEV;
  fs.mkdirSync(path.join(wt, "server"), { recursive: true });
  execFileSync("git", ["mv", "client/a.js", "server/a.js"], { cwd: wt, stdio: "ignore" });
  const loi = songSong.phamVi(wt, ss.base, "FRONTEND_UIUX_DEV", { backend: ["server"], frontend: ["client"] }).join("\n");
  assert.match(loi, /tự xoá client\/a.js/); assert.match(loi, /sửa server\/a.js ngoài phần của mình/);
  // [4.1] đã 24 dòng: thêm 1 dòng cho Astra, dòng của Kakashi thay vào chỗ còn lại không được nữa → vẫn ≤ 25
  const md = fs.readFileSync(path.join(repo, "agent.md"), "utf8").replace("- File đã sửa: [Chưa có]", Array.from({ length: 24 }, (_, i) => "- ghi chú " + i).join("\n"));
  fs.writeFileSync(path.join(repo, "agent.md"), md); git("commit", "-qam", "so day");
  songSong.don(repo, ss);
  const ss2 = songSong.tao(repo, { id: "thu2", dir });
  t.after(() => songSong.don(repo, ss2));
  songSong.gop(repo, ss2, { task: "thử", handoffs: {} });
  const z = kiemAgent.parse(fs.readFileSync(path.join(repo, "agent.md"), "utf8")).zones["4.1"].filter((l) => l.trim());
  assert.ok(z.length <= 25, "[4.1] có " + z.length + " dòng");
  fs.writeFileSync(path.join(repo, "agent.md"), fs.readFileSync(path.join(repo, "agent.md"), "utf8").replace("- AUDIT_STATUS: PASS", "- AUDIT_STATUS: REJECT\n- [ ] OPEN P2-H01 [HIGH - server]: lỗi backend"));
  git("commit", "-qam", "blocker");
  assert.match(songSong.dieuKien(repo).why, /còn blocker/);
});
