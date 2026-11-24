"use strict";
// Xưởng phim P3: bàn dựng (ctl/ban-dung.js) — kế hoạch dựng, lệnh FFmpeg, máy đo, 4 cổng duyệt, quay lại cảnh.
// FFmpeg giả lập ở đa số test; một test dựng thật khi máy có FFmpeg (biến XUONG_PHIM_FFMPEG), không có thì bỏ qua.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createBanDung, keHoach, lenhDung, ngatDong, docDo, danhGia, banDungCu, dsCong } = require("../ctl/ban-dung");

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-bd-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const ghi = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };
const docPhim = (d) => JSON.parse(fs.readFileSync(path.join(d, "phim.json"), "utf8"));
const PHIM = () => ({
  ten: "Thử", ti_le: ["9:16"], ngon_ngu: "vi", ngan_sach_usd: 10, may_quay_mac_dinh: "flow", nguoi_that: [], nhan_vat: [],
  canh: [
    { ma: "C01", giay: 2, loi_dan: "Chúc mừng ngày Nhà giáo", take: ["media/quay/C01-t1.mp4"] },
    { ma: "C02", giay: 3, loi_dan: "Kính chúc thầy cô", take: ["media/quay/C02-t1.mp4", "media/quay/C02-t2.mp4"], take_chon: "media/quay/C02-t2.mp4" },
  ],
});
function duAn(d, sua = (p) => p) {
  for (const f of ["C01-t1", "C02-t1", "C02-t2"]) ghi(path.join(d, "media", "quay", f + ".mp4"), "MP4");
  ghi(path.join(d, "phim.json"), JSON.stringify(sua(PHIM())));
  return d;
}

test("kế hoạch dựng: cảnh một take dùng luôn, nhiều take phải chọn; phụ đề theo lời dẫn hoặc theo câu giọng đọc", () => {
  const kh = keHoach(PHIM());
  assert.deepEqual(kh.canh.map((c) => [c.ma, c.take, c.batDau, c.giay]), [["C01", "media/quay/C01-t1.mp4", 0, 2], ["C02", "media/quay/C02-t2.mp4", 2, 3]]);
  assert.equal(kh.tong, 5);
  assert.deepEqual(kh.phuDe, [{ batDau: 0, ketThuc: 2, chu: "Chúc mừng ngày Nhà giáo" }, { batDau: 2, ketThuc: 5, chu: "Kính chúc thầy cô" }]);
  const giong = [{ index: 1, startMs: 100, endMs: 1900, text: "Câu một." }, { index: 2, startMs: 2100, endMs: 5600, text: "Câu hai." }];
  assert.deepEqual(keHoach(PHIM(), { giong }).phuDe, [{ batDau: 0.1, ketThuc: 1.9, chu: "Câu một." }, { batDau: 2.1, ketThuc: 5, chu: "Câu hai." }]);

  const chuaChon = PHIM(); delete chuaChon.canh[1].take_chon;
  assert.throws(() => keHoach(chuaChon), (e) => e.code === "CHUA_DUNG_DUOC" && /C02: chưa chọn take/.test(e.message));
  const chuaQuay = PHIM(); chuaQuay.canh[0].take = [];
  assert.throws(() => keHoach(chuaQuay), /C01: chưa quay/);
  assert.throws(() => keHoach(PHIM(), { coFile: (f) => !f.includes("C02") }), /không thấy file media\/quay\/C02-t2.mp4/);
  const thoat = PHIM(); thoat.canh[0].take = ["../ngoai.mp4"];
  assert.throws(() => keHoach(thoat), /C01: take phải nằm trong media/);
  const nhac = PHIM(); nhac.nhac = { file: "C:/Windows/nhac.mp3" };
  assert.throws(() => keHoach(nhac), /nhac.file phải là file trong media/);
});

test("ngắt dòng phụ đề theo từ, tối đa 3 dòng", () => {
  assert.deepEqual(ngatDong("Chúc mừng ngày Nhà giáo Việt Nam", 12), ["Chúc mừng", "ngày Nhà", "giáo Việt Nam"]);
  assert.deepEqual(ngatDong("  ngắn  ", 20), ["ngắn"]);
  assert.equal(ngatDong("a b c d e f g h", 1).length, 3);
});

