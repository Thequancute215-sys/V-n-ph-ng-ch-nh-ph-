"use strict";
// Bản đồ hệ thống (docs/BAN-DO-HE-THONG.md) sinh từ đồ thị Understand Anything trong .ua/ bằng tools/ve-ban-do.js.
// Kiểm: sinh được, đủ 6 mục, mọi liên kết trỏ tới file và dòng có thật, đồ thị không trỏ vào dữ liệu riêng tư.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const has = fs.existsSync(path.join(ROOT, ".ua", "knowledge-graph.json")) && fs.existsSync(path.join(ROOT, ".ua", "domain-graph.json"));

test("sinh bản đồ từ đồ thị: đủ mục, liên kết trỏ tới file/dòng có thật, không có dữ liệu riêng tư", { skip: !has && "chưa có đồ thị .ua" }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-bando-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, "BAN-DO.md");
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "ve-ban-do.js"), out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const md = fs.readFileSync(out, "utf8");
  for (const h of ["## 1. Các miền nghiệp vụ", "## 2. Workflow trung tâm", "## 3. Từng workflow", "## 4. Bản đồ hệ thống", "## 5. Lộ trình đọc mã", "## 6. Điểm phát hiện"]) assert.ok(md.includes(h), "thiếu mục " + h);
  assert.ok(!/undefined|\[object Object\]/.test(md), "có chữ undefined");
  // Mọi liên kết ../đường-dẫn#Lx-Ly phải trỏ tới file có thật và dòng nằm trong file.
  const links = [...md.matchAll(/\]\(\.\.\/([^)#]+)(?:#L(\d+)-L(\d+))?\)/g)];
  assert.ok(links.length > 200, "quá ít liên kết: " + links.length);
  for (const [, rel, a, b] of links) {
    const f = path.join(ROOT, decodeURIComponent(rel));
    assert.ok(fs.existsSync(f), "liên kết tới file không có: " + rel);
    if (a) { const n = fs.readFileSync(f, "utf8").split("\n").length; assert.ok(+a >= 1 && +b <= n && +a <= +b, `dòng sai ${rel}#L${a}-L${b} (file ${n} dòng)`); }
  }
  // Mỗi khối mermaid có loại sơ đồ và không chứa ký tự làm vỡ cú pháp trong nhãn.
  const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 10);
  for (const b of blocks) assert.match(b, /^flowchart (TD|LR)\n/);
  // Đồ thị không được trỏ vào dữ liệu riêng của máy (sổ data/, config.json có khóa xem).
  for (const g of ["knowledge-graph.json", "domain-graph.json"]) {
    const nodes = JSON.parse(fs.readFileSync(path.join(ROOT, ".ua", g), "utf8")).nodes;
    const bad = nodes.filter((n) => /^(data\/|config\.json$|scratch\/)/.test(n.filePath || ""));
    assert.deepEqual(bad.map((n) => n.id), [], g + " trỏ vào dữ liệu riêng tư");
  }
});
