"use strict";
// CEO duyệt 07/11/2026: cập nhật app bằng một nút, không xoá đi tải lại; chỉ nhận bản CEO đã phát hành (tag vX.Y.Z);
// bản mới lỗi thì tự quay về bản cũ; sổ dữ liệu tự nâng cấp.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const u = require("../lib/cap-nhat");
const { createUpdater } = require("../ctl/cap-nhat");
const { open, migrate } = require("../ctl/db");
const { createCtl } = require("../ctl/main");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vp-capnhat-"));

// "GitHub" là một repo trần trên máy; app là bản clone của nó (giống máy người dùng cài bằng git clone).
function fixture(t) {
  const temp = tmp(), origin = path.join(temp, "origin.git"), dev = path.join(temp, "dev"), app = path.join(temp, "app");
  const run = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const prevHome = process.env.VP_HOME;
  process.env.VP_HOME = path.join(temp, "home");
  t.after(() => { if (prevHome === undefined) delete process.env.VP_HOME; else process.env.VP_HOME = prevHome; fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  run(temp, "init", "-q", "--bare", "-b", "main", origin);
  run(temp, "init", "-q", "-b", "main", dev);
  for (const [k, v] of [["user.name", "test"], ["user.email", "test@localhost"], ["core.autocrlf", "false"]]) run(dev, "config", k, v);
  run(dev, "remote", "add", "origin", origin);
  const commit = (version, file = "app.js", text = version) => {
    fs.writeFileSync(path.join(dev, "package.json"), JSON.stringify({ name: "vp", version }, null, 2) + "\n");
    fs.writeFileSync(path.join(dev, file), "// " + text + "\n");
    run(dev, "add", "-A"); run(dev, "commit", "-qm", "bản " + text);
    run(dev, "push", "-q", "origin", "main");
    return run(dev, "rev-parse", "HEAD");
  };
  const tag = (name, message) => { run(dev, "tag", ...(message ? ["-a", name, "-m", message] : [name])); run(dev, "push", "-q", "origin", name); };
  commit("1.0.0");
  run(temp, "clone", "-q", "-c", "core.autocrlf=false", origin, app);
  for (const [k, v] of [["user.name", "test"], ["user.email", "test@localhost"]]) run(app, "config", k, v);
  return { temp, origin, dev, app, run, commit, tag, git: (...a) => run(app, ...a) };
}

test("so tag: số chứ không theo chữ (v1.10.0 mới hơn v1.9.0)", () => {
  assert.deepEqual(["v1.10.0", "v1.9.0", "v1.2.3", "v2.0.0"].sort(u.cmpTag), ["v1.2.3", "v1.9.0", "v1.10.0", "v2.0.0"]);
  assert.ok(!u.TAG.test("v2.0.0-beta") && !u.TAG.test("1.0.0"));
});

test("kiểm bản mới: chưa phát hành → mới nhất → có bản mới (chỉ tới tag, không lấy commit chưa phát hành của main)", (t) => {
  const f = fixture(t);
  assert.equal(u.check(f.app).state, "chua-phat-hanh");
  f.tag("v1.0.0");
  let s = u.check(f.app, { fetch: true });
  assert.equal(s.state, "moi-nhat"); assert.equal(s.version, "1.0.0"); assert.equal(s.branch, "main"); assert.ok(s.fetchedAt);
  const v11 = f.commit("1.1.0");
  f.tag("v1.1.0", "Bản 1.1.0: thêm nút Cập nhật");
  f.tag("v2.0.0-beta");   // không đúng mẫu: bỏ qua
  f.commit("1.2.0-dev");   // đã merge vào main nhưng CEO chưa phát hành
  assert.equal(u.check(f.app).state, "moi-nhat", "chưa tải từ GitHub thì chưa thấy");
  s = u.check(f.app, { fetch: true });
  assert.equal(s.state, "co-ban-moi");
  assert.deepEqual({ name: s.target.name, sha: s.target.sha, version: s.target.version }, { name: "v1.1.0", sha: v11, version: "1.1.0" });
  assert.match(s.target.notes, /thêm nút Cập nhật/);
  assert.deepEqual(s.commits.map((c) => c.subject), ["bản 1.1.0"]);
  assert.equal(s.canUpdate, true, JSON.stringify(s.reasons));
  // Kênh main: lấy cả bản chưa phát hành
  const m = u.check(f.app, { channel: "main", fetch: true });
  assert.equal(m.target.name, "main"); assert.equal(m.target.version, "1.2.0-dev"); assert.equal(m.commits.length, 2);
  assert.equal(u.check(f.app, { channel: "bậy" }).channel, "phat-hanh", "kênh lạ trong config thì về mặc định");
});

test("chặn cập nhật khi app có file đang sửa hoặc có commit riêng; file ngoài git (config, data) không chặn; mất mạng vẫn đọc được", (t) => {
  const f = fixture(t);
  f.commit("1.1.0"); f.tag("v1.1.0");
  fs.writeFileSync(path.join(f.app, "config.json"), "{}");
  fs.mkdirSync(path.join(f.app, "data")); fs.writeFileSync(path.join(f.app, "data", "so.md"), "sổ");
  let s = u.check(f.app, { fetch: true });
  assert.equal(s.canUpdate, true, JSON.stringify(s.reasons));
  fs.writeFileSync(path.join(f.app, "app.js"), "// sửa tay\n");
  s = u.check(f.app);
  assert.equal(s.canUpdate, false); assert.deepEqual(s.dirty, ["app.js"]); assert.match(s.reasons[0], /1 file của app đang bị sửa \(app\.js\)/);
  f.git("checkout", "--", "app.js");
  fs.writeFileSync(path.join(f.app, "rieng.js"), "1"); f.git("add", "rieng.js"); f.git("commit", "-qm", "việc riêng");
  s = u.check(f.app);
  assert.equal(s.state, "lech"); assert.equal(s.canUpdate, false); assert.match(s.reasons[0], /commit riêng/);
  f.git("remote", "set-url", "origin", path.join(f.temp, "khong-co.git"));
  s = u.check(f.app, { fetch: true });
  assert.match(s.fetchError, /Không tải được bản mới/); assert.equal(s.target.name, "v1.1.0", "vẫn dùng tag đã có trên máy");
  const empty = tmp();
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  assert.equal(u.check(empty).state, "khong-phai-git");
});

test("áp bản mới chỉ fast-forward từ đúng bản đã kiểm; quay lại được", (t) => {
  const f = fixture(t);
  const from = f.git("rev-parse", "HEAD"), to = f.commit("1.1.0"); f.tag("v1.1.0");
  f.git("fetch", "-q", "--tags", "origin");
  assert.throws(() => u.apply(f.app, { from: to, to }), /đã đổi từ lúc kiểm/);
  fs.writeFileSync(path.join(f.app, "app.js"), "// sửa\n");
  assert.throws(() => u.apply(f.app, { from, to }), /đang bị sửa/);
  f.git("checkout", "--", "app.js");
  u.apply(f.app, { from, to });
  assert.equal(f.git("rev-parse", "HEAD"), to); assert.equal(u.localVersion(f.app), "1.1.0"); assert.equal(f.git("symbolic-ref", "--short", "HEAD"), "main");
  fs.writeFileSync(path.join(f.app, "config.json"), "{\"port\":1}");
  u.rollback(f.app, from);
  assert.equal(f.git("rev-parse", "HEAD"), from); assert.equal(u.localVersion(f.app), "1.0.0");
  assert.equal(fs.readFileSync(path.join(f.app, "config.json"), "utf8"), "{\"port\":1}", "file ngoài git giữ nguyên");
});

test("chạy cập nhật: thành công; bản mới không lên thì tự quay về bản cũ; tắt app không được thì không đụng mã", async (t) => {
  const f = fixture(t);
  const from = f.git("rev-parse", "HEAD"), to = f.commit("1.1.0"); f.tag("v1.1.0");
  f.git("fetch", "-q", "--tags", "origin");
  const calls = [];
  const fake = (ok) => ({ stopApp: async () => { calls.push("tat"); return ok.stop !== false; }, startApp: async () => { calls.push("bat:" + u.localVersion(f.app)); return ok.start !== false; }, healthy: async () => { calls.push("kiem"); return ok.healthy !== false; } });
  const go = (ok) => u.runUpdate({ root: f.app, from, to, name: "v1.1.0", ...fake(ok) });

  let s = await go({ stop: false });
  assert.equal(s.status, "loi"); assert.match(s.message, /Không tắt được/); assert.deepEqual(calls, ["tat"]); assert.equal(f.git("rev-parse", "HEAD"), from);

  calls.length = 0;
  s = await go({ healthy: false });
  assert.equal(s.status, "da-quay-lai"); assert.match(s.message, /quay về bản cũ\. Dữ liệu giữ nguyên/);
  assert.deepEqual(calls, ["tat", "bat:1.1.0", "kiem", "tat", "bat:1.0.0"]);
  assert.equal(f.git("rev-parse", "HEAD"), from);
  assert.equal(u.readState().status, "da-quay-lai");

  calls.length = 0;
  s = await go({});
  assert.equal(s.status, "xong"); assert.deepEqual(calls, ["tat", "bat:1.1.0", "kiem"]); assert.equal(f.git("rev-parse", "HEAD"), to);
  assert.equal(JSON.parse(fs.readFileSync(u.STATE_FILE(), "utf8")).name, "v1.1.0");

  // Bản trên máy đã đổi giữa chừng: không cập nhật, bật lại bản đang có
  calls.length = 0;
  s = await go({});
  assert.equal(s.status, "loi"); assert.match(s.message, /đã đổi từ lúc kiểm.*chạy lại bản cũ/); assert.deepEqual(calls, ["tat", "bat:1.1.0"]);
});

test("đang cập nhật dở (trong 10 phút) thì không cho bấm lần hai", () => {
  const now = Date.parse("2026-11-07T10:00:00Z");
  assert.equal(u.busy({ status: "dang-tat", at: "2026-11-07T09:55:00Z" }, now), true);
  assert.equal(u.busy({ status: "dang-tat", at: "2026-11-07T09:40:00Z" }, now), false, "treo quá 10 phút thì cho thử lại");
  assert.equal(u.busy({ status: "xong", at: "2026-11-07T09:59:00Z" }, now), false);
  assert.equal(u.busy(null, now), false);
});

test("ctl: chỉ bắt đầu khi có bản mới, đúng tên bản, không có việc đang chạy và văn phòng chạy bằng app", (t) => {
  const f = fixture(t);
  f.commit("1.1.0"); f.tag("v1.1.0"); f.git("fetch", "-q", "--tags", "origin");
  const spawned = [], logs = [];
  let running = [], runs = [], managed = true;
  const up = createUpdater({ root: f.app, audit: { log: (...a) => logs.push(a) }, jobs: { list: () => running }, autopilot: { list: () => runs },
    appManaged: () => managed, spawnUpdater: (a) => spawned.push(a), channel: () => undefined });
  assert.equal(up.status().state, "co-ban-moi");
  assert.throws(() => up.start("v1.0.9"), (e) => e.code === "CHANGED");
  running = [{ agent: "CODEX_ASTRA_DEV" }];
  assert.throws(() => up.start("v1.1.0"), (e) => e.code === "AI_BUSY" && /CODEX_ASTRA_DEV/.test(e.message));
  running = []; runs = [{ status: "running" }];
  assert.throws(() => up.start("v1.1.0"), (e) => e.code === "AI_BUSY");
  runs = [{ status: "awaiting_approval" }]; managed = false;
  assert.throws(() => up.start("v1.1.0"), (e) => e.code === "NOT_APP");
  managed = true;
  const s = up.start("v1.1.0");
  assert.equal(s.busy, true); assert.equal(s.last.status, "bat-dau");
  const head = f.git("rev-parse", "HEAD"), tagSha = f.git("rev-parse", "v1.1.0^{commit}");
  assert.deepEqual(spawned, [["--tach", "--tu", head, "--den", tagSha, "--ten", "v1.1.0"]]);
  assert.ok(logs.some((l) => l[1] === "app.update"));
  assert.throws(() => up.start("v1.1.0"), (e) => e.code === "UPDATE_BUSY", "bấm lần hai khi đang chạy");
  // Đã mới nhất
  f.git("merge", "-q", "--ff-only", "v1.1.0");
  fs.rmSync(u.STATE_FILE());
  assert.throws(() => up.start("v1.1.0"), (e) => e.code === "NOT_READY" && /mới nhất/.test(e.message));
});

test("ctl HTTP: GET/POST /cap-nhat trả về đúng mã; /health báo phiên bản trong package.json", async (t) => {
  const f = fixture(t);
  const dir = path.join(f.temp, "ctl");
  const ctl = createCtl({ dir, updaterOptions: { root: f.app, appManaged: () => false, spawnUpdater: () => assert.fail("không được chạy"), channel: () => "phat-hanh" } });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  try { await httpCase(ctl, f); } finally { await ctl.close(); }   // tắt ctl (nhả file sổ) trước khi dọn thư mục thử
});

async function httpCase(ctl, f) {
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (p, body) => { const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, ...await r.json() }; };
  assert.equal((await call("/health")).version, require("../package.json").version);
  let r = await call("/cap-nhat");
  assert.equal(r.status, 200); assert.equal(r.capNhat.state, "chua-phat-hanh");
  f.commit("1.1.0"); f.tag("v1.1.0");
  r = await call("/cap-nhat?fetch=1");
  assert.equal(r.capNhat.state, "co-ban-moi"); assert.equal(r.capNhat.target.name, "v1.1.0");
  r = await call("/cap-nhat", { name: "v1.1.0" });
  assert.equal(r.status, 409); assert.equal(r.code, "NOT_APP");
}

test("sổ ctl.db tự nâng cấp đúng một lần mỗi bước; bước lỗi thì không ghi dở; bản cũ vẫn mở được sổ đã nâng cấp", (t) => {
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const steps = ["CREATE TABLE ghi_chu (id INTEGER PRIMARY KEY, noi_dung TEXT)", (db) => db.exec("ALTER TABLE ghi_chu ADD COLUMN tac_gia TEXT")];
  let db = open(dir, { migrations: steps });
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2);
  db.prepare("INSERT INTO ghi_chu (noi_dung, tac_gia) VALUES (?, ?)").run("giữ nguyên", "CEO");
  db.close();
  db = open(dir, { migrations: steps });   // chạy lại: CREATE TABLE lần hai sẽ lỗi nếu bị chạy lại
  assert.equal(db.prepare("SELECT tac_gia FROM ghi_chu").get().tac_gia, "CEO");
  db.close();
  const bad = [...steps, (d) => { d.exec("ALTER TABLE ghi_chu ADD COLUMN x TEXT"); throw new Error("hỏng giữa chừng"); }];
  assert.throws(() => open(dir, { migrations: bad }), (e) => e.code === "DB_MIGRATION" && /bước 3/.test(e.message));
  const raw = new DatabaseSync(path.join(dir, "ctl.db"));
  assert.equal(raw.prepare("PRAGMA user_version").get().user_version, 2);
  assert.ok(!raw.prepare("PRAGMA table_info(ghi_chu)").all().some((c) => c.name === "x"), "bước lỗi được hoàn tác");
  assert.equal(migrate(raw, steps.slice(0, 1)), 2, "app bản cũ (ít bước hơn) không đụng sổ");
  raw.close();
  db = open(dir);   // danh sách thật hiện tại
  assert.equal(db.prepare("SELECT noi_dung FROM ghi_chu").get().noi_dung, "giữ nguyên");
  db.close();
});

test("scripts/cap-nhat.js từ chối tham số sai", () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "cap-nhat.js"), "--tu", "abc", "--den", "HEAD"], { encoding: "utf8" });
  assert.equal(r.status, 2); assert.match(r.stderr, /40 ký tự/);
});

test("lần hỏi GitHub gần nhất còn nhớ sau khi ctl khởi động lại", async (t) => {
  const f = fixture(t);
  const make = () => createUpdater({ root: f.app, audit: { log() {} }, jobs: { list: () => [] }, autopilot: { list: () => [] }, appManaged: () => true, spawnUpdater: () => {}, channel: () => "phat-hanh" });
  assert.equal(make().status().fetchedAt, null);
  const s = await make().refresh();
  assert.ok(s.fetchedAt); assert.equal(s.fetchError, null);
  assert.equal(make().status().fetchedAt, s.fetchedAt, "ctl mới đọc lại từ ~/.van-phong-ao/cap-nhat-kiem.json");
});
