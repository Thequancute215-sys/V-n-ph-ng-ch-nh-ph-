"use strict";
// Xưởng phim P2: máy quay Gemini (ctl/may-quay.js), trạm Google Flow (ctl/tram-flow.js), xem media qua ctl.
// Không gọi mạng thật: fetch và tiến trình đều giả lập.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createMayQuay, layKetQua, MO_HINH } = require("../ctl/may-quay");
const { createTramFlow, LUAT } = require("../ctl/tram-flow");

const KHOA = "AIza" + "x".repeat(35);
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-mq-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const ghi = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };
function duAn(d, sua = (p) => p) {
  ghi(path.join(d, "media", "tham-chieu", "co-1.png"), "PNG");
  ghi(path.join(d, "media", "khung", "C01-1.jpg"), "JPG");
  const phim = sua({
    ten: "Thử", ti_le: ["9:16"], ngon_ngu: "vi", ngan_sach_usd: 5, may_quay_mac_dinh: "omni-flash",
    nguoi_that: [], nhan_vat: [{ ma: "co", tham_chieu: ["media/tham-chieu/co-1.png"] }],
    canh: [{ ma: "C01", giay: 4.2, khung_hinh: "Cô giáo cầm hoa trước cổng trường", nhan_vat: ["co"], khung: ["media/khung/C01-1.jpg"], khung_chon: "media/khung/C01-1.jpg" },
      { ma: "C02", giay: 3, khung_hinh: "Cận cảnh bó hoa", may_quay: "flow" }],
  });
  ghi(path.join(d, "phim.json"), JSON.stringify(phim));
  return d;
}
const docPhim = (d) => JSON.parse(fs.readFileSync(path.join(d, "phim.json"), "utf8"));
function giaFetch(traVe) {
  const goi = [];
  const f = async (url, o) => { goi.push({ url: String(url), o, body: o && o.body ? JSON.parse(o.body) : null }); return traVe(goi.length); };
  return { f, goi };
}
const ok = (j) => ({ ok: true, status: 200, text: async () => JSON.stringify(j) });
const video = (s = "MP4") => ok({ steps: [{ type: "model_output", content: [{ type: "video", mime_type: "video/mp4", data: Buffer.from(s).toString("base64") }] }], status: "completed" });

