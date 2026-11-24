"use strict";
// Dùng chung ba phần tiến độ trên văn phòng 3D và Tổng quan.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const statuses = { running: "Đội đang làm", reporting: "Claude đang tổng hợp", awaiting_answer: "Claude hỏi anh", awaiting_approval: "Chờ anh duyệt báo cáo", attention: "Cần anh xem lỗi", waiting_quota: "Chờ hạn mức", approved: "Đã duyệt", acknowledged: "Đã xem báo cáo", rejected: "Đã từ chối", stopped: "Đã dừng", awaiting_scan: "Tạm dừng: chờ anh duyệt rà soát" };
  const list = (items, empty) => items.length ? `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p class="muted">${esc(empty)}</p>`;
  // Bộ kiểm chu trình (CI) trong repo dự án (ctl/bo-kiem.js). actions: hiện nút cài (chỉ bàn làm việc 3D có xử lý nút).
  const BO_KIEM = { "da-cai": "Đã cài: mỗi PR được kiểm agent.md và lint/test.", "cu": "Đã cài nhưng là bản cũ: cài lại để có luật mới.", "chua-cai": "Chưa cài: PR của dự án chưa bị kiểm tự động.", "khong-phai-git": "Dự án không phải repo git.", "van-phong": "Repo của chính Văn phòng AI: dùng CI riêng (.github/workflows/kiem-tra.yml), không cần cài." };
  const safeGithub = (v) => { try { const u = new URL(String(v || "")); return u.protocol === "https:" && u.hostname === "github.com" && !u.username && !u.password ? u.href : null; } catch { return null; } };
  function boKiemHtml(b, actions) {
    if (!b) return "";
    const prUrl = safeGithub(b.last && b.last.compareUrl);
    const last = b.last ? `<br>Lần cài gần nhất: nhánh <span class="mono">${esc(b.last.branch)}</span> · ${esc(new Date(b.last.at).toLocaleString("vi-VN"))}` +
      (prUrl ? ` · <a href="${esc(prUrl)}" target="_blank" rel="noopener noreferrer">mở trang tạo PR</a>` : "") + (b.state === "da-cai" ? "" : " (PR chưa merge hoặc chưa kéo về máy)") : "";
    const btn = actions && ["chua-cai", "cu"].includes(b.state) ? `<div class="actions desk-actions"><button type="button" data-bo-kiem data-write${b.busy ? " disabled" : ""}>${b.state === "cu" ? "Cài lại bộ kiểm" : "Cài bộ kiểm vào repo"}</button></div>` : "";
    return `<h4>Bộ kiểm chu trình (CI)</h4><p>${esc(BO_KIEM[b.state] || b.state)}${last}</p>${btn}`;
  }
  function html(o, runs = [], handoffs = [], errors = {}, { actions = false } = {}) {
    const p = o.progress, r = o.repo;
    const own = runs.filter((x) => x.workspace === o.workspace).sort((a, b) => b.createdAt - a.createdAt);
    const latest = own[0], pending = handoffs.filter((h) => h.workspace === o.workspace && !h.decided);
    return `<div class="repo-progress"><section><h3>Đang dừng ở đâu</h3>` +
      (p ? `<p>Phase: ${esc(p.phase || "Chưa ghi")}<br>Ai giữ lượt: ${esc(p.nextOwner || "Chưa ghi")}<br>AUDIT_STATUS: ${esc(p.auditStatus || "Chưa ghi")}<br>Cập nhật bởi: ${esc(p.lastUpdatedBy || "Chưa ghi")}</p>` : `<p>${esc(o.progressReason || "Chưa đọc được agent.md.")}</p>`) +
      `<p>Nhánh git hiện tại: ${esc(r?.branch || (r ? "Chưa có nhánh" : "Không phải repo git"))}</p></section>` +
      `<section><h3>Đã làm gì</h3><h4>5 commit gần nhất</h4>${list((r?.commits || []).slice(0, 5).map((c) => `${c.hash} · ${c.subject} · ${c.when}`), "Chưa có commit để hiển thị.")}` +
      `<h4>Nhật ký Vùng [4.1]</h4>${list((p?.log41 || []).slice(-5), "Chưa có nhật ký Vùng [4.1].")}` +
      `<h4>Luồng tự động gần nhất</h4><p>${esc(errors.runs || (latest ? `${latest.task}\n${statuses[latest.status] || latest.status} · ${(latest.steps || []).filter((s) => !s.quota).length}/${latest.maxSteps ?? "chưa rõ"} lượt` : "Chưa có luồng tự động cho dự án này."))}</p></section>` +
      `<section><h3>Còn cần gì</h3><p>${esc(p?.nextStep || o.progressReason || "Cần đọc được agent.md để xác định bước tiếp theo.")}</p>` +
      `<h4>Blocker OPEN</h4>${list((p?.openBlockers || []).map((b) => b.text), p ? "Không có blocker OPEN trong Vùng [5]." : "Chưa xác định được blocker.")}` +
      `<h4>Bàn giao chờ duyệt</h4>${errors.handoffs ? `<p>${esc(errors.handoffs)}</p>` : list(pending.map((h) => `${h.role} → ${h.next_owner || "Chờ phương án"}${h.payload?.ask_ceo ? ": " + h.payload.ask_ceo.question : ""}`), "Không có bàn giao chờ duyệt.")}` +
      `<h4>Mục còn nội dung mẫu</h4>${list(p?.emptySections || [], p ? "Không phát hiện nội dung mẫu ở Vùng [1]–[3]." : "Chưa đọc được các vùng đặc tả.")}` + boKiemHtml(o.boKiem, actions) + `</section></div>`;
  }
  // Lời giải thích của từng lượt (Hinata, Sol, Astra) để CEO đọc khi duyệt: vấn đề, đã làm, vì sao, cách khác và vì sao bỏ.
  // Lượt bắt buộc giải thích mà không có thì cảnh báo rõ, không im lặng. Kết luận khớp/không khớp diff nằm trong báo cáo của Claude.
  const MUST = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV"];
  function explainHtml(run) {
    const steps = (run.steps || []).map((s, i) => [s, i + 1]).filter(([s]) => (s.explain && s.explain.length) || s.explainRejected || (MUST.includes(s.role) && !s.quota && s.jobId !== run.jobId));
    if (!steps.length) return "";
    const has = steps.filter(([s]) => s.explain && s.explain.length).length;
    return `<details class="explain"${["awaiting_approval", "awaiting_answer"].includes(run.status) ? " open" : ""}><summary>Vì sao làm vậy · ${has}/${steps.length} lượt có giải thích</summary>` + steps.map(([s, n]) => {
      const head = `<p class="explain-step"><strong>Lượt ${n} · ${esc(s.role)}</strong>${s.via === "web" ? " (kết quả GPT web)" : ""}</p>`;
      const back = s.explainRejected ? `<p class="muted">Bị trả lại một lần vì: ${esc(s.explainRejected)}</p>` : "";
      if (!s.explain || !s.explain.length) return head + back + (s.explainRejected ? "" : '<p class="error">⚠️ Lượt này không có giải thích. Hỏi lại hoặc từ chối trước khi duyệt.</p>');
      return head + back + `<ol>${s.explain.map((x) => `<li><p><b>Vấn đề:</b> ${esc(x.van_de)}</p><p><b>Đã làm:</b> ${esc(x.da_lam)}</p><p><b>Vì sao:</b> ${esc(x.vi_sao)}</p>` +
        (x.phuong_an_khac && x.phuong_an_khac.length ? `<p><b>Cách khác đã cân nhắc:</b></p><ul>${x.phuong_an_khac.map((a) => `<li>${esc(a.cach)} — <i>không chọn vì</i> ${esc(a.vi_sao_khong)}</li>`).join("")}</ul>` : '<p class="muted">Không nêu cách khác (lý do nằm trong phần "Vì sao").</p>') + "</li>").join("")}</ol>`;
    }).join("") + '<p class="muted">Đây là lời các AI tự khai. Claude đối chiếu với diff thật trong báo cáo (mục "VÌ SAO LÀM VẬY & PHƯƠNG ÁN KHÁC"); anh xem thêm "Xem file đã đổi" của từng lượt.</p></details>';
  }
  // Rà soát file .md và thư viện trước khi AI chạy toàn quyền: điểm bất thường chưa duyệt thì CEO xem và bấm duyệt;
  // nếu lần quét mới nhất đã đạt (scan.approved) nhưng vẫn còn luồng awaiting_scan thì hiện nút Chạy tiếp (chỉ máy tính).
  function scanHtml(scan, workspace, attr = "data-scan-approve", { canApprove = true, hasAwaitingScan = false } = {}) {
    if (!scan) return "";
    if (scan.truncated) {
      return '<div class="scan-box" data-scan-truncated><strong>Rà soát chưa hoàn tất</strong><p class="muted">Xử lý phần chưa quét hoặc chọn mức quyền thấp hơn trước khi giao lượt mới.</p></div>';
    }
    if (scan.approved) {
      if (!hasAwaitingScan) return "";
      return '<div class="scan-box" data-scan-resume><strong>Rà soát mới nhất đã đạt</strong>' +
        `<p class="muted">${scan.total ? "Các điểm bất thường hiện tại đã được duyệt trước đó" : "Dự án không còn điểm bất thường"}, nhưng vẫn có luồng đang tạm dừng chờ rà soát.</p>` +
        (canApprove
          ? `<div class="actions desk-actions"><button type="button" class="primary" ${attr}="${esc(scan.fingerprint || "")}" data-scan-workspace="${esc(workspace)}" data-scan-mode="resume">Chạy tiếp</button></div>`
          : `<p class="muted">Chạy tiếp luồng sau rà soát chỉ thực hiện trên máy tính.</p>`) + `</div>`;
    }
    const items = (scan.findings || []).map((f) => `<li><span class="mono">${esc(f.file)}${f.line ? ":" + esc(f.line) : ""}</span> — <b>${esc(f.name)}</b><br><code>${esc(f.text)}</code></li>`).join("");
    return `<div class="scan-box"><strong>⚠️ ${esc(scan.total)} điểm bất thường trong file .md / thư viện của dự án — AI chưa được chạy toàn quyền</strong>` +
      `<p class="muted">Văn phòng rà bằng quy tắc so mẫu (không gọi AI) nên có thể báo nhầm. Anh đọc từng điểm; thấy an toàn thì duyệt, AI chạy toàn quyền bình thường. File đổi thêm điểm mới thì phải duyệt lại.</p>` +
      `<ol>${items}</ol>${scan.total > (scan.findings || []).length ? `<p class="muted">… và ${esc(scan.total - (scan.findings || []).length)} điểm khác.</p>` : ""}` +
      (canApprove ? `<div class="actions desk-actions"><button type="button" class="primary" ${attr}="${esc(scan.fingerprint || "")}" data-scan-workspace="${esc(workspace)}">Đã xem, cho AI chạy toàn quyền</button></div>` : `<p class="muted">Duyệt rà soát toàn quyền chỉ thực hiện trên máy tính.</p>`) + `</div>`;
  }
  // Xoá file trong luồng: đề nghị của AI khác, Claude đã xoá (kèm vì sao, đã kiểm gì), AI tự xoá bị khôi phục / không khôi phục được.
  function deleteHtml(run) {
    const steps = (run.steps || []).map((s, i) => [s, i + 1]);
    const rows = [];
    for (const [s, n] of steps) {
      for (const d of s.deleted || []) rows.push(`<li>🗑 <b>Claude đã xoá</b> <span class="mono">${esc(d.path)}</span> (lượt ${n})<br><b>Vì sao:</b> ${esc(d.reason)}<br><b>Đã kiểm:</b> ${esc(d.checked)}</li>`);
      for (const f of s.deleteUnexplained || []) rows.push(`<li class="error">⚠️ Claude xoá <span class="mono">${esc(f)}</span> (lượt ${n}) nhưng không ghi giải thích</li>`);
      for (const d of s.deleteBlocked || []) rows.push(`<li class="error">⛔ ${esc(s.role)} tự xoá <span class="mono">${esc(d.path)}</span> (lượt ${n}) khi chưa được Claude đồng ý — ${d.restored ? "văn phòng đã khôi phục" : "KHÔNG khôi phục được"}</li>`);
      for (const f of s.deleteLost || []) rows.push(`<li class="error">⛔ ${esc(s.role)} tự xoá <span class="mono">${esc(f)}</span> (lượt ${n}), file ngoài git — KHÔNG khôi phục được</li>`);
    }
    for (const d of run.deleteProposals || []) rows.push(`<li>📝 ${esc(d.by)} đề nghị xoá <span class="mono">${esc(d.path)}</span> — ${esc(d.reason)} · <i>${esc(d.status)}</i></li>`);
    return rows.length ? `<details class="explain" open><summary>Xoá file / thư mục · ${rows.length} mục</summary><ul>${rows.join("")}</ul></details>` : "";
  }
  globalThis.RepoProgress = { html, esc, statuses, explainHtml, scanHtml, deleteHtml };
})();
