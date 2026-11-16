"use strict";
// CEO duyệt 08/11/2026: các dự án và app sau này đều qua chu trình agent.md và clean code có máy kiểm.
// Văn phòng cài bộ kiểm (tools/kiem-agent.js + workflow CI) vào repo dự án bằng một nút; mẫu agent.md có luật [1].6 và [1].7.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { createBoKiem, FILES } = require("../ctl/bo-kiem");
const { createCtl } = require("../ctl/main");
const k = require("../lib/kiem-agent");
const mask = require("../lib/mask");

const ROOT = path.join(__dirname, "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vp-bokiem-"));
const MAU = fs.readFileSync(path.join(ROOT, "ctl", "agent-template.md"), "utf8").replace("{{TEN_DU_AN}}", "Thử").replace("{{CONG_NGHE}}", "Node.js").replace(/\r\n/g, "\n");

test("lib/kiem-agent.js tự chạy được một mình (không cần file nào của văn phòng); mẫu khóa giống lib/mask.js", (t) => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "kiem-agent.js"), "utf8");
  assert.ok(!/require\(["']\.\.?\//.test(src), "không require file nội bộ");
  assert.equal(k.KEY_SHAPE.source, mask.KEY_SHAPE.source, "hai bản mẫu khóa phải giống nhau");
  const d = tmp();
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  fs.copyFileSync(path.join(ROOT, "lib", "kiem-agent.js"), path.join(d, "kiem-agent.js"));
  fs.writeFileSync(path.join(d, "agent.md"), MAU);
  const run = (...a) => spawnSync(process.execPath, [path.join(d, "kiem-agent.js"), ...a], { cwd: d, encoding: "utf8" });
  let r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /✓ agent\.md: đạt/);
  fs.writeFileSync(path.join(d, "agent.md"), MAU.replace("NEXT_OWNER (MUTEX LOCK): CLAUDE_AUDITOR", "NEXT_OWNER (MUTEX LOCK): GPT"));
  r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /NEXT_OWNER "GPT"/);
  fs.rmSync(path.join(d, "agent.md"));
  assert.equal(run().status, 2, "thiếu agent.md mà không --neu-co thì báo lỗi");
  r = run("--neu-co"); assert.equal(r.status, 0); assert.match(r.stdout, /bỏ qua/);
});

test("mẫu agent.md có luật clean code (CI) và cập nhật không cài lại; Phase 1 dựng CI và khung phát hành; vẫn đạt bộ kiểm", () => {
  assert.match(MAU, /6\. Clean code có máy kiểm: mỗi PR phải qua CI/);
  assert.match(MAU, /7\. Cập nhật không cài lại:/);
  assert.match(MAU, /Cập nhật & phát hành \(luật \[1\]\.7\)/);
  assert.match(MAU, /Phase 1: .*CI \(lint \+ test \+ bộ kiểm agent\.md\) và khung phát hành\/cập nhật/);
  assert.deepEqual(k.checkText(MAU), []);
  const wf = fs.readFileSync(FILES[".github/workflows/kiem-chu-trinh.yml"], "utf8").replace(/\r\n/g, "\n");   // checkout Windows có thể là CRLF
  assert.match(wf, /node tools\/kiem-agent\.js --neu-co\n/); assert.match(wf, /--tu "\$BASE"/); assert.match(wf, /contents: read/);
});