test("dựng yêu cầu: khung dùng Nano Banana 2.1 kèm ảnh nhân vật; video dùng Omni 1.2 Flash, khung đầu đặt trước, thời lượng làm tròn lên", (t) => {
  const d = duAn(tmp(t));
  const mq = createMayQuay({ dir: d, khoa: () => KHOA });
  const phim = docPhim(d), c = phim.canh[0];
  const k = mq.dungYeuCau(d, phim, c, { loai: "khung", soPhuongAn: 3 });
  assert.equal(k.body.model, MO_HINH.anh);
  assert.deepEqual(k.body.response_format, { type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16", image_size: "1K" });
  assert.equal(k.body.input[0].type, "image"); assert.equal(k.body.input[0].mime_type, "image/png");
  assert.equal(k.usd, 0.1008);
  const v = mq.dungYeuCau(d, phim, c, { loai: "video" });
  assert.equal(v.body.model, MO_HINH.video);
  assert.deepEqual(v.body.response_format, { type: "video", aspect_ratio: "9:16", resolution: "720p", duration: "5s" });
  assert.equal(v.body.input[0].mime_type, "image/jpeg", "khung CEO chọn là ảnh đầu");
  assert.equal(v.usd, 0.35);
  assert.throws(() => mq.dungYeuCau(d, phim, { ...c, giay: 20 }, { loai: "video" }), /tối đa 15 giây/);
  assert.throws(() => mq.dungYeuCau(d, phim, { ...c, khung_chon: "../ngoai.jpg" }, { loai: "video" }), (e) => e.code === "PATH_ESCAPE");
});

test("quay video: gọi đúng endpoint với khóa ở header, ghi take vào hồ sơ và sổ chi; quay lại là lần mới, không lấy bộ đệm", async (t) => {
  const d = duAn(tmp(t)), log = [];
  const { f, goi } = giaFetch((n) => video("CLIP" + n));
  const mq = createMayQuay({ dir: d, khoa: () => KHOA, fetchImpl: f, audit: { log: (...a) => log.push(a) } });
  const r = await mq.quay(d, { canh: "C01", loai: "video" });
  assert.equal(goi.length, 1);
  assert.equal(goi[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(goi[0].o.headers["x-goog-api-key"], KHOA);
  assert.ok(!goi[0].url.includes(KHOA), "khóa không nằm trên URL");
  assert.deepEqual(r.files, ["media/quay/C01-t1.mp4"]);
  assert.equal(fs.readFileSync(path.join(d, "media", "quay", "C01-t1.mp4"), "utf8"), "CLIP1");
  const p = docPhim(d);
  assert.deepEqual(p.canh[0].take, ["media/quay/C01-t1.mp4"]);
  assert.equal(p.canh[0].trang_thai, "da_quay");
  assert.equal(r.usd, 0.35);
  const r2 = await mq.quay(d, { canh: "C01", loai: "video" });
  assert.equal(goi.length, 2, "take 2 gọi máy quay thật, không lấy lại take 1");
  assert.equal(fs.readFileSync(path.join(d, "media", "quay", "C01-t2.mp4"), "utf8"), "CLIP2");
  assert.equal(r2.daChi, 0.7);
  await assert.rejects(mq.quay(d, { canh: "C01", loai: "video" }), (e) => e.code === "TOI_DA_TAKE");
  assert.ok(log.some((a) => a[1] === "phim.quay"));
});

test("bộ đệm: cùng lần quay bị lặp (hồ sơ chưa ghi) thì không trả tiền lần hai", async (t) => {
  const d = duAn(tmp(t));
  const { f, goi } = giaFetch(() => video());
  const mq = createMayQuay({ dir: d, khoa: () => KHOA, fetchImpl: f });
  const truoc = fs.readFileSync(path.join(d, "phim.json"), "utf8");
  await mq.quay(d, { canh: "C01", loai: "video" });
  fs.writeFileSync(path.join(d, "phim.json"), truoc);              // như thể lần trước chưa ghi được hồ sơ
  fs.writeFileSync(path.join(d, "media", "so-chi.json"), JSON.stringify({ muc: [] }));
  const r = await mq.quay(d, { canh: "C01", loai: "video" });
  assert.equal(goi.length, 1);
  assert.equal(r.usd, 0); assert.equal(r.tuBoDem, 1);
});

test("chặn trước khi tốn tiền: vượt ngân sách, chưa có khóa, hồ sơ lỗi, máy quay flow; lỗi Gemini không lộ khóa", async (t) => {
  // Cả phim ước tối đa $0,95 ≤ $1 (bộ kiểm hồ sơ qua), nhưng đã chi $0,8 nên lần quay $0,35 vượt ngân sách.
  const d = duAn(tmp(t), (p) => ({ ...p, ngan_sach_usd: 1 }));
  ghi(path.join(d, "media", "so-chi.json"), JSON.stringify({ muc: [{ canh: "C01", loai: "khung", usd: 0.8 }] }));
  const { f, goi } = giaFetch(() => video());
  let mq = createMayQuay({ dir: d, khoa: () => KHOA, fetchImpl: f });
  assert.throws(() => mq.batDauQuay(d, { canh: "C01", loai: "video" }), (e) => e.code === "VUOT_NGAN_SACH");
  await assert.rejects(mq.quay(d, { canh: "C01", loai: "video" }), (e) => e.code === "VUOT_NGAN_SACH");
  assert.equal(goi.length, 0);
  assert.throws(() => mq.uocTinh(d, { canh: "C02", loai: "video" }), (e) => e.code === "NOT_SUPPORTED");
  const d2 = duAn(tmp(t));
  mq = createMayQuay({ dir: d2, khoa: () => null, fetchImpl: f });
  await assert.rejects(mq.quay(d2, { canh: "C01", loai: "video" }), (e) => e.code === "NO_KEY");
  const d3 = duAn(tmp(t), (p) => ({ ...p, nguoi_that: [{ ma: "co", dong_y: false }] }));
  assert.throws(() => mq.uocTinh(d3, { canh: "C01", loai: "video" }), (e) => e.code === "PHIM_LOI" && /đồng ý/.test(e.message));
  const d4 = duAn(tmp(t));
  mq = createMayQuay({ dir: d4, khoa: () => KHOA, fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "bad key " + KHOA } }) }) });
  await assert.rejects(mq.quay(d4, { canh: "C01", loai: "video" }), (e) => e.code === "MAY_QUAY_LOI" && !e.message.includes(KHOA));
  assert.equal(mq.trangThai(d4).loiCuoi.includes(KHOA), false);
});

