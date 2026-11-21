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

// OS-2 (CEO 21/11/2026): máy tính chỉ dùng OS, văn phòng 3D chỉ trên điện thoại; hai xưởng tách hẳn nhau.
test("OS-2: Xưởng code và Xưởng phim là hai nhóm riêng, mọi mục của nhóm mang đúng nhãn xưởng", () => {
  const app = doc("os/app.js");
  const khu = app.slice(app.indexOf("const KHU = ["), app.indexOf("];", app.indexOf("const KHU = [")));
  const dong = khu.split("\n").filter((l) => /^\s*\{/.test(l));
  let nhom = null;
  for (const l of dong) {
    const n = /nhom: "([^"]+)"/.exec(l);
    if (n) { nhom = n[1]; continue; }
    if (nhom === "Xưởng code") assert.match(l, /xuong: "code"/, "mục của Xưởng code thiếu nhãn: " + l.trim());
    else if (nhom === "Xưởng phim") assert.match(l, /xuong: "phim"/, "mục của Xưởng phim thiếu nhãn: " + l.trim());
    else assert.doesNotMatch(l, /xuong: /, "mục ngoài hai xưởng không được mang nhãn xưởng: " + l.trim());
  }
  assert.ok(dong.some((l) => /nhom: "Xưởng code", xuong: "code"/.test(l)) && dong.some((l) => /nhom: "Xưởng phim", xuong: "phim"/.test(l)));
  for (const m of ["cong-su", "viec", "bo-nao", "models", "code-du-an"]) assert.match(app, new RegExp(`mod: "\./khu/${m}\.js"`), "thiếu khu " + m);
  const tok = doc("os/tokens.css");
  assert.equal((tok.match(/--color-xuong-code:/g) || []).length, 2, "màu Xưởng code có cả nền tối và nền sáng");
  assert.equal((tok.match(/--color-xuong-phim:/g) || []).length, 2, "màu Xưởng phim có cả nền tối và nền sáng");
});

test("OS-2: máy tính không vào được văn phòng 3D; điện thoại vẫn vào", () => {
  assert.doesNotMatch(doc("os.html"), /href="index\.html"/, "OS trên máy tính không còn nút mở văn phòng 3D");
  const idx = doc("index.html");
  const chot = idx.indexOf('location.replace("os.html"');
  assert.ok(chot > 0, "index.html chuyển máy tính sang os.html");
  // Chốt chạy trước khi tải font, CSS hay mô-đun 3D để máy tính không tải 3D rồi mới chuyển.
  for (const sau of ["fonts.googleapis.com", "<style>", "vanphong3d.js"]) assert.ok(chot < idx.indexOf(sau), "chốt phải đứng trước " + sau);
  // Thử chính đoạn chốt với vài trình duyệt.
  const code = /<script>\s*([\s\S]*?location\.replace\("os\.html" \+ location\.hash\);[\s\S]*?)<\/script>/.exec(idx)[1];
  const chay = (ua, touch = 0) => { let toi = null; new Function("navigator", "location", code)({ userAgent: ua, maxTouchPoints: touch }, { hash: "", replace: (u) => { toi = u; } }); return toi; };
  assert.equal(chay("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36 Edg/150"), "os.html");
  assert.equal(chay("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"), "os.html");
  assert.equal(chay("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/150 Mobile Safari/537.36"), null);
  assert.equal(chay("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), null);
  assert.equal(chay("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", 5), null, "iPad tự xưng Macintosh nhưng có cảm ứng");
});
