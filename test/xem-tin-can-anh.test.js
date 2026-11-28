// Nút "Xem tin" ở Việc cần anh (CEO báo 28/11/2026): bấm vào chỉ mở dòng tin lọc theo phiên, mà câu AI hỏi anh là chữ AI trả lời
// trong phiên, KHÔNG nằm trong sổ tin nhắn (sổ chỉ có tin anh gõ và tin AI nhắn nhau) — nên anh không bao giờ thấy câu hỏi.
// Sửa: máy chủ gửi kèm chiTiet (đoạn cuối tin AI, giữ xuống dòng, che khóa chặt hơn), Tổng quan mở chi tiết ngay tại hàng.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const freePort = () => new Promise((ok, bad) => { const s = net.createServer(); s.on("error", bad); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const getJson = (port, p) => new Promise((ok, bad) => {
  http.get({ host: "127.0.0.1", port, path: p }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { ok(JSON.parse(b)); } catch (e) { bad(e); } }); }).on("error", bad);
});

const t0 = Date.now() - 20 * 60000;   // các phiên rảnh: tin cuối đã 20 phút
const iso = (ms) => new Date(t0 + ms).toISOString();
const khoaGia = "sk-ant-" + "a".repeat(30);
// Phiên A: anh gõ việc, AI trả lời một tin hai khối text (khối trên nêu phương án kèm vài chuỗi bí mật, khối cuối hỏi).
const khoiTren = "Phần mở đầu dài. ".repeat(80) + "\nPhương án:\n(a) Merge ngay\n(b) Chờ thêm\n" +
  "Chữ thường không được che: tốn 5000 token rồi, đặt password mới hay giữ, hàm byKey có ổn, thư mục skills_directory.\n" +
  "Markdown: **password**: matkhau123 và `token`: bimat2.\n" +
  "Lệnh thử: curl -H \"Authorization: Bearer abc123def456\" và {\"token\": \"bimat-ngan\"} với postgres://nguoi:matkhau@may/csdl, đọc C:\\Users\\x\\.env, khóa " + khoaGia + ".";
const khoiCuoi = "Sếp duyệt giúp em merge PR này được không?";
const PHIEN_A = [
  { type: "user", timestamp: iso(0), message: { role: "user", content: "Kiểm giúp anh PR mới" } },
  { type: "assistant", timestamp: iso(5000), message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: khoiTren }, { type: "text", text: khoiCuoi }] } },
];
// Phiên B: AI đang chờ hộp hỏi (AskUserQuestion) có mô tả từng lựa chọn.
const PHIEN_B = [
  { type: "user", timestamp: iso(0), message: { role: "user", content: "Chọn giúp anh cách làm" } },
  { type: "assistant", timestamp: iso(4000), message: { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "AskUserQuestion", input: { questions: [
    { question: "Làm theo cách nào?", options: [{ label: "Cách A", description: "nhanh, ít kiểm" }, { label: "Cách B", description: "chậm, kiểm kỹ" }] }] } }] } },
];

// Phiên C: tin dài 200 KB không khoảng trắng (JSON nén, base64) rồi mới hỏi: máy chủ không được khựng.
const PHIEN_C = [
  { type: "user", timestamp: iso(0), message: { role: "user", content: "Dán log giúp anh" } },
  { type: "assistant", timestamp: iso(3000), message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "ab/".repeat(70000) + " Sếp xem log dài này rồi chọn giúp em nhé?" }] } },
];

async function startOffice(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-xem-tin-"));
  const home = path.join(dir, "home"), claudeDir = path.join(home, ".claude"), duAn = path.join(dir, "du-an");
  fs.mkdirSync(duAn, { recursive: true });
  for (const x of ["server.js", "package.json", "lib", "public"]) fs.cpSync(path.join(ROOT, x), path.join(dir, x), { recursive: true });
  const enc = path.resolve(duAn).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const pdir = path.join(claudeDir, "projects", enc); fs.mkdirSync(pdir, { recursive: true });
  for (const [id, lines] of [["11111111-2222-3333-4444-555555555555", PHIEN_A], ["66666666-2222-3333-4444-555555555555", PHIEN_B], ["77777777-2222-3333-4444-555555555555", PHIEN_C]]) {
    const f = path.join(pdir, id + ".jsonl");
    fs.writeFileSync(f, lines.map((x) => JSON.stringify(x)).join("\n") + "\n");
    const cu = new Date(t0 + 5000); fs.utimesSync(f, cu, cu);
  }
  // Sổ CAN-ANH: hai dòng đang chờ cùng người, cùng phút (khoá ở giao diện phải tách được hai mục).
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  const phut = new Date(t0).toISOString().slice(0, 16).replace("T", " ");
  fs.writeFileSync(path.join(dir, "data", "CAN-ANH.md"), `| Mã | Lúc | Ai | Việc | Lựa chọn | Trạng thái |\n|---|---|---|---|---|---|\n` +
    `| CA-1 | ${phut} | Claude thử | Duyệt việc một? | (a) Có | CHỜ |\n| CA-2 | ${phut} | Claude thử | Duyệt việc hai? | (a) Có | CHỜ |\n`);
  const port = await freePort(), ctlPort = await freePort();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ port, host: "127.0.0.1", projects: [duAn], claudeDir, codexDir: path.join(home, ".codex") }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, VP_HOME: path.join(home, ".van-phong-ao"), CTL_PORT: String(ctlPort), PORT: String(port) };
  const child = spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let log = ""; child.stdout.on("data", (c) => (log += c)); child.stderr.on("data", (c) => (log += c));
  t.after(async () => {   // chờ tiến trình thoát rồi mới xoá thư mục tạm (Windows giữ khoá tệp)
    if (child.exitCode === null) await new Promise((r) => { child.once("exit", r); child.kill(); });
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  });
  return { port, child, log: () => log };
}

