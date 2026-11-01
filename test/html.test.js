// Cái chặn cho bài học IMPORTMAP-MODULE: mỗi trang public/*.html phải có importmap đứng trước mọi <script type="module">,
// và mọi script nội tuyến phải đúng cú pháp (node --check), để lỗi trắng trang bị bắt trước khi commit thay vì lúc F5.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const PUB = path.join(__dirname, "..", "public");
const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-html-"));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

for (const page of pages) {
  test(`${page}: importmap trước module, script đúng cú pháp`, () => {
    const html = fs.readFileSync(path.join(PUB, page), "utf8");
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    const map = scripts.findIndex((m) => /type=["']?importmap/.test(m[1]));
    const mod = scripts.findIndex((m) => /type=["']?module/.test(m[1]));
    if (map >= 0 && mod >= 0) assert.ok(map < mod, "importmap phải đứng trước <script type=\"module\"> đầu tiên");
    scripts.forEach((m, i) => {
      if (/src=|importmap|application\/(ld\+)?json|text\/(template|x-)/.test(m[1]) || !m[2].trim()) return;
      const f = path.join(tmp, `${page}.${i}.${/type=["']?module/.test(m[1]) ? "mjs" : "js"}`);
      fs.writeFileSync(f, m[2]);
      try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
      catch (e) { assert.fail(`script thứ ${i + 1} lỗi cú pháp:\n${String(e.stderr).split("\n").slice(0, 6).join("\n")}`); }
    });
  });
}