test("đọc kết quả: video/ảnh trong steps, hoặc output_* khi có", () => {
  assert.equal(layKetQua({ steps: [{ content: [{ type: "image", data: "QQ==" }] }] }, "anh").length, 1);
  assert.equal(layKetQua({ output_video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/x:download" } }, "video")[0].uri.startsWith("https://"), true);
  assert.equal(layKetQua({ steps: [{ content: [{ type: "text", text: "bị chặn" }] }] }, "video").length, 0);
});

test("phần của CEO: chỉ chọn khung/take có trong cảnh, đánh dấu đồng ý, ngân sách trong giới hạn", (t) => {
  const d = duAn(tmp(t), (p) => ({ ...p, nguoi_that: [{ ma: "co", dong_y: false }] }));
  const mq = createMayQuay({ dir: d, khoa: () => KHOA });
  assert.throws(() => mq.suaCeo(d, { canh: "C01", khungChon: "../../Windows/a.jpg" }), (e) => e.code === "BAD_REQUEST");
  mq.suaCeo(d, { canh: "C01", khungChon: "media/khung/C01-1.jpg" });
  assert.equal(docPhim(d).canh[0].trang_thai, "cho_quay");
  mq.suaCeo(d, { nguoiThat: { ma: "co", dongY: true } });
  assert.equal(docPhim(d).nguoi_that[0].dong_y, true);
  assert.throws(() => mq.suaCeo(d, { nganSach: 5000 }), (e) => e.code === "BAD_REQUEST");
  mq.suaCeo(d, { nganSach: 12 });
  assert.equal(docPhim(d).ngan_sach_usd, 12);
});

test("trạm Flow: mở Chrome hồ sơ riêng không cờ tự động hoá; nhịp chạy Opus chỉ với MCP Flow; tạo có trần lượt; tải về nhận clip mới", async (t) => {
  const d = tmp(t), goc = path.join(d, "xp"), root = duAn(path.join(d, "phim"));
  ghi(path.join(goc, ".keep"), "");
  const cdt = require("../ctl/chrome-devtools");
  const entry = path.join(d, "mcp", cdt.ID, "node_modules", cdt.GOI);
  ghi(path.join(entry, "package.json"), JSON.stringify({ name: cdt.GOI, version: cdt.PHIEN_BAN, bin: { [cdt.GOI]: "./build/src/bin/chrome-devtools-mcp.js" } }));
  ghi(path.join(entry, "build/src/bin/chrome-devtools-mcp.js"), "");
  const sinh = [], viec = [];
  let moCong = new Set();
  let ketQua = { ket_qua: "xong", ghi_chu: "ok", credit_con_lai: 870 };
  const jobs = { start: (o) => { viec.push(o); return { id: "j" + viec.length }; }, rawLog: () => JSON.stringify({ type: "result", result: "Đã xong.\n" + JSON.stringify(ketQua) }) };
  const flow = createTramFlow({ dir: d, goc, jobs, cliClaude: () => ["claude"], env: { ProgramFiles: path.join(d, "pf") },
    spawnImpl: (p, a) => { sinh.push([p, a]); return { unref() {} }; }, thu: async (cong) => moCong.has(cong) });
  ghi(path.join(d, "pf", "Google", "Chrome", "Application", "chrome.exe"), "");
  await assert.rejects(flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc: "chuan-bi" }), (e) => e.code === "NOT_READY");
  await flow.mo("phu");
  const [, args] = sinh[0];
  assert.ok(args.includes("--user-data-dir=" + path.join(goc, "flow", "phu")));
  assert.ok(args.includes("--remote-debugging-port=9332"));
  assert.ok(!args.some((a) => /enable-automation|headless|disable-blink-features/.test(a)), "mở như người dùng mở");
  assert.equal(JSON.parse(fs.readFileSync(path.join(goc, "flow", "phu", "Default", "Preferences"), "utf8")).download.default_directory, path.join(goc, "flow", "phu-tai-ve"));
  moCong.add(9332);
  await assert.rejects(flow.nhip(root, { canh: "C01", taiKhoan: "phu", buoc: "chuan-bi" }), /không dùng máy quay flow/);
  await flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc: "chuan-bi" });
  const argv = viec[0].argv;
  assert.ok(argv.includes("--strict-mcp-config"));
  assert.equal(argv[argv.indexOf("--allowedTools") + 1], "mcp__flow__*");
  assert.equal(argv[argv.indexOf("--tools") + 1], "");
  const prompt = argv[argv.indexOf("-p") + 1];
  assert.ok(prompt.startsWith(LUAT) && /KHÔNG bấm tạo/.test(prompt) && /CAPTCHA/.test(prompt));
  const cfg = JSON.parse(fs.readFileSync(argv[argv.indexOf("--mcp-config") + 1], "utf8"));
  assert.deepEqual(cfg.mcpServers.flow.args.slice(1, 3), ["--browserUrl", "http://127.0.0.1:9332"]);
  await assert.rejects(flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc: "tao" }), (e) => e.code === "MAY_QUAY_BAN", "một nhịp tại một thời điểm");
  viec[0].onExit({ id: "j1" });                                   // Opus xong nhịp chuẩn bị
  let tt = await flow.trangThai();
  assert.equal(tt.nhipDang, null);
  assert.equal(tt.ketQuaCuoi.ket_qua, "xong");
  // Hạn mức: credit Opus đọc trên trang được lưu theo tài khoản
  let phu = tt.taiKhoan.find((x) => x.id === "phu");
  assert.equal(phu.credit.conLai, 870); assert.ok(phu.credit.lucDoc); assert.equal(phu.credit.luotTaoThang, 0);
  assert.equal(tt.taiKhoan.find((x) => x.id === "chinh").credit.conLai, null, "tài khoản kia chưa đọc");
  // Nhịp tạo xong: đếm lượt tạo trong tháng; không đọc được credit thì giữ số cũ
  ketQua = { ket_qua: "xong", ghi_chu: "đã tạo", credit_con_lai: null };
  await flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc: "tao" });
  viec[1].onExit({ id: "j2" });
  phu = (await flow.trangThai()).taiKhoan.find((x) => x.id === "phu");
  assert.equal(phu.credit.luotTaoThang, 1); assert.equal(phu.credit.conLai, 870);
  viec.splice(1, 1);
  // Nhịp tải về: clip .mp4 mới xuất hiện trong thư mục tải của hồ sơ → take của cảnh
  ketQua = { ket_qua: "xong", ghi_chu: "đã tải", credit_con_lai: "0 credits" };
  await flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc: "tai-ve" });
  ghi(path.join(goc, "flow", "phu-tai-ve", "flow_video.mp4"), "FLOWCLIP");
  viec[1].onExit({ id: "j2" });
  tt = await flow.trangThai();
  assert.equal(tt.ketQuaCuoi.file, "media/quay/C02-t1.mp4");
  assert.equal(fs.readFileSync(path.join(root, "media", "quay", "C02-t1.mp4"), "utf8"), "FLOWCLIP");
  assert.deepEqual(docPhim(root).canh[1].take, ["media/quay/C02-t1.mp4"]);
  const so = JSON.parse(fs.readFileSync(path.join(root, "media", "so-chi.json"), "utf8")).muc;
  assert.deepEqual(so.map((m) => [m.loai, m.buoc, m.usd]), [["flow", "chuan-bi", 0], ["flow", "tao", 0], ["flow", "tai-ve", 0]]);
  // Đọc được hết credit: chặn nhịp tạo trên tài khoản đó, gợi ý đổi tài khoản
  await assert.rejects(flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc: "tao" }), (e) => e.code === "NO_QUOTA" && /tài khoản khác/.test(e.message));
  // Trần lượt tạo: so_take_toi_da mặc định 2
  ghi(path.join(root, "media", "so-chi.json"), JSON.stringify({ muc: [1, 2].map(() => ({ loai: "flow", buoc: "tao", canh: "C02", ketQua: "xong" })) }));
  await assert.rejects(flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc: "tao" }), (e) => e.code === "TOI_DA_TAKE");
});

