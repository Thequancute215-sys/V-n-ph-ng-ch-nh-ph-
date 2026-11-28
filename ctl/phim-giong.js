// Giọng theo nhân vật của Xưởng phim (CEO 28/11/2026): "nhân vật A là nữ khoảng 20 tuổi giọng trong trẻo, nhân vật B là nam
// khoảng 30 tuổi giọng trầm". Hinata viết mô tả (nhan_vat[].giong.mo_ta, nguoi_dan.giong.mo_ta) và người nói của từng cảnh
// (canh[].nguoi_noi); trang Xưởng phim cho CEO chọn giọng:
//   - Edge-TTS (miễn phí): máy gợi ý giọng nam/nữ + cao độ + tốc độ theo mô tả (lib/phim.js goiYGiongEdge).
//   - ElevenLabs (trả theo ký tự, CEO duyệt 28/11/2026): thiết kế giọng từ mô tả (POST /v1/text-to-voice/design, model
//     eleven_ttv_v3 có tiếng Việt), CEO nghe các bản mẫu rồi chọn; bản chọn được lưu thành giọng trong tài khoản ElevenLabs
//     của CEO (POST /v1/text-to-voice) và mã giọng ghi vào phim.json để đọc mọi cảnh của nhân vật đó.
// Đường mạng: chỉ tới api.elevenlabs.io, khóa đọc từ keys.json của văn phòng (lib/keys.js), gửi qua header xi-api-key,
// không in ra, không trả về trình duyệt hay AI. Gửi đi: mô tả giọng và một đoạn mẫu (lời của nhân vật trong kịch bản).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { goiYGiongEdge, giongCua, giongTheoCanh, MA_GIONG_RE, EDGE_PRESET } = require("../lib/phim");
const tep = require("./phim-tai-lieu");
const { maskText } = require("../lib/mask");

const API = "https://api.elevenlabs.io";
const MO_HINH_THIET_KE = "eleven_ttv_v3";   // thiết kế giọng có tiếng Việt (eleven_multilingual_ttv_v2 không có)
const NGUOI_DAN = "nguoi-dan";
const MAU_TOI_DA = 3, MAU_SONG_MS = 30 * 60 * 1000, MAU_BASE64_TOI_DA = 7 * 1024 * 1024;
// Mô tả giọng: ElevenLabs không ghi độ dài tối thiểu trên trang API (cần kiểm chứng); đặt 20 ký tự cho chắc đủ ý giới/tuổi/chất giọng.
const MO_TA_TOI_THIEU = 20;
const MA_NGUOI_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const chuoi = (v) => (typeof v === "string" ? v : "");
const err = (code, message, httpStatus) => Object.assign(new Error(message), { code, ...(httpStatus ? { httpStatus } : {}) });

// Khóa ElevenLabs trong keys.json (cùng file lib/keys.js ghi khi CEO dán khóa ở trang Kết nối).
function khoaEleven(dir) {
  try { const k = JSON.parse(fs.readFileSync(path.join(dir, "keys.json"), "utf8")).elevenlabs; return typeof k === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(k) ? k : null; }
  catch { return null; }
}

// Đoạn mẫu 100–1000 ký tự cho bản thiết kế: lời của chính nhân vật trong kịch bản, thiếu thì thêm câu mẫu trung tính.
function doanMau(phim, ma) {
  const loi = (Array.isArray(phim.canh) ? phim.canh : []).filter((c) => (ma === NGUOI_DAN ? !c.nguoi_noi : c.nguoi_noi === ma))
    .map((c) => String(c.loi_dan || "").trim()).filter(Boolean);
  const them = phim.ngon_ngu === "en"
    ? "Hello, this is a short sample so you can hear how this voice sounds when it reads a few complete sentences in a calm and natural way."
    : "Xin chào, đây là một đoạn đọc mẫu ngắn để anh nghe thử giọng này khi đọc vài câu hoàn chỉnh một cách tự nhiên và rõ ràng.";
  let s = loi.join(" ").replace(/\s+/g, " ").slice(0, 900);
  while (s.length < 100) s = (s ? s + " " : "") + them;
  return s.slice(0, 1000);
}

