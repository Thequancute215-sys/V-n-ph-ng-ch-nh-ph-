"use strict";
// Nhiều tài khoản GPT cho Codex (ctl/codex-tai-khoan.js): mỗi tài khoản một CODEX_HOME, không đụng file đăng nhập,
// dùng chung cấu hình/skill/sandbox với ~/.codex, tự chuyển khi cạn, đổi ngay khi lượt báo hết hạn mức.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createCodexTaiKhoan, MAC_DINH } = require("../ctl/codex-tai-khoan");
const { createQuotas } = require("../ctl/quotas");

function fixture(t, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-gpt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const goc = path.join(root, "dot-codex"), dir = path.join(root, "vp");
  fs.mkdirSync(path.join(goc, "skills", "tdd"), { recursive: true });
  fs.mkdirSync(path.join(goc, ".sandbox-secrets"), { recursive: true });
  fs.writeFileSync(path.join(goc, "config.toml"), 'model = "gpt-6.2-sol"\n[windows]\nsandbox = "elevated"\n');
  fs.writeFileSync(path.join(goc, "AGENTS.md"), "Luật chung\n");
  fs.writeFileSync(path.join(goc, "auth.json"), '{"khong-duoc-cham":true}');
  const tk = createCodexTaiKhoan({ dir, homeGoc: () => goc, ...opts });
  return { root, goc, dir, tk };
}
const rate = (pct) => ({ buckets: [{ id: "codex-primary", label: "5 giờ", remainingPercent: pct }, { id: "codex-secondary", label: "7 ngày", remainingPercent: Math.min(100, pct + 20) }] });

test("thêm tài khoản: thư mục riêng, chép cấu hình + luật, nối skill/sandbox; KHÔNG chép file đăng nhập", (t) => {
  const f = fixture(t);
  assert.deepEqual(f.tk.env(), {}, "tài khoản 1 = ~/.codex như bình thường");
  const s = f.tk.them("GPT Pro 2");
  const a = s.ds.find((x) => x.nhan === "GPT Pro 2");
  assert.match(a.id, /^gpt-[0-9a-f]{6}$/);
  const home = path.join(f.dir, "codex-tk", a.id);
  assert.equal(fs.readFileSync(path.join(home, "config.toml"), "utf8"), fs.readFileSync(path.join(f.goc, "config.toml"), "utf8"));
  assert.equal(fs.readFileSync(path.join(home, "AGENTS.md"), "utf8"), "Luật chung\n");
  assert.equal(fs.realpathSync(path.join(home, "skills")), fs.realpathSync(path.join(f.goc, "skills")), "skill dùng chung (junction)");
  assert.equal(fs.realpathSync(path.join(home, ".sandbox-secrets")), fs.realpathSync(path.join(f.goc, ".sandbox-secrets")), "sandbox elevated dùng chung");
  assert.ok(!fs.existsSync(path.join(home, "auth.json")), "không chép đăng nhập của tài khoản 1");
  // Cấu hình ~/.codex đổi thì lần dùng sau được đồng bộ
  fs.writeFileSync(path.join(f.goc, "config.toml"), 'model = "gpt-7"\n');
  f.tk.chuyen(a.id);
  assert.deepEqual(f.tk.env(), { CODEX_HOME: home });
  assert.match(fs.readFileSync(path.join(home, "config.toml"), "utf8"), /gpt-7/);
  assert.throws(() => f.tk.them("gpt pro 2"), /Đã có/);
  assert.throws(() => f.tk.them("  "), /Đặt tên/);
});

test("đọc hạn mức mọi tài khoản bằng CODEX_HOME riêng; email che bớt; báo khi hai tài khoản cùng email", async (t) => {
  const f = fixture(t);
  const a = f.tk.them("GPT 2").ds.find((x) => x.nhan === "GPT 2");
  const seen = [];
  await f.tk.docTatCa(async (env) => { seen.push(env.CODEX_HOME || "~"); return env.CODEX_HOME ? { ...rate(80), email: "hai@vidu.com", plan: "pro" } : { ...rate(5), email: "mot@vidu.com", plan: "pro" }; });
  assert.equal(seen.length, 2);
  let s = f.tk.trangThai();
  const [m, b] = [s.ds.find((x) => x.id === MAC_DINH), s.ds.find((x) => x.id === a.id)];
  assert.deepEqual([m.conLai, b.conLai, m.email, b.email, b.plan, s.trung], [5, 80, "mo***@vidu.com", "ha***@vidu.com", "pro", false]);
  assert.ok(!JSON.stringify(s).includes("hai@vidu.com"), "không lộ email đầy đủ");
  await f.tk.docTatCa(async () => ({ ...rate(50), email: "mot@vidu.com" }));
  assert.equal(f.tk.trangThai().trung, true, "đăng nhập nhầm cùng một tài khoản");
});

