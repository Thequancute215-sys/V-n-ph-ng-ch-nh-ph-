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
// Model có nhóm hạn mức riêng (chỉ tài khoản Pro có): tài khoản không có nhóm đó = không có model.
const NHOM_RIENG = /argon|orchestrator/;
const laNhomRieng = (model) => NHOM_RIENG.test(String(model || "").toLowerCase());
function nhomCua(model) {
  const m = String(model || "").toLowerCase();
  if (/^(claude|gpt)/.test(m)) return (g) => /Claude|GPT/i.test(g);
  if (/argon|orchestrator/.test(m)) return (g) => /Argon|Gemini 4/i.test(g);
  return (g) => g === "Gemini";
}
// Phần trăm còn lại thấp nhất của nhóm hạn mức mà model sẽ dùng (mặc định: nhóm Gemini của các model Flash);
// cửa sổ đã qua mốc mở lại thì coi như 100%. Không có nhóm khớp thì xét mọi nhóm không phải Claude/GPT, trừ model có nhóm
// riêng (Argon): tài khoản đã có hạn mức mà không có nhóm đó thì không có model, trả 0. null = chưa biết.
function conLai(hanMuc, now = Date.now(), model = null) {
  const all = ((hanMuc && hanMuc.buckets) || []).filter((x) => typeof x.remainingPercent === "number");
  if (!all.length) return null;
  const khop = nhomCua(model);
  let b = all.filter((x) => khop(String(x.group || x.label)));
  if (!b.length && laNhomRieng(model)) return 0;
  if (!b.length) b = all.filter((x) => !/Claude|GPT/i.test(String(x.group || x.label)));
  if (!b.length) return null;
  return Math.min(...b.map((x) => (x.resetAt && Date.parse(x.resetAt) <= now ? 100 : x.remainingPercent)));
}

