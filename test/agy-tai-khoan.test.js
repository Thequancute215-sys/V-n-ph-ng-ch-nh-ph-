"use strict";
// Hai tài khoản Antigravity (CEO duyệt 16/11/2026): cất đăng nhập từng tài khoản, đổi khi máy rảnh, tự chuyển khi cạn,
// đọc hạn mức tài khoản đang nghỉ. Dùng kho đăng nhập giả: không đụng Windows Credential Manager thật.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAgyTaiKhoan, conLai, anEmail } = require("../ctl/agy-tai-khoan");

// Kho giả cùng giao thức với ctl/agy-dang-nhap.ps1: "gemini:antigravity" là chỗ đăng nhập của CLI.
function khoGia(email) {
  const kho = new Map([["goc", email ? { email, token: "t-" + email } : null]]);
  const goi = [];
  const cred = (args) => {
    goi.push(args.join(" "));
    const out = [];
    for (let i = 0; i < args.length;) {
      const op = args[i++];
      if (op === "email") out.push("EMAIL " + (kho.get("goc") ? kho.get("goc").email : "-"));
      else if (op === "luu") { const id = args[i++], mail = args[i++], cur = kho.get("goc"); if (!cur || cur.email !== mail) throw Object.assign(new Error("Đổi đăng nhập Antigravity lỗi: " + id), { code: "AGY_CRED" }); kho.set(id, { ...cur }); out.push("LUU " + id); }
      else if (op === "nap") { const id = args[i++]; kho.set("goc", { ...kho.get(id) }); out.push("NAP " + id); }
      else if (op === "xoa") { kho.delete(args[i++]); out.push("XOA"); }
    }
    return out;
  };
  return { kho, goi, cred, dangNhap: (e) => kho.set("goc", { email: e, token: "t-" + e }) };
}
function fixture(t, { email = "family@gmail.com", busy = () => false, clock } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-agy-tk-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const k = khoGia(email), nhat = [];
  let now = clock || Date.parse("2026-11-16T03:00:00Z");
  const tk = createAgyTaiKhoan({ dir, cred: k.cred, agyDangChay: busy, now: () => now, audit: { log: (...a) => nhat.push(a) } });
  return { tk, k, nhat, dir, tick: (ms) => { now += ms; }, at: () => now };
}
// Mốc mở lại hạn mức tương đối với đồng hồ thật (test dùng createCtl không cố định đồng hồ): không tự hỏng theo ngày.
const SAU_7_NGAY = new Date(Date.now() + 7 * 864e5).toISOString();
const cur = (k) => k.kho.get("goc").email;
const hm = (gemini, reset = "2026-11-21T07:53:29Z") => [{ id: "w", label: "7 ngày", group: "Gemini", remainingPercent: gemini, resetAt: reset }, { id: "c", label: "5 giờ", group: "Claude / GPT trong Antigravity", remainingPercent: 1, resetAt: reset }];

test("cất hai tài khoản: chỉ lưu email (ẩn bớt khi hiện), token không vào file của văn phòng", (t) => {
  const { tk, k, dir } = fixture(t);
  tk.cat("Family");
  k.dangNhap("pro@gmail.com");
  const st = tk.cat("Pro");
  assert.deepEqual(st.ds.map((a) => [a.nhan, a.email, a.dangDung]), [["Family", "fa***@gmail.com", false], ["Pro", "pr***@gmail.com", true]]);
  const raw = fs.readFileSync(path.join(dir, "agy-tai-khoan.json"), "utf8");
  assert.doesNotMatch(raw, /t-family|t-pro|token/, "file sổ của văn phòng không chứa token");
  assert.equal(k.kho.get(st.ds[0].id).email, "family@gmail.com", "đăng nhập cất trong kho của hệ điều hành");
  k.kho.set("goc", null);
  assert.throws(() => tk.cat("X"), { code: "NO_LOGIN" });
});

