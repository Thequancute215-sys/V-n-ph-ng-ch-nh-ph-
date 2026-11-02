// Chạy cùng lúc văn phòng (server.js, cổng 7788) và OS Controller (ctl, cổng 7790): `npm run all`.
// Ctrl+C tắt cả hai; ctl tự dừng mọi việc nó đang chạy trước khi thoát. Một bên chết thì tắt bên còn lại để không chạy nửa vời.
// Thêm `--tu-bat-lai` (app bật ngầm bằng `npm run app` / cùng Windows dùng cờ này): bên nào sập thì tự bật lại bên đó sau 3 giây,
// tối đa 5 lần trong 10 phút; sập nhiều hơn là lỗi thật, tắt hẳn để không lặp vô hạn (xem log ~/.van-phong-ao/logs/app.log).
// Windows không có tín hiệu thật: kill("SIGTERM") là giết cứng, ctl không kịp dừng việc của nó → tiến trình mồ côi.
// Vì vậy ctl được báo tắt qua kênh IPC ("stop"), và chỉ bị giết cứng (cả cây) nếu quá hạn mà vẫn chưa thoát.
"use strict";
const path = require("path");
const { spawn } = require("child_process");
const { killTree } = require("../lib/proc");

const root = path.join(__dirname, "..");
const GRACE_MS = 8000; // ctl cần: dừng từng việc (taskkill tối đa 3s) + chờ exit + đóng db
const RESTART = { on: process.argv.includes("--tu-bat-lai"), delayMs: 3000, max: 5, windowMs: 10 * 60000 };
// VP_TEST_KIDS: test thay hai tiến trình bằng chương trình giả (đường dẫn tuyệt đối), không đụng cổng thật.
const NAMES = process.env.VP_TEST_KIDS ? JSON.parse(process.env.VP_TEST_KIDS) : { ctl: path.join("ctl", "main.js"), office: "server.js" };
const kids = {};
const crashes = { ctl: [], office: [] };
const running = (k) => k && k.exitCode === null && k.signalCode === null;
const stamp = () => new Date().toISOString();

let stopping = false, exitCode = 0;
function launch(name) {
  const k = spawn(process.execPath, [path.resolve(root, NAMES[name])], { cwd: root, stdio: ["inherit", "inherit", "inherit", "ipc"] });
  kids[name] = k;
  k.on("exit", (c, sig) => {
    if (stopping) { if (!Object.values(kids).some(running)) process.exit(exitCode); return; }
    const now = Date.now();
    crashes[name] = crashes[name].filter((t) => now - t < RESTART.windowMs).concat(now);
    if (RESTART.on && crashes[name].length <= RESTART.max) {
      console.error(`[${stamp()}] ${NAMES[name]} đã thoát (mã ${c ?? sig}): tự bật lại sau ${RESTART.delayMs / 1000}s (lần ${crashes[name].length}/${RESTART.max} trong 10 phút)`);
      setTimeout(() => { if (!stopping) launch(name); }, RESTART.delayMs);
      return;
    }
    if (RESTART.on) console.error(`[${stamp()}] ${NAMES[name]} sập ${crashes[name].length} lần trong 10 phút: tắt hẳn văn phòng, xem log để sửa lỗi.`);
    stop(c || 0);
  });
}

function stop(code) {
  if (stopping) return; stopping = true; exitCode = code;
  const { ctl, office } = kids;
  if (running(ctl)) { try { ctl.send("stop"); } catch { ctl.kill("SIGTERM"); } }
  if (running(office)) office.kill("SIGTERM"); // văn phòng chỉ đọc, không có tiến trình con: giết ngay được
  if (!Object.values(kids).some(running)) process.exit(exitCode);
  setTimeout(async () => {
    for (const k of Object.values(kids)) if (running(k)) { console.error(`[npm run all] PID ${k.pid} chưa thoát sau ${GRACE_MS / 1000}s: dừng cả cây`); await killTree(k.pid); }
    process.exit(exitCode);
  }, GRACE_MS).unref();
}

launch("ctl");
launch("office");
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("SIGHUP", () => stop(0)); // Windows: đóng cửa sổ terminal
