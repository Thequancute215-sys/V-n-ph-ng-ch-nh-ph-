"use strict";
// Thế Quân OS (public/os.html + public/os/): kiểm tĩnh, không cần trình duyệt.
// - Mọi khu trong thanh bên trỏ tới mô-đun hoặc trang có thật (đổi tên file mà quên sửa danh sách thì hỏng ngay ở đây).
// - Màu chỉ khai ở tokens.css: os.css không có mã màu viết thẳng (đổi nền sáng/tối chỉ cần sửa token).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PUB = path.join(__dirname, "..", "public");
const doc = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

test("mọi khu của thanh bên trỏ tới file có thật", () => {
  const app = doc("os/app.js");
  const mods = [...app.matchAll(/mod: "\.\/(khu\/[\w-]+\.js)"/g)].map((m) => m[1]);
  const nhung = [...app.matchAll(/nhung: "([\w.-]+\.html)"/g)].map((m) => m[1]);
  assert.ok(mods.length >= 3 && nhung.length >= 5, "danh sách khu đọc được");
  for (const m of mods) assert.ok(fs.existsSync(path.join(PUB, "os", m)), "thiếu mô-đun " + m);
  for (const n of nhung) assert.ok(fs.existsSync(path.join(PUB, n)), "thiếu trang nhúng " + n);
  const html = doc("os.html");
  assert.match(html, /<script type="module" src="os\/app\.js">/);
  assert.match(html, /href="os\/os\.css"/);
});

test("os.css không viết thẳng mã màu; token có đủ nền tối và nền sáng", () => {
  const css = doc("os/os.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/i, "màu phải đi qua token trong tokens.css");
  const tok = doc("os/tokens.css");
  for (const t of ["--color-paper", "--color-ink", "--color-accent", "--color-accent-text", "--color-claude", "--color-codex", "--color-gemini"]) {
    assert.ok(tok.includes(t + ":"), "thiếu token " + t);
  }
  assert.match(tok, /:root\[data-theme="light"\]/, "có bảng màu nền sáng");
});
