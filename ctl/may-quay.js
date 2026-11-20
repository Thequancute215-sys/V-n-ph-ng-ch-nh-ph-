// Máy quay API của xưởng phim (P2, bản thiết kế "Xưởng Phim AI", CEO duyệt 20/11/2026).
// Gọi Gemini qua Interactions API (tài liệu đọc 20/11/2026: Veo 3.1 preview đã tắt 22/10/2026):
//   - máy ảnh gemini-nano-banana-2.1: khung chính từng cảnh, giữ nhân vật bằng ảnh tham chiếu (tối đa 14 ảnh);
//   - máy quay gemini-omni-1.2-flash: clip 3–15 giây có tiếng, khung đầu là khung CEO chọn, tối đa 6 ảnh tham chiếu
//     (3 ảnh/nhân vật, 2 nhân vật).
// Luật tiêu tiền (bản thiết kế mục 05):
//   - Khóa ở keys.json, chỉ mô-đun này đọc; AI không thấy khóa, không gọi được thẳng. Mỗi lần quay do CEO bấm.
//   - Trước khi gọi: hồ sơ phim phải qua bộ kiểm (lib/phim.js), và đã chi + khoản sắp chi ≤ ngân sách → không thì dừng cứng.
//   - Cùng mô hình + cùng yêu cầu (prompt, ảnh, tham số) thì lấy lại kết quả trong bộ đệm, không trả tiền hai lần.
//   - Mỗi lần gọi thành công ghi vào sổ chi media/so-chi.json của phim (cảnh, loại, mô hình, số giây/ảnh, tiền) và nhật ký kiểm toán.
//   - Mỗi phim chỉ một lần quay tại một thời điểm (không bấm hai lần thành chi hai lần).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { kiem, MAY_QUAY_MAC_DINH } = require("../lib/phim");
const { writeAtomic } = require("../lib/ghi-file");
const { khoaGemini } = require("./tra-cuu");

const err = (code, message) => Object.assign(new Error(message), { code });
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";
const MO_HINH = { anh: "gemini-nano-banana-2.1", video: "gemini-omni-1.2-flash" };
// Giá trang pricing của Gemini API đọc 20/11/2026 (bậc trả phí; không có bậc miễn phí cho hai mô hình này).
const GIA = {
  anh: { "1K": 0.0336, "2K": 0.0504 },
  video: { "360p": 0.023, "720p": 0.07, "1080p": 0.104 },
};
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const TAI_HOST = /(^|\.)googleapis\.com$|(^|\.)googleusercontent\.com$/;
const tron = (x) => Math.round(x * 10000) / 10000;

