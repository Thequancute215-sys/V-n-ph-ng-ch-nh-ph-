"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLichChay } = require("../ctl/lich-chay");
const { createCtl } = require("../ctl/main");
const { open } = require("../ctl/db");

const phut = 60000;
const moc = new Date(2026, 10, 23, 10).getTime(); // Thứ Hai theo giờ máy
const dai = (remainingPercent, id = "codex") => ({
  providers: [{ id, status: "ready", buckets: [{ group: "Gemini", remainingPercent }] }],
});
const coBan = {
  ten: "Rà việc", moTa: "Kiểm tra tiến độ", workspace: "du-an", loai: "luong",
  nhip: { kieu: "moi-phut", phut: 30 },
};

function dungLich(t, options = {}) {
  const dir = options.dir || fs.mkdtempSync(path.join(os.tmpdir(), "vp-lich-chay-"));
  if (!options.dir) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let luc = moc, tick, daDung = false;
  const goi = [], kiemToan = [];
  const autopilot = options.autopilot || { start: (...args) => { goi.push(args); return { id: "auto-1" }; } };
  const lich = createLichChay({
    dir, now: () => luc, autopilot, chat: options.chat, workspaceBusy: options.workspaceBusy,
    ws: options.ws, quota: options.quota || (() => dai(75)),
    audit: { log: (...args) => kiemToan.push(args) },
    setTimer: (fn, ms) => { assert.equal(ms, phut); tick = fn; return () => { daDung = true; }; },
    ...options.overrides,
  });
  t.after(lich.dung);
  return { dir, lich, goi, kiemToan, tick: () => tick(), toi: (t) => { luc = t; }, daDung: () => daDung };
}

test("Tính lần tới mỗi phút, qua nửa đêm và qua tuần theo giờ máy", (t) => {
  const { lich } = dungLich(t);
  assert.equal(lich.tinhLanToi(coBan, moc), new Date(moc + 30 * phut).toISOString());
  const ngay = { nhip: { kieu: "hang-ngay", gio: "00:15" } };
  assert.equal(lich.tinhLanToi(ngay, new Date(2026, 10, 23, 23, 59)), new Date(2026, 10, 24, 0, 15).toISOString());
  const tuan = { nhip: { kieu: "hang-tuan", thu: 1, gio: "08:00" } };
  assert.equal(lich.tinhLanToi(tuan, new Date(2026, 10, 29, 23, 59)), new Date(2026, 10, 30, 8).toISOString());
  assert.equal(lich.tinhLanToi(tuan, new Date(2026, 10, 30, 8)), new Date(2026, 11, 7, 8).toISOString());
});

test("Từ chối lịch thiếu nhiệm vụ, nhịp dưới 30 phút và workspace chưa đăng ký", (t) => {
  const ws = { find(p) {
    if (p !== "du-an") throw Object.assign(new Error("Chưa đăng ký"), { code: "WORKSPACE_DENIED" });
    return { path: "du-an-thuc" };
  } };
  const { lich } = dungLich(t, { ws });
  assert.throws(() => lich.luu({ ...coBan, moTa: "  " }), { code: "BAD_REQUEST" });
  assert.throws(() => lich.luu({ ...coBan, nhip: { kieu: "moi-phut", phut: 29 } }), { code: "BAD_REQUEST" });
  assert.throws(() => lich.luu({ ...coBan, workspace: "ngoai" }), { code: "WORKSPACE_DENIED" });
  const x = lich.luu(coBan);
  assert.match(x.id, /^lich-[0-9a-f]{8}$/);
  assert.equal(x.workspace, "du-an-thuc");
  assert.equal(x.bat, false);
  assert.equal(x.lanToi, null);
});

test("Đến giờ giao đúng một lần và lưu lần tới trước khi giao", async (t) => {
  const { lich, goi, toi, tick, dir, kiemToan } = dungLich(t);
  const { id } = lich.luu(coBan);
  await tick();
  lich.batTat(id, true);
  toi(moc + 30 * phut);
  await Promise.all([tick(), tick()]);
  assert.deepEqual(goi, [[{ workspace: "du-an", task: coBan.moTa }, "lich-chay"]]);
  const ds = JSON.parse(fs.readFileSync(path.join(dir, "lich-chay.json"), "utf8"));
  assert.equal(ds[0].lanToi, new Date(moc + 60 * phut).toISOString());
  assert.equal(ds[0].lichSu[0].ma, "auto-1");
  assert.ok(kiemToan.some(([actor, action]) => actor === "lich-chay" && action === "lich_chay.chay"));
});

test("Bỏ qua khi lần trước chưa xong, workspace bận hoặc hạn mức dưới 15%", async (t) => {
  let xong, ban = false, quota = 75;
  const autopilot = { start: () => new Promise((resolve) => { xong = resolve; }) };
  const { lich } = dungLich(t, { autopilot, workspaceBusy: () => ban, quota: () => dai(quota) });
  const { id } = lich.luu(coBan);
  const truoc = lich.chayNgay(id, "ceo");
  const dangChay = await lich.chayNgay(id);
  assert.equal(dangChay.kq, "bo-qua");
  assert.match(dangChay.ghiChu, /lần trước/i);
  xong({ id: "auto-1" });
  await truoc;
  ban = true;
  const banViec = await lich.chayNgay(id);
  assert.equal(banViec.kq, "bo-qua");
  assert.match(banViec.ghiChu, /Workspace/i);
  ban = false;
  quota = 14;
  const canHanMuc = await lich.chayNgay(id);
  assert.equal(canHanMuc.kq, "bo-qua");
  assert.match(canHanMuc.ghiChu, /14%/);
});