test("đổi tài khoản: cất lại đăng nhập đang dùng trước khi nạp, kiểm email sau khi nạp; máy đang chạy agy thì không đổi", (t) => {
  let busy = false;
  const { tk, k } = fixture(t, { busy: () => busy });
  const fam = tk.cat("Family").ds[0].id;
  k.dangNhap("pro@gmail.com"); const pro = tk.cat("Pro").ds[1].id;
  k.kho.set("goc", { email: "pro@gmail.com", token: "t-pro-moi" });   // CLI đã làm mới token
  assert.deepEqual(tk.chuyen(fam), { tu: pro, toi: fam, doi: true });
  assert.equal(k.kho.get(pro).token, "t-pro-moi", "token mới của tài khoản cũ được cất lại");
  assert.equal(k.kho.get("goc").email, "family@gmail.com");
  assert.deepEqual(tk.chuyen(fam), { tu: fam, toi: fam, doi: false });
  busy = true;
  assert.throws(() => tk.chuyen(pro), { code: "AGY_BUSY" });
});

test("tự chuyển trước lượt khi tài khoản đang dùng còn ≤ ngưỡng và tài khoản kia còn nhiều hơn; tắt tự chuyển thì giữ nguyên", (t) => {
  const { tk, k, nhat } = fixture(t);
  const fam = tk.cat("Family").ds[0].id;
  k.dangNhap("pro@gmail.com"); const pro = tk.cat("Pro").ds[1].id;
  tk.chuyen(fam);
  tk.ghiHanMuc(hm(40), cur(k));
  assert.equal(tk.truocLuot(), null, "còn 40% (Claude/GPT bên Antigravity không tính) thì không đổi");
  tk.ghiHanMuc(hm(8), cur(k));
  const r = tk.truocLuot();
  assert.equal(r.toi, pro); assert.match(r.lyDo, /Family còn 8% \(≤ 10%\), Pro còn 100%/);
  assert.equal(k.kho.get("goc").email, "pro@gmail.com");
  assert.ok(nhat.some((a) => a[1] === "agy.tai_khoan.chuyen" && /tự chuyển/.test(a[3].lyDo)));
  tk.ghiHanMuc(hm(5), cur(k));
  assert.equal(tk.truocLuot(), null, "Pro còn 5%, Family còn 8%: cả hai dưới ngưỡng thì giữ nguyên, không đổi qua đổi lại");
  tk.chuyen(fam); tk.ghiHanMuc(hm(8, new Date(Date.parse("2026-11-16T02:00:00Z")).toISOString()), cur(k));
  assert.equal(tk.truocLuot(), null, "Family đã qua mốc mở lại (coi như đầy) thì không cần đổi");
});

test("ngưỡng và bật/tắt tự chuyển; cửa sổ đã qua mốc mở lại thì coi như đầy", (t) => {
  const { tk, k, at } = fixture(t);
  tk.cat("Family"); k.dangNhap("pro@gmail.com"); tk.cat("Pro");
  assert.throws(() => tk.sua({ nguong: 80 }), { code: "BAD_REQUEST" });
  assert.equal(tk.sua({ tuChuyen: false, nguong: 20 }).nguong, 20);
  tk.ghiHanMuc(hm(1), cur(k));
  assert.equal(tk.truocLuot(), null, "tắt tự chuyển");
  assert.equal(conLai({ buckets: hm(3, new Date(at() - 1000).toISOString()) }, at()), 100);
  assert.equal(conLai({ buckets: hm(3) }, at()), 3);
  assert.equal(conLai(null), null);
  assert.equal(anEmail("oanh.b@gmail.com"), "oa***@gmail.com");
});

test("đọc hạn mức tài khoản đang nghỉ: đổi sang, đọc, đổi về; tối đa 30 phút một lần; máy bận thì bỏ qua", async (t) => {
  let busy = false;
  const { tk, k, tick } = fixture(t, { busy: () => busy });
  const fam = tk.cat("Family").ds[0].id;
  k.dangNhap("pro@gmail.com"); const pro = tk.cat("Pro").ds[1].id;
  const doc = async () => hm(k.kho.get("goc").email === "family@gmail.com" ? 33 : 77);
  assert.equal(await tk.docNghi(doc), true);
  const st = tk.trangThai();
  assert.equal(st.ds.find((a) => a.id === fam).conLai, 33, "đọc được hạn mức của tài khoản đang nghỉ");
  assert.equal(k.kho.get("goc").email, "pro@gmail.com", "đọc xong trả về tài khoản đang dùng");
  assert.equal(await tk.docNghi(doc), false, "chưa đủ 30 phút");
  tick(31 * 60000); busy = true;
  assert.equal(await tk.docNghi(doc), false, "máy đang chạy agy");
  busy = false;
  assert.equal(await tk.docNghi(doc), true);
  assert.equal(tk.trangThai().ds.find((a) => a.id === pro).dangDung, true);
});

