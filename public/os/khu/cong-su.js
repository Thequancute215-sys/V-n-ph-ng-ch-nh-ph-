// Khu Cộng sự và team (OS-2, học cách tổ chức "cộng sự có vai, model, trí nhớ riêng" của Javis OS — phòng sạch).
// Mỗi vai trong agent.md là một cộng sự: AI chạy vai đó, model/mức suy nghĩ đang áp (ctl /dieu-phoi), mức quyền (ctl /quyen),
// đang làm gì (luồng /events), mô tả công việc (Bộ não: cong-su/<VAI>.md). Team = chu trình agent.md và ai đang giữ lượt.
// Không số nào tự đặt: thiếu dữ liệu thì ghi "chưa đọc được".
import { esc, luc, dangTai, rong, loi, VAI, TEN_NEN } from "../ui.js";

const MUC_QUYEN = { doc: ["Đề xuất (chỉ đọc)", "phu"], nhap: ["Tự làm (ghi nháp)", "song"], toan: ["Toàn quyền", "canh-bao"] };
const CHU_TRINH = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "CLAUDE_AUDITOR", "CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV", "SOL_ARCHITECT_ADVISOR"];

export async function mo(vung, { kho, ctl }) {
  vung.innerHTML = `<div class="vung">
    <section class="khoi" aria-labelledby="hTeam">
      <div class="dau-hang"><h2 class="dau" id="hTeam">Team: chu trình của dự án đang chọn</h2><span class="mo" id="phaTeam"></span></div>
      <div id="team">${dangTai(2)}</div>
    </section>
    <section aria-labelledby="hCs" style="display:flex;flex-direction:column;gap:var(--space-sm)">
      <div class="dau-hang"><h2 class="dau" id="hCs">Cộng sự</h2><span class="mo">Bấm một thẻ để xem mô tả công việc. Đổi model và quyền ở Hệ thống → Models và quyền.</span></div>
      <div id="dsCs" class="luoi-the">${dangTai(4)}</div>
    </section>
    <section class="khoi" id="chiTiet" aria-live="polite" hidden></section>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let dieuPhoi = null, quyen = null, tongQuan = null, jobs = null, loiCtl = "", chon = null, conSong = true;

  async function tai() {
    const [d, q, o, j] = await Promise.allSettled([ctl("/dieu-phoi"), ctl("/quyen"),
      kho.duAn ? ctl("/workspaces/overview?workspace=" + encodeURIComponent(kho.duAn)) : Promise.resolve(null), ctl("/jobs?limit=80")]);
    if (!conSong) return;
    dieuPhoi = d.status === "fulfilled" ? d.value.dieuPhoi : null;
    quyen = q.status === "fulfilled" ? q.value.quyen : null;
    tongQuan = o.status === "fulfilled" && o.value ? o.value.overview || o.value : null;
    jobs = j.status === "fulfilled" ? j.value.jobs || [] : null;
    loiCtl = d.status === "rejected" ? d.reason.message : "";
    ve();
  }

  // Hoạt động thật của một vai = các lượt AI ctl đã chạy cho vai đó (/jobs, trường agent là tên vai).
  // Luồng /events là các phiên làm việc (vd. phiên Claude Code), không phải vai, nên không dùng ở đây.
  const tenDuAn = (p) => String(p || "").split(/[\\/]/).pop();
  function hoatDong(role) {
    if (!jobs) return null;
    const cua = jobs.filter((x) => x.agent === role).sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
    const chay = cua.find((x) => x.status === "running"), cuoi = cua[0];
    return { chay, cuoi };
  }
  function modelCua(v) {
    const co = dieuPhoi && dieuPhoi.coDinh && dieuPhoi.coDinh[v.phong];
    if (co) return `${co.model || "model mặc định"}${co.effort ? " · " + co.effort : ""} (anh cố định)`;
    if (!dieuPhoi) return "chưa đọc được";
    return dieuPhoi.tuDong === false ? "mặc định của vai" : "tự chọn theo độ khó lượt";
  }
  function quyenCua(v) {
    const m = quyen && quyen.muc ? quyen.muc[v.role] : null;
    return m && MUC_QUYEN[m] ? `<span class="nhan ${MUC_QUYEN[m][1]}">${esc(MUC_QUYEN[m][0])}</span>` : `<span class="nhan">quyền: chưa đọc được</span>`;
  }

  function ve() {
    const p = tongQuan && tongQuan.progress, giu = p && p.nextOwner;
    $("phaTeam").textContent = p ? [p.phase, tongQuan.name].filter(Boolean).join(" · ") : kho.duAn ? "" : "chưa chọn dự án";
    $("team").innerHTML = p
      ? `<ol class="dai-team" style="list-style:none;margin:0;padding:0">${CHU_TRINH.map((r, i) => { const v = VAI.find((x) => x.role === r);
          return `${i ? '<li class="mui" aria-hidden="true">›</li>' : ""}<li class="buoc"${r === giu ? ' aria-current="step"' : ""}><b>${esc(v.ten)}</b><small>${esc(v.viec)}</small>${r === giu ? '<small class="song">đang giữ lượt</small>' : ""}</li>`; }).join("")}</ol>
         ${p.openBlockers && p.openBlockers.length ? `<p class="canh-bao">Còn ${p.openBlockers.length} lỗi chặn (Vùng [5]) chưa đóng.</p>` : ""}`
      : tongQuan === null && kho.duAn ? loi("Chưa đọc được agent.md của dự án đang chọn.", false) : rong("Chưa có chu trình", "Chọn một dự án có agent.md ở thanh trên.");

    if (!jobs && !dieuPhoi) { $("dsCs").innerHTML = loiCtl ? loi(loiCtl) : dangTai(4); return; }
    $("dsCs").innerHTML = (loiCtl ? loi("Chưa đọc được điều phối model: " + loiCtl) : "") + VAI.map((v) => {
      const h = hoatDong(v.role), chay = h && h.chay, cuoi = h && h.cuoi;
      const nhan = !h ? ["chưa đọc được", ""] : chay ? ["đang làm", "song"] : ["rảnh", ""];
      const dong = chay ? `Đang chạy lượt ở ${tenDuAn(chay.workspace)}${chay.runningS ? `, đã ${Math.max(1, Math.round(chay.runningS / 60))} phút` : ""}.`
        : cuoi ? `Lượt gần nhất ở ${tenDuAn(cuoi.workspace)}: ${cuoi.status === "done" ? "xong" : cuoi.status === "rejected" ? "anh từ chối" : cuoi.status}, ${luc(cuoi.ended_at || cuoi.started_at)}.`
        : h ? "Chưa chạy lượt nào gần đây." : "";
      return `<button type="button" class="the-cs" data-role="${esc(v.role)}" aria-pressed="${chon === v.role}">
        <span class="ten"><span class="anh-dai" data-nen="${v.nen === "agy" ? "antigravity" : v.nen}">${esc(v.ten.slice(0, 2))}</span>${esc(v.ten)}
          <span class="nhan ${nhan[1]}" style="margin-left:auto">${nhan[0]}</span></span>
        <span class="viec">${esc(v.viec)} · ${esc(TEN_NEN[v.nen])}</span>
        <span class="hang">${quyenCua(v)}<span class="nhan">${esc(modelCua(v))}</span>${v.role === giu ? '<span class="nhan song">giữ lượt</span>' : ""}</span>
        ${dong ? `<span class="dang">${esc(dong)}</span>` : ""}
      </button>`;
    }).join("");
  }

  async function moChiTiet(role) {
    chon = chon === role ? null : role; ve();
    const box = $("chiTiet");
    if (!chon) { box.hidden = true; return; }
    const v = VAI.find((x) => x.role === chon);
    box.hidden = false;
    box.innerHTML = `<div class="dau-hang"><h2 class="dau">${esc(v.ten)}: mô tả công việc</h2><a class="nut nho" href="#/doi/bo-nao?p=${encodeURIComponent("cong-su/" + v.role + ".md")}">Sửa trong Bộ não</a></div>${dangTai(4)}`;
    try {
      const d = await ctl("/bo-nao/doc?p=" + encodeURIComponent("cong-su/" + v.role + ".md"));
      if (chon !== v.role) return;
      const md = window.MD ? window.MD.render(d.noiDung || "") : `<pre class="van-ban">${esc(d.noiDung || "")}</pre>`;
      box.querySelector(".dang-tai").outerHTML = `<div class="md-xem">${md}</div>`;
    } catch (e) {
      if (chon !== v.role) return;
      box.querySelector(".dang-tai").outerHTML = e.code === "NOT_FOUND" ? rong("Chưa có mô tả công việc", "Bộ não chưa có file cong-su/" + v.role + ".md.") : loi("Chưa đọc được Bộ não: " + e.message, false);
    }
  }

  vung.addEventListener("click", (e) => {
    const t = e.target.closest(".the-cs"); if (t) return moChiTiet(t.dataset.role);
    if (e.target.closest("[data-thu-lai]")) tai();
  });
  // Đổi dự án ở thanh trên thì đọc lại chu trình của dự án mới (không gọi ctl mỗi lần luồng /events có tin).
  let duAnCu = kho.duAn;
  const bo = kho.on((k) => { if (k.duAn !== duAnCu) { duAnCu = k.duAn; tai(); } });
  await tai();
  const hen = setInterval(() => { if (!document.hidden) tai(); }, 30000);
  return () => { conSong = false; bo(); clearInterval(hen); };
}
