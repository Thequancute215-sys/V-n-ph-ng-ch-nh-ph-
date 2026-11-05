// OS Controller (ctl): tiến trình riêng, chỉ nghe 127.0.0.1:7790 (Kiến trúc A, Vùng [3] agent.md).
// Xem/dừng việc đang chạy, giám sát CPU/RAM, workspace, đọc/ghi file trong workspace, lệnh theo danh sách cho phép
// (ngoài danh sách thì chờ CEO duyệt), chạy lượt AI theo NEXT_OWNER và duyệt chuyển lượt.
// Mọi yêu cầu cần "Authorization: Bearer <token>"; token sinh mới mỗi lần khởi động, nằm ở ~/.van-phong-ao/ctl-token (quyền 600),
// chỉ server.js trên cùng máy đọc để làm cầu nối, không bao giờ gửi xuống trình duyệt.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
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
const { createIdeas } = require("./ideas");
const { createPublisher } = require("./xuat-ban");
const { createChat } = require("./chat");
const { createNotifier } = require("./thongbao");
const { createScanner } = require("./ra-soat");
const { classify } = require("./policy");
const { readTurn } = require("./handoff");
const { maskSecrets } = require("../lib/mask");

const VERSION = "1.0.0";
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const HTTP_CODE = {
  BAD_REQUEST: 400, NOT_DIR: 400, NOT_FILE: 400, BAD_CONFIG: 400, NO_AGENT_MD: 422, BAD_AGENT_MD: 422, INVALID_HANDOFF: 422, NO_CLI: 422,
  WORKSPACE_DENIED: 403, PATH_ESCAPE: 403, PATH_DENIED: 403, TOO_BROAD: 403, TOO_SENSITIVE: 403, COMMAND_DENIED: 403,
  NOT_FOUND: 404, TOO_LARGE: 413,
  GITHUB_AUTH: 401, GITHUB_LIMIT: 429, GITHUB_OFFLINE: 502, GITHUB_CLONE: 502,
  CHANGED: 409, NOT_PENDING: 409, NOT_RUNNING: 409, NOT_WAITING: 409, NEEDS_SPEC_TURN: 409, NOT_YOUR_TURN: 409, AI_BUSY: 409, DECIDED: 409, TURN_CHANGED: 409, TOO_MANY: 409, HANDOFF_PENDING: 409, NEEDS_ANSWER: 409, NO_QUESTION: 422, BAD_OPTION: 400,
  CHAT_BUSY: 409, PUBLISH_BUSY: 409, NOT_READY: 409, NO_TARGET: 422, DIRTY_REPO: 409, NEEDS_SCAN_APPROVAL: 409, NO_COMMIT: 409, NO_QUOTA: 409, NO_GIT: 422, NO_REMOTE: 422, GIT_PUSH: 502,
};