test("lệnh FFmpeg: khung 720×1280, clip ngắn kéo dài, clip câm có tiếng lặng, chữ đọc từ file tương đối, nhạc hạ khi có lời", () => {
  const kh = keHoach(PHIM());
  const l = lenhDung(kh, "9:16", { takeAbs: ["D:\\phim\\a.mp4", "D:\\phim\\b.mp4"], coTieng: [true, false], giong: "D:\\phim\\voice.mp3", nhac: "D:\\phim\\nhac.mp3", ra: "D:\\phim\\ra.mp4", phong: true });
  assert.ok(l.doThi.includes("scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280"));
  assert.ok(l.doThi.includes("tpad=stop_mode=clone:stop_duration=3,trim=duration=3"));
  assert.ok(l.doThi.includes("[0:a]aformat") && l.doThi.includes("anullsrc=r=48000:cl=stereo,atrim=duration=3[a1]"));
  assert.ok(l.doThi.includes("concat=n=2:v=1:a=1[vc][ac]"));
  assert.ok(l.doThi.includes("sidechaincompress") && l.doThi.includes("amix=inputs=3"));
  assert.ok(l.doThi.includes("loudnorm=I=-14"));
  assert.ok(l.doThi.includes("textfile=pd-001.txt") && l.doThi.includes("textfile=nhan-ai.txt") && l.doThi.includes("fontfile=font.ttf"));
  assert.ok(!/[A-Za-z]:[\\/]/.test(l.doThi), "đồ thị lọc không chứa đường dẫn ổ đĩa (khỏi phải thoát dấu :)");
  assert.deepEqual(l.chu.map((c) => c.ten), ["pd-001.txt", "pd-002.txt", "nhan-ai.txt"]);
  assert.equal(l.chu[2].noiDung, "Video tạo bằng AI");
  assert.deepEqual(l.args.slice(-2), ["mp4", "D:\\phim\\ra.mp4"]);
  assert.ok(l.args.includes("-stream_loop"), "nhạc ngắn hơn phim thì lặp");

  const tron = lenhDung(kh, "16:9", { takeAbs: ["a", "b"], coTieng: [false, false], giong: null, nhac: null, ra: "ra.mp4", phong: false });
  assert.ok(tron.doThi.includes("crop=1280:720") && tron.doThi.includes("[vc]null[vout]") && tron.doThi.includes("[ac]loudnorm"));
  assert.equal(tron.chu.length, 0);
  assert.throws(() => lenhDung(kh, "4:3", { takeAbs: [], coTieng: [] }), /không hỗ trợ/);
});

test("máy đo: đọc LUFS ở phần tóm tắt và đoạn khung đen; đánh giá đạt/không đạt", () => {
  const err = "[Parsed_ebur128_0] t: 1.0 M: -20.0 I: -30.0 LUFS\n[blackdetect] black_start:0 black_end:0.8 black_duration:0.8\n[Parsed_ebur128_0] Summary:\n  Integrated loudness:\n    I:         -14.3 LUFS\n";
  assert.deepEqual(docDo(err), { lufs: -14.3, khungDen: [{ tu: 0, den: 0.8 }] });
  assert.deepEqual(docDo("không có gì"), { lufs: null, khungDen: [] });
  assert.deepEqual(danhGia({ giay: 5.02, rong: 720, cao: 1280, lufs: -14.3, khungDen: [] }, { tiLe: "9:16", tong: 5 }), { dat: true, loi: [] });
  const hong = danhGia({ giay: 6, rong: 1280, cao: 720, lufs: -20, khungDen: [{ tu: 0, den: 0.8 }] }, { tiLe: "9:16", tong: 5 });
  assert.equal(hong.dat, false);
  assert.equal(hong.loi.length, 4);
});

test("cổng duyệt: đúng thứ tự, cổng 3 cần bản dựng còn mới, cổng 4 cần máy đo đạt, bỏ duyệt kéo theo cổng sau", (t) => {
  const d = duAn(tmp(t));
  const log = [];
  const dir = tmp(t);
  const bd = createBanDung({ dir, audit: { log: (...a) => log.push(a) }, ffmpeg: () => null });
  assert.throws(() => bd.duyetCong(d, { cong: 2, duyet: true }), (e) => e.code === "CHUA_DU_DIEU_KIEN" && /Duyệt cổng 1 trước/.test(e.message));
  bd.duyetCong(d, { cong: 1, duyet: true });
  bd.duyetCong(d, { cong: 2, duyet: true });
  assert.equal(bd.coDuyetQuay(d, docPhim(d)), true);
  assert.equal(createBanDung({ dir }).coDuyetQuay(d, docPhim(d)), true);
  assert.throws(() => bd.duyetCong(d, { cong: 3, duyet: true }), /Chưa có bản dựng/);

  // Có bản dựng, máy đo chưa đạt: duyệt được cổng 3, chưa được cổng 4.
  ghi(path.join(d, "media", "xuat", "9x16.mp4"), "MP4");
  const p = docPhim(d);
  p.ban_dung = { luc: "x", tong: 5, take: { C01: "media/quay/C01-t1.mp4", C02: "media/quay/C02-t2.mp4" }, giay_canh: { C01: 2, C02: 3 },
    ban: [{ ti_le: "9:16", file: "media/xuat/9x16.mp4", dat: false, loi: ["độ to -20 LUFS"] }] };
  ghi(path.join(d, "phim.json"), JSON.stringify(p));
  bd.duyetCong(d, { cong: 3, duyet: true });
  assert.throws(() => bd.duyetCong(d, { cong: 4, duyet: true }), /Máy đo chưa đạt: độ to -20 LUFS/);

  // Đổi take sau khi dựng: bản dựng cũ, cổng 3 mất hiệu lực.
  const p2 = docPhim(d); p2.canh[1].take_chon = "media/quay/C02-t1.mp4"; ghi(path.join(d, "phim.json"), JSON.stringify(p2));
  assert.equal(banDungCu(docPhim(d)), true);
  const cong = bd.trangThai(d).cong;
  assert.equal(cong[2].duyet, false);
  assert.match(cong[2].lyDo, /Bản dựng cũ/);

  // Bỏ duyệt cổng 1: mọi cổng sau cũng bỏ.
  bd.duyetCong(d, { cong: 1, duyet: false });
  assert.deepEqual(docPhim(d).cong, {});
  assert.throws(() => bd.duyetCong(d, { cong: 5, duyet: true }), /Cổng là 1, 2, 3 hoặc 4/);
  assert.throws(() => bd.duyetCong(d, { cong: 1, duyet: "co" }), /duyet phải là true hoặc false/);
  assert.ok(log.some((l) => l[1] === "phim.cong"));
});

