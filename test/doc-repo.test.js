"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createCtl } = require("../ctl/main");

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
function makeRepo(root, { remote = "https://github.com/owner/project.git" } = {}) {
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  if (remote) git(root, ["remote", "add", "origin", remote]);
  fs.writeFileSync(path.join(root, "README.md"), "<!-- ghi chú -->\n# Dự án thử\n\nMô tả.\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "khởi tạo"]);
  fs.writeFileSync(path.join(root, "chua-commit.txt"), "x");
}
async function fixture(isPrivate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-docrepo-")), asked = [];
  const ctl = createCtl({ dir: path.join(tmp, "ctl"), githubOptions: { projectsDir: path.join(tmp, "Projects"), getCredential: async () => "cred",
    fetcher: async (url) => { asked.push(url); return { ok: true, status: 200, headers: new Headers(), json: async () => ({ full_name: "owner/project", private: isPrivate }) }; } } });
  await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok));
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (url, body) => {
    const r = await fetch(base + url, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };
  return { ctl, tmp, asked, call, cleanup: async () => { await ctl.close(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test("đọc repo: chọn lại dự án đã đăng ký mà thiếu agent.md thì tạo, không ghi đè bản có sẵn", async () => {
  const f = await fixture(true);
  try {
    const a = path.join(f.tmp, "a"), b = path.join(f.tmp, "b");
    makeRepo(a); makeRepo(b);
    f.ctl.ws.add(a); f.ctl.ws.add(b);
    fs.rmSync(path.join(a, "agent.md"));                       // dự án đăng ký từ trước khi có tính năng tự tạo
    fs.writeFileSync(path.join(b, "agent.md"), "sổ riêng của CEO\n- NEXT_OWNER: CODEX_ASTRA_DEV\n");
    const ra = await f.call("/workspaces/switch", { path: a });
    assert.equal(ra.status, 200); assert.equal(ra.data.agentMd.created, true);
    assert.match(fs.readFileSync(path.join(a, "agent.md"), "utf8"), /NEXT_OWNER/);
    const rb = await f.call("/workspaces/switch", { path: b });
    assert.equal(rb.data.agentMd.created, false);
    assert.equal(fs.readFileSync(path.join(b, "agent.md"), "utf8"), "sổ riêng của CEO\n- NEXT_OWNER: CODEX_ASTRA_DEV\n");
  } finally { await f.cleanup(); }
});

test("đọc repo: số liệu lấy thật từ git/README/agent.md của repo riêng tư, agent.md được commit bình thường", async () => {
  const f = await fixture(true);
  try {
    const root = path.join(f.tmp, "repo"); makeRepo(root);
    f.ctl.ws.add(root);
    const { status, data } = await f.call("/workspaces/overview?workspace=" + encodeURIComponent(root));
    assert.equal(status, 200);
    const o = data.overview;
    assert.equal(o.isRepo, true);
    assert.equal(o.repo.branch, "main");
    assert.deepEqual(o.repo.commits.map((c) => c.subject), ["khởi tạo"]);
    assert.equal(o.repo.changed, 2, "chua-commit.txt và agent.md vừa tạo");
    assert.equal(o.repo.remote, "https://github.com/owner/project.git");
    assert.deepEqual(o.stack, ["Node.js / TypeScript"]);
    assert.equal(o.readme.firstLine, "Dự án thử");
    assert.equal(o.agentMd.exists, true); assert.equal(o.agentMd.nextOwner, "CLAUDE_AUDITOR"); assert.deepEqual(o.agentMd.openBlockers, []);
    assert.equal(o.visibility.kind, "private");
    assert.equal(o.repo.agentMdIgnored, false, "repo riêng tư: agent.md không bị loại khỏi git");
    assert.ok(f.asked.some((u) => u.endsWith("/repos/owner/project")));
  } finally { await f.cleanup(); }
});

test("đọc repo: repo công khai thì agent.md vào .git/info/exclude (một lần), không thể commit nhầm", async () => {
  const f = await fixture(false);
  try {
    const root = path.join(f.tmp, "pub"); makeRepo(root);
    f.ctl.ws.add(root);
    const { data } = await f.call("/workspaces/overview?workspace=" + encodeURIComponent(root));
    assert.equal(data.overview.visibility.kind, "public");
    assert.equal(data.overview.repo.agentMdIgnored, true);
    assert.equal(git(root, ["status", "--porcelain", "--", "agent.md"]), "");
    await f.call("/workspaces/overview?workspace=" + encodeURIComponent(root));
    const exclude = fs.readFileSync(path.join(root, ".git", "info", "exclude"), "utf8");
    assert.equal(exclude.match(/^\/agent\.md$/gm).length, 1);
  } finally { await f.cleanup(); }
});

test("đọc repo: thư mục không phải git và repo không có remote báo đúng, không đoán", async () => {
  const f = await fixture(true);
  try {
    const plain = path.join(f.tmp, "plain"); fs.mkdirSync(plain); fs.writeFileSync(path.join(plain, "a.txt"), "");
    const local = path.join(f.tmp, "local"); makeRepo(local, { remote: null });
    f.ctl.ws.add(plain); f.ctl.ws.add(local);
    const p = (await f.call("/workspaces/overview?workspace=" + encodeURIComponent(plain))).data.overview;
    assert.equal(p.isRepo, false); assert.equal(p.repo, null); assert.equal(p.readme, null); assert.equal(p.agentMd.exists, true);
    const l = (await f.call("/workspaces/overview?workspace=" + encodeURIComponent(local))).data.overview;
    assert.equal(l.visibility.kind, "no-remote"); assert.equal(l.repo.remote, null);
    assert.equal(f.asked.length, 0, "không có remote GitHub thì không gọi GitHub");
  } finally { await f.cleanup(); }
});