test("API ctl: /agy-tai-khoan đọc, cất, đổi, xoá; bảng hạn mức kèm danh sách tài khoản", async (t) => {
  const { createCtl } = require("../ctl/main");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-agy-api-"));
  const k = khoGia("family@gmail.com");
  const queries = { codex: async () => ({}), claude: async () => ({}), antigravity: async () => ({ status: "SUCCESS", num_turns: 0, command: { name: "usage", data: { groups: [{ name: "Gemini Models", buckets: [{ id: "w", window: "weekly", remaining_fraction: 0.4, reset_time: SAU_7_NGAY }] }] } } }) };
  const ctl = createCtl({ dir, quotaOptions: { queries }, agyOptions: { cred: k.cred, agyDangChay: () => false } });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  t.after(async () => { await ctl.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const call = async (p, body) => { const r = await fetch(`http://127.0.0.1:${ctl.server.address().port}${p}`, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + ctl.token, "Content-Type": "application/json" }, body: body && JSON.stringify(body) }); return [r.status, await r.json()]; };
  let [code, r] = await call("/agy-tai-khoan/cat", { nhan: "Family" });
  assert.equal(code, 200); assert.equal(r.taiKhoan.ds.length, 1);
  k.dangNhap("pro@gmail.com");
  [, r] = await call("/agy-tai-khoan/cat", { nhan: "Pro" });
  const fam = r.taiKhoan.ds[0].id;
  [code, r] = await call(`/agy-tai-khoan/${fam}/chuyen`, {});
  assert.equal(code, 200); assert.equal(r.taiKhoan.ds[0].dangDung, true);
  await ctl.quotas.refresh(true);
  const q = ctl.quotas.snapshot().providers.find((p) => p.id === "antigravity");
  assert.equal(q.taiKhoan.ds.find((a) => a.id === fam).conLai, 40, "hạn mức vừa đọc ghi cho tài khoản đang dùng");
  [code, r] = await call("/agy-tai-khoan/khong-co/chuyen", {});
  assert.equal(code, 404);
  [code, r] = await call(`/agy-tai-khoan/${fam}/xoa`, {});
  assert.equal(r.taiKhoan.ds.length, 1);
});

// 16/11/2026 (thử thật trên máy CEO): trình cập nhật nền agy chạy suốt làm văn phòng tưởng bận; tài khoản Pro thấy model
// (Gemini 4 Argon, Claude Opus 5.5) mà family không có, và có nhóm hạn mức riêng "Gemini 4 Argon".
const { agyDangChayTu, nhomCua } = require("../ctl/agy-tai-khoan");
const hm3 = (gemini, argon, claude) => [{ id: "g", label: "7 ngày", group: "Gemini", remainingPercent: gemini, resetAt: "2026-11-21T07:53:29Z" },
  { id: "a", label: "7 ngày", group: "Gemini 4 Argon", remainingPercent: argon, resetAt: "2026-11-21T07:53:29Z" },
  { id: "c", label: "5 giờ", group: "Claude / GPT trong Antigravity", remainingPercent: claude, resetAt: "2026-11-21T07:53:29Z" }];

test("trình cập nhật nền của agy không tính là bận; lượt AI, đọc hạn mức, phiên mở tay thì tính", () => {
  assert.equal(agyDangChayTu(["agy.exe C:/x/agy.exe --bg-updater --app_data_dir=antigravity-cli"]), false);
  assert.equal(agyDangChayTu(["agy.exe C:/x/agy.exe -p /usage --output-format json"]), true);
  assert.equal(agyDangChayTu(["agy.exe \"C:/x/agy.exe\""]), true, "phiên anh tự mở");
  assert.equal(agyDangChayTu([]), false);
});

