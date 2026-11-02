// CEO giao một việc; các bàn giao nội bộ chạy theo NEXT_OWNER, kết thúc ở báo cáo Claude chờ CEO duyệt.
// Mỗi dự án chỉ có một luồng. Lưu ngoài repo; khi ctl khởi động lại không tự chạy lại việc đang dang dở (luồng đang chờ hạn mức thì vẫn chờ tới giờ rồi chạy lại).
// Ngắt mạch (dừng, Claude báo cáo cho CEO): bàn giao sai, hết lượt/thời gian, log có chuỗi hình dạng khóa API, xung đột git,
// Claude trả việc về Codex quá MAX_REWORK lần. Claude (đội trưởng) hỏi CEO bằng ask_ceo → luồng chờ "awaiting_answer", CEO chọn phương án.
// AI của lượt hết hạn mức gói → "waiting_quota": tự chạy lại đúng lượt đó khi hạn mức mở lại (ngữ cảnh nằm trong agent.md/repo nên không mất);
// CEO có thể yêu cầu đội trưởng soạn master prompt + chuẩn đầu ra để tự làm lượt đó trên ChatGPT web bằng tài khoản khác.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { maskSecrets, looksLikeKey } = require("../lib/mask");
const { readTurn } = require("./handoff");
const ACTIVE = new Set(["running", "reporting", "awaiting_approval", "awaiting_answer", "attention", "waiting_quota"]);
const PROVIDER = { CODEX_ASTRA_DEV: "codex", SOL_ARCHITECT_PLANNER: "codex", SOL_ARCHITECT_ADVISOR: "codex", CLAUDE_AUDITOR: "claude", SPEC_ARCHITECT: "antigravity" };
const PROVIDER_NAME = { codex: "Codex", claude: "Claude", antigravity: "Antigravity" };
const WRITER_NAME = { claude: "Claude (đội trưởng)", codex: "Codex (Sol/Astra)", antigravity: "Antigravity (Hinata)" };
const WRITER_ORDER = ["claude", "codex", "antigravity"];
// Dấu hiệu CLI báo hết hạn mức gói (khác lỗi mạng thường). Chỉ xét phần cuối log của lượt không có bàn giao hợp lệ.
const QUOTA_HIT = /usage[_ ]limit|hit your (?:usage )?limit|limit reached|quota (?:exceeded|exhausted)|insufficient_quota|rate_limit_exceeded|out of (?:credits|quota)/i;
const MIN_WAIT = 2 * 60000, DEFAULT_WAIT = 30 * 60000, MAX_WAIT = 8 * 3600000, BUFFER = 60000;
const SECTION = /===MASTER_PROMPT===\s*([\s\S]*?)\s*===CHUAN_DAU_RA===\s*([\s\S]*)$/;

// "try again in 2 hours 15 minutes" / "in 45 minutes" → mốc thời gian; không đọc được thì null.
function waitFromMessage(text, now) {
  const m = /(?:try again|resets?|available again)\s+in\s+((?:\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b[\s,]*(?:and\s+)?)+)/i.exec(text);
  if (!m) return null;
  let ms = 0;
  for (const [, n, u] of m[1].matchAll(/(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi)) {
    const k = u[0].toLowerCase();
    ms += Number(n) * (k === "d" ? 86400000 : k === "h" ? 3600000 : k === "m" ? 60000 : 1000);
  }
  return ms ? now + ms : null;
}
// Hạn mức từ bộ theo dõi /quotas: "còn" / "hết" (kèm giờ mở lại) / "chưa rõ".
function quotaState(provider) {
  if (!provider || provider.status !== "ready" || !provider.buckets.length) return { state: "chưa rõ" };
  const min = Math.min(...provider.buckets.map((b) => b.remainingPercent));
  const out = provider.buckets.filter((b) => b.remainingPercent <= 1 && b.resetAt && Date.parse(b.resetAt) > Date.now());
  return out.length ? { state: "hết", resetAt: new Date(Math.max(...out.map((b) => Date.parse(b.resetAt)))).toISOString(), remaining: min } : { state: "còn", remaining: min };
}
const MAX_REWORK = 2; // Codex sửa lại tối đa 2 lần sau khi Claude trả về, quá thì CEO quyết
const err = (code, message) => Object.assign(new Error(message), { code });

function responseText(log) {
  const lines = String(log).trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const v = JSON.parse(lines[i]);
      if (typeof v.result === "string") return v.result;
      if (typeof v.response === "string") return v.response;
      if (v.item && v.item.type === "agent_message" && typeof v.item.text === "string") return v.item.text;   // codex exec --json
    } catch {}
  }
  return String(log).slice(-40000);
}

