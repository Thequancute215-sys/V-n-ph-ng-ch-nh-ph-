"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const helper = require("../ctl/phim-helper");
const tep = require("../ctl/phim-tai-lieu");

function phim(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-helper-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify({ ten: "Phim thử", ti_le: ["1:1"],
    ngon_ngu: "vi", ngan_sach_usd: 0, nhan_vat: [], canh: [] }));
  return root;
}

function png(root, name) {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA6sAAAAASUVORK5CYII=";
  return tep.save(root, { name, base64 });
}

test("AI Helper giữ góc đã khóa, phối ảnh được duyệt và tự chặn thiếu quyền dùng hình", (t) => {
  const root = phim(t);
  assert.throws(() => helper.taoNhanVat(root, { ma: "nguoi", ten: "Người", nguoiThat: true }), { code: "BAD_REQUEST" });
  helper.taoNhanVat(root, { ma: "nguoi", ten: "Người", nguoiThat: true, dongY: true, phongCach: "3D cách điệu" });
  const a = png(root, "goc-a.png"), b = png(root, "goc-b.png");
  helper.chonNguon(root, { ma: "nguoi", ids: [a.id] });
  assert.match(helper.yeuCau(root, { ma: "nguoi", slot: "chinh-dien" }).prompt, /Phong cách: 3D cách điệu/);
  helper.goc(root, { ma: "nguoi", id: a.id, slot: "chinh-dien" });
  helper.khoa(root, { ma: "nguoi", slot: "chinh-dien", duyet: true });
  assert.throws(() => helper.goc(root, { ma: "nguoi", id: b.id, slot: "chinh-dien" }), { code: "CONFLICT" });
  assert.throws(() => helper.yeuCau(root, { ma:"nguoi", slot: "chinh-dien" }, { tao: true }), { code: "CONFLICT" });
  helper.goc(root, { ma: "nguoi", id: b.id, slot: "nghieng" });
  assert.throws(() => helper.apDung(root, { ma: "nguoi", ids: [b.id] }), { code: "CHANGED" });
  assert.deepEqual(helper.apDung(root, { ma: "nguoi", ids: [a.id] }).tham_chieu, [a.path]);
  assert.throws(() => helper.apDung(root, { ma: "nguoi", ids: [a.id] }), { code: "CONFLICT" });
  tep.suaHoSo(root, (p) => { p.nguoi_that[0].dong_y = false; });
  assert.throws(() => helper.yeuCau(root, { ma: "nguoi", slot: "nghieng" }), { code: "CHUA_DU_DIEU_KIEN" });
});

test("chỉnh phân cảnh, thêm khung và thời lượng animatic không đổi thời lượng dựng", async (t) => {
  const root = phim(t);
  const a = helper.suaCanh(root, { tacVu: "them" }), b = helper.suaCanh(root, { tacVu: "them" });
  helper.suaCanh(root, { ma: b.ma, tacVu: "len" });
  assert.deepEqual(tep.hoSo(root).phim.canh.map(c => c.ma), [b.ma, a.ma]);
  assert.deepEqual(tep.hoSo(root).phim.canh.map(c => c.cau), [[1], [2]]);
  helper.suaCanh(root, { ma: a.ma, tacVu: "luu", loiDan: "Robot Mầm.", khungHinh: "Robot xoay", gocMay: "Chính diện", giay: 4, nhanVat: [] });
  await helper.giongThu(root, { canh: a.ma, giay: 6 });
  const img = png(root, "boi-canh.png");
  helper.khung(root, { canh: a.ma, id: img.id, lamNen: true });
  const scene = helper.khung(root, { canh: a.ma, id: img.id });
  assert.deepEqual([scene.giay, scene.helper_giay, scene.helper_boi_canh, scene.khung], [4, 6, img.path, [img.path]]);
  assert.throws(() => helper.suaCanh(root, { ma: a.ma, tacVu: "xoa" }), { code: "CONFLICT" });
  tep.suaHoSo(root, (p) => { p.cong = { 1: { luc: "2026-11-25" }, 2: { luc: "2026-11-25" } }; });
  assert.throws(() => helper.suaCanh(root, { ma: a.ma, tacVu: "luu" }), { code: "CHUA_DU_DIEU_KIEN" });
  assert.throws(() => helper.tongMau(root, { moTa: "Xanh" }), { code: "CHUA_DU_DIEU_KIEN" });
});

test("giọng sau đổi thứ tự phải tương ứng với lời dẫn mới", (t) => {
  const { giongKhopCanh, dongBoGiong } = require("../lib/phim");
  const root = phim(t);
  for (const words of ["Cảnh đầu. Có hai câu.", "Cảnh hai."]) {
    const { ma } = helper.suaCanh(root, { tacVu: "them" });
    helper.suaCanh(root, { ma, tacVu: "luu", loiDan: words, khungHinh: "", gocMay: "", giay: 4, nhanVat: [] });
  }
  const before = tep.hoSo(root).phim;
  const voices = before.canh.map((c, i) => ({ index: i + 1, text: c.loi_dan, startMs: i * 1600, endMs: (i + 1) * 1600 }));
  assert.equal(giongKhopCanh(before, voices), true);
  helper.suaCanh(root, { ma: before.canh[1].ma, tacVu: "len" });
  const after = tep.hoSo(root).phim;
  assert.equal(giongKhopCanh(after, voices), false);
  assert.throws(() => dongBoGiong(after, voices), /Tạo lại giọng/);
  const synced = dongBoGiong(after, voices.map((v, i) => ({ ...v, text: after.canh[i].loi_dan }))).phim;
  assert.deepEqual(synced.canh.map((c) => [c.ma, c.cau, c.giay]), [["C02", [1], 1.6], ["C01", [2], 1.6]]);
});