function createAgyTaiKhoan({ dir, cred = process.platform === "win32" ? credWin : null, agyDangChay = agyDangChayWin, now = Date.now, audit = { log() {} }, agyJobs = () => 0, cho = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const file = path.join(dir, "agy-tai-khoan.json");
  // traVe { ve, muon }: lần đọc tài khoản nghỉ chưa trả lại được (máy bận) — phải về tài khoản ve, máy đang ở tài khoản mượn muon.
  // Lần chạy agy kế tiếp / lần làm mới hạn mức kế tiếp trả, kể cả sau khi ctl khởi động lại.
  // daBo: email các tài khoản anh đã bỏ (đăng nhập còn nằm trong Antigravity thì được nạp đè, không coi là "chưa cất").
  const doc = () => {
    try {
      const c = JSON.parse(fs.readFileSync(file, "utf8"));
      const traVe = c.traVe && typeof c.traVe === "object" && typeof c.traVe.ve === "string" && typeof c.traVe.muon === "string" ? { ve: c.traVe.ve, muon: c.traVe.muon } : null;
      return { tuChuyen: c.tuChuyen !== false, nguong: Number.isFinite(c.nguong) ? c.nguong : 10, ds: Array.isArray(c.ds) ? c.ds : [], traVe, daBo: Array.isArray(c.daBo) ? c.daBo.filter((x) => typeof x === "string").slice(-20) : [] };
    } catch { return { tuChuyen: true, nguong: 10, ds: [], traVe: null, daBo: [] }; }
  };
  const ghi = (c) => writeAtomic(file, JSON.stringify(c, null, 2));
  // doiLan: số lần đã đổi tài khoản (để biết một lần đọc CLI có bị đổi tài khoản chen giữa không). traoPromise: lần đọc tài khoản nghỉ đang chạy.
  let emailCache = null, dangTrao = false, docNghiLuc = 0, doiLan = 0, traoPromise = null;
  const datTraVe = (t) => { const c = doc(); c.traVe = t; ghi(c); audit.log("ctl", "agy.tai_khoan.cho_tra_lai", null, t); };
  const boTraVe = (lyDo) => { const c = doc(); if (!c.traVe) return; audit.log("ctl", "agy.tai_khoan.bo_tra_lai", null, { ...c.traVe, lyDo: String(lyDo).slice(0, 200) }); c.traVe = null; ghi(c); };
  const MUON_MSG = "Văn phòng đang tạm đổi sang tài khoản Antigravity nghỉ để đọc hạn mức (khoảng 15 giây): thử lại sau ít giây.";

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
    const ten = (id) => { const a = c.ds.find((x) => x.id === id); return a ? a.nhan : id; };
    return { hoTro: !!cred, tuChuyen: c.tuChuyen, nguong: c.nguong, dangTrao, loi, choTraLai: c.traVe ? { ve: ten(c.traVe.ve), muon: ten(c.traVe.muon) } : null,
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
    if (c.traVe) audit.log(actor, "agy.tai_khoan.bo_tra_lai", null, { ...c.traVe, lyDo: "anh vừa cất tài khoản đang đăng nhập" });
    c.traVe = null; c.daBo = c.daBo.filter((x) => x !== email);
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
    if (dangTrao) throw err("AGY_BUSY", MUON_MSG);
    chay(["xoa", id]);
    c.ds = c.ds.filter((x) => x.id !== id);
    c.daBo = [...c.daBo.filter((x) => x !== a.email), a.email].slice(-20);
    if (c.traVe && (c.traVe.ve === id || c.traVe.muon === id)) c.traVe = null;
    ghi(c);
    audit.log(actor, "agy.tai_khoan.xoa", null, { id });
    return trangThai();
  }

  // Đổi sang tài khoản id. Cất lại đăng nhập đang dùng (CLI có thể đã làm mới token) vào đúng chỗ của nó trước khi nạp.
  // trongTrao: lần đổi của chính docNghi (đổi sang tài khoản nghỉ / trả lại). Ngoài lúc đó, đang tạm đổi thì không cho đổi chen
  // (lựa chọn của anh sẽ bị lần trả lại ghi đè). Đổi xong theo ý anh hoặc tự chuyển thì bỏ việc "phải trả lại" còn treo.
  function chuyen(id, actor = "ceo", lyDo = "CEO chọn", { trongTrao = false } = {}) {
    const c = doc(), toi = c.ds.find((a) => a.id === id);
    if (!toi) throw err("NOT_FOUND", "Không có tài khoản " + id);
    if (dangTrao && !trongTrao) throw err("AGY_BUSY", "Văn phòng đang tạm đổi sang tài khoản Antigravity nghỉ để đọc hạn mức (khoảng 15 giây): đợi xong rồi đổi.");
    if (banRon()) throw err("AGY_BUSY", "Đang có tiến trình Antigravity chạy (lượt AI hoặc phiên anh mở): đợi xong rồi đổi.");
    const cur = emailDangDung(true), tu = c.ds.find((a) => a.email === cur);
    const xongTraVe = () => { if (!trongTrao && c.traVe) { const c2 = doc(); c2.traVe = null; ghi(c2); } };
    if (tu && tu.id === id) { xongTraVe(); return { tu: id, toi: id, doi: false }; }
    // Đăng nhập hiện tại chưa cất (anh vừa đăng nhập tài khoản mới bằng `agy`): nạp đè là mất đăng nhập đó, không có bản sao.
    if (cur && !tu && !c.daBo.includes(cur)) throw err("AGY_UNSAVED", `Antigravity đang đăng nhập tài khoản chưa cất (${anEmail(cur)}): bấm Cất để giữ đăng nhập đó, hoặc /logout trong agy rồi đổi.`);
    const out = chay([...(tu ? ["luu", tu.id, tu.email] : []), "nap", id, "email"]);
    const thay = (out.find((l) => l.startsWith("EMAIL ")) || "").slice(6).trim();
    emailCache = { email: thay, luc: now() }; doiLan++;
    if (thay !== toi.email) throw err("AGY_CRED", "Đã nạp nhưng Antigravity đang ở tài khoản khác dự kiến: kiểm tra lại bằng `agy`.");
    xongTraVe();
    audit.log(actor, "agy.tai_khoan.chuyen", null, { tu: tu ? tu.id : null, toi: id, lyDo });
    return { tu: tu ? tu.id : null, toi: id, doi: true };
  }

  // Đọc CLI (hạn mức / danh sách model) và cho biết kết quả là của tài khoản nào. Email đọc thẳng chỗ lưu ngay trước và ngay sau
  // khi đọc (không dùng bản nhớ 60 giây); giữa chừng có đổi tài khoản (văn phòng đổi, hoặc anh tự đăng nhập bằng agy) thì email
  // = null và bên gọi không ghi kết quả cho tài khoản nào. Đang tạm đổi sang tài khoản nghỉ thì chờ trả lại xong rồi mới đọc.
  async function docVoiTk(read) {
    if (traoPromise) await traoPromise.catch(() => {});
    const n = cred ? doc().ds.length : 0;
    if (!n) return { value: await read(), email: null };
    if (n < 2) { let e = null; try { e = emailDangDung(); } catch {} return { value: await read(), email: e }; }
    let e1 = null, e2 = null;
    try { e1 = emailDangDung(true); } catch {}
    const lan = doiLan;
    const value = await read();
    try { e2 = emailDangDung(true); } catch {}
    return { value, email: e1 && e1 === e2 && lan === doiLan && !dangTrao ? e1 : null };
  }

  // Ghi hạn mức vừa đọc được cho tài khoản email (lấy từ docVoiTk / docNghi). Không rõ là tài khoản nào thì không ghi.
  function ghiHanMuc(buckets, email = null) {
    const c = doc();
    if (!c.ds.length || !email) return;
    const a = c.ds.find((x) => x.email === email);
    if (!a) return;
    a.hanMuc = { buckets: (buckets || []).map(({ id, label, group, remainingPercent, resetAt }) => ({ id, label, group, remainingPercent, resetAt })), luc: new Date(now()).toISOString() };
    ghi(c);
  }

  // Danh sách model của tài khoản đang dùng (bộ hạn mức gọi sau mỗi lần đọc `agy models`): mỗi tài khoản thấy model khác nhau
  // (16/11/2026: Pro có Gemini 4 Argon/Hydrogen, Claude Opus 5.5; family chỉ có Gemini 3.8 Flash).
  function ghiModels(ids, email = null) {
    const c = doc();
    if (!c.ds.length || !email || !Array.isArray(ids) || !ids.length) return;
    const a = c.ds.find((x) => x.email === email);
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
  // Đang mượn tài khoản nghỉ, hoặc còn phải trả lại mà máy bận: ném AGY_BUSY (luồng tự chạy chờ ~20 giây rồi chạy lại), không
  // chạy lượt bằng tài khoản nghỉ. Trả về { tu, toi, lyDo, buckets } khi đã đổi (buckets: hạn mức tài khoản sẽ chạy, để chấm lại mức).
  function truocLuot({ model = null } = {}) {
    if (!cred) return null;
    if (dangTrao) throw err("AGY_BUSY", MUON_MSG);
    let c = doc();
    if (!c.ds.length) return null;
    let cur;
    try { cur = emailDangDung(true); } catch (e) { return { loi: e.message }; }
    const traLai = truocChay({ cur });
    if (traLai && traLai.loi) return traLai;
    if (traLai) { c = doc(); cur = c.ds.find((a) => a.id === traLai.toi).email; }
    if (c.ds.length < 2) return traLai;
    const tu = c.ds.find((a) => a.email === cur);
    // Đăng nhập hiện tại chưa cất: tự đổi là mất đăng nhập đó.
    if (cur && !tu && !c.daBo.includes(cur)) return { loi: `Antigravity đang ở tài khoản chưa cất (${anEmail(cur)}): không tự đổi để khỏi mất đăng nhập đó; bấm Cất hoặc đổi tay` };
    // Có model: tài khoản đã biết danh sách thì xét đúng danh sách. Tài khoản chưa đọc danh sách: model thường coi như có, model
    // nhóm riêng (Argon) thì không. Mọi tài khoản đều đã biết danh sách mà không ai có model (tên lạ) thì xét như model thường.
    const biet = !!model && c.ds.some((a) => Array.isArray(a.models) && a.models.includes(model));
    const tatCaBiet = c.ds.every((a) => Array.isArray(a.models));
    const coModel = (a) => !model || (Array.isArray(a.models) ? a.models.includes(model) || (!biet && tatCaBiet) : !laNhomRieng(model));
    // Tắt tự chuyển: không đổi, nhưng báo trước nếu tài khoản đang dùng không có model của lượt (lượt sẽ lỗi).
    if (!c.tuChuyen) return tu && Array.isArray(tu.models) && !coModel(tu) ? { loi: `${tu.nhan} không có model ${model} và tự chuyển đang tắt: đổi tài khoản tay hoặc chọn model khác` } : traLai;
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
    if (!best) return traLai;
    try { chuyen(best.id, "ctl", "tự chuyển: " + lyDo); }
    catch (e) { if (e.code === "AGY_BUSY") throw e; return { loi: e.message }; }
    return { tu: traLai ? traLai.tu : tu ? tu.id : null, toi: best.id, lyDo: (traLai ? traLai.lyDo + "; " : "") + lyDo, buckets: (best.hanMuc && best.hanMuc.buckets) || null };
  }

  // Trước MỌI lần chạy agy dùng đăng nhập (lượt AI, chat với Hinata/Kakashi, soạn prompt GPT web):
  // - đang mượn tài khoản nghỉ để đọc hạn mức: AGY_BUSY;
  // - còn "phải trả lại" (traVe) và máy vẫn đang ở đúng tài khoản đã mượn: trả lại trước (bận thì AGY_BUSY). Đăng nhập đã khác
  //   tài khoản đã mượn (anh tự đổi / tự đăng nhập) thì bỏ việc trả lại, giữ lựa chọn của anh.
  // Trả về { tu, toi, lyDo, buckets } nếu vừa trả lại, { loi } nếu trả lại hỏng (không phải do bận), null nếu không làm gì.
  function truocChay({ cur } = {}) {
    if (!cred) return null;
    if (dangTrao) throw err("AGY_BUSY", MUON_MSG);
    const c = doc();
    if (!c.traVe) return null;
    const ve = c.ds.find((a) => a.id === c.traVe.ve), muon = c.ds.find((a) => a.id === c.traVe.muon);
    if (cur === undefined) { try { cur = emailDangDung(true); } catch (e) { return { loi: e.message }; } }
    if (!ve || !muon || cur !== muon.email) { boTraVe("đăng nhập Antigravity đã khác tài khoản văn phòng mượn"); return null; }
    try { chuyen(ve.id, "ctl", "trả lại tài khoản đang dùng sau khi đọc hạn mức"); }
    catch (e) {
      if (e.code === "AGY_BUSY") throw err("AGY_BUSY", `Antigravity còn ở ${muon.nhan} (văn phòng mượn để đọc hạn mức) và chưa trả lại được ${ve.nhan} vì đang có tiến trình agy chạy (phiên anh mở?): đóng nó rồi thử lại.`);
      boTraVe(e.message); return { loi: e.message };
    }
    return { tu: muon.id, toi: ve.id, lyDo: `trả lại ${ve.nhan} (văn phòng đã mượn ${muon.nhan} để đọc hạn mức)`, buckets: (ve.hanMuc && ve.hanMuc.buckets) || null };
  }

  // Đọc hạn mức tài khoản đang nghỉ: đổi sang, đọc /usage, đổi về. docUsage() trả buckets của đăng nhập đang dùng;
  // docModels() (nếu có) trả danh sách model — đọc thêm khi tài khoản đó chưa có danh sách hoặc danh sách cũ quá 1 ngày.
  async function docNghi(docUsage, { force = false, docModels = null } = {}) {
    const c = doc();
    if (!cred || dangTrao) return false;
    // Lần trước chưa trả lại được: thử trả khi rảnh (mỗi lần bộ hạn mức làm mới, ~2 phút), lần này không đọc thêm.
    if (c.traVe) { if (!banRon()) { try { truocChay(); } catch {} } return false; }
    if (c.ds.length < 2) return false;
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
    const lam = (async () => {
      try {
        for (const a of can) {
          try {
            chuyen(a.id, "ctl", "đọc hạn mức tài khoản đang nghỉ", { trongTrao: true });
            const buckets = await docUsage();
            // Anh tự đăng nhập tài khoản khác giữa lúc đọc thì kết quả không phải của a: bỏ.
            if (emailDangDung(true) !== a.email) throw err("AGY_CRED", "đăng nhập Antigravity đổi giữa lúc đọc hạn mức");
            ghiHanMuc(buckets, a.email);
            if (docModels && (!Array.isArray(a.models) || !a.modelsLuc || now() - Date.parse(a.modelsLuc) >= 24 * 3600000)) {
              const ids = await docModels();
              if (emailDangDung(true) === a.email) ghiModels(ids, a.email);
            }
          }
          catch (e) { audit.log("ctl", "agy.tai_khoan.doc_nghi_loi", null, { id: a.id, loi: String(e.message).slice(0, 200) }); }
        }
      } finally {
        // Trả lại tài khoản đang dùng; máy đang bận (vd. vừa có tiến trình agy) thì thử lại vài lần. Vẫn không được thì nhớ
        // "phải trả lại" (traVe: về tài khoản nào, đang mượn tài khoản nào) để lần chạy agy kế tiếp / lần làm mới hạn mức trả.
        let xong = false, hien = null;
        for (let lan = 0; lan < TRA_LAI_LAN && !xong; lan++) {
          try {
            hien = emailDangDung(true);
            if (hien !== goc.email) chuyen(goc.id, "ctl", "trả lại tài khoản đang dùng sau khi đọc hạn mức", { trongTrao: true });
            xong = true;
          } catch (e) {
            if (e.code === "AGY_BUSY" && lan < TRA_LAI_LAN - 1) { await cho(TRA_LAI_CHO); continue; }
            audit.log("ctl", "agy.tai_khoan.tra_lai_loi", null, { id: goc.id, loi: String(e.message).slice(0, 200) });
            break;
          }
        }
        const muon = !xong && doc().ds.find((a) => a.email === hien && a.id !== goc.id);
        if (muon) datTraVe({ ve: goc.id, muon: muon.id });   // đăng nhập chưa cất / không đọc được thì không tự trả (giữ đăng nhập của anh)
        dangTrao = false;
      }
    })();
    traoPromise = lam;
    try { await lam; } finally { traoPromise = null; }
    return true;
  }

  return { trangThai, cat, sua, xoa, chuyen, ghiHanMuc, ghiModels, modelTheoTk, truocLuot, truocChay, docNghi, docVoiTk, dangTrao: () => dangTrao };
}

module.exports = { createAgyTaiKhoan, conLai, nhomCua, laNhomRieng, anEmail, credWin, agyDangChayTu, SCRIPT };
