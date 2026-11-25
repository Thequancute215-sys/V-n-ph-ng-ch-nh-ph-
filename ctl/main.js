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
const { createConnectors } = require("./ket-noi");
const { createXuongPhim } = require("./xuong-phim");
const { createMayQuay } = require("./may-quay");
const { createTramFlow } = require("./tram-flow");
const { createBanDung } = require("./ban-dung");
const { createLuongPhim } = require("./luong-phim");
const libPhim = require("../lib/phim");
const { createJournal } = require("./nhat-ky");
const { createChat } = require("./chat");
const { createBoNao } = require("./bo-nao");
const { createLichChay } = require("./lich-chay");
const { ROLES_LAM_VIEC } = require("./quyen");
const { createNotifier } = require("./thongbao");
const { createScanner } = require("./ra-soat");
const { createUpdater } = require("./cap-nhat");
const { createBoKiem } = require("./bo-kiem");
const { createDuAnMoi } = require("./du-an-moi");
const { createAgyTaiKhoan } = require("./agy-tai-khoan");
const { createCodexTaiKhoan } = require("./codex-tai-khoan");
const { createSkillDuyet } = require("./skill-duyet");
const { kindOf } = require("./dieu-phoi");
const { classify } = require("./policy");
const { readTurn } = require("./handoff");
const { maskSecrets } = require("../lib/mask");
const { writeAtomic } = require("../lib/ghi-file");

const VERSION = require("../package.json").version;   // bộ cập nhật (scripts/cap-nhat.js) kiểm số này sau khi lên bản mới
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const HTTP_CODE = {
  BAD_REQUEST: 400, NOT_DIR: 400, NOT_FILE: 400, BAD_CONFIG: 400, NO_AGENT_MD: 422, BAD_AGENT_MD: 422, INVALID_HANDOFF: 422, NO_CLI: 422,
  WORKSPACE_DENIED: 403, PATH_ESCAPE: 403, PATH_DENIED: 403, TOO_BROAD: 403, TOO_SENSITIVE: 403, COMMAND_DENIED: 403,
  NOT_FOUND: 404, CONFLICT: 409, TOO_LARGE: 413, SECRET: 422,
  GITHUB_AUTH: 401, GITHUB_LIMIT: 429, GITHUB_OFFLINE: 502, GITHUB_CLONE: 502,
  CHANGED: 409, NOT_PENDING: 409, NOT_RUNNING: 409, NOT_WAITING: 409, NEEDS_SPEC_TURN: 409, NOT_YOUR_TURN: 409, AI_BUSY: 409, DECIDED: 409, TURN_CHANGED: 409, TOO_MANY: 409, HANDOFF_PENDING: 409, NEEDS_ANSWER: 409, NO_QUESTION: 422, BAD_OPTION: 400,
  CHAT_BUSY: 409, PUBLISH_BUSY: 409, NOT_READY: 409, NO_RELEASE_WORKFLOW: 422, NOT_ON_MAIN: 409, TAG_EXISTS: 409, DIRTY_REPO: 409, NEEDS_SCAN_APPROVAL: 409, NO_COMMIT: 409, NO_QUOTA: 409, NO_GIT: 422, NO_REMOTE: 422, GIT_PUSH: 502,
  UPDATE_BUSY: 409, NOT_APP: 409, UPDATE_FAILED: 500, GIT_BRANCH: 409, HANDOFF_IN_RUN: 409, DANG_CHAY: 409, MAY_ANH_LOI: 502,
  AGY_BUSY: 409, XUONG_BUSY: 409, CAI_LOI: 500, NO_KEY: 409, MAY_QUAY_BAN: 409, CAN_DOI_SOAT_CHI: 409, VUOT_NGAN_SACH: 409, TOI_DA_TAKE: 409, PHIM_LOI: 422, MAY_QUAY_LOI: 502, BAD_URL: 400, AGY_UNSAVED: 409, SKILL_BUSY: 409, SKILL_DA_CO: 409, BAD_CATALOG: 422, SONG_SONG: 409, AGY_CRED: 502, NO_LOGIN: 409, NOT_SUPPORTED: 501,
  CHUA_DUNG_DUOC: 422, DANG_DUNG: 409, THIEU_FFMPEG: 409, THIEU_THU_MUC: 409, DUNG_LOI: 500, CHUA_DU_DIEU_KIEN: 409,
};

