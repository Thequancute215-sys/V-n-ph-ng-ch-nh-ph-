// Hồ sơ phim — hợp đồng duy nhất giữa các phòng của xưởng phim (P1, bản thiết kế "Xưởng Phim AI", CEO duyệt 20/11/2026).
// Mỗi dự án phim có phim.json ở gốc repo. Mỗi phòng chỉ ghi trường của mình:
//   Hinata: ten, ti_le, ngon_ngu, nhan_vat, canh[].loi_dan / khung_hinh / nhan_vat / may_quay / cau;
//   máy (giọng đọc, máy quay): canh[].giay, take, trang_thai; CEO (qua giao diện): ngan_sach_usd, nguoi_that[].dong_y, take_chon.
// Bộ kiểm chặn ba lỗi đắt nhất trước khi tốn tiền quay:
//   1. tổng thời lượng các cảnh lệch giọng đọc quá 0,5 giây (hình sẽ lệch tiếng);
//   2. cảnh dùng người thật mà người đó chưa đồng ý cho dùng hình;
//   3. chi phí tối đa ước tính vượt ngân sách CEO đặt.
// Không thư viện ngoài, không đọc mạng: dùng được ở ctl, ở công cụ dòng lệnh tools/phim.js và trong test.
"use strict";

const LECH_TOI_DA_MS = 500;
const GIA_ANH_USD = 0.04;   // ảnh khung chính / ảnh nhân vật, giá tham khảo 20/11/2026
// Giá tham khảo 20/11/2026 (bản thiết kế, mục 05). "flow" dùng credit gói Google: không tính tiền, đếm số lượt tạo.
const MAY_QUAY = {
  "omni-flash": { ten: "Gemini Omni 1.2 Flash (720p)", usdGiay: 0.07 },
  "kling-3": { ten: "Kling 3.0 (1080p)", usdGiay: 0.14 },
  flow: { ten: "Google Flow (credit gói Google)", usdGiay: 0, luot: true },
  "dung-code": { ten: "Dựng bằng code (Remotion/HyperFrames)", usdGiay: 0, khongQuay: true },
};
// Mặc định quay bằng Google Flow: dùng credit gói Google AI của CEO, không tốn tiền API (CEO chọn 20/11/2026).
const MAY_QUAY_MAC_DINH = "flow";
const TI_LE = ["9:16", "16:9", "1:1"];
const NGON_NGU = ["vi", "en"];
const TRANG_THAI = ["viet", "co_khung", "cho_quay", "da_quay", "da_chon"];
const MA_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MA_CANH_RE = /^C\d{2,3}$/;

const so = (v) => typeof v === "number" && Number.isFinite(v);
const tron = (x) => Math.round(x * 100) / 100;
// Đường dẫn trong hồ sơ: tương đối so với gốc repo, không thoát ra ngoài, không ổ đĩa.
function duongDanHopLe(p) {
  return typeof p === "string" && p.length > 0 && p.length <= 300 && !/^([a-zA-Z]:|[\\/])/.test(p) && !p.split(/[\\/]/).includes("..") && !p.includes("\0");
}

// Tổng thời lượng giọng đọc (ms) từ voice.json của tools/xuong-phim/tts_sync.py.
function tongGiong(giong) {
  if (!Array.isArray(giong) || !giong.length) return null;
  const cuoi = giong[giong.length - 1];
  return so(cuoi && cuoi.endMs) ? cuoi.endMs : null;
}

