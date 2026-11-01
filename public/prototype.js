"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const roles = [
    { key: "ceo", name: "Naruto · Giám đốc", room: "PHÒNG GIÁM ĐỐC", role: "Chủ dự án", color: "#ecc970", symbol: "♛", char: "naruto_ceo", description: "Quyết định và duyệt bàn giao của đội." },
    { key: "spec", name: "Hinata · Antigravity", room: "PHÒNG ĐẶC TẢ", role: "SPEC_ARCHITECT", color: "#a855f7", symbol: "✦", char: "hinata_antigravity", description: "Đặc tả sản phẩm, luồng người dùng và thiết kế giao diện." },
    { key: "sol", name: "Itachi · Sol", room: "PHÒNG KIẾN TRÚC", role: "SOL_ARCHITECT_PLANNER", aliases: ["SOL_ARCHITECT_ADVISOR"], color: "#10b981", symbol: "◉", char: "itachi_sol", description: "Kiến trúc, hợp đồng API và kế hoạch triển khai." },
    { key: "codex", name: "Sasuke · Codex", room: "PHÒNG KỸ SƯ", role: "CODEX_ASTRA_DEV", color: "#3a86ff", symbol: "ϟ", char: "sasuke_codex", description: "Lập trình và kiểm thử theo đặc tả đã duyệt." },
    { key: "claude", name: "Sakura · Claude", room: "STUDIO KIỂM DUYỆT", role: "CLAUDE_AUDITOR", color: "#f43f5e", symbol: "✧", char: "sakura_claude", description: "Kiểm duyệt mã, bảo mật và chốt chặn." },
    { key: "pain", name: "Pain · Điều hành", room: "PHÒNG DEV & DỊCH VỤ", role: "OS Controller", color: "#e07a5f", symbol: "◎", char: "pain_quanly", description: "Theo dõi công việc và tiến trình chạy trên máy." },
  ];
  let snapshot = null, accounts = null, active = "", workspaces = [], turn = null, blockerLines = null;
  let jobs = [], handoffs = [], autoRuns = [], controller = false, selected = "spec", view = "office", pendingApproval = null;
  let loading = false, switching = false, controlError = "", stateError = "", accountError = "", source = null, streaming = false;
  let docText = null, docError = "", signatures = {}, lastRefresh = null, logSequence = 0;
  const setMarkup = (id, html) => { if (signatures[id] !== html) { $(id).innerHTML = html; signatures[id] = html; } };
  const badge = (text, kind = "") => `<span class="badge ${kind}">${esc(text)}</span>`;
  const avatar = (r) => `<div class="avatar-wrap" aria-hidden="true"><div class="chibi" style="--accent:${r.color}"><span>${r.symbol}</span></div></div>`;
  const statusName = (s) => ({ running: "Đang chạy", done: "Hoàn tất", failed: "Thất bại", killed: "Đã dừng", timeout: "Quá thời gian", pending_approval: "Chờ duyệt", rejected: "Đã từ chối", active: "Có hoạt động", idle: "Đang nghỉ", away: "Chưa có hoạt động gần đây" })[s] || s;
  const ownJobs = () => jobs.filter((j) => j.workspace === active);
  const ownHandoffs = () => handoffs.filter((h) => h.workspace === active);
  const isOwner = (r) => !!turn && [r.role, ...(r.aliases || [])].includes(turn.nextOwner);

  async function request(path, body) {
    const res = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(8000), ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (res.status === 401) throw new Error("Phiên xem đã hết hạn. Mở lại văn phòng để đăng nhập.");
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || "Không đọc được dữ liệu (HTTP " + res.status + ").");
    return data;
  }

  function setView(name) {
    if (!["office", "meeting", "board", "transcript", "account"].includes(name)) name = "office";
    view = name;
    document.querySelectorAll(".view").forEach((el) => { el.hidden = el.id !== "view-" + name; });
    document.querySelectorAll("[data-view]").forEach((el) => { if (el.dataset.view === name) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
    if (name === "transcript" && $("logJob").value) readLog();
  }

  function roomStatus(r) {
    if (r.key === "ceo") return ["Chủ dự án", ""];
    if (r.key === "pain") return controller ? ["Đã kết nối", "good"] : ["Chưa kết nối", "warn"];
    if (!controller || !active) return ["Chưa có dữ liệu lượt", ""];
    const running = ownJobs().some((j) => j.status === "running" && [r.role, ...(r.aliases || [])].includes(j.agent));
    if (running) return ["Đang thực hiện", "good"];
    if (isOwner(r)) return ["Đang giữ lượt", "warn"];
    return ["Chờ lượt", ""];
  }

  function renderOffice() {
    $("rooms").setAttribute("aria-busy", String(!snapshot && !stateError));
    setMarkup("rooms", roles.map((r) => {
      const [status, kind] = roomStatus(r);
      const name = r.key === "ceo" && snapshot ? "Naruto · " + snapshot.ownerName : r.name;
      return `<article class="room ${isOwner(r) ? "current" : ""}" style="--accent:${r.color}" data-role="${r.key}"><div class="room-heading"><h2>${r.room}</h2>${badge(status, kind)}</div>${avatar(r)}<div><div class="room-name">${esc(name)}</div><div class="room-role mono">${esc(r.role)}</div></div><p class="room-description">${r.description}</p><div class="room-actions"><button data-detail="${r.key}" aria-pressed="${r.key === selected}">Chi tiết</button><a href="characters.html#${r.char}">Nhân vật 3D ↗</a></div></article>`;
    }).join(""));
    renderDetail();
    const agents = snapshot && Array.isArray(snapshot.agents) ? snapshot.agents.filter((a) => a.platform !== "human") : [];
    setMarkup("sessions", !snapshot ? `<p class="muted">${esc(stateError || "Đang đọc nhật ký…")}</p>` : agents.length ? agents.map((a) => `<div class="entry"><div class="entry-head"><strong>${esc(a.name)}</strong>${badge(statusName(a.status), a.status === "active" ? "good" : "")}</div><p>${esc(a.platform)} · Phiên ${esc(a.session || "chưa xác định")}${a.sub ? " · " + esc(a.sub) + " subagent đang hoạt động" : ""}</p><p>${esc(a.lastText || "Chưa có nội dung nhật ký.")}</p></div>`).join("") : '<p class="muted">Chưa phát hiện phiên AI nào trong các dự án được theo dõi.</p>');
    const events = snapshot && Array.isArray(snapshot.events) ? snapshot.events.slice(-40).reverse() : [];
    setMarkup("events", !snapshot ? `<p class="muted">${esc(stateError || "Đang tải sự kiện…")}</p>` : events.length ? events.map((e) => `<div class="entry"><strong>${esc(e.title || e.kind || "Sự kiện")}</strong><p>${esc(e.body || "")}</p></div>`).join("") : '<p class="muted">Chưa có sự kiện nào được ghi nhận.</p>');
  }

  function renderDetail() {
    const r = roles.find((x) => x.key === selected) || roles[0], [status] = roomStatus(r);
    const associated = ownJobs().filter((j) => [r.role, ...(r.aliases || [])].includes(j.agent));
    setMarkup("detail", `${avatar(r)}<h2>${esc(r.name)}</h2><dl><dt>Vai trò</dt><dd class="mono">${esc(r.role)}</dd><dt>Trạng thái điều phối</dt><dd>${esc(status)}</dd><dt>Phase của dự án</dt><dd>${esc(turn?.phase || "Chưa có dữ liệu")}</dd><dt>Lượt hiện tại trong sổ</dt><dd class="mono">${esc(turn?.nextOwner || "Chưa đọc được sổ")}</dd><dt>Công việc đang chạy của vai</dt><dd>${controller ? associated.filter((j) => j.status === "running").length : "Chưa có dữ liệu"}</dd></dl><p class="muted">${r.description}</p><a href="dieukhien.html">Xem công việc & điều khiển máy ↗</a>`);
  }

  function renderProtocol() {
    $("phase").textContent = turn?.phase || (loading ? "Đang đọc sổ…" : "Chưa đọc được Phase");
    $("owner").textContent = turn?.nextOwner || (loading ? "Đang đọc sổ…" : "Chưa đọc được lượt");
    $("blockers").textContent = blockerLines === null ? "Chưa đọc chốt chặn" : blockerLines.length + " lỗi OPEN";
    $("blockers").className = "badge " + (blockerLines === null || blockerLines.length ? "warn" : "good");
    const count = controller ? ownHandoffs().length : null;
    const reports = autoRuns.filter((r) => r.workspace === active && r.status === "awaiting_approval").length;
    const attention = autoRuns.some((r) => r.workspace === active && r.status === "attention");
    $("handoffButton").textContent = attention ? "Luồng cần xử lý" : reports ? "Claude chờ duyệt (" + reports + ")" : count ? "Bàn giao chờ duyệt (" + count + ")" : "Claude báo cáo";
    $("connection").textContent = snapshot && controller ? "Đã kết nối" : snapshot ? "Controller chưa kết nối" : stateError ? "Mất kết nối" : "Đang kết nối…";
    $("connection").className = "badge " + (snapshot && controller ? "good" : "warn");
    const errors = [stateError, controlError, accountError].filter(Boolean);
    $("notice").hidden = !errors.length;
    $("notice").textContent = [...new Set(errors)].join(" · ") + (errors.length ? " Bấm Làm mới để thử lại." : "");
    $("updated").textContent = lastRefresh ? "Đồng bộ lần cuối: " + lastRefresh.toLocaleTimeString("vi-VN") : "Đang đồng bộ…";
    $("streamStatus").textContent = streaming ? "Đang nhận dữ liệu trực tiếp" : "Đang kết nối lại luồng…";
    $("streamStatus").className = "badge " + (streaming ? "good" : "warn");
  }

  function renderBoard() {
    const currentRuns = autoRuns.filter((r) => r.workspace === active);
    const busy = currentRuns.some((r) => ["running", "reporting", "awaiting_approval", "attention"].includes(r.status));
    $("autoStart").disabled = !controller || !active || busy;
    const statuses = { running: "Đội đang làm việc", reporting: "Claude đang tổng hợp", awaiting_approval: "Chờ bạn duyệt báo cáo", approved: "Bạn đã duyệt", acknowledged: "Bạn đã nhận báo cáo lỗi", rejected: "Đã từ chối", attention: "Claude chưa gửi được báo cáo", stopped: "Đã dừng" };
    setMarkup("autoRuns", !controller ? '<p class="muted">Chưa kết nối được OS Controller.</p>' : currentRuns.length ? currentRuns.slice(0, 8).map((r) => `<article class="entry"><div class="entry-head"><strong>${esc(r.task)}</strong>${badge(statuses[r.status] || r.status, ["awaiting_approval", "attention"].includes(r.status) ? "warn" : r.status === "approved" ? "good" : "")}</div><p>${esc(r.steps.length)}/${esc(r.maxSteps)} lượt · ${esc(r.steps.at(-1)?.role || "Đang chuẩn bị")}</p>${r.problem ? `<p class="error">${esc(r.problem)}</p>` : ""}${r.report ? `<pre>${esc(r.report)}</pre>` : ""}<div class="actions">${["running", "reporting"].includes(r.status) ? `<button data-auto-stop="${esc(r.id)}">Dừng luồng này</button>` : ""}${["awaiting_approval", "attention"].includes(r.status) ? `<button class="primary" data-auto-approve="${esc(r.id)}">${r.status === "attention" ? "Đã xem lỗi" : r.problem ? "Đã nhận báo cáo" : "Duyệt báo cáo Claude"}</button><button data-auto-reject="${esc(r.id)}">Từ chối</button>` : ""}</div></article>`).join("") : '<p class="muted">Chưa có việc tự động nào cho dự án này. Giao một việc ở trên để bắt đầu.</p>');
    const unavailable = !controller ? `<p class="muted">${esc(controlError || "OS Controller chưa kết nối.")}</p>` : !active ? '<p class="muted">Chọn dự án để xem bàn giao.</p>' : null;
    setMarkup("handoffs", unavailable || (ownHandoffs().length ? ownHandoffs().map((h) => `<article class="entry"><strong class="mono">${esc(h.role)} → ${esc(h.next_owner || "Chưa xác định")}</strong><p>File: ${esc((h.payload?.files || []).join(", ") || "Không có file được khai báo")}</p><p class="mono">${esc(h.job_id)}</p>${h.problems.length ? `<p class="error">${h.problems.map(esc).join("; ")}</p>` : ""}<div class="actions"><button class="primary" data-approve="${esc(h.job_id)}" ${h.problems.length ? "disabled" : ""}>Duyệt chuyển lượt</button><button data-job="${esc(h.job_id)}">Xem nhật ký</button></div></article>`).join("") : '<p class="muted">Không có bàn giao chờ duyệt cho dự án này.</p>'));
    setMarkup("blockerList", blockerLines === null ? '<p class="muted">Chưa đọc được chốt chặn từ agent.md.</p>' : blockerLines.length ? blockerLines.map((l) => `<div class="entry error">${esc(l.replace(/^\s*-\s*/, ""))}</div>`).join("") : '<p class="muted">Sổ agent.md không có mục OPEN ở Vùng [5].</p>');
    setMarkup("jobs", unavailable || (ownJobs().length ? ownJobs().map((j) => `<div class="entry"><div class="entry-head"><strong class="mono">${esc(j.agent)}</strong>${badge(statusName(j.status), j.status === "running" ? "good" : j.status === "failed" ? "bad" : "")}</div><p class="mono">${esc(j.id)}</p><div class="actions"><button data-job="${esc(j.id)}">Xem nhật ký</button></div></div>`).join("") : '<p class="muted">Chưa có công việc nào do OS Controller chạy trong dự án này.</p>'));
    const logJob = $("logJob").value;
    setMarkup("logJob", '<option value="">Chọn công việc…</option>' + ownJobs().filter((j) => j.status !== "pending_approval" && j.status !== "rejected").map((j) => `<option value="${esc(j.id)}">${esc(j.agent)} · ${esc(statusName(j.status))} · ${esc(j.id)}</option>`).join(""));
    $("logJob").value = ownJobs().some((j) => j.id === logJob) ? logJob : "";
    $("meetingStatus").textContent = docText !== null ? "Biên bản data/HOI-CHAN-TONG-THE.md của dự án đã chọn." : docError || "Chưa có biên bản hội chẩn cho dự án này. Giao việc qua Hòm thư khi cần hội ý.";
    $("meetingDocument").hidden = docText === null;
    $("meetingDocument").textContent = docText || "";
  }

  function renderAccounts() {
    const defs = [["claude", "Claude Code · Sakura"], ["gpt", "GPT / Codex · Sasuke & Itachi"], ["gemini", "Antigravity · Hinata"]];
    setMarkup("accounts", defs.map(([key, name]) => {
      const a = accounts?.[key], known = a && typeof a.connected === "boolean";
      return `<div class="panel"><h2>${name}</h2><div class="account-status">${badge(!a ? "Chưa có dữ liệu" : !known ? "Chưa xác minh được" : a.connected ? "Đã kết nối" : "Chưa kết nối", known && a.connected ? "good" : "")}</div><p class="muted">${esc(!a ? accountError || "Đang đọc trạng thái…" : a.authMode || "Văn phòng chưa đọc được trạng thái đăng nhập bên trong IDE Antigravity.")}</p>${a && Number.isInteger(a.sessionsCount) ? `<p class="muted">${a.sessionsCount} tệp phiên được phát hiện.</p>` : ""}</div>`;
    }).join(""));
  }

  async function loadControl() {
    const list = await request("/ctl/workspaces");
    workspaces = list.workspaces;
    if (!workspaces.some((w) => w.path === active)) active = list.active || workspaces[0]?.path || "";
    const options = workspaces.length ? workspaces.map((w) => `<option value="${esc(w.path)}">${esc(w.name)}</option>`).join("") : '<option value="">Chưa đăng ký dự án</option>';
    setMarkup("workspace", options);
    $("workspace").value = active;
    $("workspace").disabled = switching || !workspaces.length;
    $("workspace").title = active;
    const target = active;
    const [health, jobResult, handoffResult, autoResult] = await Promise.all([request("/ctl/health"), request("/ctl/jobs"), request("/ctl/handoffs"), request("/ctl/autopilot")]);
    if (target !== active) return;
    controller = !!health.ok; jobs = jobResult.jobs; handoffs = handoffResult.handoffs; autoRuns = autoResult.runs;
    if (!active) { turn = null; blockerLines = null; return; }
    const q = encodeURIComponent(active);
    const [status, file, meeting] = await Promise.allSettled([request("/ctl/ai/status?workspace=" + q), request("/ctl/fs/read?workspace=" + q + "&path=agent.md"), request("/ctl/fs/read?workspace=" + q + "&path=data%2FHOI-CHAN-TONG-THE.md")]);
    if (target !== active) return;
    turn = status.status === "fulfilled" ? status.value.turn : null;
    controlError = status.status === "rejected" ? status.reason.message : status.value.problem || "";
    blockerLines = null;
    if (file.status === "fulfilled") {
      const section = file.value.content.match(/^##\s+\[5\][^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m);
      if (section) blockerLines = section[1].split(/\r?\n/).filter((line) => /^\s*-\s*\[ \]\s+OPEN\b/.test(line));
    }
    docText = meeting.status === "fulfilled" ? meeting.value.content : null;
    docError = meeting.status === "rejected" && !/Không có|không tồn tại|NOT_FOUND/.test(meeting.reason.message) ? meeting.reason.message : "";
  }

  async function refresh() {
    if (loading || switching) return;
    loading = true; $("refresh").disabled = true;
    await Promise.all([
      request("/state").then((value) => { snapshot = value; stateError = ""; }).catch((e) => { snapshot = null; stateError = "Không đọc được văn phòng: " + e.message; }),
      loadControl().catch((e) => { controller = false; turn = null; blockerLines = null; jobs = []; handoffs = []; autoRuns = []; docText = null; docError = "Không đọc được biên bản khi Controller mất kết nối."; controlError = "Không đọc được điều phối: " + e.message; }),
      request("/api/accounts").then((value) => { accounts = value.accounts; accountError = ""; }).catch((e) => { accounts = null; accountError = "Không đọc được tài khoản: " + e.message; }),
    ]);
    loading = false; $("refresh").disabled = false; lastRefresh = new Date();
    renderProtocol(); renderOffice(); renderBoard(); renderAccounts();
    if (view === "transcript" && $("logJob").value) readLog();
  }

  async function readLog() {
    const job = $("logJob").value, seq = ++logSequence;
    if (!job) { $("jobLog").textContent = "Chọn công việc để đọc nhật ký."; return; }
    try {
      const r = await fetch("/ctl/jobs/" + encodeURIComponent(job) + "/log?from=0", { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("Không đọc được nhật ký (HTTP " + r.status + ").");
      const text = await r.text();
      if (seq === logSequence) $("jobLog").textContent = text || "Chưa có dòng nhật ký nào.";
    } catch (e) { if (seq === logSequence) $("jobLog").textContent = e.message; }
  }

  document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });
  $("rooms").addEventListener("click", (e) => { const b = e.target.closest("[data-detail]"); if (b) { selected = b.dataset.detail; renderOffice(); if (matchMedia("(max-width:800px)").matches) $("detail").scrollIntoView({ block: "nearest" }); } });
  $("refresh").onclick = refresh;
  $("autoForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!active || !controller) return;
    $("autoStart").disabled = true; $("autoMessage").textContent = "Đang giao việc…";
    try { await request("/ctl/autopilot", { workspace: active, task: $("autoTask").value }); $("autoTask").value = ""; $("autoMessage").textContent = "Đã bắt đầu. Claude sẽ báo cáo tại đây khi xong."; }
    catch (err) { $("autoMessage").textContent = err.message; }
    finally { await refresh(); }
  };
  $("autoRuns").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-auto-stop],[data-auto-approve],[data-auto-reject]"); if (!b) return;
    const action = b.dataset.autoStop ? "stop" : b.dataset.autoApprove ? "approve" : "reject";
    const id = b.dataset.autoStop || b.dataset.autoApprove || b.dataset.autoReject;
    b.disabled = true;
    try { const result = await request("/ctl/autopilot/" + encodeURIComponent(id) + "/" + action, {}); $("autoMessage").textContent = action === "approve" ? result.run.status === "acknowledged" ? "Đã ghi nhận bạn xem lỗi. Công việc chưa được đánh dấu hoàn tất." : "Đã ghi nhận duyệt báo cáo. Không merge hoặc phát hành." : action === "stop" ? "Đã dừng luồng." : "Đã từ chối báo cáo."; }
    catch (err) { $("autoMessage").textContent = err.message; }
    finally { await refresh(); b.disabled = false; }
  });
  $("handoffButton").onclick = () => { setView("board"); $("boardTitle").tabIndex = -1; $("boardTitle").focus(); };
  $("workspace").onchange = async () => {
    const path = $("workspace").value, old = active;
    if (switching) return;
    switching = true; $("workspace").disabled = true;
    try { await request("/ctl/workspaces/switch", { path }); active = path; turn = null; blockerLines = null; docText = null; $("logJob").value = ""; $("jobLog").textContent = "Chọn công việc để đọc nhật ký."; }
    catch (e) { active = old; controlError = e.message; renderProtocol(); }
    finally { switching = false; $("workspace").disabled = false; await refresh(); }
  };
  document.addEventListener("click", (e) => {
    const approve = e.target.closest("[data-approve]"), log = e.target.closest("[data-job]");
    if (log) { setView("transcript"); $("logJob").value = log.dataset.job; readLog(); }
    if (!approve) return;
    const h = ownHandoffs().find((x) => x.job_id === approve.dataset.approve);
    if (!h || h.problems.length) return;
    pendingApproval = h;
    $("approveSummary").innerHTML = `<p class="mono">${esc(h.role)} → ${esc(h.next_owner)}</p><p class="muted">Dự án: ${esc(h.workspace)}</p><p>File: ${esc((h.payload?.files || []).join(", ") || "Không có file được khai báo")}</p>`;
    $("approveError").textContent = ""; $("confirmApproval").disabled = false; $("approveDialog").showModal();
  });
  $("approveDialog").addEventListener("close", () => { pendingApproval = null; });
  $("confirmApproval").onclick = async () => {
    if (!pendingApproval) return;
    $("confirmApproval").disabled = true;
    try { await request("/ctl/handoffs/" + encodeURIComponent(pendingApproval.job_id) + "/approve", {}); $("approveDialog").close(); await refresh(); }
    catch (e) { $("approveError").textContent = e.message; $("confirmApproval").disabled = false; }
  };
  $("logJob").onchange = readLog;
  setView(location.hash.slice(1));
  renderOffice(); refresh();
  let timer = null;
  function startLive() {
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, 5000);
    if (!("EventSource" in window) || (source && source.readyState !== EventSource.CLOSED)) return;
    source = new EventSource("/events");
    source.onopen = () => { streaming = true; renderProtocol(); };
    source.onmessage = (e) => { try { snapshot = JSON.parse(e.data); stateError = ""; streaming = true; lastRefresh = new Date(); renderOffice(); renderProtocol(); } catch { streaming = false; renderProtocol(); } };
    source.onerror = () => { streaming = false; renderProtocol(); };
  }
  startLive();
  window.addEventListener("pageshow", (e) => { if (e.persisted) { refresh(); startLive(); } });
  window.addEventListener("pagehide", () => { clearInterval(timer); if (source) source.close(); });
})();
