"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safeHttps = (v) => { try { const u = new URL(String(v || "")); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } };
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
  // Kết quả đọc repo đang chọn (ctl /workspaces/overview): chỉ đọc lại khi đổi dự án hoặc bấm Làm mới.
  let ideaList = null, ideaError = "";
  let scanInfo = null, scanError = "";   // rà soát file .md / thư viện của dự án đang chọn (ctl /scan)
  let diffView = null;          // diff đang mở: { run, step, loading, error, data }
  const webDrafts = {};         // chữ đang dán vào ô kết quả GPT web, theo luồng   // ý tưởng của dự án đang chọn (ctl /ideas)
  let repoInfo = null, repoFor = "", repoError = "", repoLoading = false, createdFor = "";
  let loading = false, switching = false, controlError = "", stateError = "", accountError = "", source = null, streaming = false;
  let docText = null, docError = "", signatures = {}, lastRefresh = null, logSequence = 0;
  let githubRepos = [], githubPage = 0, githubHasMore = false, githubLoading = false, githubOpening = false;
  let quotaData = null, quotaError = "";
  let projects = null, projectsError = "";
  const setMarkup = (id, html) => { if (signatures[id] !== html) { $(id).innerHTML = html; signatures[id] = html; } };
  const badge = (text, kind = "") => `<span class="badge ${kind}">${esc(text)}</span>`;
  const avatar = (r) => `<div class="avatar-wrap" aria-hidden="true"><div class="chibi" style="--accent:${r.color}"><span>${r.symbol}</span></div></div>`;
  const statusName = (s) => ({ running: "Đang chạy", done: "Hoàn tất", failed: "Thất bại", killed: "Đã dừng", timeout: "Quá thời gian", pending_approval: "Chờ duyệt", rejected: "Đã từ chối", active: "Có hoạt động", idle: "Đang nghỉ", away: "Chưa có hoạt động gần đây" })[s] || s;
  const ownJobs = () => jobs.filter((j) => j.workspace === active);
  const ownHandoffs = () => handoffs.filter((h) => h.workspace === active);
  const isOwner = (r) => !!turn && [r.role, ...(r.aliases || [])].includes(turn.nextOwner);

  async function request(path, body, timeout = 8000) {
    const res = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(timeout), ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (res.status === 401 && !res.headers.get("content-type")?.includes("application/json")) throw new Error("Phiên xem đã hết hạn. Mở lại văn phòng để đăng nhập.");
    const data = await res.json();
    if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || "Không đọc được dữ liệu (HTTP " + res.status + ")."), { code: data.code });
    return data;
  }

  function renderGitHub() {
    const query = $("githubSearch").value.trim().toLocaleLowerCase();
    const shown = githubRepos.filter((r) => (r.fullName + " " + r.description).toLocaleLowerCase().includes(query));
    $("githubCount").textContent = shown.length + "/" + githubRepos.length + " repo";
    $("githubRefresh").disabled = githubLoading || githubOpening;
    $("githubMore").hidden = !githubHasMore;
    $("githubMore").disabled = githubLoading || githubOpening;
    $("githubRepos").setAttribute("aria-busy", String(githubLoading || githubOpening));
    setMarkup("githubRepos", githubLoading && !githubRepos.length ? '<p class="skeleton">Đang tải repo từ GitHub…</p>' : shown.length ? shown.map((r) => `<article class="entry repo"><div><strong class="mono">${esc(r.fullName)}</strong><p>${badge(r.private ? "Riêng tư" : "Công khai")}${r.archived ? " " + badge("Lưu trữ") : ""} · Nhánh ${esc(r.defaultBranch || "chưa có")}</p>${r.description ? `<p>${esc(r.description)}</p>` : ""}</div><button class="primary" data-github-open="${esc(r.fullName)}" ${githubOpening || githubLoading ? "disabled" : ""}>Mở repo</button></article>`).join("") : `<p class="muted">${query ? "Không có repo khớp tìm kiếm trong danh sách đã tải." : "Chưa có repo để hiển thị."}</p>`);
  }
  async function loadGitHub(more = false) {
    if (githubLoading || githubOpening) return;
    githubLoading = true; $("githubMessage").textContent = "";
    if (!more) { githubRepos = []; githubPage = 0; githubHasMore = false; }
    renderGitHub();
    try {
      const result = await request("/ctl/github/repos?page=" + (githubPage + 1), undefined, 35000);
      githubRepos = [...new Map([...githubRepos, ...result.repositories].map((r) => [r.fullName, r])).values()];
      githubPage = result.page; githubHasMore = result.hasMore;
      $("githubAccount").textContent = "Đã kết nối GitHub: " + result.account.login;
    } catch (e) { $("githubAccount").textContent = "Chưa kết nối được GitHub"; $("githubMessage").textContent = e.message; }
    finally { githubLoading = false; renderGitHub(); }
  }
  async function openGitHub(fullName) {
    if (githubOpening) return;
    githubOpening = true; renderGitHub();
    $("githubMessage").textContent = "Đang mở " + fullName + "…";
    try {
      let { operation } = await request("/ctl/github/open", { fullName });
      while (operation.status === "running") {
        $("githubMessage").textContent = operation.message + (operation.jobId ? " Bạn có thể dừng tải trong bảng điều khiển máy." : "");
        await new Promise((resolve) => setTimeout(resolve, 800));
        ({ operation } = await request("/ctl/github/operations/" + encodeURIComponent(operation.id)));
      }
      if (operation.status !== "done") throw new Error(operation.message);
      active = operation.workspace; repoFor = ""; if (operation.agentMdCreated) createdFor = operation.workspace; turn = null; blockerLines = null; docText = null;
      $("logJob").value = ""; $("jobLog").textContent = "Chọn công việc để đọc nhật ký.";
      $("githubMessage").textContent = operation.message;
      $("autoMessage").textContent = operation.message;
      setView("board"); await refresh();
      if (operation.hasAgent) $("githubDialog").close();
    } catch (e) { $("githubMessage").textContent = e.message; }
    finally { githubOpening = false; renderGitHub(); }
  }

  const pct = (v) => Number.isFinite(v) ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v) + "%" : "Chưa có số liệu";
  const dateTime = (v) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "Chưa rõ";
  const expired = (b) => b.resetAt && Date.parse(b.resetAt) <= Date.now();
  const quotaStale = (p) => !!quotaError || p.status === "stale" || (p.lastSuccessAt && Date.now() - Date.parse(p.lastSuccessAt) > 3 * (quotaData?.intervalMs || 120000));
  // CEO dặn: Claude còn ≤ 8% hạn mức thì báo ngay để CEO dừng các việc Claude đang chạy, dành hạn mức cho điều phối.
  const CLAUDE_LOW = 8;
  function renderClaudeLow() {
    const p = (quotaData?.providers || []).find((x) => x.id === "claude");
    const live = p && p.status === "ready" && !quotaStale(p) ? p.buckets.filter((b) => !expired(b)) : [];
    const low = live.length ? live.reduce((a, b) => (b.remainingPercent < a.remainingPercent ? b : a)) : null;
    const box = $("claudeLow");
    if (!low || low.remainingPercent > CLAUDE_LOW) { box.hidden = true; return; }
    const running = jobs.filter((j) => j.status === "running" && String(j.agent).startsWith("CLAUDE"));
    box.hidden = false;
    setMarkup("claudeLow", `<strong>⚠️ Claude (đội trưởng) chỉ còn ${pct(low.remainingPercent)} hạn mức (${esc(low.label)}${low.resetAt ? ", mở lại " + esc(dateTime(low.resetAt)) : low.resetLabel ? ", mở lại " + esc(low.resetLabel) : ""}).</strong>` +
      `<p>Anh nên dừng các việc Claude đang chạy để dành phần còn lại cho điều phối. Văn phòng không tự dừng; anh quyết.</p>` +
      (running.length ? running.map((j) => `<div class="entry"><div class="entry-head"><span class="mono">${esc(j.agent)} · ${esc(j.id)}</span><button data-kill-claude="${esc(j.id)}">Dừng việc này</button></div></div>`).join("") : '<p class="muted">Hiện không có việc nào của Claude đang chạy.</p>'));
  }

  function renderQuotas() {
    renderClaudeLow();
    const providers = quotaData?.providers || [];
    const alerts = [];
    for (const p of providers) if (p.status === "ready" && !quotaStale(p)) for (const b of p.buckets) if (!expired(b) && b.usedPercent >= 80) alerts.push({ provider: p.name, bucket: b.label, used: b.usedPercent });
    const empty = new Set(alerts.filter((a) => a.used >= 100).map((a) => a.provider));
    $("quotaSummary").textContent = empty.size ? "Hạn mức · " + empty.size + " AI hết lượt" : alerts.length ? "Hạn mức · Gần hết" : "Hạn mức AI";
    $("quotaSummary").className = empty.size ? "bad" : alerts.length ? "warn" : "";
    $("quotaBoardNotice").hidden = !alerts.length;
    $("quotaBoardNotice").textContent = alerts.map((a) => a.provider + ": " + a.bucket + " đã dùng " + pct(a.used)).join(" · ") + ". Xem Hạn mức & tài khoản để biết giờ đặt lại.";
    $("quotas").setAttribute("aria-busy", String(!providers.length || providers.some((p) => p.refreshing)));
    $("quotaRefresh").disabled = !controller || providers.some((p) => p.refreshing);
    setMarkup("quotas", !providers.length ? `<div class="panel"><p class="muted">${esc(quotaError || "Đang đọc hạn mức từ CLI…")}</p></div>` : providers.map((p) => {
      const old = quotaStale(p), known = p.status === "ready" && !old, busy = p.refreshing;
      const status = busy ? "Đang cập nhật" : known ? "Đã đọc hạn mức" : old ? "Số liệu cũ" : p.status === "loading" ? "Đang tải" : "Chưa đọc được";
      return `<article class="panel"><div class="entry-head"><h2>${esc(p.name)}</h2>${badge(status, known && !busy ? "good" : "warn")}</div>${p.error ? `<p class="error muted">${esc(p.error)}</p>` : ""}${p.buckets.length ? p.buckets.map((b) => {
        const isOld = old || expired(b), kind = isOld ? "stale" : b.usedPercent >= 95 ? "bad" : b.usedPercent >= 80 ? "warn" : "";
        return `<div class="quota-window ${kind}"><p class="muted">${esc(b.group)}</p><div class="entry-head"><strong>${esc(b.label)}</strong><strong class="remaining">Còn ${pct(b.remainingPercent)}</strong></div><progress max="100" value="${Math.max(0, Math.min(100, b.remainingPercent))}" aria-label="${esc(p.name + ' · ' + b.group + ' · ' + b.label + ': còn ' + pct(b.remainingPercent))}"></progress><p class="muted">Đã dùng ${pct(b.usedPercent)}${isOld ? " · Bản đọc cũ, chờ xác nhận" : b.usedPercent >= 100 ? " · Đã hết hạn mức này" : ""}</p><p class="muted">${expired(b) ? "Đã qua mốc đặt lại; đang chờ số liệu mới." : b.resetAt ? "Đặt lại lúc " + dateTime(b.resetAt) : b.resetLabel ? "Đặt lại: " + esc(b.resetLabel) : "Chưa có giờ đặt lại."}</p></div>`;
      }).join("") : `<p class="muted">${busy || p.status === "loading" ? "Đang lấy số liệu từ tài khoản đã đăng nhập…" : "Không suy đoán hạn mức khi chưa có dữ liệu."}</p>`}<div class="quota-foot">${esc(p.source)}${p.plan ? " · Gói " + esc(p.plan) : ""}<br>Cập nhật thành công: ${dateTime(p.lastSuccessAt)}${p.resetCreditsAvailable != null ? "<br>Lượt đặt lại hạn mức sẵn có: " + esc(p.resetCreditsAvailable) : ""}${p.ordinaryUsageAllowed === false ? '<p class="error">Tài khoản hiện chưa được phép dùng hạn mức gói.</p>' : ""}${safeHttps(p.url) ? `<a href="${esc(safeHttps(p.url))}" target="_blank" rel="noopener noreferrer">Xem tại nhà cung cấp ↗</a>` : ""}</div></article>`;
    }).join(""));
    $("quotaMessage").textContent = quotaError || "Tự kiểm tra tối đa mỗi 2 phút khi văn phòng đang mở; lỗi kết nối chờ ít nhất 5 phút. Giờ đặt lại theo múi giờ trên máy. Mốc đã qua cần số liệu mới để xác nhận.";
  }

  function setView(name) {
    if (!["office", "projects", "meeting", "board", "transcript", "account"].includes(name)) name = "office";
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

  // Claude (đội trưởng) phản biện AI khác và hỏi CEO trước khi bắt sửa: câu hỏi + một nút cho mỗi phương án.
  function askHtml(ask, attr, id) {
    return `<div class="entry warn"><strong>❓ ${ask.kind === "mien-hop-dong" ? "Sol đề nghị miễn hợp đồng: anh quyết" : "Claude hỏi anh"}</strong><p style="white-space:pre-wrap">${esc(ask.question)}</p>` + ask.options.map((o) =>
      `<div class="actions"><button class="primary" ${attr}="${esc(id)}" data-opt="${esc(o.id)}">${esc(o.id)}</button><span>${esc(o.label)}${o.next_owner ? ` <span class="mono muted">→ ${esc(o.next_owner)}</span>` : ""}${o.task ? `<br><span class="muted">Lệnh: ${esc(o.task)}</span>` : ""}</span></div>`).join("") + "</div>";
  }

  // Luồng chờ hạn mức: giờ tự chạy lại + master prompt đội trưởng soạn để CEO tự làm lượt đó trên ChatGPT web.
  const hhmm = (t) => { const d = new Date(t); return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + (d.toDateString() !== new Date().toDateString() ? " ngày " + d.toLocaleDateString("vi-VN") : ""); };
  function waitHtml(r) {
    const w = r.wait, web = r.web;
    return `<div class="entry warn"><strong>⏳ ${esc(w.providerName)} hết hạn mức ở lượt ${esc(w.role)}</strong>` +
      `<p>Tự chạy lại đúng lượt này lúc ${esc(hhmm(w.until))} (giờ lấy từ ${esc(w.source)}). Ngữ cảnh nằm trong agent.md và repo nên không mất.</p>` +
      (w.message ? `<p class="muted mono">${esc(w.message)}</p>` : "") +
      `<div class="actions"><button class="primary" data-auto-web="${esc(r.id)}" ${web?.status === "writing" ? "disabled" : ""}>${web ? "Soạn lại master prompt" : "Nhờ đội trưởng soạn master prompt cho GPT web"}</button><button data-auto-resume="${esc(r.id)}">Chạy lại ngay</button></div>` +
      (web ? webHtml(r) : "") + pasteHtml(r) + "</div>";
  }
  // Anh làm lượt trên ChatGPT web xong thì dán câu trả lời vào đây: AI còn hạn mức kiểm theo chuẩn đầu ra rồi áp vào repo.
  function pasteHtml(r) {
    const who = r.wait.provider === "claude" ? "Codex" : "Claude";
    return `<div class="web-copy"><div class="entry-head"><strong>Dán kết quả ChatGPT trả về</strong></div>` +
      (r.web?.applyError ? `<p class="error">${esc(r.web.applyError)}</p>` : "") +
      `<textarea data-web-draft="${esc(r.id)}" rows="7" maxlength="400000" aria-label="Kết quả ChatGPT cho lượt ${esc(r.wait.role)}" placeholder="Dán toàn bộ câu trả lời của ChatGPT (các khối FILE:, vùng agent.md, dòng JSON bàn giao)…"></textarea>` +
      `<div class="actions"><button class="primary" data-auto-webresult="${esc(r.id)}">Gửi ${who} kiểm và áp vào repo</button></div>` +
      `<p class="muted">${who} đọc kết quả, đối chiếu với chuẩn đầu ra và quyền của ${esc(r.wait.role)}; chưa đạt thì không sửa file và báo lý do để anh nhờ ChatGPT làm lại.</p></div>`;
  }
  function webHtml(r) {
    const w = r.web;
    const q = w.quotas.map((x) => x.name + ": " + (x.state === "còn" ? "còn " + Math.round(x.remaining) + "%" : x.state === "hết" ? "hết, mở lại " + hhmm(x.resetAt) : "chưa rõ")).join(" · ");
    if (w.status === "writing") return `<p class="muted">Hạn mức hiện tại: ${esc(q)}</p><p>${esc(w.writer)} đang đọc repo và soạn master prompt…</p>`;
    return `<p class="muted">Hạn mức hiện tại: ${esc(q)}<br>Người soạn: ${esc(w.writer)}${w.note ? ". " + esc(w.note) : ""}</p>` +
      (w.warning ? `<p class="error">${esc(w.warning)}</p>` : "") +
      `<p class="muted">Dán master prompt vào ChatGPT web (tài khoản của anh/CLB). Prompt có mô tả dự án${w.writer.startsWith("Claude") ? " và đoạn mã nguồn liên quan" : ""}.</p>` +
      `<div class="web-copy"><div class="entry-head"><strong>Master prompt</strong><button data-copy="prompt" data-run="${esc(r.id)}">Sao chép</button></div><textarea readonly rows="8" aria-label="Master prompt">${esc(w.prompt)}</textarea></div>` +
      `<div class="web-copy"><div class="entry-head"><strong>Chuẩn kết quả đầu ra</strong><button data-copy="spec" data-run="${esc(r.id)}">Sao chép</button></div><textarea readonly rows="6" aria-label="Chuẩn kết quả đầu ra">${esc(w.spec)}</textarea></div>`;
  }

  // Một luồng tự động: trạng thái, nhánh git riêng, từng lượt (xem file đã đổi), câu hỏi/chờ hạn mức, báo cáo và nút duyệt.
  function runHtml(r, statuses) {
    const warn = ["awaiting_approval", "awaiting_answer", "attention", "waiting_quota"].includes(r.status);
    return `<article class="entry"><div class="entry-head"><strong>${esc(r.task)}</strong>${badge(statuses[r.status] || r.status, warn ? "warn" : r.status === "approved" ? "good" : "")}</div>` +
      `<p>${esc(r.steps.filter((s) => !s.quota).length)}/${esc(r.maxSteps)} lượt</p>` + gitHtml(r) + stepsHtml(r) + globalThis.RepoProgress.explainHtml(r) + globalThis.RepoProgress.deleteHtml(r) +
      (r.decisions || []).map((d) => `<p class="muted">✔ Anh đã chọn ${esc(d.option)}: ${esc(d.label)} → ${esc(d.next)}</p>`).join("") +
      (r.status === "awaiting_answer" && r.question ? askHtml(r.question, "data-auto-answer", r.id) : "") +
      (r.status === "waiting_quota" && r.wait ? waitHtml(r) : "") +
      (r.problem ? `<p class="error">${esc(r.problem)}</p>` : "") + (r.report ? `<pre>${esc(r.report)}</pre>` : "") +
      `<div class="actions">${["running", "reporting", "awaiting_answer", "waiting_quota"].includes(r.status) ? `<button data-auto-stop="${esc(r.id)}">Dừng luồng này</button>` : ""}${["awaiting_approval", "attention"].includes(r.status) ? `<button class="primary" data-auto-approve="${esc(r.id)}">${r.status === "attention" ? "Đã xem lỗi" : r.problem ? "Đã nhận báo cáo" : "Duyệt báo cáo Claude"}</button><button data-auto-reject="${esc(r.id)}">Từ chối</button>` : ""}</div></article>`;
  }
  // Nhánh ai/… của luồng; sau khi duyệt thì đẩy lên GitHub để mở PR (văn phòng không tự push, không merge).
  function gitHtml(r) {
    const g = r.git;
    if (!g) return r.steps.length ? '<p class="muted">Dự án không phải repo git: AI sửa thẳng thư mục, không có diff từng lượt.</p>' : "";
    const done = ["approved", "acknowledged"].includes(r.status);
    const prUrl = g.pushed ? safeHttps(g.pushed.compareUrl) : null;
    return `<p class="muted">🌿 Nhánh <span class="mono">${esc(g.branch)}</span> · tách từ <span class="mono">${esc(g.from || "?")}</span>${(g.notes || []).map((n) => "<br>" + esc(n)).join("")}</p>` +
      (g.pushed ? `<p>Đã đẩy nhánh lên GitHub lúc ${esc(hhmm(g.pushed.at))}. ${prUrl ? `<a href="${esc(prUrl)}" target="_blank" rel="noopener noreferrer">Mở trang tạo PR ↗</a>` : "Remote không phải GitHub: tạo PR trên trang của remote."}</p>` :
        done ? `<div class="actions"><button class="primary" data-auto-push="${esc(r.id)}" data-branch="${esc(g.branch)}">Đẩy nhánh lên GitHub & mở PR</button></div>` : "");
  }
  function stepsHtml(r) {
    if (!r.steps.length) return '<p class="muted">Đang chuẩn bị lượt đầu…</p>';
    const open = (i) => diffView?.run === r.id && diffView.step === i + 1;
    const items = r.steps.map((s, i) => `<li><span class="mono">${esc(s.role)}</span>${s.model ? ` <span class="muted">[${esc(s.model)} · ${esc(s.effort)}]</span>` : ""}` +
      (s.via === "web" ? " " + badge("GPT web · " + (s.applier === "codex" ? "Codex" : "Claude") + " kiểm") : "") +
      (s.quota ? ` <span class="muted">(${s.rejected ? "chưa áp: " + esc(s.rejected) : "hết hạn mức"})</span>` : "") +
      (s.saved?.commit ? ` <span class="mono muted">· commit ${esc(s.saved.commit)}</span>` : s.saved?.secret ? ' <span class="error">· có chuỗi giống khóa API, chưa commit</span>' : "") +
      (r.git && s.base ? ` <button class="link" data-diff-run="${esc(r.id)}" data-diff-step="${i + 1}" aria-expanded="${open(i)}">${open(i) ? "Ẩn file đã đổi" : "Xem file đã đổi"}</button>` : "") + "</li>").join("");
    return `<ol class="steps">${items}</ol>` + (diffView?.run === r.id ? diffHtml() : "");
  }
  function diffHtml() {
    const d = diffView;
    if (d.loading) return '<div class="diff"><p class="muted">Đang đọc diff của lượt…</p></div>';
    if (d.error) return `<div class="diff"><p class="error">${esc(d.error)}</p></div>`;
    const x = d.data;
    const files = x.files.length ? `<ul class="diff-files">${x.files.map((f) => `<li><span class="mono">${esc(f.path)}</span> <span class="add">+${esc(f.added ?? "?")}</span> <span class="del">−${esc(f.removed ?? "?")}</span></li>`).join("")}</ul>` : '<p class="muted">Lượt này không đổi file nào.</p>';
    const lines = x.patch.split("\n").map((l) => {
      const cls = /^(\+\+\+|---) /.test(l) || l.startsWith("diff ") ? "file" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : "";
      return cls ? `<span class="${cls}">${esc(l)}</span>` : esc(l);
    }).join("\n");
    return `<div class="diff"><p><strong>Lượt ${esc(x.step)} · ${esc(x.role)}</strong> · ${esc(x.files.length)} file${x.commits.length ? " · " + x.commits.map((c) => esc(c.hash + " " + c.subject)).join("; ") : ""}</p>${files}` +
      (x.patch ? `<details><summary>Xem diff chi tiết${x.truncated ? " (đã cắt ở 300 KB)" : ""}</summary><pre class="patch">${lines}</pre></details>` : "") + "</div>";
  }

  function renderIdeas() {
    const statuses = { running: "Đội đang làm", reporting: "Claude đang tổng hợp", awaiting_approval: "Chờ anh duyệt báo cáo", awaiting_answer: "Claude hỏi anh", attention: "Cần anh xem", waiting_quota: "Chờ hạn mức", approved: "Anh đã duyệt", acknowledged: "Anh đã nhận báo cáo", rejected: "Đã từ chối", stopped: "Đã dừng" };
    const live = ["running", "reporting", "awaiting_approval", "awaiting_answer", "attention", "waiting_quota", "awaiting_scan"];
    setMarkup("ideas", ideaError ? `<p class="error">${esc(ideaError)}</p>` : ideaList === null ? '<p class="muted">Đang đọc ý tưởng…</p>' : !ideaList.length ? '<p class="muted">Dự án này chưa có ý tưởng nào.</p>' : ideaList.map((i) => {
      const r = i.run, busy = r && live.includes(r.status);
      return `<article class="entry"><div class="entry-head"><strong>${esc(i.title)}</strong>${r ? badge(statuses[r.status] || r.status, busy ? "warn" : r.status === "approved" ? "good" : "") : badge("Chưa giao")}</div>` +
        (i.detail ? `<p>${esc(i.detail)}</p>` : "") +
        `<p class="muted">Ghi lúc ${esc(dateTime(new Date(i.createdAt).toISOString()))}${i.forcedFrom ? " · anh đã ghi đè lượt của " + esc(i.forcedFrom) + " để Hinata đặc tả" : ""}${r ? " · " + esc(r.steps) + " lượt: " + esc(r.roles || "đang chuẩn bị") : ""}</p>` +
        (busy ? "" : `<div class="actions"><button class="primary" data-idea-start="${esc(i.id)}" ${controller ? "" : "disabled"}>${r ? "Giao lại cho Hinata đặc tả" : "Giao Hinata đặc tả"}</button></div>`) + "</article>";
    }).join(""));
  }

  function renderBoard() {
    renderIdeas();
    const currentRuns = autoRuns.filter((r) => r.workspace === active);
    const busy = currentRuns.some((r) => ["running", "reporting", "awaiting_approval", "awaiting_answer", "attention", "waiting_quota", "awaiting_scan"].includes(r.status));
    $("autoStart").disabled = !controller || !active || !turn || busy;
    const statuses = { running: "Đội đang làm việc", reporting: "Claude đang tổng hợp", awaiting_approval: "Chờ bạn duyệt báo cáo", awaiting_answer: "Claude hỏi anh: chọn phương án", waiting_quota: "Chờ hạn mức", awaiting_scan: "Tạm dừng: chờ anh duyệt rà soát", approved: "Bạn đã duyệt", acknowledged: "Bạn đã nhận báo cáo lỗi", rejected: "Đã từ chối", attention: "Claude chưa gửi được báo cáo", stopped: "Đã dừng" };
    setMarkup("scanBox", scanError ? `<p class="error">${esc(scanError)}</p>` : globalThis.RepoProgress.scanHtml(scanInfo, active));
    setMarkup("autoRuns", !controller ? '<p class="muted">Chưa kết nối được OS Controller.</p>' : currentRuns.length ? currentRuns.slice(0, 8).map((r) => runHtml(r, statuses)).join("") : '<p class="muted">Chưa có việc tự động nào cho dự án này. Giao một việc ở trên để bắt đầu.</p>');
    // Ô dán kết quả GPT web: giữ chữ anh đang dán khi danh sách vẽ lại
    document.querySelectorAll("[data-web-draft]").forEach((ta) => { if (!ta.value && webDrafts[ta.dataset.webDraft]) ta.value = webDrafts[ta.dataset.webDraft]; });
    const waiting = autoRuns.filter((r) => ["awaiting_answer", "awaiting_approval", "attention", "awaiting_scan"].includes(r.status) || (r.status === "waiting_quota" && r.web?.status === "ready")).length + (scanInfo && !scanInfo.approved ? 1 : 0);
    document.title = (waiting ? "(" + waiting + ") " : "") + "Văn phòng AI · Tổng quan";
    const unavailable = !controller ? `<p class="muted">${esc(controlError || "OS Controller chưa kết nối.")}</p>` : !active ? '<p class="muted">Chọn dự án để xem bàn giao.</p>' : null;
    setMarkup("handoffs", unavailable || (ownHandoffs().length ? ownHandoffs().map((h) => `<article class="entry"><strong class="mono">${esc(h.role)} → ${esc(h.next_owner || "Chưa xác định")}</strong><p>File: ${esc((h.payload?.files || []).join(", ") || "Không có file được khai báo")}</p><p class="mono">${esc(h.job_id)}</p>${h.problems.length ? `<p class="error">${h.problems.map(esc).join("; ")}</p>` : ""}${h.payload?.ask_ceo && !h.problems.length ? askHtml(h.payload.ask_ceo, "data-handoff-answer", h.job_id) : ""}<div class="actions">${h.payload?.ask_ceo && !h.problems.length ? "" : `<button class="primary" data-approve="${esc(h.job_id)}" ${h.problems.length ? "disabled" : ""}>Duyệt chuyển lượt</button>`}<button data-job="${esc(h.job_id)}">Xem nhật ký</button></div></article>`).join("") : '<p class="muted">Không có bàn giao chờ duyệt cho dự án này.</p>'));
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
      let a = accounts?.[key];
      if (key === "gemini" && quotaData?.providers.some((p) => p.id === "antigravity" && p.status === "ready" && !quotaStale(p))) a = { ...a, connected: true, authMode: "Antigravity CLI đã xác thực và cung cấp hạn mức." };
      const known = a && typeof a.connected === "boolean";
      return `<div class="panel"><h2>${name}</h2><div class="account-status">${badge(!a ? "Chưa có dữ liệu" : !known ? "Chưa xác minh được" : a.connected ? "Đã kết nối" : "Chưa kết nối", known && a.connected ? "good" : "")}</div><p class="muted">${esc(!a ? accountError || "Đang đọc trạng thái…" : a.authMode || (known ? (a.connected ? "Đã kết nối trên máy chủ." : "Chưa kết nối trên máy chủ.") : "Văn phòng chưa xác minh được trạng thái đăng nhập."))}</p>${a && Number.isInteger(a.sessionsCount) ? `<p class="muted">${a.sessionsCount} tệp phiên được phát hiện.</p>` : ""}</div>`;
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
    if (active) request("/ctl/scan?workspace=" + encodeURIComponent(active), undefined, 20000).then((v) => { if (target === active) { scanInfo = v.scan; scanError = ""; renderBoard(); } }).catch((e) => { scanInfo = null; scanError = "Chưa rà được file .md / thư viện: " + e.message; renderBoard(); });
    if (!active) { turn = null; blockerLines = null; return; }
    const q = encodeURIComponent(active);
    request("/ctl/ideas?workspace=" + q).then((v) => { if (target === active) { ideaList = v.ideas; ideaError = ""; } }).catch((e) => { ideaList = null; ideaError = "Không đọc được ý tưởng: " + e.message; });
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

  async function loadRepo(force = false) {
    if (!active) { repoInfo = null; repoFor = ""; renderRepo(); return; }
    if (repoLoading) return;
    if (!force && repoFor === active && repoInfo) { renderRepo(); return; }
    const target = active;
    repoLoading = true; renderRepo();
    try {
      const { overview } = await request("/ctl/workspaces/overview?workspace=" + encodeURIComponent(target), undefined, 25000);
      if (target === active) { repoInfo = overview; repoFor = target; repoError = ""; }
    } catch (e) { if (target === active) { repoInfo = null; repoError = "Chưa đọc được repo: " + e.message; } }
    finally { repoLoading = false; renderRepo(); if (target !== active) loadRepo(); }
  }

  function renderRepo() {
    const box = $("repoRead");
    if (!active) { setMarkup("repoRead", '<h2 id="repoTitle">Đọc repo dự án</h2><p class="muted">Chưa đăng ký dự án nào. Bấm "Chọn repo GitHub" để mở một repo.</p>'); return; }
    box.setAttribute("aria-busy", String(repoLoading));
    const o = repoFor === active ? repoInfo : null;
    if (!o) { setMarkup("repoRead", `<h2 id="repoTitle">Đọc repo dự án</h2><p class="${repoError ? "error" : "muted"}">${esc(repoError || "Đang đọc repo " + active + "…")}</p>`); return; }
    const a = o.agentMd || {}, r = o.repo, v = o.visibility || {};
    const vis = { public: "Công khai trên GitHub", private: "Riêng tư trên GitHub", "not-github": "Remote không phải GitHub", "no-remote": "Chưa có remote origin", unknown: "Chưa xác định được (" + (v.reason || "lỗi mạng") + ")" }[v.kind] || "Chưa xác định";
    let agentLine;
    if (!a.exists) agentLine = "Chưa có agent.md và chưa tạo được. Kiểm tra quyền ghi thư mục.";
    else if (createdFor === active && r && !r.agentMdTracked) agentLine = "Vừa tạo agent.md theo mẫu v2.2 (lượt đầu cho Claude).";
    else agentLine = "Có agent.md.";
    if (a.exists && r) agentLine += r.agentMdTracked ? (v.kind === "public" ? " Cảnh báo: agent.md đang được commit trong repo công khai." : " Đã commit trong repo.") : r.agentMdIgnored ? " Chỉ giữ trên máy (repo công khai, nằm trong .git/info/exclude)." : " Chưa commit: sẽ commit ở lần duyệt chuyển lượt đầu.";
    const blockers = a.openBlockers || [];
    const rows = [
      ["Thư mục", o.workspace],
      ["Git", r ? `Nhánh ${r.branch || "?"} · ${r.changed === null ? "chưa đọc được thay đổi" : r.changed + " file chưa commit"}` : "Không phải repo git"],
      ["Remote", r?.remote || "Không có"],
      ["Hiển thị", vis],
      ["Công nghệ nhận diện", o.stack.length ? o.stack.join(", ") : "Chưa nhận diện được từ file ở gốc repo"],
      ["README", o.readme ? o.readme.firstLine : "Không có README"],
      ["Phase (agent.md)", a.phase || (a.exists ? "Không đọc được" : "—")],
      ["Đang giữ lượt", a.nextOwner || (a.problem ? a.problem : "—")],
      ["Kiểm duyệt", (a.auditStatus || "—") + " · " + blockers.length + " blocker OPEN"],
    ];
    setMarkup("repoRead", `<div class="entry-head"><h2 id="repoTitle">Đã đọc repo ${esc(o.name)}</h2><span class="badge">Đọc lúc ${esc(new Date(o.readAt).toLocaleTimeString("vi-VN"))}</span></div>
      <p class="${a.exists ? "muted" : "error"}">${esc(agentLine)}</p>
      ${globalThis.RepoProgress.html(o, autoRuns, ownHandoffs(), controlError ? { runs: controlError, handoffs: controlError } : {})}
      <dl class="repo-grid">${rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl>
      ${blockers.length ? `<details open><summary>Blocker OPEN trong Vùng [5]</summary><ul>${blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></details>` : ""}
      ${r && r.commits.length ? `<details><summary>${r.commits.length} commit gần nhất</summary><ul>${r.commits.map((c) => `<li><span class="mono">${esc(c.hash)}</span> · ${esc(c.when)} · ${esc(c.subject)}</li>`).join("")}</ul></details>` : r ? '<p class="muted">Repo chưa có commit nào.</p>' : ""}
      <details><summary>${o.totalEntries} mục ở gốc repo</summary><ul>${o.entries.map((e) => `<li class="mono">${esc(e)}</li>`).join("")}${o.totalEntries > o.entries.length ? `<li>… và ${o.totalEntries - o.entries.length} mục khác</li>` : ""}</ul></details>`);
  }

  function renderProjects() {
    const live = new Set(["running", "reporting", "awaiting_approval", "awaiting_answer", "attention", "waiting_quota", "awaiting_scan"]);
    const name = (s) => ({ done: "Xong", failed: "Lỗi", killed: "Đã dừng", rejected: "Từ chối" })[s] || s;
    const when = (t) => t == null ? "Chưa có thời gian" : new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const job = (j) => `<div class="entry"><div class="entry-head"><strong>${esc(j.label)}</strong>${badge(name(j.status))}</div><p>${esc(j.endedAt == null ? "Bắt đầu: " + when(j.startedAt) : "Kết thúc: " + when(j.endedAt))} · ${esc(j.durationS == null ? "Chưa rõ thời lượng" : j.durationS + " giây")}</p></div>`;
    const run = (r) => `<div class="entry"><div class="entry-head"><strong>Luồng tự động: ${esc(r.task)}</strong>${badge(name(r.status))}</div><p>${esc(r.steps)} lượt · ${esc(r.roles || "Chưa có lượt")}</p><p>Cập nhật: ${esc(when(r.updatedAt))}</p></div>`;
    setMarkup("projects", projectsError ? `<p class="error" role="alert">${esc(projectsError)}</p>` : projects === null ? '<p class="muted">Đang đọc dự án…</p>' : !projects.length ? '<p class="muted">Chưa đăng ký dự án nào.</p>' : projects.map((p) => {
      const running = p.running.map(job).join("") + p.runs.filter((r) => live.has(r.status)).map(run).join("");
      const recent = p.recent.map(job).join("") + p.runs.filter((r) => !live.has(r.status)).map(run).join("");
      return `<article class="panel project"><div class="entry-head"><h2>${esc(p.name)}</h2>${p.active ? badge("Đang chọn", "good") : ""}</div><p class="mono">${esc(p.path)}</p>
        <p>Phase: ${esc(p.turn?.phase || "Chưa đọc được")}<br>Đang giữ lượt: ${esc(p.turn?.nextOwner || "Chưa đọc được")}<br>Kiểm duyệt: ${esc(p.auditStatus || "Chưa rõ")} · ${esc(p.openBlockers ?? "Chưa rõ")} blocker OPEN</p>
        ${p.handoffPending ? `<p>Bàn giao chờ duyệt: ${esc(p.handoffPending)}</p>` : ""}${p.problem ? `<p class="error">${esc(p.problem)}</p>` : ""}
        <h3>Đang chạy</h3>${running || '<p class="muted">Không có việc nào đang chạy</p>'}
        <h3>Đã xong gần đây</h3>${recent || '<p class="muted">Chưa có việc nào đã kết thúc.</p>'}
        ${p.active ? "" : `<button data-project="${esc(p.path)}" ${switching ? "disabled" : ""}>Chọn dự án này</button>`}</article>`;
    }).join(""));
  }

  async function refresh() {
    if (loading || switching) return;
    loading = true; $("refresh").disabled = true;
    await Promise.all([
      request("/ctl/projects").then((value) => { projects = value.projects; projectsError = ""; }).catch((e) => { projects = null; projectsError = "Không đọc được dự án: " + e.message; }),
      request("/state").then((value) => { snapshot = value; stateError = ""; }).catch((e) => { snapshot = null; stateError = "Không đọc được văn phòng: " + e.message; }),
      loadControl().catch((e) => { controller = false; turn = null; blockerLines = null; jobs = []; handoffs = []; autoRuns = []; docText = null; docError = "Không đọc được biên bản khi Controller mất kết nối."; controlError = "Không đọc được điều phối: " + e.message; }),
      request("/api/accounts").then((value) => { accounts = value.accounts; accountError = ""; }).catch((e) => { accounts = null; accountError = "Không đọc được tài khoản: " + e.message; }),
      request("/ctl/quotas").then((value) => { quotaData = value; quotaError = ""; }).catch((e) => { quotaError = "Chưa tải được hạn mức: " + e.message; }),
    ]);
    loading = false; $("refresh").disabled = false; lastRefresh = new Date();
    renderProtocol(); renderOffice(); renderBoard(); renderQuotas(); renderAccounts(); renderProjects();
    loadRepo();
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
  $("refresh").onclick = () => { repoFor = ""; refresh(); };
  $("quotaSummary").onclick = () => setView("account");
  $("quotaRefresh").onclick = async () => {
    $("quotaRefresh").disabled = true;
    try { quotaData = await request("/ctl/quotas/refresh", {}); quotaError = ""; renderQuotas(); }
    catch (e) { quotaError = e.message; renderQuotas(); }
  };
  $("githubChoose").onclick = () => { $("githubDialog").showModal(); loadGitHub(); };
  $("githubClose").onclick = () => $("githubDialog").close();
  $("githubSearch").oninput = renderGitHub;
  $("githubRefresh").onclick = () => loadGitHub();
  $("githubMore").onclick = () => loadGitHub(true);
  $("githubRepos").onclick = (e) => { const button = e.target.closest("[data-github-open]"); if (button) openGitHub(button.dataset.githubOpen); };
  $("autoForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!active || !controller) return;
    $("autoStart").disabled = true; $("autoMessage").textContent = "Đang giao việc…";
    try { await request("/ctl/autopilot", { workspace: active, task: $("autoTask").value }); $("autoTask").value = ""; $("autoMessage").textContent = "Đã bắt đầu. Claude sẽ báo cáo tại đây khi xong."; }
    catch (err) { $("autoMessage").textContent = err.message; }
    finally { await refresh(); }
  };
  $("claudeLow").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-kill-claude]"); if (!b) return;
    if (!confirm("Dừng việc " + b.dataset.killClaude + " của Claude?")) return;
    b.disabled = true;
    try { await request("/ctl/jobs/" + encodeURIComponent(b.dataset.killClaude) + "/kill", {}); }
    catch (err) { $("autoMessage").textContent = err.message; }
    finally { await refresh(); }
  });
  $("ideaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("ideaSave").disabled = true;
    try { await request("/ctl/ideas", { workspace: active, title: $("ideaTitle").value, detail: $("ideaDetail").value }); $("ideaTitle").value = ""; $("ideaDetail").value = ""; $("ideaMessage").textContent = "Đã lưu ý tưởng. Bấm \"Giao Hinata đặc tả\" để bắt đầu chu trình."; }
    catch (err) { $("ideaMessage").textContent = err.message; }
    finally { $("ideaSave").disabled = false; await refresh(); }
  });
  $("ideas").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-idea-start]"); if (!b) return;
    b.disabled = true;
    const go = (force) => request("/ctl/ideas/" + encodeURIComponent(b.dataset.ideaStart) + "/start", { force });
    try {
      try { await go(false); }
      catch (err) {
        if (err.code !== "NEEDS_SPEC_TURN") throw err;
        if (!confirm(err.message + "\n\nGhi đè chuyển lượt cho Hinata (SPEC_ARCHITECT)?")) { $("ideaMessage").textContent = "Chưa giao: anh chưa đồng ý ghi đè lượt."; return; }
        await go(true);
      }
      $("ideaMessage").textContent = "Đã giao: Hinata đang đặc tả ý tưởng, theo dõi tiến độ ở mục bên dưới.";
    } catch (err) { $("ideaMessage").textContent = err.message; }
    finally { b.disabled = false; await refresh(); }
  });
  $("autoRuns").addEventListener("click", async (e) => {
    const ans = e.target.closest("[data-auto-answer]");
    if (ans) {
      if (!confirm("Chọn phương án " + ans.dataset.opt + " cho câu hỏi của Claude?\nLuồng tự động chạy tiếp theo phương án này.")) return;
      ans.disabled = true;
      try { const r = await request("/ctl/autopilot/" + encodeURIComponent(ans.dataset.autoAnswer) + "/answer", { option: ans.dataset.opt }); $("autoMessage").textContent = "Đã chọn " + ans.dataset.opt + ": luồng chạy tiếp (" + (r.run.steps.at(-1)?.role || "") + ")."; }
      catch (err) { $("autoMessage").textContent = err.message; }
      finally { await refresh(); }
      return;
    }
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      const text = autoRuns.find((x) => x.id === copy.dataset.run)?.web?.[copy.dataset.copy] || "";
      try { await navigator.clipboard.writeText(text); }
      catch { const ta = copy.closest(".web-copy").querySelector("textarea"); ta.focus(); ta.select(); document.execCommand("copy"); }
      copy.textContent = "Đã sao chép"; setTimeout(() => { copy.textContent = "Sao chép"; }, 1500);
      return;
    }
    const diffBtn = e.target.closest("[data-diff-run]");
    if (diffBtn) {
      const run = diffBtn.dataset.diffRun, step = Number(diffBtn.dataset.diffStep), same = () => diffView?.run === run && diffView.step === step;
      if (same() && !diffView.loading) { diffView = null; renderBoard(); return; }
      diffView = { run, step, loading: true }; renderBoard();
      try { const { diff } = await request("/ctl/autopilot/" + encodeURIComponent(run) + "/steps/" + step + "/diff", undefined, 20000); if (same()) diffView = { run, step, data: diff }; }
      catch (err) { if (same()) diffView = { run, step, error: err.message }; }
      renderBoard();
      return;
    }
    const push = e.target.closest("[data-auto-push]");
    if (push) {
      if (!confirm("Đẩy nhánh " + push.dataset.branch + " lên GitHub?\nChỉ đẩy nhánh này (không force, không merge). Sau đó anh mở PR và tự merge khi đã xem.")) return;
      push.disabled = true;
      try { const r = await request("/ctl/autopilot/" + encodeURIComponent(push.dataset.autoPush) + "/push", {}, 130000); const url = safeHttps(r.run.git.pushed.compareUrl); $("autoMessage").textContent = "Đã đẩy nhánh " + r.run.git.branch + "." + (url ? " Đang mở trang tạo PR." : ""); if (url) window.open(url, "_blank", "noopener,noreferrer"); }
      catch (err) { $("autoMessage").textContent = err.message; push.disabled = false; }
      finally { await refresh(); }
      return;
    }
    const send = e.target.closest("[data-auto-webresult]");
    if (send) {
      const id = send.dataset.autoWebresult, ta = document.querySelector(`[data-web-draft="${CSS.escape(id)}"]`), text = ta ? ta.value : "";
      if (!text.trim()) { $("autoMessage").textContent = "Dán kết quả ChatGPT vào ô trước."; ta?.focus(); return; }
      send.disabled = true;
      try { await request("/ctl/autopilot/" + encodeURIComponent(id) + "/web-result", { text }, 20000); delete webDrafts[id]; $("autoMessage").textContent = "Đã gửi kết quả GPT web: AI đang kiểm và áp vào repo."; }
      catch (err) { $("autoMessage").textContent = err.message; send.disabled = false; }
      finally { await refresh(); }
      return;
    }
    const web = e.target.closest("[data-auto-web],[data-auto-resume]");
    if (web) {
      const id = web.dataset.autoWeb || web.dataset.autoResume, action = web.dataset.autoWeb ? "web-prompt" : "resume";
      web.disabled = true;
      try { await request("/ctl/autopilot/" + encodeURIComponent(id) + "/" + action, {}); $("autoMessage").textContent = action === "resume" ? "Đã chạy lại lượt đang chờ hạn mức." : "Đội trưởng đang xem ai còn hạn mức và soạn master prompt…"; }
      catch (err) { $("autoMessage").textContent = err.message; }
      finally { await refresh(); }
      return;
    }
    const b = e.target.closest("[data-auto-stop],[data-auto-approve],[data-auto-reject]"); if (!b) return;
    const action = b.dataset.autoStop ? "stop" : b.dataset.autoApprove ? "approve" : "reject";
    const id = b.dataset.autoStop || b.dataset.autoApprove || b.dataset.autoReject;
    b.disabled = true;
    try { const result = await request("/ctl/autopilot/" + encodeURIComponent(id) + "/" + action, {}); $("autoMessage").textContent = action === "approve" ? result.run.status === "acknowledged" ? "Đã ghi nhận bạn xem lỗi. Công việc chưa được đánh dấu hoàn tất." : "Đã ghi nhận duyệt báo cáo. Không merge hoặc phát hành." : action === "stop" ? "Đã dừng luồng." : "Đã từ chối báo cáo."; }
    catch (err) { $("autoMessage").textContent = err.message; }
    finally { await refresh(); b.disabled = false; }
  });
  $("scanBox").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-scan-approve]"); if (!b) return;
    if (!confirm("Anh đã đọc các điểm bất thường và đồng ý cho AI chạy toàn quyền trong dự án này?")) return;
    b.disabled = true;
    try { const r = await request("/ctl/scan/approve", { workspace: b.dataset.scanWorkspace, fingerprint: b.dataset.scanApprove }, 20000); scanInfo = r.scan; $("autoMessage").textContent = "Đã duyệt rà soát." + (r.resumed.length ? " Chạy tiếp " + r.resumed.length + " luồng đang tạm dừng." : ""); }
    catch (err) { $("autoMessage").textContent = err.message; b.disabled = false; }
    finally { await refresh(); }
  });
  $("autoRuns").addEventListener("input", (e) => { const ta = e.target.closest("[data-web-draft]"); if (ta) webDrafts[ta.dataset.webDraft] = ta.value; });
  $("handoffButton").onclick = () => { setView("board"); $("boardTitle").tabIndex = -1; $("boardTitle").focus(); };
  $("projects").onclick = (e) => { const b = e.target.closest("[data-project]"); if (b) switchProject(b.dataset.project); };
  $("workspace").onchange = () => switchProject($("workspace").value);
  async function switchProject(path) {
    const old = active;
    if (switching) return;
    switching = true; $("workspace").disabled = true;
    try { const r = await request("/ctl/workspaces/switch", { path }); active = path; repoFor = ""; if (r.agentMd?.created) createdFor = path; turn = null; blockerLines = null; docText = null; $("logJob").value = ""; $("jobLog").textContent = "Chọn công việc để đọc nhật ký."; }
    catch (e) { active = old; controlError = e.message; renderProtocol(); alert("Không chọn được dự án: " + e.message); }
    finally { switching = false; $("workspace").disabled = false; await refresh(); }
  }
  document.addEventListener("click", async (e) => {
    const handAns = e.target.closest("[data-handoff-answer]");
    if (handAns) {
      if (!confirm("Chọn phương án " + handAns.dataset.opt + " cho câu hỏi của Claude?\nLượt chuyển sang vai của phương án này.")) return;
      handAns.disabled = true;
      try { const r = await request("/ctl/handoffs/" + encodeURIComponent(handAns.dataset.handoffAnswer) + "/answer", { option: handAns.dataset.opt }); $("autoMessage").textContent = "Đã chọn " + handAns.dataset.opt + ": lượt sang " + r.handoff.next + "."; }
      catch (err) { $("autoMessage").textContent = err.message; }
      finally { await refresh(); }
      return;
    }
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
