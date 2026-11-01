// Sổ tiến trình của OS Controller: mọi việc ctl chạy đều có dòng trong bảng jobs, có timeout, có log, dừng được cả cây.
// Việc ngoài danh sách cho phép vào trạng thái 'pending_approval' và chỉ chạy khi CEO duyệt (approve), hoặc bị từ chối (reject).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { killTree, alive } = require("../lib/proc");
const { cleanEnv, maskSecrets } = require("../lib/mask");
const { resolveProgram } = require("./policy");

const MAX_RUNNING = 8;
const MAX_TIMEOUT = 30 * 60 * 1000;
const COLS = "id, kind, agent, workspace, argv, pid, status, exit_code, started_at, ended_at, timeout_ms";
const row = (r) => {
  if (!r) return r;
  const { log_path, ...j } = r; // đường dẫn log chỉ dùng nội bộ, không trả ra API
  return { ...j, argv: JSON.parse(j.argv), runningS: j.started_at && j.status !== "pending_approval" ? Math.round(((j.ended_at || Date.now()) - j.started_at) / 1000) : 0 };
};
const err = (code, msg) => Object.assign(new Error(msg), { code });

function createJobs(db, audit, logDir) {
  const q = {
    insert: db.prepare("INSERT INTO jobs (id, kind, agent, workspace, argv, pid, status, started_at, timeout_ms, log_path) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)"),
    launch: db.prepare("UPDATE jobs SET status = 'running', pid = ?, started_at = ? WHERE id = ? AND status IN ('pending_approval', 'running')"),
    get: db.prepare(`SELECT ${COLS}, log_path FROM jobs WHERE id = ?`),
    byStatus: db.prepare(`SELECT ${COLS} FROM jobs WHERE status = ? ORDER BY started_at DESC LIMIT 500`),
    latest: db.prepare(`SELECT ${COLS} FROM jobs ORDER BY started_at DESC LIMIT 100`),
    running: db.prepare("SELECT id, pid FROM jobs WHERE status = 'running'"),
    runningAi: db.prepare("SELECT id FROM jobs WHERE status IN ('running', 'pending_approval') AND kind = 'ai' AND workspace = ?"),
    // Chỉ việc còn 'running' mới được đổi trạng thái: tránh "done" ghi đè "killed" khi tiến trình thoát sau lệnh dừng.
    finish: db.prepare("UPDATE jobs SET status = ?, exit_code = ?, ended_at = ? WHERE id = ? AND status = 'running'"),
    reject: db.prepare("UPDATE jobs SET status = 'rejected', ended_at = ? WHERE id = ? AND status = 'pending_approval'"),
  };
  const timers = new Map();
  // Lý do dừng ghi TRƯỚC khi gửi tín hiệu: tiến trình có thể thoát trước khi killTree trả về, khi đó sự kiện exit phải ghi đúng 'killed'/'timeout'.
  const stopping = new Map();
  const onExit = new Map(); // id -> hàm gọi khi việc kết thúc (runner AI dùng để đọc kết quả bàn giao)

  // ctl khởi động lại: việc còn ghi 'running' là của lần chạy trước. Không dừng theo PID cũ (PID có thể đã bị tiến trình khác dùng lại).
  for (const j of q.running.all()) {
    q.finish.run("failed", null, Date.now(), j.id);
    audit.log("ctl", "job.lost", j.id, { pid: j.pid, stillAlive: !!(j.pid && alive(j.pid)) });
  }

  function validate({ kind, agent, argv, timeoutMs }) {
    if (!["cmd", "ai"].includes(kind)) throw err("BAD_REQUEST", "kind không hợp lệ");
    if (!agent) throw err("BAD_REQUEST", "thiếu agent");
    if (!Array.isArray(argv) || !argv.length || !argv.every((a) => typeof a === "string")) throw err("BAD_REQUEST", "argv phải là mảng chuỗi");
    return Math.min(Math.max(1000, Number(timeoutMs) || 0), MAX_TIMEOUT);
  }

  function create({ kind = "cmd", agent, workspace = null, argv, timeoutMs = 10 * 60 * 1000 }, status) {
    timeoutMs = validate({ kind, agent, argv, timeoutMs });
    const id = "job-" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    q.insert.run(id, kind, String(agent), workspace, JSON.stringify(argv), status, Date.now(), timeoutMs, path.join(logDir, id + ".log"));
    return id;
  }

  function finished(id, j) {
    clearTimeout(timers.get(id)); timers.delete(id);
    const cb = onExit.get(id); onExit.delete(id);
    if (cb) { try { cb(row(q.get.get(id)), j); } catch (e) { audit.log("ctl", "job.onexit_error", id, e.message); } }
  }

  function launch(id) {
    const j = q.get.get(id);
    if (q.running.all().filter((x) => x.id !== id).length >= MAX_RUNNING) throw err("TOO_MANY", "Đã có " + MAX_RUNNING + " việc đang chạy, dừng bớt trước");
    if (j.kind === "ai" && j.workspace && q.runningAi.all(j.workspace).some((x) => x.id !== id && q.get.get(x.id).status === "running"))
      throw err("AI_BUSY", "Workspace này đang có 1 lượt AI chạy");
    const argv = JSON.parse(j.argv);
    const fd = fs.openSync(j.log_path, "a", 0o600);
    let child, resolveError = null;
    try {
      // shell: false: đối số đi thẳng tới chương trình, không qua cmd/PowerShell nên không chèn lệnh được.
      const prog = resolveProgram(argv[0]);
      child = spawn(prog[0], [...prog.slice(1), ...argv.slice(1)], { cwd: j.workspace || undefined, env: cleanEnv(), shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", fd, fd] });
    } catch (e) { resolveError = e; } finally { fs.closeSync(fd); }
    q.launch.run(child ? child.pid || null : null, Date.now(), id);
    if (resolveError) {
      fs.appendFileSync(j.log_path, "[ctl] không chạy được: " + resolveError.message + "\n");
      q.finish.run("failed", null, Date.now(), id);
      audit.log("ctl", "job.error", id, resolveError.message);
      finished(id, j);
      return row(q.get.get(id));
    }
    audit.log(j.agent, "job.start", id, { kind: j.kind, argv, workspace: j.workspace, pid: child.pid, timeoutMs: j.timeout_ms }, "allowed");

    child.on("error", (e) => {
      fs.appendFileSync(j.log_path, "\n[ctl] không chạy được: " + e.message + "\n");
      if (q.finish.run("failed", null, Date.now(), id).changes) audit.log("ctl", "job.error", id, e.message);
      finished(id, j);
    });
    child.on("exit", (code) => {
      const why = stopping.get(id); stopping.delete(id);
      if (q.finish.run(why || (code === 0 ? "done" : "failed"), code, Date.now(), id).changes) audit.log("ctl", why ? "job." + why : "job.exit", id, { code });
      finished(id, j);
    });
    const t = setTimeout(async () => {
      stopping.set(id, "timeout");
      const r = child.pid ? await killTree(child.pid) : { ok: true };
      if (!r.ok) { stopping.delete(id); audit.log("ctl", "job.timeout_kill_failed", id, { error: r.error }, "failed"); return; }
      if (q.finish.run("timeout", null, Date.now(), id).changes) audit.log("ctl", "job.timeout", id, { timeoutMs: j.timeout_ms });
    }, j.timeout_ms);
    t.unref();
    timers.set(id, t);
    return row(q.get.get(id));
  }

  // Chạy ngay (đã qua chính sách "allow", hoặc mã nội bộ như runner AI).
  function start(opts) {
    const id = create(opts, "running");
    if (opts.onExit) onExit.set(id, opts.onExit);
    try { return launch(id); }
    catch (e) { q.finish.run("failed", null, Date.now(), id); onExit.delete(id); throw e; }
  }

  // Đưa vào hàng chờ CEO duyệt.
  function propose(opts, reason, actor = "ceo") {
    const id = create(opts, "pending_approval");
    if (opts.onExit) onExit.set(id, opts.onExit);
    audit.log(actor, "job.propose", id, { argv: opts.argv, workspace: opts.workspace, reason }, "pending");
    return row(q.get.get(id));
  }

  function approve(id, actor = "ceo") {
    const j = q.get.get(id);
    if (!j) throw err("NOT_FOUND", "Không có việc " + id);
    if (j.status !== "pending_approval") throw err("NOT_PENDING", "Việc không ở trạng thái chờ duyệt (" + j.status + ")");
    audit.log(actor, "job.approve", id, { argv: JSON.parse(j.argv) }, "approved");
    return launch(id);
  }

  function reject(id, actor = "ceo") {
    const j = q.get.get(id);
    if (!j) throw err("NOT_FOUND", "Không có việc " + id);
    if (!q.reject.run(Date.now(), id).changes) throw err("NOT_PENDING", "Việc không ở trạng thái chờ duyệt (" + j.status + ")");
    onExit.delete(id);
    audit.log(actor, "job.reject", id, { argv: JSON.parse(j.argv) }, "rejected");
    return row(q.get.get(id));
  }

  async function kill(id, actor = "ceo") {
    const j = q.get.get(id);
    if (!j) return { id, pid: null, killed: false, error: "Không có việc " + id, code: "NOT_FOUND" };
    if (j.status !== "running") return { id, pid: j.pid, killed: false, error: "Việc không còn chạy (" + j.status + ")", code: "NOT_RUNNING" };
    stopping.set(id, "killed");
    const r = j.pid ? await killTree(j.pid) : { ok: true };
    if (r.ok) q.finish.run("killed", null, Date.now(), id);
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

  // Toàn bộ log (chưa che) cho mã nội bộ đọc kết quả bàn giao; không đưa ra API.
  function rawLog(id) { const j = q.get.get(id); try { return fs.readFileSync(j.log_path, "utf8"); } catch { return ""; } }

  return {
    start, propose, approve, reject, kill, killAll, readLog, rawLog,
    get: (id) => row(q.get.get(id)),
    list: (status) => (status ? q.byStatus.all(String(status)) : q.latest.all()).map(row),
    aiBusy: (workspace) => q.runningAi.all(workspace).length > 0,
  };
}

module.exports = { createJobs, MAX_RUNNING };
