// Chạy cùng lúc văn phòng (server.js, cổng 7788) và OS Controller (ctl, cổng 7790): `npm run all`.
// Ctrl+C tắt cả hai; ctl tự dừng mọi việc nó đang chạy trước khi thoát. Một bên chết thì tắt bên còn lại để không chạy nửa vời.
"use strict";
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const kids = [
  spawn(process.execPath, [path.join(root, "ctl", "main.js")], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [path.join(root, "server.js")], { cwd: root, stdio: "inherit" }),
];
let stopping = false;
function stop(code) {
  if (stopping) return; stopping = true;
  for (const k of kids) if (k.exitCode === null) k.kill("SIGTERM");
  setTimeout(() => process.exit(code), 4000).unref();
}
for (const k of kids) k.on("exit", (c) => { if (kids.every((x) => x.exitCode !== null || x.signalCode)) process.exit(c || 0); stop(c || 0); });
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
