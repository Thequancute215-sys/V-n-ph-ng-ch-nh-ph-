// Tra cứu miễn phí bằng Gemini API (CEO duyệt 16/11/2026): việc đơn giản như tìm trên web, đọc tài liệu công khai thì
// giao cho Gemini (hạn mức miễn phí của khóa AI Studio) thay vì Claude/Codex tự đọc dài, để đỡ token.
// Đây là chỗ DUY NHẤT văn phòng gửi nội dung ra ngoài, nên chặn chặt đầu vào:
// - chỉ câu hỏi ngắn (≤ 1500 ký tự, ≤ 30 dòng) và link http(s) công khai; chặn chuỗi giống khóa/token/mật khẩu;
//   chặn localhost, IP nội bộ, *.local, *.internal, *.ts.net, link có tài khoản/mật khẩu;
// - tối đa 200 lần/ngày (chặn vòng lặp đốt hạn mức), mỗi lần ≤ 30 giây, thử lại 1 lần khi Google báo bận.
// Khóa đọc từ ~/.van-phong-ao/keys.json (lib/keys.js), gửi qua header, không bao giờ in ra hay trả cho AI.
"use strict";
const fs = require("fs");
const path = require("path");
const net = require("net");
const { writeAtomic } = require("../lib/ghi-file");