function createPhimGiong({ dir, fetchImpl = globalThis.fetch, audit = { log() {} }, now = Date.now, dangBan = () => false } = {}) {
  // "<root thật>|<ma>" -> { het, ids:Set, moTa }: bản mẫu ElevenLabs đã tạo, chỉ chọn được một lần trong 30 phút.
  const mau = new Map();
  const dangChon = new Set();   // đang lưu giọng (chặn bấm Chọn hai lần song song tạo hai giọng trùng trên ElevenLabs)
  const khoaMau = (root, ma) => fs.realpathSync(root) + "|" + ma;
  const donMau = () => { const t = now(); for (const [k, m] of mau) if (m.het < t) mau.delete(k); };

  // Người nói hợp lệ: "nguoi-dan" hoặc mã nhân vật đúng dạng (chữ thường, số, gạch ngang) có trong phim.json.
  // Mã đi vào tên tệp bản mẫu, nên kiểm dạng ở đây (phim.json chưa qua bộ kiểm vẫn có thể chứa mã lạ).
  const ai = (phim, ma) => {
    if (typeof ma !== "string" || !(ma === NGUOI_DAN || MA_NGUOI_RE.test(ma))) throw err("BAD_REQUEST", "Mã người nói không hợp lệ.");
    if (ma === NGUOI_DAN) return { ten: "Người dẫn", giong: phim.nguoi_dan?.giong, moTa: chuoi(phim.nguoi_dan?.giong?.mo_ta) };
    const nv = (Array.isArray(phim.nhan_vat) ? phim.nhan_vat : []).find((v) => v && v.ma === ma);
    if (!nv) throw err("NOT_FOUND", "Không có nhân vật " + ma + " trong phim.json.");
    return { ten: chuoi(nv.ten) || ma, giong: nv.giong, moTa: chuoi(nv.giong?.mo_ta) || chuoi(nv.mo_ta) };
  };
  const coNoi = (phim, ma) => (Array.isArray(phim.canh) ? phim.canh : []).filter((c) => c && (ma === NGUOI_DAN ? !c.nguoi_noi : c.nguoi_noi === ma)).length;

  // Ghi giọng cho các người nói trong MỘT lần ghi phim.json: giữ mô tả của Hinata (mo_ta), thay phần chọn giọng.
  function ghi(root, doi) {
    if (dangBan(root)) throw err("PHIM_BAN", "Phim đang chạy (quay, dựng hoặc luồng tự chạy). Đợi xong rồi đổi giọng.");
    const moi = (cu, giong) => ({ ...(cu && typeof cu.mo_ta === "string" ? { mo_ta: cu.mo_ta } : {}), ...giong });
    return tep.suaHoSo(root, (p) => {
      const kq = {};
      for (const [ma, giong] of doi) {
        if (ma === NGUOI_DAN) { p.nguoi_dan = { ...(p.nguoi_dan && typeof p.nguoi_dan === "object" ? p.nguoi_dan : {}), giong: moi(p.nguoi_dan?.giong, giong) }; kq[ma] = p.nguoi_dan.giong; continue; }
        const nv = (p.nhan_vat || []).find((v) => v && v.ma === ma);
        if (!nv) throw err("NOT_FOUND", "Không có nhân vật " + ma + " trong phim.json.");
        nv.giong = moi(nv.giong, giong);
        kq[ma] = nv.giong;
      }
      return kq;
    });
  }

  async function goi(duong, { method = "GET", body } = {}) {
    const khoa = khoaEleven(dir);
    if (!khoa) throw err("CHUA_CO_KHOA", "Chưa có khóa ElevenLabs. Lưu khóa ở trang Kết nối (Khóa API) rồi thử lại.");
    if (typeof fetchImpl !== "function") throw err("NETWORK", "Máy chưa hỗ trợ gọi mạng.");
    // Hết giờ bao cả lúc đọc thân phản hồi; không theo chuyển hướng (header khóa không đi sang máy khác).
    const ac = new AbortController(), hen = setTimeout(() => ac.abort(), 90000);
    const che = (s) => maskText(String(s || "").split(khoa).join("‹khóa›")).replace(/\s+/g, " ").slice(0, 200);
    try {
      let r;
      try {
        r = await fetchImpl(API + duong, { method, redirect: "error", signal: ac.signal, headers: { "xi-api-key": khoa, "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
      } catch (e) { throw err("NETWORK", e.name === "AbortError" ? "ElevenLabs không trả lời trong 90 giây." : "Không gọi được ElevenLabs: kiểm mạng."); }
      if (!r.ok) {
        // ElevenLabs trả lỗi dạng { detail: { type, code, status, message } }; khóa sai là HTTP 400 code invalid_api_key.
        let ct = {}; try { const j = await r.json(); ct = j && typeof j.detail === "object" && j.detail ? j.detail : { message: typeof j?.detail === "string" ? j.detail : "" }; } catch {}
        const ma = String(ct.code || ct.status || ct.type || "");
        if (r.status === 401 || r.status === 403 || /invalid_api_key|authentication|missing_permissions|unauthorized/i.test(ma)) throw err("KHOA_SAI", "ElevenLabs từ chối khóa (sai khóa hoặc khóa thiếu quyền). Kiểm lại khóa ở trang Kết nối.");
        if (r.status === 429 || /quota|limit|credit|insufficient/i.test(ma)) throw err("HET_HAN_MUC", "ElevenLabs báo hết hạn mức ký tự hoặc gọi quá nhanh. Thử lại sau.");
        const loi = che(ct.message);
        throw err("ELEVENLABS_LOI", "ElevenLabs báo lỗi " + r.status + (loi ? ": " + loi : "."), r.status);
      }
      try { return await r.json(); }
      catch (e) { throw e.name === "AbortError" ? err("NETWORK", "ElevenLabs không trả lời trong 90 giây.") : err("ELEVENLABS_LOI", "ElevenLabs trả dữ liệu không đọc được."); }
    } finally { clearTimeout(hen); }
  }

  // Thư mục bản mẫu media/giong/mau: tạo từng cấp, cấp nào là liên kết (symlink/junction) hay không phải thư mục thì dừng
  // ngay, trước khi tạo cấp sau (không tạo gì ở ngoài dự án).
  function thuMucMau(root) {
    let d = fs.realpathSync(root);
    for (const phan of ["media", "giong", "mau"]) {
      d = path.join(d, phan);
      try { fs.mkdirSync(d); } catch (e) { if (e.code !== "EEXIST") throw e; }
      const st = fs.lstatSync(d);
      if (!st.isDirectory() || st.isSymbolicLink()) throw err("PATH_ESCAPE", "Thư mục media/giong/mau phải nằm trực tiếp trong dự án phim.");
    }
    return d;
  }

  // Danh sách người nói cho trang Xưởng phim: mô tả, giọng đang dùng (hoặc giọng máy sẽ dùng), gợi ý Edge, số cảnh nói.
  // ElevenLabs cho người dẫn chỉ dùng được khi phim đọc theo cảnh (mỗi cảnh một đoạn âm).
  function list(root) {
    const { phim } = tep.hoSo(root);
    const nguoi = [NGUOI_DAN, ...(Array.isArray(phim.nhan_vat) ? phim.nhan_vat : []).map((v) => v && v.ma).filter((m) => typeof m === "string" && MA_NGUOI_RE.test(m))];
    return {
      coKhoaEleven: !!khoaEleven(dir), theoCanh: giongTheoCanh(phim),
      nguoi: nguoi.map((ma) => {
        const x = ai(phim, ma), daChon = !!(x.giong && x.giong.may && x.giong.ma);
        const dung = ma === NGUOI_DAN ? giongCua(phim, {}) : giongCua(phim, { nguoi_noi: ma });
        return { ma, ten: x.ten, moTa: x.moTa, daChon, giong: dung, goiYEdge: goiYGiongEdge(x.moTa, phim.ngon_ngu), soCanh: coNoi(phim, ma),
          choEleven: ma !== NGUOI_DAN || giongTheoCanh(phim) };
      }),
    };
  }

  // Chọn giọng Edge (miễn phí): theo gợi ý từ mô tả, hoặc preset/cao độ/tốc độ CEO chỉnh.
  function chonEdge(root, { ma, giong, toc_do, cao_do } = {}, actor = "ceo") {
    const { phim } = tep.hoSo(root);
    const x = ai(phim, ma);
    const g = { ...goiYGiongEdge(x.moTa, phim.ngon_ngu) };
    if (giong !== undefined) { if (typeof giong !== "string" || !EDGE_PRESET.includes(giong)) throw err("BAD_REQUEST", "Giọng Edge không hợp lệ."); g.ma = giong; }
    if (toc_do !== undefined) { if (typeof toc_do !== "string" || !/^[+-]\d{1,2}%$/.test(toc_do)) throw err("BAD_REQUEST", "Tốc độ dạng +5% hoặc -10%."); g.toc_do = toc_do; }
    if (cao_do !== undefined) { if (typeof cao_do !== "string" || !/^[+-]\d{1,2}Hz$/.test(cao_do)) throw err("BAD_REQUEST", "Cao độ dạng +4Hz hoặc -8Hz."); g.cao_do = cao_do; }
    const kq = ghi(root, [[ma, g]])[ma];
    audit.log(actor, "phim.giong.edge", ma, { giong: g.ma }, "ok");
    return kq;
  }

  // Tự chọn giọng Edge cho mọi người nói chưa có giọng (không đụng giọng CEO đã chọn), ghi phim.json một lần.
  function tuDong(root, actor = "ceo") {
    const { phim } = tep.hoSo(root);
    const doi = list(root).nguoi.filter((n) => !n.daChon && (n.soCanh || n.ma !== NGUOI_DAN)).map((n) => [n.ma, goiYGiongEdge(n.moTa, phim.ngon_ngu)]);
    if (doi.length) ghi(root, doi);
    audit.log(actor, "phim.giong.tu_dong", root, { so: doi.length }, "ok");
    return { daChon: doi.map(([ma]) => ma) };
  }

  // Thiết kế giọng ElevenLabs từ mô tả: trả tối đa 3 bản mẫu (lưu ở media/giong/mau/ để nghe), chưa ghi phim.json.
  async function thietKe(root, { ma } = {}, actor = "ceo") {
    const { phim } = tep.hoSo(root);
    const x = ai(phim, ma);
    if (ma === NGUOI_DAN && !giongTheoCanh(phim)) throw err("BAD_REQUEST", "Giọng ElevenLabs cho người dẫn chỉ dùng khi phim đọc theo cảnh (có người nói riêng hoặc AI Helper). Phim này dùng giọng Edge cho người dẫn.");
    const moTa = x.moTa.trim();
    if (moTa.length < MO_TA_TOI_THIEU) throw err("BAD_REQUEST", `Cần mô tả giọng ít nhất ${MO_TA_TOI_THIEU} ký tự (vd "nữ khoảng 20 tuổi, giọng trong trẻo"). Nhờ Hinata viết giong.mo_ta.`);
    const d = await goi("/v1/text-to-voice/design", { method: "POST", body: { voice_description: moTa.slice(0, 1000), model_id: MO_HINH_THIET_KE, text: doanMau(phim, ma) } });
    // Kiểm cả gói trước khi ghi tệp nào: base64 có trần (không cấp phát bộ đệm lớn), mã giọng đúng dạng.
    const ds = (Array.isArray(d && d.previews) ? d.previews : []).filter((v) => v && typeof v.audio_base_64 === "string" && v.audio_base_64.length > 0 &&
      v.audio_base_64.length <= MAU_BASE64_TOI_DA && typeof v.generated_voice_id === "string" && MA_GIONG_RE.test(v.generated_voice_id)).slice(0, MAU_TOI_DA);
    if (!ds.length) throw err("ELEVENLABS_LOI", "ElevenLabs không trả bản mẫu dùng được.");
    const thuMuc = thuMucMau(root);
    const id = crypto.randomBytes(4).toString("hex"), ids = new Set();
    const ra = ds.map((v, i) => {
      const ten = `${ma}-${id}-${i + 1}.mp3`;
      tep.writeFile(path.join(thuMuc, ten), Buffer.from(v.audio_base_64, "base64"), 0o644);
      ids.add(v.generated_voice_id);
      return { so: i + 1, generatedVoiceId: v.generated_voice_id, duongDan: "media/giong/mau/" + ten, giay: Number(v.duration_secs) || null };
    });
    donMau();
    mau.set(khoaMau(root, ma), { het: now() + MAU_SONG_MS, ids, moTa });
    audit.log(actor, "phim.giong.thiet_ke", ma, { so: ra.length }, "ok");
    return { ma, moTa, mau: ra };
  }

  // CEO chọn một bản mẫu: lưu thành giọng trong tài khoản ElevenLabs, ghi mã giọng vào phim.json.
  async function chonMau(root, { ma, generatedVoiceId } = {}, actor = "ceo") {
    const { phim } = tep.hoSo(root);
    const x = ai(phim, ma);
    const k = khoaMau(root, ma);
    donMau();
    const m = mau.get(k);
    if (!m || typeof generatedVoiceId !== "string" || !m.ids.has(generatedVoiceId)) throw err("BAD_REQUEST", "Bản mẫu không còn (quá 30 phút, đã chọn, hoặc không thuộc nhân vật này). Thiết kế lại.");
    if (dangChon.has(k)) throw err("CONFLICT", "Đang lưu giọng cho nhân vật này, đợi xong.");
    if (dangBan(root)) throw err("PHIM_BAN", "Phim đang chạy (quay, dựng hoặc luồng tự chạy). Đợi xong rồi đổi giọng.");
    dangChon.add(k);
    try {
      const d = await goi("/v1/text-to-voice", { method: "POST", body: { voice_name: `${chuoi(phim.ten).slice(0, 40) || "Phim"} · ${x.ten.slice(0, 40)}`, voice_description: m.moTa.slice(0, 1000), generated_voice_id: generatedVoiceId } });
      if (!d || typeof d.voice_id !== "string" || !MA_GIONG_RE.test(d.voice_id)) throw err("ELEVENLABS_LOI", "ElevenLabs không trả mã giọng.");
      mau.delete(k);   // đã lưu giọng: bản mẫu này hết dùng (lỗi mạng/ElevenLabs thì giữ để thử lại)
      ghi(root, [[ma, { may: "elevenlabs", ma: d.voice_id }]]);
      audit.log(actor, "phim.giong.elevenlabs", ma, {}, "ok");
      return { ma, may: "elevenlabs", ma_giong: d.voice_id };
    } finally { dangChon.delete(k); }
  }

  // Hạn mức ký tự còn lại của tài khoản ElevenLabs (không gửi gì ngoài khóa).
  async function hanMuc() {
    const d = await goi("/v1/user/subscription");
    return { daDung: Number(d && d.character_count) || 0, toiDa: Number(d && d.character_limit) || 0, goi: typeof d?.tier === "string" ? d.tier.slice(0, 40) : "" };
  }

  return { list, chonEdge, tuDong, thietKe, chonMau, hanMuc, coKhoa: () => !!khoaEleven(dir) };
}

module.exports = { createPhimGiong, khoaEleven, doanMau, NGUOI_DAN };
