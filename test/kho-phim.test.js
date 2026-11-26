// Kho phim (CEO yêu cầu 26/11/2026): <kho>\<loại>\<tên phim>, git cục bộ, tự đăng ký workspace; phim cũ ngoài kho chỉ gắn loại;
// phim qua Cổng 4 vào Đã xuất và dọn nháp được (giữ bản xuất, take/khung chọn, giọng, media/raw).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { thuMucTu, LOAI } = require("../ctl/kho-phim");

const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-kho-phim-"));
const kho = path.join(d, "XuongPhim");
let ctl;
test.before(() => { ctl = createCtl({ dir: path.join(d, "data"), khoPhimDir: kho }); });
test.after(async () => { await ctl.close(); fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const docPhim = (root) => JSON.parse(fs.readFileSync(path.join(root, "phim.json"), "utf8"));
const ghi = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

test("bốn loại phim; tên thư mục bỏ dấu, tránh tên thiết bị Windows", () => {
  assert.deepEqual(LOAI.map((l) => l.id), ["tai-lieu-kien-thuc", "giai-tri-ai", "quang-cao", "mxh-ngan"]);
  assert.equal(thuMucTu("Tín hiệu trở về"), "tin-hieu-tro-ve");
  assert.equal(thuMucTu("  Đêm   Hà Nội!! "), "dem-ha-noi");
  for (const t of ["CON", "nul", "Com1", "LPT9"]) assert.equal(thuMucTu(t), t.toLowerCase() + "-phim");
  assert.equal(thuMucTu("../..\\x"), "x");
});

test("tạo phim: <kho>/<loại>/<tên>, khuôn hồ sơ có tên và loại, git cục bộ không remote, đã đăng ký", () => {
  const p = ctl.khoPhim.tao({ ten: "Tín hiệu trở về", loai: "giai-tri-ai", yTuong: "Robot nhỏ tìm đường về nhà." });
  assert.equal(p.path, fs.realpathSync(path.join(kho, "giai-tri-ai", "tin-hieu-tro-ve")));
  assert.deepEqual([p.ten, p.loai, p.trongKho, p.soCanh, p.cong, p.choCong, p.daXuat], ["Tín hiệu trở về", "giai-tri-ai", true, 0, 0, 1, false]);
  for (const f of ["phim.json", "kich-ban.md", "PHIM.md", ".gitignore", "y-tuong.md"]) assert.ok(fs.existsSync(path.join(p.path, f)), f);
  const h = docPhim(p.path);
  assert.equal(h.ten, "Tín hiệu trở về"); assert.equal(h.loai, "giai-tri-ai");
  const g = (...a) => execFileSync("git", a, { cwd: p.path, encoding: "utf8" }).trim();
  assert.equal(g("remote"), "", "không có remote: phim không đẩy lên GitHub");
  assert.match(g("log", "--oneline"), /tạo phim Tín hiệu trở về/);
  assert.equal(g("status", "--porcelain", "--", "phim.json"), "", "phim.json đã commit kèm loại");
  assert.ok(ctl.ws.list().some((w) => w.path === p.path));
});

test("trùng tên (mọi loại, không phân biệt hoa thường) hoặc trùng thư mục: CONFLICT, không ghi đè", () => {
  assert.throws(() => ctl.khoPhim.tao({ ten: "tín hiệu TRỞ VỀ", loai: "quang-cao" }), (e) => e.code === "CONFLICT");
  assert.throws(() => ctl.khoPhim.tao({ ten: "Tin hieu tro ve", loai: "giai-tri-ai" }), (e) => e.code === "CONFLICT");
  assert.equal(docPhim(path.join(kho, "giai-tri-ai", "tin-hieu-tro-ve")).ten, "Tín hiệu trở về");
});

test("thiếu tên, tên quá dài, chỉ ký hiệu, loại lạ: BAD_REQUEST", () => {
  for (const ten of ["", "   ", "x".repeat(81), "!!!"]) assert.throws(() => ctl.khoPhim.tao({ ten, loai: "mxh-ngan" }), (e) => e.code === "BAD_REQUEST", JSON.stringify(ten));
  for (const loai of [undefined, "", "..", "chua-phan-loai", "phim"]) assert.throws(() => ctl.khoPhim.tao({ ten: "Phim lạ", loai }), (e) => e.code === "BAD_REQUEST", String(loai));
  assert.ok(!fs.existsSync(path.join(kho, "phim-la")));
});

test("thư mục chép tay vào kho được nhận; phim cũ ngoài kho hiện 'chưa phân loại', gắn loại không di chuyển file", () => {
  const tay = path.join(kho, "tai-lieu-kien-thuc", "phim-chep-tay");
  ghi(path.join(tay, "phim.json"), JSON.stringify({ ten: "Phim chép tay", canh: [] }));
  const ngoai = path.join(d, "Projects", "phim-cu");
  ghi(path.join(ngoai, "phim.json"), JSON.stringify({ ten: "", canh: [] }));
  ctl.ws.add(ngoai);
  const tim = (ten) => ctl.khoPhim.list().find((x) => x.ten === ten);
  assert.deepEqual([tim("Phim chép tay").loai, tim("Phim chép tay").trongKho], ["tai-lieu-kien-thuc", true]);
  assert.deepEqual([tim("phim-cu").loai, tim("phim-cu").trongKho], ["chua-phan-loai", false]);
  const r = ctl.khoPhim.datLoai(ngoai, "quang-cao");
  assert.equal(r.loai, "quang-cao");
  assert.equal(docPhim(ngoai).loai, "quang-cao");
  assert.ok(fs.existsSync(path.join(ngoai, "phim.json")), "không di chuyển");
  assert.throws(() => ctl.khoPhim.datLoai(tay, "giai-tri-ai"), (e) => e.code === "CONFLICT", "phim trong kho có loại theo thư mục");
  assert.throws(() => ctl.khoPhim.datLoai(ngoai, "khac"), (e) => e.code === "BAD_REQUEST");
});

test("tiến độ và Đã xuất: đếm cổng liên tiếp, ảnh bìa là khung chọn có thật", () => {
  const root = path.join(kho, "giai-tri-ai", "tin-hieu-tro-ve");
  ghi(path.join(root, "media", "khung", "C01.png"), "png");
  const h = docPhim(root);
  h.canh = [{ ma: "C01", khung_chon: "media/khung/C01.png" }, { ma: "C02" }];
  h.cong = { 1: { luc: "2026-11-26T01:00:00Z" }, 3: { luc: "2026-11-26T02:00:00Z" } };
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));
  let p = ctl.khoPhim.list().find((x) => x.path === fs.realpathSync(root));
  assert.deepEqual([p.soCanh, p.cong, p.choCong, p.daXuat, p.anhBia], [2, 1, 2, false, "media/khung/C01.png"], "cổng 3 không tính khi cổng 2 chưa duyệt");
  assert.throws(() => ctl.khoPhim.nhap(root), (e) => e.code === "CHUA_DU_DIEU_KIEN");
  h.cong = { 1: { luc: "x" }, 2: { luc: "x" }, 3: { luc: "x" }, 4: { luc: "x" } };
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));
  p = ctl.khoPhim.list().find((x) => x.path === fs.realpathSync(root));
  assert.deepEqual([p.cong, p.choCong, p.daXuat], [4, null, true]);
});

