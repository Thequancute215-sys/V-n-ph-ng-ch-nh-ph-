// Chạy cùng lúc văn phòng (server.js, cổng 7788) và OS Controller (ctl, cổng 7790): `npm run all`.
// Ctrl+C tắt cả hai; ctl tự dừng mọi việc nó đang chạy trước khi thoát. Một bên chết thì tắt bên còn lại để không chạy nửa vời.
// Windows không có tín hiệu thật: kill("SIGTERM") là giết cứng, ctl không kịp dừng việc của nó → tiến trình mồ côi.
// Vì vậy ctl được báo tắt qua kênh IPC ("stop"), và chỉ bị giết cứng (cả cây) nếu quá hạn mà vẫn chưa thoát.
"use strict";
const path = require("path");
const { spawn } = require("child_process");
const { killTree } = require("../lib/proc");

const root = path.join(__dirname, "..");
const GRACE_MS = 8000; // ctl cần: dừng từng việc (taskkill tối đa 3s) + chờ exit + đóng db
const ctl = spawn(process.execPath, [path.join(root, "ctl", "main.js")], { cwd: root, stdio: ["inherit", "inherit", "inherit", "ipc"] });
const office = spawn(process.execPath, [path.join(root, "server.js")], { cwd: root, stdio: ["inherit", "inherit", "inherit", "ipc"] });
const kids = [ctl, office];
const running = (k) => k.exitCode === null && k.signalCode === null;

let stopping = false, exitCode = 0;
function stop(code) {
  if (stopping) return; stopping = true; exitCode = code;
  if (running(ctl)) { try { ctl.send("stop"); } catch { ctl.kill("SIGTERM"); } }
  if (running(office)) office.kill("SIGTERM"); // văn phòng chỉ đọc, không có tiến trình con: giết ngay được
  setTimeout(async () => {
    for (const k of kids) if (running(k)) { console.error(`[npm run all] PID ${k.pid} chưa thoát sau ${GRACE_MS / 1000}s: dừng cả cây`); await killTree(k.pid); }
    process.exit(exitCode);
  }, GRACE_MS).unref();
}
for (const k of kids) k.on("exit", (c) => { if (!kids.some(running)) process.exit(stopping ? exitCode : c || 0); stop(c || 0); });
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("SIGHUP", () => stop(0)); // Windows: đóng cửa sổ terminal
