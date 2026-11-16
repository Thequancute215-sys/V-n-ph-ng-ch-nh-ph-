"use strict";
// Điều khiển văn phòng từ điện thoại (lib/dieu-khien-xa.js): ghép bằng mã một lần, khóa thiết bị, danh sách lệnh, nhật ký.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const guard = require("../lib/guard");
const { createDieuKhienXa, handle, allowed } = require("../lib/dieu-khien-xa");

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-dkx-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test("danh sách lệnh: mở xem/giao việc/duyệt/phanh, chặn chạy lệnh tùy ý, file, rà soát, xuất bản, đẩy nhánh", () => {
  for (const [m, p] of [["GET", "/autopilot"], ["GET", "/workspaces"], ["GET", "/jobs?status=running"], ["POST", "/autopilot"], ["POST", "/autopilot/auto-abc_1/approve"],
    ["POST", "/autopilot/auto-1/answer"], ["POST", "/handoffs/job-1/reject"], ["POST", "/kill-all"], ["GET", "/autopilot/a1/steps/3/diff"], ["GET", "/ai/status?workspace=C%3A%5Cx"],
    // CEO yêu cầu 16/11/2026: đổi tài khoản Antigravity trong menu điện thoại, đặt model phòng khi chạm nhãn nhân vật
    ["POST", "/agy-tai-khoan/oanhbui1081979-e87151/chuyen"], ["POST", "/dieu-phoi"]]) assert.ok(allowed(m, p), m + " " + p);
  for (const [m, p] of [["POST", "/jobs"], ["POST", "/jobs/job-1/approve"], ["POST", "/fs/write"], ["GET", "/fs/read"], ["POST", "/scan/approve"], ["POST", "/publish/prepare"],
    ["POST", "/publish/x/release"], ["POST", "/autopilot/a1/push"], ["POST", "/autopilot/a1/web-result"], ["POST", "/ai/run"], ["POST", "/workspaces"], ["POST", "/workspaces/remove"],
    ["POST", "/agy-tai-khoan/cat"], ["POST", "/agy-tai-khoan/sua"], ["POST", "/agy-tai-khoan/doc-nghi"], ["POST", "/agy-tai-khoan/a1/xoa"], ["POST", "/agy-tai-khoan/../x/chuyen"], ["POST", "/ket-noi/add"], ["POST", "/cap-nhat"], ["GET", "/audit"], ["POST", "/autopilot/../jobs"], ["GET", "/autopilot//x"], ["DELETE", "/autopilot/a1"]]) assert.ok(!allowed(m, p), m + " " + p);
});

test("ghép: mã 6 số dùng một lần, hết hạn sau 5 phút, sai 5 lần thì khóa; chỉ lưu bản băm của khóa", (t) => {
  const dir = tmp(t); let clock = 1_800_000_000_000;
  const dkx = createDieuKhienXa({ home: () => dir, now: () => clock });
  assert.throws(() => dkx.ghep("123456", "A"), { code: "BAD_CODE" }, "chưa tạo mã thì không ghép được");
  const { ma } = dkx.taoMa();
  assert.match(ma, /^\d{6}$/);
  const r = dkx.ghep(ma, "iPhone <b>Quân</b>", "1.2.3.4");
  assert.equal(r.thietBi.ten, "iPhone bQuân/b", "bỏ ký tự < >");
  assert.ok(r.token.length >= 40);
  assert.throws(() => dkx.ghep(ma, "B"), { code: "BAD_CODE" }, "mã đã dùng");
  const saved = fs.readFileSync(path.join(dir, "dieu-khien-xa.json"), "utf8");
  assert.ok(!saved.includes(r.token), "không lưu khóa thô");
  assert.equal(dkx.xacThuc(r.token).id, r.thietBi.id);
  assert.equal(dkx.xacThuc(r.token + "x"), null);
  // Hết hạn
  const m2 = dkx.taoMa().ma; clock += 5 * 60 * 1000 + 1;
  assert.throws(() => dkx.ghep(m2, "C"), { code: "BAD_CODE" });
  // Khóa sau 5 lần sai (đã sai 3 lần ở trên: chưa tạo mã, mã đã dùng, mã hết hạn)
  const m3 = dkx.taoMa().ma, wrong = m3 === "000000" ? "111111" : "000000";
  // Ghép thành công xoá đếm sai; từ đó đã sai 2 lần (mã đã dùng, mã hết hạn), thêm 3 lần nữa là đủ 5.
  for (let i = 0; i < 3; i++) assert.throws(() => dkx.ghep(wrong, "D"), { code: "BAD_CODE" });
  assert.throws(() => dkx.ghep(m3, "D"), { code: "LOCKED" }, "đủ 5 lần sai thì mã đúng cũng bị chặn");
  clock += 15 * 60 * 1000 + 1;
  const m4 = dkx.taoMa().ma; assert.ok(dkx.ghep(m4, "E").token);
  // Thu hồi
  dkx.thuHoi(r.thietBi.id);
  assert.equal(dkx.xacThuc(r.token), null);
  assert.equal(dkx.danhSach().length, 1);
  assert.ok(dkx.nhatKy().some((x) => x.su === "thu-hoi"));
});

