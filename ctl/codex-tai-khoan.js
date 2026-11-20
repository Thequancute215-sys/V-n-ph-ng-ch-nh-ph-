// Nhiều tài khoản GPT cho Codex (CEO yêu cầu 20/11/2026: "một tài khoản không đủ token, tôi có 2 tài khoản GPT Pro").
// Khác Antigravity (một chỗ lưu đăng nhập, phải chép qua chép lại), Codex nhận biến CODEX_HOME: mỗi tài khoản có thư mục
// riêng chứa đăng nhập, lịch sử phiên và hạn mức của nó. Văn phòng KHÔNG chép, không đọc file đăng nhập (auth.json):
// - Tài khoản 1 = ~/.codex đang có sẵn (app Codex của CEO cũng dùng). Tài khoản thêm = ~/.van-phong-ao/codex-tk/<id>,
//   CEO tự đăng nhập bằng `codex login` chạy với CODEX_HOME đó (văn phòng mở lệnh, CEO bấm trên trình duyệt).
// - Dùng chung với ~/.codex: config.toml, AGENTS.md, cap_sid (chép, đồng bộ trước mỗi lượt) và skills, plugins, sandbox
//   (nối thẳng bằng junction) — để lượt chạy bằng tài khoản nào cũng cùng model, plugin, luật, và sandbox "elevated" đã dựng.
// - Mỗi tiến trình Codex văn phòng mở (lượt làm việc, chat, soạn prompt) nhận CODEX_HOME của tài khoản đang chọn lúc mở
//   (ctl/jobs.js envFor). Đổi tài khoản không ảnh hưởng lượt đang chạy; đọc hạn mức được cả tài khoản đang nghỉ.
// - Tự chuyển: trước mỗi lượt Codex, tài khoản đang dùng còn ≤ ngưỡng thì chuyển sang tài khoản còn nhiều nhất; lượt bị
//   "hết hạn mức" thì đánh dấu cạn và chuyển ngay để luồng tự chạy lại (ctl/autopilot.js), không chờ tới giờ mở lại.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { writeAtomic } = require("../lib/ghi-file");
const { cleanEnv } = require("../lib/mask");

const MAC_DINH = "mac-dinh";
const CHEP = ["config.toml", "AGENTS.md", "cap_sid"];                       // nhỏ, đồng bộ theo nội dung
const NOI = ["skills", "plugins", ".sandbox", ".sandbox-bin", ".sandbox-secrets", ".tmp", "vendor_imports"];   // junction tới ~/.codex
const DANG_NHAP_TOI_DA = 10 * 60 * 1000;
const err = (code, message) => Object.assign(new Error(message), { code });
const anEmail = (e) => { const m = /^([^@]{0,2})[^@]*(@.*)$/.exec(String(e || "")); return m ? m[1] + "***" + m[2] : ""; };
const conLaiCua = (buckets) => { const v = (buckets || []).map((b) => b.remainingPercent).filter(Number.isFinite); return v.length ? Math.min(...v) : null; };

