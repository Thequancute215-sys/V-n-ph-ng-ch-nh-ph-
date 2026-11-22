"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { createBoNao } = require("../ctl/bo-nao");
const { createCtl } = require("../ctl/main");

function tam(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-bo-nao-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function dungBoNao(t) {
  const dir = tam(t), audit = [];
  const nao = createBoNao({ dir, audit: { log: (...args) => audit.push(args) } });
  return { dir, nao, audit, root: path.join(dir, "bo-nao") };
}

test("Bộ não khởi tạo lười, có bốn thư mục, sáu cộng sự và một commit", (t) => {
  const { nao, root } = dungBoNao(t);
  assert.equal(fs.existsSync(root), false);
  const cay = nao.cay();
  const thuMuc = ["cong-su", "nguon", "tri-nho", "wiki"];
  assert.deepEqual(cay.filter((x) => x.thuMuc).map((x) => x.p).sort(), thuMuc);
  for (const ten of thuMuc) assert.match(nao.doc(ten + "/README.md").noiDung, /^#/);
  const vai = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "CODEX_ASTRA_DEV",
    "FRONTEND_UIUX_DEV", "CLAUDE_AUDITOR", "SOL_ARCHITECT_ADVISOR"];
  assert.equal(cay.filter((x) => !x.thuMuc).length, 10);
  for (const v of vai) assert.match(nao.doc("cong-su/" + v + ".md").noiDung, /Ghi chú CEO/);
  const ls = nao.lichSu();
  assert.equal(ls.length, 1);
  assert.equal(ls[0].thongDiep, "bo-nao: khởi tạo");
  assert.equal(ls[0].file.length, 10);
  assert.throws(() => nao.hoanTac(ls[0].commit), { code: "BAD_REQUEST" });
});

test("Ghi nguyên nội dung tiếng Việt, chống ghi đè và bỏ qua commit trùng", (t) => {
  const { nao, audit } = dungBoNao(t);
  const p = "tri-nho/đội/Ghi-chú.md", noiDung = "# Trí nhớ\r\nCủa đội\n";
  const ma = createHash("sha1").update(noiDung).digest("hex");
  const moi = nao.ghi({ p, noiDung, lyDo: "thêm ghi chú" }, "ceo");
  assert.deepEqual(nao.doc(p), { p, noiDung, ma });
  assert.match(moi.commit, /^[0-9a-f]{7}$/);
  assert.equal(moi.ma, ma);
  assert.equal(nao.ghi({ p, noiDung, goc: ma }).commit, null);
  assert.throws(() => nao.ghi({ p, noiDung: "sửa", goc: "cũ" }), { code: "CONFLICT" });
  assert.throws(() => nao.xoa({ p, goc: "cũ" }), { code: "CONFLICT" });
  assert.equal(nao.lichSu(p).length, 1);
  assert.deepEqual(audit[0].slice(0, 3), ["ceo", "bo_nao.ghi", p]);
});

test("Kiểm đường dẫn, kích thước, khóa và bảo vệ README cấp gốc", (t) => {
  const { nao } = dungBoNao(t);
  for (const p of ["wiki/../nguon/a.md", "/wiki/a.md", "C:/wiki/a.md", "wiki/a.txt",
    "khac/a.md", "wiki/.an.md", "wiki/a/b/c/d.md", "wiki/a\\b.md"]) {
    assert.throws(() => nao.ghi({ p, noiDung: "ghi" }), { code: "BAD_REQUEST" }, p);
  }
  const p = "wiki/a.md";
  assert.throws(() => nao.ghi({ p, noiDung: "á".repeat(256 * 1024 + 1) }), { code: "TOO_LARGE" });
  assert.throws(() => nao.ghi({ p, noiDung: "ghp_" + "a".repeat(20) }), { code: "SECRET" });
  assert.throws(() => nao.xoa({ p: "wiki/README.md", goc: nao.doc("wiki/README.md").ma }), { code: "BAD_REQUEST" });
  assert.equal(nao.lichSu().length, 1);
});

test("Bỏ qua junction trong cây và từ chối đọc hoặc ghi qua junction", (t) => {
  const { nao, dir, root } = dungBoNao(t);
  nao.cay();
  const ngoai = path.join(dir, "ngoai");
  fs.mkdirSync(ngoai);
  fs.writeFileSync(path.join(ngoai, "a.md"), "ở ngoài");
  try { fs.symlinkSync(ngoai, path.join(root, "wiki", "noi"), "junction"); }
  catch (e) { t.skip("Máy không tạo được junction: " + e.code); return; }
  assert.equal(nao.cay().some((x) => x.p.startsWith("wiki/noi")), false);
  assert.throws(() => nao.doc("wiki/noi/a.md"), { code: "BAD_REQUEST" });
  assert.throws(() => nao.ghi({ p: "wiki/noi/moi.md", noiDung: "ghi" }), { code: "BAD_REQUEST" });
  assert.equal(fs.existsSync(path.join(ngoai, "moi.md")), false);
});

test("Đọc bản cũ, xóa có commit và hoàn tác xóa", (t) => {
  const { nao } = dungBoNao(t);
  const p = "nguon/van-ban.md";
  const a = nao.ghi({ p, noiDung: "bản đầu" });
  const b = nao.ghi({ p, noiDung: "bản hai", goc: a.ma, lyDo: "đổi bản" });
  assert.equal(nao.ban(p, a.commit).noiDung, "bản đầu");
  assert.deepEqual(nao.lichSu(p).map((x) => [x.commit, x.thongDiep, x.file]), [
    [b.commit, "bo-nao: đổi bản", [p]], [a.commit, "bo-nao: sửa " + p, [p]],
  ]);
  assert.throws(() => nao.ban(p, "HEAD"), { code: "BAD_REQUEST" });
  const xoa = nao.xoa({ p, goc: b.ma });
  assert.throws(() => nao.doc(p), { code: "NOT_FOUND" });
  assert.throws(() => nao.ban(p, xoa.commit), { code: "NOT_FOUND" });
  assert.match(nao.hoanTac(xoa.commit).commit, /^[0-9a-f]{7}$/);
  assert.equal(nao.doc(p).noiDung, "bản hai");
});

test("Hoàn tác xung đột khôi phục cây làm việc và có thể ghi tiếp", (t) => {
  const { nao, root } = dungBoNao(t);
  const p = "wiki/ban.md";
  const a = nao.ghi({ p, noiDung: "một\n" });
  const b = nao.ghi({ p, noiDung: "hai\n", goc: a.ma });
  const c = nao.ghi({ p, noiDung: "ba\n", goc: b.ma });
  assert.throws(() => nao.hoanTac(b.commit), { code: "CONFLICT" });
  assert.equal(nao.doc(p).noiDung, "ba\n");
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }), "");
  assert.match(nao.ghi({ p, noiDung: "bốn\n", goc: c.ma }).commit, /^[0-9a-f]{7}$/);
});

