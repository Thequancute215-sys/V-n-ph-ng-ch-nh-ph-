// Khu Luồng và bàn giao (OS-3, thay dieukhien.html trong Xưởng code): mọi việc của đội đang ở đâu và việc nào cần anh.
// Ba nguồn thật của ctl: luồng tự chạy (/autopilot), bàn giao chờ duyệt (/handoffs), lượt AI và lệnh (/jobs).
// Bấm một dòng thì mở ngăn trượt bên phải để duyệt, trả lời, xem nhật ký lượt — không rời khu.
import { esc, cat, luc, dangTai, rong, loi } from "../ui.js";
import { TT_LUONG, LUONG_CHAY, LUONG_CAN_ANH, LUONG_CHO, TT_LENH, tenDuAn, tenVai, tenLenh, cauHoi, soLuot, lopLuong, tomTatGiaiThich } from "../viec-chung.js";

const NGAY = 24 * 3600 * 1000;

export async function mo(vung, { kho, ctl, bao, ngan }) {
  vung.innerHTML = `<div class="vung">
    <div class="hang thanh-loc">
      <div class="chon-nhom" role="group" aria-label="Phạm vi">
        <button type="button" data-pham-vi="du-an" aria-pressed="true">Dự án đang chọn</button>
        <button type="button" data-pham-vi="tat-ca" aria-pressed="false">Mọi dự án</button>
      </div>
      <span class="mo" id="lucDoc" aria-live="polite"></span>
      <button type="button" class="nut nho" id="nutLamMoi">Đọc lại</button>
      <button type="button" class="nut nho nguy" id="nutDungHet">Dừng tất cả AI</button>
    </div>
    <section class="khung-goc" aria-labelledby="hCan"><div class="cot-doc">
      <div class="dau-hang"><h2 class="dau" id="hCan">Cần anh xử lý</h2><span class="mo" id="soCan"></span></div>
      <div id="dsCan">${dangTai(3)}</div></div></section>
    <div class="luoi-2">
      <section class="khoi" aria-labelledby="hChay"><div class="dau-hang"><h2 class="dau" id="hChay">Đang chạy</h2><span class="mo" id="soChay"></span></div><div id="dsChay">${dangTai(3)}</div></section>
      <section class="khoi" aria-labelledby="hXong"><div class="dau-hang"><h2 class="dau" id="hXong">Gần đây</h2><span class="mo">24 giờ qua</span></div><div id="dsXong">${dangTai(3)}</div></section>
    </div>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let runs = null, handoffs = null, jobs = null, loiCtl = "", tatCa = false, conSong = true, hen = null, docLuc = 0;

  async function tai() {
    clearTimeout(hen);
    if (!conSong) return;
    if (!document.hidden) {
      const [a, h, j] = await Promise.allSettled([ctl("/autopilot"), ctl("/handoffs"), ctl("/jobs?limit=80")]);
      if (!conSong) return;
      runs = a.status === "fulfilled" ? a.value.runs || [] : runs;
      handoffs = h.status === "fulfilled" ? h.value.handoffs || [] : handoffs;
      jobs = j.status === "fulfilled" ? j.value.jobs || [] : jobs;
      loiCtl = [a, h, j].find((x) => x.status === "rejected")?.reason?.message || "";
      if (!loiCtl) docLuc = Date.now();
      ve();
    }
    hen = setTimeout(tai, (runs || []).some((r) => LUONG_CHAY.has(r.status)) || (jobs || []).some((x) => x.status === "running") ? 5000 : 15000);
  }

  const cuaToi = (w) => tatCa || !kho.duAn || w === kho.duAn;
  const dong = (ref, tieu, chiTiet, nhan, lop, nutChu, laChinh = false) => `<div class="dong"><div><div class="tieu">${esc(tieu)}</div><div class="chi-tiet">${esc(chiTiet)}</div></div>
    <div class="hang">${nhan ? `<span class="nhan ${lop}">${esc(nhan)}</span>` : ""}<button type="button" class="${laChinh ? "nut-chinh" : "nut nho"}" data-ngan="${esc(ref)}" aria-label="${esc(nutChu + ": " + cat(tieu, 80))}">${esc(nutChu)}</button></div></div>`;

  function ve() {
    $("lucDoc").textContent = loiCtl ? "" : docLuc ? "đọc lúc " + new Date(docLuc).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
    if (!runs && !handoffs && !jobs) {
      const thong = loiCtl ? loi("Chưa nối được bộ điều khiển (ctl): " + loiCtl) : dangTai(3);
      const cho = loiCtl ? `<p class="mo">Chờ nối lại bộ điều khiển.</p>` : dangTai(3);
      $("dsCan").innerHTML = thong; $("dsChay").innerHTML = cho; $("dsXong").innerHTML = cho;
      return;
    }
    const bay = Date.now(), can = [], chay = [], xong = [];
    const r0 = (runs || []).filter((r) => cuaToi(r.workspace));
    // Lượt thuộc một luồng đã hiện trong ngăn của luồng đó: không liệt kê riêng lần nữa.
    const jobCuaLuong = new Set((runs || []).flatMap((r) => [r.jobId, ...(r.steps || []).map((s) => s.jobId)]).filter(Boolean));
    for (const r of r0) {
      const ct = `${tenDuAn(r.workspace)} · ${soLuot(r)}/${r.maxSteps} lượt · ${luc(r.updatedAt)}`;
      if (LUONG_CAN_ANH.has(r.status) || LUONG_CHO.has(r.status)) can.push([r.updatedAt, dong("luong:" + r.id, cauHoi(r) || r.task, (cauHoi(r) ? "Luồng: " + cat(r.task, 80) + " · " : "Luồng tự chạy · ") + ct, TT_LUONG[r.status], lopLuong(r.status), r.status === "awaiting_answer" ? "Trả lời" : "Xem", true)]);
      else if (LUONG_CHAY.has(r.status)) chay.push([r.updatedAt, dong("luong:" + r.id, r.task, ct + ((r.steps || []).length ? " · đang ở lượt của " + tenVai(r.steps.at(-1).role) : ""), TT_LUONG[r.status], "song", "Xem tiến độ")]);
      else if (bay - (r.updatedAt || 0) < NGAY) xong.push([r.updatedAt, dong("luong:" + r.id, r.task, ct, TT_LUONG[r.status] || r.status, lopLuong(r.status), "Xem")]);
    }
    const jobById = new Map((jobs || []).map((j) => [j.id, j]));
    (handoffs || []).filter((x) => cuaToi(x.workspace)).forEach((h, idx) => {
      const p = h.payload || {}, jh = jobById.get(h.job_id);
      const t = h.createdAt || h.created_at || h.decided_at || (jh && (jh.ended_at || jh.started_at)) || 0;
      const tieu = cat(tomTatGiaiThich(p.giai_thich) || p.tom_tat || "Bàn giao chờ duyệt", 200);
      can.push([t || (bay - idx), dong("ban-giao:" + h.job_id, tieu,
        `Bàn giao của ${tenVai(h.role)} cho ${tenVai(h.next_owner || p.next_owner)} · ${tenDuAn(h.workspace)}${t ? " · " + luc(t) : ""}`, (h.problems || []).length ? "sai mẫu" : p.ask_ceo ? "Claude hỏi anh" : "chờ duyệt", (h.problems || []).length ? "hong" : "canh-bao", p.ask_ceo ? "Trả lời" : "Duyệt", true)]);
    });
    for (const j of (jobs || []).filter((x) => cuaToi(x.workspace))) {
      const ct = tenDuAn(j.workspace) + (j.started_at ? " · " + luc(j.started_at) : "");
      if (j.status === "pending_approval") can.push([j.started_at, dong("lenh:" + j.id, tenLenh(j) + ": lệnh chờ anh duyệt", ct, TT_LENH[j.status], "canh-bao", "Xem lệnh", true)]);
      else if (j.status === "running" && !jobCuaLuong.has(j.id)) chay.push([j.started_at, dong("lenh:" + j.id, tenLenh(j), ct + (j.runningS ? ` · đã chạy ${Math.round(j.runningS / 60)} phút` : ""), TT_LENH[j.status], "song", "Xem tiến độ")]);
      else if (!["running", "queued"].includes(j.status) && !jobCuaLuong.has(j.id) && bay - (j.ended_at || j.started_at || 0) < NGAY) xong.push([j.ended_at || j.started_at, dong("lenh:" + j.id, tenLenh(j), ct, TT_LENH[j.status] || j.status, j.status === "failed" ? "hong" : "", "Xem")]);
    }
    const sx = (a) => a.sort((x, y) => (y[0] || 0) - (x[0] || 0)).map((x) => x[1]).join("");
    const canhBao = loiCtl ? loi("Thiếu một phần dữ liệu: " + loiCtl) : "";
    const phamVi = tatCa ? "mọi dự án" : "dự án " + (tenDuAn(kho.duAn) || "đang chọn");
    $("soCan").textContent = can.length ? can.length + " việc" : "";
    $("soChay").innerHTML = chay.length ? `<span class="dang-chay"><span class="cham" aria-hidden="true"></span>${chay.length} việc</span>` : "";
    $("dsCan").innerHTML = canhBao + (can.length ? sx(can) : rong("Không có việc nào chờ anh", `Bàn giao chờ duyệt, câu hỏi của Claude và lệnh chờ cho phép của ${phamVi} sẽ hiện ở đây.`));
    $("dsChay").innerHTML = chay.length ? sx(chay) : rong("Không AI nào đang chạy", "Giao việc cho đội ở Xưởng code, Giao việc cho đội.", `<a class="nut nho" href="#/code/giao-viec">Giao việc</a>`);
    $("dsXong").innerHTML = xong.length ? sx(xong) : rong("Chưa có việc xong", `Luồng và lượt đã kết thúc trong 24 giờ qua của ${phamVi} hiện ở đây.`);
  }

  vung.addEventListener("click", async (e) => {
    const t = e.target;
    const n = t.closest("[data-ngan]"); if (n) return ngan.mo(n.dataset.ngan, n, { khiDoi: tai });
    const pv = t.closest("[data-pham-vi]");
    if (pv) { tatCa = pv.dataset.phamVi === "tat-ca"; vung.querySelectorAll("[data-pham-vi]").forEach((b) => b.setAttribute("aria-pressed", String(b === pv))); return ve(); }
    if (t.closest("#nutLamMoi") || t.closest("[data-thu-lai]")) return tai();
    const d = t.closest("#nutDungHet");
    if (d && confirm("Dừng mọi luồng tự chạy và mọi lượt AI đang chạy trên máy?")) {
      d.disabled = true; d.setAttribute("aria-busy", "true");
      try { const r = await ctl("/kill-all", {}, { timeout: 60000 }); bao("Đã dừng " + (r.results || []).length + " việc."); }
      catch (err) { bao(err.message, true); }
      d.disabled = false; d.removeAttribute("aria-busy"); tai();
    }
  });
  const bo = kho.on(() => ve());
  const khiHien = () => { if (!document.hidden) tai(); };
  document.addEventListener("visibilitychange", khiHien);
  ve();
  await tai();
  return () => { conSong = false; clearTimeout(hen); bo(); document.removeEventListener("visibilitychange", khiHien); };
}