function createCodexTaiKhoan({ dir, audit = { log() {} }, homeGoc = () => process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  cli = () => ["codex"], chay = spawn, now = Date.now, khiDangNhapXong = () => {} } = {}) {
  const file = path.join(dir, "codex-tai-khoan.json");
  const dangNhap = new Map();   // id -> { child, url, luc, loi }
  function doc() {
    let c = {};
    try { c = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch {}
    const ds = (Array.isArray(c.ds) ? c.ds : []).filter((a) => a && /^gpt-[0-9a-f]{6}$/.test(a.id) && typeof a.home === "string");
    return { dangDung: typeof c.dangDung === "string" ? c.dangDung : MAC_DINH, tuChuyen: c.tuChuyen !== false, nguong: Number.isFinite(c.nguong) ? c.nguong : 10,
      nhanGoc: typeof c.nhanGoc === "string" && c.nhanGoc ? c.nhanGoc : "GPT 1", ds, hanMuc: c.hanMuc && typeof c.hanMuc === "object" ? c.hanMuc : {} };
  }
  const ghi = (c) => { fs.mkdirSync(dir, { recursive: true }); writeAtomic(file, JSON.stringify(c, null, 2)); };
  const tatCa = (c) => [{ id: MAC_DINH, nhan: c.nhanGoc, home: null }, ...c.ds];
  const tim = (c, id) => tatCa(c).find((a) => a.id === id) || null;
  const homeCua = (a) => (a && a.home) || homeGoc();

  // Thư mục của tài khoản thêm: chép/nối những thứ dùng chung với ~/.codex (không đụng tới đăng nhập).
  function dongBo(a) {
    if (!a || !a.home) return;
    const goc = homeGoc();
    fs.mkdirSync(a.home, { recursive: true });
    for (const f of CHEP) {
      const tu = path.join(goc, f), toi = path.join(a.home, f);
      try {
        if (!fs.existsSync(tu)) continue;
        const moi = fs.readFileSync(tu);
        let cu = null; try { cu = fs.readFileSync(toi); } catch {}
        if (!cu || !cu.equals(moi)) fs.writeFileSync(toi, moi);
      } catch {}
    }
    for (const d of NOI) {
      const tu = path.join(goc, d), toi = path.join(a.home, d);
      try { if (fs.existsSync(tu) && !fs.existsSync(toi)) fs.symlinkSync(tu, toi, "junction"); } catch {}
    }
  }

  // Biến môi trường cho tiến trình Codex: tài khoản 1 dùng ~/.codex như bình thường (không đặt gì).
  function envCho(id) {
    const c = doc(), a = tim(c, id) || tim(c, MAC_DINH);
    if (!a.home) return {};
    try { dongBo(a); } catch {}
    return { CODEX_HOME: a.home };
  }
  const env = () => envCho(doc().dangDung);

  function them(nhan) {
    const ten = String(nhan || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!ten) throw err("BAD_REQUEST", "Đặt tên cho tài khoản GPT (vd. GPT Pro 2)");
    const c = doc();
    if (c.ds.length >= 5) throw err("TOO_MANY", "Tối đa 5 tài khoản GPT thêm");
    if (tatCa(c).some((a) => a.nhan.toLowerCase() === ten.toLowerCase())) throw err("BAD_REQUEST", "Đã có tài khoản tên " + ten);
    const id = "gpt-" + crypto.randomBytes(3).toString("hex");
    const a = { id, nhan: ten, home: path.join(dir, "codex-tk", id), them: new Date(now()).toISOString() };
    dongBo(a);
    c.ds.push(a); ghi(c);
    audit.log("ceo", "codex_tk.them", id, { nhan: ten });
    return trangThai();
  }

  // Mở `codex login` với CODEX_HOME của tài khoản: Codex in link đăng nhập và tự mở trình duyệt; CEO đăng nhập đúng
  // tài khoản (nên mở link trong cửa sổ ẩn danh nếu trình duyệt đang đăng nhập tài khoản khác). Văn phòng chỉ đọc link.
  function moDangNhap(id) {
    const c = doc(), a = tim(c, id);
    if (!a) throw err("NOT_FOUND", "Không có tài khoản " + id);
    const cu = dangNhap.get(id);
    if (cu && cu.child && cu.child.exitCode === null) return trangThai();
    if (a.home) dongBo(a);
    const p = cli();
    const st = { url: null, luc: now(), loi: null, xong: false };
    const child = chay(p[0], [...p.slice(1), "login"], { env: { ...cleanEnv(), ...(a.home ? { CODEX_HOME: a.home } : {}) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    st.child = child;
    const nghe = (d) => { const m = /https:\/\/auth\.openai\.com\/[^\s"'<>]+/.exec(String(d)); if (m && !st.url) st.url = m[0]; };
    child.stdout && child.stdout.on("data", nghe);
    child.stderr && child.stderr.on("data", nghe);
    const het = setTimeout(() => { try { child.kill(); } catch {} st.loi = "Quá 10 phút chưa đăng nhập xong: bấm Đăng nhập lại."; }, DANG_NHAP_TOI_DA);
    if (het.unref) het.unref();
    child.on("error", () => { st.loi = "Không chạy được lệnh codex login."; });
    child.on("exit", (code) => {
      clearTimeout(het); st.xong = true;
      if (code !== 0 && !st.loi) st.loi = "Chưa đăng nhập xong (codex login thoát mã " + code + ").";
      audit.log("ceo", "codex_tk.dang_nhap", id, { ok: code === 0 });
      if (code === 0) { try { khiDangNhapXong(id); } catch {} }   // đọc ngay hạn mức + email của tài khoản vừa đăng nhập
    });
    dangNhap.set(id, st);
    audit.log("ceo", "codex_tk.mo_dang_nhap", id, {});
    return trangThai();
  }

  // Ghi hạn mức + thông tin tài khoản (email, gói) đọc được cho một tài khoản.
  function ghiHanMuc(id, { buckets = null, email = null, plan = null, loi = null } = {}) {
    const c = doc();
    if (!tim(c, id)) return;
    const cu = c.hanMuc[id] || {};
    c.hanMuc[id] = { ...cu, luc: new Date(now()).toISOString(), ...(buckets ? { buckets, conLai: conLaiCua(buckets), canTu: null } : {}),
      ...(email !== null ? { email: anEmail(email), emailHash: crypto.createHash("sha256").update(String(email).toLowerCase()).digest("hex").slice(0, 16) } : {}),
      ...(plan !== null ? { plan } : {}), loi: loi || null, daDangNhap: loi ? !/đăng nhập|login|auth/i.test(loi) && cu.daDangNhap : true };
    ghi(c);
  }

  // Đọc hạn mức mọi tài khoản (tài khoản nghỉ cũng đọc được vì mỗi tài khoản một thư mục). docFn(env) => { rate, account }.
  async function docTatCa(docFn) {
    const c = doc();
    for (const a of tatCa(c)) {
      try {
        const r = await docFn(a.home ? (dongBo(a), { CODEX_HOME: a.home }) : {});
        ghiHanMuc(a.id, { buckets: r.buckets, email: r.email ?? null, plan: r.plan ?? null });
      } catch (e) { ghiHanMuc(a.id, { loi: String(e.message || e).slice(0, 200) }); }
    }
    // Hai tài khoản cùng một email: báo để CEO đăng nhập lại đúng tài khoản thứ hai.
    return trangThai();
  }

  function trangThai() {
    const c = doc();
    const ds = tatCa(c).map((a) => {
      const h = c.hanMuc[a.id] || {}, dn = dangNhap.get(a.id);
      return { id: a.id, nhan: a.nhan, macDinh: !a.home, dangDung: a.id === c.dangDung, email: h.email || "", plan: h.plan || null,
        conLai: h.canTu ? 0 : h.conLai ?? null, hanMuc: h.luc ? { luc: h.luc, buckets: h.buckets || [] } : null, loi: h.loi || null, daDangNhap: h.daDangNhap !== false && !!h.luc && !h.loi,
        dangNhap: dn && !dn.xong ? { url: dn.url, luc: new Date(dn.luc).toISOString() } : dn && dn.loi ? { loi: dn.loi } : null };
    });
    const hashes = tatCa(c).map((a) => (c.hanMuc[a.id] || {}).emailHash).filter(Boolean);
    const trung = hashes.length !== new Set(hashes).size;
    return { tuChuyen: c.tuChuyen, nguong: c.nguong, dangDung: c.dangDung, ds, trung };
  }

  function chuyen(id, actor = "ceo", lyDo = "CEO chọn") {
    const c = doc(), a = tim(c, id);
    if (!a) throw err("NOT_FOUND", "Không có tài khoản " + id);
    const h = c.hanMuc[id] || {};
    if (h.loi && /đăng nhập|login|auth/i.test(h.loi)) throw err("NO_LOGIN", a.nhan + " chưa đăng nhập: bấm Đăng nhập trước.");
    const tu = c.dangDung;
    c.dangDung = id; ghi(c);
    if (a.home) dongBo(a);
    audit.log(actor, "codex_tk.chuyen", id, { tu, lyDo });
    return { tu, toi: id, lyDo };
  }

  function sua({ tuChuyen, nguong, nhan, id } = {}) {
    const c = doc();
    if (typeof tuChuyen === "boolean") c.tuChuyen = tuChuyen;
    if (nguong !== undefined) { const n = Number(nguong); if (!Number.isFinite(n) || n < 1 || n > 50) throw err("BAD_REQUEST", "Ngưỡng tự chuyển từ 1 đến 50%"); c.nguong = Math.round(n); }
    if (nhan !== undefined && id) {
      const ten = String(nhan).replace(/\s+/g, " ").trim().slice(0, 40);
      if (!ten) throw err("BAD_REQUEST", "Tên không được trống");
      if (id === MAC_DINH) c.nhanGoc = ten; else { const a = c.ds.find((x) => x.id === id); if (!a) throw err("NOT_FOUND", "Không có tài khoản " + id); a.nhan = ten; }
    }
    ghi(c);
    return trangThai();
  }

  // Bỏ tài khoản thêm: chỉ bỏ khỏi danh sách văn phòng. Thư mục (có đăng nhập) giữ nguyên để CEO tự xoá nếu muốn.
  function bo(id) {
    if (id === MAC_DINH) throw err("BAD_REQUEST", "Không bỏ được tài khoản 1 (thư mục ~/.codex mà app Codex cũng dùng)");
    const c = doc();
    if (!c.ds.some((a) => a.id === id)) throw err("NOT_FOUND", "Không có tài khoản " + id);
    c.ds = c.ds.filter((a) => a.id !== id);
    delete c.hanMuc[id];
    if (c.dangDung === id) c.dangDung = MAC_DINH;
    ghi(c);
    audit.log("ceo", "codex_tk.bo", id, {});
    return trangThai();
  }

  // Tài khoản tốt nhất để chuyển sang (đã đăng nhập, không cùng email với tài khoản đang dùng, còn nhiều hạn mức nhất).
  function tot(c, ngoai) {
    const cur = c.hanMuc[ngoai] || {};
    return tatCa(c).filter((a) => a.id !== ngoai).map((a) => ({ a, h: c.hanMuc[a.id] || {} }))
      .filter(({ h }) => h.luc && !h.loi && h.daDangNhap !== false && !h.canTu && Number.isFinite(h.conLai) && h.conLai > c.nguong && (!cur.emailHash || h.emailHash !== cur.emailHash))
      .sort((x, y) => y.h.conLai - x.h.conLai)[0] || null;
  }

  // Trước mỗi lượt Codex: tài khoản đang dùng còn ≤ ngưỡng (hoặc vừa bị đánh dấu cạn) thì chuyển.
  function truocLuot() {
    const c = doc();
    if (!c.tuChuyen) return null;
    const h = c.hanMuc[c.dangDung] || {};
    const conLai = h.canTu ? 0 : h.conLai;
    if (!Number.isFinite(conLai) || conLai > c.nguong) return null;
    const b = tot(c, c.dangDung);
    if (!b) return { loi: "mọi tài khoản GPT đều sắp cạn hoặc chưa đọc được hạn mức" };
    return chuyen(b.a.id, "tu-dong", `${tim(c, c.dangDung).nhan} còn ${Math.round(conLai)}% → ${b.a.nhan} còn ${Math.round(b.h.conLai)}%`);
  }

  // Lượt Codex vừa báo hết hạn mức: đánh dấu tài khoản đang dùng là cạn, rồi chuyển ngay nếu còn tài khoản khác.
  function baoCan() {
    const c = doc();
    const id = c.dangDung;
    c.hanMuc[id] = { ...(c.hanMuc[id] || {}), canTu: new Date(now()).toISOString(), conLai: 0 };
    ghi(c);
    if (!c.tuChuyen) return null;
    const b = tot(doc(), id);
    if (!b) return null;
    return chuyen(b.a.id, "tu-dong", `${tim(c, id).nhan} báo hết hạn mức → ${b.a.nhan} còn ${Math.round(b.h.conLai)}%`);
  }

  return { env, envCho, them, moDangNhap, ghiHanMuc, docTatCa, trangThai, chuyen, sua, bo, truocLuot, baoCan, dongBo: (id) => dongBo(tim(doc(), id)) };
}

module.exports = { createCodexTaiKhoan, MAC_DINH, CHEP, NOI, conLaiCua };
