// CEO giao một việc; các bàn giao nội bộ chạy theo NEXT_OWNER, kết thúc ở báo cáo Claude chờ CEO duyệt.
// Mỗi dự án chỉ có một luồng. Lưu ngoài repo; khi ctl khởi động lại không tự chạy lại việc đang dang dở.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { maskSecrets } = require("../lib/mask");
const { readTurn } = require("./handoff");
const ACTIVE = new Set(["running", "reporting", "awaiting_approval", "attention"]);
const err = (code, message) => Object.assign(new Error(message), { code });

function responseText(log) {
  const lines = String(log).trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const v = JSON.parse(lines[i]); if (typeof v.result === "string") return v.result; if (typeof v.response === "string") return v.response; } catch {}
  }
  return String(log).slice(-40000);
}

function createAutopilot({ runner, jobs, ws, audit, dir, intervalMs = 500 }) {
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

  function launch(run) {
    if (closing || run.status !== "running") return;
    if (run.steps.length >= run.maxSteps) return report(run, "Đã hết giới hạn " + run.maxSteps + " lượt nội bộ.");
    const role = readTurn(run.workspace).nextOwner;
    const task = "ĐẶC CÁCH CEO cho luồng " + run.id + ": tự chạy và duyệt bàn giao NỘI BỘ cho việc này, CEO chỉ nhận báo cáo cuối của Claude để duyệt. Giữ đúng quyền theo vai, không push/merge/release, không xóa dữ liệu người dùng. Bộ điều phối sẽ commit agent.md và chuyển lượt sau khi kiểm bàn giao: bạn không tự commit hoặc đổi NEXT_OWNER. Không làm việc ngoài yêu cầu. Nếu là Claude: còn lỗi cần sửa thì next_owner CODEX_ASTRA_DEV; kiến trúc đã duyệt nhưng chưa code thì chuyển CODEX_ASTRA_DEV; khi nghiệm thu xong thì next_owner SPEC_ARCHITECT để kết thúc.\nVIỆC CEO GIAO:\n" + run.task;
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
    const run = { id: "auto-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex"), workspace: root, task: maskSecrets(task.trim()), status: "running", createdAt: Date.now(), updatedAt: Date.now(), deadline: Date.now() + timeoutMs, maxSteps, steps: [], jobId: null, finalHandoffId: null, report: "", problem: "" };
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
          if (!handoff) { report(run, "Công việc " + job.id + " kết thúc mà không có bàn giao."); continue; }
          if (handoff.problems.length) { report(run, handoff.problems.join("; ")); continue; }
          if (handoff.decided === "rejected") { run.status = "stopped"; run.problem = "Bàn giao đã bị từ chối."; save(run); continue; }
          if (handoff.role === "CLAUDE_AUDITOR" && handoff.next_owner !== "CODEX_ASTRA_DEV") {
            run.finalHandoffId = job.id; run.reportJobId = job.id; run.report = responseText(logOf(job.id)); run.status = "awaiting_approval"; save(run);
            audit.log("autopilot", "report.ready", run.id, { job: job.id }); continue;
          }
          if (Date.now() > run.deadline || run.steps.length >= run.maxSteps) { report(run, "Đã chạm giới hạn thời gian hoặc số lượt. Bàn giao còn chờ xử lý."); continue; }
          if (!handoff.decided) runner.approve(job.id, "ceo-autopilot");
          if (!closing && run.status === "running") launch(run);
        } catch (e) { report(run, e.message); }
      }
    } finally { ticking = false; }
  }

  async function stop(id) {
    const run = get(id);
    if (!["running", "reporting"].includes(run.status)) throw err("NOT_RUNNING", "Luồng không còn chạy.");
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
  return { start, stop, decide, list, get, busy, cancelJob, cancelAll, close, tick };
}

module.exports = { createAutopilot, responseText };
