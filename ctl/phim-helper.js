"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { congDaDuyet, docFileTrongPhim } = require("../lib/phim");
const tep = require("./phim-tai-lieu");

const run = promisify(execFile);
const GOC = [
  ["chinh-dien", "Chính diện", "Chân dung chính diện, mắt nhìn thẳng, ánh sáng đều."],
  ["ba-tu-trai", "3/4 trái", "Chân dung góc ba phần tư, đầu hướng trái khoảng 45 độ."],
  ["ba-tu-phai", "3/4 phải", "Chân dung góc ba phần tư, đầu hướng phải khoảng 45 độ."],
  ["nghieng", "Nghiêng 90°", "Chân dung nghiêng đúng 90 độ, thấy rõ đường viền mặt."],
  ["toan-than", "Toàn thân", "Toàn thân từ đầu tới chân, giữ nguyên trang phục, không cắt tay chân."],
  ["bieu-cam", "4 biểu cảm", "Một bảng 2 × 2 gồm vui, ngạc nhiên, tập trung và xúc động. Cùng nhân vật ở cả bốn ô, không chữ."],
];
const MO_TA = new Map(GOC.map(([id, , prompt]) => [id, prompt]));
const err = (code, message) => Object.assign(Error(message), { code });
const maNhanVat = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PHONG_CACH = ["Điện ảnh thực tế", "3D cách điệu", "Anime", "Đời thường"];

function nhanVat(phim, ma) {
  if (typeof ma !== "string" || !maNhanVat.test(ma)) throw err("BAD_REQUEST", "Mã nhân vật gồm chữ thường, số và gạch ngang.");
  const v = (phim.nhan_vat || []).find((n) => n.ma === ma);
  if (!v) throw err("NOT_FOUND", "Không tìm thấy nhân vật.");
  if ((phim.nguoi_that || []).some((n) => n.ma === ma && n.dong_y !== true)) throw err("CHUA_DU_DIEU_KIEN", "Cần xác nhận đồng ý dùng hình người thật.");
  return v;
}

function anh(root, id) {
  const { item, bytes } = tep.fileXacThuc(root, id);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const hopLe = { ".png": png, ".jpg": jpg, ".jpeg": jpg, ".webp": webp };
  if (!hopLe[path.extname(item.ten).toLowerCase()]) throw err("BAD_REQUEST", "Cần ảnh PNG, JPEG hoặc WebP hợp lệ.");
  return item;
}

const boCua = (phim, ma) => (phim.ai_helper || []).find((v) => v.ma === ma);
function giuCongHai(phim) {
  if (congDaDuyet(phim, 2)) throw err("CHUA_DU_DIEU_KIEN", "Bỏ duyệt Cổng 2 trước khi đổi phương án hình ảnh.");
}
function ghiBo(phim, ma) {
  giuCongHai(phim);
  nhanVat(phim, ma);
  phim.ai_helper ||= [];
  let bo = boCua(phim, ma);
  if (!bo) { bo = { ma, nguon: [], goc: {} }; phim.ai_helper.push(bo); }
  return bo;
}

