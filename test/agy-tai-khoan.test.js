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
  tk.ghiHanMuc(hm(40));
  assert.equal(tk.truocLuot(), null, "còn 40% (Claude/GPT bên Antigravity không tính) thì không đổi");
  tk.ghiHanMuc(hm(8));
  const r = tk.truocLuot();
  assert.equal(r.toi, pro); assert.match(r.lyDo, /Family còn 8% \(≤ 10%\), Pro còn 100%/);
  assert.equal(k.kho.get("goc").email, "pro@gmail.com");
  assert.ok(nhat.some((a) => a[1] === "agy.tai_khoan.chuyen" && /tự chuyển/.test(a[3].lyDo)));
  tk.ghiHanMuc(hm(5));
  assert.equal(tk.truocLuot(), null, "Pro còn 5%, Family còn 8%: cả hai dưới ngưỡng thì giữ nguyên, không đổi qua đổi lại");
  tk.chuyen(fam); tk.ghiHanMuc(hm(8, new Date(Date.parse("2026-11-16T02:00:00Z")).toISOString()));
  assert.equal(tk.truocLuot(), null, "Family đã qua mốc mở lại (coi như đầy) thì không cần đổi");
});

test("ngưỡng và bật/tắt tự chuyển; cửa sổ đã qua mốc mở lại thì coi như đầy", (t) => {
  const { tk, k, at } = fixture(t);
  tk.cat("Family"); k.dangNhap("pro@gmail.com"); tk.cat("Pro");
  assert.throws(() => tk.sua({ nguong: 80 }), { code: "BAD_REQUEST" });
  assert.equal(tk.sua({ tuChuyen: false, nguong: 20 }).nguong, 20);
  tk.ghiHanMuc(hm(1));
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
  const queries = { codex: async () => ({}), claude: async () => ({}), antigravity: async () => ({ status: "SUCCESS", num_turns: 0, command: { name: "usage", data: { groups: [{ name: "Gemini Models", buckets: [{ id: "w", window: "weekly", remaining_fraction: 0.4, reset_time: "2026-11-21T07:53:29Z" }] }] } } }) };
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
  assert.equal(conLai({ buckets: hm3(50, 5, 1).filter((b) => b.group !== "Gemini 4 Argon") }, Date.parse("2026-11-16T03:00:00Z"), "gemini-4-argon-high"), 50, "tài khoản không có nhóm Argon thì xét nhóm Gemini");
  assert.ok(nhomCua("gemini-pro-orchestrator-g1-pro")("Gemini 4 Argon"));
});

test("model chỉ tài khoản Pro có: đang ở Family thì đổi sang Pro; Pro sắp cạn nhóm Argon thì không đổi sang Family (không có model)", (t) => {
  const { tk, k } = fixture(t);
  const fam = tk.cat("Family").ds[0].id;
  tk.ghiModels(["gemini-3.8-flash-high"]);
  k.dangNhap("pro@gmail.com"); const pro = tk.cat("Pro").ds[1].id;
  tk.ghiModels(["gemini-3.8-flash-high", "gemini-4-argon-high"]);
  tk.chuyen(fam);
  const r = tk.truocLuot({ model: "gemini-4-argon-high" });
  assert.equal(r.toi, pro); assert.match(r.lyDo, /Family không có model gemini-4-argon-high, Pro có/);
  tk.ghiHanMuc(hm3(80, 5, 100));
  assert.equal(tk.truocLuot({ model: "gemini-4-argon-high" }), null, "Family không có Argon nên giữ Pro dù Argon còn 5%");
  assert.equal(tk.truocLuot({ model: "gemini-3.8-flash-high" }), null, "Flash của Pro còn 80%: không đổi vì nhóm Argon cạn");
  tk.ghiHanMuc(hm3(8, 90, 100));
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
  tk.cat("Family"); tk.ghiModels(["gemini-3.8-flash-high"]);
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
