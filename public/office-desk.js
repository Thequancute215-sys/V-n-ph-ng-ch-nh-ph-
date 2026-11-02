import "./progress-view.js";

const { esc, statuses } = globalThis.RepoProgress;
const $ = (id) => document.getElementById(id);
const live = new Set(["running", "reporting", "awaiting_answer", "awaiting_approval", "attention", "waiting_quota"]);
const roomOf = (role = "") => role === "SPEC_ARCHITECT" || role.startsWith("AGY_") ? "hinata" : role.startsWith("SOL_") ? "itachi" : role.startsWith("CODEX_") ? "sasuke" : role.startsWith("CLAUDE_") ? "sakura" : null;
const time = (v) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toLocaleString("vi-VN") : "Chưa có giờ xác nhận";
const first = (text) => String(text || "").split(/\r?\n/)[0];
const pendingRun = (r) => ["awaiting_answer", "awaiting_approval", "attention", "waiting_quota"].includes(r.status) || (["approved", "acknowledged"].includes(r.status) && r.git && !r.git.pushed);
const safeCompare = (value) => { try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "github.com" && !u.username && !u.password ? u.href : null; } catch { return null; } };

async function request(path, body, timeout = 15000) {
  let response;
  try { response = await fetch("/ctl" + path, { cache: "no-store", method: body === undefined ? "GET" : "POST", signal: AbortSignal.timeout(timeout),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }); }
  catch (e) { throw new Error("Không kết nối được Controller hoặc yêu cầu quá thời gian. Kiểm tra Controller đang chạy. " + e.message); }
  let data;
  try { data = await response.json(); } catch { throw new Error("Controller chưa trả JSON hợp lệ. Kiểm tra Controller và phiên đăng nhập văn phòng."); }
  if (!response.ok || data.ok === false) throw Object.assign(new Error((data.code === "CTL_OFFLINE" ? "Controller chưa chạy. " : "") + (data.error || "Lỗi HTTP " + response.status)), { code: data.code });
  return data;
}