function docJson(f, mac) { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")); } catch (e) { if (e.code === "ENOENT" && mac !== undefined) return mac; throw err("BAD_REQUEST", path.basename(f) + " không đọc được: " + e.message); } }
const fileSoChi = (root) => path.join(root, "media", "so-chi.json");
function soChi(root) { const s = docJson(fileSoChi(root), { muc: [] }); return Array.isArray(s.muc) ? s : { muc: [] }; }
const daChi = (s) => tron(s.muc.reduce((t, m) => t + (Number(m.usd) || 0), 0));

// Ảnh tham chiếu → phần "image" của Interactions API (base64). Chỉ ảnh trong repo, đúng đuôi, tối đa 20 MB.
function phanAnh(root, rel) {
  const f = path.resolve(root, rel);
  if (path.relative(root, f).startsWith("..")) throw err("PATH_ESCAPE", "Ảnh ngoài dự án: " + rel);
  const mime = MIME[path.extname(f).toLowerCase()];
  if (!mime) throw err("BAD_REQUEST", "Ảnh tham chiếu phải là png/jpg/webp: " + rel);
  let st; try { st = fs.statSync(f); } catch { throw err("NOT_FOUND", "Không có ảnh " + rel); }
  if (st.size > 20 * 1024 * 1024) throw err("TOO_LARGE", "Ảnh quá 20 MB: " + rel);
  return { type: "image", mime_type: mime, data: fs.readFileSync(f).toString("base64") };
}

// Lấy dữ liệu (base64) hoặc đường tải (uri) của ảnh/video trong phản hồi Interactions API.
function layKetQua(j, loai) {
  const muon = loai === "video" ? "video" : "image";
  const ra = [];
  for (const s of Array.isArray(j && j.steps) ? j.steps : []) for (const c of Array.isArray(s.content) ? s.content : []) if (c && c.type === muon && (c.data || c.uri)) ra.push(c);
  const tien = j && (loai === "video" ? j.output_video : j.output_image);
  if (!ra.length && tien && (tien.data || tien.uri)) ra.push(tien);
  return ra;
}

function createMayQuay({ dir, audit = { log() {} }, khoa = () => khoaGemini(dir), fetchImpl = (...a) => fetch(...a), now = () => new Date(), timeoutMs = 10 * 60 * 1000 } = {}) {
  const dang = new Map();   // root → { canh, loai, batDau }
  const loiCuoi = new Map();

  async function goi(body) {
    const key = khoa();
    if (!key) throw err("NO_KEY", "Chưa có khóa Gemini API (bậc trả phí). Dán khóa ở màn Tài khoản AI.");
    let r;
    try {
      r = await fetchImpl(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": API_REVISION },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) { throw err("MAY_QUAY_LOI", "Không gọi được Gemini: " + (e.name === "TimeoutError" ? "quá thời gian chờ" : e.message)); }
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch {}
    if (!r.ok) {
      const m = (j && j.error && (j.error.message || j.error.status)) || text.slice(0, 200);
      throw err(r.status === 429 ? "NO_QUOTA" : "MAY_QUAY_LOI", "Gemini từ chối (HTTP " + r.status + "): " + String(m).replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza…").slice(0, 300));
    }
    return j || {};
  }

  async function taiVe(uri) {
    const u = new URL(uri);
    if (u.protocol !== "https:" || !TAI_HOST.test(u.hostname)) throw err("BAD_URL", "Kết quả trỏ tới host lạ: " + u.hostname);
    const r = await fetchImpl(u, { headers: { "x-goog-api-key": khoa() }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw err("MAY_QUAY_LOI", "Tải kết quả lỗi HTTP " + r.status);
    return Buffer.from(await r.arrayBuffer());
  }

  // Dựng yêu cầu cho một cảnh. Trả về { body, usd, soLuong, doDai } — chưa gọi gì.
  function dungYeuCau(root, phim, c, { loai, soPhuongAn = 1, doPhanGiai }) {
    const tiLe = (phim.ti_le || ["9:16"])[0];
    const nv = new Map((phim.nhan_vat || []).map((v) => [v.ma, v]));
    const thamChieu = [];
    for (const ma of Array.isArray(c.nhan_vat) ? c.nhan_vat : []) for (const a of ((nv.get(ma) || {}).tham_chieu || []).slice(0, loai === "video" ? 3 : 6)) thamChieu.push(a);
    if (loai === "khung") {
      if (!c.khung_hinh) throw err("BAD_REQUEST", c.ma + ": chưa có mô tả khung hình (khung_hinh).");
      const kc = doPhanGiai || "1K";
      if (!GIA.anh[kc]) throw err("BAD_REQUEST", "Cỡ ảnh phải là " + Object.keys(GIA.anh).join(" hoặc ") + ".");
      if (!Number.isInteger(soPhuongAn) || soPhuongAn < 1 || soPhuongAn > 6) throw err("BAD_REQUEST", "Số phương án khung từ 1 tới 6.");
      const input = [...thamChieu.slice(0, 14).map((a) => phanAnh(root, a)), { type: "text", text: "Khung hình mở đầu một cảnh phim, tỉ lệ " + tiLe + ". " + c.khung_hinh + ". Không chữ, không logo trên hình." }];
      return { body: { model: MO_HINH.anh, input, response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: tiLe, image_size: kc } },
        usd: tron(GIA.anh[kc] * soPhuongAn), soLuong: soPhuongAn, doDai: null };
    }
    if (loai !== "video") throw err("BAD_REQUEST", "Loại quay là khung hoặc video.");
    const res = doPhanGiai || "720p";
    if (!GIA.video[res]) throw err("BAD_REQUEST", "Độ phân giải phải là " + Object.keys(GIA.video).join(", ") + ".");
    if (!(c.giay > 0)) throw err("BAD_REQUEST", c.ma + ": chưa chốt thời lượng (chạy node tools/phim.js dong-bo).");
    const giay = Math.min(15, Math.max(3, Math.ceil(c.giay)));
    if (c.giay > 15) throw err("BAD_REQUEST", c.ma + ": cảnh dài " + c.giay + " giây, máy quay chỉ quay tối đa 15 giây. Chia cảnh nhỏ hơn.");
    const dau = c.khung_chon ? [phanAnh(root, c.khung_chon)] : [];
    const input = [...dau, ...thamChieu.slice(0, 6).map((a) => phanAnh(root, a)),
      { type: "text", text: (c.khung_hinh || "") + (c.chuyen_dong ? ". " + c.chuyen_dong : "") + ". Không chữ, không logo trên hình." }];
    return { body: { model: MO_HINH.video, input, response_format: { type: "video", aspect_ratio: tiLe === "16:9" ? "16:9" : "9:16", resolution: res, duration: giay + "s" } },
      usd: tron(GIA.video[res] * giay), soLuong: 1, doDai: giay };
  }

  function chuanBi(root, { canh, loai, soPhuongAn, doPhanGiai }) {
    const phim = docJson(path.join(root, "phim.json"));
    const giong = docJson(path.join(root, "media", "giong", "voice.json"), null);
    const kq = kiem(phim, { giong });
    if (!kq.ok) throw err("PHIM_LOI", "Hồ sơ phim còn lỗi, sửa trước khi quay: " + kq.loi.map((l) => l.chiTiet).join(" · ").slice(0, 400));
    const c = (phim.canh || []).find((x) => x.ma === canh);
    if (!c) throw err("NOT_FOUND", "Không có cảnh " + canh);
    const may = c.may_quay || phim.may_quay_mac_dinh || MAY_QUAY_MAC_DINH;
    if (loai === "video" && may !== "omni-flash") throw err("NOT_SUPPORTED", c.ma + ": máy quay " + may + (may === "flow" ? " dùng trạm Google Flow." : " chưa nối (P2 chỉ có Gemini Omni)."));
    if (loai === "video" && (c.take || []).length >= (c.so_take_toi_da || 2)) throw err("TOI_DA_TAKE", c.ma + ": đã quay đủ " + (c.so_take_toi_da || 2) + " take tối đa. Nâng so_take_toi_da nếu cần quay thêm.");
    const yc = dungYeuCau(root, phim, c, { loai, soPhuongAn, doPhanGiai });
    const s = soChi(root), chi = daChi(s);
    const ngan = Number(phim.ngan_sach_usd) || 0;
    return { phim, c, yc, chi, ngan, conLai: tron(ngan - chi) };
  }

  // Ước tính trước khi CEO bấm quay: không gọi mạng, không tốn gì.
  function uocTinh(root, opts) {
    const { yc, chi, ngan, conLai } = chuanBi(root, opts);
    return { usd: yc.usd, daChi: chi, nganSach: ngan, conLai, du: chi + yc.usd <= ngan + 1e-9, moHinh: yc.body.model };
  }

  async function quay(root, opts, actor = "ceo") {
    if (dang.has(root)) throw err("MAY_QUAY_BAN", "Phim này đang quay cảnh " + dang.get(root).canh + ". Chờ xong rồi bấm tiếp.");
    const { phim, c, yc, chi, ngan } = chuanBi(root, opts);
    if (chi + yc.usd > ngan + 1e-9) throw err("VUOT_NGAN_SACH", `Lần quay này ~$${yc.usd}, đã chi $${chi} / ngân sách $${ngan}. Nâng ngân sách hoặc giảm số phương án.`);
    dang.set(root, { canh: c.ma, loai: opts.loai, batDau: now().toISOString() });
    loiCuoi.delete(root);
    try {
      const boDem = path.join(root, "media", "bo-dem");
      fs.mkdirSync(boDem, { recursive: true });
      const ext = opts.loai === "video" ? ".mp4" : ".jpg";
      const files = [];
      let usd = 0, tuBoDem = 0;
      for (let i = 0; i < yc.soLuong; i++) {
        // Bộ đệm chặn trả tiền hai lần cho CÙNG một lần quay (vd. lỗi ghi hồ sơ sau khi đã gọi xong rồi bấm lại).
        // Số thứ tự take/khung nằm trong mã băm: quay lại (take 2) hay phương án 2 vẫn là lần quay mới.
        const thuTu = (opts.loai === "video" ? (c.take || []).length : (c.khung || []).length) + i;
        const hash = crypto.createHash("sha256").update(JSON.stringify({ body: yc.body, thuTu })).digest("hex").slice(0, 32);
        const dem = path.join(boDem, hash + ext);
        let buf;
        if (fs.existsSync(dem)) { buf = fs.readFileSync(dem); tuBoDem++; }
        else {
          const j = await goi(yc.body);
          const kq = layKetQua(j, opts.loai === "video" ? "video" : "anh");
          if (!kq.length) throw err("MAY_QUAY_LOI", "Gemini không trả " + (opts.loai === "video" ? "video" : "ảnh") + " (có thể bị bộ lọc an toàn chặn). Sửa mô tả khung hình rồi thử lại.");
          buf = kq[0].data ? Buffer.from(kq[0].data, "base64") : await taiVe(kq[0].uri);
          if (!buf.length) throw err("MAY_QUAY_LOI", "Kết quả rỗng.");
          fs.writeFileSync(dem, buf);
          usd += yc.usd / yc.soLuong;
        }
        const thuMuc = path.join(root, "media", opts.loai === "video" ? "quay" : "khung");
        fs.mkdirSync(thuMuc, { recursive: true });
        const daCo = (opts.loai === "video" ? c.take || [] : c.khung || []).length;
        const ten = opts.loai === "video" ? `${c.ma}-t${daCo + 1}${ext}` : `${c.ma}-${daCo + i + 1}${ext}`;
        fs.writeFileSync(path.join(thuMuc, ten), buf);
        files.push("media/" + (opts.loai === "video" ? "quay" : "khung") + "/" + ten);
      }
      // Ghi kết quả vào hồ sơ: phần của "máy" (khung, take, trang_thai).
      const moi = docJson(path.join(root, "phim.json"));
      const cm = moi.canh.find((x) => x.ma === c.ma);
      if (opts.loai === "video") { cm.take = [...(cm.take || []), ...files]; cm.trang_thai = "da_quay"; }
      else { cm.khung = [...(cm.khung || []), ...files]; if (!cm.trang_thai || cm.trang_thai === "viet") cm.trang_thai = "co_khung"; }
      writeAtomic(path.join(root, "phim.json"), JSON.stringify(moi, null, 2) + "\n", 0o644);
      const s = soChi(root);
      s.muc.push({ luc: now().toISOString(), canh: c.ma, loai: opts.loai, moHinh: yc.body.model, giay: yc.doDai, soAnh: opts.loai === "khung" ? yc.soLuong : 0,
        usd: tron(usd), tuBoDem, files, actor });
      writeAtomic(fileSoChi(root), JSON.stringify(s, null, 2) + "\n", 0o644);
      audit.log(actor, "phim.quay", path.basename(root) + "/" + c.ma, { loai: opts.loai, moHinh: yc.body.model, usd: tron(usd), tuBoDem });
      return { files, usd: tron(usd), tuBoDem, daChi: daChi(s), nganSach: Number(phim.ngan_sach_usd) || 0 };
    } catch (e) {
      loiCuoi.set(root, e.message);
      audit.log(actor, "phim.quay_loi", path.basename(root) + "/" + c.ma, { loai: opts.loai, loi: String(e.message).slice(0, 200) });
      throw e;
    } finally { dang.delete(root); }
  }

  // Trang duyệt bấm quay rồi hỏi lại trangThai(): một clip có thể mất vài phút, lâu hơn thời gian chờ của một yêu cầu HTTP.
  // Lỗi kiểm trước (hồ sơ lỗi, vượt ngân sách, đang quay) báo ngay cho người bấm, không đợi tới lần hỏi trạng thái.
  function batDauQuay(root, opts, actor = "ceo") {
    if (dang.has(root)) throw err("MAY_QUAY_BAN", "Phim này đang quay cảnh " + dang.get(root).canh + ". Chờ xong rồi bấm tiếp.");
    const t = chuanBi(root, opts);
    if (t.chi + t.yc.usd > t.ngan + 1e-9) throw err("VUOT_NGAN_SACH", `Lần quay này ~$${t.yc.usd}, đã chi $${t.chi} / ngân sách $${t.ngan}. Nâng ngân sách hoặc giảm số phương án.`);
    const p = quay(root, opts, actor);
    p.catch(() => {});
    return trangThai(root);
  }
  function trangThai(root) {
    const s = soChi(root);
    return { dang: dang.get(root) || null, loiCuoi: loiCuoi.get(root) || "", daChi: daChi(s), soChi: s.muc.slice(-30), coKhoa: !!khoa() };
  }

  // Phần của CEO trong hồ sơ (bấm trên trang Xưởng phim): chọn khung, chọn take, đồng ý dùng hình người thật, ngân sách.
  // Chỉ nhận giá trị đã có trong hồ sơ (khung/take của chính cảnh đó), không cho ghi đường dẫn tuỳ ý.
  function suaCeo(root, { canh, khungChon, takeChon, nguoiThat, nganSach } = {}, actor = "ceo") {
    const f = path.join(root, "phim.json");
    const phim = docJson(f);
    const doi = [];
    if (canh !== undefined) {
      const c = (phim.canh || []).find((x) => x.ma === canh);
      if (!c) throw err("NOT_FOUND", "Không có cảnh " + canh);
      if (khungChon !== undefined) {
        if (khungChon !== null && !(c.khung || []).includes(khungChon)) throw err("BAD_REQUEST", "Khung không thuộc cảnh " + canh);
        c.khung_chon = khungChon; if (khungChon && (!c.trang_thai || ["viet", "co_khung"].includes(c.trang_thai))) c.trang_thai = "cho_quay";
        doi.push(canh + ".khung_chon");
      }
      if (takeChon !== undefined) {
        if (takeChon !== null && !(c.take || []).includes(takeChon)) throw err("BAD_REQUEST", "Take không thuộc cảnh " + canh);
        c.take_chon = takeChon; if (takeChon) c.trang_thai = "da_chon";
        doi.push(canh + ".take_chon");
      }
    }
    if (nguoiThat !== undefined) {
      const n = (phim.nguoi_that || []).find((x) => x.ma === nguoiThat.ma);
      if (!n) throw err("NOT_FOUND", "Không có người thật " + nguoiThat.ma);
      n.dong_y = nguoiThat.dongY === true;
      doi.push("nguoi_that." + n.ma + "=" + n.dong_y);
    }
    if (nganSach !== undefined) {
      const v = Number(nganSach);
      if (!Number.isFinite(v) || v < 0 || v > 1000) throw err("BAD_REQUEST", "Ngân sách từ 0 tới 1000 USD.");
      phim.ngan_sach_usd = v;
      doi.push("ngan_sach_usd=" + v);
    }
    if (!doi.length) throw err("BAD_REQUEST", "Không có gì để sửa.");
    writeAtomic(f, JSON.stringify(phim, null, 2) + "\n", 0o644);
    audit.log(actor, "phim.ceo", path.basename(root), { doi });
    return phim;
  }

  return { uocTinh, quay, batDauQuay, trangThai, dungYeuCau, suaCeo };
}

module.exports = { createMayQuay, layKetQua, MO_HINH, GIA, ENDPOINT };
