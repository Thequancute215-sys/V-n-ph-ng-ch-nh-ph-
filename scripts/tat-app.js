// Tắt Văn phòng AI đã bật bằng `npm run app`: `npm run tat-app`.
// Dừng tiến trình chay-tat-ca theo PID đã lưu. Trên Windows đó là giết cứng tiến trình cha, nhưng ctl và văn phòng
// nghe kênh IPC: kênh đứt thì tự tắt êm (ctl dừng hết việc đang chạy trước). Quá 15 giây còn chạy thì dừng cả cây.
"use strict";
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("../lib/config");
const { killTree, alive } = require("../lib/proc");
const app = require("../lib/app");

(async () => {
  const cfg = loadConfig(path.join(__dirname, ".."));
  const port = Number(process.env.PORT || (cfg && cfg.port) || 7788);
  let pid = null;
  try { pid = Number(fs.readFileSync(app.PID_FILE(), "utf8").trim()) || null; } catch {}
  if (!pid || !alive(pid)) {
    if (await app.isUp(port)) { console.error("Văn phòng đang chạy nhưng không do `npm run app` bật (không có PID). Tắt ở cửa sổ terminal đã chạy nó (Ctrl+C)."); process.exit(1); }
    console.log("Văn phòng không chạy.");
    try { fs.unlinkSync(app.PID_FILE()); } catch {}
    return;
  }
  try { process.kill(pid, process.platform === "win32" ? undefined : "SIGINT"); } catch {}
  if (!(await app.waitUp(port, 15000, false)) || alive(pid)) {
    const r = await killTree(pid);
    if (!r.ok) { console.error("Không tắt được: " + r.error); process.exit(1); }
  }
  try { fs.unlinkSync(app.PID_FILE()); } catch {}
  console.log("Đã tắt văn phòng.");
})();