test("dọn nháp: chỉ xoá take/khung không chọn và gói CapCut; cập nhật phim.json; danh sách đổi thì CHANGED; đang bận thì DANG_DUNG", () => {
  const root = path.join(kho, "giai-tri-ai", "tin-hieu-tro-ve");
  const h = docPhim(root);
  h.canh = [{ ma: "C01", take: ["media/quay/C01-a.mp4", "media/quay/C01-b.mp4"], take_chon: "media/quay/C01-b.mp4", khung: ["media/khung/C01.png", "media/khung/C01-2.png"], khung_chon: "media/khung/C01.png" }];
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));
  const giu = ["media/quay/C01-b.mp4", "media/khung/C01.png", "media/xuat/9x16.mp4", "media/raw/goc.mp4", "media/giong/voice.mp3", "kich-ban.md"];
  const bo = ["media/quay/C01-a.mp4", "media/khung/C01-2.png", "media/capcut-ab12/C01.mp4", "media/capcut-ab12/voice.srt"];
  for (const f of [...giu, ...bo]) if (f !== "kich-ban.md") ghi(path.join(root, f), "0123456789");
  const n = ctl.khoPhim.nhap(root);
  assert.deepEqual(n.tep.map((t) => t.path), [...bo].sort());
  assert.equal(n.tong, 40);
  assert.throws(() => ctl.khoPhim.donNhap(root, "sai"), (e) => e.code === "CHANGED");
  assert.throws(() => ctl.khoPhim.donNhap(root, n.ma, { ban: () => true }), (e) => e.code === "DANG_DUNG");
  for (const f of bo) assert.ok(fs.existsSync(path.join(root, f)), "chưa xoá khi bị từ chối: " + f);
  const r = ctl.khoPhim.donNhap(root, n.ma);
  assert.deepEqual([r.soTep, r.byte, r.conLai], [4, 40, 0]);
  for (const f of bo) assert.ok(!fs.existsSync(path.join(root, f)), "đã xoá " + f);
  for (const f of giu) assert.ok(fs.existsSync(path.join(root, f)), "giữ " + f);
  assert.ok(!fs.existsSync(path.join(root, "media", "capcut-ab12")), "thư mục gói CapCut rỗng được gỡ");
  const sau = docPhim(root).canh[0];
  assert.deepEqual([sau.take, sau.take_chon, sau.khung, sau.khung_chon], [["media/quay/C01-b.mp4"], "media/quay/C01-b.mp4", ["media/khung/C01.png"], "media/khung/C01.png"]);
});

