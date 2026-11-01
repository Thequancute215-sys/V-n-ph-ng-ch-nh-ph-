// App trên máy (F11): manifest cài được, biểu tượng đúng kích thước, mọi trang gắn manifest + app.js,
// bộ mở app không đi qua shell, lối tắt Windows không ghép đường dẫn vào chuỗi lệnh.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const app = require("../lib/app");
const { plan } = require("../scripts/cai-app");

const PUB = path.join(__dirname, "..", "public");
const pngSize = (f) => { const b = fs.readFileSync(path.join(PUB, f)); assert.strictEqual(b.readUInt32BE(0), 0x89504e47, f + " không phải PNG"); return b.readUInt32BE(16) + "x" + b.readUInt32BE(20); };

test("manifest đủ điều kiện cài (tên, start_url, display, biểu tượng 192 + 512 + maskable)", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PUB, "manifest.webmanifest"), "utf8"));
  assert.ok(m.name && m.short_name && m.start_url === "/" && m.display === "standalone");
  for (const i of m.icons) {
    assert.ok(fs.existsSync(path.join(PUB, i.src)), "thiếu " + i.src);
    if (i.type === "image/png") assert.strictEqual(pngSize(i.src), i.sizes, i.src + " sai kích thước khai báo");
  }
  assert.ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  for (const s of m.shortcuts) assert.ok(fs.existsSync(path.join(PUB, s.url.replace(/^\//, ""))), "lối tắt trỏ tới trang không có: " + s.url);
});

test("mọi trang gắn manifest (kèm cookie khóa xem), biểu tượng và app.js", () => {
  for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith(".html") && x !== "offline.html")) {
    const s = fs.readFileSync(path.join(PUB, f), "utf8");
    assert.match(s, /<link rel="manifest" href="manifest\.webmanifest" crossorigin="use-credentials">/, f);
    assert.match(s, /<script src="app\.js" defer><\/script>/, f);
    assert.match(s, /<link rel="icon" href="icon\.svg"/, f);
  }
});

test("service worker chỉ giữ trang hướng dẫn, không lưu đệm dữ liệu văn phòng", () => {
  const sw = fs.readFileSync(path.join(PUB, "sw.js"), "utf8");
  assert.match(sw, /mode !== "navigate"\) return/);
  assert.match(sw, /const OFFLINE = \["offline\.html"\]/);
  const off = fs.readFileSync(path.join(PUB, "offline.html"), "utf8");
  assert.doesNotMatch(off, /\b(src|href)="(?!#)[^"]+"/, "trang hướng dẫn không được tải file nào khác (văn phòng đang tắt)");
  assert.doesNotMatch(sw, /cache\.put|\.put\(/, "không được lưu đệm thêm gì khi đang chạy");
});

test("tìm trình duyệt Chromium để mở cửa sổ app", () => {
  const env = { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" };
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const chrome = "C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
  assert.strictEqual(app.findBrowser(env, "win32", (f) => f === edge || f === chrome), edge, "ưu tiên Edge (Windows có sẵn)");
  assert.strictEqual(app.findBrowser(env, "win32", (f) => f === chrome), chrome);
  assert.strictEqual(app.findBrowser(env, "win32", () => false), null);
  assert.strictEqual(app.findBrowser({ PATH: "/usr/bin" }, "linux", (f) => f === "/usr/bin/chromium"), "/usr/bin/chromium");
});

test("mở cửa sổ app không đi qua shell", () => {
  const url = "http://localhost:7788/";
  assert.deepStrictEqual(app.openCommand(url, "C:\\x\\msedge.exe", "win32"), ["C:\\x\\msedge.exe", ["--app=" + url, "--new-window"]]);
  for (const pf of ["win32", "darwin", "linux"]) {
    const [cmd] = app.openCommand(url, null, pf);
    assert.ok(!/^(cmd|powershell|sh|bash)(\.exe)?$/i.test(path.basename(cmd)), pf + ": " + cmd);
  }
});

test("file .ico bọc ảnh PNG đúng định dạng", () => {
  const png = fs.readFileSync(path.join(PUB, "icon-maskable-512.png"));
  const ico = app.pngToIco(png);
  assert.strictEqual(ico.readUInt16LE(2), 1, "loại icon");
  assert.strictEqual(ico.readUInt16LE(4), 1, "1 ảnh");
  assert.strictEqual(ico.readUInt8(6), 0, "512px ghi là 0 (≥256)");
  assert.strictEqual(ico.readUInt32LE(14), png.length);
  assert.strictEqual(ico.readUInt32LE(18), 22);
  assert.ok(ico.subarray(22).equals(png));
  assert.throws(() => app.pngToIco(Buffer.from("không phải png")));
});

test("lối tắt Windows: đường dẫn đi qua biến môi trường, không ghép vào lệnh PowerShell", () => {
  const evil = "C:\\Users\\O'Brien; Remove-Item C:\\ -Recurse #\\Văn phòng AI";
  const p = plan([], { root: evil, node: "C:\\node\\node.exe", icon: "C:\\i.ico" });
  assert.ok(!p.args.some((a) => a.includes("O'Brien")), "đường dẫn không được nằm trong tham số lệnh");
  assert.strictEqual(p.env.VP_ROOT, evil);
  assert.strictEqual(p.env.VP_WHERE, "desktop,menu");
  assert.strictEqual(plan(["--tu-khoi-dong"]).env.VP_WHERE, "desktop,menu,startup");
  assert.strictEqual(plan(["--go"]).env.VP_MODE, "remove");
});