export function createDesk(getOffice) {
  const names = { tasks: "Việc đang làm", approvals: "Việc chờ anh duyệt", assign: "Giao việc cho cả đội", ideas: "Ý tưởng", projects: "Dự án", quotas: "Hạn mức", progress: "Dự án đang ở đâu" };
  const toolbar = document.createElement("nav"); toolbar.className = "desk-tools"; toolbar.setAttribute("aria-label", "Điều phối dự án");
  toolbar.innerHTML = ["tasks", "assign", "ideas", "projects", "quotas", "progress"].map((key) => `<button type="button" class="btn ghost" data-desk="${key}" aria-controls="officeDesk" aria-expanded="false">${names[key]}</button>`).join("");
  document.querySelector(".bar").append(toolbar);
  const dialog = document.createElement("dialog"); dialog.id = "officeDesk"; dialog.className = "desk-dialog"; dialog.setAttribute("aria-labelledby", "deskTitle");
  dialog.innerHTML = `<div class="desk-head"><h2 id="deskTitle">Dự án đang ở đâu</h2><button type="button" id="deskClose">Thu gọn / Đóng</button></div><div class="desk-body">
    <p id="deskWorkspace" class="muted"></p><p id="deskMessage" class="desk-message" role="status"></p>
    <section data-view="tasks"><div id="deskTasks" aria-live="polite">Đang tải việc…</div></section>
    <section data-view="approvals" hidden><div id="deskApprovals">Đang tải việc chờ duyệt…</div></section>
    <section data-view="assign" hidden><form id="deskAssign"><label for="deskTask">Việc anh muốn cả đội thực hiện</label><textarea id="deskTask" required maxlength="3000" rows="5"></textarea><p>Đội sẽ sửa file, kiểm thử và commit cục bộ trong dự án đang chọn.</p><button type="submit" data-write>Giao cho cả đội</button></form><p id="deskAssignState"></p></section>
    <section data-view="ideas" hidden><form id="deskIdea"><label for="deskIdeaTitle">Tên ý tưởng</label><input id="deskIdeaTitle" required maxlength="200"><label for="deskIdeaDetail">Mô tả ý tưởng</label><textarea id="deskIdeaDetail" maxlength="2400" rows="3"></textarea><div class="desk-actions"><button type="submit" data-write>Lưu ý tưởng</button></div></form><div id="deskIdeas">Đang tải ý tưởng…</div></section>
    <section data-view="projects" hidden><label for="deskProject">Dự án đã đăng ký</label><select id="deskProject"><option value="">Đang tải…</option></select><div class="desk-actions"><button id="deskSwitch" data-write>Chọn dự án</button><button id="deskGithubLoad">Tải repo GitHub</button></div><p id="deskGithubState" role="status">Bấm tải repo GitHub để đọc danh sách.</p><div id="deskGithub"></div><button id="deskGithubMore" hidden>Tải thêm repo</button></section>
    <section data-view="quotas" hidden><div id="deskQuotas">Đang tải hạn mức…</div></section>
    <section data-view="progress" hidden><div id="deskProgress">Đang đọc tiến độ dự án…</div></section>
    <div class="desk-actions"><button type="button" id="deskRefresh">Làm mới</button><button type="button" data-desk="approvals">Việc chờ anh duyệt</button></div></div>`;
  document.body.append(dialog);
  let active = null, workspaces = [], view = "progress", inFlight = null, mutating = false, firstLoad = true;
  let runs = [], jobs = [], handoffs = [], ideas = [], quotas = null, overview = null, turn = null;
  let errors = {}, dataReady = false, liveNpc = new Set(), github = [], githubPage = 0, githubMore = false, githubLoading = false, githubLoaded = false, githubError = "", compareUrl = null;
  const own = (items) => items.filter((x) => active && x.workspace === active);
  const ownRuns = () => own(runs);
  const ownJobs = () => own(jobs).filter((j) => j.kind === "ai" && j.status === "running");
  // Bàn giao của luồng tự động phải quyết định qua autopilot, không duyệt tay lần hai.
  const ownHandoffs = () => {
    const automatic = new Set(ownRuns().filter((r) => live.has(r.status)).flatMap((r) => [r.jobId, r.finalHandoffId, r.question?.jobId, ...(r.steps || []).map((s) => s.jobId)]));
    return own(handoffs).filter((h) => !h.decided && !automatic.has(h.job_id));
  };
  const state = (key, empty) => errors.workspace || errors[key] || (!dataReady ? "Đang tải…" : !active ? "Chưa chọn dự án. Mở Dự án để chọn repo." : empty);
  const notice = (text, error = false) => { $("deskMessage").textContent = text; $("deskMessage").className = "desk-message" + (error ? " error" : ""); };
  const messageHtml = (key, empty) => `<p class="${errors.workspace || errors[key] ? "error" : "muted"}">${esc(state(key, empty))}</p>`;
  function show(key) {
    if (!names[key]) return;
    view = key; $("deskTitle").textContent = names[key];
    dialog.querySelectorAll("[data-view]").forEach((el) => { el.hidden = el.dataset.view !== key; });
    toolbar.querySelectorAll("[data-desk]").forEach((el) => el.setAttribute("aria-expanded", String(el.dataset.desk === key)));
    if (!dialog.open) dialog.showModal();
  }
  function lock() {
    dialog.querySelectorAll("[data-write], [data-action]").forEach((b) => { b.disabled = mutating || !active || !!errors.workspace || b.dataset.invalid === "true"; });
    $("deskProject").disabled = mutating || !workspaces.length || !!errors.workspace;
    $("deskGithubLoad").disabled = githubLoading || mutating;
    $("deskGithubMore").disabled = githubLoading || mutating;
    dialog.querySelectorAll("[data-repo]").forEach((b) => { b.disabled = githubLoading || mutating; });
    dialog.setAttribute("aria-busy", String(mutating));
  }
  function action(kind, id, verb, label, option, invalid = false) {
    return `<button type="button" data-action="${esc(verb)}" data-kind="${esc(kind)}" data-id="${esc(id)}"${option === undefined ? "" : ` data-option="${esc(option)}"`} data-invalid="${invalid}">${esc(label)}</button>`;
  }
  const question = (q, kind, id) => q ? `<p>${esc(q.question)}</p><div class="desk-actions">${(q.options || []).map((o) => action(kind, id, "answer", o.id + " · " + o.label + (o.next_owner ? " → " + o.next_owner : ""), o.id)).join("")}</div>` : '<p class="error">Chưa có nội dung câu hỏi. Bấm Làm mới để đọc lại.</p>';
  function renderTasks() {
    const current = ownRuns().filter((r) => live.has(r.status)), busy = ownJobs(), linked = new Set();
    const task = (r, j) => {
      if (j) linked.add(j.id);
      const step = j ? (r?.steps || []).find((s) => s.jobId === j.id) : r?.steps?.at(-1);
      const role = j?.agent || r?.wait?.role || (["awaiting_answer", "awaiting_approval", "reporting"].includes(r?.status) ? "CLAUDE_AUDITOR" : step?.role || "");
      const npc = roomOf(role), model = [step?.role === role ? step.model : j?.model, step?.role === role ? step.effort : j?.effort].filter(Boolean).join(" · ");
      return `<button type="button" class="desk-entry desk-task" data-room="${esc(npc || "")}" ${npc ? "" : "disabled"}><strong>${esc(first(r?.task || j?.task || "Lượt " + role))}</strong><p>${esc(statuses[r?.status] || "Đang chạy")} · ${esc(role || "Đang chuẩn bị lượt")}${model ? " · " + esc(model) : ""}<br>${j ? esc(Math.floor((j.runningS || 0) / 60)) + " phút đang chạy" : "Chưa có job đang chạy"}${r ? ` · Lượt ${(r.steps || []).filter((s) => !s.quota).length}/${esc(r.maxSteps)}` : ""}${r?.git?.branch ? "<br>Nhánh: " + esc(r.git.branch) : ""}</p></button>`;
    };
    const runHtml = current.map((r) => task(r, busy.find((j) => r.jobId === j.id))).join("");
    const extra = busy.filter((j) => !linked.has(j.id));
    const html = runHtml + extra.map((j) => task(ownRuns().find((r) => r.web?.jobId === j.id), j)).join("");
    $("deskTasks").innerHTML = errors.workspace || !active || !dataReady ? messageHtml("runs", "") :
      (errors.runs ? messageHtml("runs", "") : "") + (errors.jobs ? messageHtml("jobs", "") : "") + (html || (!errors.runs && !errors.jobs ? messageHtml("runs", "Không có việc đang làm cho dự án này.") : ""));
    const count = current.length + extra.length;
    toolbar.querySelector('[data-desk="tasks"]').textContent = "Việc đang làm" + (dataReady && !errors.runs && !errors.jobs ? ` (${count})` : "");
  }
  function renderApprovals() {
    const waiting = ownRuns().filter(pendingRun), manual = ownHandoffs();
    let html = waiting.map((r) => {
      let body = r.problem ? `<p class="error">${esc(r.problem)}</p>` : "";
      if (r.status === "awaiting_answer") body += question(r.question, "autopilot", r.id);
      if (r.status === "awaiting_approval") body += `<pre class="desk-report" tabindex="0">${esc(r.report || "Chưa có nội dung báo cáo.")}</pre><div class="desk-actions">${action("autopilot", r.id, "approve", "Duyệt báo cáo")}${action("autopilot", r.id, "reject", "Từ chối")}</div>`;
      if (r.status === "attention") body += action("autopilot", r.id, "approve", "Đã xem lỗi");
      if (r.status === "waiting_quota") body += `<p>${esc(r.wait?.providerName || r.wait?.role || "AI")} hết hạn mức. Tự chạy lại: ${esc(time(r.wait?.until))}</p><div class="desk-actions">${action("autopilot", r.id, "resume", "Chạy lại ngay")}<a href="prototype.html#board">Dán kết quả GPT web</a></div>`;
      if (["approved", "acknowledged"].includes(r.status)) body += `<p>Nhánh: ${esc(r.git.branch)}</p>` + action("autopilot", r.id, "push", "Đẩy nhánh lên GitHub & mở PR");
      return `<article class="desk-entry"><strong>${esc(first(r.task))}</strong><p>${esc(statuses[r.status])}</p>${body}</article>`;
    }).join("");
    html += manual.map((h) => `<article class="desk-entry"><strong>Bàn giao: ${esc(h.role)} → ${esc(h.next_owner || "Chờ phương án")}</strong>${h.problems?.length ? `<p class="error">${esc(h.problems.join("; "))}</p>` : ""}${h.payload?.ask_ceo ? question(h.payload.ask_ceo, "handoffs", h.job_id) : action("handoffs", h.job_id, "approve", "Duyệt chuyển lượt", undefined, !!h.problems?.length)}</article>`).join("");
    if (compareUrl) html += `<p><a href="${esc(compareUrl)}" target="_blank" rel="noopener noreferrer">Mở trang tạo PR trên GitHub</a></p>`;
    $("deskApprovals").innerHTML = errors.workspace || !active || !dataReady ? messageHtml("runs", "") :
      (errors.runs ? messageHtml("runs", "") : "") + (errors.handoffs ? messageHtml("handoffs", "") : "") + (html || (!errors.runs && !errors.handoffs ? messageHtml("runs", "Không có việc chờ anh duyệt.") : ""));
    const count = waiting.length + manual.length, unknown = !!(errors.workspace || errors.runs || errors.handoffs);
    $("ceoWaitPill").hidden = !count && !unknown;
    $("ceoWaitTxt").textContent = unknown ? "Chưa đọc được việc chờ" : count + " việc chờ anh";
    document.title = (count ? `(${count}) ` : "") + "Văn phòng AI";
  }
  function renderIdeas() {
    $("deskIdeas").innerHTML = errors.workspace || errors.ideas || !active || !dataReady ? messageHtml("ideas", "") : ideas.length ? ideas.map((i) => `<article class="desk-entry"><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p><p>${esc(i.run ? statuses[i.run.status] || i.run.status : "Chưa giao")}</p>${action("ideas", i.id, "start", "Giao Hinata đặc tả", undefined, !!i.run && live.has(i.run.status))}</article>`).join("") : messageHtml("ideas", "Dự án chưa có ý tưởng nào.");
  }
  function renderQuotas() {
    $("deskQuotas").innerHTML = errors.quotas ? `<p class="error">${esc(errors.quotas)}</p>` : !quotas ? '<p>Đang tải hạn mức…</p>' : !quotas.providers?.length ? '<p>Chưa có dữ liệu hạn mức từ các AI.</p>' : quotas.providers.map((p) => {
      const stale = p.status !== "ready" || (p.lastSuccessAt && Date.now() - new Date(p.lastSuccessAt).getTime() > 3 * (quotas.intervalMs || 120000));
      return `<article class="desk-entry"><strong>${esc(p.name)}</strong>${p.refreshing ? "<p>Đang cập nhật hạn mức…</p>" : ""}${p.error ? `<p class="error">${esc(p.error)}</p>` : ""}${stale ? "<p>Bản đọc chưa được xác nhận; chưa thể kết luận AI còn lượt.</p>" : ""}${(p.buckets || []).map((b) => `<p>${esc([b.group, b.label].filter(Boolean).join(" · "))}: ${Number.isFinite(b.remainingPercent) ? "còn " + esc(b.remainingPercent) + "%" : "Chưa có số liệu"}<br>Mở lại: ${esc(b.resetAt ? time(b.resetAt) : b.resetLabel || "Chưa rõ")}${b.resetAt && new Date(b.resetAt).getTime() <= Date.now() ? " · Đã qua mốc, chờ số liệu mới" : ""}</p>`).join("") || "<p>Chưa có số liệu hạn mức.</p>"}</article>`;
    }).join("");
    const p = quotas?.providers?.find((x) => x.id === "claude"), buckets = !errors.quotas && p?.status === "ready" && (!p.lastSuccessAt || Date.now() - new Date(p.lastSuccessAt).getTime() <= 3 * (quotas.intervalMs || 120000)) ? (p.buckets || []).filter((b) => Number.isFinite(b.remainingPercent) && (!b.resetAt || new Date(b.resetAt).getTime() > Date.now())) : [];
    const left = buckets.length ? Math.min(...buckets.map((b) => b.remainingPercent)) : null;
    $("claudeLowPill").hidden = left === null || left > 8;
    if (left !== null && left <= 8) $("claudeLowTxt").textContent = `Claude còn ${Math.round(left)}% hạn mức: dành cho điều phối`;
  }
  function renderProgress() {
    $("deskProgress").innerHTML = errors.workspace || errors.overview || !overview || overview.workspace !== active ? messageHtml("overview", active ? "Đang đọc tiến độ dự án…" : "Chưa chọn dự án.") : globalThis.RepoProgress.html(overview, runs, ownHandoffs(), errors);
  }
  function render() {
    $("deskWorkspace").textContent = errors.workspace || (active ? "Dự án: " + (workspaces.find((w) => w.path === active)?.name || active) : dataReady ? "Chưa chọn dự án." : "Đang đọc dự án…");
    const selection = $("deskProject").value;
    $("deskProject").innerHTML = workspaces.length ? workspaces.map((w) => `<option value="${esc(w.path)}">${esc(w.name)}${w.path === active ? " · Đang chọn" : ""}</option>`).join("") : '<option value="">Chưa có dự án đã đăng ký</option>';
    $("deskProject").value = workspaces.some((w) => w.path === selection) ? selection : active || "";
    $("deskAssignState").textContent = state("runs", ownRuns().some((r) => live.has(r.status)) ? "Dự án đang có luồng hoặc việc chờ xử lý. Xem Việc đang làm." : "Dự án chưa có luồng đang chạy; anh có thể giao việc mới.");
    renderTasks(); renderApprovals(); renderIdeas(); renderQuotas(); renderProgress(); lock();
  }
  function syncWork() {
    const office = getOffice(); if (!office) return;
    const next = new Map();
    for (const j of ownJobs()) {
      const npc = roomOf(j.agent); if (!npc) continue;
      const r = ownRuns().find((r) => r.jobId === j.id || r.web?.jobId === j.id), s = r?.steps?.find((s) => s.jobId === j.id);
      next.set(npc, { busy: true, color: 0x22c55e, tag: `Đang làm · ${Math.floor((j.runningS || 0) / 60)} phút${s?.model ? " · " + s.model + " " + (s.effort || "") : ""}`, text: first(r?.task || "Lượt " + j.agent).slice(0, 100) });
    }
    for (const r of ownRuns().filter(pendingRun)) {
      const npc = r.status === "waiting_quota" ? roomOf(r.wait?.role) : r.status === "attention" ? "pain" : "sakura";
      if (npc && !next.has(npc)) next.set(npc, { busy: false, color: 0xecc970, tag: statuses[r.status], text: r.status === "waiting_quota" ? "Tự chạy lại: " + time(r.wait?.until) : "Bấm 🔔 để xem và duyệt ngay tại văn phòng" });
    }
    for (const npc of liveNpc) if (!next.has(npc)) { office.say(npc, {}); office.setBusy(npc, false); }
    for (const [npc, data] of next) { office.say(npc, data); office.setBusy(npc, data.busy); }
    liveNpc = new Set(next.keys());
    for (const npc of office.npcIds) office.setLine(npc, "");
    if (errors.workspace) office.setLine("pain", errors.workspace);
    else if (turn?.turn) {
      const t = turn.turn, npc = roomOf(t.nextOwner);
      if (npc) office.setLine(npc, `Đang giữ lượt: ${t.nextOwner} (${t.phase || "Chưa rõ Phase"}).`);
      office.setLine("pain", `Dự án ${workspaces.find((w) => w.path === active)?.name || active}: lượt ${t.nextOwner}.`);
    } else office.setLine("pain", state("turn", turn?.problem || "Chưa đọc được lượt từ agent.md."));
  }
  // Cả nhịp 10 giây dùng một Promise; không chồng yêu cầu khi mạng chậm.
  function syncTurn() {
    if (inFlight) return inFlight;
    if (mutating) return Promise.resolve();
    inFlight = (async () => {
      try {
        const w = await request("/workspaces"); errors.workspace = "";
        const changed = active !== w.active;
        active = w.active; workspaces = w.workspaces || [];
        if (changed) { overview = null; runs = []; jobs = []; handoffs = []; ideas = []; turn = null; compareUrl = null; errors = {}; $("deskProject").value = ""; }
        // Tự mở "Dự án đang ở đâu" khi đổi dự án; lần đầu tải trang thì chỉ một lần mỗi phiên trình duyệt (hộp thoại chặn cảnh 3D).
        if (changed && !firstLoad) show("progress");
        else if (firstLoad) { let seen = false; try { seen = sessionStorage.getItem("vp-progress-seen") === active; sessionStorage.setItem("vp-progress-seen", active || ""); } catch {} if (!seen && active) show("progress"); }
        firstLoad = false;
        const reads = [
          ["runs", "/autopilot", (d) => { runs = d.runs || []; }],
          ["jobs", "/jobs?status=running", (d) => { jobs = d.jobs || []; }],
          ["handoffs", "/handoffs", (d) => { handoffs = d.handoffs || []; }],
          ["quotas", "/quotas", (d) => { quotas = d; }],
          ...(active ? [["turn", "/ai/status?workspace=" + encodeURIComponent(active), (d) => { turn = d; }],
            ["ideas", "/ideas?workspace=" + encodeURIComponent(active), (d) => { ideas = d.ideas || []; }],
            ...(!overview || (dialog.open && view === "progress") ? [["overview", "/workspaces/overview?workspace=" + encodeURIComponent(active), (d) => { overview = d.overview; }]] : [])] : []),
        ];
        render();
        const results = await Promise.allSettled(reads.map(([, url]) => request(url, undefined, url.includes("overview") ? 35000 : 15000)));
        results.forEach((result, i) => { const [key, , accept] = reads[i]; if (result.status === "fulfilled") { accept(result.value); errors[key] = ""; } else { errors[key] = result.reason.message; accept({}); } });
        dataReady = true;
      } catch (e) { errors.workspace = e.message; errors.quotas = e.message; dataReady = true; runs = []; jobs = []; handoffs = []; ideas = []; overview = null; turn = null; quotas = null; }
      finally { render(); syncWork(); }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  async function refreshNow() { if (inFlight) await inFlight; overview = null; await syncTurn(); }
  async function mutate(label, fn) {
    if (mutating || !confirm(label + "?")) return;
    mutating = true; lock(); notice("Đang xử lý…");
    try { if (inFlight) await inFlight; await fn(); notice("Đã xử lý xong."); }
    catch (e) { notice((e.code ? e.code + ": " : "") + e.message, true); }
    finally { mutating = false; await refreshNow(); lock(); }
  }
  function renderGithub() {
    $("deskGithub").innerHTML = github.map((r) => `<article class="desk-entry"><strong>${esc(r.fullName)}</strong><p>${esc(r.description || "")}</p><p>${r.private ? "Riêng tư" : "Công khai"} · Nhánh ${esc(r.defaultBranch || "Chưa có")}</p><button data-repo="${esc(r.fullName)}">Mở repo</button></article>`).join("");
    $("deskGithubState").textContent = githubError || (githubLoading ? "Đang tải repo GitHub…" : githubLoaded ? `${github.length} repo đã tải` + (!github.length ? ". Không có repo trong danh sách." : "") : "Bấm tải repo GitHub để đọc danh sách.");
    $("deskGithubMore").hidden = !githubMore; lock();
  }
  async function loadGithub(more = false) {
    if (githubLoading || mutating) return;
    githubLoading = true; githubError = ""; renderGithub();
    try { const d = await request("/github/repos?page=" + (more ? githubPage + 1 : 1), undefined, 35000); github = [...new Map([...(more ? github : []), ...d.repositories].map((r) => [r.fullName, r])).values()]; githubPage = d.page; githubMore = d.hasMore; githubLoaded = true; }
    catch (e) { githubError = e.message; }
    finally { githubLoading = false; renderGithub(); }
  }
  async function openGithub(fullName) {
    await mutate("Mở repo " + fullName + " làm dự án đang chọn", async () => {
      let { operation } = await request("/github/open", { fullName });
      while (operation.status === "running") {
        notice(operation.message || "Đang mở repo…");
        await new Promise((resolve) => setTimeout(resolve, 800));
        ({ operation } = await request("/github/operations/" + encodeURIComponent(operation.id)));
      }
      if (operation.status !== "done") throw new Error(operation.message || "Không mở được repo.");
      overview = null; show("progress");
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-desk]"); if (b) { show(b.dataset.desk); syncTurn(); }
  });
  $("ceoWaitPill").addEventListener("click", (e) => { e.preventDefault(); show("approvals"); syncTurn(); });
  $("deskClose").onclick = () => dialog.close();
  dialog.addEventListener("close", () => toolbar.querySelectorAll("[data-desk]").forEach((b) => b.setAttribute("aria-expanded", "false")));
  $("deskRefresh").onclick = () => refreshNow();
  $("deskGithubLoad").onclick = () => loadGithub(); $("deskGithubMore").onclick = () => loadGithub(true);
  $("deskSwitch").onclick = () => { const path = $("deskProject").value; if (path) mutate("Chuyển sang dự án " + path, async () => { await request("/workspaces/switch", { path }); overview = null; show("progress"); }); };
  $("deskAssign").onsubmit = (e) => {
    e.preventDefault(); const workspace = active, task = $("deskTask").value.trim();
    if (task && workspace) mutate("Giao việc cho cả đội trong " + workspace, async () => { await request("/autopilot", { workspace, task }); $("deskAssign").reset(); show("tasks"); });
  };
  $("deskIdea").onsubmit = (e) => {
    e.preventDefault(); const workspace = active, title = $("deskIdeaTitle").value.trim(), detail = $("deskIdeaDetail").value.trim();
    if (title && workspace) mutate("Lưu ý tưởng vào " + workspace, async () => { await request("/ideas", { workspace, title, detail }); $("deskIdea").reset(); });
  };
  dialog.addEventListener("click", (e) => {
    const room = e.target.closest("[data-room]"); if (room?.dataset.room) { getOffice()?.goToRoom(room.dataset.room); dialog.close(); return; }
    const repo = e.target.closest("[data-repo]"); if (repo && !mutating) { openGithub(repo.dataset.repo); return; }
    const b = e.target.closest("[data-action]"); if (!b || b.disabled) return;
    const { kind, id, action: verb, option } = b.dataset;
    const label = verb === "push" ? b.textContent + " (chỉ đẩy nhánh của luồng, không merge)" : b.textContent;
    mutate(label, async () => {
      const url = "/" + kind + "/" + encodeURIComponent(id) + "/" + verb;
      let data;
      try { data = await request(url, option === undefined ? {} : { option }, verb === "push" ? 130000 : 30000); }
      catch (err) { if (kind !== "ideas" || err.code !== "NEEDS_SPEC_TURN") throw err;
        if (!confirm(err.message + "\nXác nhận ghi đè chuyển lượt cho Hinata?")) throw new Error("Chưa giao ý tưởng vì anh chưa đồng ý chuyển lượt.");
        data = await request(url, { force: true }, 30000);
      }
      if (verb === "push") {
        const url = safeCompare(data.run?.git?.pushed?.compareUrl);
        if (url) { compareUrl = url; window.open(url, "_blank", "noopener,noreferrer"); }
      }
    });
  });
  render();
  return { syncTurn };
}