test("tự chuyển trước lượt khi tài khoản đang dùng ≤ ngưỡng; không chuyển sang tài khoản cùng email hay cũng sắp cạn", async (t) => {
  const f = fixture(t);
  const a = f.tk.them("GPT 2").ds.find((x) => x.nhan === "GPT 2");
  await f.tk.docTatCa(async (env) => (env.CODEX_HOME ? { ...rate(70), email: "b@x.vn" } : { ...rate(8), email: "a@x.vn" }));
  const d = f.tk.truocLuot();
  assert.deepEqual([d.tu, d.toi], [MAC_DINH, a.id]);
  assert.match(d.lyDo, /còn 8% → GPT 2 còn 70%/);
  assert.equal(f.tk.truocLuot(), null, "tài khoản mới còn nhiều: không chuyển nữa");
  // Cả hai sắp cạn: báo, không chuyển
  await f.tk.docTatCa(async (env) => (env.CODEX_HOME ? { ...rate(4), email: "b@x.vn" } : { ...rate(6), email: "a@x.vn" }));
  assert.match(f.tk.truocLuot().loi, /đều sắp cạn/);
  // Tắt tự chuyển
  f.tk.sua({ tuChuyen: false });
  assert.equal(f.tk.truocLuot(), null);
  assert.throws(() => f.tk.sua({ nguong: 90 }), /1 đến 50/);
});

test("lượt Codex báo hết hạn mức: đánh dấu cạn và đổi ngay sang tài khoản còn hạn mức", async (t) => {
  const f = fixture(t);
  const a = f.tk.them("GPT 2").ds.find((x) => x.nhan === "GPT 2");
  await f.tk.docTatCa(async (env) => (env.CODEX_HOME ? { ...rate(60), email: "b@x.vn" } : { ...rate(40), email: "a@x.vn" }));
  const d = f.tk.baoCan();
  assert.equal(d.toi, a.id);
  assert.equal(f.tk.trangThai().ds.find((x) => x.id === MAC_DINH).conLai, 0, "tài khoản vừa báo hết coi là cạn tới lần đọc sau");
  assert.equal(f.tk.baoCan(), null, "tài khoản kia cũng hết: không còn chỗ đổi");
});

test("đăng nhập: chạy codex login với CODEX_HOME của tài khoản, đọc link, xong thì gọi đọc hạn mức; chưa đăng nhập thì không đổi sang", async (t) => {
  let goi = null, child = null, xong = null;
  const chay = (cmd, args, o) => { goi = { cmd, args, env: o.env }; child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.exitCode = null; child.kill = () => {}; return child; };
  const f = fixture(t, { chay, cli: () => ["C:/cx/codex.exe"], khiDangNhapXong: (id) => { xong = id; } });
  const a = f.tk.them("GPT 2").ds.find((x) => x.nhan === "GPT 2");
  f.tk.moDangNhap(a.id);
  assert.deepEqual([goi.cmd, goi.args], ["C:/cx/codex.exe", ["login"]]);
  assert.equal(goi.env.CODEX_HOME, path.join(f.dir, "codex-tk", a.id));
  assert.ok(!Object.keys(goi.env).some((k) => /TOKEN|SECRET|PASSWORD/i.test(k)), "không chuyền biến bí mật sang");
  child.stdout.emit("data", "Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL:\nhttps://auth.openai.com/oauth/authorize?client_id=x&state=y\n");
  assert.match(f.tk.trangThai().ds.find((x) => x.id === a.id).dangNhap.url, /^https:\/\/auth\.openai\.com\/oauth\/authorize/);
  child.exitCode = 0; child.emit("exit", 0);
  assert.equal(xong, a.id);
  // Đọc hạn mức báo chưa đăng nhập: không cho đổi sang
  await f.tk.docTatCa(async (env) => { if (env.CODEX_HOME) throw new Error("Codex chưa trả lời; kiểm tra đăng nhập ChatGPT."); return rate(50); });
  assert.throws(() => f.tk.chuyen(a.id), /chưa đăng nhập/);
});

test("bỏ tài khoản: không bỏ được tài khoản 1; bỏ tài khoản đang dùng thì về tài khoản 1, thư mục vẫn giữ", (t) => {
  const f = fixture(t);
  const a = f.tk.them("GPT 2").ds.find((x) => x.nhan === "GPT 2");
  f.tk.chuyen(a.id);
  assert.throws(() => f.tk.bo(MAC_DINH), /Không bỏ được/);
  const s = f.tk.bo(a.id);
  assert.equal(s.dangDung, MAC_DINH);
  assert.deepEqual(f.tk.env(), {});
  assert.ok(fs.existsSync(path.join(f.dir, "codex-tk", a.id)), "thư mục đăng nhập giữ nguyên, CEO tự xoá nếu muốn");
});