function taoNhanVat(root, { ma, ten, moTa = "", phongCach = "", anhSang = "", nguoiThat = false, dongY = false }) {
  if (typeof ma !== "string" || !maNhanVat.test(ma) || typeof ten !== "string" || !ten.trim() || ten.length > 80
      || typeof moTa !== "string" || moTa.length > 600) throw err("BAD_REQUEST", "Nhập mã, tên và mô tả nhân vật hợp lệ.");
  if (typeof phongCach !== "string" || (phongCach && !PHONG_CACH.includes(phongCach)) || typeof anhSang !== "string" || anhSang.length > 120 ||
      typeof nguoiThat !== "boolean" || typeof dongY !== "boolean" || (nguoiThat && !dongY)) {
    throw err("BAD_REQUEST", "Kiểm tra phong cách và xác nhận đồng ý nếu dùng hình người thật.");
  }
  return tep.suaHoSo(root, (p) => {
    if (congDaDuyet(p, 1)) throw err("CHUA_DU_DIEU_KIEN", "Thêm nhân vật trước khi duyệt Cổng 1.");
    p.nhan_vat ||= [];
    if (p.nhan_vat.some((n) => n.ma === ma)) throw err("CONFLICT", "Đã có mã nhân vật này.");
    if (nguoiThat) {
      p.nguoi_that ||= [];
      if (p.nguoi_that.some((n) => n.ma === ma)) throw err("CONFLICT", "Đã có thông tin quyền dùng hình cho mã này.");
      p.nguoi_that.push({ ma, dong_y: true });
    }
    const row = { ma, ten: ten.trim(), mo_ta: moTa.trim(), tham_chieu: [], phong_cach: phongCach, anh_sang: anhSang.trim() };
    p.nhan_vat.push(row);
    return row;
  });
}

function chonNguon(root, { ma, ids }) {
  if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length) throw err("BAD_REQUEST", "Chọn tối đa 3 ảnh tham chiếu khác nhau.");
  return tep.suaHoSo(root, (p) => {
    const bo = ghiBo(p, ma);
    ids.forEach((id) => anh(root, id));
    bo.nguon = ids;
    return bo;
  });
}

function goc(root, { ma, id, slot }) {
  if (!MO_TA.has(slot)) throw err("BAD_REQUEST", "Góc ảnh không hợp lệ.");
  return tep.suaHoSo(root, (p) => {
    const bo = ghiBo(p, ma);
    if (bo.goc[slot]?.khoa) throw err("CONFLICT", "Mở khóa góc này trước khi thay ảnh.");
    anh(root, id);
    bo.goc[slot] = { id, khoa: false };
    return bo;
  });
}

function khoa(root, { ma, slot, duyet }) {
  if (!MO_TA.has(slot) || typeof duyet !== "boolean") throw err("BAD_REQUEST", "Thiếu góc hoặc trạng thái duyệt.");
  return tep.suaHoSo(root, (p) => {
    const bo = ghiBo(p, ma);
    const row = bo.goc[slot];
    if (!row) throw err("NOT_FOUND", "Góc này chưa có ảnh để duyệt.");
    anh(root, row.id);
    row.khoa = duyet;
    return bo;
  });
}

function apDung(root, { ma, ids, xacNhan }) {
  return tep.suaHoSo(root, (p) => {
    const v = nhanVat(p, ma);
    giuCongHai(p);
    const slots = boCua(p, ma)?.goc || {};
    const locked = GOC.map(([id]) => slots[id]).filter((slot) => slot?.khoa).map((slot) => slot.id);
    if (!locked.length) throw err("CHUA_DU_DIEU_KIEN", "Duyệt ít nhất một góc trước khi dùng cho nhân vật.");
    if (!Array.isArray(ids) || JSON.stringify(ids) !== JSON.stringify(locked)) throw err("CHANGED", "Bộ góc đã đổi. Tải lại và kiểm tra trước khi dùng.");
    const images = locked.map((id) => anh(root, id).path);
    if (v.tham_chieu?.length && xacNhan !== true) throw err("CONFLICT", "Xác nhận trước khi thay ảnh tham chiếu dùng cho phim.");
    v.tham_chieu = [...new Set(images)];
    return v;
  });
}

