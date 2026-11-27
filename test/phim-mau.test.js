// Nút "Xin góp ý" mọi lúc và thư viện phim mẫu (CEO yêu cầu 26/11/2026).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { Readable } = require("node:stream");
const { createCtl } = require("../ctl/main");
const { createPhimMau, goiYTu, boLienKetTep } = require("../ctl/phim-mau");
const { createCoVanTay } = require("../ctl/co-van-tay");

const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-phim-mau-"));
const kho = path.join(d, "XuongPhim");
let ctl;
test.before(() => { ctl = createCtl({ dir: path.join(d, "data"), khoPhimDir: kho }); });
test.after(async () => { await ctl.close(); fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const cho = (fn, ms = 3000) => new Promise((ok, bad) => { const t0 = Date.now(); const lap = () => { try { if (fn()) return ok(); } catch {} if (Date.now() - t0 > ms) return bad(new Error("hết giờ chờ")); setTimeout(lap, 20); }; lap(); });
const traLoi = (response) => ({ ok: true, text: JSON.stringify({ event: "result", result: { status: "SUCCESS", response } }) });

// FFprobe/FFmpeg giả: ffprobe trả thông số; ffmpeg ghi ảnh khung ra đúng đường dẫn cuối lệnh.
function runGia(ffprobeOut) {
  return async (prog, args) => {
    if (prog === "ffprobe") return { stdout: JSON.stringify(ffprobeOut) };
    fs.writeFileSync(args[args.length - 1], "jpg");
    return { stdout: "" };
  };
}
const reqGia = (buf, headers = {}) => Object.assign(Readable.from([buf]), { headers: { "content-length": String(buf.length), ...headers } });
const FFPROBE_OK = { format: { duration: "24.5" }, streams: [{ codec_type: "video", width: 1080, height: 1920, r_frame_rate: "30/1" }, { codec_type: "audio" }] };

test("phim mẫu: tải lên theo luồng, đọc thông số, cắt khung; phân tích chỉ đọc; gợi ý; tạo phim theo mẫu; bỏ", async () => {
  const goi = [];
  const pm = createPhimMau({ khoPhim: ctl.khoPhim, ws: ctl.ws, ffmpeg: () => "ffmpeg", ffprobe: () => "ffprobe", runImpl: runGia(FFPROBE_OK),
    chayAi: async (x) => { goi.push(x); return traLoi("## Tóm tắt phim mẫu\nPhim ngắn.\n## Làm được không\nLàm được\n```json\n{\"lam_duoc\":\"duoc\",\"ten_goi_y\":\"Bình minh thành phố\",\"loai\":\"mxh-ngan\",\"so_canh\":5,\"y_tuong\":\"Timelapse thành phố thức dậy.\"}\n```"); } });
  const m = await pm.taiLen(reqGia(Buffer.from("video-gia")), "Phim hay của tôi.mp4");
  assert.match(m.ma, /^phim-hay-cua-toi-[a-f0-9]{6}$/);
  assert.deepEqual([m.ten, m.giay, m.rong, m.cao, m.fps, m.coTieng, m.phanTich.trangThai], ["Phim hay của tôi.mp4", 24.5, 1080, 1920, 30, true, "chua"]);
  assert.equal(m.khung.length, 5, "24,5 giây → 5 khung (4–12 khung, mỗi ~5 giây)");
  assert.ok(m.khung.every((k) => /^media\/phim-hay-cua-toi-[a-f0-9]{6}\/khung\/k0\d\.jpg$/.test(k.path)));
  const goc = path.join(kho, "_phim-mau");
  assert.ok(fs.existsSync(path.join(goc, "media", m.ma, "video.mp4")));
  assert.ok(ctl.ws.list().some((w) => w.path === fs.realpathSync(goc)), "_phim-mau đăng ký làm workspace để xem khung");
  assert.ok(!ctl.khoPhim.list().some((p) => p.path.includes("_phim-mau")), "phim mẫu không lẫn vào danh sách phim");

  pm.phanTich(m.ma);
  assert.throws(() => pm.phanTich(m.ma), (e) => e.code === "DANG_CHAY");
  await cho(() => pm.list().ds[0].phanTich.trangThai === "xong");
  assert.equal(goi.length, 1);
  assert.equal(goi[0].chiDoc, true, "phân tích luôn chỉ đọc");
  assert.equal(goi[0].vai, "PHIM_CO_VAN");
  assert.match(goi[0].prompt, /KHÔNG ghi, sửa, tạo tệp/);
  assert.match(goi[0].prompt, /khung\/k01\.jpg/);
  const sau = pm.list().ds[0];
  assert.deepEqual(sau.goiY, { lam_duoc: "duoc", ten_goi_y: "Bình minh thành phố", loai: "mxh-ngan", so_canh: 5, y_tuong: "Timelapse thành phố thức dậy." });
  assert.match(sau.baoCao, /Phim ngắn/);
  assert.doesNotMatch(sau.baoCao, /```json/, "khối json không nằm trong báo cáo để đọc");

  const p = pm.taoPhim(m.ma, {});
  assert.deepEqual([p.ten, p.loai, p.trongKho], ["Bình minh thành phố", "mxh-ngan", true]);
  assert.match(fs.readFileSync(path.join(p.path, "y-tuong.md"), "utf8"), /Timelapse[\s\S]*không sao chép/);
  assert.match(fs.readFileSync(path.join(p.path, "phim-mau.md"), "utf8"), /Phim ngắn/);

  pm.xoa(m.ma);
  assert.equal(pm.list().ds.length, 0);
  assert.ok(fs.existsSync(p.path), "bỏ phim mẫu không đụng phim đã tạo");
});

test("phim mẫu: sai đuôi, không phải video, tải thiếu thì báo lỗi và dọn đúng thư mục vừa tạo; mã lạ bị chặn", async () => {
  const pm = createPhimMau({ khoPhim: ctl.khoPhim, ws: ctl.ws, ffmpeg: () => "ffmpeg", ffprobe: () => "ffprobe", runImpl: runGia({ format: { duration: "0.2" }, streams: [] }), chayAi: async () => traLoi("") });
  await assert.rejects(pm.taiLen(reqGia(Buffer.from("x")), "anh.png"), (e) => e.code === "BAD_REQUEST");
  await assert.rejects(pm.taiLen(reqGia(Buffer.from("x")), "khong-hinh.mp4"), (e) => e.code === "BAD_REQUEST" && /luồng hình/.test(e.message));
  await assert.rejects(pm.taiLen(reqGia(Buffer.from("abc"), { "content-length": "10" }), "thieu.mp4"), (e) => e.code === "BAD_REQUEST");
  await assert.rejects(pm.taiLen(reqGia(Buffer.from("abc"), { "content-length": String(3 * 1024 * 1024 * 1024) }), "to.mp4"), (e) => e.code === "TOO_LARGE");
  const con = fs.readdirSync(path.join(kho, "_phim-mau", "media")).filter((x) => /^(khong-hinh|thieu|to)-/.test(x));
  assert.deepEqual(con, [], "không để lại thư mục hỏng");
  for (const ma of ["..", "../x", "A B", ""]) assert.throws(() => pm.phanTich(ma), (e) => ["BAD_REQUEST", "NOT_FOUND"].includes(e.code), ma);
  const pm2 = createPhimMau({ khoPhim: ctl.khoPhim, ws: ctl.ws, ffmpeg: () => null, ffprobe: () => null, chayAi: async () => traLoi("") });
  await assert.rejects(pm2.taiLen(reqGia(Buffer.from("x")), "a.mp4"), (e) => e.code === "THIEU_FFMPEG");
});

test("phim mẫu: gợi ý lấy từ khối json cuối, bỏ trường sai", () => {
  assert.equal(boLienKetTep("Mở đầu ([k01.jpg](file:///D:/….jpg)), xem [Flow](https://labs.google/flow), [a](media/x.jpg)"),
    "Mở đầu (k01.jpg), xem [Flow](https://labs.google/flow), a");
  assert.equal(goiYTu("không có json"), null);
  assert.deepEqual(goiYTu("```json\n{\"lam_duoc\":\"sai\",\"loai\":\"..\",\"so_canh\":-1,\"ten_goi_y\":\"  Tên  \"}\n```"), { ten_goi_y: "Tên" });
  assert.deepEqual(goiYTu("```json\n{\"lam_duoc\":\"kho\"}\n```\n```json\n{\"lam_duoc\":\"mot_phan\"}\n```"), { lam_duoc: "mot_phan" });
});

test("Xin góp ý chạy tay: chỉ đọc, ghi media/co-van/cong-N.md có chữ ký; đang chạy thì DANG_CHAY; chưa có cảnh thì từ chối; lỗi giữ lại để báo", async () => {
  const p = ctl.khoPhim.tao({ ten: "Phim góp ý tay", loai: "giai-tri-ai" });
  const cv = createCoVanTay({ chayAi: async () => { throw new Error("không dùng"); } });
  assert.throws(() => cv.batDau(p.path, 1), (e) => e.code === "CHUA_DU_DIEU_KIEN", "chưa có cảnh");
  const f = path.join(p.path, "phim.json");
  const h = JSON.parse(fs.readFileSync(f, "utf8"));
  h.canh = [{ ma: "C01", loi_dan: "Mở đầu.", khung_hinh: "Bình minh." }];
  fs.writeFileSync(f, JSON.stringify(h));
  let xong; const doi = new Promise((r) => { xong = r; });
  const goi = [];
  const cv2 = createCoVanTay({ chayAi: (x) => { goi.push(x); return doi; } });
  assert.throws(() => cv2.batDau(p.path, 3), (e) => e.code === "BAD_REQUEST");
  assert.equal(cv2.batDau(p.path, 1)[1].dang, true);
  assert.throws(() => cv2.batDau(p.path, 1), (e) => e.code === "DANG_CHAY");
  assert.equal(goi[0].chiDoc, true);
  assert.equal(goi[0].vai, "PHIM_CO_VAN");
  xong(traLoi("## Kết luận\nNên duyệt"));
  await cho(() => cv2.trangThai(p.path)[1] && !cv2.trangThai(p.path)[1].dang);
  const tep = fs.readFileSync(path.join(p.path, "media", "co-van", "cong-1.md"), "utf8");
  assert.match(tep, /^<!-- co-van: [a-f0-9]{64} -->/);
  assert.match(tep, /Nên duyệt/);
  // Lượt lỗi: giữ thông điệp lỗi để giao diện báo; AI_BUSY đồng bộ thì ném ngay.
  const cv3 = createCoVanTay({ chayAi: async () => ({ ok: false, loi: "AI hết lượt" }) });
  cv3.batDau(p.path, 2);
  await cho(() => cv3.trangThai(p.path)[2] && !cv3.trangThai(p.path)[2].dang);
  assert.match(cv3.trangThai(p.path)[2].loi, /hết lượt/);
  const cv4 = createCoVanTay({ chayAi: () => { throw Object.assign(new Error("bận"), { code: "AI_BUSY" }); } });
  assert.throws(() => cv4.batDau(p.path, 1), (e) => e.code === "AI_BUSY");
  assert.equal(cv4.trangThai(p.path)[1], null, "lỗi khởi chạy không để lại trạng thái đang chạy");
});

test("route tải phim mẫu: bắt buộc octet-stream, chặn cross-site; GET /phim có trạng thái góp ý", async () => {
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  const port = ctl.server.address().port;
  const goi = (method, p, body, headers = {}) => new Promise((ok, bad) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { host: "127.0.0.1:" + port, authorization: "Bearer " + ctl.token, ...headers } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok({ status: res.statusCode, body: JSON.parse(b || "{}") }));
    });
    req.on("error", bad); if (body) req.write(body); req.end();
  });
  // guard.checkWrite: đường tải nhận octet-stream, đường khác vẫn chỉ JSON; trang khác (Sec-Fetch-Site/Origin) bị chặn.
  const tho = { "content-type": "application/octet-stream", "content-length": "1" };
  assert.equal((await goi("POST", "/phim/mau/tai-len?ten=a.mp4", "x", { "content-type": "text/plain", "content-length": "1" })).status, 403);
  assert.equal((await goi("POST", "/phim/mau/tai-len?ten=a.mp4", "x", { ...tho, "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await goi("POST", "/phim/mau/tai-len?ten=a.mp4", "x", { ...tho, origin: "http://trang-la.example" })).status, 403);
  assert.equal((await goi("POST", "/phim/kho", "x", tho)).status, 403, "đường khác không nhận octet-stream");
  const r0 = await goi("POST", "/phim/mau/tai-len?ten=a.txt", "x", { ...tho, "sec-fetch-site": "same-origin" });
  assert.equal(r0.status, 400, "qua được lớp chặn, tới bước kiểm đuôi tệp: " + JSON.stringify(r0.body));
  assert.equal((await goi("GET", "/phim/mau")).status, 200);
  const p = ctl.khoPhim.list().find((x) => x.ten === "Phim góp ý tay");
  const r = await goi("GET", "/phim?workspace=" + encodeURIComponent(p.path));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.coVan.co, { 1: true, 2: false });
  assert.equal((await goi("POST", "/phim/co-van", JSON.stringify({ workspace: p.path, cong: 9 }), { "content-type": "application/json" })).status, 400);
});