// "GitHub" là repo trần trên máy; repo dự án là bản clone.
function fixture(t) {
  const temp = tmp(), origin = path.join(temp, "origin.git"), repo = path.join(temp, "du-an");
  const run = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  t.after(() => fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  run(temp, "init", "-q", "--bare", "-b", "main", origin);
  run(temp, "clone", "-q", "-c", "core.autocrlf=false", origin, repo);
  for (const [a, b] of [["user.name", "test"], ["user.email", "test@localhost"]]) run(repo, "config", a, b);
  fs.writeFileSync(path.join(repo, "README.md"), "# Dự án\n");
  run(repo, "add", "-A"); run(repo, "commit", "-qm", "đầu tiên"); run(repo, "push", "-q", "origin", "main");
  return { temp, origin, repo, git: (...a) => run(repo, ...a), gitIn: run };
}

test("cài bộ kiểm: nhánh mới từ nhánh chính, đúng 3 file (kiểm agent.md, kiểm hợp đồng, workflow), đẩy lên GitHub; thư mục đang làm không bị đụng", (t) => {
  const f = fixture(t);
  const dir = path.join(f.temp, "ctl"); fs.mkdirSync(dir);
  const logs = [];
  const bk = createBoKiem({ dir, audit: { log: (...a) => logs.push(a) } });
  // Anh đang làm dở trên nhánh khác, có file chưa commit
  f.git("switch", "-q", "-c", "tinh-nang"); fs.writeFileSync(path.join(f.repo, "dang-lam.js"), "1\n");
  assert.equal(bk.status(f.repo).state, "chua-cai");
  const s = bk.install(f.repo);
  assert.match(s.last.branch, /^vp\/bo-kiem-chu-trinh-\d{14}$/);
  assert.equal(s.last.base, "main"); assert.equal(s.last.compareUrl, null, "remote không phải GitHub thì không có link");
  assert.equal(f.git("rev-parse", "--abbrev-ref", "HEAD"), "tinh-nang"); assert.ok(fs.existsSync(path.join(f.repo, "dang-lam.js")));
  assert.ok(!fs.existsSync(path.join(f.repo, "tools", "kiem-agent.js")), "không ghi vào thư mục đang làm");
  assert.equal(f.git("worktree", "list").split("\n").length, 1, "worktree tạm đã gỡ");
  const remote = f.gitIn(f.origin, "ls-tree", "-r", "--name-only", s.last.branch).split("\n").sort();
  assert.deepEqual(remote, [".github/workflows/kiem-chu-trinh.yml", "README.md", "tools/kiem-agent.js", "tools/kiem-hop-dong.js"]);
  assert.equal(f.gitIn(f.origin, "show", s.last.branch + ":tools/kiem-hop-dong.js"), fs.readFileSync(path.join(ROOT, "lib", "kiem-hop-dong.js"), "utf8").replace(/\r\n/g, "\n").trim());
  assert.equal(f.gitIn(f.origin, "show", s.last.branch + ":tools/kiem-agent.js"), fs.readFileSync(path.join(ROOT, "lib", "kiem-agent.js"), "utf8").replace(/\r\n/g, "\n").trim());
  assert.equal(f.gitIn(f.origin, "rev-parse", s.last.branch + "^"), f.gitIn(f.origin, "rev-parse", "main"), "tách từ đúng đầu nhánh chính");
  assert.ok(logs.some((l) => l[1] === "bo_kiem.install"));
  assert.equal(createBoKiem({ dir, audit: { log() {} } }).status(f.repo).last.branch, s.last.branch, "nhớ lần cài qua khởi động lại");
  // Chưa merge mà bấm lại: nhánh mới khác tên, không ghi đè nhánh cũ
  const again = bk.install(f.repo);
  assert.notEqual(again.last.branch, s.last.branch);
  // CEO merge trên GitHub rồi kéo về: đã cài; bấm nữa thì báo, không tạo nhánh rác
  f.gitIn(f.temp, "clone", "-q", f.origin, "merge"); const m = path.join(f.temp, "merge");
  f.gitIn(m, "config", "user.name", "ceo"); f.gitIn(m, "config", "user.email", "ceo@localhost");
  f.gitIn(m, "merge", "-q", "--no-edit", "origin/" + s.last.branch); f.gitIn(m, "push", "-q", "origin", "main");
  const branches = () => f.git("branch", "--list", "vp/*").split("\n").filter(Boolean).length;
  const before = branches();
  assert.throws(() => bk.install(f.repo), (e) => e.code === "NOT_READY" && /đã có bộ kiểm.*git pull/.test(e.message), "nhánh chính trên GitHub đã có");
  assert.equal(branches(), before, "nhánh không có commit thì được xoá");
  f.git("switch", "-q", "main"); f.git("pull", "-q", "--ff-only");
  assert.equal(bk.status(f.repo).state, "da-cai");
  assert.throws(() => bk.install(f.repo), (e) => e.code === "NOT_READY" && /bản mới nhất/.test(e.message));
  // Bộ kiểm của văn phòng đổi (bản trong repo cũ đi): cài lại chỉ đổi file khác
  fs.appendFileSync(path.join(f.repo, "tools", "kiem-agent.js"), "// bản cũ\n");
  f.git("commit", "-qam", "bản cũ"); f.git("push", "-q", "origin", "main");
  assert.equal(bk.status(f.repo).state, "cu");
  const up = bk.install(f.repo);
  assert.equal(up.last.update, true);
  assert.deepEqual(f.gitIn(f.origin, "diff", "--name-only", "main", up.last.branch).split("\n"), ["tools/kiem-agent.js"]);
});

test("cài bộ kiểm: từ chối khi không phải git, chưa có commit, không có remote", (t) => {
  const d = tmp();
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const bk = createBoKiem({ dir: d, audit: { log() {} } });
  const plain = path.join(d, "thuong"); fs.mkdirSync(plain);
  assert.equal(bk.status(plain).state, "khong-phai-git");
  assert.throws(() => bk.install(plain), (e) => e.code === "NO_GIT");
  const empty = path.join(d, "rong"); fs.mkdirSync(empty); execFileSync("git", ["init", "-q", "-b", "main"], { cwd: empty });
  assert.throws(() => bk.install(empty), (e) => e.code === "NO_COMMIT");
  fs.writeFileSync(path.join(empty, "a.txt"), "1");
  execFileSync("git", ["add", "-A"], { cwd: empty });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@l", "commit", "-qm", "1"], { cwd: empty });
  assert.throws(() => bk.install(empty), (e) => e.code === "NO_REMOTE");
});

test("ctl HTTP: tổng quan dự án có trạng thái bộ kiểm; POST /bo-kiem cài", async (t) => {
  const f = fixture(t);
  const ctl = createCtl({ dir: path.join(f.temp, "home") });   // remote là thư mục trên máy: không gọi GitHub
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  try {
    ctl.ws.add(f.repo);
    const base = "http://127.0.0.1:" + ctl.server.address().port;
    const call = async (p, body) => { const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, ...await r.json() }; };
    let r = await call("/workspaces/overview?workspace=" + encodeURIComponent(f.repo));
    assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.overview.boKiem.state, "chua-cai");
    r = await call("/bo-kiem", { workspace: f.repo });
    assert.equal(r.status, 200, JSON.stringify(r)); assert.match(r.boKiem.last.branch, /^vp\/bo-kiem-chu-trinh-/);
    r = await call("/bo-kiem", { workspace: path.join(f.temp, "khong-dang-ky") });
    assert.equal(r.status, 403);
  } finally { await ctl.close(); }
});