function yeuCau(root, { ma, slot }, { tao = false } = {}) {
  if (!MO_TA.has(slot)) throw err("BAD_REQUEST", "Góc ảnh không hợp lệ.");
  const { phim } = tep.hoSo(root);
  const v = nhanVat(phim, ma);
  if (tao) giuCongHai(phim);
  const bo = boCua(phim, ma);
  const source = (bo?.nguon || []).map((id) => anh(root, id));
  if (tao && bo?.goc[slot]?.khoa) throw err("CONFLICT", "Mở khóa góc này trước khi tạo ảnh khác.");
  const prompt = [
    "Ảnh thiết kế nhân vật cho phim. " + MO_TA.get(slot),
    "Giữ nguyên mặt, màu sắc và trang phục theo ảnh tham chiếu nếu có. Nền trơn, không logo.",
    ("Nhân vật " + v.ten + ". " + (v.mo_ta || "")).slice(0, 700),
    v.phong_cach && "Phong cách: " + v.phong_cach + ".",
    v.anh_sang && "Ánh sáng: " + v.anh_sang + "."
  ].filter(Boolean).join(" ");
  return { prompt, source, v };
}

function khung(root, { canh, id, lamNen = false }) {
  if (typeof lamNen !== "boolean" || typeof canh !== "string") throw err("BAD_REQUEST", "Thiếu cảnh hoặc loại ảnh.");
  return tep.suaHoSo(root, (p) => {
    giuCongHai(p);
    const c = (p.canh || []).find((x) => x.ma === canh);
    if (!c) throw err("NOT_FOUND", "Không tìm thấy cảnh.");
    const image = anh(root, id);
    if (lamNen) c.helper_boi_canh = image.path;
    else c.khung = [...new Set([...(c.khung || []), image.path])];
    return c;
  });
}

function tongMau(root, { moTa }) {
  if (typeof moTa !== "string" || moTa.length > 240) throw err("BAD_REQUEST", "Tông màu tối đa 240 ký tự.");
  return tep.suaHoSo(root, (p) => {
    giuCongHai(p);
    p.helper_tong_mau = moTa.trim();
    return p.helper_tong_mau;
  });
}

async function tachKhung(root, { ma, id }, { ffmpeg, ffprobe, tmp }) {
  const { phim } = tep.hoSo(root);
  giuCongHai(phim);
  nhanVat(phim, ma);
  if (!ffmpeg || !ffprobe) throw err("THIEU_FFMPEG", "Cần FFmpeg và FFprobe để lấy khung từ clip.");
  const source = tep.fileXacThuc(root, id);
  const before = JSON.stringify(boCua(phim, ma)?.nguon || []);
  if (path.extname(source.item.ten).toLowerCase() !== ".mp4") throw err("BAD_REQUEST", "Chọn clip MP4.");
  if (tep.list(root).length > 24) throw err("BAD_REQUEST", "Cần 6 chỗ trống trong danh sách tệp đính kèm.");
  await fs.promises.mkdir(tmp, { recursive: true });
  const folder = await fs.promises.mkdtemp(path.join(tmp, "helper-"));
  try {
    const sourceFile = path.join(folder, "nguon.mp4");
    await fs.promises.writeFile(sourceFile, source.bytes, { flag: "wx" });
    const opts = { windowsHide: true, timeout: 15000 };
    const { stdout } = await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", sourceFile], opts);
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration < 1) throw err("BAD_REQUEST", "Clip cần có luồng hình dài từ một giây.");
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const f = path.join(folder, `khung-${i + 1}.jpg`);
      await run(ffmpeg, ["-v", "error", "-nostdin", "-ss", (duration * (i + 0.5) / 6).toFixed(3), "-i", sourceFile,
        "-vf", "scale=960:960:force_original_aspect_ratio=decrease", "-frames:v", "1", "-q:v", "3", "-n", f], opts);
      frames.push(await fs.promises.readFile(f));
    }
    const now = tep.hoSo(root).phim;
    giuCongHai(now);
    nhanVat(now, ma);
    if (JSON.stringify(boCua(now, ma)?.nguon || []) !== before) throw err("CHANGED", "Đã đổi nguồn trong lúc tách khung.");
    const ids = frames.map((buf, i) => tep.save(root, { name: `${ma}-${source.item.sha256.slice(0, 8)}-khung-${i + 1}.jpg`, base64: buf.toString("base64") }).id);
    return ids;
  } finally {
    await fs.promises.rm(folder, { recursive: true, force: true, maxRetries: 3 });
  }
}