test("cổng 1–2 khoá khi hồ sơ phim còn lỗi (vd. vượt ngân sách)", () => {
  const p = PHIM(); p.may_quay_mac_dinh = "omni-flash"; p.ngan_sach_usd = 0.1;
  const c = dsCong(p);
  assert.equal(c[0].duoc, false);
  assert.match(c[0].lyDo, /vượt ngân sách/);
});

test("quay lại cảnh: mở thêm một take nếu còn trong ngân sách, tối đa 5", (t) => {
  const d = duAn(tmp(t), (p) => ({ ...p, may_quay_mac_dinh: "omni-flash", ngan_sach_usd: 2 }));
  const bd = createBanDung({ ffmpeg: () => null });
  const r = bd.quayLai(d, { canh: "C01" });
  assert.equal(docPhim(d).canh[0].so_take_toi_da, 3);
  assert.equal(docPhim(d).canh[0].trang_thai, "cho_quay");
  assert.equal(r.uocTinh.usd, 0.14);
  // C01: 2 giây × 3 take × $0.07 + C02: 3 giây × 2 × $0.07 = $0.84; thêm take nữa vẫn dưới $2.
  bd.quayLai(d, { canh: "C01" });
  const p = docPhim(d); p.ngan_sach_usd = 1.1; ghi(path.join(d, "phim.json"), JSON.stringify(p));
  assert.throws(() => bd.quayLai(d, { canh: "C01" }), (e) => e.code === "VUOT_NGAN_SACH");
  const p2 = docPhim(d); p2.ngan_sach_usd = 100; p2.canh[0].so_take_toi_da = 5; ghi(path.join(d, "phim.json"), JSON.stringify(p2));
  assert.throws(() => bd.quayLai(d, { canh: "C01" }), (e) => e.code === "TOI_DA_TAKE");
  assert.throws(() => bd.quayLai(d, { canh: "C09" }), (e) => e.code === "NOT_FOUND");
});

