// Xưởng code · Dự án (OS-2): mọi repo văn phòng đang quản lý, mỗi repo một thẻ với tình trạng thật từ ctl /workspaces/overview:
// Phase, vai giữ lượt, lỗi chặn còn mở (Vùng [5]), nhánh git, có agent.md chưa. Chọn làm "dự án đang làm" hoặc mở giao việc.
// Tính năng xưởng code khác (phát hành một chạm, CI, PR) sẽ cập nhật sau (CEO 21/11/2026).
import { esc, cat, luc, dangTai, rong, loi } from "../ui.js";

const TEN_VAI = { SPEC_ARCHITECT: "Hinata (đặc tả)", SOL_ARCHITECT_PLANNER: "Itachi (kiến trúc)", SOL_ARCHITECT_ADVISOR: "Itachi (cố vấn)", CLAUDE_AUDITOR: "Sakura (duyệt)",
  CODEX_ASTRA_DEV: "Sasuke (backend)", FRONTEND_UIUX_DEV: "Kakashi (giao diện)" };

export async function mo(vung, { kho, ctl, bao }) {
  vung.innerHTML = `<div class="vung">
    <div class="dau-hang"><h2 class="dau">Dự án của xưởng code</h2><span class="mo" id="soDuAn"></span>
      <a class="nut-chinh" href="#/code/giao-viec" style="margin-left:auto">Giao việc cho đội</a></div>
    <div id="ds" class="luoi-the">${dangTai(4)}</div>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let ds = null, tq = {}, loiDs = "", conSong = true;

  async function tai() {
    try { const d = await ctl("/workspaces"); ds = d.workspaces || []; loiDs = ""; }
    catch (e) { ds = null; loiDs = e.message; }
    if (!conSong) return;
    ve();
    // Đọc tổng quan từng repo lần lượt (mỗi lần đọc git + agent.md), vẽ lại khi có thêm.
    for (const w of ds || []) {
      if (!conSong) return;
      try { const o = await ctl("/workspaces/overview?workspace=" + encodeURIComponent(w.path)); tq[w.path] = o.overview || o; }
      catch (e) { tq[w.path] = { loi: e.message }; }
      ve();
    }
  }

  function ve() {
    if (!ds) { $("ds").innerHTML = loi(loiDs || "Chưa nối được bộ điều khiển (ctl)."); return; }
    $("soDuAn").textContent = ds.length + " dự án";
    if (!ds.length) { $("ds").innerHTML = rong("Chưa có dự án", "Mở một repo từ GitHub ở Giao việc cho đội.", `<a class="nut" href="#/code/giao-viec">Mở repo</a>`); return; }
    $("ds").innerHTML = ds.map((w) => {
      const o = tq[w.path], p = o && o.progress, r = o && o.repo, dang = w.path === kho.duAn;
      const trangThai = !o ? `<span class="mo">Đang đọc…</span>`
        : o.loi ? `<span class="hong">${esc(cat(o.loi, 120))}</span>`
        : `<span class="hang">${p ? `<span class="nhan">${esc(cat(p.phase || "chưa rõ Phase", 40))}</span><span class="nhan ${p.nextOwner ? "song" : ""}">lượt: ${esc(TEN_VAI[p.nextOwner] || p.nextOwner || "chưa rõ")}</span>
            ${p.openBlockers && p.openBlockers.length ? `<span class="nhan hong">${p.openBlockers.length} lỗi chặn</span>` : '<span class="nhan">0 lỗi chặn</span>'}`
            : `<span class="nhan canh-bao">${esc(o.agentMd === false || (o.agentMd && o.agentMd.exists === false) ? "chưa có sổ dự án (agent.md)" : cat(o.progressReason || "chưa đọc được agent.md", 50))}</span>`}
            ${r && r.branch ? `<span class="nhan">nhánh ${esc(cat(r.branch, 32))}</span>` : o.isRepo === false ? '<span class="nhan canh-bao">chưa quản lý bằng git</span>' : ""}</span>
          ${p && p.nextStep ? `<span class="dang">${esc(cat(p.nextStep, 180))}</span>` : ""}`;
      return `<div class="the-cs" style="cursor:default"${dang ? ' aria-current="true"' : ""}>
        <span class="ten">${esc(w.name || w.path.split(/[\\/]/).pop())}${dang ? '<span class="nhan song" style="margin-left:auto">đang làm</span>' : ""}</span>
        <span class="viec" title="${esc(w.path)}">${esc(cat(w.path, 70))}${o && o.readAt ? " · đọc " + esc(luc(o.readAt)) : ""}</span>
        ${trangThai}
        <span class="hang">${dang ? "" : `<button type="button" class="nut nho" data-chon="${esc(w.path)}">Làm dự án này</button>`}<button type="button" class="nut nho" data-luong="${esc(w.path)}">Luồng và bàn giao</button></span>
      </div>`;
    }).join("");
  }

  vung.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-chon]");
    if (c) { try { await ctl("/workspaces/switch", { path: c.dataset.chon }); kho.duAn = c.dataset.chon; const sel = document.getElementById("chonDuAn"); if (sel) sel.value = c.dataset.chon; kho.bao(); bao("Đã chuyển dự án đang làm."); ve(); } catch (err) { bao(err.message, true); } return; }
    // Xem luồng của dự án khác: chuyển dự án đang làm trước, để trang luồng không hiện nhầm dự án cũ.
    const l = e.target.closest("[data-luong]");
    if (l) { if (l.dataset.luong !== kho.duAn) { try { await ctl("/workspaces/switch", { path: l.dataset.luong }); kho.duAn = l.dataset.luong; const sel = document.getElementById("chonDuAn"); if (sel) sel.value = l.dataset.luong; kho.bao(); } catch (err) { bao(err.message, true); return; } } location.hash = "#/code/dieu-khien"; return; }
    if (e.target.closest("[data-thu-lai]")) tai();
  });
  await tai();
  return () => { conSong = false; };
}
