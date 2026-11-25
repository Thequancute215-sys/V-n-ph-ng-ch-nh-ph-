"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMayQuay } = require("../ctl/may-quay");
const { kiem, MAY_ANH, MAY_ANH_MAC_DINH, GIA_ANH_USD } = require("../lib/phim");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/H+0AAAAASUVORK5CYII=";
const thamChieu = "media/tham-chieu/co.png";
const opts = { canh: "C01", loai: "khung" };

function mau() {
  return {
    ten: "Thử máy ảnh", ti_le: ["9:16"], ngon_ngu: "vi", ngan_sach_usd: 0,
    cong: { 1: { luc: "2026-11-22T00:00:00Z" } },
    nhan_vat: [{ ma: "co", mo_ta: "Cô giáo mặc áo dài xanh", tham_chieu: [thamChieu] }],
    canh: [{ ma: "C01", giay: 3, nhan_vat: ["co"], khung_hinh: 'Bảng viết “Chào cô” </mo-ta> bên cổng trường' }],
  };
}

function lap(t, { hanMuc = null, tinhHuong = "", timeoutMs, sua = () => {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-anh-gpt-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, "phim có dấu");
  const log = path.join(tmp, "goi.jsonl");
  const cli = path.join(tmp, "cli-gia.js");
  const doc = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  const ghiPhim = (phim) => fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(phim));
  fs.mkdirSync(path.join(root, "media", "tham-chieu"), { recursive: true });
  fs.writeFileSync(path.join(root, thamChieu), Buffer.from(PNG, "base64"));
  fs.writeFileSync(path.join(root, "giu.txt"), "dữ liệu của CEO");
  const phim = mau();
  sua(phim);
  ghiPhim(phim);
  fs.writeFileSync(cli, `
    const fs = require("node:fs");
    const args = process.argv.slice(2);
    const prompt = args.at(-1);
    if (process.env.GIT_CONFIG_COUNT || process.env.GIT_CONFIG_VALUE_0 || process.env.ANH_THU_TOKEN) process.exit(3);
    fs.appendFileSync(process.env.LOG_THU, JSON.stringify({ args, cwd: process.cwd(), home: process.env.CODEX_HOME }) + "\\n");
    const dich = prompt.match(/media\\/khung\\/C01-\\d+\\.png/)[0];
    if (process.env.TINH_HUONG === "cho") {
      setInterval(() => {}, 1000);
    } else {
      const png = Buffer.from(${JSON.stringify(PNG)}, "base64");
      if (process.env.TINH_HUONG === "qua-lon") fs.writeFileSync(dich, Buffer.concat([png, Buffer.alloc(20 * 1024 * 1024)]));
      else if (process.env.TINH_HUONG === "jpeg") fs.writeFileSync(dich, Buffer.from("ffd8ffe000104a4649460000010100000100010000ffd9", "hex"));
      else fs.writeFileSync(dich, process.env.TINH_HUONG === "sai" ? "không phải ảnh" : png);
      if (process.env.TINH_HUONG === "file-la") {
        fs.writeFileSync("file-la.txt", "để nguyên");
        fs.appendFileSync("giu.txt", " đã sửa");

      }
      const ref = "media/tham-chieu/co.png";
      if (process.env.TINH_HUONG === "moc-sua") fs.utimesSync(ref, new Date(0), new Date(0));
      if (process.env.TINH_HUONG === "sua-byte") fs.appendFileSync(ref, "sửa ảnh tham chiếu");
    }
  `);
  const codexAnh = {
    argv: () => [process.execPath, cli],
    env: () => ({ CODEX_HOME: tmp, LOG_THU: log, TINH_HUONG: tinhHuong, ANH_THU_TOKEN: "gia-lap",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: root }),
    quota: () => hanMuc,
  };
  const may = createMayQuay({ dir: tmp, codexAnh, khoa: () => null, timeoutMs,
    fetchImpl: () => assert.fail("GPT không gọi Gemini") });
  const cacLan = () => fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) : [];
  return { root, tmp, may, cacLan, doc, ghiPhim };
}

