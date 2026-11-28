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
const { goiYGiongEdge, giongCua, MA_GIONG_RE } = require("../lib/phim");
const tep = require("./phim-tai-lieu");
const { maskText } = require("../lib/mask");

const API = "https://api.elevenlabs.io";
const MO_HINH_THIET_KE = "eleven_ttv_v3";   // thiết kế giọng có tiếng Việt (eleven_multilingual_ttv_v2 không có)
const NGUOI_DAN = "nguoi-dan";
const MAU_TOI_DA = 3, MAU_SONG_MS = 30 * 60 * 1000;
const err = (code, message) => Object.assign(new Error(message), { code });

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

function createPhimGiong({ dir, fetchImpl = globalThis.fetch, audit = { log() {} }, now = Date.now } = {}) {
  const mau = new Map();   // "<root>|<ma>" -> { het, ids:Set }: bản mẫu ElevenLabs đã tạo, chỉ chọn được trong 30 phút

  const ai = (phim, ma) => {
    if (ma === NGUOI_DAN) return { ten: "Người dẫn", giong: phim.nguoi_dan?.giong, moTa: phim.nguoi_dan?.giong?.mo_ta || "" };
    const nv = (Array.isArray(phim.nhan_vat) ? phim.nhan_vat : []).find((v) => v && v.ma === ma);
    if (!nv) throw err("NOT_FOUND", "Không có nhân vật " + ma + " trong phim.json.");
    return { ten: nv.ten || ma, giong: nv.giong, moTa: nv.giong?.mo_ta || nv.mo_ta || "" };
  };
  const coNoi = (phim, ma) => (Array.isArray(phim.canh) ? phim.canh : []).filter((c) => (ma === NGUOI_DAN ? !c.nguoi_noi : c.nguoi_noi === ma)).length;

  // Ghi giọng cho một người nói: giữ mô tả của Hinata (mo_ta), thay toàn bộ phần chọn giọng (may, ma, toc_do, cao_do).
  // Route chặn khi phim đang chạy (quay, dựng, luồng tự chạy); đổi giọng chỉ ảnh hưởng tiếng nên không khoá theo cổng duyệt.
  function ghi(root, ma, giong) {
    const moi = (cu) => ({ ...(cu && typeof cu.mo_ta === "string" ? { mo_ta: cu.mo_ta } : {}), ...giong });
    return tep.suaHoSo(root, (p) => {
      if (ma === NGUOI_DAN) { p.nguoi_dan = { ...(p.nguoi_dan || {}), giong: moi(p.nguoi_dan?.giong) }; return p.nguoi_dan.giong; }
      const nv = (p.nhan_vat || []).find((v) => v && v.ma === ma);
      if (!nv) throw err("NOT_FOUND", "Không có nhân vật " + ma + " trong phim.json.");
      nv.giong = moi(nv.giong);
      return nv.giong;
    });
  }

  async function goi(duong, { method = "GET", body } = {}) {
    const khoa = khoaEleven(dir);
    if (!khoa) throw err("CHUA_CO_KHOA", "Chưa có khóa ElevenLabs. Lưu khóa ở trang Kết nối (Khóa API) rồi thử lại.");
    if (typeof fetchImpl !== "function") throw err("NETWORK", "Máy chưa hỗ trợ gọi mạng.");
    const ac = new AbortController(), hen = setTimeout(() => ac.abort(), 90000);
    let r;
    try {
      r = await fetchImpl(API + duong, { method, signal: ac.signal, headers: { "xi-api-key": khoa, "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw err("NETWORK", e.name === "AbortError" ? "ElevenLabs không trả lời trong 90 giây." : "Không gọi được ElevenLabs: kiểm mạng."); }
    finally { clearTimeout(hen); }
    if (!r.ok) {
      // ElevenLabs trả lỗi dạng { detail: { type, code, status, message } }; khóa sai là HTTP 400 code invalid_api_key.
      let ct = {}; try { const j = await r.json(); ct = j && typeof j.detail === "object" && j.detail ? j.detail : { message: typeof j?.detail === "string" ? j.detail : "" }; } catch {}
      const ma = String(ct.code || ct.status || ct.type || "");
      if (r.status === 401 || r.status === 403 || /invalid_api_key|authentication|missing_permissions|unauthorized/i.test(ma)) throw err("KHOA_SAI", "ElevenLabs từ chối khóa (sai khóa hoặc khóa thiếu quyền). Kiểm lại khóa ở trang Kết nối.");
      if (r.status === 429 || /quota|limit|credit|insufficient/i.test(ma)) throw err("HET_HAN_MUC", "ElevenLabs báo hết hạn mức ký tự hoặc gọi quá nhanh. Thử lại sau.");
      const loi = maskText(String(ct.message || "")).replace(/\s+/g, " ").slice(0, 200);
      throw err("ELEVENLABS_LOI", "ElevenLabs báo lỗi " + r.status + (loi ? ": " + loi : "."));
    }
    try { return await r.json(); } catch { throw err("ELEVENLABS_LOI", "ElevenLabs trả dữ liệu không đọc được."); }
  }

  // Danh sách người nói cho trang Xưởng phim: mô tả, giọng đang dùng (hoặc giọng máy sẽ dùng), gợi ý Edge, số cảnh nói.
  function list(root) {
    const { phim } = tep.hoSo(root);
    const nguoi = [NGUOI_DAN, ...(Array.isArray(phim.nhan_vat) ? phim.nhan_vat : []).map((v) => v && v.ma).filter(Boolean)];
    return {
      coKhoaEleven: !!khoaEleven(dir),
      nguoi: nguoi.map((ma) => {
        const x = ai(phim, ma), daChon = !!(x.giong && x.giong.may && x.giong.ma);
        const dung = ma === NGUOI_DAN ? giongCua(phim, {}) : giongCua(phim, { nguoi_noi: ma });
        return { ma, ten: x.ten, moTa: x.moTa, daChon, giong: dung, goiYEdge: goiYGiongEdge(x.moTa, phim.ngon_ngu), soCanh: coNoi(phim, ma) };
      }),
    };
  }

  // Chọn giọng Edge (miễn phí): theo gợi ý từ mô tả, hoặc preset/cao độ/tốc độ CEO chỉnh.
  function chonEdge(root, { ma, giong, toc_do, cao_do } = {}, actor = "ceo") {
    const { phim } = tep.hoSo(root);
    const x = ai(phim, String(ma || ""));
    const g = { ...goiYGiongEdge(x.moTa, phim.ngon_ngu) };
    if (giong !== undefined) { if (!["vi-nam", "vi-nu", "en-us-authority", "en-us-friendly", "en-uk-male", "en-uk-female"].includes(giong)) throw err("BAD_REQUEST", "Giọng Edge không hợp lệ."); g.ma = giong; }
    if (toc_do !== undefined) { if (!/^[+-]\d{1,2}%$/.test(toc_do)) throw err("BAD_REQUEST", "Tốc độ dạng +5% hoặc -10%."); g.toc_do = toc_do; }
    if (cao_do !== undefined) { if (!/^[+-]\d{1,2}Hz$/.test(cao_do)) throw err("BAD_REQUEST", "Cao độ dạng +4Hz hoặc -8Hz."); g.cao_do = cao_do; }
    const kq = ghi(root, ma, g);
    audit.log(actor, "phim.giong.edge", ma, { giong: g.ma }, "ok");
    return kq;
  }

  // Tự chọn giọng Edge cho mọi người nói chưa có giọng (không đụng giọng CEO đã chọn).
  function tuDong(root, actor = "ceo") {
    const { phim } = tep.hoSo(root);
    const da = [];
    for (const n of list(root).nguoi) if (!n.daChon && (n.soCanh || n.ma !== NGUOI_DAN)) { ghi(root, n.ma, goiYGiongEdge(n.moTa, phim.ngon_ngu)); da.push(n.ma); }
    audit.log(actor, "phim.giong.tu_dong", root, { so: da.length }, "ok");
    return { daChon: da };
  }

  // Thiết kế giọng ElevenLabs từ mô tả: trả tối đa 3 bản mẫu (lưu ở media/giong/mau/ để nghe), chưa ghi phim.json.
  async function thietKe(root, { ma } = {}, actor = "ceo") {
    const { phim } = tep.hoSo(root);
    const x = ai(phim, String(ma || ""));
    const moTa = String(x.moTa || "").trim();
    if (moTa.length < 10) throw err("BAD_REQUEST", "Cần mô tả giọng ít nhất 10 ký tự (vd \"nữ khoảng 20 tuổi, giọng trong trẻo\"). Nhờ Hinata viết giong.mo_ta.");
    const d = await goi("/v1/text-to-voice/design", { method: "POST", body: { voice_description: moTa.slice(0, 1000), model_id: MO_HINH_THIET_KE, text: doanMau(phim, ma) } });
    const ds = (Array.isArray(d && d.previews) ? d.previews : []).filter((v) => v && typeof v.audio_base_64 === "string" && MA_GIONG_RE.test(v.generated_voice_id || "")).slice(0, MAU_TOI_DA);
    if (!ds.length) throw err("ELEVENLABS_LOI", "ElevenLabs không trả bản mẫu nào.");
    const goc = fs.realpathSync(root), thuMuc = path.join(goc, "media", "giong", "mau");
    fs.mkdirSync(thuMuc, { recursive: true });
    const that = path.relative(goc, fs.realpathSync(thuMuc));   // media/ là junction ra ngoài dự án thì không ghi
    if (path.isAbsolute(that) || that.split(path.sep)[0] === "..") throw err("PATH_ESCAPE", "Thư mục media/giong/mau nằm ngoài dự án phim.");
    const id = crypto.randomBytes(4).toString("hex"), ids = new Set();
    const ra = ds.map((v, i) => {
      const buf = Buffer.from(v.audio_base_64, "base64");
      if (!buf.length || buf.length > 5 * 1024 * 1024) throw err("ELEVENLABS_LOI", "Bản mẫu ElevenLabs không hợp lệ.");
      const ten = `${ma}-${id}-${i + 1}.mp3`;
      tep.writeFile(path.join(thuMuc, ten), buf, 0o644);
      ids.add(v.generated_voice_id);
      return { so: i + 1, generatedVoiceId: v.generated_voice_id, duongDan: "media/giong/mau/" + ten, giay: Number(v.duration_secs) || null };
    });
    mau.set(root + "|" + ma, { het: now() + MAU_SONG_MS, ids });
    audit.log(actor, "phim.giong.thiet_ke", ma, { so: ra.length }, "ok");
    return { ma, moTa, mau: ra };
  }

  // CEO chọn một bản mẫu: lưu thành giọng trong tài khoản ElevenLabs, ghi mã giọng vào phim.json.
  async function chonMau(root, { ma, generatedVoiceId } = {}, actor = "ceo") {
    const m = mau.get(root + "|" + ma);
    if (!m || m.het < now() || !m.ids.has(generatedVoiceId)) throw err("BAD_REQUEST", "Bản mẫu không còn (quá 30 phút hoặc không thuộc nhân vật này). Thiết kế lại.");
    const { phim } = tep.hoSo(root);
    const x = ai(phim, String(ma));
    const d = await goi("/v1/text-to-voice", { method: "POST", body: { voice_name: `${String(phim.ten || "Phim").slice(0, 40)} · ${String(x.ten).slice(0, 40)}`, voice_description: String(x.moTa).slice(0, 1000), generated_voice_id: generatedVoiceId } });
    if (!d || !MA_GIONG_RE.test(d.voice_id || "")) throw err("ELEVENLABS_LOI", "ElevenLabs không trả mã giọng.");
    mau.delete(root + "|" + ma);
    ghi(root, ma, { may: "elevenlabs", ma: d.voice_id });
    audit.log(actor, "phim.giong.elevenlabs", ma, {}, "ok");
    return { ma, may: "elevenlabs", ma_giong: d.voice_id };
  }

  // Hạn mức ký tự còn lại của tài khoản ElevenLabs (không gửi gì ngoài khóa).
  async function hanMuc() {
    const d = await goi("/v1/user/subscription");
    return { daDung: Number(d.character_count) || 0, toiDa: Number(d.character_limit) || 0, goi: typeof d.tier === "string" ? d.tier.slice(0, 40) : "" };
  }

  return { list, chonEdge, tuDong, thietKe, chonMau, hanMuc, coKhoa: () => !!khoaEleven(dir) };
}

module.exports = { createPhimGiong, khoaEleven, doanMau, NGUOI_DAN };
