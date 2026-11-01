"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createCtl } = require("../ctl/main");
const { remoteName } = require("../ctl/github");

const repo = { full_name: "owner/project", private: true, description: "Dự án riêng", default_branch: "main" };
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
function makeRepo(root, remote = "https://github.com/owner/project.git") {
  fs.mkdirSync(root, { recursive: true }); git(root, ["init", "-b", "main"]); git(root, ["remote", "add", "origin", remote]);
  fs.writeFileSync(path.join(root, "keep.txt"), "chưa commit — phải giữ nguyên");
}
async function fixture(options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-github-")), projectsDir = path.join(tmp, "Projects"), calls = [];
  const githubOptions = { projectsDir, getCredential: async () => "credential-only-in-memory", fetcher: async (url, opts) => {
    calls.push({ url, authorization: opts.headers.Authorization });
    const p = new URL(url).pathname;
    return { ok: true, status: 200, headers: new Headers(p === "/user/repos" && new URL(url).searchParams.get("page") === "1" ? { link: '<https://api.github.com/user/repos?page=2>; rel="next"' } : {}),
      json: async () => p === "/user" ? { login: "owner", email: "do-not-return@example.test" } : p === "/user/repos" ? [repo] : repo };
  }, ...options };
  const ctl = createCtl({ dir: path.join(tmp, "ctl"), githubOptions });
  await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok));
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (url, body) => {
    const r = await fetch(base + url, { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + ctl.token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const finish = async (id) => {
    for (let i = 0; i < 100; i++) { const { operation } = (await call("/github/operations/" + id)).data; if (operation.status !== "running") return operation; await new Promise((r) => setTimeout(r, 20)); }
    throw new Error("Mở repo bị treo");
  };
  return { ctl, tmp, projectsDir, calls, call, finish, cleanup: async () => { await ctl.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

test("GitHub: danh sách repo riêng tư phân trang, credential không ra API/log", async () => {
  const f = await fixture();
  try {
    const r = await f.call("/github/repos?page=1");
    assert.equal(r.status, 200); assert.equal(r.data.account.login, "owner"); assert.equal(r.data.repositories[0].private, true); assert.equal(r.data.hasMore, true);
    assert.equal((await f.call("/github/repos?page=2")).data.hasMore, false);
    assert.equal(f.calls.every((c) => c.url.startsWith("https://api.github.com/") && c.authorization === "Bearer credential-only-in-memory"), true);
    assert.equal(JSON.stringify(r.data).includes("credential-only-in-memory"), false); assert.equal(JSON.stringify(r.data).includes("do-not-return"), false);
    assert.equal(JSON.stringify(f.ctl.audit.recent(100)).includes("credential-only-in-memory"), false);
  } finally { await f.cleanup(); }
});

test("GitHub: mở bản sao có sẵn, giữ file chưa commit và lưu dự án sau restart", async () => {
  const f = await fixture();
  try {
    const root = path.join(f.projectsDir, "old-project"); makeRepo(root); f.ctl.ws.add(root);
    const before = git(root, ["status", "--porcelain"]);
    const r = await f.call("/github/open", { fullName: "owner/project" }); assert.equal(r.status, 202);
    // Đăng ký workspace tự sinh agent.md cho repo chưa có giao thức (CEO quyết 02/11/2026), nên hasAgent là true.
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "done"); assert.equal(op.cloned, undefined); assert.equal(op.hasAgent, true);
    assert.equal(op.workspace, fs.realpathSync(root)); assert.equal(git(root, ["status", "--porcelain"]), before);
    assert.equal(fs.readFileSync(path.join(root, "keep.txt"), "utf8"), "chưa commit — phải giữ nguyên");
    const restored = createCtl({ dir: path.join(f.tmp, "ctl") });
    assert.equal(restored.ws.current(), fs.realpathSync(root)); await restored.close();
  } finally { await f.cleanup(); }
});

test("GitHub: nhận repo chưa đăng ký qua origin HTTPS/SSH, không tạo clone thứ hai", async () => {
  const f = await fixture();
  try {
    const root = path.join(f.projectsDir, "already-here"); makeRepo(root, "git@github.com:owner/project.git");
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "done"); assert.equal(op.workspace, fs.realpathSync(root)); assert.equal(op.cloned, undefined);
    assert.equal(remoteName("https://github.com/owner/project.git"), "owner/project"); assert.equal(remoteName("ssh://git@github.com/owner/project.git"), "owner/project");
  } finally { await f.cleanup(); }
});

test("GitHub: chặn tên repo chèn lệnh/thoát đường dẫn trước khi gọi GitHub", async () => {
  const f = await fixture();
  try {
    for (const name of ["../project", "owner/..", "owner/a/b", "https://evil.test/repo", "owner/repo;whoami", "owner/repo\n--upload-pack=evil"]) assert.equal((await f.call("/github/open", { fullName: name })).status, 400, name);
    assert.equal((await f.call("/github/repos?page=-1")).status, 400); assert.equal(f.calls.length, 0);
  } finally { await f.cleanup(); }
});

test("GitHub: thư mục trùng tên giữ nguyên, không xóa hay ghi đè dữ liệu", async () => {
  const f = await fixture();
  try {
    const root = path.join(f.projectsDir, "owner", "project"); fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, "keep"), "giữ");
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "failed"); assert.equal(op.code, "CHANGED");
    assert.equal(fs.readFileSync(path.join(root, "keep"), "utf8"), "giữ"); assert.equal(f.ctl.jobs.list().length, 0);
  } finally { await f.cleanup(); }
});

