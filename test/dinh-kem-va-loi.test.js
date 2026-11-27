"use strict";
// CEO 28/11/2026: bỏ giới hạn lượt của Claude, báo lỗi chat dễ hiểu, đính kèm tài liệu khi tạo dự án mới.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boGioiHanLuot, AGENTS } = require("../ctl/runner");
const { loiDeHieu } = require("../ctl/chat");
const { createDuAnMoi, kiemDinhKem, luuDinhKem, DINH_KEM } = require("../ctl/du-an-moi");

const b64 = (s) => Buffer.from(s).toString("base64");

test("bỏ --max-turns của Claude (kể cả lệnh tự khai trên máy), giữ nguyên Codex/agy", () => {
  assert.deepEqual(boGioiHanLuot(["C:/x/claude.exe", "-p", "{prompt}", "--max-turns", "30", "--tools", "Read"]), ["C:/x/claude.exe", "-p", "{prompt}", "--tools", "Read"]);
  assert.deepEqual(boGioiHanLuot(["node.exe", "codex.js", "exec", "--max-turns", "3", "{prompt}"]), ["node.exe", "codex.js", "exec", "--max-turns", "3", "{prompt}"]);
  for (const [vai, a] of Object.entries(AGENTS)) if (a.argv) assert.ok(!a.argv.includes("--max-turns"), vai + " còn --max-turns");
});

test("lỗi chat: hết lượt, quá giờ, hạn mức, lỗi lạ đều thành câu dễ đọc, không in JSON thô", () => {
  const hetLuot = '{"type":"result","subtype":"error_max_turns","is_error":true,"num_turns":13,"errors":["Reached maximum number of turns (12)"]}';
  const a = loiDeHieu(hetLuot, "failed", "pain");
  assert.match(a, /Pain phải đọc quá nhiều file/);
  assert.ok(!a.includes("{"));
  assert.match(loiDeHieu("", "timeout", "pain"), /quá 6 phút/);
  assert.match(loiDeHieu("You've hit your limit", "failed", "sakura"), /hết hạn mức/);
  const b = loiDeHieu('{"type":"result","is_error":true,"errors":["API Error: 500 overloaded"]}', "failed", "pain");
  assert.match(b, /Pain gặp lỗi/);
  assert.match(b, /Chi tiết: API Error: 500 overloaded/);
  assert.ok(!b.includes('"type"'));
  assert.match(loiDeHieu("spawn claude ENOENT\n", "failed", "pain"), /Chi tiết: spawn claude ENOENT/);
});

test("đính kèm: nhận đúng loại tệp, làm sạch tên, chặn quá số/quá dung lượng/base64 hỏng", () => {
  const ok = kiemDinhKem([{ ten: "../../dac ta.md", base64: b64("# Đặc tả") }, { ten: "dac ta.md", base64: b64("khác") }]);
  assert.deepEqual(ok.map((x) => x.ten), ["dac ta.md", "dac ta (2).md"]);
  assert.deepEqual(kiemDinhKem(undefined), []);
  assert.throws(() => kiemDinhKem([{ ten: "virus.exe", base64: b64("x") }]), /không đính kèm được/);
  assert.throws(() => kiemDinhKem([{ ten: "a.md", base64: "!!!" }]), /rỗng hoặc không đọc được/);
  assert.throws(() => kiemDinhKem(Array.from({ length: 6 }, (_, i) => ({ ten: i + ".md", base64: b64("x") }))), /tối đa 5/);
  const to = Buffer.alloc(DINH_KEM.moiTep + 1).toString("base64");
  assert.throws(() => kiemDinhKem([{ ten: "to.pdf", base64: to }]), (e) => e.code === "TOO_LARGE");
});

function repoTam() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-dinh-kem-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

test("lưu đính kèm: vào tai-lieu-y-tuong/, git bỏ qua (không commit), không ghi đè tệp có sẵn", () => {
  const root = repoTam();
  try {
    fs.mkdirSync(path.join(root, DINH_KEM.thuMuc));
    fs.writeFileSync(path.join(root, DINH_KEM.thuMuc, "y.md"), "cũ");
    const da = luuDinhKem(root, kiemDinhKem([{ ten: "y.md", base64: b64("mới") }, { ten: "anh.png", base64: b64("png") }]));
    assert.deepEqual(da, ["y (2).md", "anh.png"]);
    assert.equal(fs.readFileSync(path.join(root, DINH_KEM.thuMuc, "y.md"), "utf8"), "cũ");
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "");
    luuDinhKem(root, []);   // chạy lại không thêm dòng exclude trùng
    const ex = fs.readFileSync(path.join(root, ".git", "info", "exclude"), "utf8");
    assert.equal(ex.split("/" + DINH_KEM.thuMuc + "/").length - 1, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tạo dự án kèm tài liệu: có bước lưu đính kèm, ý tưởng giao Hinata nhắc tới tệp; tệp sai thì không tạo repo", async () => {
  const root = repoTam();
  try {
    const goi = [];
    const github = {
      login: async () => "oanh", exists: async () => false,
      createRepo: async ({ name }) => { goi.push("createRepo"); return { fullName: "oanh/" + name, url: "https://github.com/oanh/" + name }; },
      open: () => ({ id: "op1", status: "running" }), get: () => ({ id: "op1", status: "done", workspace: root }),
    };
    let chiTiet = "";
    const ideas = { add: ({ detail }) => { chiTiet = detail; return { id: "idea-1" }; }, start: (id) => ({ id, runId: "auto-1" }) };
    const dam = createDuAnMoi({ github, ideas, boKiem: { install: () => ({}) }, goiYAi: async () => [], cho: async () => {} });
    assert.throws(() => dam.tao({ ten: "app-moi", yTuong: "x".repeat(2000), dinhKem: [{ ten: "a.exe", base64: b64("x") }] }), /không đính kèm được/);
    assert.deepEqual(goi, []);
    const op = dam.tao({ ten: "app-moi", yTuong: "y".repeat(2000), dinhKem: [{ ten: "phac thao.png", base64: b64("png") }] });
    assert.ok(op.buoc.some((s) => s.id === "dinh-kem"));
    let o; for (let i = 0; i < 50; i++) { o = dam.get(op.id); if (o.trangThai !== "dang") break; await new Promise((r) => setImmediate(r)); }
    assert.equal(o.buoc.find((s) => s.id === "dinh-kem").trangThai, "xong");
    assert.ok(fs.existsSync(path.join(root, DINH_KEM.thuMuc, "phac thao.png")));
    assert.match(chiTiet, /tai-lieu-y-tuong\/phac thao\.png/);
    assert.ok(chiTiet.length <= 2400);
    const khong = dam.tao({ ten: "app-khac", yTuong: "Ý tưởng không có tài liệu kèm" });
    assert.ok(!khong.buoc.some((s) => s.id === "dinh-kem"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
