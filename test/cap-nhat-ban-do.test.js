// Chốt bỏ qua của tools/cap-nhat-ban-do.js: khi cổng kiểm ký hiệu của plugin Understand Anything chặn, các lần sau không gọi
// Codex nữa (mỗi lần hỏng tốn vài triệu token) cho tới khi bản đồ đổi mốc hoặc plugin đổi bản.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ghiChan, kiemChan } = require("../tools/cap-nhat-ban-do.js");

const VE = "b239f2a05af8a9644e68bc8a0c6a3c31dfdd507e";
const PLUGIN = path.join("plugins", "understand-anything", "2.9.7");

function thuMuc(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ban-do-chan-"));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return { baoCao: path.join(d, "report.json"), chan: path.join(d, "tmp", "chan.json") };
}
const viet = (f, o) => fs.writeFileSync(f, JSON.stringify(o));

test("cổng ký hiệu chặn đúng mốc: ghi chặn, lần sau bỏ qua", (t) => {
  const { baoCao, chan } = thuMuc(t);
  viet(baoCao, { ok: false, baseCommit: VE, unresolvedFiles: ["ctl/runner.js", "public/index.html"] });
  const c = ghiChan(baoCao, VE, PLUGIN, chan);
  assert.deepEqual(c.files, ["ctl/runner.js", "public/index.html"]);
  assert.equal(c.plugin, "2.9.7");
  assert.ok(kiemChan(VE, PLUGIN, chan), "cùng mốc, cùng bản plugin thì phải bỏ qua");
});

test("không ghi chặn khi báo cáo đạt, lệch mốc, hoặc không có báo cáo", (t) => {
  const { baoCao, chan } = thuMuc(t);
  viet(baoCao, { ok: true, baseCommit: VE, unresolvedFiles: [] });
  assert.equal(ghiChan(baoCao, VE, PLUGIN, chan), null);
  viet(baoCao, { ok: false, baseCommit: "abc1234", unresolvedFiles: ["x.js"] });
  assert.equal(ghiChan(baoCao, VE, PLUGIN, chan), null, "báo cáo của lần chạy khác mốc không được tính");
  assert.equal(ghiChan(baoCao + ".khong-co", VE, PLUGIN, chan), null);
  assert.equal(fs.existsSync(chan), false);
});

test("tự mở lại khi bản đồ đổi mốc hoặc plugin đổi bản", (t) => {
  const { baoCao, chan } = thuMuc(t);
  viet(baoCao, { ok: false, baseCommit: VE, unresolvedFiles: ["ctl/runner.js"] });
  ghiChan(baoCao, VE, PLUGIN, chan);
  assert.equal(kiemChan("0f1d6560000000000000000000000000000000ff", PLUGIN, chan), null);
  assert.equal(kiemChan(VE, path.join("plugins", "understand-anything", "2.9.8"), chan), null);
  assert.equal(kiemChan(VE, PLUGIN, chan + ".khong-co"), null);
});