function createAutopilot({ runner, jobs, ws, audit, dir, intervalMs = 500, quotaSnapshot = () => ({ providers: [] }) }) {
  const folder = path.join(dir, "autopilot");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const runs = new Map();
  let closing = false, ticking = false;
  const save = (run) => {
    run.updatedAt = Date.now();
    const dest = path.join(folder, run.id + ".json"), temp = dest + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(run), { mode: 0o600 }); fs.renameSync(temp, dest);
  };
  for (const name of fs.readdirSync(folder).filter((f) => /^auto-[\w-]+\.json$/.test(f))) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(folder, name), "utf8"));
      if (run.id + ".json" !== name) continue;
      if (["running", "reporting"].includes(run.status)) { run.status = "attention"; run.problem = "Controller đã khởi động lại trong lúc làm việc. Kiểm tra file và nhật ký trước khi giao lại."; save(run); }
      runs.set(run.id, run);
    } catch (e) { audit.log("autopilot", "state.error", name, e.message); }
  }
  const get = (id) => { const r = runs.get(id); if (!r) throw err("NOT_FOUND", "Không có luồng " + id); return r; };
  const list = () => [...runs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  const busy = (workspace) => [...runs.values()].some((r) => r.workspace === workspace && ACTIVE.has(r.status));
  const logOf = (id) => maskSecrets(jobs.rawLog(id) || "").slice(-40000);
  // Giới hạn lượt tính từ lần CEO quyết gần nhất (trả lời câu hỏi của Claude = CEO cho phép đi tiếp).
  // Lượt bị ngắt vì hết hạn mức (quota) không tính vào giới hạn lượt và số lần sửa lại.
  const stepsSinceCeo = (run) => run.steps.slice(run.stepBase || 0).filter((s) => !s.quota).length;
  const providers = () => { try { return quotaSnapshot().providers || []; } catch { return []; } };

  // Giờ chạy lại: ưu tiên giờ mở lại từ bộ theo dõi hạn mức, rồi thông báo của CLI, cuối cùng là mặc định 30 phút.
  function resumeTime(provider, text, now) {
    const q = quotaState(providers().find((p) => p.id === provider));
    let at = q.state === "hết" ? Date.parse(q.resetAt) + BUFFER : null, source = "theo dõi hạn mức";
    if (!at) { at = waitFromMessage(text, now); source = "thông báo của CLI"; if (at) at += BUFFER; }
    if (!at) { at = now + DEFAULT_WAIT; source = "mặc định 30 phút (không đọc được giờ mở lại)"; }
    return { at: Math.min(Math.max(at, now + MIN_WAIT), now + MAX_WAIT), source };
  }

  function waitQuota(run, text) {
    const step = run.steps[run.steps.length - 1];
    step.quota = true;
    const provider = PROVIDER[step.role] || "codex", now = Date.now();
    const { at, source } = resumeTime(provider, text, now);
    const line = String(text).split(/\r?\n/).reverse().find((l) => QUOTA_HIT.test(l)) || "";
    run.status = "waiting_quota";
    run.wait = { role: step.role, provider, providerName: PROVIDER_NAME[provider], since: now, until: at, source, message: maskSecrets(line).slice(0, 400) };
    run.web = null;
    save(run);
    audit.log("autopilot", "quota.wait", run.id, { role: step.role, provider, until: new Date(at).toISOString(), source });
  }

  function resume(run, actor) {
    const waited = Date.now() - (run.wait?.since || Date.now());
    run.deadline += waited;   // thời gian chờ hạn mức không tính vào giới hạn 90 phút
    run.status = "running"; run.wait = null; save(run);
    audit.log(actor, "quota.resume", run.id);
    try { launch(run); } catch (e) { report(run, e.message); }
  }

  // Ghi master prompt của đội trưởng (hoặc mẫu tự động) vào luồng.
  function templatePrompt(run, why) {
    const role = run.wait.role;
    let book = "";
    try { book = maskSecrets(fs.readFileSync(path.join(run.workspace, "agent.md"), "utf8")).slice(0, 30000); } catch { book = "(không đọc được agent.md)"; }
    const decisions = (run.decisions || []).map((d) => "- " + d.text).join("\n");
    const out = {
      CODEX_ASTRA_DEV: "Mỗi file thay đổi: một dòng `FILE: đường/dẫn` rồi TOÀN BỘ nội dung mới của file trong một khối ```. Sau đó: lệnh kiểm tra cần chạy (ví dụ npm test), các dòng ghi vào Vùng [4.1] (danh sách file đã sửa, CLAIM_FIXED: <ID> -> <file> nếu có), và dòng JSON bàn giao.",
      SOL_ARCHITECT_PLANNER: "Nguyên văn Vùng [1] và [3] mới của agent.md (cây thư mục, schema DB kèm lý do index, API contract đủ method/path/request/response/mã lỗi, lộ trình Phase có điều kiện nghiệm thu đo được), rồi dòng JSON bàn giao.",
      SOL_ARCHITECT_ADVISOR: "Các dòng nhận xét ghi vào Vùng [4.1] (đối chiếu code với Vùng [3], đề xuất ngắn), rồi dòng JSON bàn giao.",
      SPEC_ARCHITECT: "Nguyên văn Vùng [2] mới (phạm vi MVP, luồng người dùng, luồng AI Agent, Design Tokens, Component Tree, 5 trạng thái, trường hợp biên), dòng ghi [4.1], rồi dòng JSON bàn giao.",
      CLAUDE_AUDITOR: "Nguyên văn Vùng [5] mới (AUDIT_STATUS, blocker theo mẫu `- [ ] OPEN P{phase}-C{số} [...]`), hai dòng LAST_UPDATED_BY/NEXT_OWNER của Vùng [4], rồi dòng JSON bàn giao.",
    }[role] || "Kết quả theo đúng quyền của vai, rồi dòng JSON bàn giao.";
    return {
      prompt: `Bạn đóng vai ${role} trong đội AI của dự án dưới đây, làm theo giao thức agent.md (khóa lượt NEXT_OWNER, chỉ sửa vùng thuộc quyền của vai).\n` +
        `Nhiệm vụ của vai: ${(runner.AGENTS[role] && runner.AGENTS[role].prompt) || ""}\n\nVIỆC CEO GIAO:\n${run.task}\n` + (decisions ? `\nQUYẾT ĐỊNH CỦA CEO:\n${decisions}\n` : "") +
        `\nSỔ agent.md HIỆN TẠI (nguyên văn):\n<<<\n${book}\n>>>\n\nLưu ý: bạn không đọc được repo. Nếu cần nội dung file nào, hỏi lại tôi tên file trước khi viết; không bịa nội dung file. Không TODO/placeholder.`,
      spec: `${out}\nDòng JSON bàn giao (một dòng, đúng mẫu): {"role":"${role}","next_owner":"<VAI tiếp theo>","files":["..."],"claim_fixed":[]}\nTiêu chí nghiệm thu: làm đúng việc CEO giao, không đổi ngoài phạm vi, giữ phong cách code hiện có, không lộ secret.`,
      writer: "Mẫu tự động từ agent.md", note: why,
    };
  }

  // CEO yêu cầu: đội trưởng xem ai còn hạn mức; Claude còn thì Claude đọc repo và soạn, không thì dùng mẫu từ agent.md.
  function webPrompt(id) {
    const run = get(id);
    if (run.status !== "waiting_quota" || !run.wait) throw err("NOT_WAITING", "Chỉ soạn master prompt khi luồng đang chờ hạn mức.");
    if (run.web?.status === "writing") throw err("AI_BUSY", "Đội trưởng đang soạn master prompt.");
    const list = providers();
    const quotas = ["codex", "claude", "antigravity"].map((id) => ({ id, name: PROVIDER_NAME[id], ...quotaState(list.find((p) => p.id === id)) }));
    run.web = { requestedAt: Date.now(), role: run.wait.role, quotas, tried: [], failures: [] };
    nextWriter(run);
    save(run);
    audit.log("ceo", "quota.web_prompt", run.id, { role: run.wait.role, writer: run.web.writer });
    return run;
  }

  // Đội trưởng toàn quyền giao việc: chọn AI còn nhiều hạn mức nhất (trừ AI vừa hết, trừ AI đã thử hỏng);
  // không còn ai thì văn phòng soạn mẫu từ agent.md.
  function nextWriter(run) {
    const w = run.web;
    const left = w.quotas.filter((q) => q.id !== run.wait.provider && q.state !== "hết" && !w.tried.includes(q.id))
      .sort((a, b) => (b.state === "còn" ? b.remaining : -1) - (a.state === "còn" ? a.remaining : -1) || WRITER_ORDER.indexOf(a.id) - WRITER_ORDER.indexOf(b.id));
    for (const q of left) {
      w.tried.push(q.id);
      try {
        const decisions = (run.decisions || []).map((d) => "- " + d.text).join("\n");
        const job = runner.webPrompt({ workspace: run.workspace, role: run.wait.role, task: run.task, decisions, provider: run.wait.providerName, writer: q.id });
        Object.assign(w, { status: "writing", writer: WRITER_NAME[q.id], writerId: q.id, jobId: job.id });
        return;
      } catch (e) { w.failures.push(WRITER_NAME[q.id] + ": " + maskSecrets(e.message)); }
    }
    const why = w.failures.length ? "Không AI nào soạn được (" + w.failures.join("; ") + ")" : "Không còn AI nào có hạn mức";
    Object.assign(w, { status: "ready", jobId: null, ...templatePrompt(run, why + " nên văn phòng soạn mẫu từ agent.md (không kèm mã nguồn).") });
  }

  // Tìm đoạn có hai mốc ===MASTER_PROMPT=== / ===CHUAN_DAU_RA=== trong log (văn bản thường hoặc chuỗi trong dòng JSON).
  function markedText(log) {
    const direct = responseText(log);
    if (SECTION.test(direct)) return direct;
    const walk = (v) => typeof v === "string" ? (v.includes("===MASTER_PROMPT===") ? v : null) : v && typeof v === "object" ? Object.values(v).reduce((hit, x) => hit || walk(x), null) : null;
    for (const line of String(log).split(/\r?\n/).reverse()) { try { const hit = walk(JSON.parse(line)); if (hit) return hit; } catch {} }
    return direct;
  }

  function finishWeb(run) {
    const job = jobs.get(run.web.jobId);
    if (!job || job.status === "running") return;
    const raw = logOf(job.id), text = markedText(raw);
    const m = job.status === "done" ? SECTION.exec(text) : null;
    if (m && m[1].trim() && m[2].trim()) Object.assign(run.web, { status: "ready", prompt: maskSecrets(m[1].trim()), spec: maskSecrets(m[2].trim()), note: run.web.failures.length ? "Đã thử trước: " + run.web.failures.join("; ") : "" });
    else {
      // AI này hỏng hoặc vừa hết hạn mức: giao cho AI kế tiếp còn hạn mức
      run.web.failures.push(run.web.writer + ": " + (QUOTA_HIT.test(raw.slice(-8000)) ? "vừa báo hết hạn mức" : job.status !== "done" ? "kết thúc với trạng thái " + job.status : "không trả đúng định dạng"));
      nextWriter(run);
      save(run);
      return;
    }
    if (looksLikeKey(run.web.prompt + "\n" + run.web.spec)) run.web.warning = "Có chuỗi giống khóa API trong prompt: kiểm tra và xoá trước khi dán vào ChatGPT.";
    save(run);
  }

  function launch(run) {
    if (closing || run.status !== "running") return;
    if (stepsSinceCeo(run) >= run.maxSteps) return report(run, "Đã hết giới hạn " + run.maxSteps + " lượt nội bộ.");
    const role = readTurn(run.workspace).nextOwner;
    const decisions = (run.decisions || []).map((d) => "- " + d.text).join("\n");
    const task = "ĐẶC CÁCH CEO cho luồng " + run.id + ": tự chạy và duyệt bàn giao NỘI BỘ cho việc này, CEO chỉ nhận báo cáo cuối của Claude để duyệt. Giữ đúng quyền theo vai, không push/merge/release, không xóa dữ liệu người dùng. Bộ điều phối sẽ commit agent.md và chuyển lượt sau khi kiểm bàn giao: bạn không tự commit hoặc đổi NEXT_OWNER. Không làm việc ngoài yêu cầu. Nếu là Claude: còn lỗi cần sửa thì next_owner CODEX_ASTRA_DEV; kiến trúc đã duyệt nhưng chưa code thì chuyển CODEX_ASTRA_DEV; khi nghiệm thu xong thì next_owner SPEC_ARCHITECT để kết thúc; thấy AI khác đi sai hướng thì hỏi CEO bằng ask_ceo, không tự ra lệnh sửa." +
      (decisions ? "\nQUYẾT ĐỊNH CỦA CEO TRONG LUỒNG NÀY (làm theo):\n" + decisions : "") + "\nVIỆC CEO GIAO:\n" + run.task;
    const job = runner.run({ workspace: run.workspace, role, task, allowRetry: false }, "ceo-autopilot");
    run.jobId = job.id; run.steps.push({ jobId: job.id, role, startedAt: Date.now() }); save(run);
    audit.log("ceo-autopilot", "step.start", run.id, { role, job: job.id });
  }

  function report(run, problem) {
    if (closing || !["running", "reporting"].includes(run.status)) return;
    run.problem = maskSecrets(problem);
    try {
      const evidence = run.steps.map((s) => s.role + " · " + s.jobId + "\n" + logOf(s.jobId).slice(-4000)).join("\n\n");
      const job = runner.report({ workspace: run.workspace, task: run.task, evidence: run.problem + "\n\n" + evidence });
      run.status = "reporting"; run.jobId = job.id; run.reportJobId = job.id;
    } catch (e) { run.status = "attention"; run.problem += " Không chạy được Claude báo cáo: " + maskSecrets(e.message); }
    save(run);
  }

  function start({ workspace, task, maxSteps = 10, timeoutMs = 90 * 60000 }) {
    const root = ws.find(workspace).path;
    if (typeof task !== "string" || !task.trim() || task.length > 3000) throw err("BAD_REQUEST", "Nhập việc CEO giao, tối đa 3000 ký tự.");
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 12 || !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120 * 60000) throw err("BAD_REQUEST", "Giới hạn 1–12 lượt và tối đa 120 phút.");
    if (busy(root)) throw err("AI_BUSY", "Dự án đang có một luồng hoặc báo cáo chờ duyệt.");
    const status = runner.status(root);
    if (!status.turn) throw err("BAD_AGENT_MD", status.problem || "Chưa đọc được sổ agent.md.");
    if (status.aiBusy || status.handoffPending) throw err("AI_BUSY", "Xử lý công việc hoặc bàn giao đang chờ trước khi bật tự động.");
    const run = { id: "auto-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex"), workspace: root, task: maskSecrets(task.trim()), status: "running", createdAt: Date.now(), updatedAt: Date.now(), deadline: Date.now() + timeoutMs, timeoutMs, maxSteps, steps: [], stepBase: 0, rework: 0, decisions: [], question: null, jobId: null, finalHandoffId: null, report: "", problem: "" };
    runs.set(run.id, run); save(run);
    audit.log("ceo", "autopilot.start", run.id, { workspace: root, task: run.task, maxSteps, timeoutMs }, "approved");
    try { launch(run); } catch (e) { report(run, e.message); }
    return run;
  }

  async function tick() {
    if (closing || ticking) return;
    ticking = true;
    try {
      for (const run of runs.values()) {
        if (run.status === "stopped") { rejectPending(run); continue; }
        if (run.status === "waiting_quota") {
          if (run.web?.status === "writing") finishWeb(run);
          if (Date.now() >= run.wait.until) resume(run, "autopilot");
          continue;
        }
        if (!["running", "reporting"].includes(run.status)) continue;
        try {
          const job = jobs.get(run.jobId);
          if (!job) { run.status = "attention"; run.problem = "Không tìm thấy công việc đang theo dõi."; save(run); continue; }
          if (job.status === "running") {
            if (run.status === "running" && Date.now() > run.deadline) { await jobs.kill(job.id, "autopilot-timeout"); if (run.status === "running") report(run, "Luồng đã hết thời gian cho phép."); }
            continue;
          }
          if (run.status === "reporting") {
            run.report = responseText(logOf(job.id));
            run.status = job.status === "done" && run.report.trim() ? "awaiting_approval" : "attention";
            if (run.status === "attention") run.problem += /hit your .*limit|usage_limit_reached/i.test(run.report) ? " Claude đang hết lượt phiên: " + run.report : " Claude chưa gửi được báo cáo, công việc kết thúc với trạng thái " + job.status + ".";
            save(run); continue;
          }
          const handoff = runner.get(job.id);
          // Lượt không có bàn giao hợp lệ vì AI hết hạn mức: chờ hạn mức rồi chạy lại đúng lượt đó.
          const quotaText = !handoff || handoff.problems.length ? (QUOTA_HIT.test((jobs.rawLog(job.id) || "").slice(-8000)) ? (jobs.rawLog(job.id) || "").slice(-8000) : null) : null;
          if (quotaText) { if (handoff && !handoff.decided) runner.reject(job.id, "ceo-autopilot"); waitQuota(run, quotaText); continue; }
          if (!handoff) { report(run, "Công việc " + job.id + " kết thúc mà không có bàn giao."); continue; }
          if (handoff.problems.length) { report(run, handoff.problems.join("; ")); continue; }
          if (handoff.decided === "rejected") { run.status = "stopped"; run.problem = "Bàn giao đã bị từ chối."; save(run); continue; }
          if (looksLikeKey(jobs.rawLog(job.id) || "")) { report(run, "Log lượt " + handoff.role + " có chuỗi giống khóa API: CEO kiểm tra trước khi chạy tiếp."); continue; }
          const conflicted = runner.conflicts(run.workspace);
          if (conflicted.length) { report(run, "Xung đột git: " + conflicted.join(", ")); continue; }
          const p = handoff.payload || {};
          // Claude hỏi CEO (phản biện AI khác): không tự duyệt, chờ CEO chọn phương án ở phần theo dõi chu trình.
          if (p.ask_ceo && !handoff.decided) {
            run.status = "awaiting_answer"; run.question = { jobId: job.id, question: p.ask_ceo.question, options: p.ask_ceo.options }; save(run);
            audit.log("autopilot", "ask_ceo", run.id, { job: job.id }); continue;
          }
          if (handoff.role === "CLAUDE_AUDITOR" && (p.done === true || handoff.next_owner !== "CODEX_ASTRA_DEV")) {
            run.finalHandoffId = job.id; run.reportJobId = job.id; run.report = responseText(logOf(job.id)); run.status = "awaiting_approval"; save(run);
            audit.log("autopilot", "report.ready", run.id, { job: job.id }); continue;
          }
          // Claude trả việc về Codex sau khi Codex đã làm trong luồng = một lần sửa lại.
          if (handoff.role === "CLAUDE_AUDITOR" && run.steps.slice(run.stepBase || 0, -1).some((s) => s.role === "CODEX_ASTRA_DEV" && !s.quota) && ++run.rework > MAX_REWORK) {
            report(run, `Codex đã sửa ${MAX_REWORK} lần mà Claude vẫn trả về: CEO quyết hướng xử lý.`); continue;
          }
          if (Date.now() > run.deadline || stepsSinceCeo(run) >= run.maxSteps) { report(run, "Đã chạm giới hạn thời gian hoặc số lượt. Bàn giao còn chờ xử lý."); continue; }
          if (!handoff.decided) runner.approve(job.id, "ceo-autopilot");
          if (!closing && run.status === "running") launch(run);
        } catch (e) { report(run, e.message); }
      }
    } finally { ticking = false; }
  }

  // CEO trả lời câu hỏi của Claude: duyệt bàn giao theo phương án (lượt sang vai của phương án), ghi quyết định vào luồng
  // để các lượt sau làm theo, rồi chạy tiếp. Lượt và thời gian tính lại từ lúc CEO quyết.
  function answer(id, option) {
    const run = get(id);
    if (run.status !== "awaiting_answer" || !run.question) throw err("NOT_PENDING", "Luồng này không chờ câu trả lời của CEO.");
    const r = runner.answer(run.question.jobId, option, "ceo");
    run.decisions = [...(run.decisions || []), { at: Date.now(), option: r.option.id, label: r.option.label, next: r.next, text: r.decision }];
    Object.assign(run, { question: null, status: "running", stepBase: run.steps.length, rework: 0, problem: "", deadline: Date.now() + (run.timeoutMs || 90 * 60000) });
    save(run);
    audit.log("ceo", "autopilot.answer", run.id, { option: r.option.id, next: r.next, commit: r.commit }, "approved");
    try { launch(run); } catch (e) { report(run, e.message); }
    return run;
  }

  async function stop(id) {
    const run = get(id);
    if (!["running", "reporting", "awaiting_answer", "waiting_quota"].includes(run.status)) throw err("NOT_RUNNING", "Luồng không còn chạy.");
    run.status = "stopped"; run.problem = "CEO đã dừng luồng."; save(run);
    audit.log("ceo", "autopilot.stop", run.id);
    const job = jobs.get(run.jobId); if (job?.status === "running") await jobs.kill(job.id, "ceo");
    rejectPending(run);
    return run;
  }

  function decide(id, approve) {
    const run = get(id);
    if (!["awaiting_approval", "attention"].includes(run.status)) throw err("NOT_PENDING", "Báo cáo này không còn chờ duyệt.");
    if (approve && run.finalHandoffId) {
      const h = runner.get(run.finalHandoffId);
      if (h?.decided === "rejected") throw err("DECIDED", "Bàn giao này đã bị từ chối.");
      if (!h?.decided) runner.approve(run.finalHandoffId, "ceo");
    }
    if (!approve && run.finalHandoffId && !runner.get(run.finalHandoffId)?.decided) runner.reject(run.finalHandoffId, "ceo");
    if (!run.finalHandoffId) rejectPending(run);
    run.status = approve ? (run.problem ? "acknowledged" : "approved") : "rejected"; save(run);
    audit.log("ceo", approve ? "report.approve" : "report.reject", run.id, { handoff: run.finalHandoffId }, run.status);
    return run;
  }

  function rejectPending(run) {
    for (const step of run.steps) { const h = runner.get(step.jobId); if (h && !h.decided) runner.reject(step.jobId, "ceo-autopilot"); }
  }

  function cancelJob(id) {
    for (const run of runs.values()) if (["running", "reporting"].includes(run.status) && run.jobId === id) { run.status = "stopped"; run.problem = "Công việc đã được dừng từ bảng điều khiển."; save(run); }
  }
  function cancelAll() { for (const r of runs.values()) if (["running", "reporting"].includes(r.status)) cancelJob(r.jobId); }
  const timer = setInterval(tick, intervalMs); timer.unref();
  function close() { closing = true; clearInterval(timer); for (const r of runs.values()) if (["running", "reporting"].includes(r.status)) { r.status = "attention"; r.problem = "Controller đã tắt khi luồng chưa hoàn thành."; save(r); } }
  // CEO bấm "Chạy lại ngay" khi đang chờ hạn mức (ví dụ đã đổi gói hoặc hạn mức mở sớm).
  function resumeNow(id) {
    const run = get(id);
    if (run.status !== "waiting_quota") throw err("NOT_WAITING", "Luồng này không chờ hạn mức.");
    resume(run, "ceo");
    return run;
  }
  return { start, stop, answer, decide, resumeNow, webPrompt, list, get, busy, cancelJob, cancelAll, close, tick };
}

module.exports = { createAutopilot, responseText };