function suaCanh(root, { ma, tacVu, loiDan, khungHinh, gocMay, giay, nhanVat: dsNhanVat }) {
  return tep.suaHoSo(root, (p) => {
    if (congDaDuyet(p, 1)) throw err("CHUA_DU_DIEU_KIEN", "Bỏ duyệt Cổng 1 trước khi sửa phân cảnh.");
    const ghiLaiThuTu = (canh) => {
      p.helper_giong_theo_canh = true;
      for (const [i, c] of p.canh.entries()) c.cau = [i + 1];
      return canh;
    };
    const scene = p.canh.findIndex((c) => c.ma === ma);
    if (tacVu === "them") {
      const next = Math.max(0, ...p.canh.map((c) => Number(c.ma.slice(1)) || 0)) + 1;
      if (p.canh.length >= 60 || next > 999) throw err("BAD_REQUEST", "Phim đã đủ số cảnh.");
      const c = { ma: "C" + String(next).padStart(2, "0"), loi_dan: "", khung_hinh: "", giay: 5, nhan_vat: [], trang_thai: "viet" };
      p.canh.push(c);
      return ghiLaiThuTu(c);
    }
    if (scene < 0) throw err("NOT_FOUND", "Không tìm thấy cảnh.");
    const c = p.canh[scene];
    if (tacVu === "xoa") {
      if (c.khung?.length || c.take?.length || c.khung_chon || c.helper_audio) throw err("CONFLICT", "Cảnh đã có tài sản; giữ lại hồ sơ cảnh này.");
      return ghiLaiThuTu(p.canh.splice(scene, 1)[0]);
    }
    if (tacVu === "len" || tacVu === "xuong") {
      const neighbor = scene + (tacVu === "len" ? -1 : 1);
      if (neighbor >= 0 && neighbor < p.canh.length) [p.canh[scene], p.canh[neighbor]] = [p.canh[neighbor], p.canh[scene]];
      return ghiLaiThuTu(c);
    }
    if (tacVu !== "luu" || typeof loiDan !== "string" || loiDan.length > 1400 || typeof khungHinh !== "string" || khungHinh.length > 2000 ||
        typeof gocMay !== "string" || gocMay.length > 200 || !Number.isFinite(giay) || giay < 1 || giay > 60 ||
        !Array.isArray(dsNhanVat) || dsNhanVat.length > 12) throw err("BAD_REQUEST", "Kiểm tra mô tả, nhân vật và số giây của cảnh.");
    dsNhanVat.forEach((id) => nhanVat(p, id));
    Object.assign(c, { loi_dan: loiDan.trim(), khung_hinh: khungHinh.trim(), goc_may: gocMay.trim(), giay, nhan_vat: [...new Set(dsNhanVat)] });
    return ghiLaiThuTu(c);
  });
}