test("GitHub: junction của thư mục chủ repo không thoát Projects", async (t) => {
  const f = await fixture();
  try {
    const outside = path.join(f.tmp, "outside"); fs.mkdirSync(outside); fs.mkdirSync(f.projectsDir);
    try { fs.symlinkSync(outside, path.join(f.projectsDir, "owner"), "junction"); } catch { return t.skip("Không tạo được junction"); }
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "failed"); assert.equal(op.code, "PATH_ESCAPE"); assert.deepEqual(fs.readdirSync(outside), []);
  } finally { await f.cleanup(); }
});

test("GitHub: auth hết hạn/mất mạng báo đúng lỗi, không mở dự án giả", async () => {
  for (const status of [401, 403, 404, 500]) {
    const f = await fixture({ fetcher: async () => ({ ok: false, status }) });
    try {
      const r = await f.call("/github/repos"); assert.equal(r.status, { 401: 401, 403: 429, 404: 404, 500: 502 }[status]);
      assert.equal(JSON.stringify(r.data).includes("credential-only-in-memory"), false); assert.equal(f.ctl.ws.list().length, 0);
    } finally { await f.cleanup(); }
  }
  const f = await fixture({ fetcher: async () => { throw new Error("network"); } });
  try { assert.equal((await f.call("/github/repos")).status, 502); } finally { await f.cleanup(); }
});

test("GitHub: không mở song song hai repo, shutdown không đăng ký dở dang", async () => {
  let release;
  const pending = new Promise((r) => { release = r; });
  const f = await fixture({ getCredential: () => pending });
  try {
    const first = await f.call("/github/open", { fullName: "owner/project" }); assert.equal(first.status, 202);
    assert.equal((await f.call("/github/open", { fullName: "owner/another" })).status, 409);
    f.ctl.github.close(); release("credential-only-in-memory");
    await new Promise((r) => setTimeout(r, 20)); assert.equal(f.ctl.ws.list().length, 0);
  } finally { await f.cleanup(); }
});

test("GitHub: clone bằng job thật, nhận đúng file rồi chuyển workspace", async () => {
  const f = await fixture();
  const previous = process.env.GIT_CONFIG_GLOBAL;
  try {
    const source = path.join(f.tmp, "source"); makeRepo(source);
    git(source, ["add", "keep.txt"]); git(source, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "test fixture"]);
    const config = path.join(f.tmp, "git-config");
    git(f.tmp, ["config", "--file", config, "url." + source.replace(/\\/g, "/") + ".insteadOf", "https://github.com/owner/project.git"]);
    process.env.GIT_CONFIG_GLOBAL = config;
    const first = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(first.data.operation.id);
    assert.equal(op.status, "done", JSON.stringify(op)); assert.equal(op.cloned, true);
    assert.equal(f.ctl.jobs.get(op.jobId).status, "done");
    assert.equal(fs.readFileSync(path.join(op.workspace, "keep.txt"), "utf8"), "chưa commit — phải giữ nguyên");
    assert.equal(f.ctl.ws.current(), op.workspace);
    const second = await f.call("/github/open", { fullName: "owner/project" });
    assert.equal((await f.finish(second.data.operation.id)).cloned, undefined);
    assert.equal(f.ctl.jobs.list().length, 1, "không clone lại khi đã có repo");
  } finally { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; await f.cleanup(); }
});

test("GitHub: clone thất bại giữ thư mục, không chọn hay đăng ký repo hỏng", async () => {
  const f = await fixture();
  const previous = process.env.GIT_CONFIG_GLOBAL;
  try {
    const config = path.join(f.tmp, "git-config");
    git(f.tmp, ["config", "--file", config, "url." + path.join(f.tmp, "missing").replace(/\\/g, "/") + ".insteadOf", "https://github.com/owner/project.git"]);
    process.env.GIT_CONFIG_GLOBAL = config;
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "failed"); assert.equal(op.code, "GITHUB_CLONE");
    assert.equal(f.ctl.ws.list().length, 0); assert.equal(fs.existsSync(path.join(f.projectsDir, "owner", "project")), true);
  } finally { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; await f.cleanup(); }
});
