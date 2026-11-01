// Mở app Văn phòng AI: `npm run app` (lối tắt Desktop cũng chạy file này).
//  - Văn phòng chưa chạy: bật `scripts/chay-tat-ca.js` (văn phòng + OS Controller) chạy ngầm, không cửa sổ, log vào
//    ~/.van-phong-ao/logs/app.log, PID vào ~/.van-phong-ao/app.pid; chờ tới khi trả lời.
//  - Rồi mở cửa sổ app (Edge/Chrome chế độ --app). Thêm `--nen` thì chỉ bật ngầm, không mở cửa sổ (dùng khi tự bật cùng Windows).
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { loadConfig } = require("../lib/config");
const app = require("../lib/app");

const root = path.join(__dirname, "..");
const background = process.argv.includes("--nen");

(async () => {
  const cfg = loadConfig(root);
  if (!cfg) { console.error("Chưa có config.json: chạy `npm run setup` trước."); process.exit(1); }
  const port = Number(process.env.PORT || cfg.port);
  const url = `http://localhost:${port}/`;

  if (await app.isUp(port)) {
    console.log("Văn phòng đang chạy tại " + url);
  } else {
    fs.mkdirSync(path.dirname(app.LOG_FILE()), { recursive: true });
    const log = fs.openSync(app.LOG_FILE(), "a");
    fs.writeSync(log, `\n===== ${new Date().toISOString()} bật văn phòng (npm run app) =====\n`);
    const child = spawn(process.execPath, [path.join(root, "scripts", "chay-tat-ca.js")], { cwd: root, detached: true, windowsHide: true, stdio: ["ignore", log, log] });
    fs.closeSync(log);
    fs.writeFileSync(app.PID_FILE(), String(child.pid));
    child.unref();
    console.log("Đang bật văn phòng (chạy ngầm, log: " + app.LOG_FILE() + ")…");
    if (!(await app.waitUp(port, 30000))) {
      console.error("Văn phòng không bật lên sau 30 giây. Xem log: " + app.LOG_FILE());
      process.exit(1);
    }
    console.log("Văn phòng đã chạy tại " + url);
  }

  if (background) return;
  const browser = app.findBrowser();
  const [cmd, args] = app.openCommand(url, browser);
  const w = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: false });
  w.on("error", (e) => { console.error("Không mở được cửa sổ app (" + cmd + "): " + e.message + ". Mở tay: " + url); process.exitCode = 1; });
  w.unref();
  console.log(browser ? "Đã mở cửa sổ app bằng " + path.basename(browser) : "Đã mở bằng trình duyệt mặc định (không tìm thấy Edge/Chrome để mở dạng app)");
})();