test("bấm cài hai lần trong cùng một giây (máy nhanh): nhánh thứ hai thêm -2, không lỗi trùng tên", (t) => {
  const f = fixture(t);
  const at = new Date("2026-11-08T01:02:03Z");
  const bk = createBoKiem({ dir: f.temp, audit: { log() {} }, now: () => at });
  const a = bk.install(f.repo), b = bk.install(f.repo), c = bk.install(f.repo);
  assert.deepEqual([a.last.branch, b.last.branch, c.last.branch], ["vp/bo-kiem-chu-trinh-20261108010203", "vp/bo-kiem-chu-trinh-20261108010203-2", "vp/bo-kiem-chu-trinh-20261108010203-3"]);
  for (const x of [a, b, c]) assert.ok(f.gitIn(f.origin, "rev-parse", "--verify", x.last.branch), "đã đẩy " + x.last.branch);
});

test("repo của chính Văn phòng AI: không báo bản cũ, không mời cài (đã có CI riêng)", () => {
  const bk = createBoKiem({ dir: tmp(), audit: { log() {} } });
  const s = bk.status(ROOT);
  assert.equal(s.state, "van-phong");
  assert.throws(() => bk.install(ROOT), (e) => e.code === "NOT_READY" && /CI riêng/.test(e.message));
  require("../public/progress-view.js");
  const h = globalThis.RepoProgress.html({ workspace: ROOT, boKiem: s }, [], [], {}, { actions: true });
  assert.match(h, /Repo của chính Văn phòng AI/); assert.ok(!/data-bo-kiem/.test(h), "không có nút cài");
});
