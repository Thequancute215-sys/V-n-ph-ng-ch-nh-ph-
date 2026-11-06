"use strict";
// CEO chọn 04/11/2026: Astra đóng Docker ở Phase Docker/Production, Claude kiểm bảo mật; xuất bản là nút riêng chỉ CEO bấm.
// Đổi 06/11/2026: xuất bản qua GitHub Actions của chính repo (đẩy tag v* hoặc chạy tay workflow) để image lên GHCR + Releases,
// không đẩy image từ máy. Kiểm tra & build trên máy vẫn là bước bắt buộc trước khi xuất bản.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { createPublisher, testCommand, codeVersion, releaseMethod } = require("../ctl/xuat-ban");
const { classify } = require("../ctl/policy");
const { AGENTS } = require("../ctl/runner");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG_WF = 'name: Release\non:\n  push:\n    tags: ["v*.*.*"]\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n';
const DISPATCH_WF = "name: CI\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\n    inputs:\n      publish_release:\n        type: boolean\n        default: false\n      version:\n        type: string\njobs:\n  a:\n    runs-on: ubuntu-latest\n";

test("nhận ra cách xuất bản của repo, phiên bản trong code, lệnh test; luật lệnh docker; lời giao việc", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-xb-tc-")), wf = path.join(dir, ".github", "workflows");
  assert.equal(releaseMethod(dir), null);
  fs.mkdirSync(wf, { recursive: true });
  fs.writeFileSync(path.join(wf, "ci.yml"), "on:\n  push:\n    branches: [main]\n");
  assert.equal(releaseMethod(dir), null, "CI thường không phải workflow xuất bản");
  fs.writeFileSync(path.join(wf, "docker-release.yml"), DISPATCH_WF);
  assert.deepEqual(releaseMethod(dir), { mode: "dispatch", file: "docker-release.yml", publishInput: "publish_release", versionInput: "version" });
  fs.writeFileSync(path.join(wf, "release.yml"), "on:\n  push:\n    tags:\n      - 'v*'\n");
  assert.deepEqual(releaseMethod(dir), { mode: "tag", file: "release.yml", pattern: "v*" }, "có cả hai thì ưu tiên đẩy tag");
  fs.writeFileSync(path.join(wf, "release.yml"), TAG_WF);
  assert.equal(releaseMethod(dir).pattern, "v*.*.*");

  assert.equal(codeVersion(dir), null);
  fs.writeFileSync(path.join(dir, "pyproject.toml"), '[project]\nname = "x"\nversion = "0.9.1"\n');
  assert.equal(codeVersion(dir), "0.9.1");
  fs.writeFileSync(path.join(dir, "version.py"), '__version__ = "6.2.2"\n');
  assert.equal(codeVersion(dir), "6.2.2");

  assert.equal(testCommand(dir), null);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
  assert.equal(testCommand(dir), null, "script test mặc định của npm init không tính là có test");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  assert.deepEqual(testCommand(dir), ["npm", "test"]);
  fs.rmSync(path.join(dir, "package.json"));
  fs.mkdirSync(path.join(dir, "tests")); fs.writeFileSync(path.join(dir, "tests", "test_api.py"), "");
  assert.deepEqual(testCommand(dir), ["python", "-m", "unittest", "discover", "-s", "tests"], "không dùng pytest thì chạy unittest như CI");
  fs.writeFileSync(path.join(dir, "requirements-dev.txt"), "pytest>=8\n");
  assert.deepEqual(testCommand(dir), ["python", "-m", "pytest", "-q"]);
  const venvPy = path.join(dir, ".venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
  fs.mkdirSync(path.dirname(venvPy), { recursive: true }); fs.writeFileSync(venvPy, "");
  assert.deepEqual(testCommand(dir), [venvPy, "-m", "pytest", "-q"], "có .venv của dự án thì dùng Python trong đó");
  fs.rmSync(dir, { recursive: true, force: true });

  assert.equal(classify(["docker", "build", "-t", "a", "."]).decision, "allow");
  assert.equal(classify(["docker", "compose", "config"]).decision, "allow");
  for (const a of [["docker", "push", "a"], ["docker", "login"], ["docker", "run", "--privileged", "a"], ["docker", "rm", "-f", "x"]]) assert.equal(classify(a).decision, "approve", a.join(" "));
  assert.match(AGENTS.CODEX_ASTRA_DEV.prompt, /DOCKER: .*không phải root.*\.dockerignore.*ghcr\.io.*KHÔNG đẩy tag/);
  assert.match(AGENTS.CLAUDE_AUDITOR.prompt, /Dockerfile\/docker-compose: .*không chạy bằng root.*Vùng \[5\]/);
});

