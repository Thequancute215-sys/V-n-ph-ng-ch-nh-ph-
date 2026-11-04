"use strict";
// CEO chọn 04/11/2026: Astra đóng Docker ở Phase Docker/Production, Claude kiểm bảo mật; xuất bản là nút riêng chỉ CEO bấm:
// kiểm tra & build trên máy trước, đẩy image lên kho chỉ khi CEO xác nhận đúng tên image vừa build.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { testCommand, IMAGE } = require("../ctl/xuat-ban");
const { classify } = require("../ctl/policy");
const { AGENTS } = require("../ctl/runner");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("tên image, lệnh test của dự án, luật lệnh docker, lời giao việc Docker cho Astra và Claude", () => {
  for (const ok of ["ghcr.io/thequan/app", "thequan/app", "docker.io/thequan/my-app", "localhost:5000/team/app_1"]) assert.ok(IMAGE.test(ok), ok);
  for (const bad of ["Ghcr.io/A/B", "ghcr.io/a/b:latest", "a//b", "-a/b", "a/b c", ""]) assert.ok(!IMAGE.test(bad), bad);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-xb-tc-"));
  assert.equal(testCommand(dir), null);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
  assert.equal(testCommand(dir), null, "script test mặc định của npm init không tính là có test");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  assert.deepEqual(testCommand(dir), ["npm", "test"]);
  fs.rmSync(path.join(dir, "package.json")); fs.mkdirSync(path.join(dir, "tests")); fs.writeFileSync(path.join(dir, "tests", "test_api.py"), "");
  assert.deepEqual(testCommand(dir), ["python", "-m", "pytest", "-q"]);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(classify(["docker", "build", "-t", "a", "."]).decision, "allow");
  assert.equal(classify(["docker", "compose", "config"]).decision, "allow");
  for (const a of [["docker", "push", "a"], ["docker", "login"], ["docker", "run", "--privileged", "a"], ["docker", "rm", "-f", "x"]]) assert.equal(classify(a).decision, "approve", a.join(" "));
  assert.match(AGENTS.CODEX_ASTRA_DEV.prompt, /DOCKER: .*không phải root.*\.dockerignore.*KHÔNG docker push/);
  assert.match(AGENTS.CLAUDE_AUDITOR.prompt, /Dockerfile\/docker-compose: .*không chạy bằng root.*Vùng \[5\]/);
});

