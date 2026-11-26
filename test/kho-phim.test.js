// Kho phim (CEO yêu cầu 26/11/2026): tạo phim bằng tên, lưu chung một thư mục tách khỏi dự án code, có git cục bộ, tự đăng ký workspace.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { thuMucTu } = require("../ctl/kho-phim");

const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-kho-phim-"));
const kho = path.join(d, "XuongPhim");
let ctl;
test.before(() => { ctl = createCtl({ dir: path.join(d, "data"), khoPhimDir: kho }); });
test.after(async () => { await ctl.close(); fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test("tên thư mục bỏ dấu tiếng Việt", () => {
  assert.equal(thuMucTu("Tín hiệu trở về"), "tin-hieu-tro-ve");
  assert.equal(thuMucTu("  Đêm   Hà Nội!! "), "dem-ha-noi");
});

test("tạo phim: thư mục trong kho, khuôn hồ sơ, tên trong phim.json, git cục bộ không remote, đã đăng ký", () => {
  const p = ctl.khoPhim.tao({ ten: "Tín hiệu trở về", yTuong: "Robot nhỏ tìm đường về nhà." });
  assert.equal(p.path, fs.realpathSync(path.join(kho, "tin-hieu-tro-ve")));
  assert.equal(p.ten, "Tín hiệu trở về");
  for (const f of ["phim.json", "kich-ban.md", "PHIM.md", ".gitignore", "y-tuong.md"]) assert.ok(fs.existsSync(path.join(p.path, f)), f);
  assert.ok(fs.statSync(path.join(p.path, "media", "giong")).isDirectory());
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.path, "phim.json"), "utf8")).ten, "Tín hiệu trở về");
  assert.match(fs.readFileSync(path.join(p.path, "y-tuong.md"), "utf8"), /Robot nhỏ/);
  const g = (...a) => execFileSync("git", a, { cwd: p.path, encoding: "utf8" }).trim();
  assert.equal(g("remote"), "", "không có remote: phim không đẩy lên GitHub");
  assert.match(g("log", "--oneline"), /tạo phim Tín hiệu trở về/);
  assert.ok(ctl.ws.list().some((w) => w.path === p.path), "đã đăng ký workspace");
  const ds = ctl.khoPhim.list();
  assert.deepEqual(ds.map((x) => [x.ten, x.trongKho]), [["Tín hiệu trở về", true]]);
});

test("trùng tên (không phân biệt hoa thường) hoặc trùng thư mục thì báo CONFLICT, không ghi đè", () => {
  assert.throws(() => ctl.khoPhim.tao({ ten: "tín hiệu TRỞ VỀ" }), (e) => e.code === "CONFLICT");
  assert.throws(() => ctl.khoPhim.tao({ ten: "Tin hieu tro ve" }), (e) => e.code === "CONFLICT");
  assert.equal(JSON.parse(fs.readFileSync(path.join(kho, "tin-hieu-tro-ve", "phim.json"), "utf8")).ten, "Tín hiệu trở về");
});

test("tên rỗng, quá dài, chỉ có ký hiệu thì BAD_REQUEST", () => {
  for (const ten of ["", "   ", "x".repeat(81), "!!!"]) assert.throws(() => ctl.khoPhim.tao({ ten }), (e) => e.code === "BAD_REQUEST", JSON.stringify(ten));
});

test("phim chép tay vào kho được nhận và đăng ký; phim cũ ngoài kho vẫn hiện, ghi ngoài kho", () => {
  const tay = path.join(kho, "phim-chep-tay");
  fs.mkdirSync(tay); fs.writeFileSync(path.join(tay, "phim.json"), JSON.stringify({ ten: "Phim chép tay", canh: [] }));
  const ngoai = path.join(d, "Projects", "phim-cu"); fs.mkdirSync(ngoai, { recursive: true });
  fs.writeFileSync(path.join(ngoai, "phim.json"), JSON.stringify({ ten: "", canh: [] }));
  ctl.ws.add(ngoai);
  const ds = ctl.khoPhim.list();
  assert.deepEqual(ds.map((x) => [x.ten, x.trongKho]).sort(), [["Phim chép tay", true], ["Tín hiệu trở về", true], ["phim-cu", false]].sort());
  assert.ok(ctl.ws.list().some((w) => w.path === fs.realpathSync(tay)));
});

test("route: POST /phim/kho trả 201, GET /phim/du-an trả kho và danh sách", async () => {
  const http = require("node:http");
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  const port = ctl.server.address().port;
  const goi = (method, p, body) => new Promise((ok, bad) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { host: "127.0.0.1:" + port, authorization: "Bearer " + ctl.token, "content-type": "application/json" } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok({ status: res.statusCode, body: JSON.parse(b || "{}") }));
    });
    req.on("error", bad); if (data) req.write(data); req.end();
  });
  const r = await goi("POST", "/phim/kho", { ten: "Đêm Hà Nội" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.phim.thuMuc, "dem-ha-noi");
  assert.equal((await goi("POST", "/phim/kho", { ten: "Đêm Hà Nội" })).status, 409);
  assert.equal((await goi("POST", "/phim/kho", { ten: "" })).status, 400);
  const ds = await goi("GET", "/phim/du-an");
  assert.equal(ds.body.kho, kho);
  assert.ok(ds.body.duAn.some((x) => x.ten === "Đêm Hà Nội" && x.trongKho));
});