function kiem(phim, { giong = null } = {}) {
  const loi = [], canhBao = [];
  const L = (ma, chiTiet) => loi.push({ ma, chiTiet });
  const W = (ma, chiTiet) => canhBao.push({ ma, chiTiet });
  if (!phim || typeof phim !== "object" || Array.isArray(phim)) {
    L("SAI_CAU_TRUC", "phim.json phải là một đối tượng JSON.");
    return { ok: false, loi, canhBao, chiPhi: null };
  }

  if (typeof phim.ten !== "string" || !phim.ten.trim()) L("SAI_CAU_TRUC", "Thiếu tên phim (ten).");
  if (!Array.isArray(phim.ti_le) || !phim.ti_le.length || !phim.ti_le.every((t) => TI_LE.includes(t))) L("SAI_CAU_TRUC", "ti_le phải là danh sách trong " + TI_LE.join(", ") + ".");
  if (!NGON_NGU.includes(phim.ngon_ngu)) L("SAI_CAU_TRUC", "ngon_ngu phải là vi hoặc en.");
  if (!so(phim.ngan_sach_usd) || phim.ngan_sach_usd < 0) L("SAI_CAU_TRUC", "ngan_sach_usd phải là số không âm (CEO đặt).");

  // Người thật: chỉ dùng hình khi người đó đồng ý (CEO đánh dấu).
  const nguoiThat = new Map();
  for (const [i, n] of (Array.isArray(phim.nguoi_that) ? phim.nguoi_that : []).entries()) {
    if (!n || !MA_RE.test(n.ma || "")) { L("SAI_CAU_TRUC", `nguoi_that[${i}]: mã không hợp lệ (chữ thường, số, gạch ngang).`); continue; }
    if (nguoiThat.has(n.ma)) L("SAI_CAU_TRUC", `nguoi_that: trùng mã ${n.ma}.`);
    if (n.anh !== undefined && !duongDanHopLe(n.anh)) L("DUONG_DAN", `nguoi_that ${n.ma}: đường dẫn ảnh phải nằm trong repo.`);
    nguoiThat.set(n.ma, n.dong_y === true);
  }
  if (phim.nguoi_that !== undefined && !Array.isArray(phim.nguoi_that)) L("SAI_CAU_TRUC", "nguoi_that phải là danh sách.");

  const nhanVat = new Map();
  for (const [i, v] of (Array.isArray(phim.nhan_vat) ? phim.nhan_vat : []).entries()) {
    if (!v || !MA_RE.test(v.ma || "")) { L("SAI_CAU_TRUC", `nhan_vat[${i}]: mã không hợp lệ.`); continue; }
    if (nhanVat.has(v.ma)) L("SAI_CAU_TRUC", `nhan_vat: trùng mã ${v.ma}.`);
    const tc = v.tham_chieu === undefined ? [] : v.tham_chieu;
    if (!Array.isArray(tc) || tc.length > 6 || !tc.every(duongDanHopLe)) L("DUONG_DAN", `nhan_vat ${v.ma}: tham_chieu là tối đa 6 đường dẫn ảnh trong repo.`);
    nhanVat.set(v.ma, v);
  }
  for (const [ma, dongY] of nguoiThat) if (nhanVat.has(ma) && !dongY) L("NGUOI_THAT_CHUA_DONG_Y", `Nhân vật ${ma} là người thật nhưng chưa có đồng ý dùng hình (nguoi_that.dong_y).`);

  const canh = Array.isArray(phim.canh) ? phim.canh : [];
  if (!Array.isArray(phim.canh)) L("SAI_CAU_TRUC", "canh phải là danh sách.");
  else if (!canh.length) W("CHUA_CO_CANH", "Chưa có cảnh nào: Hinata viết phân cảnh vào canh[].");
  const maCanh = new Set();
  let tongGiayMs = 0, thieuGiay = 0, giayQuay = 0, usd = 0, soAnh = 0, luotFlow = 0;
  for (const [i, c] of canh.entries()) {
    const ten = c && c.ma ? c.ma : `canh[${i}]`;
    if (!c || !MA_CANH_RE.test(c.ma || "")) { L("SAI_CAU_TRUC", `${ten}: mã cảnh dạng C01, C02…`); continue; }
    if (maCanh.has(c.ma)) L("SAI_CAU_TRUC", `Trùng mã cảnh ${c.ma}.`);
    maCanh.add(c.ma);
    const may = MAY_QUAY[c.may_quay || phim.may_quay_mac_dinh || MAY_QUAY_MAC_DINH];
    if (!may) L("SAI_CAU_TRUC", `${c.ma}: máy quay "${c.may_quay}" không có. Chọn: ${Object.keys(MAY_QUAY).join(", ")}.`);
    if (c.trang_thai !== undefined && !TRANG_THAI.includes(c.trang_thai)) L("SAI_CAU_TRUC", `${c.ma}: trang_thai phải là ${TRANG_THAI.join(" → ")}.`);
    if (c.giay !== undefined && (!so(c.giay) || c.giay <= 0 || c.giay > 60)) L("SAI_CAU_TRUC", `${c.ma}: giay phải từ trên 0 tới 60.`);
    if (c.cau !== undefined && (!Array.isArray(c.cau) || !c.cau.length || !c.cau.every((n) => Number.isInteger(n) && n > 0))) L("SAI_CAU_TRUC", `${c.ma}: cau là danh sách số thứ tự câu trong giọng đọc (1, 2…).`);
    for (const nv of Array.isArray(c.nhan_vat) ? c.nhan_vat : []) {
      if (!nhanVat.has(nv)) L("SAI_CAU_TRUC", `${c.ma}: nhân vật ${nv} chưa khai trong nhan_vat.`);
      else if (nguoiThat.has(nv) && !nguoiThat.get(nv)) L("NGUOI_THAT_CHUA_DONG_Y", `${c.ma}: dùng người thật ${nv} khi chưa có đồng ý.`);
    }
    const take = c.take === undefined ? [] : c.take;
    if (!Array.isArray(take) || !take.every(duongDanHopLe)) L("DUONG_DAN", `${c.ma}: take là đường dẫn clip trong repo.`);
    else if (c.take_chon !== undefined && c.take_chon !== null && !take.includes(c.take_chon)) L("SAI_CAU_TRUC", `${c.ma}: take_chon phải là một trong các take.`);
    if (c.khung_chon !== undefined && c.khung_chon !== null && !duongDanHopLe(c.khung_chon)) L("DUONG_DAN", `${c.ma}: khung_chon phải nằm trong repo.`);
    if (c.khung !== undefined && (!Array.isArray(c.khung) || !c.khung.every(duongDanHopLe))) L("DUONG_DAN", `${c.ma}: khung là đường dẫn ảnh khung chính trong repo.`);
    const soTake = c.so_take_toi_da === undefined ? 2 : c.so_take_toi_da;
    const soKhung = c.so_phuong_an_khung === undefined ? 3 : c.so_phuong_an_khung;
    if (!Number.isInteger(soTake) || soTake < 1 || soTake > 5) L("SAI_CAU_TRUC", `${c.ma}: so_take_toi_da từ 1 tới 5.`);
    if (!Number.isInteger(soKhung) || soKhung < 1 || soKhung > 6) L("SAI_CAU_TRUC", `${c.ma}: so_phuong_an_khung từ 1 tới 6.`);

    if (so(c.giay)) tongGiayMs += Math.round(c.giay * 1000); else thieuGiay++;
    if (may && !may.khongQuay && so(c.giay) && Number.isInteger(soTake)) {
      giayQuay += c.giay * soTake;
      usd += c.giay * soTake * may.usdGiay;
      if (may.luot) luotFlow += soTake;
      if (Number.isInteger(soKhung)) soAnh += soKhung;
    }
  }
  soAnh += nhanVat.size * 3;   // bộ ảnh nhân vật: chính diện, nghiêng, toàn thân
  usd += soAnh * GIA_ANH_USD;

  // Lỗi 1: thời lượng cảnh phải khớp giọng đọc (máy điền giay bằng tools/phim.js dong-bo).
  const tong = tongGiong(giong);
  if (thieuGiay && canh.length) W("CHUA_CHOT_THOI_LUONG", `${thieuGiay} cảnh chưa có giay: đọc giọng rồi chạy "node tools/phim.js dong-bo".`);
  else if (tong !== null && canh.length && Math.abs(tongGiayMs - tong) > LECH_TOI_DA_MS) {
    L("LECH_GIONG", `Tổng thời lượng cảnh ${tron(tongGiayMs / 1000)} giây lệch giọng đọc ${tron(tong / 1000)} giây (cho phép ±${LECH_TOI_DA_MS / 1000} giây).`);
  }
  if (tong === null && canh.length) W("CHUA_CO_GIONG", "Chưa có giọng đọc (media/giong/voice.json): chưa kiểm được thời lượng.");

  // Lỗi 3: chi phí tối đa (mọi cảnh quay đủ số take tối đa) không vượt ngân sách.
  const chiPhi = { giayQuay: tron(giayQuay), soAnh, luotFlow, usdToiDa: tron(usd) };
  if (so(phim.ngan_sach_usd) && usd > phim.ngan_sach_usd + 1e-9) L("VUOT_NGAN_SACH", `Chi phí tối đa ước tính $${tron(usd)} vượt ngân sách $${phim.ngan_sach_usd}. Giảm số take/phương án khung, đổi máy quay, hoặc xin CEO nâng ngân sách.`);
  return { ok: loi.length === 0, loi, canhBao, chiPhi };
}