test("dọn nháp giữ mọi file đang dùng: take duy nhất không ghi take_chon, ban_dung.take, đường dẫn './' và '\\\\', tham chiếu nhân vật", () => {
  const root = path.join(kho, "giai-tri-ai", "tin-hieu-tro-ve");
  const h = docPhim(root);
  h.canh = [
    { ma: "C01", take: ["media/quay/mot.mp4"] },                                                              // một take: bàn dựng dùng luôn
    { ma: "C02", take: ["media/quay/C02-a.mp4", "media/quay/C02-b.mp4"], take_chon: "./media/quay/C02-b.mp4", khung: ["media/khung/C02.png", "media/khung/C02-x.png"], khung_chon: "media\\khung\\C02.png" },
  ];
  h.nhan_vat = [{ ma: "rb", tham_chieu: "media/khung/robot-ref.png" }];
  fs.rmSync(path.join(root, "media"), { recursive: true, force: true });   // bỏ file của ca trước
  h.ban_dung = { take: { C01: "media/quay/mot.mp4", C02: "./media/quay/C02-b.mp4" } };
  delete h.ban_dung;   // không có bản dựng: không bị coi là cũ
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));
  const giu = ["media/quay/mot.mp4", "media/quay/C02-b.mp4", "media/khung/C02.png", "media/khung/robot-ref.png"];
  const bo = ["media/quay/C02-a.mp4", "media/khung/C02-x.png"];
  for (const f of [...giu, ...bo]) ghi(path.join(root, f), "x");
  assert.deepEqual(ctl.khoPhim.nhap(root).tep.map((t) => t.path), [...bo].sort());
  // ban_dung.take nhắc tới một file không còn trong take[] thì vẫn giữ.
  ghi(path.join(root, "media/quay/C02-cu.mp4"), "x");
  h.canh[1].take.push("media/quay/C02-cu.mp4");
  h.ban_dung = { take: { C01: "media/quay/mot.mp4", C02: "./media/quay/C02-b.mp4" } };
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));
  h.ban_dung.bia = "media/quay/C02-cu.mp4"; fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));
  assert.ok(!ctl.khoPhim.nhap(root).tep.some((t) => t.path === "media/quay/C02-cu.mp4"), "đường dẫn trong ban_dung được giữ");
  const r = ctl.khoPhim.donNhap(root, ctl.khoPhim.nhap(root).ma);
  assert.equal(r.soTep, 2);
  for (const f of giu) assert.ok(fs.existsSync(path.join(root, f)), "giữ " + f);
  assert.deepEqual(docPhim(root).canh[1].take, ["media/quay/C02-b.mp4", "media/quay/C02-cu.mp4"]);
});

