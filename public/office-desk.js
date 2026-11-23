import "./progress-view.js";

const { esc, statuses } = globalThis.RepoProgress;
const $ = (id) => document.getElementById(id);
const live = new Set(["running", "reporting", "awaiting_answer", "awaiting_approval", "attention", "waiting_quota", "awaiting_scan"]);
const roomOf = (role = "") => role.startsWith("FRONTEND_") ? "kakashi" : role === "SPEC_ARCHITECT" || role.startsWith("AGY_") ? "hinata" : role.startsWith("SOL_") ? "itachi" : role.startsWith("CODEX_") ? "sasuke" : role.startsWith("CLAUDE_") ? "sakura" : null;
const time = (v) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toLocaleString("vi-VN") : "Chưa có giờ xác nhận";
const first = (text) => String(text || "").split(/\r?\n/)[0];
const pendingRun = (r) => ["awaiting_answer", "awaiting_approval", "attention", "waiting_quota", "awaiting_scan"].includes(r.status) || (["approved", "acknowledged"].includes(r.status) && r.git && !r.git.pushed);
const safeCompare = (value) => { try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "github.com" && !u.username && !u.password ? u.href : null; } catch { return null; } };
const safeHttps = (value) => { try { const u = new URL(String(value || "")); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } };

// Văn phòng 3D mở trên điện thoại (qua Tailscale/đường hầm): /ctl chỉ dùng được trên chính máy tính, nên điện thoại đã ghép
// gọi qua kênh /dkx/api (lib/dieu-khien-xa.js: chỉ các lệnh trong danh sách điện thoại được phép). Chưa ghép thì báo đi ghép.
// CEO chọn 16/11/2026: "Mở 3D, nút đi qua máy đã ghép".
// Chỉ nhớ kết quả chắc chắn (máy tính / điện thoại đã ghép). Chưa ghép hoặc lỗi mạng thì lần sau hỏi lại, để ghép xong
// hay mạng nối lại là dùng được ngay, không phải tải lại trang.
let ctlPrefix = null;
const laMayNay = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export async function ctlBase() {
  if (ctlPrefix) return ctlPrefix;
  try {
    const r = await fetch("/dkx/trang-thai", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return (ctlPrefix = "/ctl");   // máy chủ cũ chưa có /dkx
    const d = await r.json();
    if (d.local) return (ctlPrefix = "/ctl");
    if (d.ghep) return (ctlPrefix = "/dkx/api");
    return "unpaired";
  } catch { return laMayNay() ? "/ctl" : "/dkx/api"; }
}
// Văn phòng 3D: đang gợi ý tên / gửi duyệt / tạo dự án thì giữ khoá nút (lock() chạy lại mỗi lần làm mới).
let damBan = false;
globalThis.vpCtlBase = ctlBase;   // index.html (chat với từng AI) dùng chung cách chọn đường
const CHUA_GHEP = "Điện thoại chưa ghép với văn phòng: mở trang Điều khiển (dieu-khien.html), nhập mã ghép tạo trên máy tính rồi quay lại.";

async function request(path, body, timeout = 15000) {
  const base = await ctlBase();
  if (base === "unpaired") throw Object.assign(new Error(CHUA_GHEP), { code: "NEED_PAIRING" });
  let response;
  try { response = await fetch(base + path, { cache: "no-store", method: body === undefined ? "GET" : "POST", signal: AbortSignal.timeout(timeout),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }); }
  catch (e) { throw new Error("Không kết nối được Controller hoặc yêu cầu quá thời gian. Kiểm tra Controller đang chạy. " + e.message); }
  let data;
  try { data = await response.json(); } catch { throw new Error("Controller chưa trả JSON hợp lệ. Kiểm tra Controller và phiên đăng nhập văn phòng."); }
  if (data.code === "NOT_PAIRED" || data.code === "REMOTE_DENIED") ctlPrefix = null;   // vừa huỷ ghép / đổi mạng: lần sau hỏi lại
  if (!response.ok || data.ok === false) throw Object.assign(new Error((data.code === "CTL_OFFLINE" ? "Controller chưa chạy. " : "") + (data.error || "Lỗi HTTP " + response.status)), { code: data.code });
  return data;
}

export function createDesk(getOffice) {
  const names = { tasks: "Việc đang làm", approvals: "Việc chờ anh duyệt", assign: "Giao việc cho cả đội", ideas: "Ý tưởng", projects: "Dự án", quotas: "Hạn mức", progress: "Dự án đang ở đâu", publish: "Xuất bản", journal: "Nhật ký" };
  const toolbar = document.createElement("nav"); toolbar.className = "desk-tools"; toolbar.setAttribute("aria-label", "Điều phối dự án");
  toolbar.innerHTML = ["journal", "tasks", "assign", "ideas", "projects", "quotas", "progress", "publish"].map((key) => `<button type="button" class="btn ghost" data-desk="${key}" aria-controls="officeDesk" aria-expanded="false">${names[key]}</button>`).join("") +
    '<a class="btn ghost" href="ket-noi.html" data-chi-may title="Kết nối (MCP) của đội: Notion, Figma, Google Drive…">Kết nối</a>' +
    '<a class="btn ghost" href="skill.html" data-chi-may title="Dán link repo GitHub bất kỳ: đội trưởng giải thích, anh quyết cài skill, cài MCP hay lưu tham khảo">Repo &amp; Skill</a>' +
    '<a class="btn ghost" href="xuong-phim.html" title="Xưởng phim AI: ngân sách, khung hình, quay Gemini, trạm Google Flow">🎬 Xưởng phim</a>' +
    '<a class="btn ghost" href="dien-thoai.html" data-chi-may title="Ghép điện thoại để điều khiển văn phòng từ xa">Điện thoại</a>' +
    '<a class="btn ghost" href="cap-nhat.html" id="deskUpdate" data-chi-may title="Phiên bản app và cập nhật">Cập nhật</a>' +
    '<a class="btn ghost" href="dieu-khien.html" data-chi-dt style="display:none" title="Về bảng điều khiển trên điện thoại">← Bảng điều khiển</a>' +
    '<button type="button" class="btn ghost" data-tai-lai style="display:none" title="Tải lại văn phòng">↻ Tải lại</button>';
  document.querySelector(".bar").append(toolbar);
  let isRemote = !laMayNay();
  function applyRemoteUi() {
    toolbar.querySelector("[data-chi-dt]").style.display = isRemote ? "" : "none";
    toolbar.querySelectorAll("[data-chi-may]").forEach((el) => { el.hidden = isRemote; });
    const gl = $("deskGithubLoad"), gm = $("deskGithubMore"), gs = $("deskGithubState"), dp = $("deskPrepare");
    if (gl) gl.hidden = isRemote;
    if (gm) gm.hidden = isRemote || !githubMore;
    if (gs && isRemote) gs.textContent = "Tải repo GitHub có sẵn chỉ thực hiện trên máy tính. Tạo dự án mới (repo riêng tư) ở trên vẫn dùng được từ điện thoại.";
    if (dp) dp.hidden = isRemote;
  }
  // App trên màn hình chính iPhone không có nút Back hay nút tải lại của trình duyệt (CEO hỏi 17/11/2026):
  // điện thoại (không phải máy chạy văn phòng) có nút về bảng điều khiển và ẩn mục chỉ dùng trên máy tính; mở từ biểu tượng thì có thêm nút tải lại.
  ctlBase().then((b) => {
    isRemote = b !== "/ctl";
    applyRemoteUi();
    render();
    // Có bản mới thì nút Cập nhật ghi rõ (chỉ máy tính; điện thoại không gọi /cap-nhat để tránh 403).
    if (!isRemote) {
      request("/cap-nhat").then((d) => {
        const s = d.capNhat;
        if (s && s.state === "co-ban-moi") { const a = $("deskUpdate"); a.textContent = "Cập nhật: có " + s.target.name; a.title = "Có bản mới " + s.target.name + ": bấm để xem và cập nhật"; }
      }).catch(() => {});
    }
  });
  if (navigator.standalone === true || matchMedia("(display-mode: standalone)").matches) {
    const tl = toolbar.querySelector("[data-tai-lai]"); tl.style.display = ""; tl.addEventListener("click", () => location.reload());
  }
  // Menu điện thoại (ngăn kéo ☰): đổi tài khoản Antigravity bằng một chạm + quản lý tài khoản (CEO yêu cầu 16/11/2026).
  // Trên máy tính khối này ẩn (đã có trong mục Hạn mức và nút Tài khoản AI).
  const tkMenu = document.createElement("div"); tkMenu.className = "desk-tk"; tkMenu.setAttribute("aria-label", "Tài khoản AI");
  document.querySelector(".bar").append(tkMenu);
  tkMenu.addEventListener("click", (e) => {
    const doi = e.target.closest("[data-tk-chuyen]");
    if (doi && !doi.disabled) {
      // Mở mục Hạn mức (có bảng tài khoản + dòng thông báo) để anh thấy kết quả hoặc lý do lỗi (vd. Antigravity đang chạy).
      show("quotas");
      const ten = doi.dataset.tkNhan || "";
      mutate("Đổi Antigravity sang tài khoản " + ten, () => request("/agy-tai-khoan/" + encodeURIComponent(doi.dataset.tkChuyen) + "/chuyen", {}, 60000));
    } else if (e.target.closest("[data-gpt-tk]") && !e.target.closest("[data-gpt-tk]").disabled) {
      const g = e.target.closest("[data-gpt-tk]");
      show("quotas");
      mutate("Đổi Codex sang tài khoản GPT " + (g.dataset.tkNhan || ""), () => request("/codex-tai-khoan/" + encodeURIComponent(g.dataset.gptTk) + "/chuyen", {}, 30000));
    } else if (e.target.closest("[data-tk-quanly]")) show("quotas");
    else if (e.target.closest("[data-tk-ai]")) document.getElementById("openAccountsBtn")?.click();
  });
  const dialog = document.createElement("dialog"); dialog.id = "officeDesk"; dialog.className = "desk-dialog"; dialog.setAttribute("aria-labelledby", "deskTitle");
  dialog.innerHTML = `<div class="desk-head"><h2 id="deskTitle">Dự án đang ở đâu</h2><button type="button" id="deskClose">Thu gọn / Đóng</button></div><div class="desk-body">
    <p id="deskWorkspace" class="muted"></p><p id="deskMessage" class="desk-message" role="status"></p>
    <section data-view="tasks"><div id="deskTasks" aria-live="polite">Đang tải việc…</div></section>
    <section data-view="approvals" hidden><div id="deskApprovals">Đang tải việc chờ duyệt…</div></section>
    <section data-view="assign" hidden><form id="deskAssign"><label for="deskTask">Việc anh muốn cả đội thực hiện</label><textarea id="deskTask" required maxlength="3000" rows="5"></textarea><p>Đội sẽ sửa file, kiểm thử và commit cục bộ trong dự án đang chọn.</p><button type="submit" data-write>Giao cho cả đội</button></form><p id="deskAssignState"></p></section>
    <section data-view="ideas" hidden><form id="deskIdea"><label for="deskIdeaTitle">Tên ý tưởng</label><input id="deskIdeaTitle" required maxlength="200"><label for="deskIdeaDetail">Mô tả ý tưởng</label><textarea id="deskIdeaDetail" maxlength="2400" rows="3"></textarea><div class="desk-actions"><button type="submit" data-write>Lưu ý tưởng</button></div></form><div id="deskIdeas">Đang tải ý tưởng…</div></section>
    <section data-view="projects" hidden><div class="desk-entry"><strong>Tạo dự án mới</strong><label for="damYTuong">Ý tưởng (vài câu: sản phẩm làm gì, cho ai)</label><textarea id="damYTuong" maxlength="2000" rows="3" placeholder="Ví dụ: app luyện nghe tiếng Anh cho học sinh cấp 2, có bài nghe theo chủ đề và chấm điểm phát âm"></textarea><div class="desk-actions"><button type="button" id="damGoiY" data-dam>Gợi ý tên repo</button></div><div id="damKetQua"></div></div><label for="deskProject">Dự án đã đăng ký</label><select id="deskProject"><option value="">Đang tải…</option></select><div class="desk-actions"><button id="deskSwitch" data-write>Chọn dự án</button><button id="deskGithubLoad">Tải repo GitHub</button></div><p id="deskGithubState" role="status">Bấm tải repo GitHub để đọc danh sách.</p><div id="deskGithub"></div><button id="deskGithubMore" hidden>Tải thêm repo</button></section>
    <section data-view="quotas" hidden><div id="deskQuotas">Đang tải hạn mức…</div></section>
    <section data-view="progress" hidden><div id="deskProgress">Đang đọc tiến độ dự án…</div></section>
    <section data-view="journal" hidden><div id="deskJournal" class="journal" aria-live="polite">Đang tải nhật ký…</div></section>
    <section data-view="publish" hidden><div class="desk-actions"><button type="button" id="deskPrepare" data-write>Kiểm tra &amp; build</button></div>
      <p class="muted">Bước 1 · Kiểm tra &amp; build chạy trên máy anh, chưa ra ngoài: repo sạch → có Dockerfile → Docker đang chạy → test → build thử image. Bước 2 · Xuất bản: văn phòng đẩy tag phiên bản hoặc chạy workflow của chính repo trên GitHub, GitHub Actions build và đưa image lên GHCR + GitHub Releases. Chỉ chạy khi anh bấm và xác nhận đúng phiên bản; máy anh không cần docker login.</p>
      <div id="deskPublish" aria-live="polite">Đang tải…</div></section>
    <div class="desk-actions"><button type="button" id="deskRefresh">Làm mới</button><button type="button" data-desk="approvals">Việc chờ anh duyệt</button></div></div>`;
  document.body.append(dialog);
  let active = null, workspaces = [], view = "progress", inFlight = null, mutating = false, firstLoad = true;
  let dieuPhoi = null;
  let runs = [], jobs = [], handoffs = [], ideas = [], quotas = null, overview = null, turn = null, scan = null, publish = null, journal = null;
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
    // Tạo dự án mới không cần dự án đang chọn (máy mới cài chưa có dự án nào).
    dialog.querySelectorAll("[data-dam]").forEach((b) => { b.disabled = mutating || damBan; });
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
    let html = errors.scan ? `<p class="error">${esc(errors.scan)}</p>` : globalThis.RepoProgress.scanHtml(scan, active, "data-scan", { canApprove: !isRemote });
    html += waiting.map((r) => {
      let body = r.problem ? `<p class="error">${esc(r.problem)}</p>` : "";
      if (r.status === "awaiting_answer") body += (r.report ? `<details open><summary>Phân tích của Claude</summary><pre class="desk-report" tabindex="0">${esc(r.report)}</pre></details>` : "") + question(r.question, "autopilot", r.id);
      body += globalThis.RepoProgress.explainHtml(r) + globalThis.RepoProgress.deleteHtml(r);
      if (r.status === "awaiting_scan") {
        body += r.scan?.truncated
          ? '<p class="error">Rà soát chưa hoàn tất. Xem mục rà soát của dự án để biết bước tiếp theo.</p>'
          : '<p class="error">Luồng tạm dừng vì file .md / thư viện có điểm bất thường mới: duyệt ở mục rà soát phía trên để chạy tiếp.</p>';
      }
      if (r.status === "awaiting_approval") body += `<pre class="desk-report" tabindex="0">${esc(r.report || "Chưa có nội dung báo cáo.")}</pre><div class="desk-actions">${action("autopilot", r.id, "approve", "Duyệt báo cáo")}${action("autopilot", r.id, "reject", "Từ chối")}</div>`;
      if (r.status === "attention") body += action("autopilot", r.id, "approve", "Đã xem lỗi");
      if (r.status === "waiting_quota") body += `<p>${esc(r.wait?.providerName || r.wait?.role || "AI")} hết hạn mức. Tự chạy lại: ${esc(time(r.wait?.until))}</p><div class="desk-actions">${action("autopilot", r.id, "resume", "Chạy lại ngay")}${isRemote ? "" : '<a href="prototype.html#board">Dán kết quả GPT web</a>'}</div>`;
      if (["approved", "acknowledged"].includes(r.status)) body += `<p>Nhánh: ${esc(r.git.branch)}</p>` + (isRemote ? '<p class="muted">Đẩy nhánh lên GitHub chỉ thực hiện trên máy tính.</p>' : action("autopilot", r.id, "push", "Đẩy nhánh lên GitHub & mở PR"));
      return `<article class="desk-entry"><strong>${esc(first(r.task))}</strong><p>${esc(statuses[r.status])}</p>${body}</article>`;
    }).join("");
    html += manual.map((h) => `<article class="desk-entry"><strong>Bàn giao: ${esc(h.role)} → ${esc(h.next_owner || "Chờ phương án")}</strong>${h.problems?.length ? `<p class="error">${esc(h.problems.join("; "))}</p>` : ""}${h.payload?.ask_ceo ? question(h.payload.ask_ceo, "handoffs", h.job_id) : action("handoffs", h.job_id, "approve", "Duyệt chuyển lượt", undefined, !!h.problems?.length)}</article>`).join("");
    const ready = publishReady();
    if (ready) html += `<article class="desk-entry"><strong>Xuất bản ${esc(publish.repo || "dự án")}</strong><p>Đã kiểm tra và build thử xong (${esc(ready.sha?.slice(0, 7) || "")}), chờ anh bấm Xuất bản.</p><div class="desk-actions"><button type="button" data-desk="publish">Mở mục Xuất bản</button></div></article>`;
    if (compareUrl) html += `<p><a href="${esc(compareUrl)}" target="_blank" rel="noopener noreferrer">Mở trang tạo PR trên GitHub</a></p>`;
    $("deskApprovals").innerHTML = errors.workspace || !active || !dataReady ? messageHtml("runs", "") :
      (errors.runs ? messageHtml("runs", "") : "") + (errors.handoffs ? messageHtml("handoffs", "") : "") + (html || (!errors.runs && !errors.handoffs ? messageHtml("runs", "Không có việc chờ anh duyệt.") : ""));
    const count = waiting.length + manual.length + (scan && !scan.approved ? 1 : 0) + (ready ? 1 : 0), unknown = !!(errors.workspace || errors.runs || errors.handoffs);
    $("ceoWaitPill").hidden = !count && !unknown;
    $("ceoWaitTxt").textContent = unknown ? "Chưa đọc được việc chờ" : count + " việc chờ anh";
    document.title = (count ? `(${count}) ` : "") + "Văn phòng AI";
  }
  function renderIdeas() {
    $("deskIdeas").innerHTML = errors.workspace || errors.ideas || !active || !dataReady ? messageHtml("ideas", "") : ideas.length ? ideas.map((i) => `<article class="desk-entry"><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p><p>${esc(i.run ? statuses[i.run.status] || i.run.status : "Chưa giao")}</p>${action("ideas", i.id, "start", "Giao Hinata đặc tả", undefined, !!i.run && live.has(i.run.status))}</article>`).join("") : messageHtml("ideas", "Dự án chưa có ý tưởng nào.");
  }
  // Điều phối model + mức suy nghĩ (ctl/dieu-phoi.js): mặc định tự động theo độ khó và hạn mức; CEO cố định được cho từng phòng.
  const DP_ROOMS = [["hinata", "Hinata · Antigravity", "agy"], ["itachi", "Itachi · Codex Sol", "codex"], ["sasuke", "Sasuke · Codex Astra", "codex"], ["kakashi", "Kakashi · Antigravity", "agy"], ["sakura", "Sakura · Claude duyệt", "claude"], ["pain", "Pain · Claude báo cáo", "claude"]];
  // Danh sách model thật của từng AI (GET /dieu-phoi/models, nhớ 6 giờ phía máy chủ). Chưa đọc được thì vẫn gõ tên model được.
  const DP_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
  let dpModels = null, dpModelsLoading = false, dpModelsError = "";
  async function loadDpModels(force = false) {
    if (dpModelsLoading) return;
    dpModelsLoading = true; dpModelsError = "";
    try { dpModels = (await request("/dieu-phoi/models" + (force ? "?lai=1" : ""), undefined, 60000)).models; }
    catch (e) { dpModelsError = e.message; }
    dpModelsLoading = false; renderQuotas(); if (sheet.open) veSheet();
  }
  const dpList = (kind) => (dpModels && dpModels[kind] && dpModels[kind].models) || [];
  function dpRow([room, label, kind]) {
    const f = dieuPhoi.coDinh?.[room] || null, list = dpList(kind);
    const model = !f || !f.model ? "auto" : list.some((m) => m.id === f.model) ? f.model : "__khac";
    const own = f && f.model && list.find((m) => m.id === f.model);
    const efforts = own && own.efforts && own.efforts.length ? own.efforts : kind === "codex" ? [...DP_EFFORTS, "ultra"] : DP_EFFORTS;
    const err = dpModels && dpModels[kind] && dpModels[kind].error;
    const opt = (v, t, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(t)}</option>`;
    return `<fieldset class="dp-row" data-dp-room="${room}"><legend>${esc(label)}</legend>` +
      `<label>Model <select data-dp-model data-write>` + opt("auto", kind === "codex" ? "Theo vai (tự động)" : "Tự động", model === "auto") +
      list.map((m) => opt(m.id, m.name !== m.id ? m.name + " · " + m.id : m.id, m.id === model)).join("") +
      opt("__khac", "Khác… (gõ tên model)", model === "__khac") + `</select></label>` +
      `<label${model === "__khac" ? "" : " hidden"}>Tên model <input data-dp-custom data-write maxlength="60" value="${esc(model === "__khac" ? f.model : "")}" placeholder="vd. gemini-3.8-flash-high"></label>` +
      `<label>Mức suy nghĩ <select data-dp-effort data-write>` + opt("", f ? "Mặc định của CLI" : "Tự động", !f || !f.effort) +
      efforts.map((e) => opt(e, e, !!f && f.effort === e)).join("") + `</select></label>` +
      (err ? `<small class="muted">Chưa đọc được danh sách model: ${esc(err)}</small>` : "") + "</fieldset>";
  }
  function dieuPhoiHtml() {
    if (!dieuPhoi) return errors.dieuPhoi ? `<p class="error">${esc(errors.dieuPhoi)}</p>` : "";
    if (!dpModels && !dpModelsLoading && !dpModelsError) loadDpModels();
    const b = dieuPhoi.bang || {}, row = (k) => ["nhe", "vua", "nang"].map((t) => `${{ nhe: "nhẹ", vua: "vừa", nang: "nặng" }[t]}: ${esc([b[k]?.[t]?.model, b[k]?.[t]?.effort].filter(Boolean).join(" ") || "mặc định")}`).join(" · ");
    return `<article class="desk-entry"><strong>Điều phối model &amp; mức suy nghĩ</strong>` +
      (isRemote ? `<p class="muted">Chế độ tự động: <b>${dieuPhoi.tuDong ? "đang bật" : "đang tắt"}</b> (bật/tắt tự động trên máy tính; chọn model cố định theo phòng bên dưới dùng được từ điện thoại).</p>`
        : `<p><label><input type="checkbox" data-dp-auto ${dieuPhoi.tuDong ? "checked" : ""}> Tự động theo độ khó của lượt và hạn mức còn lại</label></p>`) +
      `<p class="muted">Lượt nhẹ (báo cáo, sửa chữ), vừa (việc thường), nặng (kiến trúc, bảo mật, blocker CRITICAL, lượt bị trả lại). AI còn ≤15% hạn mức thì hạ một bậc.<br>Claude — ${row("claude")}<br>Codex — ${row("codex")}<br>Antigravity — ${row("agy")}</p>` +
      `<p class="muted">Chọn model hoặc mức cho phòng nào thì phòng đó dùng đúng như vậy, bỏ qua tự động. ` +
      (dpModelsLoading ? "Đang đọc danh sách model của các AI…" : `<button type="button" class="btn ghost" data-dp-reload data-write>Đọc lại danh sách model</button>`) +
      (dpModelsError ? ` <span class="error">${esc(dpModelsError)}</span>` : "") + "</p>" +
      DP_ROOMS.map(dpRow).join("") + "</article>";
  }
  async function saveDieuPhoi(body, label) {
    try { const d = await request("/dieu-phoi", body); dieuPhoi = d.dieuPhoi; notice(label); }
    catch (e) { notice(e.message, true); }
    renderQuotas();
  }

  // Tài khoản Antigravity (ctl/agy-tai-khoan.js): family + Pro, xem hạn mức song song, đổi tay hoặc tự chuyển khi cạn.
  function agyTkHtml(tk) {
    if (!tk) return "";
    if (!tk.hoTro) return `<p class="muted">Đổi tài khoản Antigravity hiện chỉ làm được trên Windows.</p>`;
    const pct = (v) => v === null || v === undefined ? "chưa đọc" : "còn " + Math.round(v) + "%";
    const rows = (tk.ds || []).map((a) => `<li><strong>${esc(a.nhan)}</strong> · ${esc(a.email)}${a.dangDung ? " · <b>đang dùng</b>" : ""}<br>Gemini ${esc(pct(a.conLai))}` +
      `${a.hanMuc && a.hanMuc.luc ? " · đọc lúc " + esc(time(a.hanMuc.luc)) : ""}<br>` +
      (a.dangDung ? "" : `<button type="button" class="btn ghost" data-agy-chuyen="${esc(a.id)}" data-write>Dùng tài khoản này</button> `) +
      (isRemote ? "" : `<button type="button" class="btn ghost" data-agy-xoa="${esc(a.id)}" data-write>Bỏ</button>`) + `</li>`).join("");
    return `<div class="agy-tk"><strong>Tài khoản Antigravity</strong>${tk.loi ? `<p class="error">${esc(tk.loi)}</p>` : ""}${tk.dangTrao ? "<p>Đang đổi tài khoản để đọc hạn mức…</p>" : ""}` +
      (rows ? `<ul>${rows}</ul>` : "<p class=\"muted\">Chưa cất tài khoản nào.</p>") +
      (isRemote ? `<p class="muted">Đổi tài khoản hoạt động trên điện thoại; cất/bỏ tài khoản và cấu hình tự chuyển thực hiện trên máy tính.</p></div>`
        : `<p><label><input type="checkbox" data-agy-tu data-write ${tk.tuChuyen ? "checked" : ""}> Tự chuyển khi tài khoản đang dùng còn ≤ </label><input type="number" min="1" max="50" value="${esc(tk.nguong)}" data-agy-nguong data-write style="width:4.5em">% Gemini</p>` +
          `<p><label>Cất tài khoản đang đăng nhập trong Antigravity, đặt tên <input data-agy-nhan maxlength="40" placeholder="vd. Pro" style="width:8em"></label> <button type="button" class="btn ghost" data-agy-cat data-write>Cất</button>` +
          ((tk.ds || []).length > 1 ? ` <button type="button" class="btn ghost" data-agy-doc data-write>Đọc hạn mức tài khoản đang nghỉ</button>` : "") + "</p>" +
          `<p class="muted">Thêm tài khoản thứ hai: mở <code>agy</code> trong terminal, gõ <code>/logout</code>, đăng nhập tài khoản kia, rồi bấm Cất. Văn phòng chỉ đổi tài khoản khi không có tiến trình Antigravity CLI nào chạy; ứng dụng Antigravity trên máy có thể dùng chung đăng nhập này.</p></div>`);
  }
  async function agyTkGoi(path, body, label) {
    try { await request(path, body, 60000); notice(label); quotas = await request("/quotas"); }
    catch (e) { notice(e.message, true); }
    renderQuotas();
  }
  // Tài khoản GPT cho Codex (ctl/codex-tai-khoan.js, CEO yêu cầu 20/11/2026): mỗi tài khoản một thư mục CODEX_HOME,
  // xem hạn mức song song, đổi tay hoặc tự chuyển khi cạn. Đăng nhập: văn phòng mở `codex login`, anh bấm trên trình duyệt.
  let gptTimer = null;
  function codexTkHtml(tk) {
    if (!tk) return "";
    const pct = (v) => v === null || v === undefined ? "chưa đọc" : "còn " + Math.round(v) + "%";
    const dangDN = (tk.ds || []).some((a) => a.dangNhap && !a.dangNhap.loi);
    clearTimeout(gptTimer);
    if (dangDN) gptTimer = setTimeout(async () => { try { quotas = await request("/quotas"); renderQuotas(); } catch {} }, 4000);   // chờ anh đăng nhập xong
    const rows = (tk.ds || []).map((a) => {
      const dn = a.dangNhap, dnUrl = safeHttps(dn && dn.url);
      return `<li><strong>${esc(a.nhan)}</strong>${a.email ? " · " + esc(a.email) : ""}${a.plan ? " · gói " + esc(a.plan) : ""}${a.dangDung ? " · <b>đang dùng</b>" : ""}<br>` +
        (a.loi ? `<span class="error">${esc(a.loi)}</span>` : `GPT ${esc(pct(a.conLai))}${a.hanMuc && a.hanMuc.luc ? " · đọc lúc " + esc(time(a.hanMuc.luc)) : ""}`) + "<br>" +
        (dnUrl ? `<span>Đang chờ anh đăng nhập: <a href="${esc(dnUrl)}" target="_blank" rel="noopener noreferrer">mở trang đăng nhập</a> (nếu trình duyệt đang đăng nhập tài khoản GPT khác, chép link mở trong cửa sổ ẩn danh Ctrl+Shift+N). Làm trên máy tính này.</span><br>`
          : dn && !dn.loi ? "<span>Đang mở trang đăng nhập…</span><br>" : dn && dn.loi ? `<span class="error">${esc(dn.loi)}</span><br>` : "") +
        (a.dangDung || !a.daDangNhap ? "" : `<button type="button" class="btn ghost" data-gpt-chuyen="${esc(a.id)}" data-write>Dùng tài khoản này</button> `) +
        (isRemote ? "" : `<button type="button" class="btn ghost" data-gpt-dn="${esc(a.id)}" data-write>${a.daDangNhap ? "Đăng nhập lại" : "Đăng nhập"}</button> ` +
          (a.macDinh ? "" : `<button type="button" class="btn ghost" data-gpt-bo="${esc(a.id)}" data-write>Bỏ</button>`)) + "</li>";
    }).join("");
    return `<div class="agy-tk"><strong>Tài khoản GPT (Codex: Itachi, Sasuke)</strong>` +
      (tk.trung ? `<p class="error">Hai tài khoản đang cùng một email: bấm Đăng nhập lại ở tài khoản thêm và chọn đúng tài khoản GPT kia.</p>` : "") +
      `<ul>${rows}</ul>` +
      (isRemote ? `<p class="muted">Đổi tài khoản GPT hoạt động trên điện thoại; thêm, đăng nhập và cấu hình tự chuyển thực hiện trên máy tính.</p></div>`
        : `<p><label><input type="checkbox" data-gpt-tu data-write ${tk.tuChuyen ? "checked" : ""}> Tự chuyển khi tài khoản đang dùng còn ≤ </label><input type="number" min="1" max="50" value="${esc(tk.nguong)}" data-gpt-nguong data-write style="width:4em">% ` +
          `(và đổi ngay khi lượt Codex báo hết hạn mức)</p>` +
          `<p><label>Thêm tài khoản GPT, đặt tên <input data-gpt-nhan maxlength="40" placeholder="vd. GPT Pro 2" style="width:9em"></label> <button type="button" class="btn ghost" data-gpt-them data-write>Thêm và đăng nhập</button>` +
          ` <button type="button" class="btn ghost" data-gpt-doc data-write>Đọc hạn mức mọi tài khoản</button></p>` +
          `<p class="muted">Mỗi tài khoản GPT có thư mục riêng; tài khoản 1 là ~/.codex mà app Codex của anh đang dùng. Đổi tài khoản áp dụng từ lượt Codex kế tiếp, lượt đang chạy không bị ảnh hưởng.</p></div>`);
  }
  async function gptGoi(path, body, label) {
    try { await request(path, body, 60000); notice(label); quotas = await request("/quotas"); }
    catch (e) { notice(e.message, true); }
    renderQuotas();
  }
  // Khối tài khoản trong menu điện thoại: danh sách tài khoản Antigravity (đang dùng + % còn lại), đổi bằng một chạm.
  function renderTkMenu() {
    const tk = quotas?.providers?.find((p) => p.id === "antigravity")?.taiKhoan;
    const pct = (v) => v === null || v === undefined ? "" : " · " + Math.round(v) + "%";
    const ds = tk && tk.hoTro ? tk.ds || [] : [];
    tkMenu.innerHTML = '<strong>Tài khoản</strong>' +
      (ds.length ? '<div class="desk-tk-ds">' + ds.map((a) => `<button type="button" class="btn ghost${a.dangDung ? " on" : ""}" data-tk-chuyen="${esc(a.id)}" data-tk-nhan="${esc(a.nhan)}"${a.dangDung ? ' aria-current="true"' : ""} title="${a.dangDung ? "Đang dùng" : "Đổi Antigravity sang tài khoản này"}">${a.dangDung ? "✓ " : ""}${esc(a.nhan)}${esc(pct(a.conLai))}</button>`).join("") + "</div>"
        : !quotas ? '<p class="muted">Đang tải tài khoản…</p>' : errors.quotas ? `<p class="error">${esc(errors.quotas)}</p>` : tk && !tk.hoTro ? '<p class="muted">Đổi tài khoản Antigravity chỉ làm được khi văn phòng chạy trên Windows.</p>' : '<p class="muted">Chưa cất tài khoản Antigravity nào.</p>') +
      (tk && tk.loi ? `<p class="error">${esc(tk.loi)}</p>` : "") +
      (tk && tk.dangTrao ? '<p class="muted">Đang đổi tài khoản để đọc hạn mức…</p>' : "") +
      gptMenuHtml(pct) +
      '<button type="button" class="btn ghost" data-tk-quanly>Quản lý tài khoản Antigravity / GPT</button>' +
      '<button type="button" class="btn ghost" data-tk-ai>Tài khoản AI (Claude, GPT, Gemini)</button>';
    tkMenu.querySelectorAll("[data-tk-chuyen]").forEach((b) => { b.disabled = mutating || b.classList.contains("on") || !!(tk && tk.dangTrao); });
    tkMenu.querySelectorAll("[data-gpt-tk]").forEach((b) => { b.disabled = mutating || b.classList.contains("on"); });
  }
  // Tài khoản GPT (Codex) đã đăng nhập: đổi bằng một chạm trên điện thoại (chỉ hiện khi có từ 2 tài khoản).
  function gptMenuHtml(pct) {
    const gtk = quotas?.providers?.find((p) => p.id === "codex")?.taiKhoan;
    const ds = gtk ? (gtk.ds || []).filter((a) => a.daDangNhap) : [];
    if (ds.length < 2) return "";
    return '<strong>GPT (Codex)</strong><div class="desk-tk-ds">' + ds.map((a) => `<button type="button" class="btn ghost${a.dangDung ? " on" : ""}" data-gpt-tk="${esc(a.id)}" data-tk-nhan="${esc(a.nhan)}"${a.dangDung ? ' aria-current="true"' : ""} title="${a.dangDung ? "Đang dùng" : "Đổi Codex sang tài khoản GPT này"}">${a.dangDung ? "✓ " : ""}${esc(a.nhan)}${esc(pct(a.conLai))}</button>`).join("") + "</div>";
  }
  // Model của từng phòng hiện trên nhãn tên nhân vật trong 3D; chạm vào thì mở mục Hạn mức ở đúng dòng chọn model của phòng đó.
  function veModelNhan() {
    const office = getOffice();
    if (!office || !office.setModel) return;
    for (const [room] of DP_ROOMS) {
      const f = dieuPhoi && dieuPhoi.coDinh ? dieuPhoi.coDinh[room] : null;
      const text = !dieuPhoi ? "" : f && f.model ? f.model + (f.effort ? " · " + f.effort : "") : f && f.effort ? "Tự động · " + f.effort : dieuPhoi.tuDong ? "Tự động" : "Mặc định CLI";
      office.setModel(room, text ? "⚙ " + text : "", moChonModel);
    }
  }
  // Bảng chọn model cho một phòng (chạm ô ⚙ dưới tên nhân vật — CEO yêu cầu 17/11/2026: chạm để chọn, không bắt gõ tên).
  // Model thật của AI phòng đó dạng thẻ (ghi "chỉ Pro"/"chỉ Family" nếu chỉ một tài khoản Antigravity có), mức suy nghĩ dạng nút,
  // gõ tên tay chỉ là lựa chọn phụ. Lưu = POST /dieu-phoi { coDinh: { phòng: { model, effort } | null } }.
  const AI_TEN = { agy: "Antigravity", codex: "Codex", claude: "Claude" };
  const TEN_MUC = { low: "Thấp", medium: "Vừa", high: "Cao", xhigh: "Rất cao", max: "Tối đa", ultra: "Ultra" };
  // Model chỉ có mã (đọc lúc tài khoản đó đang nghỉ): "claude-opus-5-5-high" → "Claude Opus 5.5 (High)".
  function tenDep(id) {
    const t = String(id).split("-").filter(Boolean), out = [];
    let muc = "";
    if (t.length > 1 && /^(minimal|low|medium|high|xhigh|max|thinking)$/i.test(t[t.length - 1])) muc = t.pop();
    for (const x of t) {
      if (/^\d+$/.test(x) && out.length && /^\d+(\.\d+)*$/.test(out[out.length - 1])) out[out.length - 1] += "." + x;
      else out.push(/^[a-z]/.test(x) ? x[0].toUpperCase() + x.slice(1) : x.toUpperCase());
    }
    return out.join(" ") + (muc ? " (" + muc[0].toUpperCase() + muc.slice(1) + ")" : "");
  }
  const sheet = document.createElement("dialog"); sheet.className = "desk-dialog model-sheet"; sheet.setAttribute("aria-labelledby", "msTitle");
  document.body.append(sheet);
  let msRoom = null, msChon = null, msBan = false, msLoi = "";
  function moChonModel(room) {
    if (!DP_ROOMS.some((x) => x[0] === room)) return;
    const f = dieuPhoi && dieuPhoi.coDinh ? dieuPhoi.coDinh[room] : null;
    msRoom = room; msChon = { model: f && f.model ? f.model : null, effort: f && f.effort ? f.effort : null }; msLoi = "";
    veSheet();
    if (!sheet.open) sheet.showModal();
    if (!dpModels && !dpModelsLoading) loadDpModels();
  }
  function veSheet() {
    if (!msRoom) return;
    const [room, label, kind] = DP_ROOMS.find((x) => x[0] === msRoom);
    const list = dpList(kind), cur = msChon.model;
    const f = dieuPhoi && dieuPhoi.coDinh ? dieuPhoi.coDinh[room] : null;
    const dangDung = !dieuPhoi ? "đang tải…" : f && (f.model || f.effort) ? [f.model || "model tự động", f.effort ? "mức " + (TEN_MUC[f.effort] || f.effort) : ""].filter(Boolean).join(" · ") : dieuPhoi.tuDong ? "Tự động (theo độ khó)" : "Mặc định của CLI";
    const own = list.find((m) => m.id === cur);
    const efforts = own && own.efforts && own.efforts.length ? own.efforts : kind === "codex" ? [...DP_EFFORTS, "ultra"] : DP_EFFORTS;
    const loi = (dpModels && dpModels[kind] && dpModels[kind].error) || dpModelsError;
    const the = (on, attrs, ten, phu) => `<button type="button" class="ms-the${on ? " on" : ""}" ${attrs} aria-pressed="${on}"${msBan ? " disabled" : ""}><b>${esc(ten)}</b>${phu ? `<small>${esc(phu)}</small>` : ""}</button>`;
    const body = sheet.querySelector(".desk-body"), cuon = body ? body.scrollTop : 0;
    sheet.innerHTML = `<div class="desk-head"><h2 id="msTitle">Model cho ${esc(label)}</h2><button type="button" data-ms-dong>Đóng</button></div><div class="desk-body">` +
      `<p class="muted">Đang dùng: <b>${esc(dangDung)}</b></p>` +
      '<h3 class="ms-h">Model</h3><div class="ms-ds" role="group" aria-label="Chọn model">' +
      the(!cur, 'data-ms-model=""', kind === "codex" ? "Theo vai (tự động)" : "Tự động", "Văn phòng tự chọn theo độ khó của lượt và hạn mức còn lại") +
      list.map((m) => the(m.id === cur, `data-ms-model="${esc(m.id)}"`, (String(m.name || m.id).replace(/ · chỉ .*$/, "") === m.id ? tenDep(m.id) : String(m.name).replace(/ · chỉ .*$/, "")),
        [m.id, m.chiCo && m.chiCo.length ? "chỉ tài khoản " + m.chiCo.join(", ") : ""].filter(Boolean).join(" · "))).join("") +
      (cur && !own ? the(true, `data-ms-model="${esc(cur)}"`, cur, list.length ? "đang cố định, không có trong danh sách vừa đọc" : "đang cố định") : "") +
      "</div>" +
      (dpModelsLoading && !list.length ? `<p class="muted ms-dang">Đang đọc danh sách model của ${esc(AI_TEN[kind])}… Lần đầu sau khi bật văn phòng có thể mất tới 1 phút.</p>` : "") +
      (loi && !list.length ? `<p class="error">Chưa đọc được danh sách model: ${esc(loi)}</p>` : "") +
      (!dpModelsLoading ? '<p><button type="button" class="btn ghost" data-ms-lai>Đọc lại danh sách model</button></p>' : "") +
      `<details class="ms-khac"><summary>Gõ tên model khác</summary><label>Tên model <input data-ms-go maxlength="60" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="vd. gemini-3.8-flash-high"></label><button type="button" data-ms-dung-go>Dùng tên này</button></details>` +
      '<h3 class="ms-h">Mức suy nghĩ</h3><div class="ms-muc" role="group" aria-label="Chọn mức suy nghĩ">' +
      the(!msChon.effort, 'data-ms-effort=""', cur ? "Mặc định" : "Tự động") + efforts.map((e) => the(msChon.effort === e, `data-ms-effort="${esc(e)}"`, TEN_MUC[e] || e)).join("") + "</div>" +
      `<p class="desk-message${msLoi ? " error" : ""}" role="status">${esc(msLoi)}</p>` +
      `<div class="desk-actions"><button type="button" class="ms-luu" data-ms-luu${msBan ? " disabled" : ""}>${msBan ? "Đang lưu…" : "Lưu cho " + esc(label.split(" · ")[0])}</button><button type="button" data-ms-dong>Huỷ</button></div></div>`;
    const moi = sheet.querySelector(".desk-body"); if (moi) moi.scrollTop = cuon;
  }
  sheet.addEventListener("click", async (e) => {
    if (e.target === sheet) return sheet.close();   // chạm ra ngoài hộp
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.matches("[data-ms-dong]")) return sheet.close();
    if (b.matches("[data-ms-lai]")) return loadDpModels(true);
    if (b.hasAttribute("data-ms-model")) { msChon.model = b.dataset.msModel || null; msLoi = ""; return veSheet(); }
    if (b.hasAttribute("data-ms-effort")) { msChon.effort = b.dataset.msEffort || null; msLoi = ""; return veSheet(); }
    if (b.matches("[data-ms-dung-go]")) {
      const v = String(sheet.querySelector("[data-ms-go]").value || "").trim();
      if (!/^[\w.:-]{2,60}$/.test(v)) { msLoi = "Tên model chỉ gồm chữ, số và . : - _ (2–60 ký tự)."; return veSheet(); }
      msChon.model = v; msLoi = ""; return veSheet();
    }
    if (b.matches("[data-ms-luu]")) {
      msBan = true; msLoi = ""; veSheet();
      const v = !msChon.model && !msChon.effort ? null : { model: msChon.model, effort: msChon.effort };
      try { const d = await request("/dieu-phoi", { coDinh: { [msRoom]: v } }, 20000); dieuPhoi = d.dieuPhoi || dieuPhoi; veModelNhan(); msBan = false; sheet.close(); renderQuotas(); }
      catch (err) { msBan = false; msLoi = "Chưa lưu được: " + err.message; veSheet(); }
    }
  });
  sheet.addEventListener("close", () => { msRoom = null; });
  function renderQuotas() {
    renderTkMenu(); veModelNhan();
    $("deskQuotas").innerHTML = errors.quotas ? `<p class="error">${esc(errors.quotas)}</p>` : !quotas ? '<p>Đang tải hạn mức…</p>' : !quotas.providers?.length ? '<p>Chưa có dữ liệu hạn mức từ các AI.</p>' : quotas.providers.map((p) => {
      const stale = p.status !== "ready" || (p.lastSuccessAt && Date.now() - new Date(p.lastSuccessAt).getTime() > 3 * (quotas.intervalMs || 120000));
      return `<article class="desk-entry"><strong>${esc(p.name)}</strong>${p.refreshing ? "<p>Đang cập nhật hạn mức…</p>" : ""}${p.error ? `<p class="error">${esc(p.error)}</p>` : ""}${stale ? "<p>Bản đọc chưa được xác nhận; chưa thể kết luận AI còn lượt.</p>" : ""}${(p.buckets || []).map((b) => `<p>${esc([b.group, b.label].filter(Boolean).join(" · "))}: ${Number.isFinite(b.remainingPercent) ? "còn " + esc(b.remainingPercent) + "%" : "Chưa có số liệu"}<br>Mở lại: ${esc(b.resetAt ? time(b.resetAt) : b.resetLabel || "Chưa rõ")}${b.resetAt && new Date(b.resetAt).getTime() <= Date.now() ? " · Đã qua mốc, chờ số liệu mới" : ""}</p>`).join("") || "<p>Chưa có số liệu hạn mức.</p>"}${p.id === "antigravity" ? agyTkHtml(p.taiKhoan) : ""}${p.id === "codex" ? codexTkHtml(p.taiKhoan) : ""}</article>`;
    }).join("") + dieuPhoiHtml();
    const p = quotas?.providers?.find((x) => x.id === "claude"), buckets = !errors.quotas && p?.status === "ready" && (!p.lastSuccessAt || Date.now() - new Date(p.lastSuccessAt).getTime() <= 3 * (quotas.intervalMs || 120000)) ? (p.buckets || []).filter((b) => Number.isFinite(b.remainingPercent) && (!b.resetAt || new Date(b.resetAt).getTime() > Date.now())) : [];
    const left = buckets.length ? Math.min(...buckets.map((b) => b.remainingPercent)) : null;
    $("claudeLowPill").hidden = left === null || left > 8;
    if (left !== null && left <= 8) $("claudeLowTxt").textContent = `Claude còn ${Math.round(left)}% hạn mức: dành cho điều phối`;
  }
  const PUBLISH = { running: "Đang kiểm tra & build", ready: "Sẵn sàng, chờ anh bấm Xuất bản", releasing: "Đang gửi lên GitHub", released: "Đã gửi xuất bản: GitHub Actions đang build", failed: "Chưa đạt" };
  const STEP = { done: "✓", failed: "✗", running: "…", skipped: "⏭" };
  const publishReady = () => publish && publish.workspace === active && publish.release ? (publish.runs || []).find((r, i) => i === 0 && r.status === "ready") : null;
  const howRelease = (m) => !m ? '<span class="error">repo chưa có workflow xuất bản: giao Astra thêm .github/workflows/release.yml (đẩy tag v* → GHCR + Releases)</span>'
    : m.mode === "tag" ? `đẩy tag <span class="mono">${esc(m.pattern)}</span> → workflow <span class="mono">${esc(m.file)}</span>`
    : `chạy tay workflow <span class="mono">${esc(m.file)}</span>${m.publishInput ? " (" + esc(m.publishInput) + " = true" : ""}${m.versionInput ? ", " + esc(m.versionInput) + " = phiên bản)" : m.publishInput ? ")" : ""}`;
  function renderPublish() {
    const box = $("deskPublish");
    if (errors.workspace || errors.publish || !active || !publish || publish.workspace !== active) { box.innerHTML = messageHtml("publish", "Đang tải…"); return; }

    $("deskPrepare").dataset.invalid = String((publish.runs || []).some((r) => ["running", "releasing"].includes(r.status)));
    let html = (isRemote ? `<p class="muted">Trên điện thoại chỉ xem trạng thái xuất bản. Kiểm tra, build và xuất bản chỉ thực hiện trên máy tính.</p>` : "") +
      `<p>Repo: <span class="mono">${esc(publish.repo || "chưa nhận ra repo GitHub")}</span> · Dockerfile: ${publish.dockerfile ? "có" : '<span class="error">chưa có, giao Astra viết ở Phase Docker</span>'}<br>Cách xuất bản: ${howRelease(publish.release)}${publish.version ? ` · Phiên bản trong code: <b>${esc(publish.version)}</b>` : ""}</p>`;
    html += (publish.runs || []).map((r, i) => {
      const steps = (r.steps || []).map((st) => `<li>${STEP[st.status] || "·"} ${esc(st.name)}${st.note ? `<br><small>${esc(st.note)}</small>` : ""}</li>`).join("");
      const can = !isRemote && i === 0 && r.status === "ready" && publish.release;
      const actUrl = safeHttps(r.release && r.release.actionsUrl);
      return `<article class="desk-entry"><strong>${esc(r.tag || "Lượt " + r.id)}</strong><p>${esc(PUBLISH[r.status] || r.status)} · ${esc(time(r.release?.at || r.createdAt))}</p>${r.problem ? `<p class="error">${esc(r.problem)}</p>` : ""}<ol class="desk-steps">${steps}</ol>` +
        (r.release ? `<p>Phiên bản <b>${esc(r.release.tag)}</b> · ${actUrl ? `<a href="${esc(actUrl)}" target="_blank" rel="noopener noreferrer">Xem GitHub Actions</a>` : "xem trang Actions của repo"}</p>` : "") +
        (can ? `<div class="desk-actions"><label>Phiên bản <input data-version="${esc(r.id)}" value="${esc(publish.version || "")}" placeholder="X.Y.Z" maxlength="20" size="10"></label><button type="button" data-publish="${esc(r.id)}" data-write>Xuất bản qua GitHub</button></div>` : "") + "</article>";
    }).join("") || '<p class="muted">Chưa có lượt kiểm tra nào.</p>';
    box.innerHTML = html;
  }
  // Nhật ký: dòng thời gian "ai làm gì, lúc nào" (ctl /nhat-ky), mới nhất trên cùng.
  const NPC = { pain: ["Pain", "#dc2626"], hinata: ["Hinata", "#9333ea"], itachi: ["Itachi", "#059669"], sasuke: ["Sasuke", "#2563eb"], kakashi: ["Kakashi", "#71717a"], sakura: ["Sakura", "#db2777"] };
  const hhmm = (t) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  function renderJournal() {
    const box = $("deskJournal");
    if (errors.workspace || errors.journal || !active || !journal) { box.innerHTML = messageHtml("journal", "Đang tải nhật ký…"); return; }
    box.innerHTML = journal.length ? journal.map((e) => { const [name, color] = NPC[e.who] || NPC.pain;
      return `<article class="j-item j-${esc(e.kind)}"><span class="j-av" style="background:${color}" title="${esc(name)}">${esc(name[0])}</span><p><b>${esc(name)}:</b> ${esc(e.text)} <time>${esc(hhmm(e.at))}</time></p></article>`; }).join("")
      : messageHtml("journal", "Chưa có hoạt động nào của dự án này. Giao việc cho cả đội để bắt đầu.");
  }
  function renderProgress() {
    $("deskProgress").innerHTML = errors.workspace || errors.overview || !overview || overview.workspace !== active ? messageHtml("overview", active ? "Đang đọc tiến độ dự án…" : "Chưa chọn dự án.") : globalThis.RepoProgress.html(overview, runs, ownHandoffs(), errors, { actions: !isRemote });
  }
  function render() {
    $("deskWorkspace").textContent = errors.workspace || (active ? "Dự án: " + (workspaces.find((w) => w.path === active)?.name || active) : dataReady ? "Chưa chọn dự án." : "Đang đọc dự án…");
    const selection = $("deskProject").value;
    $("deskProject").innerHTML = workspaces.length ? workspaces.map((w) => `<option value="${esc(w.path)}">${esc(w.name)}${w.path === active ? " · Đang chọn" : ""}</option>`).join("") : '<option value="">Chưa có dự án đã đăng ký</option>';
    $("deskProject").value = workspaces.some((w) => w.path === selection) ? selection : active || "";
    $("deskAssignState").textContent = state("runs", ownRuns().some((r) => live.has(r.status)) ? "Dự án đang có luồng hoặc việc chờ xử lý. Xem Việc đang làm." : "Dự án chưa có luồng đang chạy; anh có thể giao việc mới.");
    renderTasks(); renderApprovals(); renderIdeas(); renderQuotas(); renderProgress(); renderPublish(); renderJournal(); lock();
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
          ["dieuPhoi", "/dieu-phoi", (d) => { dieuPhoi = d.dieuPhoi || null; }],
          ...(active ? [["scan", "/scan?workspace=" + encodeURIComponent(active), (d) => { scan = d.scan || null; }]] : []),
          ...(active ? [["publish", "/publish?workspace=" + encodeURIComponent(active), (d) => { publish = d.publish || null; }]] : []),
          ...(active ? [["journal", "/nhat-ky?workspace=" + encodeURIComponent(active) + "&limit=120", (d) => { journal = d.nhatKy || null; }]] : []),
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
  // Tạo dự án mới (ctl/du-an-moi.js): gợi ý tên repo → anh chọn/sửa → Duyệt & tạo → theo dõi từng bước. Dùng được trên điện thoại đã ghép.
  const DAM_TT = { cho: "chờ", dang: "đang làm…", xong: "xong", loi: "lỗi", "bo-qua": "bỏ qua" };
  let damGoiYData = null, damOp = null, damTimer = null, damLoi = 0, damGui = false;
  const damKhoa = () => { damBan = damGui || !!(damOp && damOp.trangThai === "dang"); lock(); };
  const damTen = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  function renderDam() {
    const box = $("damKetQua");
    if (!box) return;
    if (damOp) {
      box.innerHTML = `<p><strong>${esc(damOp.ten)}</strong> · ${esc({ dang: "đang khởi động dự án…", xong: "đã xong", "xong-mot-phan": "xong, có bước lỗi", loi: "dừng vì lỗi" }[damOp.trangThai] || damOp.trangThai)}</p><ol>` +
        damOp.buoc.map((s) => `<li>${esc(s.ten)}: <b>${esc(DAM_TT[s.trangThai] || s.trangThai)}</b>${s.ghiChu ? `<br><small>${esc(s.ghiChu)}</small>` : ""}</li>`).join("") + "</ol>" +
        (damOp.trangThai !== "dang" ? `<div class="desk-actions"><button type="button" id="damMoi">Tạo dự án khác</button></div>` : "");
      return;
    }
    if (!damGoiYData) { box.innerHTML = ""; return; }
    const d = damGoiYData, first = d.goiY.find((g) => g.conTrong !== false) || d.goiY[0] || { ten: "", moTa: "" };
    box.innerHTML = `<p class="muted">${d.nguon === "ai" ? "Claude gợi ý" : "Gợi ý theo chữ trong ý tưởng"}${d.login ? " · tạo trong tài khoản GitHub <b>" + esc(d.login) + "</b>" : ""}${d.ghiChu ? " · " + esc(d.ghiChu) : ""}</p>` +
      d.goiY.map((g, i) => `<p><label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="damChon" value="${i}" style="width:auto" ${g === first ? "checked" : ""}><span><b>${esc(g.ten)}</b> ${g.conTrong === false ? '<span class="error">· đã có repo trùng tên</span>' : g.conTrong ? "· còn trống" : ""}<br><small>${esc(g.moTa)}</small></span></label></p>`).join("") +
      `<label for="damTenRepo">Tên repo (sửa được)</label><input id="damTenRepo" maxlength="40" value="${esc(first.ten)}">` +
      `<label for="damMoTa">Mô tả repo</label><input id="damMoTa" maxlength="350" value="${esc(first.moTa)}">` +
      `<fieldset style="border:0;padding:0;margin:8px 0"><legend>Loại dự án</legend>` +
      `<label style="display:inline-flex;gap:6px;margin-right:14px"><input type="radio" name="damLoai" value="phan-mem" style="width:auto" checked> Phần mềm</label>` +
      `<label style="display:inline-flex;gap:6px"><input type="radio" name="damLoai" value="phim" style="width:auto"> 🎬 Phim AI (hồ sơ phim, Hinata viết kịch bản)</label></fieldset>` +
      `<p><label><input type="checkbox" id="damBoKiem" style="width:auto" checked> Cài bộ kiểm chu trình CI (mở nhánh, anh merge sau)</label></p>` +
      `<p><label><input type="checkbox" id="damHinata" style="width:auto" checked> Giao Hinata viết đặc tả ngay sau khi tạo</label></p>` +
      `<p class="muted">Repo tạo ở chế độ riêng tư, tải về thư mục dự án trên máy. Văn phòng chỉ tạo khi anh bấm Duyệt.</p>` +
      `<div class="desk-actions"><button type="button" id="damDuyet" data-dam>Duyệt &amp; tạo dự án</button><button type="button" id="damHuy">Huỷ</button></div>`;
  }
  async function damTheoDoi() {
    clearTimeout(damTimer);
    if (!damOp || damOp.trangThai !== "dang") return;
    try { damOp = (await request("/du-an-moi/" + encodeURIComponent(damOp.id))).duAnMoi; damLoi = 0; }
    catch (e) {
      // ctl khởi động lại thì phiên theo dõi mất (NOT_FOUND): dừng hỏi, chỉ anh xem repo; lỗi mạng liên tiếp 5 lần cũng dừng.
      damLoi++;
      if (e.code === "NOT_FOUND" || damLoi >= 5) {
        damOp = { ...damOp, trangThai: "loi", buoc: damOp.buoc.map((x) => x.trangThai === "dang" ? { ...x, trangThai: "loi", ghiChu: "Mất phiên theo dõi (máy tính khởi động lại văn phòng?). Xem repo trên GitHub hoặc mục Tải repo GitHub; duyệt lại cùng tên để làm tiếp." } : x) };
        notice("Mất phiên theo dõi tạo dự án: " + e.message, true);
      }
    }
    renderDam(); damKhoa();
    if (damOp && damOp.trangThai === "dang") damTimer = setTimeout(damTheoDoi, 2000);
    else if (damOp) { notice(damOp.trangThai === "xong" ? "Đã khởi động dự án " + damOp.ten + "." : "Dự án " + damOp.ten + " dừng ở một bước lỗi: xem chi tiết trong mục Dự án.", damOp.trangThai !== "xong"); refreshNow(); }
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
  setInterval(() => { if (dialog.open && view === "journal" && !document.hidden) syncTurn(); }, 4000);
  dialog.addEventListener("close", () => toolbar.querySelectorAll("[data-desk]").forEach((b) => b.setAttribute("aria-expanded", "false")));
  $("deskRefresh").onclick = () => refreshNow();
  $("deskGithubLoad").onclick = () => loadGithub(); $("deskGithubMore").onclick = () => loadGithub(true);
  $("damGoiY").onclick = async () => {
    const yTuong = $("damYTuong").value.trim();
    if (yTuong.length < 10) { notice("Viết ý tưởng ít nhất 10 ký tự để văn phòng gợi ý tên.", true); return; }
    if (damOp && damOp.trangThai === "dang") { notice("Đang tạo dự án " + damOp.ten + ": chờ xong rồi gợi ý tiếp.", true); return; }
    damGui = true; damKhoa(); damOp = null; $("damKetQua").innerHTML = "<p>Đang nghĩ tên repo (tối đa 1 phút)…</p>";
    try { damGoiYData = (await request("/du-an-moi/goi-y", { yTuong }, 100000)).duAnMoi; } catch (e) { damGoiYData = null; notice(e.message, true); }
    damGui = false; renderDam(); damKhoa();
  };
  $("damKetQua").addEventListener("change", (e) => {
    if (e.target.name !== "damChon" || !damGoiYData) return;
    const g = damGoiYData.goiY[Number(e.target.value)];
    if (g) { $("damTenRepo").value = g.ten; $("damMoTa").value = g.moTa; }
  });
  $("damKetQua").addEventListener("click", async (e) => {
    if (e.target.id === "damHuy") { damGoiYData = null; renderDam(); return; }
    if (e.target.id === "damMoi") { damOp = null; damGoiYData = null; $("damYTuong").value = ""; renderDam(); return; }
    if (e.target.id !== "damDuyet") return;
    const ten = damTen($("damTenRepo").value);
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(ten)) { notice("Tên repo 3–40 ký tự: chữ thường không dấu, số, gạch ngang.", true); return; }
    if (!confirm("Tạo repo riêng tư \"" + ten + "\" trên GitHub và khởi động dự án?")) return;
    damGui = true; damKhoa();
    try {
      damOp = (await request("/du-an-moi", { ten, moTa: $("damMoTa").value, yTuong: $("damYTuong").value.trim(), caiBoKiem: $("damBoKiem").checked, giaoHinata: $("damHinata").checked, loai: (document.querySelector('input[name="damLoai"]:checked') || {}).value || "phan-mem" }, 30000)).duAnMoi;
      damGoiYData = null; damLoi = 0; renderDam(); damTheoDoi();
    } catch (err) { notice(err.message, true); }
    damGui = false; damKhoa();
  });
  $("deskSwitch").onclick = () => { const path = $("deskProject").value; if (path) mutate("Chuyển sang dự án " + path, async () => { await request("/workspaces/switch", { path }); overview = null; show("progress"); }); };
  $("deskAssign").onsubmit = (e) => {
    e.preventDefault(); const workspace = active, task = $("deskTask").value.trim();
    if (task && workspace) mutate("Giao việc cho cả đội trong " + workspace, async () => { await request("/autopilot", { workspace, task }); $("deskAssign").reset(); show("tasks"); });
  };
  $("deskIdea").onsubmit = (e) => {
    e.preventDefault(); const workspace = active, title = $("deskIdeaTitle").value.trim(), detail = $("deskIdeaDetail").value.trim();
    if (title && workspace) mutate("Lưu ý tưởng vào " + workspace, async () => { await request("/ideas", { workspace, title, detail }); $("deskIdea").reset(); });
  };
  // Đang kiểm tra/đẩy image thì đọc lại mỗi 3 giây cho tới khi xong.
  let publishTimer = null;
  const followPublish = () => { clearTimeout(publishTimer); publishTimer = setTimeout(async () => { await refreshNow(); if ((publish?.runs || []).some((r) => ["running", "releasing"].includes(r.status))) followPublish(); }, 3000); };
  $("deskPrepare").onclick = () => { const workspace = active; if (workspace) mutate("Kiểm tra & build image Docker của dự án trên máy (chưa đẩy ra ngoài)", async () => { await request("/publish/prepare", { workspace }); followPublish(); }); };
  // Điều phối model: bật/tắt tự động, cố định model/mức cho từng phòng.
  dialog.addEventListener("change", (e) => {
    const auto = e.target.closest("[data-dp-auto]");
    if (auto) { saveDieuPhoi({ tuDong: auto.checked }, auto.checked ? "Đã bật điều phối tự động." : "Đã tắt điều phối tự động: các AI dùng mặc định của CLI."); return; }
    const gptTu = e.target.closest("[data-gpt-tu]"), gptNg = e.target.closest("[data-gpt-nguong]");
    if (gptTu) { gptGoi("/codex-tai-khoan/sua", { tuChuyen: gptTu.checked }, gptTu.checked ? "Đã bật tự chuyển tài khoản GPT." : "Đã tắt tự chuyển tài khoản GPT."); return; }
    if (gptNg) { gptGoi("/codex-tai-khoan/sua", { nguong: Number(gptNg.value) }, "Đã đặt ngưỡng tự chuyển tài khoản GPT " + gptNg.value + "%."); return; }
    const agyTu = e.target.closest("[data-agy-tu]"), agyNg = e.target.closest("[data-agy-nguong]");
    if (agyTu) { agyTkGoi("/agy-tai-khoan/sua", { tuChuyen: agyTu.checked }, agyTu.checked ? "Đã bật tự chuyển tài khoản Antigravity." : "Đã tắt tự chuyển tài khoản Antigravity."); return; }
    if (agyNg) { agyTkGoi("/agy-tai-khoan/sua", { nguong: Number(agyNg.value) }, "Đã đặt ngưỡng tự chuyển " + agyNg.value + "%."); return; }
    const box = e.target.closest("[data-dp-room]");
    if (!box) return;
    const model = box.querySelector("[data-dp-model]").value, custom = box.querySelector("[data-dp-custom]"), effort = box.querySelector("[data-dp-effort]").value;
    if (e.target.matches("[data-dp-model]") && model === "__khac") { custom.closest("label").hidden = false; custom.focus(); return; }
    const name = model === "auto" ? null : model === "__khac" ? custom.value.trim() : model;
    if (model === "__khac" && !/^[\w.:-]{2,60}$/.test(name)) { notice("Tên model chỉ gồm chữ, số và dấu . : - _ (2–60 ký tự).", true); return; }
    const room = box.dataset.dpRoom, off = !name && !effort;
    saveDieuPhoi({ coDinh: { [room]: off ? null : { model: name, effort: effort || null } } },
      off ? "Phòng " + room + " về tự động. Áp dụng từ lượt kế tiếp." : "Đã lưu cho phòng " + room + ": " + (name || "model mặc định") + " · " + (effort || "mức mặc định") + ". Áp dụng từ lượt kế tiếp.");
  });
  dialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-dp-reload]")) { loadDpModels(true); return; }
    const agyCat = e.target.closest("[data-agy-cat]"), agyChuyen = e.target.closest("[data-agy-chuyen]"), agyXoa = e.target.closest("[data-agy-xoa]");
    if (agyCat) { const nhan = dialog.querySelector("[data-agy-nhan]")?.value || ""; agyTkGoi("/agy-tai-khoan/cat", { nhan }, "Đã cất tài khoản Antigravity đang đăng nhập."); return; }
    if (agyChuyen) { agyTkGoi("/agy-tai-khoan/" + encodeURIComponent(agyChuyen.dataset.agyChuyen) + "/chuyen", {}, "Đã đổi tài khoản Antigravity. Lượt Hinata/Kakashi kế tiếp dùng tài khoản này."); return; }
    if (agyXoa) { if (confirm("Bỏ tài khoản này khỏi văn phòng? (Không đăng xuất tài khoản đang dùng trong Antigravity.)")) agyTkGoi("/agy-tai-khoan/" + encodeURIComponent(agyXoa.dataset.agyXoa) + "/xoa", {}, "Đã bỏ tài khoản."); return; }
    if (e.target.closest("[data-agy-doc]")) { agyTkGoi("/agy-tai-khoan/doc-nghi", {}, "Đang đọc hạn mức tài khoản đang nghỉ (khi máy rảnh Antigravity). Bấm Hạn mức lại sau ít giây."); return; }
    // Tài khoản GPT (Codex)
    const gptThem = e.target.closest("[data-gpt-them]"), gptDn = e.target.closest("[data-gpt-dn]"), gptChuyen = e.target.closest("[data-gpt-chuyen]"), gptBo = e.target.closest("[data-gpt-bo]");
    if (gptThem) {
      const nhan = (dialog.querySelector("[data-gpt-nhan]")?.value || "").trim();
      if (!nhan) { notice("Đặt tên cho tài khoản GPT trước (vd. GPT Pro 2).", true); return; }
      (async () => {
        try {
          const { taiKhoan } = await request("/codex-tai-khoan/them", { nhan }, 60000);
          const moi = (taiKhoan.ds || []).find((a) => a.nhan === nhan);
          if (moi) await request("/codex-tai-khoan/" + encodeURIComponent(moi.id) + "/dang-nhap", {}, 60000);
          notice("Đã thêm " + nhan + ". Trình duyệt sẽ mở trang đăng nhập ChatGPT: chọn đúng tài khoản GPT này (dùng cửa sổ ẩn danh nếu trình duyệt đang đăng nhập tài khoản khác).");
          quotas = await request("/quotas");
        } catch (err) { notice(err.message, true); }
        renderQuotas();
      })();
      return;
    }
    if (gptDn) { gptGoi("/codex-tai-khoan/" + encodeURIComponent(gptDn.dataset.gptDn) + "/dang-nhap", {}, "Đang mở trang đăng nhập ChatGPT trên máy tính này. Đăng nhập xong văn phòng tự đọc hạn mức."); return; }
    if (gptChuyen) { gptGoi("/codex-tai-khoan/" + encodeURIComponent(gptChuyen.dataset.gptChuyen) + "/chuyen", {}, "Đã đổi tài khoản GPT. Lượt Itachi/Sasuke kế tiếp dùng tài khoản này."); return; }
    if (gptBo) { if (confirm("Bỏ tài khoản GPT này khỏi văn phòng? (Thư mục đăng nhập vẫn giữ trên máy.)")) gptGoi("/codex-tai-khoan/" + encodeURIComponent(gptBo.dataset.gptBo) + "/bo", {}, "Đã bỏ tài khoản GPT."); return; }
    if (e.target.closest("[data-gpt-doc]")) { gptGoi("/codex-tai-khoan/doc", {}, "Đã đọc hạn mức mọi tài khoản GPT."); return; }
    const bk = e.target.closest("[data-bo-kiem]");
    if (bk && !bk.disabled) {
      const workspace = active;
      if (workspace) mutate("Cài bộ kiểm chu trình (kiểm agent.md + lint/test trên mỗi PR) vào repo " + (overview?.name || workspace) + ": văn phòng tạo nhánh mới từ nhánh chính, commit 2 file, ĐẨY NHÁNH lên GitHub rồi mở trang tạo PR để anh merge", async () => {
        const { boKiem } = await request("/bo-kiem", { workspace }, 120000);
        const url = safeCompare(boKiem.last?.compareUrl);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        overview = null;
      });
      return;
    }
    const pb = e.target.closest("[data-publish]");
    if (pb && !pb.disabled) {
      const version = (dialog.querySelector(`[data-version="${CSS.escape(pb.dataset.publish)}"]`)?.value || "").trim().replace(/^v/, "");
      if (!/^\d+\.\d+\.\d+$/.test(version)) { notice("Phiên bản phải có dạng X.Y.Z, ví dụ 6.2.3", true); return; }
      mutate("XUẤT BẢN v" + version + " của " + (publish?.repo || "dự án") + " qua GitHub (GitHub Actions build và đưa lên GHCR + Releases, ai xem được repo đều tải được)", async () => { await request("/publish/" + encodeURIComponent(pb.dataset.publish) + "/release", { version, confirm: "v" + version }, 60000); followPublish(); });
      return;
    }
    const sb = e.target.closest("[data-scan]");
    if (sb && !sb.disabled) { mutate("Anh đã đọc các điểm bất thường và đồng ý cho AI chạy toàn quyền trong dự án này", async () => { await request("/scan/approve", { workspace: sb.dataset.scanWorkspace, fingerprint: sb.dataset.scan }, 30000); }); return; }
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
  // Nút ⚡ "Giao việc cho một vai" (index.html): đọc lượt hiện tại của dự án đang chọn và chạy đúng một lượt AI qua /ai/run,
  // như trang Điều khiển. Ctl tự chặn khi vai không giữ NEXT_OWNER, đang có lượt chạy hay bàn giao chờ duyệt: lỗi đưa nguyên lên CEO.
  async function turnNow() {
    await syncTurn();
    return { active, name: workspaces.find((w) => w.path === active)?.name || active, status: turn, error: errors.workspace || errors.turn || "" };
  }
  async function runTurn(role, task) {
    const workspace = active;
    if (!workspace) throw new Error("Chưa chọn dự án. Mở Dự án để chọn repo.");
    const d = await request("/ai/run", { workspace, role, task });
    refreshNow().catch(() => {});   // không bắt CEO chờ cả nhịp đọc (tổng quan dự án có thể tới 35 giây) mới thấy lượt đã chạy
    return d.job;
  }
  applyRemoteUi();
  render();
  return { syncTurn, turnNow, runTurn, roomOf };
}
