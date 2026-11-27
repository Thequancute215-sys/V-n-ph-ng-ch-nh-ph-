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
  assert.deepEqual(boGioiHanLuot(["claude", "--max-turns=12", "-p", "{prompt}"]), ["claude", "-p", "{prompt}"]);
  assert.deepEqual(boGioiHanLuot(["claude", "-p", "--max-turns", "{prompt}"]), ["claude", "-p", "{prompt}"], "không bao giờ bỏ {prompt}");
  const { readOnlyArgs } = require("../ctl/runner");
  assert.ok(!readOnlyArgs(["claude", "-p", "{prompt}", "--max-turns", "9"]).includes("--max-turns"), "lệnh chỉ đọc không chuyển tiếp --max-turns");
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

test("lỗi chat (kiểm định PR #87): JSON dài/nhiều dòng không lọt ra, che khóa trước khi cắt, quá giờ không bị nhận nhầm hạn mức", () => {
  // Dòng kết quả dài hơn 6000 ký tự vẫn đọc được, không in JSON thô.
  const dai = JSON.stringify({ type: "result", is_error: true, subtype: "error_max_turns", errors: ["Reached maximum number of turns (12)"], pad: "x".repeat(9000) });
  assert.match(loiDeHieu("warning: abc\n" + dai, "failed", "pain"), /phải đọc quá nhiều file/);
  // JSON in nhiều dòng: không dòng mảnh nào ra màn hình.
  const nhieuDong = loiDeHieu('{\n  "type": "error",\n  "message": "x"\n', "failed", "pain");
  assert.ok(!/"type"|"message"|^\s*[{}]/m.test(nhieuDong.split("\n").slice(1).join("\n")), nhieuDong);
  // errors là object: lấy message, không ra [object Object].
  assert.match(loiDeHieu('{"type":"result","is_error":true,"errors":[{"message":"bad gateway"}]}', "failed", "pain"), /Chi tiết: bad gateway/);
  // Khóa vắt ngang mốc 300 ký tự vẫn bị che hết.
  const khoa = "sk-ant-api03-" + "A".repeat(80);
  const t = loiDeHieu("x".repeat(250) + " " + khoa + "\n", "failed", "pain");
  assert.ok(!t.includes("sk-ant-api03-AAAA"), t);
  // Quá giờ khi AI đang đọc file có chữ "quota": báo quá giờ, không báo hết hạn mức.
  assert.match(loiDeHieu('{"type":"assistant","text":"quota config"}\nquota', "timeout", "pain"), /quá 6 phút/);
  // Thoát mã 0, chỉ có dòng JSON kết thúc (không phải lỗi): không in JSON đó ra "Chi tiết".
  const ketThuc = loiDeHieu(JSON.stringify({ type: "result", is_error: false, result: '{"chuyen_phong":null,"ly_do":"","prompt":""}' }), "done", "pain", 0, { rong: true });
  assert.equal(ketThuc, "Pain không trả lời được.");
  // AI chạy xong không nói gì, có dòng cảnh báo trước dòng JSON hết lượt: vẫn nhận ra hết lượt.
  assert.match(loiDeHieu("warning: x\n" + '{"type":"result","subtype":"error_max_turns","errors":[]}', "done", "pain", 0, { rong: true }), /phải đọc quá nhiều file/);
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
  // Kiểm định PR #87: .md tối đa 1 MB (bộ rà soát), tổng 10 MB, tên ẩn, tên thiết bị Windows.
  const md2 = Buffer.alloc(DINH_KEM.moiTepMd + 1, 97).toString("base64");
  assert.throws(() => kiemDinhKem([{ ten: "lon.md", base64: md2 }]), /lớn quá 1 MB/);
  const ba = Buffer.alloc(3.5 * 1048576).toString("base64");
  assert.throws(() => kiemDinhKem([1, 2, 3].map((i) => ({ ten: i + ".pdf", base64: ba }))), /Tổng tài liệu/);
  const tenDai = kiemDinhKem([{ ten: "a".repeat(95) + "....   ..md", base64: b64("x") }])[0].ten;
  assert.ok(!tenDai.startsWith(".") && tenDai.endsWith(".md") && !/\.\.md$/.test(tenDai), tenDai);
  assert.throws(() => kiemDinhKem([{ ten: ".md", base64: b64("x") }]), /không đính kèm được/);
  assert.deepEqual(kiemDinhKem([{ ten: "NUL.md", base64: b64("x") }, { ten: "com1.txt", base64: b64("x") }]).map((x) => x.ten), ["_NUL.md", "_com1.txt"]);
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

test("lưu đính kèm: tai-lieu-y-tuong là liên kết (junction/symlink) thì từ chối, không ghi ra ngoài repo", () => {
  const root = repoTam(), ngoai = fs.mkdtempSync(path.join(os.tmpdir(), "vp-ngoai-"));
  try {
    fs.symlinkSync(ngoai, path.join(root, DINH_KEM.thuMuc), "junction");
    assert.throws(() => luuDinhKem(root, kiemDinhKem([{ ten: "a.md", base64: b64("x") }])), (e) => e.code === "PATH_ESCAPE");
    assert.deepEqual(fs.readdirSync(ngoai), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(ngoai, { recursive: true, force: true }); }
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