test("dọn nháp: bản dựng cũ thì từ chối; media là junction ra ngoài thì không liệt kê, không xoá; phim chưa có media không lỗi", () => {
  const root = path.join(kho, "giai-tri-ai", "tin-hieu-tro-ve");
  const h = docPhim(root);
  h.ban_dung = { take: { C01: "media/quay/khac.mp4", C02: "media/quay/C02-b.mp4" } };
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));
  assert.throws(() => ctl.khoPhim.nhap(root), (e) => e.code === "CHUA_DU_DIEU_KIEN" && /dựng lại/.test(e.message));
  delete h.ban_dung; fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(h));

  const ngoai = path.join(d, "ngoai-kho"); ghi(path.join(ngoai, "quay", "quan-trong.mp4"), "khong duoc xoa");
  const p = ctl.khoPhim.tao({ ten: "Phim junction", loai: "quang-cao" });
  const hp = docPhim(p.path); hp.cong = { 1: { luc: "x" }, 2: { luc: "x" }, 3: { luc: "x" }, 4: { luc: "x" } };
  fs.writeFileSync(path.join(p.path, "phim.json"), JSON.stringify(hp));
  fs.rmSync(path.join(p.path, "media"), { recursive: true, force: true });
  assert.deepEqual(ctl.khoPhim.nhap(p.path).tep, [], "chưa có media");
  assert.equal(ctl.khoPhim.donNhap(p.path, ctl.khoPhim.nhap(p.path).ma).soTep, 0);
  fs.symlinkSync(ngoai, path.join(p.path, "media"), "junction");
  assert.deepEqual(ctl.khoPhim.nhap(p.path).tep, []);
  ctl.khoPhim.donNhap(p.path, ctl.khoPhim.nhap(p.path).ma);
  assert.ok(fs.existsSync(path.join(ngoai, "quay", "quan-trong.mp4")), "file ngoài phim còn nguyên");
  fs.rmSync(path.join(p.path, "media"));   // gỡ junction (không xoá đích)

  // quay/ bên trong là junction ra ngoài: bỏ qua.
  fs.mkdirSync(path.join(p.path, "media"));
  fs.symlinkSync(path.join(ngoai, "quay"), path.join(p.path, "media", "quay"), "junction");
  assert.deepEqual(ctl.khoPhim.nhap(p.path).tep, []);
  fs.rmSync(path.join(p.path, "media", "quay"));
});

test("route: POST /phim/kho 201/409/400, GET /phim/du-an có kho và loại, /phim/kho/loai, /phim/don-nhap", async () => {
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  const port = ctl.server.address().port;
  const goi = (method, p, body) => new Promise((ok, bad) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { host: "127.0.0.1:" + port, authorization: "Bearer " + ctl.token, "content-type": "application/json" } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok({ status: res.statusCode, body: JSON.parse(b || "{}") }));
    });
    req.on("error", bad); if (body) req.write(JSON.stringify(body)); req.end();
  });
  const r = await goi("POST", "/phim/kho", { ten: "Đêm Hà Nội", loai: "mxh-ngan" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.phim.thuMuc, r.body.phim.loai], ["dem-ha-noi", "mxh-ngan"]);
  assert.equal((await goi("POST", "/phim/kho", { ten: "Đêm Hà Nội", loai: "mxh-ngan" })).status, 409);
  assert.equal((await goi("POST", "/phim/kho", { ten: "Không loại" })).status, 400);
  const ds = await goi("GET", "/phim/du-an");
  assert.equal(ds.body.kho, kho);
  assert.equal(ds.body.loai.length, 4);
  assert.ok(ds.body.duAn.some((x) => x.ten === "Đêm Hà Nội" && x.loai === "mxh-ngan" && x.trongKho));
  const ngoai = path.join(d, "Projects", "phim-cu");
  assert.equal((await goi("POST", "/phim/kho/loai", { workspace: ngoai, loai: "giai-tri-ai" })).body.phim.loai, "giai-tri-ai");
  const root = path.join(kho, "giai-tri-ai", "tin-hieu-tro-ve");
  const n = await goi("GET", "/phim/don-nhap?workspace=" + encodeURIComponent(root));
  assert.equal(n.status, 200);
  assert.equal((await goi("POST", "/phim/don-nhap", { workspace: root, ma: "sai" })).status, 409, "mã danh sách sai");
  assert.equal((await goi("POST", "/phim/don-nhap", { workspace: root, ma: n.body.ma })).body.donNhap.soTep, n.body.tep.length);
  assert.equal((await goi("GET", "/phim/don-nhap?workspace=" + encodeURIComponent(path.join(kho, "mxh-ngan", "dem-ha-noi")))).status, 409, "chưa qua Cổng 4");
});
