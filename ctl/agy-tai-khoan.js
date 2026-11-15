// Nhiều tài khoản Antigravity (CEO duyệt 16/11/2026: tài khoản family + Pro trả phí, tự chuyển khi cạn).
// Antigravity CLI chỉ có MỘT chỗ lưu đăng nhập trên máy (Windows Credential Manager "gemini:antigravity"; đã thử đổi
// thư mục dữ liệu / HOME / scope: vẫn cùng tài khoản). Văn phòng cất bản sao đăng nhập của từng tài khoản rồi chép vào
// chỗ đó khi đổi (ctl/agy-dang-nhap.ps1). Token không qua Node: script PowerShell tự chép và chỉ trả email.
// - Chỉ đổi khi không có tiến trình agy nào chạy (lượt AI, đọc hạn mức, hay phiên anh tự mở): đổi giữa chừng thì
//   tiến trình đang chạy có thể ghi đè đăng nhập. Trước mỗi quyết định đều đọc lại email đang nằm trong chỗ lưu (tự sửa lệch).
// - Hạn mức: tài khoản đang dùng đọc theo chu kỳ của bộ hạn mức; tài khoản đang nghỉ đọc bằng cách đổi sang ~10 giây
//   rồi đổi về, tối đa 30 phút một lần, chỉ khi máy rảnh Antigravity. Cửa sổ hạn mức đã qua mốc mở lại thì coi như đầy.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { writeAtomic } = require("../lib/ghi-file");

const SCRIPT = path.join(__dirname, "agy-dang-nhap.ps1");
const DOC_NGHI_MOI = 30 * 60 * 1000;
const TRA_LAI_LAN = 6, TRA_LAI_CHO = 5000;   // trả lại tài khoản gốc sau khi đọc hạn mức: tối đa 6 lần, cách 5 giây
const err = (code, message) => Object.assign(new Error(message), { code });
const anEmail = (e) => { const m = /^([^@]{0,2})[^@]*(@.*)$/.exec(String(e || "")); return m ? m[1] + "***" + m[2] : ""; };

// Chạy script đổi đăng nhập (Windows). Trả các dòng kết quả; mã lỗi khác 0 thì ném lỗi kèm dòng đầu (không chứa token).
function credWin(args) {
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args],
      { encoding: "utf8", timeout: 30000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/).filter(Boolean);
  } catch (e) {
    const line = String(e.stdout || "").split(/\r?\n/).find(Boolean) || "không chạy được PowerShell";
    throw err("AGY_CRED", "Đổi đăng nhập Antigravity lỗi: " + line.replace(/^(LOI|SAI) /, ""));
  }
}
// Có tiến trình agy.exe nào đang LÀM VIỆC (lượt AI, đọc hạn mức, phiên anh tự mở)? Trình cập nhật nền của agy
// (`agy.exe --bg-updater`, chạy suốt, không dùng đăng nhập) không tính: nếu tính thì văn phòng không bao giờ đổi được tài khoản.
const agyDangChayTu = (cmdLines) => cmdLines.some((l) => /agy(\.exe)?/i.test(l) && !/--bg-updater\b/.test(l));
const PS_AGY = "Get-CimInstance Win32_Process -Filter \"Name='agy.exe'\" | ForEach-Object { 'agy.exe ' + $_.CommandLine }";
function agyDangChayWin() {
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_AGY],
      { encoding: "utf8", timeout: 20000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    return agyDangChayTu(out.split(/\r?\n/).filter((l) => l.trim()));
  } catch { return true; }   // không kiểm được thì coi như đang bận: không đổi
}

// Nhóm hạn mức mà một model của Antigravity tiêu (đọc từ /usage 16/11/2026: "Gemini Models", "Claude and GPT models",
// và tài khoản Pro có thêm "Gemini 4 Argon"). Gemini 4 Hydrogen chưa thấy nhóm riêng nên tính vào nhóm Gemini (cần kiểm chứng).
function nhomCua(model) {
  const m = String(model || "").toLowerCase();
  if (/^(claude|gpt)/.test(m)) return (g) => /Claude|GPT/i.test(g);
  if (/argon|orchestrator/.test(m)) return (g) => /Argon|Gemini 4/i.test(g);
  return (g) => g === "Gemini";
}
// Phần trăm còn lại thấp nhất của nhóm hạn mức mà model sẽ dùng (mặc định: nhóm Gemini của các model Flash);
// cửa sổ đã qua mốc mở lại thì coi như 100%. Không có nhóm khớp thì xét mọi nhóm không phải Claude/GPT. null = chưa biết.
function conLai(hanMuc, now = Date.now(), model = null) {
  const all = ((hanMuc && hanMuc.buckets) || []).filter((x) => typeof x.remainingPercent === "number");
  const khop = nhomCua(model);
  let b = all.filter((x) => khop(String(x.group || x.label)));
  if (!b.length) b = all.filter((x) => !/Claude|GPT/i.test(String(x.group || x.label)));
  if (!b.length) return null;
  return Math.min(...b.map((x) => (x.resetAt && Date.parse(x.resetAt) <= now ? 100 : x.remainingPercent)));
}

