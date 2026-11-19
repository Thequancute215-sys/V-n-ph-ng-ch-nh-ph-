// Giữ văn phòng "sạch" sau đợt sửa 17/11/2026 (mục 6 của docs/BAN-DO-HE-THONG.md):
//  - đường nhắn tin PIN cũ (/chat/*, lib/chat.js, public/chat-ui.js) đã bỏ: chat với AI đi qua /ctl/chat;
//  - "Phát loa" giả (/api/broadcast, /api/accept-broadcast, việc ghi trong bộ nhớ không ai chạy) đã bỏ:
//    nút 📢 mở mục "Giao việc cho cả đội" thật của bàn làm việc (/ctl/autopilot);
//  - "Task đang chạy" và phanh khẩn cấp chỉ còn việc thật của OS Controller, ctl tắt thì báo rõ;
//  - mọi /api/… mà giao diện gọi phải có trên máy chủ; không còn chữ tiếng Việt hỏng mã hoá trong repo.
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
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const freePort = () => new Promise((ok, bad) => { const s = net.createServer(); s.on("error", bad); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
function req(port, method, p, body) {
  return new Promise((ok, bad) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: data ? { "content-type": "application/json", "content-length": data.length } : {} }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let json = null; try { json = JSON.parse(b); } catch {} ok({ status: res.statusCode, json, text: b }); });
    });
    r.on("error", bad); r.setTimeout(10000, () => r.destroy(new Error("hết giờ " + p))); r.end(data);
  });
}

// Dựng máy chủ văn phòng thật từ bản chép của mã (server.js + lib/ + public/), HOME tạm: không đụng ~/.claude, ~/.van-phong-ao của máy.
async function startOffice(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-sach-"));
  const home = path.join(dir, "home"); fs.mkdirSync(home);
  for (const x of ["server.js", "package.json", "lib", "public"]) fs.cpSync(path.join(ROOT, x), path.join(dir, x), { recursive: true });
  const port = await freePort(), ctlPort = await freePort();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ port, host: "127.0.0.1", projects: [path.join(dir, "du-an")] }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, VP_HOME: path.join(home, ".van-phong-ao"), CTL_PORT: String(ctlPort), PORT: String(port) };
  const child = spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let log = ""; child.stdout.on("data", (c) => (log += c)); child.stderr.on("data", (c) => (log += c));
  t.after(() => { child.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  for (let i = 0; i < 100; i++) {
    try { const r = await req(port, "GET", "/state"); if (r.status === 200) return port; } catch {}
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Văn phòng không lên được:\n" + log);
}

test("máy chủ: đường nhắn tin PIN và phát loa giả đã bỏ; việc đang chạy và phanh chỉ còn việc thật của ctl", async (t) => {
  const port = await startOffice(t);
  for (const [m, p] of [["GET", "/chat/status"], ["POST", "/chat/send"], ["POST", "/api/broadcast"], ["POST", "/api/accept-broadcast"]]) {
    const r = await req(port, m, p, m === "POST" ? { text: "x", to: "ceo" } : undefined);
    assert.strictEqual(r.status, 404, `${m} ${p} phải không còn (được ${r.status})`);
  }
  const run = await req(port, "GET", "/api/running-tasks");
  assert.strictEqual(run.status, 200);
  assert.deepStrictEqual({ ok: run.json.ok, tasks: run.json.tasks, runningCount: run.json.runningCount, ctlOnline: run.json.ctlOnline }, { ok: true, tasks: [], runningCount: 0, ctlOnline: false });
  // ctl tắt: phanh báo rõ là không dừng được, không giả vờ "đã dừng"
  const all = await req(port, "POST", "/api/kill-task", { all: true });
  assert.strictEqual(all.status, 503); assert.strictEqual(all.json.ok, false); assert.match(all.json.error, /OS Controller không chạy/);
  const one = await req(port, "POST", "/api/kill-task", { taskId: "ctl:abc" });
  assert.strictEqual(one.status, 503);
  const fake = await req(port, "POST", "/api/kill-task", { taskId: "task-cu-trong-bo-nho" });
  assert.strictEqual(fake.status, 404);
  // hòm thư không còn mục "pending" luôn rỗng
  const ht = await req(port, "GET", "/hopthu");
  assert.strictEqual(ht.status, 200); assert.ok(Array.isArray(ht.json.roles)); assert.ok(!("pending" in ht.json), "/hopthu còn mục pending");
  // các API còn lại vẫn chạy
  for (const p of ["/state", "/docs", "/tongquan", "/perf", "/api/accounts", "/"]) assert.strictEqual((await req(port, "GET", p)).status, 200, p);
});

test("giao diện: mọi /api/… trang gọi đều có trên máy chủ; không còn chat-ui.js, PIN hay phát loa giả", () => {
  const server = read("server.js");
  const pub = fs.readdirSync(path.join(ROOT, "public")).filter((f) => /\.(html|js)$/.test(f));
  assert.ok(!fs.existsSync(path.join(ROOT, "public", "chat-ui.js")) && !fs.existsSync(path.join(ROOT, "lib", "chat.js")));
  for (const f of pub) {
    const s = read(path.join("public", f));
    // chỉ lời gọi thẳng máy chủ văn phòng; dieu-khien.html gọi /api/… qua kênh điện thoại /dkx (lib/dieu-khien-xa.js)
    for (const [, api] of s.matchAll(/fetch\(\s*["'`](\/api\/[a-z0-9/-]+)/gi)) assert.ok(server.includes(`url.pathname === "${api}"`), `${f} gọi ${api} mà máy chủ không có`);
    assert.ok(!/chat-ui\.js|x-pin|["'`]\/?chat\/(send|status)/.test(s), f + " còn trỏ tới đường nhắn tin PIN cũ");
  }
  assert.ok(!/require\("\.\/lib\/chat"\)|startsWith\("\/chat\/"\)/.test(server), "server.js còn đường /chat/* cũ");
  const idx = read("public/index.html");
  assert.ok(!/broadcastModal|currentConsensus|peerReview/.test(idx), "index.html còn hộp phát loa giả");
  assert.match(idx, /data-desk="assign"/, "nút 📢 phải mở mục Giao việc cho cả đội của bàn làm việc");
  assert.match(read("public/office-desk.js"), /request\("\/autopilot", \{ workspace, task \}\)/, "mục Giao việc cho cả đội phải gọi luồng tự động thật");
});

test("không còn chữ tiếng Việt hỏng mã hoá (UTF-8 bị đọc nhầm thành cp1252) trong mã, test và tài liệu", () => {
  const MOJIBAKE = /Ã[\u0080-\u00BF]|á»|áº|Æ°|Ä‘|â†’/;
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) { if (![".git", ".ua", "node_modules", "data"].includes(e.name)) walk(rel); continue; }
      if (!/\.(js|md|html|css|json|yml|ps1|sh)$/.test(e.name) || rel === path.join("test", "van-phong-sach.test.js")) continue;
      read(rel).split("\n").forEach((l, i) => { if (MOJIBAKE.test(l)) bad.push(`${rel}:${i + 1}`); });
    }
  };
  walk(".");
  assert.deepStrictEqual(bad, []);
});
