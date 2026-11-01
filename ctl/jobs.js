// Sổ tiến trình của OS Controller: mọi việc ctl chạy đều có dòng trong bảng jobs, có timeout, có log, dừng được cả cây.
// Phase 3 chỉ cho mã nội bộ tạo việc (runner AI ở Phase 5, lệnh theo danh sách cho phép ở Phase 4); HTTP chỉ xem và dừng.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { killTree, alive } = require("../lib/proc");
const { cleanEnv, maskSecrets } = require("../lib/mask");

const MAX_RUNNING = 8;
const MAX_TIMEOUT = 30 * 60 * 1000;
const COLS = "id, kind, agent, workspace, argv, pid, status, exit_code, started_at, ended_at, timeout_ms";
const row = (r) => {
  if (!r) return r;
  const { log_path, ...j } = r; // đường dẫn log chỉ dùng nội bộ, không trả ra API
  return { ...j, argv: JSON.parse(j.argv), runningS: j.started_at ? Math.round(((j.ended_at || Date.now()) - j.started_at) / 1000) : 0 };
};

function createJobs(db, audit, logDir) {
  const q = {
    insert: db.prepare("INSERT INTO jobs (id, kind, agent, workspace, argv, pid, status, started_at, timeout_ms, log_path) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)"),
    get: db.prepare(`SELECT ${COLS}, log_path FROM jobs WHERE id = ?`),
    byStatus: db.prepare(`SELECT ${COLS} FROM jobs WHERE status = ? ORDER BY started_at DESC LIMIT 500`),
    latest: db.prepare(`SELECT ${COLS} FROM jobs ORDER BY started_at DESC LIMIT 100`),
    running: db.prepare("SELECT id, pid FROM jobs WHERE status = 'running'"),
    // Chỉ việc còn 'running' mới được đổi trạng thái: tránh "done" ghi đè "killed" khi tiến trình thoát sau lệnh dừng.
    finish: db.prepare("UPDATE jobs SET status = ?, exit_code = ?, ended_at = ? WHERE id = ? AND status = 'running'"),
  };
  const timers = new Map();
  // Lý do dừng ghi TRƯỚC khi gửi tín hiệu: tiến trình có thể thoát trước khi killTree trả về, khi đó sự kiện exit phải ghi đúng 'killed'/'timeout'.
  const stopping = new Map();

  // ctl khởi động lại: việc còn ghi 'running' là của lần chạy trước. Không dừng theo PID cũ (PID có thể đã bị tiến trình khác dùng lại).
  for (const j of q.running.all()) {
    q.finish.run("failed", null, Date.now(), j.id);
    audit.log("ctl", "job.lost", j.id, { pid: j.pid, stillAlive: !!(j.pid && alive(j.pid)) });
  }

  function start({ kind = "cmd", agent, workspace = null, argv, cwd, timeoutMs = 10 * 60 * 1000 }) {
    if (!["cmd", "ai"].includes(kind)) throw new Error("kind không hợp lệ");
    if (!agent) throw new Error("thiếu agent");
    if (!Array.isArray(argv) || !argv.length || !argv.every((a) => typeof a === "string")) throw new Error("argv phải là mảng chuỗi");
    timeoutMs = Math.min(Math.max(1000, Number(timeoutMs) || 0), MAX_TIMEOUT);
    if (q.running.all().length >= MAX_RUNNING) throw new Error("Đã có " + MAX_RUNNING + " việc đang chạy, dừng bớt trước");

    const id = "job-" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    const logPath = path.join(logDir, id + ".log");
    const fd = fs.openSync(logPath, "a", 0o600);
    let child;
    try {
      // shell: false: đối số đi thẳng tới chương trình, không qua cmd/PowerShell nên không chèn lệnh được.
      child = spawn(argv[0], argv.slice(1), { cwd: cwd || workspace || undefined, env: cleanEnv(), shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", fd, fd] });
    } finally { fs.closeSync(fd); }
    const startedAt = Date.now();
    q.insert.run(id, kind, String(agent), workspace, JSON.stringify(argv), child.pid || null, startedAt, timeoutMs, logPath);
    audit.log(agent, "job.start", id, { kind, argv, workspace, pid: child.pid, timeoutMs }, "allowed");

    child.on("error", (e) => {
      fs.appendFileSync(logPath, "\n[ctl] không chạy được: " + e.message + "\n");
      if (q.finish.run("failed", null, Date.now(), id).changes) audit.log("ctl", "job.error", id, e.message);
      clearTimeout(timers.get(id)); timers.delete(id);
    });
    child.on("exit", (code) => {
      const why = stopping.get(id); stopping.delete(id);
      if (q.finish.run(why || (code === 0 ? "done" : "failed"), code, Date.now(), id).changes) audit.log("ctl", why ? "job." + why : "job.exit", id, { code, timeoutMs: why === "timeout" ? timeoutMs : undefined });
      clearTimeout(timers.get(id)); timers.delete(id);
    });
    const t = setTimeout(async () => {
      stopping.set(id, "timeout");
      const r = child.pid ? await killTree(child.pid) : { ok: true };
      if (!r.ok) { stopping.delete(id); audit.log("ctl", "job.timeout_kill_failed", id, { timeoutMs, error: r.error }, "failed"); return; }
      if (q.finish.run("timeout", null, Date.now(), id).changes) audit.log("ctl", "job.timeout", id, { timeoutMs });
    }, timeoutMs);
    t.unref();
    timers.set(id, t);
    return row(q.get.get(id));
  }

  async function kill(id, actor = "ceo") {
    const j = q.get.get(id);
    if (!j) return { id, pid: null, killed: false, error: "Không có việc " + id, code: "NOT_FOUND" };
    if (j.status !== "running") return { id, pid: j.pid, killed: false, error: "Việc không còn chạy (" + j.status + ")", code: "NOT_RUNNING" };
    stopping.set(id, "killed");
    const r = j.pid ? await killTree(j.pid) : { ok: true };
    if (r.ok) { q.finish.run("killed", null, Date.now(), id); clearTimeout(timers.get(id)); timers.delete(id); }
    else stopping.delete(id);
    audit.log(actor, "job.kill", id, { pid: j.pid, killed: r.ok, error: r.error }, r.ok ? "done" : "failed");
    return { id, pid: j.pid, killed: r.ok, error: r.error || null };
  }

  async function killAll(actor = "ceo") {
    const list = q.running.all();
    const results = await Promise.all(list.map((j) => kill(j.id, actor)));
    audit.log(actor, "job.kill_all", null, { count: list.length, failed: results.filter((r) => !r.killed).length });
    return results;
  }

  function readLog(id, from = 0, max = 256 * 1024) {
    const j = q.get.get(id);
    if (!j || !j.log_path) return null;
    let size = 0;
    try { size = fs.statSync(j.log_path).size; } catch { return { text: "", next: 0, size: 0 }; }
    from = Math.min(Math.max(0, Number(from) || 0), size);
    const len = Math.min(max, size - from);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(j.log_path, "r");
    try { fs.readSync(fd, buf, 0, len, from); } finally { fs.closeSync(fd); }
    return { text: maskSecrets(buf.toString("utf8")), next: from + len, size };
  }

  return {
    start, kill, killAll, readLog,
    get: (id) => row(q.get.get(id)),
    list: (status) => (status ? q.byStatus.all(String(status)) : q.latest.all()).map(row),
    runningPids: () => q.running.all(),
  };
}

module.exports = { createJobs, MAX_RUNNING };