async function giongThu(root, { canh, id, giay }, probe) {
  const source = id ? tep.fileXacThuc(root, id) : null;
  if (source) {
    if (!probe || !/\.(mp3|wav|webm)$/i.test(source.item.ten)) throw err("BAD_REQUEST", "Chọn tệp MP3, WAV hoặc bản ghi WebM.");
    try {
      const { stdout } = await run(probe, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", source.real], { timeout: 10000, windowsHide: true });
      if (stdout.trim() !== "audio") throw Error();
    } catch { throw err("BAD_REQUEST", "Không đọc được luồng giọng thử."); }
  }
  if (!Number.isFinite(giay) || giay < 1 || giay > 60) throw err("BAD_REQUEST", "Thời lượng thử từ 1 đến 60 giây.");
  return tep.suaHoSo(root, (p) => {
    const c = p.canh.find((x) => x.ma === canh);
    if (!c) throw err("NOT_FOUND", "Không tìm thấy cảnh.");
    c.helper_giay = giay;
    if (source) c.helper_audio = source.item.path;
    return c;
  });
}

async function dongGoi(root, python, tmp) {
  if (!python || !fs.existsSync(python)) throw err("NOT_SUPPORTED", "Cần Python của Xưởng phim để đóng gói ZIP.");
  const { phim } = tep.hoSo(root);
  const entries = [];
  function them(rel, alias) {
    const ext = path.extname(rel).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".mp3", ".wav", ".webm"].includes(ext)) throw err("BAD_REQUEST", "Định dạng tài sản trong gói không hợp lệ.");
    const dest = alias + ext;
    entries.push({ source: docFileTrongPhim(root, rel), dest });
    return dest;
  }
  const dsNhanVat = (phim.nhan_vat || []).map((v) => {
    nhanVat(phim, v.ma);
    const slots = boCua(phim, v.ma)?.goc || {};
    const daKhoa = GOC.filter(([code]) => slots[code]?.khoa).map(([code]) => them(anh(root, slots[code].id).path, `media/tham-chieu/${v.ma}/${code}`));
    return { ma: v.ma, ten: v.ten, mo_ta: v.mo_ta, tham_chieu: daKhoa };
  });
  const canh = (phim.canh || []).map((c) => {
    if (!/^C\d{2,3}$/.test(c.ma)) throw err("BAD_REQUEST", "Mã cảnh sai định dạng.");
    const row = { ma: c.ma, loi_dan: c.loi_dan, khung_hinh: c.khung_hinh, goc_may: c.goc_may, nhan_vat: c.nhan_vat, cau: c.cau,
      giay: c.giay, may_quay: c.may_quay, trang_thai: "viet", take: [] };
    if (c.khung_chon) { row.khung_chon = them(c.khung_chon, "media/khung/" + c.ma); row.khung = [row.khung_chon]; }
    if (c.helper_audio) row.helper_audio = them(c.helper_audio, "media/helper/" + c.ma + "-giong");
    if (c.helper_giay) row.helper_giay = c.helper_giay;
    return row;
  });
  if (entries.reduce((sum, item) => sum + fs.statSync(item.source).size, 0) > 128 * 1024 * 1024) {
    throw err("BAD_REQUEST", "Gói tài sản vượt 128 MiB.");
  }
  await fs.promises.mkdir(tmp, { recursive: true });
  const folder = await fs.promises.mkdtemp(path.join(tmp, "helper-pack-"));
  try {
    const hoSo = { ten: phim.ten, ngon_ngu: phim.ngon_ngu, ti_le: phim.ti_le, ngan_sach_usd: phim.ngan_sach_usd,
      helper_giong_theo_canh: phim.helper_giong_theo_canh,
      may_quay_mac_dinh: phim.may_quay_mac_dinh, nhan_vat: dsNhanVat, canh, nguoi_that: phim.nguoi_that?.map(({ ma, dong_y }) => ({ ma, dong_y })) };
    const spec = path.join(folder, "pack.json"), zip = path.join(folder, "phim.zip");
    await fs.promises.writeFile(spec, JSON.stringify({ entries, hoSo }), { flag: "wx" });
    await run(python, [path.join(__dirname, "..", "tools", "xuong-phim", "helper_pack.py"), spec, zip], { windowsHide: true, timeout: 90000 });
    const output = tep.directory(root, true, "helper");
    const dir = await fs.promises.mkdtemp(path.join(output, "goi-"));
    await fs.promises.copyFile(zip, path.join(dir, "phim.zip"), fs.constants.COPYFILE_EXCL);
    return { path: "media/helper/" + path.basename(dir) + "/phim.zip", soTep: entries.length };
  } finally { await fs.promises.rm(folder, { recursive: true, force: true, maxRetries: 3 }); }
}

module.exports = { GOC, PHONG_CACH, taoNhanVat, chonNguon, goc, khoa, apDung, yeuCau, khung, tongMau, tachKhung, suaCanh, giongThu, dongGoi };
