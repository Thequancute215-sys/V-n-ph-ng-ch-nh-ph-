// OS Controller (ctl): tiến trình riêng, chỉ nghe 127.0.0.1:7790 (Kiến trúc A, Vùng [3] agent.md).
// Xem/dừng việc đang chạy, giám sát CPU/RAM, workspace, đọc/ghi file trong workspace, lệnh theo danh sách cho phép
// (ngoài danh sách thì chờ CEO duyệt), chạy lượt AI theo NEXT_OWNER và duyệt chuyển lượt.
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
const { createWorkspaces } = require("./workspaces");
const { createFiles } = require("./files");
const { createRunner } = require("./runner");
const { createAutopilot } = require("./autopilot");
const { createGitHub } = require("./github");
const { createQuotas } = require("./quotas");
const { classify } = require("./policy");

const VERSION = "1.0.0";
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const HTTP_CODE = {
  BAD_REQUEST: 400, NOT_DIR: 400, NOT_FILE: 400, BAD_CONFIG: 400, NO_AGENT_MD: 422, BAD_AGENT_MD: 422, INVALID_HANDOFF: 422, NO_CLI: 422,
  WORKSPACE_DENIED: 403, PATH_ESCAPE: 403, PATH_DENIED: 403, TOO_BROAD: 403, TOO_SENSITIVE: 403, COMMAND_DENIED: 403,
  NOT_FOUND: 404, TOO_LARGE: 413,
  GITHUB_AUTH: 401, GITHUB_LIMIT: 429, GITHUB_OFFLINE: 502, GITHUB_CLONE: 502,
  CHANGED: 409, NOT_PENDING: 409, NOT_RUNNING: 409, NOT_YOUR_TURN: 409, AI_BUSY: 409, DECIDED: 409, TURN_CHANGED: 409, TOO_MANY: 409, HANDOFF_PENDING: 409, NEEDS_ANSWER: 409, NO_QUESTION: 422, BAD_OPTION: 400,
};

