// Phase 4: workspace, đọc/ghi file trong workspace, lệnh theo danh sách cho phép + CEO duyệt lệnh ngoài danh sách.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createCtl } = require("../ctl/main");
const { classify } = require("../ctl/policy");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-p4-"));
const dir = path.join(tmp, "home"), wsDir = path.join(tmp, "du-an"), outside = path.join(tmp, "ngoai");
let ctl, port;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function call(method, p, body) {
  return new Promise((ok, bad) => {
    const h = { host: "127.0.0.1:" + port, authorization: "Bearer " + ctl.token };
    if (body !== undefined) h["content-type"] = "application/json";
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: h }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} ok({ status: res.statusCode, json: j, text: b }); });
    });
    r.on("error", bad); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const enc = encodeURIComponent;
async function waitDone(id) { for (let i = 0; i < 100; i++) { const s = ctl.jobs.get(id).status; if (!["running", "pending_approval"].includes(s)) return s; await sleep(50); } return "running"; }

test.before(async () => {
  fs.mkdirSync(path.join(wsDir, "src"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(wsDir, "src", "a.txt"), "xin chào");
  fs.writeFileSync(path.join(outside, "bi-mat.txt"), "không được đọc");
  ctl = createCtl({ dir });
  await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok));
  port = ctl.server.address().port;
});
test.after(async () => { await ctl.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test("chính sách lệnh: allow / approve / deny", () => {
  const d = (argv) => classify(argv).decision;
  assert.strictEqual(d(["git", "status"]), "allow");
  assert.strictEqual(d(["git", "pull", "--ff-only"]), "allow");
  assert.strictEqual(d(["git", "commit", "-m", "x"]), "allow");
  assert.strictEqual(d(["npm", "test"]), "allow");
  assert.strictEqual(d(["gh", "pr", "list"]), "allow");
  for (const a of [["git", "push"], ["git", "push", "--force"], ["git", "reset", "--hard"], ["git", "clean", "-fd"], ["git", "checkout", "--", "."],
    ["git", "branch", "-D", "x"], ["git", "-c", "core.sshCommand=evil", "fetch"], ["git", "pull"], ["npm", "install", "x"], ["npm", "publish"],
    ["node", "-e", "1"], ["git", "-C", "/", "status"], ["git", "-C/", "status"], ["git", "--git-dir=/x", "log"], ["git", "log", "--output=/tmp/x"], ["git", "diff", "--output", "/tmp/x"], ["gh", "pr", "merge", "1"], ["gh", "repo", "delete"], ["rm", "-rf", "/"], ["del", "/s", "C:\\"]])
    assert.strictEqual(d(a), "approve", a.join(" "));
  for (const a of [["powershell", "-c", "x"], ["cmd.exe", "/c", "x"], ["bash", "-c", "x"], ["C:\\Windows\\System32\\cmd.exe"], ["python3", "x.py"], ["reg", "delete"]])
    assert.strictEqual(d(a), "deny", a.join(" "));
  assert.strictEqual(d([]), "deny");
  assert.strictEqual(d(["git", "a\0b"]), "deny");
});

test("đăng ký workspace: chặn ổ đĩa, thư mục người dùng, thư mục cấu hình ẩn, thư mục không có", async () => {
  assert.strictEqual((await call("POST", "/workspaces", { path: path.parse(tmp).root })).status, 403);
  assert.strictEqual((await call("POST", "/workspaces", { path: os.homedir() })).status, 403);
  assert.strictEqual((await call("POST", "/workspaces", { path: path.dirname(os.homedir()) })).status, 403);
  assert.strictEqual((await call("POST", "/workspaces", { path: path.join(tmp, "khong-co") })).status, 404);
  // Thư mục ẩn thật trong thư mục người dùng (tên riêng của test, xóa ngay sau): trước đây điều kiện viết ngược nên lọt qua.
  const hidden = fs.mkdtempSync(path.join(os.homedir(), ".vp-test-an-"));
  try {
    fs.mkdirSync(path.join(hidden, "con"));
    for (const p of [hidden, path.join(hidden, "con")]) {
      const h = await call("POST", "/workspaces", { path: p });
      assert.strictEqual(h.status, 403, p + " " + h.text);
      assert.strictEqual(h.json.code, "TOO_SENSITIVE");
    }
  } finally { fs.rmSync(hidden, { recursive: true, force: true }); }
  const r = await call("POST", "/workspaces", { path: wsDir });
  assert.strictEqual(r.status, 201, r.text);
  assert.strictEqual((await call("GET", "/workspaces")).json.active, fs.realpathSync(wsDir));
  if (process.platform === "win32") {
    // Gõ khác hoa/thường trên Windows: cùng một workspace, không thêm dòng mới.
    assert.strictEqual((await call("POST", "/workspaces", { path: wsDir.toUpperCase() })).status, 201);
    assert.strictEqual((await call("GET", "/workspaces")).json.workspaces.length, 1);
  }
});

test("đọc/ghi file: trong workspace được, ra ngoài bị chặn", async () => {
  const w = enc(wsDir);
  const r = await call("GET", `/fs/read?workspace=${w}&path=src/a.txt`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.content, "xin chào");
  for (const p of ["../ngoai/bi-mat.txt", "..\\ngoai\\bi-mat.txt", path.join(outside, "bi-mat.txt"), "src/../../ngoai/bi-mat.txt"])
    assert.strictEqual((await call("GET", `/fs/read?workspace=${w}&path=${enc(p)}`)).status, 403, p);
  assert.strictEqual((await call("POST", "/fs/write", { workspace: wsDir, path: "../ngoai/x.txt", content: "x", expectSha256: null })).status, 403);
  assert.strictEqual((await call("POST", "/fs/write", { workspace: wsDir, path: ".git/config", content: "x", expectSha256: null })).status, 403);
  assert.strictEqual((await call("GET", `/fs/read?workspace=${enc(outside)}&path=bi-mat.txt`)).status, 403, "workspace chưa đăng ký");
  const l = await call("GET", `/fs/list?workspace=${w}&path=src`);
  assert.deepStrictEqual(l.json.items.map((i) => i.name), ["a.txt"]);
});

test("symlink trỏ ra ngoài workspace bị chặn", async (t) => {
  try { fs.symlinkSync(outside, path.join(wsDir, "loi-tat"), "junction"); } catch { return t.skip("máy không cho tạo symlink"); }
  assert.strictEqual((await call("GET", `/fs/read?workspace=${enc(wsDir)}&path=${enc("loi-tat/bi-mat.txt")}`)).status, 403);
  assert.strictEqual((await call("POST", "/fs/write", { workspace: wsDir, path: "loi-tat/moi.txt", content: "x", expectSha256: null })).status, 403);
  assert.ok(!fs.existsSync(path.join(outside, "moi.txt")));
  fs.unlinkSync(path.join(wsDir, "loi-tat"));
});

test("ghi file chống đè: phải gửi sha256 của bản đang có", async () => {
  const cur = (await call("GET", `/fs/read?workspace=${enc(wsDir)}&path=src/a.txt`)).json;
  assert.strictEqual((await call("POST", "/fs/write", { workspace: wsDir, path: "src/a.txt", content: "mới", expectSha256: "sai" })).status, 409);
  const ok = await call("POST", "/fs/write", { workspace: wsDir, path: "src/a.txt", content: "mới", expectSha256: cur.sha256 });
  assert.strictEqual(ok.status, 200, ok.text);
  assert.strictEqual(fs.readFileSync(path.join(wsDir, "src", "a.txt"), "utf8"), "mới");
  assert.strictEqual((await call("POST", "/fs/write", { workspace: wsDir, path: "src/a.txt", content: "đè", expectSha256: cur.sha256 })).status, 409);
  assert.strictEqual((await call("POST", "/fs/write", { workspace: wsDir, path: "src/b.txt", content: "file mới", expectSha256: null })).status, 200);
});

test("lệnh allow chạy ngay trong workspace; lệnh ngoài danh sách chờ duyệt; shell bị từ chối", async () => {
  const a = await call("POST", "/jobs", { workspace: wsDir, argv: ["node", "--version"] });
  assert.strictEqual(a.status, 201, a.text);
  assert.strictEqual(await waitDone(a.json.job.id), "done");
  assert.match((await call("GET", `/jobs/${a.json.job.id}/log`)).text, /^v\d+/);

  const p = await call("POST", "/jobs", { workspace: wsDir, argv: ["node", "-e", "require('fs').writeFileSync('da-duyet.txt','ok')"] });
  assert.strictEqual(p.status, 202, p.text);
  assert.strictEqual(p.json.job.status, "pending_approval");
  await sleep(200);
  assert.ok(!fs.existsSync(path.join(wsDir, "da-duyet.txt")), "chưa duyệt mà đã chạy");
  assert.strictEqual((await call("POST", `/jobs/${p.json.job.id}/approve`, {})).status, 200);
  assert.strictEqual(await waitDone(p.json.job.id), "done");
  assert.ok(fs.existsSync(path.join(wsDir, "da-duyet.txt")), "chạy trong workspace");
  assert.strictEqual((await call("POST", `/jobs/${p.json.job.id}/approve`, {})).status, 409, "không duyệt lại được");

  const r = await call("POST", "/jobs", { workspace: wsDir, argv: ["node", "-e", "require('fs').writeFileSync('tu-choi.txt','x')"] });
  assert.strictEqual((await call("POST", `/jobs/${r.json.job.id}/reject`, {})).json.job.status, "rejected");
  await sleep(200);
  assert.ok(!fs.existsSync(path.join(wsDir, "tu-choi.txt")));

  assert.strictEqual((await call("POST", "/jobs", { workspace: wsDir, argv: ["powershell", "-c", "Remove-Item -Recurse C:\\"] })).status, 403);
  assert.strictEqual((await call("POST", "/jobs", { workspace: outside, argv: ["git", "status"] })).status, 403);
  const actions = ctl.audit.recent(200).map((x) => x.action);
  for (const x of ["job.propose", "job.approve", "job.reject", "job.deny", "file.write", "workspace.add"]) assert.ok(actions.includes(x), "thiếu audit " + x);
});

test("chuyển workspace và gỡ workspace", async () => {
  const second = path.join(tmp, "du-an-2"); fs.mkdirSync(second);
  await call("POST", "/workspaces", { path: second });
  assert.strictEqual((await call("POST", "/workspaces/switch", { path: second })).json.active, fs.realpathSync(second));
  assert.strictEqual((await call("POST", "/workspaces/remove", { path: second })).status, 200);
  assert.strictEqual((await call("POST", "/workspaces/switch", { path: second })).status, 403);
});