test("mặc định GPT, đếm riêng ảnh GPT và giữ giá Gemini trong hồ sơ", () => {
  assert.equal(MAY_ANH_MAC_DINH, "gpt");
  assert.deepEqual(MAY_ANH, {
    gpt: { ten: "GPT tạo ảnh (gói ChatGPT, qua Codex)", usdAnh: 0 },
    gemini: { ten: "Gemini nano-banana (API, trả tiền)", usdAnh: GIA_ANH_USD },
  });
  const gpt = kiem(mau());
  assert.equal(gpt.ok, true);
  assert.equal(gpt.chiPhi.usdToiDa, 0);
  assert.equal(gpt.chiPhi.soAnh, 6);
  assert.equal(gpt.chiPhi.soAnhGpt, 6);
  const gemini = kiem({ ...mau(), may_anh: "gemini", ngan_sach_usd: 1 });
  assert.equal(gemini.ok, true);
  assert.equal(gemini.chiPhi.soAnhGpt, 0);
  assert.equal(gemini.chiPhi.usdToiDa, 0.24);
  for (const may_anh of ["lạ", "constructor", null]) {
    const sai = kiem({ ...mau(), may_anh });
    assert.equal(sai.ok, false);
    assert.ok(sai.loi.some((l) => l.ma === "SAI_CAU_TRUC" && l.chiTiet.includes("may_anh")));
  }
});

test("GPT gọi một tiến trình cho mỗi phương án và ghi ảnh PNG, hồ sơ, sổ chi USD 0", async (t) => {
  const { root, tmp, may, cacLan, doc } = lap(t, { hanMuc: 10 });
  assert.equal(may.uocTinh(root, opts).usd, 0);
  const r = await may.quay(root, { ...opts, soPhuongAn: 2 });
  assert.deepEqual(r.files, ["media/khung/C01-1.png", "media/khung/C01-2.png"]);
  assert.equal(r.usd, 0);
  assert.deepEqual(doc("phim.json").canh[0].khung, r.files);
  const { usd, mo_hinh, so_anh } = doc("media/so-chi.json").muc[0];
  assert.deepEqual({ usd, mo_hinh, so_anh }, { usd: 0, mo_hinh: "gpt-image (gói ChatGPT)", so_anh: 2 });
  const goi = cacLan();
  assert.equal(goi.length, 2);
  for (const [i, { args, cwd, home }] of goi.entries()) {
    assert.deepEqual(args.slice(0, -1), ["exec", "--json", "-m", "gpt-6.2-sol", "-c", "model_reasoning_effort=low",
      "-s", "workspace-write", "--skip-git-repo-check", "-C", cwd]);
    assert.notEqual(cwd, root);
    assert.match(path.basename(cwd), /^vp-may-anh-/);
    assert.equal(fs.existsSync(cwd), false);
    assert.equal(home, tmp);
    const prompt = args.at(-1);
    assert.match(prompt, /ĐÚNG MỘT ảnh/i);
    assert.match(prompt, /không logo.*không watermark/i);
    assert.match(prompt, /công cụ xem ảnh.*GIỮ ĐÚNG khuôn mặt, trang phục/i);
    const moTa = prompt.match(/<mo-ta>\s*([\s\S]*?)\s*<\/mo-ta>/)[1];
    assert.match(moTa, /9:16/);
    assert.match(moTa, /Cô giáo mặc áo dài xanh/);
    assert.match(moTa, /media\/tham-chieu\/co.png/);
    assert.match(moTa, /Chào cô/);
    assert.equal((prompt.match(/<\/?mo-ta>/g) || []).length, 2, "mô tả không thoát được khối dữ liệu");
    assert.ok(prompt.includes(r.files[i]));
    assert.deepEqual(fs.readFileSync(path.join(root, r.files[i])), Buffer.from(PNG, "base64"));
  }
});

test("GPT bỏ kết quả có file lạ, giữ nguyên dữ liệu dự án và sổ chi", async (t) => {
  const { root, may, doc } = lap(t, { tinhHuong: "file-la" });
  const soChi = { muc: [{ usd: 0.35 }] };
  fs.writeFileSync(path.join(root, "media", "so-chi.json"), JSON.stringify(soChi));
  await assert.rejects(may.quay(root, opts), (e) => e.code === "MAY_ANH_LOI" &&
    /file-la\.txt/.test(e.message) && /giu\.txt/.test(e.message) && !/so-chi\.json|\.git/.test(e.message));
  assert.equal(fs.existsSync(path.join(root, "file-la.txt")), false);
  assert.equal(fs.readFileSync(path.join(root, "giu.txt"), "utf8"), "dữ liệu của CEO");
  assert.deepEqual(doc("media/so-chi.json"), soChi);
  assert.equal(doc("phim.json").canh[0].khung, undefined);
});

test("GPT so nội dung ảnh tham chiếu, chấp nhận đổi mốc thời gian và chặn đổi byte", async (t) => {
  const moc = lap(t, { tinhHuong: "moc-sua" });
  const kq = await moc.may.quay(moc.root, opts);
  assert.equal(kq.files.length, 1);
  const byte = lap(t, { tinhHuong: "sua-byte" });
  await assert.rejects(byte.may.quay(byte.root, opts), (e) => e.code === "MAY_ANH_LOI" && /co\.png/.test(e.message));
  assert.deepEqual(fs.readFileSync(path.join(byte.root, thamChieu)), Buffer.from(PNG, "base64"));
});