function createCtl({ dir = home(), token = crypto.randomBytes(32).toString("hex"), githubOptions = {}, quotaOptions = {} } = {}) {
  const db = open(dir);
  const audit = createAudit(db);
  const jobs = createJobs(db, audit, path.join(dir, "logs"));
  const ws = createWorkspaces(db, audit);
  const activeFile = path.join(dir, "active-workspace.json");
  try { ws.switchTo(JSON.parse(fs.readFileSync(activeFile, "utf8")).path, "ctl-restore"); } catch (e) { if (e.code !== "ENOENT") audit.log("ctl", "workspace.restore_skipped", null, e.message); }
  const files = createFiles(ws, audit);
  const runner = createRunner({ jobs, ws, audit, db, dir });
  const autopilot = createAutopilot({ runner, jobs, ws, audit, dir });
  const selectWorkspace = (p) => {
    const active = ws.switchTo(p, "ceo").path;
    fs.writeFileSync(activeFile + ".tmp", JSON.stringify({ path: active }), { mode: 0o600 }); fs.renameSync(activeFile + ".tmp", activeFile);
    return active;
  };
  const github = createGitHub({ ...githubOptions, ws, jobs, audit, select: selectWorkspace });
  const quotas = createQuotas({ ...quotaOptions, dir });
  const monitor = createMonitor();
  const tokenBuf = Buffer.from(token);
  const streams = new Set();
  let lastAuthFail = 0; // ghi tối đa 1 lần sai token mỗi giây, để không bị spam đầy ổ đĩa
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
  const wsOf = (v) => { const w = v || ws.current(); if (!w) throw Object.assign(new Error("Chưa đăng ký workspace nào"), { code: "WORKSPACE_DENIED" }); return w; };

  const tick = setInterval(() => {
    if (!streams.size) return;
    const line = "data: " + JSON.stringify(snap()) + "\n\n";
    for (const r of streams) r.write(line);
  }, 1000);
  tick.unref();

  // Bảng route: [method, mẫu đường dẫn, xử lý(params, query, body)] → trả object (200) hoặc [mã, object].
  const routes = [
    ["GET", "/health", () => ({ version: VERSION, pid: process.pid, uptimeS: Math.round(process.uptime()) })],
    ["GET", "/quotas", () => quotas.get()],
    ["POST", "/quotas/refresh", () => { quotas.refresh(); return [202, quotas.snapshot()]; }],
    ["GET", "/monitor", () => snap()],
    ["GET", "/audit", (p, qs) => ({ audit: audit.recent(Number(qs.get("limit")) || 100) })],

    ["GET", "/jobs", (p, qs) => ({ jobs: jobs.list(qs.get("status")) })],
    ["GET", "/jobs/:id", (p) => { const j = jobs.get(p.id); if (!j) throw Object.assign(new Error("Không có việc " + p.id), { code: "NOT_FOUND" }); return { job: j }; }],
    ["POST", "/jobs", (p, qs, b) => {
      const workspace = ws.find(wsOf(b.workspace)).path;
      const c = classify(b.argv);
      if (c.decision === "deny") { audit.log("ceo", "job.deny", workspace, { argv: b.argv, reason: c.reason }, "denied"); throw Object.assign(new Error(c.reason), { code: "COMMAND_DENIED" }); }
      const opts = { kind: "cmd", agent: "ceo", workspace, argv: b.argv, timeoutMs: b.timeoutMs || 10 * 60 * 1000 };
      return c.decision === "allow" ? [201, { job: jobs.start(opts), policy: c }] : [202, { job: jobs.propose(opts, c.reason), policy: c }];
    }],
    ["POST", "/jobs/:id/approve", (p) => ({ job: jobs.approve(p.id, "ceo") })],
    ["POST", "/jobs/:id/reject", (p) => ({ job: jobs.reject(p.id, "ceo") })],
    ["POST", "/jobs/:id/kill", async (p) => {
      autopilot.cancelJob(p.id);
      const r = await jobs.kill(p.id, "ceo");
      if (r.code) throw Object.assign(new Error(r.error), { code: r.code });
      return r.killed ? { results: [r] } : [500, { ok: false, code: "KILL_FAILED", error: r.error, results: [r] }];
    }],
    ["POST", "/kill-all", async () => {
      autopilot.cancelAll();
      const results = await jobs.killAll("ceo");
      const failed = results.filter((r) => !r.killed);
      return failed.length ? [500, { ok: false, code: "KILL_FAILED", error: failed.map((r) => r.error).join("; "), results }] : { results };
    }],

    ["GET", "/workspaces", () => ({ workspaces: ws.list(), active: ws.current() })],
    ["GET", "/github/repos", (p, qs) => github.list(qs.get("page") || 1)],
    ["POST", "/github/open", (p, qs, b) => [202, { operation: github.open(b.fullName) }]],
    ["GET", "/github/operations/:id", (p) => ({ operation: github.get(p.id) })],
    ["POST", "/workspaces", (p, qs, b) => [201, { workspace: ws.add(b.path, "ceo") }]],
    ["POST", "/workspaces/remove", (p, qs, b) => { ws.remove(b.path, "ceo"); return { workspaces: ws.list() }; }],
    ["POST", "/workspaces/switch", (p, qs, b) => {
      return { active: selectWorkspace(b.path) };
    }],

    ["GET", "/fs/list", (p, qs) => files.list(wsOf(qs.get("workspace")), qs.get("path") || ".")],
    ["GET", "/fs/read", (p, qs) => files.read(wsOf(qs.get("workspace")), qs.get("path"))],
    ["POST", "/fs/write", (p, qs, b) => files.write(wsOf(b.workspace), b.path, b.content, b.expectSha256, "ceo")],

    ["GET", "/ai/status", (p, qs) => runner.status(wsOf(qs.get("workspace")))],
    ["POST", "/ai/run", (p, qs, b) => {
      const workspace = ws.find(wsOf(b.workspace)).path;
      if (autopilot.busy(workspace)) throw Object.assign(new Error("Dự án đang có luồng tự động hoặc báo cáo chờ duyệt"), { code: "AI_BUSY" });
      return [201, { job: runner.run({ workspace, role: b.role, task: b.task }, "ceo") }];
    }],
    ["GET", "/autopilot", () => ({ runs: autopilot.list() })],
    ["GET", "/autopilot/:id", (p) => ({ run: autopilot.get(p.id) })],
    ["POST", "/autopilot", (p, qs, b) => [201, { run: autopilot.start({ workspace: wsOf(b.workspace), task: b.task, maxSteps: b.maxSteps, timeoutMs: b.timeoutMs }) }]],
    ["POST", "/autopilot/:id/stop", async (p) => ({ run: await autopilot.stop(p.id) })],
    ["POST", "/autopilot/:id/answer", (p, qs, b) => ({ run: autopilot.answer(p.id, b.option) })],
    ["POST", "/autopilot/:id/approve", (p) => ({ run: autopilot.decide(p.id, true) })],
    ["POST", "/autopilot/:id/reject", (p) => ({ run: autopilot.decide(p.id, false) })],
    ["GET", "/handoffs", () => ({ handoffs: runner.pending() })],
    ["GET", "/handoffs/:id", (p) => { const h = runner.get(p.id); if (!h) throw Object.assign(new Error("Chưa có bàn giao của " + p.id), { code: "NOT_FOUND" }); return { handoff: h }; }],
    ["POST", "/handoffs/:id/approve", (p) => ({ handoff: runner.approve(p.id, "ceo") })],
    ["POST", "/handoffs/:id/reject", (p) => ({ handoff: runner.reject(p.id, "ceo") })],
    // Trả lời câu hỏi của Claude khi chạy tay; trong luồng tự động thì dùng /autopilot/:id/answer để luồng chạy tiếp.
    ["POST", "/handoffs/:id/answer", (p, qs, b) => ({ handoff: runner.answer(p.id, b.option, "ceo") })],
  ];
  const match = (pattern, pathname) => {
    const a = pattern.split("/"), b = pathname.split("/");
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(":")) { if (!b[i]) return null; params[a[i].slice(1)] = decodeURIComponent(b[i]); }
      else if (a[i] !== b[i]) return null;
    }
    return params;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (!LOOPBACK.test(String(req.headers.host || ""))) return fail(res, 403, "HOST_DENIED", "Chỉ nhận yêu cầu tới localhost");
    if (!authed(req)) { if (Date.now() - lastAuthFail > 1000) { lastAuthFail = Date.now(); audit.log("unknown", "auth.fail", url.pathname, { method: req.method }, "denied"); } return fail(res, 401, "UNAUTHORIZED", "Thiếu hoặc sai token"); }
    const deny = guard.checkWrite(req, { hasKey: false });
    if (deny) return fail(res, 403, "WRITE_DENIED", deny);

    try {
      if (req.method === "GET" && url.pathname === "/monitor/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write("data: " + JSON.stringify(snap()) + "\n\n");
        streams.add(res); req.on("close", () => streams.delete(res));
        return;
      }
      const lm = /^\/jobs\/([^/]+)\/log$/.exec(url.pathname);
      if (req.method === "GET" && lm) {
        const l = jobs.readLog(decodeURIComponent(lm[1]), url.searchParams.get("from"));
        if (!l) return fail(res, 404, "NOT_FOUND", "Không có việc " + lm[1]);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Next-Offset": String(l.next), "X-Size": String(l.size) });
        return res.end(l.text);
      }
      for (const [method, pattern, fn] of routes) {
        if (method !== req.method) continue;
        const params = match(pattern, url.pathname);
        if (!params) continue;
        let body = {};
        if (method === "POST") { body = await guard.readJson(req, 3 * 1024 * 1024); if (!body) return fail(res, 400, "BAD_REQUEST", "Thân yêu cầu không phải JSON hợp lệ"); }
        const out = await fn(params, url.searchParams, body);
        const [code, obj] = Array.isArray(out) ? out : [200, out];
        return send(res, code, { ok: code < 400, ...obj });
      }
      return fail(res, 404, "NOT_FOUND", "Không có route " + req.method + " " + url.pathname);
    } catch (e) {
      const code = HTTP_CODE[e.code];
      if (!code) audit.log("ctl", "error", url.pathname, e.stack || e.message);
      if (!res.headersSent) fail(res, code || 500, e.code || "INTERNAL", e.message);
    }
  });

  async function close() {
    github.close();
    autopilot.close();
    await quotas.close();
    clearInterval(tick);
    for (const r of streams) r.end();
    await jobs.killAll("ctl-shutdown");
    await jobs.drain();
    await new Promise((ok) => server.close(ok));
    db.close();
  }

  return { server, jobs, ws, files, runner, autopilot, github, quotas, audit, token, close };
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
  process.on("SIGHUP", stop); // Windows: đóng cửa sổ terminal
  // Chạy dưới `npm run all`: Windows không gửi được SIGTERM thật, nên tiến trình cha báo tắt qua IPC; cha chết thì kênh đứt, cũng tắt.
  if (process.send) { process.on("message", (m) => { if (m === "stop") stop(); }); process.on("disconnect", stop); }
}

module.exports = { createCtl };
