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

test("OS-2: mỗi lần mở khu giao cho khu một khung con mới, không giao thẳng #vung (bộ nghe sự kiện không chồng lên nhau)", () => {
  const app = doc("os/app.js");
  const mo = app.slice(app.indexOf("async function moKhu()"));
  assert.match(mo, /vung\.replaceChildren\(khung\)/, "thay khung cũ bằng khung mới");
  assert.match(mo, /m\.mo\(khung,/, "khu nhận khung mới");
  assert.doesNotMatch(mo, /m\.mo\(vung,/, "không giao #vung sống suốt phiên cho khu");
});

// OS-3 (CEO cấp FORCE_OVERRIDE 22/11/2026): "xem ở đâu, xử lý ngay ở đó".
test("OS-3: thanh bên chỉ còn khu gốc (không nhúng trang cũ), trang cũ gom vào Công cụ cũ", () => {
  const app = doc("os/app.js");
  const khu = app.slice(app.indexOf("const KHU = ["), app.indexOf("];", app.indexOf("const KHU = [")));
  const muc = khu.split("\n").filter((l) => /^\s*\{ id: /.test(l));
  assert.ok(muc.length <= 11, "thanh bên tối đa 11 mục chính, đang có " + muc.length);
  for (const l of muc) assert.doesNotMatch(l, /nhung: /, "mục trên thanh bên phải là khu gốc: " + l.trim());
  assert.match(khu, /id: "cu", ten: "Công cụ cũ", icon: "\w+", mod: "\.\/khu\/cong-cu-cu\.js"/);
  assert.match(khu, /id: "code\/giao-viec", [^\n]*mod: "\.\/khu\/giao-viec\.js", xuong: "code"/);
  assert.match(khu, /id: "code\/dieu-khien", [^\n]*mod: "\.\/khu\/luong\.js", xuong: "code"/);
  // Đường dẫn cũ vẫn mở được: mọi trang từng có trên thanh bên vẫn có trong CU.
  const cu = app.slice(app.indexOf("const CU = ["), app.indexOf("];", app.indexOf("const CU = [")));
  for (const id of ["code/skill", "code/hop-thu", "phim/nhan-vat", "phim/xuong-cu", "doi/hieu-suat", "doi/noi-quy", "he/ket-noi", "he/dien-thoai", "he/cap-nhat"]) assert.ok(cu.includes(`id: "${id}"`), "mất đường dẫn cũ " + id);
  for (const n of ["prototype.html", "dieukhien.html"]) assert.ok(cu.includes(`nhung: "${n}"`), "bản cũ " + n + " vẫn mở được từ Công cụ cũ");
});

test("OS-3: Tổng quan và Việc mở ngăn trượt tại chỗ thay cho chuyển sang trang Luồng", () => {
  for (const f of ["os/khu/tong-quan.js", "os/khu/viec.js", "os/khu/luong.js", "os/khu/giao-viec.js"]) {
    const m = doc(f);
    assert.match(m, /ngan\.mo\(n\.dataset\.ngan, n/, f + " mở ngăn từ nút data-ngan");
    assert.doesNotMatch(m, /href="#\/code\/dieu-khien">(Duyệt|Mở)/, f + " không còn chuyển trang để duyệt");
    assert.doesNotMatch(m, /getElementById\("vung"\)/, f + " không gắn bộ nghe lên #vung");
  }
  const app = doc("os/app.js");
  assert.match(app, /ngan\.dong\(\);/, "đổi khu thì đóng ngăn");
  assert.match(app, /m\.mo\(khung, \{ kho, ctl, bao, ngan, congCuCu: CU \}\)/);
  const ngan = doc("os/ngan.js");
  assert.match(ngan, /showModal\(\)/, "ngăn là dialog modal: bàn phím ở yên trong ngăn, Esc đóng");
  assert.match(ngan, /const dich = dung\(nguoiMo\) \? nguoiMo : /, "đóng ngăn trả tiêu điểm về nút đã mở");
  assert.match(ngan, /!el\.disabled/, "nút mở đã bị khoá thì tìm nút khác của cùng việc, không để tiêu điểm rơi về đầu trang");
});

test("OS-3: mọi đường dẫn ctl mà ngăn trượt và hai khu mới gọi đều có trong ctl/main.js", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "ctl", "main.js"), "utf8");
  const can = [["GET", "/autopilot/:id"], ["POST", "/autopilot"], ["POST", "/autopilot/:id/answer"], ["POST", "/autopilot/:id/approve"], ["POST", "/autopilot/:id/reject"],
    ["POST", "/autopilot/:id/stop"], ["POST", "/autopilot/:id/resume"], ["POST", "/autopilot/:id/push"],
    ["GET", "/handoffs/:id"], ["POST", "/handoffs/:id/approve"], ["POST", "/handoffs/:id/reject"], ["POST", "/handoffs/:id/answer"],
    ["GET", "/jobs/:id"], ["POST", "/jobs/:id/approve"], ["POST", "/jobs/:id/reject"], ["POST", "/jobs/:id/kill"], ["POST", "/kill-all"],
    ["GET", "/ai/status"], ["GET", "/scan"], ["POST", "/scan/approve"], ["GET", "/github/repos"], ["POST", "/github/open"], ["GET", "/github/operations/:id"]];
  for (const [m, p] of can) assert.ok(main.includes(`["${m}", "${p}"`), "ctl thiếu " + m + " " + p);
  assert.ok(main.includes("/^\\/jobs\\/([^/]+)\\/log$/"), "ctl có /jobs/:id/log cho nhật ký lượt");
  assert.match(fs.readFileSync(path.join(__dirname, "..", "lib", "ctlbridge.js"), "utf8"), /"x-next-offset", "x-size"/, "cầu nối chuyển tiếp X-Next-Offset và X-Size");
});

test("OS-3: nhãn chung đọc đúng câu hỏi của luồng và tên lượt", async () => {
  const v = await import(require("node:url").pathToFileURL(path.join(PUB, "os", "viec-chung.js")).href);
  assert.equal(v.cauHoi({ question: { question: "Chọn A hay B?", options: [] } }), "Chọn A hay B?");
  assert.equal(v.cauHoi({ question: null }), "");
  assert.equal(v.tenLenh({ agent: "CODEX_ASTRA_DEV" }), "Lượt của Sasuke (Astra)");
  assert.equal(v.tenLenh({ agent: "CLAUDE_REPORTER" }), "Pain viết báo cáo");
  assert.equal(v.soLuot({ steps: [{}, { quota: true }, {}] }), 2);
  assert.ok(v.LUONG_SONG.has("waiting_quota") && v.LUONG_SONG.has("awaiting_scan") && !v.LUONG_SONG.has("approved"));
  assert.equal(v.tenDuAn(String.raw`D:\Projects\abc`), "abc");
  assert.equal(v.tenDuAn("/home/a/xyz"), "xyz");
});