test("đọc kết quả Opus: log thật của claude -p có \"type\" ở cuối, kết quả trong .result; dòng JSON cuối có ket_qua", () => {
  const { docKetQua } = require("../ctl/tram-flow");
  // Dạng log thật lần chạy 20/11/2026 (rút gọn): khoá type nằm SAU result.
  const that = JSON.stringify({ duration_api_ms: 58059, result: "Đã chuẩn bị.\n\n**Những gì đã đặt** {không phải JSON}\n\n" +
    JSON.stringify({ ket_qua: "xong", ghi_chu: "chưa bấm tạo; tốn 30 tín dụng", credit_con_lai: null, credit_lan_tao: 30 }), type: "result", terminal_reason: "completed" });
  assert.deepEqual(docKetQua(that), { ket_qua: "xong", ghi_chu: "chưa bấm tạo; tốn 30 tín dụng", credit_con_lai: null, credit_lan_tao: 30 });
  assert.equal(docKetQua("cảnh báo gì đó\n" + that).ket_qua, "xong", "log lẫn dòng khác");
  assert.equal(docKetQua(JSON.stringify({ type: "result", result: "Không có JSON" })), null);
  assert.equal(docKetQua(JSON.stringify({ type: "result", result: '{"ket_qua":"bừa"}' })), null, "ket_qua lạ không nhận");
});

