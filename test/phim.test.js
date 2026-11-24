"use strict";
// Hồ sơ phim (lib/phim.js, tools/phim.js) và loại dự án Phim trong "Dự án mới" (ctl/du-an-moi.js) — Xưởng phim P1.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const phim = require("../lib/phim");
const { createDuAnMoi, datKhungPhim } = require("../ctl/du-an-moi");

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-phim-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const GIONG = [
  { index: 1, startMs: 100, endMs: 3000, text: "Câu một." },
  { index: 2, startMs: 3150, endMs: 6000, text: "Câu hai." },
  { index: 3, startMs: 6150, endMs: 9037, text: "Câu ba." },
];
const mau = () => ({
  ten: "Chúc mừng 20/11", ti_le: ["9:16"], ngon_ngu: "vi", ngan_sach_usd: 10, may_quay_mac_dinh: "omni-flash",
  nguoi_that: [{ ma: "co-giao", dong_y: true, anh: "media/tham-chieu/co-giao.jpg" }],
  nhan_vat: [{ ma: "co-giao", tham_chieu: ["media/tham-chieu/co-giao-1.png"] }],
  canh: [
    { ma: "C01", cau: [1], loi_dan: "Câu một.", nhan_vat: ["co-giao"], giay: 3.15, trang_thai: "viet" },
    { ma: "C02", cau: [2, 3], loi_dan: "Câu hai. Câu ba.", nhan_vat: ["co-giao"], giay: 5.887, may_quay: "flow" },
  ],
});

test("hồ sơ dùng ảnh Gemini: không lỗi, ước tính chi phí tối đa (đủ số take) và lượt Flow", () => {
  const kq = phim.kiem({ ...mau(), may_anh: "gemini" }, { giong: GIONG });
  assert.deepEqual(kq.loi, []);
  assert.equal(kq.ok, true);
  // C01: 3,15 s × 2 take × $0.07 = 0,441; C02 Flow không tính tiền; ảnh: (3 + 3) khung + 3 ảnh nhân vật = 9 × $0.04
  assert.equal(kq.chiPhi.usdToiDa, 0.8);
  assert.equal(kq.chiPhi.luotFlow, 2);
  assert.equal(kq.chiPhi.soAnh, 9);
});

test("bắt 3 lỗi đắt nhất: lệch giọng đọc, người thật chưa đồng ý, vượt ngân sách", () => {
  const p = mau();
  p.canh[1].giay = 4;                          // tổng 7,15 s, giọng đọc 9,037 s
  p.nguoi_that[0].dong_y = false;
  p.ngan_sach_usd = 0.2;
  const ma = phim.kiem(p, { giong: GIONG }).loi.map((l) => l.ma);
  assert.ok(ma.includes("LECH_GIONG"), ma.join());
  assert.ok(ma.includes("NGUOI_THAT_CHUA_DONG_Y"), ma.join());
  assert.ok(ma.includes("VUOT_NGAN_SACH"), ma.join());
  // lệch trong 0,5 giây thì chấp nhận
  const q = mau(); q.canh[1].giay = 5.6;
  assert.ok(!phim.kiem(q, { giong: GIONG }).loi.some((l) => l.ma === "LECH_GIONG"));
});

test("cấu trúc: máy quay lạ, mã cảnh sai, nhân vật chưa khai, đường dẫn thoát khỏi repo đều bị bắt", () => {
  const p = mau();
  p.canh[0].may_quay = "sora";
  p.canh[1].ma = "canh-2";
  p.canh.push({ ma: "C03", nhan_vat: ["ai-do"], take: ["../../Windows/x.mp4"] });
  p.nhan_vat[0].tham_chieu = ["C:\\Users\\x.png"];
  const ma = phim.kiem(p).loi.map((l) => l.ma + ":" + l.chiTiet);
  assert.ok(ma.some((m) => /sora/.test(m)));
  assert.ok(ma.some((m) => /canh-2|C01, C02/.test(m)));
  assert.ok(ma.some((m) => /ai-do/.test(m)));
  assert.equal(ma.filter((m) => m.startsWith("DUONG_DAN")).length, 2);
  assert.equal(phim.kiem(null).ok, false);
  assert.equal(phim.duongDanHopLe("media/quay/C01-t1.mp4"), true);
});

test("chốt thời lượng theo giọng đọc: cảnh đầu từ 0, cảnh cuối tới hết giọng, tổng luôn khớp", () => {
  const p = mau();
  delete p.canh[0].giay; delete p.canh[1].giay;
  assert.ok(phim.kiem(p, { giong: GIONG }).canhBao.some((w) => w.ma === "CHUA_CHOT_THOI_LUONG"));
  const { phim: moi, doi } = phim.dongBoGiong(p, GIONG);
  assert.deepEqual(moi.canh.map((c) => c.giay), [3.15, 5.887]);
  assert.equal(doi.length, 2);
  assert.equal(phim.kiem(moi, { giong: GIONG }).ok, true);
  const sai = mau(); sai.canh[1].cau = [9];
  assert.throws(() => phim.dongBoGiong(sai, GIONG), /câu 9/);
  const nguoc = mau(); nguoc.canh[0].cau = [2]; nguoc.canh[1].cau = [1];
  assert.throws(() => phim.dongBoGiong(nguoc, GIONG), /đi sau/);
});

