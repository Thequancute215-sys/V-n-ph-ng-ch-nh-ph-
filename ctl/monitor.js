// Giám sát tài nguyên (vai Pain Thiên Đạo): CPU/RAM toàn máy + từng việc ctl đang chạy.
// Từng việc chỉ tính tiến trình gốc (chưa cộng tiến trình con). Linux đọc /proc; Windows hỏi PowerShell, lưu đệm 5 giây vì lệnh này chậm.
"use strict";
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

function cpuTimes() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const v of Object.values(c.times)) total += v; idle += c.times.idle; } return { idle, total }; }

function createMonitor() {
  let lastCpu = cpuTimes();
  const lastProc = new Map(); // pid -> { ticks, at }
  let winCache = { at: 0, data: new Map(), busy: false };
  const TICK = 100; // USER_HZ trên Linux

  function machine() {
    const now = cpuTimes();
    const dt = now.total - lastCpu.total, di = now.idle - lastCpu.idle;
    lastCpu = now;
    const total = os.totalmem(), free = os.freemem();
    return { cpuPct: dt > 0 ? Math.round((1 - di / dt) * 1000) / 10 : 0, memUsedMb: Math.round((total - free) / 1048576), memTotalMb: Math.round(total / 1048576) };
  }

  function linuxProc(pid) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const f = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const ticks = Number(f[11]) + Number(f[12]); // utime + stime
      const rssPages = Number(fs.readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]);
      const prev = lastProc.get(pid), at = Date.now();
      lastProc.set(pid, { ticks, at });
      const cpuPct = prev && at > prev.at ? Math.round(((ticks - prev.ticks) / TICK) / ((at - prev.at) / 1000) * 1000) / 10 : null;
      return { cpuPct, memMb: Math.round((rssPages * 4096) / 1048576) };
    } catch { return { cpuPct: null, memMb: null }; }
  }

  function refreshWindows(pids) {
    if (winCache.busy || Date.now() - winCache.at < 5000 || !pids.length) return;
    winCache.busy = true;
    const cmd = `Get-Process -Id ${pids.map(Number).join(",")} -ErrorAction SilentlyContinue | Select-Object Id,CPU,WorkingSet64 | ConvertTo-Json -Compress`;
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { timeout: 4000, windowsHide: true }, (err, out) => {
      const data = new Map(), at = Date.now();
      if (!err) {
        try {
          let arr = JSON.parse(out || "[]"); if (!Array.isArray(arr)) arr = [arr];
          for (const p of arr) {
            const prev = lastProc.get(p.Id); lastProc.set(p.Id, { ticks: p.CPU, at });
            const cpuPct = prev && at > prev.at ? Math.round(((p.CPU - prev.ticks) / ((at - prev.at) / 1000)) * 1000 / os.cpus().length) / 10 : null;
            data.set(p.Id, { cpuPct, memMb: Math.round(p.WorkingSet64 / 1048576) });
          }
        } catch {}
      }
      winCache = { at, data, busy: false };
    });
  }

  function snapshot(jobs) {
    const pids = jobs.map((j) => j.pid).filter(Boolean);
    if (process.platform === "win32") refreshWindows(pids);
    for (const pid of lastProc.keys()) if (!pids.includes(pid)) lastProc.delete(pid);
    return {
      at: Date.now(), ...machine(),
      jobs: jobs.map((j) => ({ id: j.id, agent: j.agent, pid: j.pid, runningS: j.runningS,
        ...(process.platform === "win32" ? winCache.data.get(j.pid) || { cpuPct: null, memMb: null } : linuxProc(j.pid)) })),
    };
  }

  return { snapshot };
}

module.exports = { createMonitor };