test("hạn mức tính theo nhóm của model: Flash → Gemini, Argon → Gemini 4 Argon, Claude/GPT → nhóm Claude/GPT", () => {
  const hanMuc = { buckets: hm3(50, 5, 1) };
  assert.equal(conLai(hanMuc, Date.parse("2026-11-16T03:00:00Z")), 50);
  assert.equal(conLai(hanMuc, Date.parse("2026-11-16T03:00:00Z"), "gemini-3.8-flash-high"), 50);
  assert.equal(conLai(hanMuc, Date.parse("2026-11-16T03:00:00Z"), "gemini-4-argon-high"), 5);
  assert.equal(conLai(hanMuc, Date.parse("2026-11-16T03:00:00Z"), "claude-opus-5-5-high"), 1);
  assert.equal(conLai({ buckets: hm3(50, 5, 1).filter((b) => b.group !== "Gemini 4 Argon") }, Date.parse("2026-11-16T03:00:00Z"), "gemini-4-argon-high"), 0, "tài khoản đã có hạn mức mà không có nhóm Argon = không có model Argon");
  assert.ok(nhomCua("gemini-pro-orchestrator-g1-pro")("Gemini 4 Argon"));
});

test("model chỉ tài khoản Pro có: đang ở Family thì đổi sang Pro; Pro sắp cạn nhóm Argon thì không đổi sang Family (không có model)", (t) => {
  const { tk, k } = fixture(t);
  const fam = tk.cat("Family").ds[0].id;
  tk.ghiModels(["gemini-3.8-flash-high"], cur(k));
  k.dangNhap("pro@gmail.com"); const pro = tk.cat("Pro").ds[1].id;
  tk.ghiModels(["gemini-3.8-flash-high", "gemini-4-argon-high"], cur(k));
  tk.chuyen(fam);
  const r = tk.truocLuot({ model: "gemini-4-argon-high" });
  assert.equal(r.toi, pro); assert.match(r.lyDo, /Family không có model gemini-4-argon-high, Pro có/);
  tk.ghiHanMuc(hm3(80, 5, 100), cur(k));
  assert.equal(tk.truocLuot({ model: "gemini-4-argon-high" }), null, "Family không có Argon nên giữ Pro dù Argon còn 5%");
  assert.equal(tk.truocLuot({ model: "gemini-3.8-flash-high" }), null, "Flash của Pro còn 80%: không đổi vì nhóm Argon cạn");
  tk.ghiHanMuc(hm3(8, 90, 100), cur(k));
  assert.equal(tk.truocLuot().toi, fam, "Flash của Pro còn 8% thì sang Family (chưa biết hạn mức = coi như đầy)");
  tk.sua({ tuChuyen: false });
  assert.match(tk.truocLuot({ model: "gemini-4-argon-high" }).loi, /Family không có model gemini-4-argon-high và tự chuyển đang tắt/);
  assert.equal(tk.trangThai().ds.find((a) => a.id === pro).soModel, 2);
});

test("đọc tài khoản nghỉ: đọc thêm danh sách model; đổi về bị chặn vì máy bận thì thử lại, không kẹt ở tài khoản nghỉ", async (t) => {
  let busyLan = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-agy-tk-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const k = khoGia("family@gmail.com"), cho = [];
  let ganDoi = false;
  const tk = createAgyTaiKhoan({ dir, cred: k.cred, agyDangChay: () => ganDoi && busyLan-- > 0, now: () => Date.parse("2026-11-16T03:00:00Z"), cho: async (ms) => { cho.push(ms); } });
  const fam = tk.cat("Family").ds[0].id;
  k.dangNhap("pro@gmail.com"); tk.cat("Pro");
  tk.chuyen(fam);
  const doc = async () => { ganDoi = true; busyLan = 2; return hm(60); };
  assert.equal(await tk.docNghi(doc, { docModels: async () => ["gemini-4-argon-high", "gemini-3.8-flash-high"] }), true);
  assert.equal(k.kho.get("goc").email, "family@gmail.com", "đổi về được sau 2 lần máy bận");
  assert.deepEqual(cho, [5000, 5000]);
  assert.deepEqual(tk.modelTheoTk().map((x) => [x.nhan, x.models.length]), [["Pro", 2]]);
});