const API = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];   // hết hạn mức model đầu thì thử model sau
const MAX_NGAY = 200;
// Thêm token OAuth của Google (ya29. / 1//0…, đúng loại đăng nhập Antigravity), "Bearer …", và dạng JSON "access_token": "…".
const BI_MAT = /(sk-ant-[\w-]{10,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[\w-]{20,}|1\/\/0[\w-]{20,}|Bearer\s+[\w.~+\/-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abpr]-[\w-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}|(password|passwd|mật khẩu|secret|api[_-]?key|token)["']?\s*[:=]\s*["']?\S{6,})/i;
// Lớp chặn này bắt lộ VÔ Ý (AI dán khóa, mã nguồn, chuỗi mã hóa vào link hay câu hỏi). Không chống được AI cố ý giấu dữ liệu
// (chia nhỏ, đổi cách mã): phần đó dựa vào giới hạn độ dài, 200 lần/ngày và việc AI chạy trong quyền CEO cấp.
// Chuỗi mã hóa dài: một đoạn liền chữ+số ≥ 100 ký tự trộn hoa/thường/số (base64), hoặc ≥ 64 ký tự hex.
const coMaDai = (s) => (String(s).match(/[A-Za-z0-9]+/g) || []).some((x) => (x.length >= 100 && /[A-Z]/.test(x) && /[a-z]/.test(x) && /\d/.test(x)) || (x.length >= 64 && /^[0-9a-f]+$/i.test(x)));
// Câu hỏi không mang link: link (kể cả link thứ hai cho doc_tai_lieu) phải qua kiemLink.
const CO_LINK = /https?:\/\/|\bwww\./i;
// Giải % một lớp; chuỗi có % không hợp lệ (50% off, mã Latin-1) thì chỉ giải các nhóm %XX, không báo lỗi.
const giaiMot = (s) => { try { return decodeURIComponent(s); } catch { return s.replace(/%([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))); } };
const err = (code, message) => Object.assign(new Error(message), { code });

function kiemCau(text, ten = "câu hỏi") {
  const s = String(text || "").trim();
  if (s.length < 3) throw err("BAD_REQUEST", ten + " quá ngắn");
  if (s.length > 1500) throw err("BAD_REQUEST", ten + " dài quá 1500 ký tự: chỉ gửi câu hỏi ngắn, không dán mã nguồn hay nội dung file dự án");
  if (s.split(/\r?\n/).length > 30) throw err("BAD_REQUEST", ten + " quá 30 dòng: chỉ gửi câu hỏi ngắn, không dán mã nguồn hay nội dung file dự án");
  if (BI_MAT.test(s)) throw err("BAD_REQUEST", ten + " có chuỗi giống khóa/token/mật khẩu: không gửi ra ngoài");
  if (CO_LINK.test(s)) throw err("BAD_REQUEST", ten + " không được chứa link: đưa link vào ô url của doc_tai_lieu (mỗi lần một link)");
  if (coMaDai(s)) throw err("BAD_REQUEST", ten + " có chuỗi mã hóa dài bất thường: không gửi ra ngoài");
  return s;
}
function laIpNoiBo(h) {
  if (net.isIPv4(h)) {
    const [a, b, c] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0);
  }
  if (net.isIPv6(h)) return /^(::|f[cd]|fe[89ab]|ff|64:ff9b:|100::|2001:db8:)/i.test(h);
  return false;
}
function kiemLink(url) {
  let u;
  try { u = new URL(String(url || "").trim()); } catch { throw err("BAD_REQUEST", "Link không hợp lệ"); }
  // Bỏ dấu chấm cuối (localhost. / *.ts.net. vẫn là địa chỉ đó) trước khi kiểm.
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
  if (!/^https?:$/.test(u.protocol)) throw err("BAD_REQUEST", "Chỉ đọc link http(s)");
  if (u.username || u.password) throw err("BAD_REQUEST", "Link không được chứa tài khoản/mật khẩu");
  if (u.href.length > 2000) throw err("BAD_REQUEST", "Link quá dài");
  if (!h.includes(".") || /(^|\.)(localhost|local|internal|lan|home|ts\.net)$/.test(h) || laIpNoiBo(h)) throw err("BAD_REQUEST", "Chỉ đọc link công khai trên Internet, không đọc địa chỉ nội bộ");
  // Kiểm trên bản đã giải mã % (giải tới khi không đổi, chặn mã hóa hai lần); bỏ phần #… (không cần để đọc trang).
  u.hash = "";
  if (u.search.length > 300) throw err("BAD_REQUEST", "Phần ?… của link quá dài: chỉ đọc trang công khai, không gửi dữ liệu kèm link");
  if (u.pathname.length > 400) throw err("BAD_REQUEST", "Đường dẫn của link quá dài: chỉ đọc trang công khai, không gửi dữ liệu kèm link");
  if (h.split(".").some((x) => x.length >= 32 && /^[0-9a-f]+$/.test(x))) throw err("BAD_REQUEST", "Tên miền có chuỗi mã hóa dài bất thường: không gửi ra ngoài");
  let giai = (u.pathname + u.search).replace(/\+/g, " ");
  for (let i = 0; ; i++) {
    const next = giaiMot(giai);
    if (next === giai) break;
    if (i >= 4) throw err("BAD_REQUEST", "Link mã hóa % nhiều lớp bất thường: không gửi ra ngoài");
    giai = next;
  }
  if (BI_MAT.test(u.href) || BI_MAT.test(giai)) throw err("BAD_REQUEST", "Link có chuỗi giống khóa/token: không gửi ra ngoài");
  if (coMaDai(giai)) throw err("BAD_REQUEST", "Link có chuỗi mã hóa dài bất thường: không gửi ra ngoài");
  return u.href;
}

function createTraCuu({ dir, khoa = () => null, fetchImpl = (...a) => fetch(...a), now = () => new Date(), cho = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const demFile = path.join(dir, "tra-cuu-dem.json");
  const ngay = () => now().toISOString().slice(0, 10);
  function dem(tang = false) {
    let d; try { d = JSON.parse(fs.readFileSync(demFile, "utf8")); } catch { d = {}; }
    if (d.ngay !== ngay()) d = { ngay: ngay(), so: 0 };
    if (tang) { if (d.so >= MAX_NGAY) throw err("NO_QUOTA", `Đã tra cứu ${MAX_NGAY} lần hôm nay: dừng để giữ hạn mức miễn phí (mở lại ngày mai)`); d.so++; writeAtomic(demFile, JSON.stringify(d)); }
    return d;
  }

  async function goi(prompt, tools) {
    const key = khoa();
    if (!key) throw err("NO_KEY", "Chưa có khóa Gemini: CEO dán khóa AI Studio ở màn Tài khoản AI");
    dem(true);
    let lastErr = null;
    for (const model of MODELS) {
      for (let lan = 0; lan < 2; lan++) {
        let r;
        try {
          r = await fetchImpl(API + model + ":generateContent", { method: "POST", signal: AbortSignal.timeout(30000),
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools,
              systemInstruction: { parts: [{ text: "Trả lời ngắn gọn, chính xác, bằng tiếng Việt (giữ nguyên thuật ngữ kỹ thuật). Chỉ dựa trên nguồn tìm được; không chắc thì nói không chắc." }] },
              generationConfig: { temperature: 0.2, maxOutputTokens: 1500 } }) });
        } catch (e) { lastErr = err("UPSTREAM", "Không gọi được Gemini: " + String(e.message).slice(0, 120)); break; }
        if (r.status === 429 || r.status === 503) { lastErr = err("NO_QUOTA", "Gemini " + model + " đang hết hạn mức miễn phí hoặc quá tải"); if (lan === 0) { await cho(2000); continue; } break; }
        if (r.status === 400 || r.status === 401 || r.status === 403) throw err("BAD_KEY", "Gemini từ chối (mã " + r.status + "): kiểm tra khóa AI Studio hoặc model");
        if (!r.ok) { lastErr = err("UPSTREAM", "Gemini lỗi " + r.status); break; }
        const d = await r.json();
        const c = (d.candidates || [])[0] || {};
        const text = ((c.content && c.content.parts) || []).map((p) => p.text || "").join("").trim();
        const g = c.groundingMetadata || {}, u = c.urlContextMetadata || {};
        const nguon = [...(g.groundingChunks || []).map((x) => x.web && { title: x.web.title, uri: x.web.uri }), ...(u.urlMetadata || []).map((x) => ({ title: x.urlRetrievalStatus || "", uri: x.retrievedUrl }))].filter((x) => x && x.uri).slice(0, 8);
        if (!text) { lastErr = err("UPSTREAM", "Gemini không trả nội dung"); break; }
        return { text: text.slice(0, 8000), nguon, model };
      }
    }
    throw lastErr || err("UPSTREAM", "Gemini không trả lời");
  }

  const timKiem = (cauHoi) => goi(kiemCau(cauHoi), [{ google_search: {} }]);
  const docTaiLieu = (url, cauHoi = "Tóm tắt các ý chính") => {
    const link = kiemLink(url), q = kiemCau(cauHoi);
    return goi(`Đọc trang ${link} và trả lời: ${q}`, [{ url_context: {} }]);
  };
  return { timKiem, docTaiLieu, dem: () => dem(false), coKhoa: () => !!khoa() };
}

// Khóa Gemini trong keys.json của thư mục dữ liệu văn phòng (cùng file lib/keys.js ghi khi CEO dán khóa ở màn Tài khoản AI).
function khoaGemini(dir) {
  try { const k = JSON.parse(fs.readFileSync(path.join(dir, "keys.json"), "utf8")).gemini; return typeof k === "string" && /^AIza[0-9A-Za-z_-]{30,}$/.test(k) ? k : null; } catch { return null; }
}
// Bật cho lượt AI khi đã có khóa; CEO tắt bằng tra-cuu.json {"bat": false}.
function traCuuBat(dir) {
  if (!khoaGemini(dir)) return false;
  try { return JSON.parse(fs.readFileSync(path.join(dir, "tra-cuu.json"), "utf8")).bat !== false; } catch { return true; }
}

module.exports = { createTraCuu, kiemCau, kiemLink, khoaGemini, traCuuBat, MAX_NGAY };