// docker giả (đặt đầu PATH): ghi lại mọi lệnh; file "tu-choi" làm push bị kho từ chối, "build-loi" làm build lỗi.
async function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-xb-")), dir = path.join(temp, "home"), repo = path.join(temp, "kho-app"), bin = path.join(temp, "bin");
  fs.mkdirSync(dir); fs.mkdirSync(repo); fs.mkdirSync(bin);
  const calls = path.join(temp, "calls.txt");
  fs.writeFileSync(path.join(bin, "fake-docker.cjs"), `const fs=require('fs'),p=require('path'),a=process.argv.slice(2),t=${JSON.stringify(temp)};
    fs.appendFileSync(p.join(t,'calls.txt'),a.join(' ')+'\\n');
    if(a[0]==='version'){console.log('27.3.1');}
    else if(a[0]==='build'){if(fs.existsSync(p.join(t,'build-loi'))){console.error('ERROR: failed to solve');process.exit(1);}console.log('naming to '+a[a.indexOf('-t')+1]);}
    else if(a[0]==='push'){if(fs.existsSync(p.join(t,'tu-choi'))){console.error('denied: requested access to the resource is denied');process.exit(1);}console.log('pushed '+a[1]);}
    else process.exit(2);`);
  fs.writeFileSync(path.join(bin, "docker.cmd"), '@"%~dp0\\fake-docker.cjs" %*\r\n');
  fs.writeFileSync(path.join(bin, "docker"), `#!/usr/bin/env node\nrequire(${JSON.stringify(path.join(bin, "fake-docker.cjs"))});\n`, { mode: 0o755 });
  const oldPath = process.env.PATH;
  process.env.PATH = bin + path.delimiter + oldPath;
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "app.js"), "console.log(1)\n"); git("add", "."); git("commit", "-qm", "init");
  const ctl = createCtl({ dir });
  ctl.ws.add(repo);
  t.after(async () => { process.env.PATH = oldPath; await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const wait = async () => { for (let i = 0; i < 400; i++) { const s = ctl.publisher.status(repo), r = s.runs[0]; if (r && !["running", "pushing"].includes(r.status)) return r; await sleep(50); } assert.fail(JSON.stringify(ctl.publisher.status(repo))); };
  const log = () => (fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split(/\r?\n/) : []);
  return { ctl, repo, temp, git, wait, log, dir };
}

test("kiểm tra & build chặn khi chưa sạch/chưa có Dockerfile; build xong thì chờ CEO; đẩy chỉ khi xác nhận đúng tên và repo không đổi", async (t) => {
  const { ctl, repo, temp, git, wait, log } = await fixture(t);
  assert.throws(() => ctl.publisher.setTarget(repo, "ghcr.io/a/b:latest"), /không hợp lệ/);
  assert.equal(ctl.publisher.setTarget(repo, " GHCR.io/thequan/app ").image, "ghcr.io/thequan/app");

  ctl.publisher.prepare(repo);
  let r = await wait();
  assert.equal(r.status, "failed");
  assert.match(r.problem, /^Có Dockerfile ở gốc repo: Chưa có Dockerfile/);

  fs.writeFileSync(path.join(repo, "Dockerfile"), "FROM node:24.11-alpine\n");
  ctl.publisher.prepare(repo);
  r = await wait();
  assert.equal(r.status, "failed");
  assert.match(r.problem, /^Repo sạch, đã commit: .*chưa commit/, "Dockerfile chưa commit thì không build");
  git("add", "."); git("commit", "-qm", "docker");
  const sha = git("rev-parse", "HEAD");

  const started = ctl.publisher.prepare(repo);
  assert.throws(() => ctl.publisher.prepare(repo), (e) => e.code === "PUBLISH_BUSY");
  r = await wait();
  assert.equal(r.id, started.id);
  assert.equal(r.status, "ready", JSON.stringify(r));
  assert.equal(r.tag, "ghcr.io/thequan/app:" + sha.slice(0, 7));
  assert.deepEqual(r.steps.map((s) => s.status), ["done", "done", "done", "skipped", "done"]);
  assert.match(r.steps[3].note, /chưa kiểm chứng bằng test/);
  assert.ok(log().includes("build --pull -t " + r.tag + " ."), log().join("|"));
  assert.ok(!log().some((l) => l.startsWith("push")), "build xong KHÔNG tự đẩy");

  assert.throws(() => ctl.publisher.push(r.id, "ghcr.io/thequan/app:khac"), /không khớp/);
  fs.writeFileSync(path.join(temp, "tu-choi"), "");
  ctl.publisher.push(r.id, r.tag);
  r = await wait();
  assert.equal(r.status, "ready", "đẩy lỗi thì giữ bản build để thử lại");
  assert.match(r.problem, /docker login/);
  fs.rmSync(path.join(temp, "tu-choi"));
  ctl.publisher.push(r.id, r.tag);
  r = await wait();
  assert.equal(r.status, "published");
  assert.equal(log().filter((l) => l === "push " + r.tag).length, 2);
  assert.throws(() => ctl.publisher.push(r.id, r.tag), (e) => e.code === "NOT_READY", "đã xuất bản thì không đẩy lại");

  // Repo có commit mới sau khi build: phải build lại, không đẩy bản cũ
  ctl.publisher.prepare(repo); r = await wait(); assert.equal(r.status, "ready");
  fs.writeFileSync(path.join(repo, "app.js"), "console.log(2)\n"); git("commit", "-qam", "sua");
  assert.throws(() => ctl.publisher.push(r.id, r.tag), (e) => e.code === "CHANGED");
  // Đổi đích sau khi build cũng phải build lại
  ctl.publisher.prepare(repo); r = await wait();
  ctl.publisher.setTarget(repo, "thequan/khac");
  assert.throws(() => ctl.publisher.push(r.id, r.tag), (e) => e.code === "CHANGED");
});

test("chưa khai đích vẫn build thử trên máy nhưng không xuất bản được; build lỗi báo rõ; app tắt giữa chừng thì lượt thành lỗi", async (t) => {
  const { ctl, repo, temp, git, wait, dir } = await fixture(t);
  fs.writeFileSync(path.join(repo, "Dockerfile"), "FROM node:24.11-alpine\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }));
  git("add", "."); git("commit", "-qm", "docker");
  ctl.publisher.prepare(repo);
  let r = await wait();
  assert.equal(r.status, "ready", JSON.stringify(r));
  assert.match(r.tag, /^vanphong\/kho-app:[0-9a-f]{7}$/);
  assert.equal(r.steps[3].note, "npm test");
  assert.throws(() => ctl.publisher.push(r.id, r.tag), (e) => e.code === "NO_TARGET");

  fs.writeFileSync(path.join(temp, "build-loi"), "");
  ctl.publisher.prepare(repo);
  r = await wait();
  assert.equal(r.status, "failed");
  assert.match(r.problem, /docker build lỗi\. .*failed to solve/);

  const file = path.join(dir, "xuat-ban.json"), saved = JSON.parse(fs.readFileSync(file, "utf8"));
  saved.runs.at(-1).status = "running"; fs.writeFileSync(file, JSON.stringify(saved));
  const { createPublisher } = require("../ctl/xuat-ban");
  const again = createPublisher({ jobs: ctl.jobs, ws: ctl.ws, audit: ctl.audit, dir });
  assert.match(again.status(repo).runs[0].problem, /khởi động lại/);
});