test("bảng chọn model Antigravity: hợp các tài khoản, model chỉ một tài khoản có thì ghi 'chỉ <tên>'", async (t) => {
  const { createQuotas } = require("../ctl/quotas");
  const { tk, k } = fixture(t);
  tk.cat("Family"); tk.ghiModels(["gemini-3.8-flash-high"], cur(k));
  k.dangNhap("pro@gmail.com"); tk.cat("Pro");
  const q = createQuotas({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "vp-q-")), agyTk: tk, queries: {
    codex: async () => ({}), claude: async () => ({}), antigravity: async () => ({}),
    codexModels: async () => ({ data: [{ id: "gpt-6-astra", displayName: "Astra" }] }),
    agyModels: async () => "gemini-3.8-flash-high\tGemini 3.8 Flash (High)\ngemini-4-argon-high\tGemini 4 Argon (High)\n" } });
  t.after(() => q.close());
  const m = await q.models(true);
  assert.deepEqual(m.agy.models.map((x) => x.name), ["Gemini 3.8 Flash (High)", "Gemini 4 Argon (High) · chỉ Pro"]);
  assert.deepEqual(tk.modelTheoTk().find((x) => x.nhan === "Pro").models, ["gemini-3.8-flash-high", "gemini-4-argon-high"], "danh sách vừa đọc ghi cho tài khoản đang dùng (Pro)");
});

// Rà soát độc lập 16/11/2026: các tranh chấp khi đổi tài khoản và model theo tài khoản.
function haiTk(t, opts = {}) {
  const f = fixture(t, opts);
  const fam = f.tk.cat("Family").ds[0].id;
  f.k.dangNhap("pro@gmail.com"); const pro = f.tk.cat("Pro").ds[1].id;
  return { ...f, fam, pro };
}
const thu = (fn) => { try { fn(); return "ok"; } catch (e) { return e.code; } };
const soTk = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "agy-tai-khoan.json"), "utf8"));

test("đang tạm đổi sang tài khoản nghỉ: lượt AI và lệnh đổi của anh bị từ chối (AGY_BUSY); không trả lại được thì nhớ để lần sau trả", async (t) => {
  let busy = false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-agy-tk-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const k = khoGia("family@gmail.com");
  const tk = createAgyTaiKhoan({ dir, cred: k.cred, agyDangChay: () => busy, now: () => Date.parse("2026-11-16T03:00:00Z"), cho: async () => {} });
  const fam = tk.cat("Family").ds[0].id; k.dangNhap("pro@gmail.com"); const pro = tk.cat("Pro").ds[1].id;
  let trongLuc = null;
  assert.equal(await tk.docNghi(async () => {
    trongLuc = [thu(() => tk.truocLuot()), thu(() => tk.chuyen(pro))];
    busy = true;   // một tiến trình agy chen vào: không đổi về được
    return hm(50);
  }), true);
  assert.deepEqual(trongLuc, ["AGY_BUSY", "AGY_BUSY"]);
  assert.equal(k.kho.get("goc").email, "family@gmail.com", "máy bận nên còn ở tài khoản nghỉ");
  assert.deepEqual(soTk(dir).traVe, { ve: pro, muon: fam }, "nhớ phải trả lại Pro (đang mượn Family)");
  busy = false;
  tk.truocLuot();
  assert.equal(k.kho.get("goc").email, "pro@gmail.com", "lượt kế tiếp trả lại tài khoản đang dùng trước");
  assert.equal(soTk(dir).traVe, null);
});

test("đăng nhập hiện tại chưa cất: không tự đổi (mất đăng nhập), đổi tay cũng từ chối kèm hướng dẫn", (t) => {
  const { tk, k, fam } = haiTk(t);
  tk.ghiHanMuc(hm(1), cur(k));
  k.dangNhap("moi@gmail.com");
  assert.match(tk.truocLuot().loi, /chưa cất \(mo\*\*\*@gmail\.com\)/);
  assert.throws(() => tk.chuyen(fam), { code: "AGY_UNSAVED" });
  assert.equal(k.kho.get("goc").email, "moi@gmail.com", "đăng nhập mới vẫn còn");
  k.kho.set("goc", null);
  assert.equal(tk.truocLuot().toi, fam, "chưa đăng nhập gì thì nạp được");
});

