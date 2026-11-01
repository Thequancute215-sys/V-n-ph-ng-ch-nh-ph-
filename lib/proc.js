// Dừng thật một tiến trình cùng toàn bộ tiến trình con của nó (nút phanh khẩn cấp).
// Windows: taskkill /T /F. Linux/macOS: gửi tín hiệu cho cả nhóm tiến trình (nếu tiến trình được tạo với detached), rồi tới chính nó.
// Trả về { ok, error } sau khi kiểm tra lại PID đã thật sự mất.
"use strict";
const { execFile } = require("child_process");

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }

function waitGone(pid, ms) {
  return new Promise((ok) => {
    const until = Date.now() + ms;
    (function tick() { if (!alive(pid)) return ok(true); if (Date.now() > until) return ok(false); setTimeout(tick, 50); })();
  });
}

async function killTree(pid, { timeoutMs = 3000 } = {}) {
  pid = Number(pid);
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return { ok: false, error: "PID không hợp lệ" };
  if (!alive(pid)) return { ok: true, already: true };
  if (process.platform === "win32") {
    await new Promise((ok) => execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: timeoutMs, windowsHide: true }, () => ok()));
  } else {
    try { process.kill(-pid, "SIGTERM"); } catch {}
    try { process.kill(pid, "SIGTERM"); } catch {}
    if (!(await waitGone(pid, timeoutMs / 2))) { try { process.kill(-pid, "SIGKILL"); } catch {} try { process.kill(pid, "SIGKILL"); } catch {} }
  }
  return (await waitGone(pid, timeoutMs)) ? { ok: true } : { ok: false, error: "Tiến trình " + pid + " vẫn còn chạy" };
}

module.exports = { killTree, alive };