function createAgyTaiKhoan({ dir, cred = process.platform === "win32" ? credWin : null, agyDangChay = agyDangChayWin, now = Date.now, audit = { log() {} }, agyJobs = () => 0, cho = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const file = path.join(dir, "agy-tai-khoan.json");
  const doc = () => { try { const c = JSON.parse(fs.readFileSync(file, "utf8")); return { tuChuyen: c.tuChuyen !== false, nguong: Number.isFinite(c.nguong) ? c.nguong : 10, ds: Array.isArray(c.ds) ? c.ds : [] }; } catch { return { tuChuyen: true, nguong: 10, ds: [] }; } };
  const ghi = (c) => writeAtomic(file, JSON.stringify(c, null, 2));
  let emailCache = null, dangTrao = false, docNghiLuc = 0;

  const chay = (args) => { if (!cred) throw err("NOT_SUPPORTED", "Đổi tài khoản Antigravity hiện chỉ làm được trên Windows."); return cred(args); };
  function emailDangDung(fresh = false) {
    if (!fresh && emailCache && now() - emailCache.luc < 60000) return emailCache.email;
    const line = chay(["email"]).find((l) => l.startsWith("EMAIL "));
    const e = line ? line.slice(6).trim() : "-";
    emailCache = { email: e === "-" || e === "?" ? null : e, luc: now() };
    return emailCache.email;
  }
  const idCho = (email) => (String(email).split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24).replace(/^-|-$/g, "") || "tk") + "-" + crypto.createHash("sha256").update(String(email).toLowerCase()).digest("hex").slice(0, 6);
  const banRon = () => agyJobs() > 0 || agyDangChay();

  // nhanh: chỉ dùng email đã biết (không chạy PowerShell) — cho bảng hạn mức đọc liên tục.
  function trangThai({ nhanh = false } = {}) {
    const c = doc();
    let cur = null, loi = null;
    if (nhanh) cur = emailCache && emailCache.email;
    else if (cred && c.ds.length) { try { cur = emailDangDung(); } catch (e) { loi = e.message; } }
    return { hoTro: !!cred, tuChuyen: c.tuChuyen, nguong: c.nguong, dangTrao, loi,
      ds: c.ds.map((a) => ({ id: a.id, nhan: a.nhan, email: anEmail(a.email), dangDung: !!cur && cur === a.email, themLuc: a.themLuc, hanMuc: a.hanMuc || null, conLai: conLai(a.hanMuc, now()),
        soModel: Array.isArray(a.models) ? a.models.length : null })) };
  }

  // Cất tài khoản đang đăng nhập trong Antigravity (anh đăng nhập tài khoản đó bằng `agy` rồi bấm Cất).
  function cat(nhan, actor = "ceo") {
    nhan = String(nhan || "").trim().slice(0, 40);
    const email = emailDangDung(true);
    if (!email) throw err("NO_LOGIN", "Antigravity chưa đăng nhập: mở `agy`, đăng nhập tài khoản cần cất rồi bấm lại.");
    const c = doc(), id = idCho(email);
    chay(["luu", id, email]);
    const old = c.ds.find((a) => a.id === id);
    if (old) old.nhan = nhan || old.nhan; else c.ds.push({ id, nhan: nhan || "Tài khoản " + (c.ds.length + 1), email, themLuc: new Date(now()).toISOString(), hanMuc: null });
    ghi(c); audit.log(actor, "agy.tai_khoan.cat", null, { id, email: anEmail(email) });
    return trangThai();
  }

  function sua(body, actor = "ceo") {
    const c = doc();
    if (body.tuChuyen !== undefined) c.tuChuyen = body.tuChuyen !== false;
    if (body.nguong !== undefined) { const n = Number(body.nguong); if (!Number.isFinite(n) || n < 1 || n > 50) throw err("BAD_REQUEST", "Ngưỡng tự chuyển phải từ 1 đến 50%"); c.nguong = Math.round(n); }
    if (body.id && body.nhan !== undefined) { const a = c.ds.find((x) => x.id === body.id); if (!a) throw err("NOT_FOUND", "Không có tài khoản " + body.id); a.nhan = String(body.nhan).trim().slice(0, 40) || a.nhan; }
    ghi(c); audit.log(actor, "agy.tai_khoan.sua", null, { tuChuyen: c.tuChuyen, nguong: c.nguong });
    return trangThai();
  }

  function xoa(id, actor = "ceo") {
    const c = doc(), a = c.ds.find((x) => x.id === id);
    if (!a) throw err("NOT_FOUND", "Không có tài khoản " + id);
    chay(["xoa", id]);
    c.ds = c.ds.filter((x) => x.id !== id); ghi(c);
    audit.log(actor, "agy.tai_khoan.xoa", null, { id });
    return trangThai();
  }

  // Đổi sang tài khoản id. Cất lại đăng nhập đang dùng (CLI có thể đã làm mới token) vào đúng chỗ của nó trước khi nạp.
  function chuyen(id, actor = "ceo", lyDo = "CEO chọn") {
    const c = doc(), toi = c.ds.find((a) => a.id === id);
    if (!toi) throw err("NOT_FOUND", "Không có tài khoản " + id);
    if (banRon()) throw err("AGY_BUSY", "Đang có tiến trình Antigravity chạy (lượt AI hoặc phiên anh mở): đợi xong rồi đổi.");
    const cur = emailDangDung(true), tu = c.ds.find((a) => a.email === cur);
    if (tu && tu.id === id) return { tu: id, toi: id, doi: false };
    const out = chay([...(tu ? ["luu", tu.id, tu.email] : []), "nap", id, "email"]);
    const thay = (out.find((l) => l.startsWith("EMAIL ")) || "").slice(6).trim();
    emailCache = { email: thay, luc: now() };
    if (thay !== toi.email) throw err("AGY_CRED", "Đã nạp nhưng Antigravity đang ở tài khoản khác dự kiến: kiểm tra lại bằng `agy`.");
    audit.log(actor, "agy.tai_khoan.chuyen", null, { tu: tu ? tu.id : null, toi: id, lyDo });
    return { tu: tu ? tu.id : null, toi: id, doi: true };
  }

  // Ghi hạn mức vừa đọc được (bộ hạn mức gọi sau mỗi lần đọc Antigravity) cho tài khoản đang dùng.
  function ghiHanMuc(buckets, email = null) {
    const c = doc();
    if (!c.ds.length) return;
    let e = email;
    if (!e) { try { e = emailDangDung(); } catch { return; } }
    const a = c.ds.find((x) => x.email === e);
    if (!a) return;
    a.hanMuc = { buckets: (buckets || []).map(({ id, label, group, remainingPercent, resetAt }) => ({ id, label, group, remainingPercent, resetAt })), luc: new Date(now()).toISOString() };
    ghi(c);
  }

  // Danh sách model của tài khoản đang dùng (bộ hạn mức gọi sau mỗi lần đọc `agy models`): mỗi tài khoản thấy model khác nhau
  // (16/11/2026: Pro có Gemini 4 Argon/Hydrogen, Claude Opus 5.5; family chỉ có Gemini 3.8 Flash).
  function ghiModels(ids, email = null) {
    const c = doc();
    if (!c.ds.length || !Array.isArray(ids) || !ids.length) return;
    let e = email;
    if (!e) { try { e = emailDangDung(); } catch { return; } }
    const a = c.ds.find((x) => x.email === e);
    if (!a) return;
    a.models = [...new Set(ids.map(String))].sort(); a.modelsLuc = new Date(now()).toISOString();
    ghi(c);
  }
  // Model nào có ở tài khoản nào (để bảng chọn model ghi "chỉ Pro"). Tài khoản chưa đọc danh sách thì không tính.
  const modelTheoTk = () => doc().ds.filter((a) => Array.isArray(a.models)).map((a) => ({ id: a.id, nhan: a.nhan, models: a.models }));

  // Trước lượt Hinata/Kakashi (model: model sẽ dùng, null = mặc định Flash của CLI):
  // - tài khoản đang dùng không có model đó (đã biết danh sách) mà tài khoản khác có thì đổi sang;
  // - tài khoản đang dùng còn ≤ ngưỡng (tính theo nhóm hạn mức của model) thì đổi sang tài khoản có model đó, còn nhiều nhất
  //   (chưa biết hạn mức = coi như đầy). Tài khoản kia cũng ≤ ngưỡng thì giữ nguyên: tránh đổi qua đổi lại mỗi lượt.
  function truocLuot({ model = null } = {}) {
    const c = doc();
    if (!cred || c.ds.length < 2 || dangTrao) return null;
    let cur;
    try { cur = emailDangDung(true); } catch (e) { return { loi: e.message }; }
    const tu = c.ds.find((a) => a.email === cur);
    const coModel = (a) => !model || !Array.isArray(a.models) || a.models.includes(model);
    // Tắt tự chuyển: không đổi, nhưng báo trước nếu tài khoản đang dùng không có model của lượt (lượt sẽ lỗi).
    if (!c.tuChuyen) return tu && !coModel(tu) ? { loi: `${tu.nhan} không có model ${model} và tự chuyển đang tắt: đổi tài khoản tay hoặc chọn model khác` } : null;
    const left = (a) => { const v = conLai(a.hanMuc, now(), model); return v === null ? 100 : v; };
    const khac = c.ds.filter((a) => (!tu || a.id !== tu.id) && coModel(a)).sort((a, b) => left(b) - left(a));
    let best = null, lyDo = "";
    if (tu && !coModel(tu)) {
      best = khac[0] || null;
      if (best) lyDo = tu.nhan + " không có model " + model + ", " + best.nhan + " có";
    } else if (!tu || left(tu) <= c.nguong) {
      best = khac[0] || null;
      if (best && tu && left(best) <= c.nguong) best = null;
      if (best) lyDo = tu ? `${tu.nhan} còn ${Math.round(left(tu))}% (≤ ${c.nguong}%), ${best.nhan} còn ${Math.round(left(best))}%` : "đăng nhập hiện tại không thuộc tài khoản đã cất";
    }
    if (!best) return null;
    try { chuyen(best.id, "ctl", "tự chuyển: " + lyDo); return { tu: tu ? tu.id : null, toi: best.id, lyDo }; }
    catch (e) { return { loi: e.message }; }
  }

  // Đọc hạn mức tài khoản đang nghỉ: đổi sang, đọc /usage, đổi về. docUsage() trả buckets của đăng nhập đang dùng;
  // docModels() (nếu có) trả danh sách model — đọc thêm khi tài khoản đó chưa có danh sách hoặc danh sách cũ quá 1 ngày.
  async function docNghi(docUsage, { force = false, docModels = null } = {}) {
    const c = doc();
    if (!cred || c.ds.length < 2 || dangTrao) return false;
    if (!force && now() - docNghiLuc < DOC_NGHI_MOI) return false;
    if (banRon()) return false;
    docNghiLuc = now();
    let cur;
    try { cur = emailDangDung(true); } catch { return false; }
    const goc = c.ds.find((a) => a.email === cur);
    if (!goc) return false;
    const can = c.ds.filter((a) => a.id !== goc.id && (force || !a.hanMuc || now() - Date.parse(a.hanMuc.luc) >= DOC_NGHI_MOI));
    if (!can.length) return false;
    dangTrao = true;
    try {
      for (const a of can) {
        try {
          chuyen(a.id, "ctl", "đọc hạn mức tài khoản đang nghỉ");
          ghiHanMuc(await docUsage(), a.email);
          if (docModels && (!Array.isArray(a.models) || !a.modelsLuc || now() - Date.parse(a.modelsLuc) >= 24 * 3600000)) ghiModels(await docModels(), a.email);
        }
        catch (e) { audit.log("ctl", "agy.tai_khoan.doc_nghi_loi", null, { id: a.id, loi: String(e.message).slice(0, 200) }); }
      }
    } finally {
      // Trả lại tài khoản đang dùng; máy đang bận (vd. vừa có tiến trình agy) thì thử lại vài lần thay vì để kẹt ở tài khoản nghỉ.
      for (let lan = 0; lan < TRA_LAI_LAN; lan++) {
        try { if (emailDangDung(true) !== goc.email) chuyen(goc.id, "ctl", "trả lại tài khoản đang dùng sau khi đọc hạn mức"); break; }
        catch (e) {
          if (e.code === "AGY_BUSY" && lan < TRA_LAI_LAN - 1) { await cho(TRA_LAI_CHO); continue; }
          audit.log("ctl", "agy.tai_khoan.tra_lai_loi", null, { id: goc.id, loi: String(e.message).slice(0, 200) });
        }
      }
      dangTrao = false;
    }
    return true;
  }

  return { trangThai, cat, sua, xoa, chuyen, ghiHanMuc, ghiModels, modelTheoTk, truocLuot, docNghi, dangTrao: () => dangTrao };
}

module.exports = { createAgyTaiKhoan, conLai, nhomCua, anEmail, credWin, agyDangChayTu, SCRIPT };