test("ghi hạn mức / model chỉ khi biết chắc của tài khoản nào: đổi đăng nhập giữa lúc đọc thì bỏ kết quả", async (t) => {
  const { tk, k, fam, pro } = haiTk(t);
  tk.ghiHanMuc(hm(3));
  assert.equal(tk.trangThai().ds.find((a) => a.id === pro).hanMuc, null, "không kèm email thì không ghi (không đoán theo bản nhớ 60 giây)");
  let r = await tk.docVoiTk(async () => { k.dangNhap("family@gmail.com"); return "x"; });
  assert.deepEqual(r, { value: "x", email: null }, "anh tự đăng nhập tài khoản khác giữa lúc đọc");
  r = await tk.docVoiTk(async () => "y");
  assert.deepEqual(r, { value: "y", email: "family@gmail.com" });
  r = await tk.docVoiTk(async () => { tk.chuyen(pro); tk.chuyen(fam); return "z"; });
  assert.equal(r.email, null, "đổi đi rồi đổi về giữa lúc đọc cũng bỏ");
});

test("bảng chọn model: đổi tài khoản trong lúc đọc model thì không gán danh sách của Pro cho Family", async (t) => {
  const { createQuotas } = require("../ctl/quotas");
  const { tk, k, fam } = haiTk(t);
  const theoTk = () => k.kho.get("goc").email === "pro@gmail.com" ? "gemini-3.8-flash-high\tFlash\ngemini-4-argon-high\tArgon\n" : "gemini-3.8-flash-high\tFlash\n";
  const qdir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-q-"));
  const q = createQuotas({ dir: qdir, agyTk: tk, queries: {
    codex: async () => ({}), claude: async () => ({}), antigravity: async () => ({}),
    codexModels: () => new Promise((r) => setTimeout(() => r({ data: [] }), 60)),
    agyModels: async () => { const s = theoTk(); await new Promise((r) => setTimeout(r, 30)); return s; } } });
  t.after(async () => { await q.close(); fs.rmSync(qdir, { recursive: true, force: true }); });
  const m = q.models(true);
  await new Promise((r) => setTimeout(r, 10));
  tk.chuyen(fam);
  await m;
  assert.deepEqual(tk.modelTheoTk(), [], "đọc lúc ở Pro, xong lúc ở Family: không ghi cho ai");
  await q.models(true);
  assert.deepEqual(tk.modelTheoTk(), [{ id: fam, nhan: "Family", models: ["gemini-3.8-flash-high"] }]);
});

test("model Argon: tài khoản chưa đọc danh sách model không được coi là có Argon", (t) => {
  const { tk, k } = haiTk(t);
  tk.ghiModels(["gemini-3.8-flash-high", "gemini-4-argon-high"], cur(k));
  tk.ghiHanMuc(hm3(90, 5, 100), cur(k));
  assert.equal(tk.truocLuot({ model: "gemini-4-argon-high" }), null, "Family chưa biết có Argon không: giữ Pro");
  assert.equal(k.kho.get("goc").email, "pro@gmail.com");
});

