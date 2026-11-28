// Nút "Xem tin" ở Việc cần anh (CEO báo 28/11/2026): bấm vào chỉ mở dòng tin lọc theo phiên, mà câu AI hỏi anh là chữ AI trả lời
// trong phiên, KHÔNG nằm trong sổ tin nhắn (sổ chỉ có tin anh gõ và tin AI nhắn nhau) — nên anh không bao giờ thấy câu hỏi.
// Sửa: máy chủ gửi kèm chiTiet (đoạn cuối tin AI, đã che khóa), Tổng quan mở chi tiết ngay tại hàng.
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

test("Việc cần anh: câu AI hỏi trong phiên có chiTiet đủ dài (đoạn cuối tin, che khóa) để Xem tin đọc trọn", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-xem-tin-"));
  const home = path.join(dir, "home"), claudeDir = path.join(home, ".claude"), duAn = path.join(dir, "du-an");
  fs.mkdirSync(duAn, { recursive: true });
  for (const x of ["server.js", "package.json", "lib", "public"]) fs.cpSync(path.join(ROOT, x), path.join(dir, x), { recursive: true });
  // Một phiên Claude: anh gõ việc, AI trả lời dài rồi hỏi anh ở cuối.
  const enc = path.resolve(duAn).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const pdir = path.join(claudeDir, "projects", enc); fs.mkdirSync(pdir, { recursive: true });
  const t0 = Date.now() - 20 * 60000;   // phiên rảnh: tin cuối đã 20 phút
  const dau = "Phần mở đầu dài. ".repeat(120);   // ~2000 ký tự: lastTail cũ (500) không còn phần này
  const khoaGia = "sk-ant-" + "a".repeat(30);
  const traLoi = dau + "Em đã kiểm xong, khóa thử " + khoaGia + " không được in ra. Sếp duyệt giúp em merge PR này được không?";
  const lines = [
    { type: "user", timestamp: new Date(t0).toISOString(), message: { role: "user", content: "Kiểm giúp anh PR mới" } },
    { type: "assistant", timestamp: new Date(t0 + 5000).toISOString(), message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: traLoi }] } },
  ];
  const f = path.join(pdir, "11111111-2222-3333-4444-555555555555.jsonl");
  fs.writeFileSync(f, lines.map((x) => JSON.stringify(x)).join("\n") + "\n");
  const cu = new Date(t0 + 5000); fs.utimesSync(f, cu, cu);   // phiên rảnh (không ghi trong mấy giây gần đây)

  const port = await freePort(), ctlPort = await freePort();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ port, host: "127.0.0.1", projects: [duAn], claudeDir, codexDir: path.join(home, ".codex") }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, VP_HOME: path.join(home, ".van-phong-ao"), CTL_PORT: String(ctlPort), PORT: String(port) };
  const child = spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let log = ""; child.stdout.on("data", (c) => (log += c)); child.stderr.on("data", (c) => (log += c));
  t.after(() => { child.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  let ask = null;
  for (let i = 0; i < 100 && !ask; i++) {
    try { const s = await getJson(port, "/state"); ask = (s.asks || []).find((a) => /duyệt giúp em/.test(a.text || "")); } catch {}
    if (child.exitCode !== null) break;
    if (!ask) await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(ask, "phải thấy câu hỏi ở asks:\n" + log);
  assert.ok(ask.guess, "câu hỏi này do máy đoán từ câu cuối");
  assert.ok(typeof ask.chiTiet === "string" && ask.chiTiet.length > 1000, "chiTiet đủ dài để đọc ngữ cảnh (" + (ask.chiTiet || "").length + ")");
  assert.ok(ask.chiTiet.length <= 1500, "chiTiet có trần");
  assert.match(ask.chiTiet, /Sếp duyệt giúp em merge PR này được không\?$/, "chiTiet giữ trọn câu hỏi ở cuối");
  assert.ok(!ask.chiTiet.includes(khoaGia), "chiTiet phải che khóa");
});

test("Tổng quan: Xem tin mở chi tiết tại hàng (không còn chỉ là link sang dòng tin), giữ trạng thái mở khi vẽ lại", () => {
  const src = fs.readFileSync(path.join(ROOT, "public/os/khu/tong-quan.js"), "utf8");
  assert.match(src, /data-xem-hoi=/, "nút Xem tin là nút mở chi tiết");
  assert.match(src, /aria-expanded=/, "nút báo trạng thái mở cho trình đọc màn hình");
  assert.match(src, /esc\(a\.chiTiet \|\| a\.text/, "chi tiết phải thoát HTML");
  assert.match(src, /const moHoi = new Set\(\)/, "nhớ mục đang mở qua các lần vẽ lại");
  assert.doesNotMatch(src, /tieu: cat\(a\.text, 220\)[^\n]*href="#\/tin-nhan\?ai=[^\n]*>Xem tin</, "không còn link Xem tin trỏ thẳng sang dòng tin");
});
