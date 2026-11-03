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
  globalThis.RepoProgress = { html, esc, statuses, explainHtml };
})();