// Chốt thời lượng cảnh theo giọng đọc: cảnh khai cau = [số câu]; cảnh kéo dài từ đầu câu đầu tiên của nó tới đầu cảnh
// sau (cảnh đầu từ 0, cảnh cuối tới hết giọng) nên tổng luôn khớp giọng. Trả về bản phim mới và danh sách thay đổi.
function dongBoGiong(phim, giong) {
  const tong = tongGiong(giong);
  if (tong === null) throw Object.assign(new Error("voice.json rỗng hoặc sai dạng."), { code: "BAD_REQUEST" });
  const theoSo = new Map(giong.map((c) => [c.index, c]));
  const canh = (phim.canh || []).map((c) => ({ ...c }));
  const moc = canh.map((c) => {
    if (!Array.isArray(c.cau) || !c.cau.length) return null;
    const dau = theoSo.get(Math.min(...c.cau));
    if (!dau) throw Object.assign(new Error(`${c.ma}: câu ${Math.min(...c.cau)} không có trong giọng đọc.`), { code: "BAD_REQUEST" });
    return dau.startMs;
  });
  if (moc.some((m) => m === null)) throw Object.assign(new Error("Mọi cảnh cần cau (số câu giọng đọc) để chốt thời lượng."), { code: "BAD_REQUEST" });
  for (let i = 1; i < moc.length; i++) if (moc[i] <= moc[i - 1]) throw Object.assign(new Error(`${canh[i].ma}: câu phải đi sau câu của cảnh trước.`), { code: "BAD_REQUEST" });
  const doi = [];
  canh.forEach((c, i) => {
    const batDau = i === 0 ? 0 : moc[i], ketThuc = i === canh.length - 1 ? tong : moc[i + 1];
    const giay = Math.round(ketThuc - batDau) / 1000;
    if (c.giay !== giay) doi.push({ ma: c.ma, cu: c.giay ?? null, moi: giay });
    c.giay = giay;
  });
  return { phim: { ...phim, canh }, doi };
}

// Cổng CEO duyệt (P3): cổng so chỉ có hiệu lực khi mọi cổng từ 1 tới so đều đã duyệt (phim.json → cong).
// Cổng 1 (kịch bản) mở khoá tạo khung; cổng 2 (khung + khoản quay) mở khoá quay video và lượt tạo Flow.
function congDaDuyet(phim, so) {
  const cong = phim && phim.cong && typeof phim.cong === "object" ? phim.cong : {};
  for (let i = 1; i <= so; i++) if (!(cong[i] && cong[i].luc)) return false;
  return true;
}

module.exports = { kiem, dongBoGiong, congDaDuyet, tongGiong, duongDanHopLe, MAY_QUAY, MAY_QUAY_MAC_DINH, GIA_ANH_USD, TI_LE, TRANG_THAI, LECH_TOI_DA_MS };