test("credit: ghi chi phí lần tạo ở nhịp chuẩn bị, cộng vào tháng khi tạo xong, trừ dần số dư đã biết", async (t) => {
  const d = tmp(t), root = duAn(path.join(d, "phim"));
  const cdt = require("../ctl/chrome-devtools");
  const entry = path.join(d, "mcp", cdt.ID, "node_modules", cdt.GOI);
  ghi(path.join(entry, "package.json"), JSON.stringify({ name: cdt.GOI, version: cdt.PHIEN_BAN, bin: { [cdt.GOI]: "./build/src/bin/chrome-devtools-mcp.js" } }));
  ghi(path.join(entry, "build/src/bin/chrome-devtools-mcp.js"), "");
  let ket = null; const viec = [];
  const flow = createTramFlow({ dir: d, goc: path.join(d, "xp"), jobs: { start: (o) => { viec.push(o); return { id: "j" }; }, rawLog: () => JSON.stringify({ result: JSON.stringify(ket), type: "result" }) },
    cliClaude: () => ["claude"], thu: async () => true });
  const chay = async (buoc, k) => { ket = k; await flow.nhip(root, { canh: "C02", taiKhoan: "phu", buoc }); viec[viec.length - 1].onExit({ id: "j" }); };
  await chay("chuan-bi", { ket_qua: "xong", ghi_chu: "", credit_con_lai: "1.000 credits", credit_lan_tao: "15 tín dụng" });
  let c = (await flow.trangThai()).taiKhoan.find((x) => x.id === "phu").credit;
  assert.equal(c.conLai, 1000); assert.equal(c.creditLanTao, 15); assert.equal(c.creditDungThang, 0);
  await chay("tao", { ket_qua: "xong", ghi_chu: "", credit_con_lai: null, credit_lan_tao: null });
  c = (await flow.trangThai()).taiKhoan.find((x) => x.id === "phu").credit;
  assert.equal(c.luotTaoThang, 1); assert.equal(c.creditDungThang, 15); assert.equal(c.conLai, 985, "không đọc lại được thì trừ dần");
  const prompt = viec[0].argv[viec[0].argv.indexOf("-p") + 1];
  assert.match(prompt, /SỐ BẢN TẠO = 1/); assert.match(prompt, /credit_lan_tao/);
});

test("xem media qua ctl: chỉ file trong media/ của workspace đã đăng ký, có Range để tua video", async (t) => {
  // Không dùng tmp(t): phải đóng ctl (sổ SQLite đang mở) TRƯỚC khi xoá thư mục, không thì Windows báo EPERM.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-mq-")), root = duAn(path.join(d, "phim"));
  ghi(path.join(root, "media", "quay", "C01-t1.mp4"), "0123456789");
  ghi(path.join(root, "bi-mat.txt"), "khong");
  const { createCtl } = require("../ctl/main");
  const ctl = createCtl({ dir: path.join(d, "data") });
  t.after(async () => { await ctl.close(); fs.rmSync(d, { recursive: true, force: true }); });
  ctl.ws.add(root);
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  const port = ctl.server.address().port;
  const goi = (p, headers = {}) => new Promise((ok, bad) => {
    http.get({ host: "127.0.0.1", port, path: p, headers: { host: "127.0.0.1:" + port, authorization: "Bearer " + ctl.token, ...headers } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok({ status: res.statusCode, body: b, headers: res.headers }));
    }).on("error", bad);
  });
  const q = (rel) => "/phim/media?workspace=" + encodeURIComponent(root) + "&path=" + encodeURIComponent(rel);
  let r = await goi(q("media/quay/C01-t1.mp4"));
  assert.equal(r.status, 200); assert.equal(r.body, "0123456789"); assert.equal(r.headers["content-type"], "video/mp4");
  r = await goi(q("media/quay/C01-t1.mp4"), { range: "bytes=2-5" });
  assert.equal(r.status, 206); assert.equal(r.body, "2345"); assert.equal(r.headers["content-range"], "bytes 2-5/10");
  assert.equal((await goi(q("bi-mat.txt"))).status, 403);
  assert.equal((await goi(q("media/../bi-mat.txt"))).status, 403);
  assert.equal((await goi("/phim/media?workspace=" + encodeURIComponent(d) + "&path=media/quay/C01-t1.mp4")).status, 403, "workspace chưa đăng ký");
  const ds = JSON.parse((await goi("/phim/du-an")).body).duAn;
  assert.deepEqual(ds.map((x) => x.ten), ["phim"]);
});