function createCtl({ dir = home(), token = crypto.randomBytes(32).toString("hex"), githubOptions = {}, quotaOptions = {}, notify = false } = {}) {
  const db = open(dir);
  const audit = createAudit(db);
  const jobs = createJobs(db, audit, path.join(dir, "logs"));
  const ws = createWorkspaces(db, audit);
  const activeFile = path.join(dir, "active-workspace.json");
  try { ws.switchTo(JSON.parse(fs.readFileSync(activeFile, "utf8")).path, "ctl-restore"); } catch (e) { if (e.code !== "ENOENT") audit.log("ctl", "workspace.restore_skipped", null, e.message); }
  const files = createFiles(ws, audit);
  // Thông báo Windows chỉ bật khi chạy thật (main), test thì chỉ ghi nhật ký kiểm toán.
  const notifier = createNotifier({ enabled: notify && process.platform === "win32" && process.env.VP_NO_TOAST !== "1", audit });
  const scanner = createScanner({ dir, audit, notify: notifier });   // rà file .md trước khi cho AI chạy toàn quyền
  const runner = createRunner({ jobs, ws, audit, db, dir, scanner });
  const autopilot = createAutopilot({ runner, jobs, ws, audit, dir, quotaSnapshot: () => quotas.snapshot(), notify: notifier, scanner });
  const ideas = createIdeas({ dir, ws, runner, autopilot, audit });
  const publisher = createPublisher({ jobs, ws, audit, dir, notify: notifier });
  const chat = createChat({ jobs, ws, runner, audit, dir });
  const selectWorkspace = (p) => {
    const w = ws.switchTo(p, "ceo");
    fs.writeFileSync(activeFile + ".tmp", JSON.stringify({ path: w.path }), { mode: 0o600 }); fs.renameSync(activeFile + ".tmp", activeFile);
    lastSelect = w;
    protectPublic(w.path);
    return w.path;
  };
  let lastSelect = null;
  // Repo GitHub công khai: agent.md chưa từng commit thì đưa vào .git/info/exclude (chạy nền, lỗi mạng thì bỏ qua và thử lại ở lần đọc sau).
  const background = new Set();   // việc chạy nền (git, GitHub) phải xong trước khi ctl tắt
  const protectPublic = (root) => {
    const job = github.visibility(root).then((v) => {
      if (v.kind !== "public") return;
      const o = ws.overview(root);
      if (o.repo && !o.repo.agentMdTracked) ws.excludeAgentMd(root);
    }).catch(() => {}).finally(() => background.delete(job));
    background.add(job);
  };
  // Repo mới tải về VP_PROJECTS_DIR (CEO đặt D:\Projects 04/11/2026 vì ổ C: đầy); bản sao cũ ở ~/Projects vẫn được tìm thấy.
  const defaultProjects = path.join(os.homedir(), "Projects"), projectsDir = githubOptions.projectsDir || process.env.VP_PROJECTS_DIR || defaultProjects;
  const github = createGitHub({ alsoLook: githubOptions.projectsDir || projectsDir === defaultProjects ? [] : [defaultProjects], ...githubOptions, projectsDir, ws, jobs, audit, select: selectWorkspace });
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

  // Truy vấn riêng: không bị giới hạn lịch sử chung của jobs.list().
  const projectPath = process.platform === "win32" ? "workspace COLLATE NOCASE = ?" : "workspace = ?";
  const projectCols = "id, agent, kind, status, started_at, ended_at, argv";
  const projectJobs = {
    running: db.prepare(`SELECT ${projectCols} FROM jobs WHERE ${projectPath} AND status = 'running' ORDER BY started_at DESC`),
    recent: db.prepare(`SELECT ${projectCols} FROM jobs WHERE ${projectPath} AND status NOT IN ('running', 'pending_approval') ORDER BY ended_at DESC, id DESC LIMIT 10`),
    counts: db.prepare(`SELECT status, COUNT(*) AS n FROM jobs WHERE ${projectPath} GROUP BY status`),
  };
  const safe = (v) => typeof v === "string" ? maskSecrets(v) : Array.isArray(v) ? v.map(safe) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [maskSecrets(k), safe(x)])) : v;
  const jobSummary = (j) => {
    const argv = JSON.parse(j.argv);
    const label = j.kind === "ai" ? j.agent : argv.slice(0, 3).map((s) => maskSecrets(s).replace(/\\/g, "/").split("/").pop()).join(" ");
    return { id: j.id, agent: j.agent, kind: j.kind, status: j.status, startedAt: j.started_at, endedAt: j.ended_at,
      durationS: j.started_at === null ? null : Math.max(0, Math.round(((j.ended_at ?? Date.now()) - j.started_at) / 1000)), label: maskSecrets(label).slice(0, 120) };
  };
  function projects() {
    const runs = autopilot.list();
    ws.current();
    return ws.list().map((w) => {
      let turn = null, auditStatus = null, openBlockers = null, handoffPending = null, problem = null;
      try { turn = readTurn(w.path); } catch (e) { problem = e.message; }
      try {
        const txt = fs.readFileSync(path.join(w.path, "agent.md"), "utf8");
        auditStatus = (/^- AUDIT_STATUS:[ \t]*(.*)$/m.exec(txt) || [])[1]?.trim() || null;
        const section = (txt.split(/^## \[5\][^\n]*\n/m)[1] || "").split(/^##\s/m)[0];
        openBlockers = section.split(/\r?\n/).filter((l) => /^\s*-\s*\[ \]\s+OPEN\b/.test(l)).length;
      } catch (e) { problem ||= e.message; }
      try { handoffPending = runner.status(w.path).handoffPending; } catch (e) { problem ||= e.message; }
      const same = (p) => typeof p === "string" && (process.platform === "win32" ? p.toLowerCase() === w.path.toLowerCase() : p === w.path);
      return safe({ name: w.name, path: w.path, active: w.active, turn, auditStatus, openBlockers, handoffPending, problem,
        running: projectJobs.running.all(w.path).map(jobSummary), recent: projectJobs.recent.all(w.path).map(jobSummary),
        counts: Object.fromEntries(projectJobs.counts.all(w.path).map((r) => [r.status, r.n])),
        runs: runs.filter((r) => same(r.workspace)).map((r) => ({ id: r.id, task: maskSecrets(r.task).slice(0, 200), status: r.status,
          steps: r.steps.length, roles: r.steps.map((s) => s.role).join(" → "), updatedAt: r.updatedAt })),
      });
    });
  }

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
    ["GET", "/projects", () => ({ projects: projects() })],
    // Ý tưởng của CEO: bước 1 chu trình, giao Hinata (SPEC_ARCHITECT) đặc tả
    ["GET", "/ideas", (p, qs) => ({ ideas: ideas.list(wsOf(qs.get("workspace"))) })],
    ["POST", "/ideas", (p, qs, b) => [201, { idea: ideas.add({ workspace: wsOf(b.workspace), title: b.title, detail: b.detail }) }]],
    ["POST", "/ideas/:id/start", (p, qs, b) => ({ idea: ideas.start(p.id, { force: b.force === true }) })],
    // Rà file .md trước khi cho AI chạy toàn quyền; CEO duyệt điểm bất thường thì luồng đang tạm dừng chạy tiếp.
    ["GET", "/publish", (p, qs) => ({ publish: publisher.status(wsOf(qs.get("workspace"))) })],
    ["POST", "/publish/target", (p, qs, b) => ({ publish: publisher.setTarget(wsOf(b.workspace), b.image) })],
    ["POST", "/publish/prepare", (p, qs, b) => [202, { run: publisher.prepare(wsOf(b.workspace)) }]],
    ["POST", "/publish/:id/push", (p, qs, b) => [202, { run: publisher.push(p.id, b.tag) }]],
    ["GET", "/chat", (p, qs) => ({ chat: chat.get(wsOf(qs.get("workspace")), String(qs.get("who") || "")) })],
    ["POST", "/chat", (p, qs, b) => [202, { chat: chat.send({ workspace: wsOf(b.workspace), who: String(b.who || ""), text: b.text }) }]],
    ["POST", "/chat/clear", (p, qs, b) => ({ chat: chat.clear(wsOf(b.workspace), String(b.who || "")) })],
    ["GET", "/scan", (p, qs) => { const root = ws.find(wsOf(qs.get("workspace"))).path; return { scan: scanner.status(root, { fresh: qs.get("fresh") === "1" }), fullAccess: runner.fullOn() }; }],
    ["POST", "/scan/approve", (p, qs, b) => { const root = ws.find(wsOf(b.workspace)).path; const scan = scanner.approve(root, String(b.fingerprint || "")); return { scan, resumed: autopilot.resumeScan(root) }; }],
    ["GET", "/github/repos", (p, qs) => github.list(qs.get("page") || 1)],
    ["POST", "/github/open", (p, qs, b) => [202, { operation: github.open(b.fullName) }]],
    ["GET", "/github/operations/:id", (p) => ({ operation: github.get(p.id) })],
    ["POST", "/workspaces", (p, qs, b) => { const w = ws.add(b.path, "ceo"); protectPublic(w.path); return [201, { workspace: w }]; }],
    // Đọc thật repo đang chọn (git, công nghệ, README, agent.md) và repo công khai hay riêng tư.
    ["GET", "/workspaces/overview", async (p, qs) => {
      const root = ws.find(wsOf(qs.get("workspace"))).path;
      const visibility = await github.visibility(root);
      if (visibility.kind === "public" && fs.existsSync(path.join(root, "agent.md"))) {
        const first = ws.overview(root);
        if (first.repo && !first.repo.agentMdTracked) ws.excludeAgentMd(root);
      }
      return { overview: { ...ws.overview(root), visibility } };
    }],
    ["POST", "/workspaces/remove", (p, qs, b) => { ws.remove(b.path, "ceo"); return { workspaces: ws.list() }; }],
    ["POST", "/workspaces/switch", (p, qs, b) => {
      const active = selectWorkspace(b.path);
      return { active, agentMd: lastSelect && lastSelect.agentMd };
    }],

    ["GET", "/fs/list", (p, qs) => files.list(wsOf(qs.get("workspace")), qs.get("path") || ".")],
    ["GET", "/fs/read", (p, qs) => files.read(wsOf(qs.get("workspace")), qs.get("path"))],
    ["POST", "/fs/write", (p, qs, b) => files.write(wsOf(b.workspace), b.path, b.content, b.expectSha256, "ceo")],

    ["GET", "/ai/status", (p, qs) => runner.status(wsOf(qs.get("workspace")))],
    ["POST", "/ai/run", (p, qs, b) => {
      const workspace = ws.find(wsOf(b.workspace)).path;
      if (autopilot.busy(workspace)) throw Object.assign(new Error("Dự án đang có luồng tự động hoặc báo cáo chờ duyệt"), { code: "AI_BUSY" });
      return [201, { job: runner.run({ workspace, role: b.role, task: b.task, effort: b.effort || null }, "ceo") }];
    }],
    ["GET", "/autopilot", () => ({ runs: autopilot.list().map(autopilot.view) })],
    ["GET", "/autopilot/:id", (p) => ({ run: autopilot.view(autopilot.get(p.id)) })],
    ["POST", "/autopilot", (p, qs, b) => [201, { run: autopilot.view(autopilot.start({ workspace: wsOf(b.workspace), task: b.task, maxSteps: b.maxSteps, timeoutMs: b.timeoutMs })) }]],
    ["POST", "/autopilot/:id/stop", async (p) => ({ run: autopilot.view(await autopilot.stop(p.id)) })],
    ["POST", "/autopilot/:id/answer", (p, qs, b) => ({ run: autopilot.view(autopilot.answer(p.id, b.option)) })],
    ["POST", "/autopilot/:id/resume", (p) => ({ run: autopilot.view(autopilot.resumeNow(p.id)) })],
    ["POST", "/autopilot/:id/web-prompt", (p) => [202, { run: autopilot.view(autopilot.webPrompt(p.id)) }]],
    // CEO dán kết quả ChatGPT web cho lượt đang chờ hạn mức; AI còn hạn mức kiểm rồi áp vào repo.
    ["POST", "/autopilot/:id/web-result", (p, qs, b) => [202, { run: autopilot.view(autopilot.applyWeb(p.id, b.text)) }]],
    // Nhánh riêng của luồng: diff từng lượt, và đẩy nhánh lên GitHub để mở PR (chỉ khi CEO bấm).
    ["GET", "/autopilot/:id/steps/:n/diff", (p) => ({ diff: autopilot.stepDiff(p.id, p.n) })],
    ["POST", "/autopilot/:id/push", (p) => ({ run: autopilot.view(autopilot.pushBranch(p.id)) })],
    ["POST", "/autopilot/:id/approve", (p) => ({ run: autopilot.view(autopilot.decide(p.id, true)) })],
    ["POST", "/autopilot/:id/reject", (p) => ({ run: autopilot.view(autopilot.decide(p.id, false)) })],
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
    await Promise.allSettled([...background]);
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

  return { server, jobs, ws, files, runner, autopilot, scanner, publisher, chat, github, quotas, audit, token, close };
}

if (require.main === module) {
  const dir = home();
  const port = Number(process.env.CTL_PORT || 7790);
  const ctl = createCtl({ dir, notify: true });
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
