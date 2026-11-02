"use strict";
// Dùng chung ba phần tiến độ trên văn phòng 3D và Tổng quan.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const statuses = { running: "Đội đang làm", reporting: "Claude đang tổng hợp", awaiting_answer: "Claude hỏi anh", awaiting_approval: "Chờ anh duyệt báo cáo", attention: "Cần anh xem lỗi", waiting_quota: "Chờ hạn mức", approved: "Đã duyệt", acknowledged: "Đã xem báo cáo", rejected: "Đã từ chối", stopped: "Đã dừng" };
  const list = (items, empty) => items.length ? `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p class="muted">${esc(empty)}</p>`;
  function html(o, runs = [], handoffs = [], errors = {}) {
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
      `<h4>Mục còn nội dung mẫu</h4>${list(p?.emptySections || [], p ? "Không phát hiện nội dung mẫu ở Vùng [1]–[3]." : "Chưa đọc được các vùng đặc tả.")}</section></div>`;
  }
  globalThis.RepoProgress = { html, esc, statuses };
})();
