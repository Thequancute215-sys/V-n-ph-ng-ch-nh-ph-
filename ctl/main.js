// OS Controller (ctl): tiến trình riêng, chỉ nghe 127.0.0.1:7790. Phase 3: xem việc đang chạy, dừng (từng việc / tất cả),
// đọc log đã che khóa, giám sát CPU/RAM. Chưa có route chạy lệnh hay đọc/ghi file (Phase 4).
// Mọi yêu cầu cần "Authorization: Bearer <token>"; token sinh mới mỗi lần khởi động, nằm ở ~/.van-phong-ao/ctl-token (quyền 600),
// chỉ server.js trên cùng máy đọc để làm cầu nối, không bao giờ gửi xuống trình duyệt.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const guard = require("../lib/guard");
const { open, home } = require("./db");
const { createAudit } = require("./audit");
const { createJobs } = require("./jobs");
const { createMonitor } = require("./monitor");

const VERSION = "0.3.0";
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function createCtl({ dir = home(), token = crypto.randomBytes(32).toString("hex") } = {}) {
  const db = open(dir);
  const audit = createAudit(db);
  const jobs = createJobs(db, audit, path.join(dir, "logs"));
  const monitor = createMonitor();
  const tokenBuf = Buffer.from(token);
  const streams = new Set();
  audit.prune();

  const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  const fail = (res, code, err, error) => send(res, code, { ok: false, code: err, error });
  const authed = (req) => {
    const m = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ""));
    if (!m) return false;
    const b = Buffer.from(m[1]);
    return b.length === tokenBuf.length && crypto.timingSafeEqual(b, tokenBuf);
  };
  const snap = () => monitor.snapshot(jobs.list("running"));

  const tick = setInterval(() => {
    if (!streams.size) return;
    const line = "data: " + JSON.stringify(snap()) + "\n\n";
    for (const r of streams) r.write(line);
  }, 1000);
  tick.unref();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (!LOOPBACK.test(String(req.headers.host || ""))) return fail(res, 403, "HOST_DENIED", "Chỉ nhận yêu cầu tới localhost");
    if (!authed(req)) { audit.log("unknown", "auth.fail", url.pathname, { method: req.method }, "denied"); return fail(res, 401, "UNAUTHORIZED", "Thiếu hoặc sai token"); }
    const deny = guard.checkWrite(req, { hasKey: false });
    if (deny) return fail(res, 403, "WRITE_DENIED", deny);
    const parts = url.pathname.split("/").filter(Boolean);

    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, version: VERSION, pid: process.pid, uptimeS: Math.round(process.uptime()) });
      if (req.method === "GET" && url.pathname === "/monitor") return send(res, 200, { ok: true, ...snap() });
      if (req.method === "GET" && url.pathname === "/monitor/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write("data: " + JSON.stringify(snap()) + "\n\n");
        streams.add(res); req.on("close", () => streams.delete(res));
        return;
      }
      if (req.method === "GET" && url.pathname === "/jobs") return send(res, 200, { ok: true, jobs: jobs.list(url.searchParams.get("status")) });
      if (req.method === "GET" && url.pathname === "/audit") return send(res, 200, { ok: true, audit: audit.recent(Number(url.searchParams.get("limit")) || 100) });
      if (req.method === "GET" && parts[0] === "jobs" && parts.length === 2) {
        const j = jobs.get(parts[1]);
        return j ? send(res, 200, { ok: true, job: j }) : fail(res, 404, "NOT_FOUND", "Không có việc " + parts[1]);
      }
      if (req.method === "GET" && parts[0] === "jobs" && parts[2] === "log" && parts.length === 3) {
        const l = jobs.readLog(parts[1], url.searchParams.get("from"));
        if (!l) return fail(res, 404, "NOT_FOUND", "Không có việc " + parts[1]);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Next-Offset": String(l.next), "X-Size": String(l.size) });
        return res.end(l.text);
      }
      if (req.method === "POST" && parts[0] === "jobs" && parts[2] === "kill" && parts.length === 3) {
        const r = await jobs.kill(parts[1], "ceo");
        if (r.code === "NOT_FOUND") return fail(res, 404, r.code, r.error);
        if (r.code === "NOT_RUNNING") return fail(res, 409, r.code, r.error);
        return r.killed ? send(res, 200, { ok: true, results: [r] }) : send(res, 500, { ok: false, code: "KILL_FAILED", error: r.error, results: [r] });
      }
      if (req.method === "POST" && url.pathname === "/kill-all") {
        const results = await jobs.killAll("ceo");
        const failed = results.filter((r) => !r.killed);
        return failed.length ? send(res, 500, { ok: false, code: "KILL_FAILED", error: failed.map((r) => r.error).join("; "), results }) : send(res, 200, { ok: true, results });
      }
      return fail(res, 404, "NOT_FOUND", "Không có route " + req.method + " " + url.pathname);
    } catch (e) {
      audit.log("ctl", "error", url.pathname, e.message);
      if (!res.headersSent) fail(res, 500, "INTERNAL", e.message);
    }
  });

  async function close() {
    clearInterval(tick);
    for (const r of streams) r.end();
    await jobs.killAll("ctl-shutdown");
    await new Promise((ok) => server.close(ok));
    db.close();
  }

  return { server, jobs, audit, token, close };
}

if (require.main === module) {
  const dir = home();
  const port = Number(process.env.CTL_PORT || 7790);
  const ctl = createCtl({ dir });
  const tokenFile = path.join(dir, "ctl-token");
  fs.writeFileSync(tokenFile + ".tmp", ctl.token, { mode: 0o600 });
  fs.renameSync(tokenFile + ".tmp", tokenFile);
  ctl.server.listen(port, "127.0.0.1", () => {
    ctl.audit.log("ctl", "start", null, { port, pid: process.pid });
    console.log(`\n  OS Controller (ctl) đang chạy tại http://127.0.0.1:${port}`);
    console.log(`  Token: ${tokenFile} (sinh mới mỗi lần khởi động)\n`);
  });
  // Tắt ctl thì dừng luôn mọi việc nó đã khởi chạy, không để tiến trình mồ côi.
  let closing = false;
  const stop = () => { if (closing) return; closing = true; ctl.close().finally(() => { try { fs.unlinkSync(tokenFile); } catch {} process.exit(0); }); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

module.exports = { createCtl };