test("Hỏi qua chat chỉ đọc và giữ dấu lần trước đến khi AI trả lời", async (t) => {
  const goi = [], messages = [{ id: "phan-hoi", from: "ai", status: "cho", jobId: "j-1" }];
  const chat = { send: (...args) => { goi.push(args); return { messages }; }, get: () => ({ messages }) };
  const { lich } = dungLich(t, { chat, quota: () => { throw new Error("lỗi đọc"); } });
  const { id } = lich.luu({ ...coBan, loai: "hoi", vai: "AGY" });
  const ketQua = await lich.chayNgay(id);
  assert.equal(ketQua.kq, "ok");
  assert.equal(ketQua.ma, "j-1");
  assert.match(ketQua.ghiChu, /không đọc được hạn mức/);
  assert.deepEqual(goi, [[{ workspace: "du-an", who: "hinata", text: coBan.moTa }, "lich-chay"]]);
  assert.equal((await lich.chayNgay(id)).kq, "bo-qua");
  messages[0].status = "xong";
  assert.equal((await lich.chayNgay(id)).kq, "ok");
});

test("Lỗi giao việc được che khóa và lịch sử chỉ giữ 20 kết quả mới nhất", async (t) => {
  const autopilot = { start: () => { throw new Error("token=abc123secret"); } };
  const { lich, toi } = dungLich(t, { autopilot });
  const { id } = lich.luu(coBan);
  for (let i = 0; i < 23; i++) {
    toi(moc + i * phut);
    const x = await lich.chayNgay(id);
    assert.equal(x.kq, "loi");
    assert.doesNotMatch(x.ghiChu, /abc123secret/);
  }
  const su = lich.list()[0].lichSu;
  assert.equal(su.length, 20);
  assert.equal(su[0].luc, new Date(moc + 22 * phut).toISOString());
  assert.equal(su[19].luc, new Date(moc + 3 * phut).toISOString());
});

test("Luồng đã có mã nhưng lỗi ở lượt đầu ghi lỗi cùng mã luồng", async (t) => {
  const autopilot = { start: () => ({ id: "auto-loi", status: "attention", problem: "Không khởi động được CLI." }) };
  const { lich } = dungLich(t, { autopilot, quota: () => null });
  const { id } = lich.luu(coBan);
  const x = await lich.chayNgay(id);
  assert.equal(x.kq, "loi");
  assert.equal(x.ma, "auto-loi");
  assert.match(x.ghiChu, /Không khởi động được CLI/);
  assert.match(x.ghiChu, /không đọc được hạn mức/);
});

test("Khởi động lại và đánh thức sau giờ không chạy bù; dung hủy hẹn giờ", async (t) => {
  const a = dungLich(t);
  a.lich.batTat(a.lich.luu(coBan).id, true);
  a.lich.dung();
  const sau = moc + 95 * phut;
  const b = dungLich(t, { dir: a.dir, overrides: { now: () => sau } });
  await b.tick();
  assert.equal(b.goi.length, 0);
  assert.equal(b.lich.list()[0].lanToi, new Date(sau + 30 * phut).toISOString());
  b.lich.dung();
  assert.equal(b.daDung(), true);

  const c = dungLich(t);
  c.lich.batTat(c.lich.luu(coBan).id, true);
  c.toi(sau);
  await c.tick();
  assert.equal(c.goi.length, 0);
  assert.equal(c.lich.list()[0].lanToi, new Date(sau + 30 * phut).toISOString());
});

test("HTTP Lịch chạy kiểm workspace đăng ký và gọi cùng bộ giao việc", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-lich-http-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const workspace = fs.mkdtempSync(path.join(dir, "du-an-"));
  const data = path.join(dir, "ctl");
  const ctl = createCtl({ dir: data });
  try {
    await new Promise((resolve, reject) => ctl.server.listen(0, "127.0.0.1", resolve).once("error", reject));
    const base = "http://127.0.0.1:" + ctl.server.address().port;
    const headers = { authorization: "Bearer " + ctl.token, "content-type": "application/json" };
    const post = (p, body = {}) => fetch(base + p, { method: "POST", headers, body: JSON.stringify(body) });
    const chuaDangKy = await post("/lich-chay", { ...coBan, workspace });
    assert.equal(chuaDangKy.status, 403);
    // Nạp một dòng đăng ký như test tiến độ để ca này độc lập với junction trong hồ sơ Windows.
    const db = open(data);
    try { db.prepare("INSERT INTO workspaces(path,name,added_at) VALUES(?,?,?)").run(fs.realpathSync(workspace), "Dự án thử", Date.now()); }
    finally { db.close(); }
    const goi = [];
    ctl.autopilot.start = (...args) => { goi.push(args); return { id: "auto-http" }; };
    const res = await post("/lich-chay", { ...coBan, workspace });
    assert.equal(res.status, 200);
    const { lich } = await res.json();
    assert.equal(lich.bat, false);
    const p = "/lich-chay/" + lich.id;
    assert.equal((await (await post(p + "/bat", { bat: true })).json()).lich.bat, true);
    assert.equal((await (await post(p + "/chay-ngay")).json()).ketQua.ma, "auto-http");
    assert.deepEqual(goi, [[{ workspace: lich.workspace, task: lich.moTa }, "lich-chay"]]);
    const list = await (await fetch(base + "/lich-chay", { headers })).json();
    assert.equal(list.lichChay[0].lichSu[0].ma, "auto-http");
    assert.equal((await post(p + "/xoa")).status, 200);
    assert.deepEqual((await (await fetch(base + "/lich-chay", { headers })).json()).lichChay, []);
  } finally { await ctl.close(); }
});