test("tối đa 5 máy", (t) => {
  const dir = tmp(t), dkx = createDieuKhienXa({ home: () => dir });
  for (let i = 0; i < 5; i++) dkx.ghep(dkx.taoMa().ma, "M" + i);
  assert.throws(() => dkx.ghep(dkx.taoMa().ma, "M6"), { code: "TOO_MANY" });
});

async function server(t, { hasKey = true } = {}) {
  const dir = tmp(t), calls = [];
  const dkx = createDieuKhienXa({ home: () => dir });
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    handle(dkx, req, res, url, { local: req.headers["x-test-local"] === "1", hasKey, readJson: guard.readJson,
      call: async (m, p, b) => { calls.push([m, p, b]); return { status: 200, json: { ok: true, path: p } }; } });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const base = "http://127.0.0.1:" + srv.address().port;
  const go = async (p, { body, local = false, cookie = "", headers = {} } = {}) => {
    const r = await fetch(base + "/dkx" + p, { method: body === undefined ? "GET" : "POST", headers: { ...(local ? { "x-test-local": "1" } : {}), ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, cookie: r.headers.get("set-cookie"), json: await r.json() };
  };
  return { go, calls, dkx, dir };
}

test("HTTP: chưa có khóa xem thì từ xa không làm được gì, kể cả ghép", async (t) => {
  const { go } = await server(t, { hasKey: false });
  assert.equal((await go("/trang-thai")).json.code, "NEED_ACCESS_KEY");
  assert.equal((await go("/ghep", { body: { ma: "123456" } })).status, 403);
  assert.equal((await go("/trang-thai", { local: true })).status, 200, "trên chính máy vẫn dùng được");
});

test("HTTP: chỉ máy tính tạo mã/thu hồi; điện thoại ghép rồi mới gọi lệnh; lệnh ngoài danh sách bị chặn và ghi nhật ký", async (t) => {
  const { go, calls } = await server(t);
  assert.equal((await go("/ma", { body: {} })).json.code, "LOCAL_ONLY");
  assert.equal((await go("/thiet-bi")).json.code, "LOCAL_ONLY");
  assert.equal((await go("/api/autopilot")).json.code, "NOT_PAIRED");
  const { json: { ma } } = await go("/ma", { body: {}, local: true });
  const paired = await go("/ghep", { body: { ma, ten: "Điện thoại thử" }, headers: { "cf-visitor": '{"scheme":"https"}', "cf-connecting-ip": "9.9.9.9" } });
  assert.equal(paired.status, 200);
  assert.match(paired.cookie, /^vpd=[A-Za-z0-9_-]{40,}; Path=\/dkx; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
  const cookie = paired.cookie.split(";")[0];
  assert.equal((await go("/trang-thai", { cookie })).json.ghep, true);
  assert.equal((await go("/api/autopilot", { cookie })).json.path, "/autopilot");
  assert.equal((await go("/api/autopilot/auto-1/approve", { cookie, body: {} })).status, 200);
  const blocked = await go("/api/jobs", { cookie, body: { argv: ["cmd", "/c", "whoami"] } });
  assert.equal(blocked.json.code, "NOT_ALLOWED");
  assert.equal((await go("/api/fs/read?path=C:/x", { cookie })).json.code, "NOT_ALLOWED");
  assert.deepEqual(calls.map((c) => c[0] + " " + c[1]), ["GET /autopilot", "POST /autopilot/auto-1/approve"], "lệnh bị chặn không tới ctl");
  const log = (await go("/nhat-ky", { local: true })).json.nhatKy;
  assert.ok(log.some((x) => x.su === "lenh" && x.lenh === "POST /autopilot/auto-1/approve" && x.ten === "Điện thoại thử"));
  assert.ok(log.some((x) => x.su === "ghep" && x.ip === "9.9.9.9"), "IP thật của điện thoại qua Cloudflare");
  assert.ok(log.some((x) => x.su === "chan" && x.lenh === "POST /jobs"));
  // Thu hồi trên máy tính: điện thoại mất quyền ngay
  const id = (await go("/thiet-bi", { local: true })).json.thietBi[0].id;
  await go("/thu-hoi", { local: true, body: { id } });
  assert.equal((await go("/api/autopilot", { cookie })).json.code, "NOT_PAIRED");
});

test("HTTP: điện thoại tự huỷ ghép", async (t) => {
  const { go } = await server(t);
  const { json: { ma } } = await go("/ma", { body: {}, local: true });
  const cookie = (await go("/ghep", { body: { ma } })).cookie.split(";")[0];
  const out = await go("/thoat", { cookie, body: {} });
  assert.match(out.cookie, /Max-Age=0/);
  assert.equal((await go("/api/autopilot", { cookie })).json.code, "NOT_PAIRED");
  assert.equal((await go("/thiet-bi", { local: true })).json.thietBi.length, 0);
});

test("nhận diện chính máy: đường hầm Tailscale/Cloudflare nối từ 127.0.0.1 vẫn là từ xa", () => {
  const req = (addr, host, headers = {}) => ({ socket: { remoteAddress: addr }, headers: { host, ...headers } });
  assert.equal(guard.isLocal(req("127.0.0.1", "127.0.0.1:7789")), true);
  assert.equal(guard.isLocal(req("::1", "localhost:7789")), true);
  assert.equal(guard.isLocal(req("127.0.0.1", "may-quan.tail1234.ts.net")), false, "tailscale serve: Host là *.ts.net");
  assert.equal(guard.isLocal(req("127.0.0.1", "localhost:7789", { "tailscale-user-login": "quan@example.com" })), false);
  assert.equal(guard.isLocal(req("127.0.0.1", "localhost:7789", { "x-forwarded-for": "100.64.0.2" })), false);
  assert.equal(guard.isLocal(req("127.0.0.1", "abc.trycloudflare.com", { "cf-ray": "x" })), false);
  assert.equal(guard.isLocal(req("192.168.1.5", "192.168.1.10:7789")), false);
  assert.equal(require("../lib/ctlbridge").isLocal, guard.isLocal, "cầu nối ctl dùng chung một hàm");
});

test("iPhone: biểu tượng màn hình chính mở thẳng trang điều khiển", () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "dieu-khien.webmanifest"), "utf8"));
  assert.equal(m.start_url, "/dieu-khien.html");
  assert.notEqual(m.id, "/", "khác app văn phòng 3D để cài được cả hai");
  assert.match(fs.readFileSync(path.join(__dirname, "..", "public", "dieu-khien.html"), "utf8"), /apple-mobile-web-app-capable/);
});