test("runner: lượt Antigravity lấy model thật trong lệnh tự cấu hình để chọn tài khoản; đổi tài khoản thì chấm mức theo tài khoản sẽ chạy", async (t) => {
  const { createCtl } = require("../ctl/main");
  const { execFileSync } = require("node:child_process");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-agy-run-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-agy-ws-"));
  t.after(() => { fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  fs.writeFileSync(path.join(root, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): SPEC_ARCHITECT\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PENDING\n");
  git("add", "-A"); git("commit", "-qm", "agent");
  const fake = path.join(home, "agy.js");
  fs.writeFileSync(fake, "console.log(JSON.stringify(process.argv.slice(2,6)));");
  fs.writeFileSync(path.join(home, "quyen.json"), JSON.stringify({ toanQuyen: false }));
  const k = khoGia("family@gmail.com");
  const usage = (g) => ({ status: "SUCCESS", num_turns: 0, command: { name: "usage", data: { groups: [{ name: "Gemini Models", buckets: [{ id: "w", window: "weekly", remaining_fraction: g, reset_time: SAU_7_NGAY }] }] } } });
  const queries = { codex: async () => ({}), claude: async () => ({}), antigravity: async () => usage(k.kho.get("goc").email === "family@gmail.com" ? 0.04 : 0.9) };
  const chay = async (argvAgy, lam) => {
    fs.writeFileSync(path.join(home, "ctl-agents.json"), JSON.stringify({ SPEC_ARCHITECT: [process.execPath, fake, ...argvAgy, "-p", "{prompt}"] }));
    const ctl = createCtl({ dir: home, quotaOptions: { queries }, agyOptions: { cred: k.cred, agyDangChay: () => false } });
    try {
      ctl.ws.add(root);
      const job = await lam(ctl);
      for (let i = 0; i < 100 && ctl.jobs.get(job.id).status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
      try { ctl.runner.reject(job.id, "ceo"); } catch {}
    } finally { await ctl.close(); }
  };
  await chay(["--model", "gemini-4-argon-high"], async (ctl) => {
    const tk = ctl.agyTk;
    tk.cat("Family"); tk.ghiModels(["gemini-3.8-flash-high"], "family@gmail.com");
    k.dangNhap("pro@gmail.com"); tk.cat("Pro"); tk.ghiModels(["gemini-3.8-flash-high", "gemini-4-argon-high"], "pro@gmail.com");
    tk.chuyen(tk.trangThai().ds[0].id);
    const job = ctl.runner.run({ workspace: root, role: "SPEC_ARCHITECT", task: "Viết đặc tả" });
    assert.equal(job.dieuPhoi.model, "gemini-4-argon-high", "model thật trong lệnh, không phải model của bảng");
    assert.match(job.dieuPhoi.why.join(" | "), /Family không có model gemini-4-argon-high, Pro có/);
    assert.equal(k.kho.get("goc").email, "pro@gmail.com");
    return job;
  });
  await chay([], async (ctl) => {
    const tk = ctl.agyTk, fam = tk.trangThai().ds.find((a) => a.nhan === "Family").id;
    tk.chuyen(fam);
    await ctl.quotas.refresh(true);
    assert.equal(tk.trangThai().ds.find((a) => a.id === fam).conLai, 4);
    tk.ghiHanMuc([{ id: "w", group: "Gemini", remainingPercent: 90, resetAt: SAU_7_NGAY }], "pro@gmail.com");
    const job = ctl.runner.run({ workspace: root, role: "SPEC_ARCHITECT", task: "Viết đặc tả" });
    assert.equal(k.kho.get("goc").email, "pro@gmail.com", "Family còn 4% thì sang Pro");
    assert.notEqual(job.dieuPhoi.tier, "nhe", "chấm theo Pro còn 90%, không bị ép mức nhẹ nhất vì Family còn 4%");
    assert.doesNotMatch(job.dieuPhoi.why.join(" | "), /hạn mức còn 4%/);
    return job;
  });
});

// Rà soát lần 2 (16/11/2026): trả lại tài khoản chỉ khi đúng tài khoản đã mượn; bỏ tài khoản; model chưa rõ.
async function deTraVe(t) {
  let busy = false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-agy-tk-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const k = khoGia("family@gmail.com");
  const tk = createAgyTaiKhoan({ dir, cred: k.cred, agyDangChay: () => busy, now: () => Date.parse("2026-11-16T03:00:00Z"), cho: async () => {} });
  const fam = tk.cat("Family").ds[0].id; k.dangNhap("pro@gmail.com"); const pro = tk.cat("Pro").ds[1].id;
  await tk.docNghi(async () => { busy = true; return hm(50); });
  assert.deepEqual(soTk(dir).traVe, { ve: pro, muon: fam });
  return { tk, k, dir, fam, pro, ranh: () => { busy = false; }, ban: () => { busy = true; } };
}

test("còn phải trả lại: anh tự đăng nhập rồi Cất, hoặc tự đổi sang tài khoản khác, thì bỏ việc trả lại (giữ lựa chọn của anh)", async (t) => {
  const a = await deTraVe(t);
  a.ranh();
  a.k.dangNhap("moi@gmail.com"); a.tk.cat("Mới");
  assert.equal(soTk(a.dir).traVe, null, "Cất bỏ việc trả lại");
  assert.equal(a.tk.truocLuot(), null);
  assert.equal(a.k.kho.get("goc").email, "moi@gmail.com", "không bị đổi về Pro");
  const b = await deTraVe(t);
  b.ranh(); b.k.dangNhap("pro@gmail.com");   // anh tự đăng nhập lại đúng Pro bằng agy
  assert.equal(b.tk.truocChay(), null);
  assert.equal(soTk(b.dir).traVe, null);
});

test("còn phải trả lại mà máy bận: lượt AI / chat bị AGY_BUSY (không chạy bằng tài khoản mượn); rảnh thì trả lại và báo để chấm lại mức", async (t) => {
  const { tk, k, dir, fam, pro, ranh } = await deTraVe(t);
  assert.throws(() => tk.truocLuot(), (e) => e.code === "AGY_BUSY" && /còn ở Family .* chưa trả lại được Pro/.test(e.message));
  assert.throws(() => tk.truocChay(), { code: "AGY_BUSY" });
  assert.equal(k.kho.get("goc").email, "family@gmail.com");
  ranh();
  tk.ghiHanMuc(hm(70), "pro@gmail.com");
  const r = tk.truocLuot();
  assert.deepEqual([r.tu, r.toi], [fam, pro]); assert.match(r.lyDo, /trả lại Pro \(văn phòng đã mượn Family/);
  assert.equal(r.buckets[0].remainingPercent, 70, "kèm hạn mức của tài khoản sẽ chạy để runner chấm lại mức");
  assert.equal(k.kho.get("goc").email, "pro@gmail.com");
  assert.equal(soTk(dir).traVe, null);
  assert.equal(tk.trangThai().choTraLai, null);
});

test("bỏ tài khoản: không bỏ được khi đang mượn tài khoản nghỉ; bỏ tài khoản đang dùng rồi đổi sang tài khoản còn lại vẫn được", async (t) => {
  const { tk, k, fam, pro } = haiTk(t);
  void fam;
  tk.xoa(pro);   // đang dùng Pro
  assert.equal(k.kho.get("goc").email, "pro@gmail.com");
  const r = tk.chuyen(tk.trangThai().ds[0].id);
  assert.equal(r.doi, true, "đăng nhập của tài khoản vừa bỏ được nạp đè, không báo 'chưa cất'");
  assert.equal(k.kho.get("goc").email, "family@gmail.com");
  const h = haiTk(t);
  let loi = null;
  const tk2 = createAgyTaiKhoan({ dir: h.dir, cred: h.k.cred, agyDangChay: () => false, now: () => Date.parse("2026-11-16T03:00:00Z"), cho: async () => {} });
  await tk2.docNghi(async () => { loi = thu(() => tk2.xoa(h.fam)); return hm(50); }, { force: true });
  assert.equal(loi, "AGY_BUSY");
});

test("model Pro có mà Family đã biết là không có (Pro chưa đọc danh sách): vẫn đổi sang Pro", (t) => {
  const { tk, k, fam, pro } = haiTk(t);
  tk.chuyen(fam); tk.ghiModels(["gemini-3.8-flash-high"], cur(k)); tk.ghiHanMuc(hm(80), cur(k));
  const r = tk.truocLuot({ model: "claude-opus-5-5-high" });
  assert.equal(r && r.toi, pro);
});

test("bấm đọc tài khoản nghỉ đúng lúc bảng hạn mức đang làm mới: chờ làm mới xong rồi đọc, không bỏ qua im lặng", async (t) => {
  const { createQuotas } = require("../ctl/quotas");
  const { tk, k, fam } = haiTk(t);
  tk.chuyen(fam);
  let mo = null;
  const qdir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-q-"));
  const usage = () => ({ status: "SUCCESS", num_turns: 0, command: { name: "usage", data: { groups: [{ name: "Gemini Models", buckets: [{ id: "w", window: "weekly", remaining_fraction: k.kho.get("goc").email === "pro@gmail.com" ? 0.66 : 0.3, reset_time: SAU_7_NGAY }] }] } } });
  const q = createQuotas({ dir: qdir, agyTk: tk, queries: {
    codex: async () => ({}), claude: async () => ({}),
    antigravity: () => (mo ? usage() : new Promise((r) => { mo = () => r(usage()); })) } });
  t.after(async () => { await q.close(); fs.rmSync(qdir, { recursive: true, force: true }); });
  q.refresh(true);                       // đang làm mới (đọc Antigravity chưa xong)
  await new Promise((r) => setTimeout(r, 20));
  const p = q.docNghi(true);             // anh bấm "đọc ngay"
  mo();
  assert.equal(await p, true, "đã đọc tài khoản nghỉ sau khi làm mới xong");
  assert.equal(tk.trangThai().ds.find((a) => a.nhan === "Pro").conLai, 66);
  assert.equal(k.kho.get("goc").email, "family@gmail.com", "trả lại tài khoản đang dùng");
});