test("Lỗi Git khi thêm file khôi phục nội dung trước thao tác", (t) => {
  const { nao, root } = dungBoNao(t);
  nao.cay();
  fs.mkdirSync(path.join(root, ".git", "info"), { recursive: true });
  fs.writeFileSync(path.join(root, ".git", "info", "exclude"), "wiki/bo-qua.md\n");
  assert.throws(() => nao.ghi({ p: "wiki/bo-qua.md", noiDung: "ghi thử" }), { code: "CONFLICT" });
  assert.equal(fs.existsSync(path.join(root, "wiki", "bo-qua.md")), false);
  assert.equal(nao.lichSu().length, 1);
});

test("Thiếu Git báo NO_GIT và chưa tạo kho", (t) => {
  const { nao, dir, root } = dungBoNao(t);
  const pathCu = process.env.PATH;
  process.env.PATH = dir;
  try { assert.throws(() => nao.cay(), { code: "NO_GIT" }); }
  finally { if (pathCu === undefined) delete process.env.PATH; else process.env.PATH = pathCu; }
  assert.equal(fs.existsSync(root), false);
});

test("HTTP Bộ não dùng xác thực và trả đúng dữ liệu lưu, đọc cùng lỗi 409", async (t) => {
  const dir = tam(t), ctl = createCtl({ dir });
  try {
    await new Promise((resolve, reject) => ctl.server.listen(0, "127.0.0.1", resolve).once("error", reject));
    const base = "http://127.0.0.1:" + ctl.server.address().port;
    const headers = { authorization: "Bearer " + ctl.token, "content-type": "application/json" };
    assert.equal((await fetch(base + "/bo-nao")).status, 401);
    const p = "wiki/thử-http.md", noiDung = "# Tài liệu thử\n";
    const ghi = (body) => fetch(base + "/bo-nao/ghi", { method: "POST", headers, body: JSON.stringify(body) });
    const res = await ghi({ p, noiDung });
    assert.equal(res.status, 200);
    const { ma, commit } = await res.json();
    assert.match(commit, /^[0-9a-f]{7}$/);
    const doc = await fetch(base + "/bo-nao/doc?p=" + encodeURIComponent(p), { headers });
    assert.deepEqual(await doc.json(), { ok: true, p, noiDung, ma });
    const cu = await ghi({ p, noiDung: "bản khác", goc: "cũ" });
    assert.equal(cu.status, 409);
    assert.equal((await cu.json()).code, "CONFLICT");
  } finally { await ctl.close(); }
});