test("công cụ dòng lệnh: kiem thoát 1 khi có lỗi; dong-bo ghi giay vào phim.json", (t) => {
  const d = tmp(t), tool = path.join(__dirname, "..", "tools", "phim.js");
  const p = mau(); delete p.canh[0].giay; delete p.canh[1].giay;
  fs.writeFileSync(path.join(d, "phim.json"), "\uFEFF" + JSON.stringify(p));
  fs.mkdirSync(path.join(d, "media", "giong"), { recursive: true });
  fs.writeFileSync(path.join(d, "media", "giong", "voice.json"), JSON.stringify(GIONG));
  let r = spawnSync(process.execPath, [tool, "dong-bo", d], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, "phim.json"), "utf8")).canh.map((c) => c.giay), [3.15, 5.887]);
  r = spawnSync(process.execPath, [tool, "kiem", d], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /hợp lệ/);
  const q = JSON.parse(fs.readFileSync(path.join(d, "phim.json"), "utf8")); q.ngan_sach_usd = 0;
  fs.writeFileSync(path.join(d, "phim.json"), JSON.stringify(q));
  r = spawnSync(process.execPath, [tool, "kiem", d, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).loi[0].ma, "VUOT_NGAN_SACH");
});

test("khuôn hồ sơ phim: đặt phim.json/kịch bản/PHIM.md, không ghi đè file có sẵn, .gitignore có media/", (t) => {
  const d = tmp(t);
  fs.writeFileSync(path.join(d, "kich-ban.md"), "của anh");
  fs.writeFileSync(path.join(d, ".gitignore"), "node_modules/");
  const r = datKhungPhim(d, "chuc-mung-20-11");
  assert.deepEqual(r.da, ["phim.json", "PHIM.md", ".gitignore (thêm media/)"]);
  assert.equal(fs.readFileSync(path.join(d, "kich-ban.md"), "utf8"), "của anh");
  assert.equal(fs.readFileSync(path.join(d, ".gitignore"), "utf8"), "node_modules/\nmedia/\n");
  const p = JSON.parse(fs.readFileSync(path.join(d, "phim.json"), "utf8"));
  assert.equal(p.ten, "chuc-mung-20-11");
  assert.equal(phim.kiem(p).ok, true, "khuôn rỗng vẫn hợp lệ");
  assert.deepEqual(datKhungPhim(d, "x").da, [], "chạy lại không đổi gì");
});

test("Dự án mới loại Phim: có bước khuôn phim, việc giao Hinata là viết kịch bản; phần mềm không có bước này", async (t) => {
  const d = tmp(t), goi = [];
  const github = { login: async () => "oanh", exists: async () => false, createRepo: async ({ name }) => ({ fullName: "oanh/" + name, url: "u" }),
    open: () => ({ id: "op1", status: "running" }), get: () => ({ id: "op1", status: "done", workspace: d }) };
  const ideas = { add: (x) => { goi.push(x); return { id: "i1" }; }, start: (id, { prepare }) => { prepare?.(null); return { runId: "auto-1" }; } };
  const dam = createDuAnMoi({ github, ideas, boKiem: { install: () => ({}) }, cho: async () => {} });
  assert.throws(() => dam.tao({ ten: "phim-thu", yTuong: "Phim chúc mừng thầy cô 20/11", loai: "game" }), { code: "BAD_REQUEST" });
  const op = dam.tao({ ten: "phim-thu", yTuong: "Phim chúc mừng thầy cô 20/11", loai: "phim" });
  for (let i = 0; i < 50 && dam.get(op.id).trangThai === "dang"; i++) await new Promise((r) => setImmediate(r));
  const r = dam.get(op.id);
  assert.equal(r.trangThai, "xong", JSON.stringify(r.buoc));
  assert.equal(r.buoc.find((b) => b.id === "khung-phim").trangThai, "xong");
  assert.ok(fs.existsSync(path.join(d, "phim.json")) && fs.existsSync(path.join(d, "media", "giong")));
  assert.match(goi[0].title, /^🎬 phim-thu/);
  assert.match(goi[0].detail, /DỰ ÁN PHIM[\s\S]*PHIM\.md[\s\S]*Phim chúc mừng/);
  const op2 = createDuAnMoi({ github, ideas, boKiem: { install: () => ({}) }, cho: async () => {} }).tao({ ten: "app-thu", yTuong: "Ứng dụng ghi chú cho sinh viên" });
  assert.ok(!op2.buoc.some((b) => b.id === "khung-phim"));
});
