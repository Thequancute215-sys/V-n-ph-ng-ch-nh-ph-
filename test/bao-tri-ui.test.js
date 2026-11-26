"use strict";
// Kiểm hồi quy bảo trì giao diện (public/): chạy hoàn toàn ngoại tuyến, không gọi mạng hay chạm hồ sơ người dùng.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");

const PUB = path.join(__dirname, "..", "public");
const doc = (rel) => fs.readFileSync(path.join(PUB, rel), "utf8");

function walkJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(full));
    else if (e.isFile() && e.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("mọi file JS trong public/ (kể cả public/os/**) hợp lệ cú pháp với node --check", () => {
  const files = walkJs(PUB);
  assert.ok(files.length >= 15, "phải quét được đủ các file JS trong public/");
  for (const f of files) {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  }
});

test("AGY-H01/H02 + rà form đợt 1: index.html chỉ xem an toàn, ket-noi.html giữ form khóa máy chủ không bị MCP khóa nhầm", () => {
  const idx = doc("index.html");
  assert.doesNotMatch(idx, /\/api\/accounts\/save/, "trang 3D không còn gọi ghi khóa API");
  assert.match(idx, /escH\(txt\)/, "asks phải thoát HTML trước khi đưa vào innerHTML");
  assert.match(idx, /\$\("askList"\)\.textContent\s*=\s*"Chưa có yêu cầu cần xử lý\."/, "xóa danh sách asks khi rỗng");

  const kn = doc("ket-noi.html");
  assert.match(kn, /fetch\("\/api\/accounts"/);
  assert.match(kn, /fetch\("\/api\/accounts\/save"/);
  assert.match(kn, /keyState\.canManageKeys !== true/);
  assert.doesNotMatch(kn, /document\.querySelectorAll\("button\.act, button\.rt"\)/, "không khóa lan sang nút trong #keys và #xp khi bảng MCP đang tải");
  assert.match(kn, /\$\("table"\)\.querySelectorAll\("button\.act, button\.rt"\)/);
});

test("AGY-H03: danhSachGiaiThich và tomTatGiaiThich xử lý mảng object mà không ra [object Object]", async () => {
  const v = await import(pathToFileURL(path.join(PUB, "os", "viec-chung.js")).href);
  const sample = [
    { van_de: "Mất thứ tự bàn giao", da_lam: "Tách khóa sắp xếp khỏi giờ hiển thị", vi_sao: "Tránh hiện giờ giả", phuong_an_khac: [{ cach: "Gán Date.now()", vi_sao_khong: "Hiển thị sai giờ" }] },
    { van_de: "Lỗi render mảng", da_lam: "Render danh sách có cấu trúc", vi_sao: "Đọc được đầy đủ" },
  ];
  const ds = v.danhSachGiaiThich(sample);
  assert.equal(ds.length, 2);
  assert.equal(ds[0].phuong_an_khac[0].cach, "Gán Date.now()");
  const tt = v.tomTatGiaiThich(sample);
  assert.doesNotMatch(tt, /\[object Object\]/);
  assert.match(tt, /Tách khóa sắp xếp/);
  assert.match(tt, /\(\+1 mục\)/);
  assert.equal(v.tomTatGiaiThich("  chuỗi cũ  "), "chuỗi cũ");
  assert.equal(v.tomTatGiaiThich(null), "");
  assert.deepEqual(v.danhSachGiaiThich("chuỗi"), []);

  const ngan = doc("os/ngan.js");
  assert.match(ngan, /danhSachGiaiThich\(p\.giai_thich\)/);
  assert.match(ngan, /suaXong\.length/);
  for (const rel of ["os/khu/tong-quan.js", "os/khu/luong.js", "os/khu/viec.js"]) {
    const s = doc(rel);
    assert.match(s, /tomTatGiaiThich\(p\.giai_thich\)/, rel + " phải dùng tomTatGiaiThich");
    assert.match(s, /bay - idx/, rel + " phải giữ thứ tự gốc khi bàn giao chưa có timestamp");
  }
});

test("AGY-H04/H05: điểm vào desktop, tính năng OS (tạo dự án, CI, xuất bản), phân quyền điện thoại và khóa iframe", () => {
  const manifest = JSON.parse(doc("manifest.webmanifest"));
  assert.equal(manifest.start_url, "/");
  for (const s of manifest.shortcuts) assert.match(s.url, /^\/#\//, "shortcut đi qua điểm vào chọn giao diện cho thiết bị");

  const vp3d = doc("vanphong3d.html");
  assert.ok(vp3d.indexOf('location.replace("os.html"') > 0 && vp3d.indexOf('location.replace("os.html"') < vp3d.indexOf("<style>"));

  const duAn = doc("os/khu/code-du-an.js");
  for (const ep of ["/du-an-moi/goi-y", "/du-an-moi", "/bo-kiem", "/publish?workspace=", "/publish/prepare", "/release"]) {
    assert.ok(duAn.includes(ep), "code-du-an.js thiếu " + ep);
  }
  assert.match(duAn, /qs\.get\("loai"\) === "phim"/);

  const phim = doc("os/khu/phim.js");
  assert.match(phim, /id="fTaoPhim"/);   // Xưởng phim tự tạo phim vào kho phim, không qua trang Dự án của Xưởng code
  assert.match(phim, /href="#\/he\/ket-noi"/);

  const app = doc("app.js");
  assert.match(app, /window\.self !== window\.top/);
  assert.match(app, /window\.top\.location\.hash = OS_ROUTE\[base\]/);

  const desk = doc("office-desk.js");
  assert.match(desk, /if \(!isRemote\) \{\s*request\("\/cap-nhat"\)/, "không gọi /cap-nhat từ xa");
  assert.match(desk, /data-chi-may/);
  assert.match(desk, /canApprove: !isRemote/);
  assert.match(desk, /actions: !isRemote/);
  assert.match(desk, /request\("\/du-an-moi"/, "tạo repo riêng tư từ xa vẫn giữ nguyên");

  const idx = doc("index.html");
  assert.match(idx, /\$\("openOverrideBtn"\)\.hidden = isRemotePhone/);
  assert.match(idx, /fetch\("\/dkx\/api\/jobs\?status=running"/);
  assert.match(idx, /base === "\/dkx\/api" \? "\/dkx\/api\/kill-all" : "\/api\/kill-task"/);
});

test("AGY-M01 và AGY-M02: xóa dữ liệu mẫu/email cứng, sửa nút cài FFmpeg ở ket-noi.html", () => {
  const idx = doc("index.html");
  assert.doesNotMatch(idx, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, "không nhúng địa chỉ email vào mã 3D");
  assert.doesNotMatch(idx, /Vệ Tinh Subagents/);
  assert.doesNotMatch(idx, /cổng DEV 7788/);
  assert.doesNotMatch(idx, /Chỉ khi tôi chỉ định thì 6\.1 Sol/);
  assert.match(idx, /\$\("k1"\)\.textContent/);
  assert.match(idx, /\$\("k2"\)\.textContent/);
  assert.match(idx, /\$\("k3"\)\.textContent/);
  assert.match(idx, /\$\("devLockBadge"\)/);

  assert.doesNotMatch(doc("os/app.js"), /D:\\VanPhongAI/);

  const kn = doc("ket-noi.html");
  assert.doesNotMatch(kn, /m\.id !== "ffmpeg"/, "thiếu mỗi FFmpeg vẫn phải hiện nút Cài xưởng phim");
});

test("AGY-M03: safeHttps, md.js an toàn với URL chứa dấu *, hieusuat không dùng tip.innerHTML và skill.html cắt trước esc", async () => {
  const ui = await import(pathToFileURL(path.join(PUB, "os", "ui.js")).href);
  assert.equal(ui.safeHttps("https://github.com/org/repo"), "https://github.com/org/repo");
  assert.equal(ui.safeHttps("javascript:alert(1)"), null);
  assert.equal(ui.safeHttps("http://example.com"), null);
  assert.equal(ui.safeHttps("https://user:pass@github.com/a"), null);

  const sandbox = { window: {} };
  vm.runInNewContext(doc("md.js"), sandbox);
  const MD = sandbox.window.MD;
  const linkStar = MD.render("[xem](https://example.com/a*b*c)");
  assert.match(linkStar, /href="https:\/\/example\.com\/a\*b\*c"/, "URL chứa dấu * không bị chèn <i> vào href");
  assert.doesNotMatch(linkStar, /href="[^"]*<i>/);
  assert.doesNotMatch(MD.render("<img src=example.png>"), /<img/);
  assert.doesNotMatch(MD.render("[x](javascript:alert(1))"), /<a /);
  assert.match(MD.render("`**code**`"), /<code>\*\*code\*\*<\/code>/);
  assert.match(MD.render("[Xem `config.json` **mới**](https://example.com/a*b*c)"), /<a href="https:\/\/example\.com\/a\*b\*c"[^>]*>Xem <code>config\.json<\/code> <b>mới<\/b><\/a>/);

  const hs = doc("hieusuat.html");
  assert.doesNotMatch(hs, /tip\.innerHTML/);
  assert.match(hs, /new WeakMap\(\)/);
  assert.doesNotMatch(hs, /const esc = \(s\)/);

  const sk = doc("skill.html");
  assert.doesNotMatch(sk, /esc\(p\.tomTat\)\.slice\(/);
  assert.match(sk, /esc\(String\(p\.tomTat \|\| ""\)\.slice\(0, 160\)\)/);
  assert.match(sk, /esc\(\[\.\.\.new Set\(ok\.map\(\(x\) => AI\[x\.ai\] \|\| x\.ai\)\)\]\.join\(", "\) \|\| "—"\)/);

  const idx = doc("index.html");
  assert.match(idx, /const mid = escChat\(m\.id\)/);
  assert.match(idx, /rel="noopener noreferrer"/);

  const ch = doc("characters.html");
  const meshyLinks = ch.match(/<a[^>]+meshy\.ai[^>]*>/g) || [];
  assert.ok(meshyLinks.length >= 2);
  for (const a of meshyLinks) assert.match(a, /rel="noopener noreferrer"/);

  assert.match(doc("prototype.js"), /safeHttps\(p\.url\)/);
  assert.match(doc("prototype.js"), /"noopener,noreferrer"/);
  assert.match(doc("os/khu/models.js"), /safeHttps\(dn && dn\.url\)/);
  assert.match(doc("progress-view.js"), /rel="noopener noreferrer"/);
});

test("AGY-M05, H06 và L01/L02: sửa lỗi trạng thái, rò rỉ bộ nhớ, bỏ Google Fonts 5 trang cũ và xóa mã dư", () => {
  const bn = doc("os/khu/bo-nao.js");
  assert.match(bn, /function fileMoi\(\)[\s\S]*?taiLs\(\);/);
  assert.match(bn, /async function xemBan\(commit\) \{\s*if \(!dang \|\| !dang\.p\) return;/);

  assert.match(doc("os/khu/tin-nhan.js"), /if \(k\.duAn !== duAnCu\)/);
  assert.match(doc("os/khu/viec.js"), /jobCuaLuong\.has\(j\.id\)/);

  const nq = doc("noiquy.html");
  assert.match(nq, /if \(!items\.length\)/);
  assert.match(nq, /lastBookSig/);
  assert.match(nq, /if \(!document\.hidden\) load\(\)/);

  const dk = doc("dieukhien.html");
  assert.match(dk, /if \(!j\)/);
  assert.match(dk, /if \(!document\.hidden\) refresh\(\)/);

  const as = doc("anime-studio.html");
  assert.match(as, /function disposeObject\(obj\)/);
  assert.match(as, /typeof THREE === 'undefined'/);
  assert.match(as, /if \(document\.hidden\) return;/);
  assert.doesNotMatch(as, /\bauraGroup\b/);

  const ch = doc("characters.html");
  assert.equal((ch.match(/URL\.revokeObjectURL\(url\)/g) || []).length, 2, "phải giải phóng blob URL cả khi thành công lẫn lỗi");
  assert.doesNotMatch(ch, /\bgAkatsukiTex\b/);
  assert.doesNotMatch(ch, /type === "sol"|type === "claude"|type === "antigravity"/);

  const vp = doc("vanphong3d.js");
  assert.doesNotMatch(vp, /\broofMats\b/);
  assert.doesNotMatch(vp, /const near = \(x, z, r\)/);
  assert.doesNotMatch(vp, /for \(const t of belts\)/);
  assert.equal((vp.match(/tag\.classList\.toggle\("xa", dp >= 18\)/g) || []).length, 2);

  const dt = doc("dien-thoai.html");
  assert.doesNotMatch(dt, /\btick\b/);
  assert.match(dt, /!document\.hidden/);

  assert.doesNotMatch(doc("index.html"), /function focusOnAgent\(/);

  for (const f of ["dieukhien.html", "hieusuat.html", "hopthu.html", "noiquy.html", "tinnhan.html"]) {
    assert.doesNotMatch(doc(f), /fonts\.googleapis\.com/, f + " không còn tải Google Fonts ngoài mạng");
  }
});