// Repo có "GitHub" giả là kho git trần trên máy (origin) và docker giả đặt đầu PATH.
async function fixture(t, workflow) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-xb-")), dir = path.join(temp, "home"), repo = path.join(temp, "kho-app"), origin = path.join(temp, "origin.git"), bin = path.join(temp, "bin");
  fs.mkdirSync(dir); fs.mkdirSync(repo); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "fake-docker.cjs"), `const fs=require('fs'),p=require('path'),a=process.argv.slice(2),t=${JSON.stringify(temp)};
    fs.appendFileSync(p.join(t,'calls.txt'),a.join(' ')+'\\n');
    if(a[0]==='version'){console.log('29.9.2');}
    else if(a[0]==='build'){if(fs.existsSync(p.join(t,'build-loi'))){console.error('ERROR: failed to solve');process.exit(1);}console.log('naming to '+a[a.indexOf('-t')+1]);}
    else process.exit(2);`);
  fs.writeFileSync(path.join(bin, "docker.cmd"), '@"%~dp0\\fake-docker.cjs" %*\r\n');
  fs.writeFileSync(path.join(bin, "docker"), `#!/usr/bin/env node\nrequire(${JSON.stringify(path.join(bin, "fake-docker.cjs"))});\n`, { mode: 0o755 });
  const oldPath = process.env.PATH;
  process.env.PATH = bin + path.delimiter + oldPath;
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  git(repo, "init", "-q", "-b", "main"); git(repo, "config", "user.name", "test"); git(repo, "config", "user.email", "test@localhost");
  fs.mkdirSync(path.join(repo, ".github", "workflows"), { recursive: true });
  if (workflow) fs.writeFileSync(path.join(repo, ".github", "workflows", workflow[0]), workflow[1]);
  fs.writeFileSync(path.join(repo, "version.py"), '__version__ = "1.2.0"\n');
  fs.writeFileSync(path.join(repo, "Dockerfile"), "FROM node:24.11-alpine\n");
  git(repo, "add", "."); git(repo, "commit", "-qm", "init"); git(repo, "remote", "add", "origin", origin); git(repo, "push", "-q", "-u", "origin", "main");
  const ctl = createCtl({ dir });
  ctl.ws.add(repo);
  t.after(async () => { process.env.PATH = oldPath; await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const wait = async (pub = ctl.publisher) => { for (let i = 0; i < 400; i++) { const r = pub.status(repo).runs[0]; if (r && !["running", "releasing"].includes(r.status)) return r; await sleep(50); } assert.fail(JSON.stringify(pub.status(repo))); };
  return { ctl, repo, temp, dir, origin, git: (...a) => git(repo, ...a), gitOrigin: (...a) => git(origin, ...a), wait };
}

test("xuất bản bằng tag: chỉ sau khi kiểm tra & build; đúng phiên bản trong code; commit phải có trên main GitHub; không trùng tag", async (t) => {
  const { ctl, repo, temp, git, gitOrigin, wait } = await fixture(t, ["release.yml", TAG_WF]);
  const st = ctl.publisher.status(repo);
  assert.deepEqual([st.release.mode, st.release.file, st.version], ["tag", "release.yml", "1.2.0"]);

  ctl.publisher.prepare(repo);
  let r = await wait();
  assert.equal(r.status, "ready", JSON.stringify(r));
  assert.match(r.tag, /^vanphong\/kho-app:[0-9a-f]{7}$/);
  assert.ok(!fs.readFileSync(path.join(temp, "calls.txt"), "utf8").includes("push"), "không bao giờ docker push từ máy");

  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2", confirm: "v1.2" }), /dạng X\.Y\.Z/);
  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2.0", confirm: "v1.2.1" }), /không khớp phiên bản v1\.2\.0/);
  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2.1", confirm: "v1.2.1" }), /Phiên bản trong code là 1\.2\.0/);

  // Commit chưa lên GitHub (chưa merge) thì không xuất bản
  fs.writeFileSync(path.join(repo, "app.js"), "1\n"); git("add", "."); git("commit", "-qm", "chưa push");
  ctl.publisher.prepare(repo); r = await wait();
  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2.0", confirm: "v1.2.0" }), (e) => e.code === "NOT_ON_MAIN");
  assert.equal(ctl.publisher.status(repo).runs[0].status, "ready", "từ chối thì vẫn giữ bản đã kiểm");
  git("push", "-q", "origin", "main");

  const done = await ctl.publisher.release(r.id, { version: "v1.2.0", confirm: "v1.2.0" });
  assert.equal(done.status, "released");
  assert.equal(done.release.tag, "v1.2.0");
  assert.equal(gitOrigin("rev-parse", "v1.2.0^{commit}"), r.sha, "tag trên GitHub trỏ đúng commit vừa kiểm");
  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2.0", confirm: "v1.2.0" }), (e) => e.code === "NOT_READY", "đã xuất bản thì không gửi lại");

  ctl.publisher.prepare(repo); r = await wait();
  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2.0", confirm: "v1.2.0" }), (e) => e.code === "TAG_EXISTS");
  // Repo có commit mới sau khi kiểm tra: phải kiểm lại
  fs.writeFileSync(path.join(repo, "app.js"), "2\n"); git("commit", "-qam", "sua");
  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2.0", confirm: "v1.2.0" }), (e) => e.code === "CHANGED");
});

test("xuất bản bằng chạy tay workflow: gửi đúng input; main trên GitHub phải đúng bản vừa kiểm", async (t) => {
  const { ctl, repo, dir, git, wait } = await fixture(t, ["docker-release.yml", DISPATCH_WF]);
  const calls = [];
  const pub = createPublisher({ jobs: ctl.jobs, ws: ctl.ws, audit: ctl.audit, dir: path.join(dir, "rieng"), repoName: () => "owner/proj",
    github: () => ({ dispatch: async (...a) => { calls.push(a); return true; } }) });
  fs.mkdirSync(path.join(dir, "rieng"));
  assert.deepEqual(pub.status(repo).release, { mode: "dispatch", file: "docker-release.yml", publishInput: "publish_release", versionInput: "version" });
  pub.prepare(repo); let r = await wait(pub);
  assert.equal(r.status, "ready", JSON.stringify(r));

  // Có commit trên máy đã lên main nhưng khác bản vừa kiểm: workflow chạy tay lấy đầu main nên phải chặn
  const tmp = path.join(dir, "khac"); execFileSync("git", ["clone", "-q", path.join(dir, "..", "origin.git"), tmp]);
  execFileSync("git", ["-C", tmp, "-c", "user.name=t", "-c", "user.email=t@l", "commit", "-q", "--allow-empty", "-m", "người khác"]); execFileSync("git", ["-C", tmp, "push", "-q", "origin", "main"]);
  await assert.rejects(pub.release(r.id, { version: "2.3.0", confirm: "v2.3.0" }), (e) => e.code === "CHANGED");
  assert.equal(calls.length, 0);

  git("pull", "-q", "--ff-only", "origin", "main");
  pub.prepare(repo); r = await wait(pub);
  const done = await pub.release(r.id, { version: "2.3.0", confirm: "v2.3.0" });
  assert.equal(done.status, "released");
  assert.deepEqual(calls, [["owner/proj", "docker-release.yml", "main", { publish_release: "true", version: "2.3.0" }]]);
  assert.equal(done.release.actionsUrl, "https://github.com/owner/proj/actions/workflows/docker-release.yml");
});

test("repo chưa có workflow xuất bản thì báo giao Astra thêm; build lỗi báo rõ; app tắt giữa chừng thì lượt thành lỗi", async (t) => {
  const { ctl, repo, temp, dir, wait } = await fixture(t, null);
  ctl.publisher.prepare(repo); let r = await wait();
  assert.equal(r.status, "ready");
  await assert.rejects(ctl.publisher.release(r.id, { version: "1.2.0", confirm: "v1.2.0" }), (e) => e.code === "NO_RELEASE_WORKFLOW" && /Astra/.test(e.message));

  fs.writeFileSync(path.join(temp, "build-loi"), "");
  ctl.publisher.prepare(repo); r = await wait();
  assert.equal(r.status, "failed");
  assert.match(r.problem, /docker build lỗi\. .*failed to solve/);

  const file = path.join(dir, "xuat-ban.json"), saved = JSON.parse(fs.readFileSync(file, "utf8"));
  saved.runs.at(-1).status = "releasing"; fs.writeFileSync(file, JSON.stringify(saved));
  const again = createPublisher({ jobs: ctl.jobs, ws: ctl.ws, audit: ctl.audit, dir });
  assert.match(again.status(repo).runs[0].problem, /khởi động lại/);
});
