"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createSoTinNhan } = require("../lib/so-tin-nhan");

function setup(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "so-tin-nhan-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { dataDir, so: createSoTinNhan({ dataDir }) };
}
function event(extra = {}) {
  return { t: Date.now(), kind: "ceo", from: "ceo", to: "codex", title: "Giao việc", body: "Đọc sổ tin nhắn", ...extra };
}
function fileFor(dataDir, t) {
  const d = new Date(t);
  return path.join(dataDir, "tin-nhan", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}.jsonl`);
}

test("ghi đúng tháng, định dạng và id; đọc mới nhất trước", t => {
  const { dataDir, so } = setup(t);
  const e = event();
  so.ghi(e);
  so.ghi(event({ t: e.t - 120000, title: "Tin cũ" }));
  const r = so.doc();
  const id = crypto.createHash("sha256").update(JSON.stringify([e.t, e.kind, e.from, e.to, e.title, e.body])).digest("hex").slice(0, 16);
  assert.deepEqual(r, { tin: [{ id, ...e }, r.tin[1]], conNua: false });
  assert.equal(r.tin[1].title, "Tin cũ");
  assert.equal(fs.readFileSync(fileFor(dataDir, e.t), "utf8").trim().split("\n").length, 2);
});

test("chống trùng trong phiên và qua hai lần tạo sổ, cả tháng trước", t => {
  const { dataDir, so } = setup(t);
  const d = new Date();
  const entries = [event(), event({ t: new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime() })];
  for (const e of entries) { so.ghi(e); so.ghi(e); }
  const restarted = createSoTinNhan({ dataDir });
  for (const e of entries) restarted.ghi(e);
  assert.equal(restarted.doc().tin.length, 2);
});

test("giữ tin cùng tiêu đề và thời điểm, đọc phân trang qua tin cũ", t => {
  const { dataDir } = setup(t);
  const e = event();
  const idCu = "0011223344556677";
  fs.mkdirSync(path.dirname(fileFor(dataDir, e.t)), { recursive: true });
  fs.writeFileSync(fileFor(dataDir, e.t), JSON.stringify({ id: idCu, ...e }) + "\n");
  const so = createSoTinNhan({ dataDir });
  so.ghi(e);
  so.ghi({ ...e, body: "Phản hồi thứ hai" });
  so.ghi({ ...e, body: "Phản hồi thứ ba" });
  const tatCa = so.doc().tin;
  assert.equal(tatCa.length, 3);
  assert.ok(tatCa.some(tin => tin.id === idCu));
  const dau = so.doc({ gioiHan: 1 });
  const sau = so.doc({ truoc: dau.tin[0].t, truocId: dau.tin[0].id, gioiHan: 2 });
  assert.deepEqual([...dau.tin, ...sau.tin], tatCa);
  assert.equal(sau.conNua, false);
});

test("lọc ai, tu, toi riêng và kết hợp", t => {
  const { so } = setup(t);
  so.ghi(event());
  so.ghi(event({ from: "codex", to: "claude", title: "Bàn giao" }));
  so.ghi(event({ from: "claude", to: "ceo", title: "Báo cáo" }));
  assert.equal(so.doc({ ai: "codex" }).tin.length, 2);
  assert.equal(so.doc({ tu: "codex" }).tin.length, 1);
  assert.equal(so.doc({ toi: "ceo" }).tin.length, 1);
  assert.equal(so.doc({ ai: "codex", tu: "ceo", toi: "claude" }).tin.length, 0);
});

test("tìm không phân biệt hoa thường, dấu và đ trong title lẫn body", t => {
  const { so } = setup(t);
  so.ghi(event());
  for (const q of ["giao viec", "GIAO VIỆC", "doc so tin nhan", "ĐỌC SỔ"]) {
    assert.equal(so.doc({ q }).tin.length, 1);
  }
  assert.equal(so.doc({ q: "không tồn tại" }).tin.length, 0);
});

test("truoc, gioiHan và conNua theo kết quả đã lọc qua nhiều tháng", t => {
  const { so } = setup(t);
  const times = [new Date(2025, 11, 1).getTime(), new Date(2026, 0, 1).getTime(), new Date(2026, 1, 1).getTime()];
  for (const time of times) so.ghi(event({ t: time }));
  so.ghi(event({ t: times[2] + 60000, to: "claude" }));
  assert.deepEqual(so.doc({ toi: "codex", gioiHan: 2 }).tin.map(e => e.t), times.slice(1).reverse());
  assert.equal(so.doc({ toi: "codex", gioiHan: 2 }).conNua, true);
  const last = so.doc({ toi: "codex", truoc: times[1], gioiHan: 2 });
  assert.deepEqual(last.tin.map(e => e.t), [times[0]]);
  assert.equal(last.conNua, false);
  assert.equal(so.doc({ truoc: 0 }).tin.length, 0);
});

test("giới hạn mặc định 100 và chặn trong khoảng 1..200", t => {
  const { so } = setup(t);
  for (let i = 0; i < 205; i++) so.ghi(event({ title: `Tin ${i}` }));
  assert.equal(so.doc().tin.length, 100);
  assert.equal(so.doc({ gioiHan: 999 }).tin.length, 200);
  assert.equal(so.doc({ gioiHan: 0 }).tin.length, 1);
});

test("che khóa trước khi cắt và ghi xuống đĩa", t => {
  const { dataDir, so } = setup(t);
  const secret = "sk-ant-" + "a".repeat(40);
  const e = event({ title: "x".repeat(110) + " " + secret, body: "x".repeat(690) + " " + secret });
  so.ghi(e);
  const raw = fs.readFileSync(fileFor(dataDir, e.t), "utf8");
  assert.equal(raw.includes(secret), false);
  assert.equal(raw.includes("sk-ant-"), false);
  const saved = so.doc().tin[0];
  assert.ok(saved.title.length <= 120);
  assert.ok(saved.body.length <= 700);
  assert.ok(saved.title.includes("‹khóa›"));
  assert.deepEqual(e.title, "x".repeat(110) + " " + secret);
});

test("bỏ dòng JSON hỏng và bản ghi không hợp lệ", t => {
  const { dataDir, so } = setup(t);
  const e = event();
  so.ghi(e);
  fs.appendFileSync(fileFor(dataDir, e.t), 'hỏng\nnull\n{}\n{"t":"sai"}\n');
  assert.equal(so.doc().tin.length, 1);
  assert.equal(createSoTinNhan({ dataDir }).doc().tin.length, 1);
});

test("đệm file không đổi, đọc lại khi size hoặc mtime đổi", t => {
  const { dataDir, so } = setup(t);
  const e = event();
  so.ghi(e);
  so.doc();
  const original = fs.readFileSync;
  let reads = 0;
  t.mock.method(fs, "readFileSync", function (...args) { reads++; return original.apply(this, args); });
  so.doc();
  assert.equal(reads, 0);
  so.ghi(event({ title: "Tin mới" }));
  assert.equal(so.doc().tin.length, 2);
  assert.equal(reads, 1);
  const f = fileFor(dataDir, e.t);
  const future = new Date(Date.now() + 10000);
  fs.utimesSync(f, future, future);
  so.doc();
  assert.equal(reads, 2);
});

test("thư mục chưa có trả rỗng; lỗi ghi không ném và có thể thử lại", t => {
  const { dataDir, so } = setup(t);
  assert.deepEqual(so.doc(), { tin: [], conNua: false });
  const original = fs.appendFileSync;
  const mock = t.mock.method(fs, "appendFileSync", () => { throw new Error("hết chỗ"); });
  const e = event();
  assert.doesNotThrow(() => so.ghi(e));
  mock.mock.restore();
  assert.equal(fs.appendFileSync, original);
  so.ghi(e);
  assert.equal(so.doc().tin.length, 1);
  assert.ok(fs.existsSync(fileFor(dataDir, e.t)));
});

test("đọc dừng ở tháng đủ tin và chỉ giữ vài tháng trong bộ nhớ", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-so-tin-thang-"));
  try {
    const so = createSoTinNhan({ dataDir });
    for (let m = 0; m < 6; m++) for (let i = 0; i < 3; i++) so.ghi({ t: new Date(2026, m, 10, 9, i).getTime(), kind: "msg", from: "a", to: "b", title: `T${m}-${i}`, body: `Tháng ${m + 1} tin ${i}` });
    const dau = so.doc({ gioiHan: 2 });
    assert.deepEqual(dau.tin.map((e) => e.title), ["T5-2", "T5-1"]);
    assert.equal(dau.conNua, true);
    const cu = so.doc({ truoc: new Date(2026, 1, 1).getTime(), gioiHan: 10 });
    assert.deepEqual(cu.tin.map((e) => e.title), ["T0-2", "T0-1", "T0-0"]);
    assert.equal(cu.conNua, false);
    assert.equal(so.doc({ gioiHan: 200 }).tin.length, 18);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});