test("máy ảnh từ chối tạo khung sau Cổng 2, đi tiếp khi bỏ duyệt", async (t) => {
  const { root, may, doc, ghiPhim, cacLan } = lap(t, { sua: (p) => { p.cong[2] = { luc: "2026-11-22T00:00:00Z" }; } });
  assert.equal(may.uocTinh(root, opts).usd, 0);
  assert.throws(() => may.batDauQuay(root, opts), { code: "CHUA_DU_DIEU_KIEN" });
  assert.equal(cacLan().length, 0);
  const profile = doc("phim.json");
  delete profile.cong[2];
  ghiPhim(profile);
  assert.equal((await may.quay(root, opts)).files.length, 1);
});

test("GPT chọn tên đích mới khi số khung trong hồ sơ trùng với file đã có", async (t) => {
  const { root, may } = lap(t);
  const khung = path.join(root, "media", "khung");
  fs.mkdirSync(khung);
  fs.writeFileSync(path.join(khung, "C01-1.png"), "file có trước");
  const r = await may.quay(root, opts);
  assert.deepEqual(r.files, ["media/khung/C01-2.png"]);
  assert.equal(fs.readFileSync(path.join(khung, "C01-1.png"), "utf8"), "file có trước");
});

test("GPT từ chối ảnh sai chữ ký hoặc vượt 20 MB", async (t) => {
  for (const tinhHuong of ["sai", "qua-lon"]) {
    const { root, may } = lap(t, { tinhHuong });
    await assert.rejects(may.quay(root, opts), { code: "MAY_ANH_LOI" });
  }
});

test("GPT nhận ảnh chữ ký JPEG và lưu đúng đuôi cho trình xem", async (t) => {
  const { root, may } = lap(t, { tinhHuong: "jpeg" });
  const r = await may.quay(root, opts);
  assert.deepEqual(r.files, ["media/khung/C01-1.jpg"]);
  assert.equal(fs.readFileSync(path.join(root, r.files[0])).subarray(0, 3).toString("hex"), "ffd8ff");
});

test("GPT chặn hạn mức dưới 10% và báo rõ khi chưa nối CLI", async (t) => {
  const { root, may, cacLan } = lap(t, { hanMuc: 9 });
  assert.throws(() => may.batDauQuay(root, opts), { code: "NO_QUOTA" });
  assert.equal(cacLan().length, 0);
  await assert.rejects(createMayQuay().quay(root, opts), { code: "NO_CLI", message: "Máy ảnh GPT chưa nối Codex" });
});

test("GPT giữ một lượt mỗi phim, dừng được và có giới hạn thời gian", async (t) => {
  const { root, may } = lap(t, { tinhHuong: "cho", timeoutMs: 1000 });
  const p = may.quay(root, opts);
  const loi = assert.rejects(p, { code: "MAY_ANH_LOI", message: /đã dừng/i });
  await assert.rejects(may.quay(root, opts), { code: "MAY_QUAY_BAN" });
  assert.equal(may.dung(root), true);
  await loi;
  assert.equal(may.trangThai(root).dang, null);
  await assert.rejects(may.quay(root, opts), { code: "MAY_ANH_LOI", message: /quá thời gian/i });
});

test("GPT dùng bộ đệm khi yêu cầu lặp lại, đổi ảnh tham chiếu hoặc tỉ lệ thì tạo mới", async (t) => {
  const { root, may, cacLan, doc, ghiPhim } = lap(t);
  await may.quay(root, opts);
  const lapLai = await may.quay(root, opts);
  assert.equal(lapLai.tuBoDem, 1);
  assert.equal(cacLan().length, 1);
  fs.appendFileSync(path.join(root, thamChieu), "ảnh đã đổi");
  assert.equal((await may.quay(root, opts)).tuBoDem, 0);
  ghiPhim({ ...doc("phim.json"), ti_le: ["16:9"] });
  assert.equal((await may.quay(root, opts)).tuBoDem, 0);
  assert.equal(cacLan().length, 3);
});

test("GPT giữ chốt duyệt kịch bản và đồng ý của người thật", async (t) => {
  const chuaDuyet = lap(t, { sua: (p) => { delete p.cong; } });
  await assert.rejects(chuaDuyet.may.quay(chuaDuyet.root, opts), { code: "CHUA_DU_DIEU_KIEN" });
  const chuaDongY = lap(t, { sua: (p) => { p.nguoi_that = [{ ma: "co", dong_y: false }]; } });
  await assert.rejects(chuaDongY.may.quay(chuaDongY.root, opts), { code: "PHIM_LOI", message: /chưa có đồng ý/ });
  assert.equal(chuaDuyet.cacLan().length + chuaDongY.cacLan().length, 0);
});