test("Việc cần anh: chiTiet đủ dài, giữ xuống dòng, ghép các khối text của một tin và che khóa chặt", async (t) => {
  const { port, child, log } = await startOffice(t);
  let asks = [];
  for (let i = 0; i < 100; i++) {
    try { asks = (await getJson(port, "/state")).asks || []; } catch {}
    if (asks.some((a) => a.kind === "reply") && asks.some((a) => a.kind === "hoi") && asks.filter((a) => a.kind === "so").length === 2 && asks.some((a) => /log dài này/.test(a.text || ""))) break;
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  const reply = asks.find((a) => a.kind === "reply" && /duyệt giúp em merge/.test(a.text || ""));
  assert.ok(reply, "phải thấy câu hỏi đoán từ tin cuối:\n" + JSON.stringify(asks) + "\n" + log());
  const ct = reply.chiTiet;
  assert.ok(typeof ct === "string" && ct.length > 1000 && ct.length <= 1500, "chiTiet dài vừa đủ, có trần (" + (ct || "").length + ")");
  assert.ok(ct.startsWith("…"), "bị cắt đầu thì đánh dấu …");
  assert.match(ct, /Sếp duyệt giúp em merge PR này được không\?$/, "giữ trọn câu hỏi ở khối cuối");
  assert.match(ct, /Phương án:\n\(a\) Merge ngay\n\(b\) Chờ thêm/, "ghép khối trên và giữ xuống dòng");
  for (const chu of ["tốn 5000 token rồi", "đặt password mới hay giữ", "hàm byKey có ổn", "skills_directory"]) assert.ok(ct.includes(chu), "không che nhầm chữ thường: " + chu);
  for (const bimat of [khoaGia, "abc123def456", "bimat-ngan", "matkhau", "bimat2", "\\.env"]) assert.ok(!ct.includes(bimat), "phải che: " + bimat);

  const dai = asks.find((a) => /log dài này/.test(a.text || ""));
  assert.ok(dai && dai.chiTiet.length <= 1500 && /chọn giúp em nhé\?$/.test(dai.chiTiet), "tin 200 KB: vẫn đọc được câu hỏi, có trần");
  const bd = Date.now(); await getJson(port, "/state"); assert.ok(Date.now() - bd < 2000, "máy chủ không khựng vì tin dài");

  const hoi = asks.find((a) => a.kind === "hoi");
  assert.ok(hoi, "phải thấy hộp hỏi đang chờ");
  assert.match(hoi.chiTiet, /Làm theo cách nào\?\n\(a\) Cách A: nhanh, ít kiểm\n\(b\) Cách B: chậm, kiểm kỹ/, "hộp hỏi: từng lựa chọn kèm mô tả, xuống dòng");

  const so = asks.filter((a) => a.kind === "so");
  assert.strictEqual(so.length, 2, "hai dòng sổ cùng người cùng phút đều hiện");
  assert.strictEqual(so[0].since, so[1].since, "cùng thời điểm (trường hợp khoá dễ trùng)");
  assert.notStrictEqual(so[0].id, so[1].id, "khác mã dòng: giao diện dùng mã để tách khoá");
});

test("Tổng quan: Xem tin mở chi tiết tại hàng, khoá duy nhất, chỉ thay DOM khi đổi và giữ focus/vị trí cuộn", () => {
  const src = fs.readFileSync(path.join(ROOT, "public/os/khu/tong-quan.js"), "utf8");
  assert.match(src, /data-xem-hoi=/, "nút Xem tin là nút mở chi tiết");
  assert.match(src, /aria-expanded=/, "nút báo trạng thái mở cho trình đọc màn hình");
  assert.match(src, /\$\{mo \? ` aria-controls=/, "aria-controls chỉ khi khối chi tiết có trong DOM");
  assert.match(src, /esc\(a\.chiTiet \|\| a\.text/, "chi tiết phải thoát HTML");
  assert.match(src, /tabindex="0" data-cuon=/, "hộp chi tiết cuộn được bằng bàn phím");
  assert.match(src, /\[a\.kind \|\| "", a\.id \|\| "", a\.who \|\| "", a\.since \|\| 0/, "khoá gồm loại, mã dòng, người, thời điểm");
  assert.match(src, /daCo\.set\(goc, lan \+ 1\)/, "khoá trùng thì đánh số để vẫn duy nhất");
  assert.match(src, /if \(html === canAnhCuoi\) return;/, "không vẽ lại khi nội dung không đổi");
  assert.match(src, /p\.scrollTop = cuon\.get/, "giữ vị trí cuộn khi buộc phải vẽ lại");
  assert.doesNotMatch(src, />Xem tin<\/a>/, "không còn link Xem tin trỏ thẳng sang dòng tin");
});