test("bộ hạn mức: đọc tài khoản đang dùng bằng CODEX_HOME của nó và đọc mọi tài khoản kèm email/gói", async (t) => {
  const f = fixture(t);
  const a = f.tk.them("GPT 2").ds.find((x) => x.nhan === "GPT 2");
  f.tk.chuyen(a.id);
  const goi = [];
  const raw = (pct) => ({ rateLimits: { planType: "pro", primary: { usedPercent: 100 - pct, windowDurationMins: 300 } } });
  const queries = {
    codex: async (env) => { goi.push(["rate", env && env.CODEX_HOME ? "tk2" : "goc"]); return env && env.CODEX_HOME ? raw(77) : raw(11); },
    codexAccount: async (env) => ({ account: { email: env && env.CODEX_HOME ? "hai@x.vn" : "mot@x.vn", planType: "pro" } }),
    claude: async () => { throw new Error("x"); }, antigravity: async () => { throw new Error("x"); }, close: async () => {},
  };
  const q = createQuotas({ dir: f.dir, queries, codexTk: f.tk, intervalMs: 60000 });
  t.after(() => q.close());
  await q.refresh(true);
  await q.docGpt(true);
  const codex = q.snapshot().providers.find((p) => p.id === "codex");
  assert.equal(codex.buckets[0].remainingPercent, 77, "ô Codex hiện hạn mức của tài khoản đang dùng");
  assert.equal(goi[0][1], "tk2");
  const ds = codex.taiKhoan.ds;
  assert.deepEqual(ds.map((x) => [x.nhan, x.conLai, x.email]), [["GPT 1", 11, "mo***@x.vn"], ["GPT 2", 77, "ha***@x.vn"]]);
});

test("bộ chạy việc: tiến trình nhận biến môi trường của tài khoản lúc khởi chạy (envFor), không phải lúc tạo", async (t) => {
  const { open } = require("../ctl/db");
  const { createJobs } = require("../ctl/jobs");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-gpt-jobs-"));
  const db = open(d);
  t.after(() => { try { db.close(); } catch {} fs.rmSync(d, { recursive: true, force: true }); });
  let home = "C:/vp/codex-tk/gpt-aaaaaa";
  const jobs = createJobs(db, { log() {} }, path.join(d, "logs"), { envFor: () => ({ CODEX_HOME: home }) });   // home = null: phải bỏ qua, không đặt chữ "null"
  const j = jobs.start({ kind: "cmd", agent: "THU", argv: [process.execPath, "-e", "console.log('HOME=' + (process.env.CODEX_HOME || 'none'))"], timeoutMs: 20000 });
  for (let i = 0; i < 100 && jobs.get(j.id).status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
  assert.match(jobs.rawLog(j.id), /HOME=C:\/vp\/codex-tk\/gpt-aaaaaa/);
  home = null;
  const j2 = jobs.start({ kind: "cmd", agent: "THU", argv: [process.execPath, "-e", "console.log('HOME=' + (process.env.CODEX_HOME || 'none'))"], timeoutMs: 20000 });
  for (let i = 0; i < 100 && jobs.get(j2.id).status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
  assert.match(jobs.rawLog(j2.id), /HOME=(none|.*\.codex)/);
});

test("phần chương trình của lệnh: Codex chạy qua node.exe kèm cờ node vẫn giữ đủ file codex.js (lỗi gặp thật 20/11/2026)", () => {
  const { phanChuongTrinh: f } = require("../ctl/runner");
  const N = "C:/node/node.exe";
  assert.deepEqual(f([N, "--preserve-symlinks", "--preserve-symlinks-main", "C:/cx/codex.js", "exec", "--json", "{prompt}"]), [N, "--preserve-symlinks", "--preserve-symlinks-main", "C:/cx/codex.js"]);
  assert.deepEqual(f(["codex", "exec", "--json", "{prompt}"]), ["codex"]);
  assert.deepEqual(f(["C:/a/agy.exe", "-p", "{prompt}", "--mode", "plan"]), ["C:/a/agy.exe"]);
  assert.deepEqual(f(["claude.exe", "-p", "{prompt}"]), ["claude.exe"]);
  assert.deepEqual(f([N, "C:/x/codex.js"]), [N, "C:/x/codex.js"]);
});