test("máy dựng (FFmpeg giả lập): chạy trong thư mục tạm của xưởng, ghi bản xuất + bìa + số đo, cổng 3–4 phải duyệt lại, dọn thư mục tạm", async (t) => {
  const d = duAn(tmp(t), (p) => ({ ...p, cong: { 1: { luc: "a" }, 2: { luc: "b" }, 3: { luc: "c" }, 4: { luc: "d" } } }));
  const tam = tmp(t), phong = ghi(path.join(tmp(t), "font.ttf"), "TTF");
  const goi = [];
  const run = (prog, args, opts, cb) => {
    goi.push({ prog, args, cwd: opts.cwd, file: opts.cwd && fs.existsSync(opts.cwd) ? fs.readdirSync(opts.cwd).sort() : [] });
    if (/ffprobe/.test(prog) && args.includes("csv=p=0")) return cb(null, args[args.length - 1].includes("C01") ? "1\n" : "", "");
    if (/ffprobe/.test(prog)) return cb(null, JSON.stringify({ format: { duration: "5.01" }, streams: [{ codec_type: "video", width: 720, height: 1280 }, { codec_type: "audio" }] }), "");
    if (args.includes("null")) return cb(null, "", "[Parsed_ebur128_0] Summary:\n    I:         -14.2 LUFS\n");
    fs.writeFileSync(args[args.length - 1], "RA");
    return cb(null, "", "");
  };
  const bd = createBanDung({ ffmpeg: () => "/x/ffmpeg", tam: () => tam, run, phong: [phong] });
  const b = await bd.dungVaCho(d);
  assert.equal(bd.trangThai(d).dang, null);
  await bd.dungVaCho(d);
  assert.equal(bd.trangThai(d).dang, null);
  assert.equal(b.tong, 5);
  assert.deepEqual(b.take, { C01: "media/quay/C01-t1.mp4", C02: "media/quay/C02-t2.mp4" });
  assert.equal(b.ban[0].file, "media/xuat/9x16.mp4");
  assert.equal(b.ban[0].dat, true);
  assert.equal(b.bia, "media/xuat/bia.jpg");
  assert.equal(fs.readFileSync(path.join(d, "media", "xuat", "9x16.mp4"), "utf8"), "RA");
  assert.ok(!fs.readdirSync(path.join(d, "media", "xuat")).some((f) => f.includes("dang-dung")));
  const dung = goi.find((g) => g.args.includes("-/filter_complex"));
  assert.equal(path.dirname(dung.cwd), tam, "FFmpeg chạy trong thư mục tạm của xưởng");
  assert.deepEqual(dung.file, ["do-thi.txt", "font.ttf", "nhan-ai.txt", "pd-001.txt", "pd-002.txt"]);
  assert.deepEqual(fs.readdirSync(tam), [], "dọn thư mục tạm sau khi dựng");
  const p = docPhim(d);
  assert.deepEqual(Object.keys(p.cong), ["1", "2"], "bản dựng mới: cổng 3–4 duyệt lại");
  assert.equal(p.ban_dung.ban[0].lufs, -14.2);
  assert.equal(bd.trangThai(d).cong[2].duoc, true);
});

test("máy dựng báo lỗi sớm: chưa có FFmpeg, chưa chọn take, đang dựng", async (t) => {
  const d = duAn(tmp(t));
  assert.throws(() => createBanDung({ ffmpeg: () => null }).batDauDung(d), (e) => e.code === "THIEU_FFMPEG");
  const p = docPhim(d); delete p.canh[1].take_chon; ghi(path.join(d, "phim.json"), JSON.stringify(p));
  assert.throws(() => createBanDung({ ffmpeg: () => "/x/ffmpeg" }).batDauDung(d), (e) => e.code === "CHUA_DUNG_DUOC");
  const d2 = duAn(tmp(t));
  let xong;
  const bd = createBanDung({ ffmpeg: () => "/x/ffmpeg", tam: () => tmp(t), run: (prog, args, o, cb) => { if (!xong) xong = () => cb(new Error("hỏng"), "", ""); else cb(new Error("hỏng"), "", "loi that"); } });
  bd.batDauDung(d2);
  assert.throws(() => bd.batDauDung(d2), (e) => e.code === "DANG_DUNG");
  for (let i = 0; i < 20 && !xong; i++) await new Promise((r) => setTimeout(r, 5));
  xong();
  for (let i = 0; i < 100 && bd.trangThai(d2).dang; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(bd.trangThai(d2).dang, null);
  assert.match(bd.trangThai(d2).loiCuoi, /FFmpeg dựng 9:16 lỗi: loi that/);
});

const FF = process.env.XUONG_PHIM_FFMPEG;
test("dựng thật bằng FFmpeg: hai clip (một clip câm, ngắn hơn cảnh) thành bản 9:16 đạt máy đo", { skip: !FF && "không có XUONG_PHIM_FFMPEG" }, async (t) => {
  const d = tmp(t);
  const tao = (ten, giay, tieng) => {
    const f = path.join(d, "media", "quay", ten);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=25:duration=${giay}`,
      ...(tieng ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${giay}`] : []), "-c:v", "libx264", "-pix_fmt", "yuv420p", ...(tieng ? ["-c:a", "aac"] : []), "-shortest", f]);
  };
  tao("C01-t1.mp4", 2, true); tao("C02-t1.mp4", 1.5, false);
  const p = PHIM(); p.canh[1].take = ["media/quay/C02-t1.mp4"]; delete p.canh[1].take_chon;
  ghi(path.join(d, "phim.json"), JSON.stringify(p));
  const bd = createBanDung({ ffmpeg: () => FF, tam: () => tmp(t) });
  const b = await bd.dung(d);
  assert.equal(b.ban[0].rong, 720);
  assert.equal(b.ban[0].cao, 1280);
  assert.ok(Math.abs(b.ban[0].giay - 5) <= 0.5, "dài " + b.ban[0].giay);
  assert.ok(b.ban[0].lufs !== null);
  assert.ok(fs.statSync(path.join(d, "media", "xuat", "bia.jpg")).size > 0);
});
