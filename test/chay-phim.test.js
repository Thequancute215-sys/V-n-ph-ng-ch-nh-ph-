// runner.chayPhim (P4): lượt AI của luồng phim chạy ngoài khoá lượt agent.md nhưng dựng lệnh như run(): đúng mức quyền theo vai,
// nghiệm thu luôn chỉ đọc, trả kết quả khi lượt kết thúc.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCtl } = require("../ctl/main");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chay-phim-"));
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vp-phim-repo-"));
let ctl;
async function call(url, body) {
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const headers = { Authorization: "Bearer " + ctl.token };
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(base + url, body ? { headers, method: "POST", body: JSON.stringify(body) } : { headers });
  return { status: r.status, ...await r.json() };
}
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
// CLI giả mang tên thật (claude.js, agy.js) để bộ dựng lệnh nhận ra: in dấu + toàn bộ cờ nhận được rồi thoát 0.
function cliGia(ten) {
  const f = path.join(dir, ten + ".js");
  fs.writeFileSync(f, `console.log("DAU-${ten}", JSON.stringify(process.argv.slice(2).filter((x) => !String(x).includes("\\n"))));`);
  return f;
}
test.before(async () => {
  fs.writeFileSync(path.join(repo, "agent.md"), "# sổ\n## [4] KHÓA LƯỢT\n- NEXT_OWNER: CLAUDE_AUDITOR\n");
  fs.writeFileSync(path.join(repo, "phim.json"), JSON.stringify({ ten: "thu", canh: [] }));
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify({
    CLAUDE_REPORTER: [process.execPath, cliGia("claude"), "-p", "{prompt}", "--output-format", "json"],
    SPEC_ARCHITECT: [process.execPath, cliGia("agy"), "-p", "{prompt}", "--output-format", "stream-json", "--mode", "accept-edits"],
  }));
  fs.writeFileSync(path.join(dir, "quyen.json"), JSON.stringify({ toanQuyen: false }));
  ctl = createCtl({ dir });
  ctl.ws.add(repo);
  await new Promise((done) => ctl.server.listen(0, "127.0.0.1", done));
});
test.after(async () => { await ctl.close(); for (const d of [dir, repo]) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test("nghiệm thu (chiDoc) chạy chỉ đọc: Claude plan + chỉ Read/Grep/Glob; trả ok và phần cuối log", async () => {
  const r = await ctl.runner.chayPhim({ workspace: repo, role: "CLAUDE_REPORTER", prompt: "Nghiệm thu phim thử", chiDoc: true });
  assert.equal(r.ok, true, r.loi);
  assert.match(r.text, /DAU-claude/);
  const co = JSON.parse(r.text.slice(r.text.indexOf("["), r.text.indexOf("]", r.text.indexOf("DAU-claude")) + 1));
  assert.ok(co.includes("plan") && co.includes("Read,Grep,Glob"), "lệnh chỉ đọc: " + co.join(" "));
  assert.ok(!co.includes("--dangerously-skip-permissions"));
});

test("lượt Hinata theo mức quyền của vai: đặt SPEC_ARCHITECT = doc thì agy chạy plan, không cờ bỏ qua quyền", async () => {
  ctl.runner.quyen.dat({ role: "SPEC_ARCHITECT", muc: "doc" }, "test");
  const r = await ctl.runner.chayPhim({ workspace: repo, role: "SPEC_ARCHITECT", prompt: "Viết kịch bản" });
  assert.equal(r.ok, true, r.loi);
  const dong = r.text.split(/\r?\n/).find((l) => l.startsWith("DAU-agy"));
  assert.ok(dong, r.text.slice(-500));
  assert.match(dong, /"--mode","plan"/);
  assert.doesNotMatch(dong, /dangerously/);
});

test("API luồng phim: bắt đầu từ hồ sơ, chờ cổng CEO, từ chối chạy chồng và dừng được", async () => {
  fs.writeFileSync(path.join(repo, "phim.json"), JSON.stringify({
    ten: "Phim thử", ti_le: ["9:16"], ngon_ngu: "vi", ngan_sach_usd: 0, nhan_vat: [],
    canh: [{ ma: "C01", may_quay: "flow", giay: 4, cau: [1], loi_dan: "Lời dẫn thử.", khung_hinh: "Khung thử", nhan_vat: [] }],
  }));
  const query = "?workspace=" + encodeURIComponent(repo);
  assert.equal((await call("/phim" + query)).luong, null);
  assert.equal((await call("/phim/luong", { workspace: repo })).status, 202);
  let read;
  for (let i = 0; i < 40; i++) {
    read = await call("/phim/luong" + query);
    if (read.luong?.trangThai !== "dang_chay") break;
    await wait(25);
  }
  assert.equal(read.luong?.trangThai, "cho_cong_1");
  assert.equal((await call("/phim" + query)).luong.trangThai, "cho_cong_1");
  const duplicate = await call("/phim/luong", { workspace: repo });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.code, "DANG_CHAY");
  assert.equal((await call("/phim/luong/dung", { workspace: repo })).status, 202);
  assert.equal((await call("/phim/luong" + query)).luong.trangThai, "dung");
});

test("phanh khẩn cấp dừng tiến trình máy ảnh và giữ hồ sơ phim", async (t) => {
  const cli = path.join(dir, "codex-gia.cjs");
  const started = path.join(dir, "may-anh-da-chay");
  fs.writeFileSync(cli, `require("node:fs").writeFileSync(${JSON.stringify(started)}, "đã chạy"); setInterval(() => {}, 1000);`);
  const cliGoc = ctl.runner.cliOf;
  ctl.runner.cliOf = () => [process.execPath, cli];
  t.after(() => { ctl.runner.cliOf = cliGoc; });

  assert.equal((await call("/phim/cong", { workspace: repo, cong: 1, duyet: true })).status, 200);
  const start = await call("/phim/quay", { workspace: repo, canh: "C01", loai: "khung" });
  assert.equal(start.status, 202, JSON.stringify(start));
  for (let i = 0; i < 100 && !fs.existsSync(started); i++) await wait(25);
  assert.ok(fs.existsSync(started), "CLI giả đã thực sự chạy");
  assert.equal((await call("/kill-all", {})).status, 200);
  for (let i = 0; i < 160 && ctl.mayQuay.trangThai(repo).dang; i++) await wait(25);
  assert.equal(ctl.mayQuay.trangThai(repo).dang, null);
  assert.match(ctl.mayQuay.trangThai(repo).loiCuoi, /đã dừng/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, "phim.json"), "utf8")).canh[0].khung, undefined);
});

test("vai lạ bị từ chối; dự án đang bận lượt AI thì AI_BUSY", async () => {
  assert.throws(() => ctl.runner.chayPhim({ workspace: repo, role: "KHONG_CO", prompt: "x" }), (e) => e.code === "BAD_REQUEST");
  const p = ctl.runner.chayPhim({ workspace: repo, role: "CLAUDE_REPORTER", prompt: "a", chiDoc: true });
  assert.throws(() => ctl.runner.chayPhim({ workspace: repo, role: "CLAUDE_REPORTER", prompt: "b", chiDoc: true }), (e) => e.code === "AI_BUSY");
  await p;
});