function createCtl({ duAnOptions = {}, dir = home(), token = crypto.randomBytes(32).toString("hex"), githubOptions = {}, quotaOptions = {}, updaterOptions = {}, agyOptions = {}, autopilotOptions = {}, notify = false } = {}) {
  const db = open(dir);
  const audit = createAudit(db);
  // Nhiều tài khoản GPT cho Codex (ctl/codex-tai-khoan.js): mỗi tiến trình Codex mở ra nhận CODEX_HOME của tài khoản đang chọn.
  let runnerRef = null, quotasRef = null;
  const codexTk = createCodexTaiKhoan({ dir, audit, cli: () => (runnerRef ? runnerRef.cliOf("codex") : ["codex"]), khiDangNhapXong: () => { if (quotasRef) quotasRef.docGpt(true).catch(() => {}); } });
  // Xưởng phim (ctl/xuong-phim.js): mọi tiến trình nhận XUONG_PHIM_* (Python chung, script giọng đọc, FFmpeg) — chỉ đường dẫn, không khóa.
  const xuongPhim = createXuongPhim({ dir, audit });
  const jobs = createJobs(db, audit, path.join(dir, "logs"), { envFor: (j) => { let xp = {}; try { xp = xuongPhim.envAi(); } catch {} try { return { ...xp, ...(kindOf(JSON.parse(j.argv)) === "codex" ? codexTk.env() : {}) }; } catch { return xp; } } });
  const ws = createWorkspaces(db, audit);
  const activeFile = path.join(dir, "active-workspace.json");
  try { ws.switchTo(JSON.parse(fs.readFileSync(activeFile, "utf8")).path, "ctl-restore"); } catch (e) { if (e.code !== "ENOENT") audit.log("ctl", "workspace.restore_skipped", null, e.message); }
  const files = createFiles(ws, audit);
  // Thông báo Windows chỉ bật khi chạy thật (main), test thì chỉ ghi nhật ký kiểm toán.
  const notifier = createNotifier({ enabled: notify && process.platform === "win32" && process.env.VP_NO_TOAST !== "1", audit });
  const scanner = createScanner({ dir, audit, notify: notifier });   // rà file .md trước khi cho AI chạy toàn quyền
  // Hai tài khoản Antigravity (family + Pro): cất đăng nhập từng tài khoản, tự chuyển khi cạn (ctl/agy-tai-khoan.js).
  const agyTk = createAgyTaiKhoan({ dir, audit, agyJobs: () => jobs.list("running").filter((j) => kindOf(j.argv) === "agy").length, ...agyOptions });
  // connectors khai báo bên dưới: chỉ gọi khi chạy lượt, lúc đó đã có.
  const runner = createRunner({ jobs, ws, audit, db, dir, scanner, mcpKnown: () => connectors.known(), quotaSnapshot: () => quotas.snapshot(), agyTk, codexTk });
  runnerRef = runner;
  const autopilot = createAutopilot({ runner, jobs, ws, audit, dir, quotaSnapshot: () => quotas.snapshot(), notify: notifier, scanner, codexTk, ...autopilotOptions });
  const ideas = createIdeas({ dir, ws, runner, autopilot, audit });
  const publisher = createPublisher({ jobs, ws, audit, dir, notify: notifier, github: () => github });
  const chat = createChat({ jobs, ws, runner, audit, dir });
  const skillDuyet = createSkillDuyet({ dir, jobs, runner, audit });   // CEO dán link repo skill → Claude đội trưởng xem → CEO duyệt cài
  const connectors = createConnectors({ runner, audit, dir });   // trang Kết nối (MCP) của đội
  // Xưởng phim P2: máy quay API (Gemini) và trạm Google Flow. Chỉ CEO bấm trên trang Xưởng phim; AI không gọi được.
  const mayQuay = createMayQuay({ dir, audit, duyetTuDong: (root, phim) => banDung.coDuyetQuay(root, phim), codexAnh: {
    argv: () => runner.cliOf("codex"),
    env: () => codexTk.env(),
    quota: () => codexTk.trangThai().ds.find((a) => a.dangDung)?.conLai ?? null,
  } });
  const tramFlow = createTramFlow({ dir, goc: () => xuongPhim.duongDan.goc, audit, jobs, cliClaude: () => runner.cliOf("claude") });
  // Xưởng phim P3: bàn dựng (FFmpeg trên máy, miễn phí) và 4 cổng CEO duyệt. Thư mục tạm ở thư mục gốc của xưởng (ổ có chỗ).
  const banDung = createBanDung({ dir, audit, ffmpeg: () => xuongPhim.envAi().XUONG_PHIM_FFMPEG || null, tam: () => path.join(xuongPhim.duongDan.goc, "tmp") });
  const luongPhim = createLuongPhim({ dir, audit, mayQuay, banDung, xuongPhim,
    chayAi: ({ root, vai, prompt, chiDoc }) => runner.chayPhim({ workspace: root, role: vai, prompt, chiDoc }),
    docQuota: () => quotas.snapshot(),
  });
  const phimRoot = (v) => ws.find(v).path;
  const docHoSo = (root) => { const doc = (f, mac) => { try { return JSON.parse(fs.readFileSync(path.join(root, f), "utf8").replace(/^\uFEFF/, "")); } catch { return mac; } };
    const phim = doc("phim.json", null); if (!phim) throw Object.assign(new Error("Dự án không có phim.json"), { code: "NOT_FOUND" });
    return { phim, kiem: libPhim.kiem(phim, { giong: doc("media/giong/voice.json", null) }) }; };
  const phimLuongRoot = (v) => { const root = phimRoot(v); docHoSo(root); return root; };
  const journal = createJournal({ jobs, autopilot });           // Nhật ký: ai làm gì, lúc nào
  const boKiem = createBoKiem({ dir, audit });   // cài bộ kiểm chu trình (CI) vào repo dự án
  const updater = createUpdater({ root: path.join(__dirname, ".."), audit, jobs, autopilot, ...updaterOptions });   // nút Cập nhật app
  const selectWorkspace = (p) => {
    const w = ws.switchTo(p, "ceo");
    writeAtomic(activeFile, JSON.stringify({ path: w.path }));
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
  // Tạo dự án mới: gợi ý tên repo, CEO duyệt rồi mới tạo repo + tải về + agent.md + bộ kiểm + giao Hinata (ctl/du-an-moi.js).
  const duAnMoi = createDuAnMoi({ github, ideas, boKiem, audit, dir, ...duAnOptions });
  const quotas = createQuotas({ ...quotaOptions, dir, agyTk, codexTk });
  quotasRef = quotas;
  const quyenView = () => { const s = runner.quyen.doc(); return { ...s, roles: ROLES_LAM_VIEC, muc: Object.fromEntries(ROLES_LAM_VIEC.map((r) => [r, runner.quyen.mucCua(r, s)])) }; };
  const boNao = createBoNao({ dir, audit });
  const lichChay = createLichChay({ dir, audit, autopilot, chat, quota: quotas.snapshot, ws, workspaceBusy: jobs.aiBusy });
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

    ["GET", "/jobs", (p, qs) => {
      const rows = jobs.list(qs.get("status"));
      const limit = Number(qs.get("limit"));
      return { jobs: Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows };
    }],
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
      void Promise.allSettled(ws.list().map(async (w) => luongPhim.dung(w.path)));
      void mayQuay.dungHet();
      const results = await jobs.killAll("ceo");
      const failed = results.filter((r) => !r.killed);
      return failed.length ? [500, { ok: false, code: "KILL_FAILED", error: failed.map((r) => r.error).join("; "), results }] : { results };
    }],

    ["GET", "/workspaces", () => ({ workspaces: ws.list(), active: ws.current() })],
    ["GET", "/projects", () => ({ projects: projects() })],
    // Ý tưởng của CEO: bước 1 chu trình, giao Hinata (SPEC_ARCHITECT) đặc tả
    ["GET", "/ideas", (p, qs) => ({ ideas: ideas.list(wsOf(qs.get("workspace"))) })],
    ["POST", "/du-an-moi/goi-y", async (p, qs, b) => ({ duAnMoi: await duAnMoi.goiY(b.yTuong) })],
    ["POST", "/du-an-moi", (p, qs, b) => [202, { duAnMoi: duAnMoi.tao({ ten: b.ten, moTa: b.moTa, yTuong: b.yTuong, loai: b.loai || "phan-mem", rieng: true /* luôn riêng tư: công khai chỉ khi CEO tự đổi trên GitHub */, caiBoKiem: b.caiBoKiem !== false, giaoHinata: b.giaoHinata !== false }) }]],
    ["GET", "/du-an-moi/:id", (p) => ({ duAnMoi: duAnMoi.get(p.id) })],
    ["POST", "/ideas", (p, qs, b) => [201, { idea: ideas.add({ workspace: wsOf(b.workspace), title: b.title, detail: b.detail }) }]],
    ["POST", "/ideas/:id/start", (p, qs, b) => ({ idea: ideas.start(p.id, { force: b.force === true }) })],
    // Rà file .md trước khi cho AI chạy toàn quyền; CEO duyệt điểm bất thường thì luồng đang tạm dừng chạy tiếp.
    ["GET", "/ket-noi", async (p, qs) => ({ ketNoi: await connectors.status({ fresh: qs.get("fresh") === "1" }) })],
    ["POST", "/ket-noi/add", async (p, qs, b) => ({ ketNoi: await connectors.add(String(b.id || ""), String(b.ai || "")) })],
    ["POST", "/ket-noi/login", async (p, qs, b) => ({ ketNoi: await connectors.login(String(b.id || "")) })],
  ["POST", "/ket-noi/phong", async (p, qs, b) => ({ ketNoi: await connectors.setPhong(String(b.room || ""), b.ids) })],
    // Cài MCP chạy trên máy (Chrome DevTools) đúng phiên bản đã ghim; tải từ npm nên chỉ khi CEO bấm.
    ["POST", "/ket-noi/cai-may", async (p, qs, b) => ({ ketNoi: await connectors.caiMay(String(b.id || "")) })],
    // Xưởng phim P0: kiểm FFmpeg, Python chung, giọng đọc; cài chạy nền khi CEO bấm (trang Kết nối hỏi lại tới khi xong).
    // Xưởng phim P2: hồ sơ, ước tính, quay (chạy nền), phần của CEO, trạm Flow.
    ["GET", "/phim/du-an", () => ({ duAn: ws.list().filter((w) => fs.existsSync(path.join(w.path, "phim.json"))).map((w) => ({ path: w.path, ten: path.basename(w.path) })) })],
    ["GET", "/phim", (p, qs) => { const root = phimRoot(qs.get("workspace")); return { ...docHoSo(root), mayQuay: mayQuay.trangThai(root), banDung: banDung.trangThai(root), luong: luongPhim.trangThai(root) }; }],
    ["GET", "/phim/luong", (p, qs) => ({ luong: luongPhim.trangThai(phimLuongRoot(qs.get("workspace"))) })],
    ["POST", "/phim/luong", (p, qs, b) => [202, { luong: luongPhim.batDau(phimLuongRoot(b.workspace), { deBai: b.deBai, tuyChon: b.tuyChon }) }]],
    ["POST", "/phim/luong/dung", (p, qs, b) => {
      const root = phimLuongRoot(b.workspace);
      luongPhim.dung(root).catch((e) => audit.log("ctl", "phim.luong.dung_loi", path.basename(root), maskSecrets(e.message)));
      return [202, { luong: luongPhim.trangThai(root) }];
    }],
    ["POST", "/phim/uoc-tinh", (p, qs, b) => ({ uocTinh: mayQuay.uocTinh(phimRoot(b.workspace), { canh: b.canh, loai: b.loai, soPhuongAn: b.soPhuongAn, doPhanGiai: b.doPhanGiai }) })],
    ["POST", "/phim/quay", (p, qs, b) => [202, { mayQuay: mayQuay.batDauQuay(phimRoot(b.workspace), { canh: b.canh, loai: b.loai, soPhuongAn: b.soPhuongAn, doPhanGiai: b.doPhanGiai }) }]],
    ["POST", "/phim/ceo", (p, qs, b) => ({ phim: mayQuay.suaCeo(phimRoot(b.workspace), { canh: b.canh, khungChon: b.khungChon, takeChon: b.takeChon, nguoiThat: b.nguoiThat, nganSach: b.nganSach }) })],
    ["POST", "/phim/dung", (p, qs, b) => [202, { banDung: banDung.batDauDung(phimRoot(b.workspace)) }]],
    ["POST", "/phim/cong", (p, qs, b) => ({ cong: banDung.duyetCong(phimRoot(b.workspace), { cong: b.cong, duyet: b.duyet }) })],
    ["POST", "/phim/quay-lai", (p, qs, b) => banDung.quayLai(phimRoot(b.workspace), { canh: b.canh })],
    ["GET", "/flow", async () => ({ flow: await tramFlow.trangThai() })],
    ["POST", "/flow/:id/mo", async (p) => ({ flow: await tramFlow.mo(p.id) })],
    ["POST", "/flow/nhip", async (p, qs, b) => [202, { flow: await tramFlow.nhip(phimRoot(b.workspace), { canh: b.canh, taiKhoan: b.taiKhoan, buoc: b.buoc }) }]],
    ["GET", "/xuong-phim", async (p, qs) => ({ xuongPhim: await xuongPhim.kiem({ fresh: qs.get("fresh") === "1" }) })],
    ["POST", "/xuong-phim/cai", () => [202, { xuongPhim: xuongPhim.batDauCai() }]],
    ["GET", "/dieu-phoi", () => ({ dieuPhoi: runner.dieuPhoi.status() })],
    ["GET", "/agy-tai-khoan", () => ({ taiKhoan: agyTk.trangThai() })],
    // Cất xong thì đọc luôn danh sách model của tài khoản vừa cất (mỗi tài khoản thấy model khác nhau).
    ["POST", "/agy-tai-khoan/cat", (p, qs, b) => { const taiKhoan = agyTk.cat(b.nhan); quotas.models(true).catch(() => {}); return { taiKhoan }; }],
    ["POST", "/agy-tai-khoan/sua", (p, qs, b) => ({ taiKhoan: agyTk.sua(b || {}) })],
    ["POST", "/agy-tai-khoan/doc-nghi", () => { quotas.docNghi(true); return [202, { taiKhoan: agyTk.trangThai() }]; }],
    ["POST", "/agy-tai-khoan/:id/chuyen", (p) => { agyTk.chuyen(p.id); quotas.refresh(true); return { taiKhoan: agyTk.trangThai() }; }],
    ["POST", "/agy-tai-khoan/:id/xoa", (p) => ({ taiKhoan: agyTk.xoa(p.id) })],
    // Tài khoản GPT cho Codex: thêm (CEO tự đăng nhập), đổi tay, tự chuyển khi cạn, đọc hạn mức mọi tài khoản.
    ["GET", "/codex-tai-khoan", () => ({ taiKhoan: codexTk.trangThai() })],
    ["POST", "/codex-tai-khoan/them", (p, qs, b) => ({ taiKhoan: codexTk.them(b.nhan) })],
    ["POST", "/codex-tai-khoan/sua", (p, qs, b) => ({ taiKhoan: codexTk.sua(b || {}) })],
    ["POST", "/codex-tai-khoan/doc", async () => { await quotas.docGpt(true); return { taiKhoan: codexTk.trangThai() }; }],
    ["POST", "/codex-tai-khoan/:id/dang-nhap", (p) => ({ taiKhoan: codexTk.moDangNhap(p.id) })],
    ["POST", "/codex-tai-khoan/:id/chuyen", (p) => { codexTk.chuyen(p.id); quotas.refresh(true); return { taiKhoan: codexTk.trangThai() }; }],
    ["POST", "/codex-tai-khoan/:id/bo", (p) => ({ taiKhoan: codexTk.bo(p.id) })],
    ["GET", "/dieu-phoi/models", async (p, qs) => ({ models: await quotas.models(qs.get("lai") === "1") })],
    // Bộ skill: thiếu/cũ theo từng AI (chỉ đọc máy, không tải mạng), danh mục (mặc định + CEO duyệt thêm) và các đề xuất.
    ["GET", "/skill", () => { const t = skillDuyet.trangThai(); return { skill: t.kiem, danhMuc: t.danhMuc, deXuat: t.deXuat }; }],
    // CEO dán link repo GitHub: tải đúng một commit vào thư mục cách ly, máy rà, rồi Claude đội trưởng đọc chỉ-đọc và giải thích.
    ["POST", "/skill/de-xuat", async (p, qs, b) => [202, { deXuat: await skillDuyet.deXuat(b.link) }]],
    ["POST", "/skill/de-xuat/:id/duyet", async (p, qs, b) => ({ deXuat: await skillDuyet.duyet(p.id, { nhom: b.nhom, dungCho: b.dungCho, phong: b.phong, chapNhanRepoKhac: b.chapNhanRepoKhac === true }) })],
    ["POST", "/skill/de-xuat/:id/tham-khao", (p) => ({ deXuat: skillDuyet.thamKhao(p.id) })],
    ["POST", "/skill/de-xuat/:id/tu-choi", (p) => ({ deXuat: skillDuyet.tuChoi(p.id) })],
    ["POST", "/skill/de-xuat/:id/phan-tich-lai", (p) => [202, { deXuat: skillDuyet.phanTichLai(p.id) }]],
    ["POST", "/dieu-phoi", (p, qs, b) => ({ dieuPhoi: runner.dieuPhoi.save(b) })],
    ["GET", "/cap-nhat", async (p, qs) => ({ capNhat: qs.get("fetch") === "1" ? await updater.refresh() : updater.status() })],
    ["POST", "/cap-nhat", (p, qs, b) => [202, { capNhat: updater.start(String(b.name || "")) }]],
    ["GET", "/nhat-ky", (p, qs) => ({ nhatKy: journal.list(ws.find(wsOf(qs.get("workspace"))).path, qs.get("limit")) })],
    ["GET", "/publish", (p, qs) => ({ publish: publisher.status(wsOf(qs.get("workspace"))) })],
    ["POST", "/publish/prepare", (p, qs, b) => [202, { run: publisher.prepare(wsOf(b.workspace)) }]],
    ["POST", "/publish/:id/release", async (p, qs, b) => ({ run: await publisher.release(p.id, { version: b.version, confirm: b.confirm }) })],
    ["GET", "/chat", (p, qs) => ({ chat: chat.get(wsOf(qs.get("workspace")), String(qs.get("who") || "")) })],
    ["POST", "/chat", (p, qs, b) => [202, { chat: chat.send({ workspace: wsOf(b.workspace), who: String(b.who || ""), text: b.text }) }]],
    ["POST", "/chat/clear", (p, qs, b) => ({ chat: chat.clear(wsOf(b.workspace), String(b.who || "")) })],
    ["GET", "/bo-nao", () => ({ cay: boNao.cay() })],
    ["GET", "/bo-nao/doc", (p, qs) => boNao.doc(qs.get("p"))],
    ["POST", "/bo-nao/ghi", (p, qs, b) => boNao.ghi(b, "ceo")],
    ["POST", "/bo-nao/xoa", (p, qs, b) => boNao.xoa(b, "ceo")],
    ["GET", "/bo-nao/lich-su", (p, qs) => ({ lichSu: boNao.lichSu(qs.get("p")) })],
    ["GET", "/bo-nao/ban", (p, qs) => boNao.ban(qs.get("p"), qs.get("commit"))],
    ["POST", "/bo-nao/hoan-tac", (p, qs, b) => boNao.hoanTac(b.commit, "ceo")],
    // Ba mức quyền theo vai (ctl/quyen.js, CEO duyệt 21/11/2026). Trả thêm "muc" = mức đang áp thật của từng vai
    // (kể cả vai chưa đặt riêng, theo công tắc chung) để giao diện không phải tự suy.
    ["GET", "/quyen", () => ({ quyen: quyenView() })],
    ["POST", "/quyen", (p, qs, b) => { runner.quyen.dat(b, "ceo"); return { quyen: quyenView() }; }],
    ["GET", "/lich-chay", () => ({ lichChay: lichChay.list() })],
    ["POST", "/lich-chay", (p, qs, b) => ({ lich: lichChay.luu(b, "ceo") })],
    ["POST", "/lich-chay/:id/bat", (p, qs, b) => ({ lich: lichChay.batTat(p.id, b.bat, "ceo") })],
    ["POST", "/lich-chay/:id/xoa", (p) => lichChay.xoa(p.id, "ceo")],
    ["POST", "/lich-chay/:id/chay-ngay", async (p) => ({ ketQua: await lichChay.chayNgay(p.id, "ceo") })],
    ["GET", "/scan", (p, qs) => {
      const root = ws.find(wsOf(qs.get("workspace"))).path;
      return { scan: scanner.status(root, { fresh: qs.get("fresh") === "1" }), fullAccess: runner.fullOn(), canResumeLimited: autopilot.scanCanResumeLimited(root) };
    }],
    ["POST", "/scan/resume", (p, qs, b) => {
      const root = ws.find(wsOf(b.workspace)).path;
      if (runner.fullOn() && !autopilot.scanCanResumeLimited(root)) scanner.require(root);
      return { resumed: autopilot.resumeScan(root) };
    }],
    ["POST", "/scan/approve", (p, qs, b) => { const root = ws.find(wsOf(b.workspace)).path; const scan = scanner.approve(root, String(b.fingerprint || "")); return { scan, resumed: autopilot.resumeScan(root) }; }],
    ["GET", "/github/repos", (p, qs) => github.list(qs.get("page") || 1)],
    ["GET", "/github/pulls", (p, qs) => github.pulls(ws.find(wsOf(qs.get("workspace"))).path, { state: qs.get("state") || "open", page: qs.get("page") || 1 })],
    ["GET", "/github/pulls/:number", (p, qs) => github.pullDetail(ws.find(wsOf(qs.get("workspace"))).path, p.number)],
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
      return { overview: { ...ws.overview(root), visibility, boKiem: boKiem.status(root) } };
    }],
    ["POST", "/bo-kiem", (p, qs, b) => ({ boKiem: boKiem.install(ws.find(wsOf(b.workspace)).path) })],
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
    // Các màn hình hàng chờ dùng scope=manual; danh sách mặc định vẫn trả mọi bàn giao chờ duyệt.
    ["GET", "/handoffs", (p, qs) => ({ handoffs: runner.pending().filter((h) => qs.get("scope") !== "manual" || !autopilot.handoffRun(h.job_id)) })],
    ["GET", "/handoffs/:id", (p) => { const h = runner.get(p.id); if (!h) throw Object.assign(new Error("Chưa có bàn giao của " + p.id), { code: "NOT_FOUND" }); return { handoff: h }; }],
    ["POST", "/handoffs/:id/approve", (p) => ({ handoff: runner.approve(manualHandoff(p.id), "ceo") })],
    ["POST", "/handoffs/:id/reject", (p) => ({ handoff: runner.reject(manualHandoff(p.id), "ceo") })],
    ["POST", "/handoffs/:id/answer", (p, qs, b) => ({ handoff: runner.answer(manualHandoff(p.id), b.option, "ceo") })],
  ];
  function manualHandoff(id) {
    const runId = autopilot.handoffRun(id);
    if (runId) throw Object.assign(new Error("Bàn giao thuộc luồng " + runId + ". Mở luồng để trả lời, duyệt hoặc từ chối."), { code: "HANDOFF_IN_RUN" });
    return id;
  }

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

  const MIME_MEDIA = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
  function guiMedia(req, res, url) {
    const rel = String(url.searchParams.get("path") || "");
    if (!/^media\//.test(rel) || !libPhim.duongDanHopLe(rel)) return fail(res, 403, "PATH_DENIED", "Chỉ xem được file trong media/ của phim");
    const loai = MIME_MEDIA[path.extname(rel).toLowerCase()];
    if (!loai) return fail(res, 403, "PATH_DENIED", "Loại file không xem được");
    const { real } = ws.resolve(phimRoot(url.searchParams.get("workspace")), rel);
    const size = fs.statSync(real).size;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    if (m && size) {
      const start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
      const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { "Content-Range": "bytes */" + size }); return res.end(); }
      res.writeHead(206, { "Content-Type": loai, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
      return fs.createReadStream(real, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": loai, "Content-Length": size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
    fs.createReadStream(real).pipe(res);
  }

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
      // Ảnh/giọng/clip của phim cho trang Xưởng phim xem: chỉ trong media/ của workspace đã đăng ký, có Range để tua video.
      if (req.method === "GET" && url.pathname === "/phim/media") return guiMedia(req, res, url);
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
    lichChay.dung();
    const dungLuongPhim = luongPhim.dungHet();
    const dungMayQuay = mayQuay.dungHet();
    await Promise.allSettled([...background]);
    github.close();
    autopilot.close();
    await quotas.close();
    clearInterval(tick);
    for (const r of streams) r.end();
    await jobs.killAll("ctl-shutdown");
    await jobs.drain();
    await Promise.all([dungLuongPhim, dungMayQuay]);
    await new Promise((ok) => server.close(ok));
    db.close();
  }

  return { server, jobs, ws, files, xuongPhim, mayQuay, tramFlow, runner, autopilot, scanner, publisher, chat, connectors, journal, github, quotas, agyTk, codexTk, updater, boKiem, audit, token, close };
}

if (require.main === module) {
  const dir = home();
  const port = Number(process.env.CTL_PORT || 7790);
  const ctl = createCtl({ dir, notify: true });
  const tokenFile = path.join(dir, "ctl-token");
  // server.js đọc lại token ở mỗi yêu cầu; writeAtomic thử lại khi Windows tạm khoá file (EPERM/EBUSY) thay vì sập.
  writeAtomic(tokenFile, ctl.token);
  ctl.server.listen(port, "127.0.0.1", () => {
    ctl.audit.log("ctl", "start", null, { port, pid: process.pid });
    // Đọc sẵn kết nối của các AI để lượt đầu tiên đã tắt đúng kết nối không thuộc phòng (ctl/mcp-phong.js).
    setTimeout(() => ctl.connectors.status().catch(() => {}), 3000).unref();
    // Đọc sẵn danh sách model của các AI (nhớ 6 giờ) để bảng chọn model trên điện thoại hiện ngay, không phải chờ lần đầu.
    setTimeout(() => ctl.quotas.models().catch(() => {}), 20000).unref();
    setInterval(() => ctl.quotas.models(true).catch(() => {}), 6 * 3600 * 1000).unref();
    // Hỏi GitHub có bản phát hành mới không: 1 phút sau khi bật, rồi mỗi 6 giờ (trang Cập nhật cũng có nút kiểm ngay).
    const checkUpdate = () => ctl.updater.refresh().catch(() => {});
    setTimeout(checkUpdate, 60 * 1000).unref();
    setInterval(checkUpdate, 6 * 3600 * 1000).unref();
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
