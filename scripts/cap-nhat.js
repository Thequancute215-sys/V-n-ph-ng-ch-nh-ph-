// Bộ cập nhật app (lib/cap-nhat.js): ctl chạy file này khi người dùng bấm "Cập nhật" trên trang cap-nhat.html.
//   node scripts/cap-nhat.js --tach --tu <sha cũ> --den <sha mới> --ten <v1.2.0>
// Các bước: tắt văn phòng (scripts/tat-app.js) → fast-forward lên bản mới → bật lại (scripts/mo-app.js --nen) → kiểm ctl trả lời
// đúng phiên bản mới. Bản mới không chạy được thì tự quay về bản cũ và bật lại. Tiến độ ghi ở ~/.van-phong-ao/cap-nhat.json.
// --tach: chạy lại chính file này tách hẳn khỏi cây tiến trình của văn phòng rồi thoát ngay, để lúc tắt văn phòng
// (dừng cả cây tiến trình) bộ cập nhật không bị dừng theo.
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const u = require("../lib/cap-nhat");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SHA = /^[0-9a-f]{40}$/;

if (args.includes("--tach")) {
  const c = spawn(process.execPath, [__filename, ...args.filter((a) => a !== "--tach")], { cwd: root, detached: true, windowsHide: true, stdio: "ignore" });
  c.unref();
  process.exit(0);
}

const from = opt("--tu"), to = opt("--den"), name = opt("--ten") || String(to).slice(0, 7);
if (!SHA.test(String(from)) || !SHA.test(String(to))) { console.error("Cần --tu và --den là mã commit đầy đủ (40 ký tự)."); process.exit(2); }

fs.mkdirSync(path.dirname(u.LOG_FILE()), { recursive: true });
const log = (m) => fs.appendFileSync(u.LOG_FILE(), `[${new Date().toISOString()}] ${m}\n`);

function node(script, ...a) {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", script), ...a], { cwd: root, encoding: "utf8", timeout: 90000, windowsHide: true });
  log(`${script} ${a.join(" ")} → mã ${r.status}${r.error ? " (" + r.error.message + ")" : ""}\n${String(r.stdout || "").trim()}\n${String(r.stderr || "").trim()}`.trim());
  return r.status === 0;
}

// ctl mới phải trả lời /health với đúng phiên bản trong package.json mới (token ctl ghi mỗi lần khởi động).
function ctlVersion() {
  return new Promise((ok) => {
    let token;
    try { token = fs.readFileSync(path.join(u.HOME(), "ctl-token"), "utf8").trim(); } catch { return ok(null); }
    const r = http.get({ host: "127.0.0.1", port: Number(process.env.CTL_PORT || 7790), path: "/health", timeout: 2000, headers: { authorization: "Bearer " + token, host: "127.0.0.1" } }, (res) => {
      let body = ""; res.on("data", (d) => (body += d)); res.on("end", () => { try { ok(JSON.parse(body).version || null); } catch { ok(null); } });
    });
    r.on("timeout", () => r.destroy());
    r.on("error", () => ok(null));
  });
}
async function healthy() {
  const want = u.localVersion(root);
  for (let i = 0; i < 40; i++) {
    const v = await ctlVersion();
    if (v && v === want) return true;
    await new Promise((r) => setTimeout(r, 750));
  }
  log("ctl không trả lời đúng phiên bản " + want + " sau 30 giây");
  return false;
}

log(`===== cập nhật ${from.slice(0, 7)} → ${name} (${to.slice(0, 7)}) =====`);
u.runUpdate({ root, from, to, name, log, healthy,
  stopApp: async () => node("tat-app.js"),
  startApp: async () => node("mo-app.js", "--nen"),
}).then((s) => { log("kết quả: " + s.status); process.exit(s.status === "xong" ? 0 : 1); },
  (e) => { log("lỗi: " + (e.stack || e.message)); u.writeState({ status: "loi", from, to, name, message: "Bộ cập nhật gặp lỗi: " + e.message, log: u.LOG_FILE() }); process.exit(1); });
