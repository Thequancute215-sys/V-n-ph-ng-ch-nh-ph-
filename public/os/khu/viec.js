// Khu Việc và lịch chạy (OS-2, học "bảng việc Chờ / Đang chạy / Cần anh / Xong" và "việc lặp, nhắc theo giờ" của Javis OS — phòng sạch).
// Bảng việc gộp ba nguồn thật của ctl: lượt AI và lệnh (/jobs), luồng tự chạy (/autopilot), bàn giao chờ duyệt (/handoffs).
// Lịch chạy (/lich-chay, ctl/lich-chay.js): giao việc cho đội hoặc hỏi một AI theo nhịp; mặc định TẮT, CEO bật từng lịch.
// ctl tự bỏ qua lần chạy khi lần trước chưa xong, dự án đang bận hay hạn mức AI dưới 15%, và không chạy bù khi máy tắt.
// OS-3: mỗi thẻ việc có nút mở ngăn trượt tại chỗ (duyệt, trả lời, xem nhật ký lượt đang chạy) thay cho chuyển sang trang Luồng.
import { esc, cat, luc, dangTai, rong, loi } from "../ui.js";
import { TT_LUONG, LUONG_CHAY, LUONG_CHO, LUONG_CAN_ANH, tenDuAn, tenLenh as tenViec, tenVai as TEN_VAI_BG, cauHoi, tomTatGiaiThich } from "../viec-chung.js";

const NGAY = 24 * 3600 * 1000;
const THU = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
const HOI = { pain: "Pain (Claude)", hinata: "Hinata (Antigravity)", itachi: "Itachi (Sol)", sasuke: "Sasuke (Astra)", kakashi: "Kakashi (Antigravity)", sakura: "Sakura (Claude)" };

export async function mo(vung, { kho, ctl, bao, ngan }) {
  vung.innerHTML = `<div class="vung">
    <div class="so-kpi" id="kpi" aria-label="Số việc">${dangTai(1)}</div>
    <section aria-labelledby="hBang" style="display:flex;flex-direction:column;gap:var(--space-sm)">
      <div class="dau-hang"><h2 class="dau" id="hBang">Bảng việc</h2><span class="mo">Gộp lượt AI, luồng tự chạy và bàn giao của mọi dự án. Giao việc mới ở Xưởng code → Giao việc cho đội.</span></div>
      <div class="bang-viec" id="bangViec">${dangTai(4)}</div>
    </section>
    <section class="khoi" aria-labelledby="hLich">
      <div class="dau-hang"><h2 class="dau" id="hLich">Lịch chạy</h2><span class="mo">Mặc định tắt. Văn phòng bỏ qua lần chạy khi lần trước chưa xong, dự án đang bận hoặc AI còn dưới 15% hạn mức, và không chạy bù khi máy tắt.</span>
        <button type="button" class="nut nho" id="nutThemLich" style="margin-left:auto">Thêm lịch</button></div>
      <form id="bieuMau" class="khoi" hidden novalidate></form>
      <div id="dsLich">${dangTai(3)}</div>
    </section>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let jobs = null, runs = null, handoffs = null, lich = null, loiCtl = "", loiLich = "", conSong = true, sua = null;

  async function tai() {
    const [j, a, h, l] = await Promise.allSettled([ctl("/jobs?limit=80"), ctl("/autopilot"), ctl("/handoffs"), ctl("/lich-chay")]);
    if (!conSong) return;
    jobs = j.status === "fulfilled" ? j.value.jobs || [] : null;
    runs = a.status === "fulfilled" ? a.value.runs || [] : null;
    handoffs = h.status === "fulfilled" ? h.value.handoffs || [] : null;
    loiCtl = [j, a, h].find((x) => x.status === "rejected")?.reason?.message || "";
    lich = l.status === "fulfilled" ? l.value.lichChay || l.value.lich || [] : null;
    loiLich = l.status === "rejected" ? l.reason.message : "";
    veBang(); veLich();
  }

  // ---------- bảng việc ----------
  const nutNgan = (ref, chu, tieu) => `<button type="button" class="nut nho" data-ngan="${esc(ref)}" aria-label="${esc(chu + ": " + cat(tieu, 80))}">${esc(chu)}</button>`;
  function the(tieu, chiTiet, nut = "") { return `<div class="the-viec"><div class="tieu">${esc(tieu)}</div><div class="chi-tiet">${esc(chiTiet)}</div>${nut}</div>`; }
  function veBang() {
    if (!jobs && !runs && !handoffs) { $("kpi").innerHTML = ""; $("bangViec").innerHTML = loi(loiCtl || "Chưa nối được bộ điều khiển (ctl)."); return; }
    const bay = Date.now(), cot = { cho: [], chay: [], canAnh: [], xong: [] };
    const jobCuaLuong = new Set((runs || []).flatMap((r) => [r.jobId, ...(r.steps || []).map((s) => s.jobId)]).filter(Boolean));
    const jobById = new Map((jobs || []).map((j) => [j.id, j]));
    for (const r of runs || []) {
      const tt = TT_LUONG[r.status] || r.status, ct = `Luồng tự chạy · ${tenDuAn(r.workspace)} · ${tt} · ${luc(r.updatedAt)}`;
      const nut = (chu) => nutNgan("luong:" + r.id, chu, r.task);
      if (LUONG_CHAY.has(r.status)) cot.chay.push([r.updatedAt, the(cat(r.task, 140), ct, nut("Xem tiến độ"))]);
      else if (LUONG_CHO.has(r.status)) cot.cho.push([r.updatedAt, the(cat(r.task, 140), ct, nut("Mở"))]);
      else if (LUONG_CAN_ANH.has(r.status)) cot.canAnh.push([r.updatedAt, the(cat(cauHoi(r) || r.task, 140), ct, nut(r.status === "awaiting_answer" ? "Trả lời" : "Mở"))]);
      else if (bay - (r.updatedAt || 0) < NGAY) cot.xong.push([r.updatedAt, the(cat(r.task, 140), ct, nut("Xem"))]);
    }
    (handoffs || []).forEach((h, idx) => { const p = h.payload || {}, jh = jobById.get(h.job_id);
      const t = h.createdAt || h.created_at || h.decided_at || (jh && (jh.ended_at || jh.started_at)) || 0;
      const tieu = cat(tomTatGiaiThich(p.giai_thich) || p.tom_tat || "Bàn giao chờ duyệt", 140);
      cot.canAnh.push([t || (bay - idx), the(tieu, `Bàn giao của ${TEN_VAI_BG(h.role)}${p.next_owner ? " cho " + TEN_VAI_BG(p.next_owner) : ""} · ${tenDuAn(h.workspace)}${t ? " · " + luc(t) : ""}`, nutNgan("ban-giao:" + h.job_id, p.ask_ceo ? "Trả lời" : "Duyệt", tieu))]); });
    for (const j of jobs || []) {
      const ct = `${tenDuAn(j.workspace)}${j.started_at ? " · " + luc(j.started_at) : ""}`;
      if (j.status === "pending_approval") cot.canAnh.push([j.started_at, the(tenViec(j) + ": chờ anh duyệt", ct, nutNgan("lenh:" + j.id, "Duyệt", tenViec(j)))]);
      else if (jobCuaLuong.has(j.id)) continue;
      else if (j.status === "running") cot.chay.push([j.started_at, the(tenViec(j), ct + (j.runningS ? ` · đã chạy ${Math.round(j.runningS / 60)} phút` : ""), nutNgan("lenh:" + j.id, "Xem tiến độ", tenViec(j)))]);
      else if (j.status === "queued") cot.cho.push([j.started_at, the(tenViec(j), ct)]);
      else if (bay - (j.ended_at || j.started_at || 0) < NGAY) cot.xong.push([j.ended_at || j.started_at, the(`${tenViec(j)}: ${j.status === "done" ? "xong" : j.status === "rejected" ? "anh từ chối" : j.status}`, ct)]);
    }
    const sx = (a) => a.sort((x, y) => (y[0] || 0) - (x[0] || 0)).map((x) => x[1]);
    $("kpi").innerHTML = [["Đang chạy", cot.chay.length], ["Đang chờ", cot.cho.length], ["Cần anh xử lý", cot.canAnh.length], ["Xong trong 24 giờ", cot.xong.length]]
      .map(([t, n]) => `<div><b>${n}</b><span>${esc(t)}</span></div>`).join("");
    const veCot = (ten, ds, trong) => `<div class="cot-viec"><h3><span>${esc(ten)}</span><span class="mo so">${ds.length}</span></h3>${ds.length ? sx(ds).slice(0, 30).join("") : `<p class="mo" style="font-size:var(--text-xs)">${esc(trong)}</p>`}</div>`;
    $("bangViec").innerHTML = (loiCtl ? loi("Thiếu một phần dữ liệu: " + loiCtl) : "") +
      veCot("Chờ", cot.cho, "Không việc nào đang chờ.") + veCot("Đang chạy", cot.chay, "Không AI nào đang chạy.") +
      veCot("Cần anh", cot.canAnh, "Không việc nào chờ anh.") + veCot("Xong (24 giờ)", cot.xong, "Chưa có việc xong hôm nay.");
  }

  // ---------- lịch chạy ----------
  const moTaNhip = (n) => !n ? "" : n.kieu === "moi-phut" ? `mỗi ${n.phut} phút` : n.kieu === "hang-ngay" ? `mỗi ngày lúc ${n.gio}` : n.kieu === "hang-tuan" ? `${THU[n.thu] || "?"} hằng tuần lúc ${n.gio}` : "";
  function veLich() {
    if (lich === null) { $("dsLich").innerHTML = loi(loiLich ? "Chưa đọc được lịch chạy: " + loiLich : "Chưa đọc được lịch chạy."); return; }
    if (!lich.length) { $("dsLich").innerHTML = rong("Chưa có lịch nào", "Ví dụ: mỗi sáng 8:00 hỏi Pain tóm tắt tiến độ các dự án; mỗi thứ Hai giao đội rà lỗi chặn còn mở."); return; }
    $("dsLich").innerHTML = lich.map((x) => { const cuoi = (x.lichSu || [])[0];   // ctl giữ lịch sử mới nhất ở đầu
      return `<div class="dong"><div>
        <div class="tieu">${esc(x.ten)} <span class="nhan ${x.bat ? "song" : ""}">${x.bat ? "đang bật" : "tắt"}</span></div>
        <div class="chi-tiet">${esc(x.loai === "hoi" ? "Hỏi " + (HOI[x.vai] || x.vai || "AI") : "Giao việc cho đội")} · ${esc(tenDuAn(x.workspace))} · ${esc(moTaNhip(x.nhip))}${x.bat && x.lanToi ? " · lần tới " + esc(new Date(x.lanToi).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })) : ""}</div>
        <div class="chi-tiet">${esc(cat(x.moTa, 200))}</div>
        ${cuoi ? `<div class="chi-tiet">Lần gần nhất ${esc(luc(cuoi.luc))}: <span class="${cuoi.kq === "loi" ? "hong" : cuoi.kq === "bo-qua" ? "canh-bao" : "dat"}">${esc(cuoi.kq === "bo-qua" ? "bỏ qua" : cuoi.kq === "loi" ? "lỗi" : "đã giao")}</span>${cuoi.ghiChu ? " · " + esc(cat(cuoi.ghiChu, 140)) : ""}</div>` : ""}
      </div><div class="hang">
        <button type="button" class="nut nho" data-bat="${esc(x.id)}" aria-pressed="${!!x.bat}">${x.bat ? "Tắt" : "Bật"}</button>
        <button type="button" class="nut nho" data-chay="${esc(x.id)}">Chạy ngay</button>
        <button type="button" class="nut nho" data-sua="${esc(x.id)}">Sửa</button>
        <button type="button" class="nut nho nguy" data-xoa="${esc(x.id)}">Xoá</button>
      </div></div>`; }).join("");
  }

  function moBieuMau(x = null) {
    sua = x;
    const n = (x && x.nhip) || { kieu: "hang-ngay", gio: "08:00" }, f = $("bieuMau");
    const duAn = kho.dsDuAn.length ? kho.dsDuAn : [];
    f.hidden = false;
    f.innerHTML = `<h3 class="dau">${x ? "Sửa lịch" : "Lịch mới"}</h3><div class="bieu-mau">
      <label>Tên<input class="o" name="ten" required maxlength="80" value="${esc(x ? x.ten : "")}" placeholder="Tóm tắt tiến độ buổi sáng"></label>
      <label>Loại<select class="o" name="loai"><option value="hoi"${!x || x.loai === "hoi" ? " selected" : ""}>Hỏi một AI (chỉ đọc)</option><option value="luong"${x && x.loai === "luong" ? " selected" : ""}>Giao việc cho đội (luồng tự chạy)</option></select></label>
      <label data-chi="hoi">Hỏi ai<select class="o" name="vai">${Object.entries(HOI).map(([k, t]) => `<option value="${k}"${x && x.vai === k ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <label>Dự án<select class="o" name="workspace" required>${duAn.map((w) => `<option value="${esc(w.path)}"${(x ? x.workspace : kho.duAn) === w.path ? " selected" : ""}>${esc(w.name || tenDuAn(w.path))}</option>`).join("") || '<option value="">Chưa có dự án</option>'}</select></label>
      <label>Nhịp<select class="o" name="kieu"><option value="hang-ngay"${n.kieu === "hang-ngay" ? " selected" : ""}>Mỗi ngày</option><option value="hang-tuan"${n.kieu === "hang-tuan" ? " selected" : ""}>Mỗi tuần</option><option value="moi-phut"${n.kieu === "moi-phut" ? " selected" : ""}>Mỗi N phút</option></select></label>
      <label data-chi="tuan">Thứ<select class="o" name="thu">${[1, 2, 3, 4, 5, 6, 7].map((t) => `<option value="${t}"${n.thu === t ? " selected" : ""}>${THU[t]}</option>`).join("")}</select></label>
      <label data-chi="gio">Giờ<input class="o" name="gio" type="time" value="${esc(n.gio || "08:00")}"></label>
      <label data-chi="phut">Mỗi bao nhiêu phút (ít nhất 30)<input class="o" name="phut" type="number" min="30" step="5" value="${esc(n.phut || 120)}"></label>
      <label class="rong-het">Mỗi lần chạy làm đúng việc này<textarea class="o" name="moTa" required maxlength="4000" placeholder="Ví dụ: Đọc agent.md và git log 24 giờ qua, tóm tắt 5 dòng: Phase, ai giữ lượt, lỗi chặn còn mở, việc cần anh.">${esc(x ? x.moTa : "")}</textarea></label>
    </div><div class="hang"><button type="submit" class="nut-chinh">${x ? "Lưu" : "Tạo lịch (đang tắt)"}</button><button type="button" class="nut" id="nutDongBm">Huỷ</button><span class="hong" id="loiBm" role="alert"></span></div>`;
    hienTruong(); f.querySelector("[name=ten]").focus();
  }
  function hienTruong() {
    const f = $("bieuMau"), kieu = f.querySelector("[name=kieu]").value, loai = f.querySelector("[name=loai]").value;
    f.querySelector("[data-chi=hoi]").hidden = loai !== "hoi";
    f.querySelector("[data-chi=tuan]").hidden = kieu !== "hang-tuan";
    f.querySelector("[data-chi=gio]").hidden = kieu === "moi-phut";
    f.querySelector("[data-chi=phut]").hidden = kieu !== "moi-phut";
  }
  async function guiBieuMau(e) {
    e.preventDefault();
    const f = $("bieuMau"), g = (n) => f.querySelector(`[name=${n}]`).value.trim(), kieu = g("kieu");
    const nhip = kieu === "moi-phut" ? { kieu, phut: Number(g("phut")) } : kieu === "hang-tuan" ? { kieu, thu: Number(g("thu")), gio: g("gio") } : { kieu, gio: g("gio") };
    const body = { ...(sua ? { id: sua.id, bat: sua.bat } : {}), ten: g("ten"), loai: g("loai"), workspace: g("workspace"), moTa: g("moTa"), nhip, ...(g("loai") === "hoi" ? { vai: g("vai") } : {}) };
    f.querySelectorAll("[aria-invalid]").forEach((o) => o.removeAttribute("aria-invalid"));
    const [truong, thieu] = !body.ten ? ["ten", "Nhập tên."] : !body.moTa ? ["moTa", "Nhập việc mỗi lần chạy làm."] : !body.workspace ? ["workspace", "Chọn dự án."]
      : kieu === "moi-phut" && !(nhip.phut >= 30) ? ["phut", "Nhịp ít nhất 30 phút để giữ hạn mức."] : [null, ""];
    if (thieu) { const o = f.querySelector(`[name=${truong}]`); o.setAttribute("aria-invalid", "true"); o.focus(); f.querySelector("#loiBm").textContent = thieu; return; }
    const nut = f.querySelector("[type=submit]"); nut.setAttribute("aria-busy", "true"); nut.disabled = true;
    try { await ctl("/lich-chay", body); bao(sua ? "Đã lưu lịch." : "Đã tạo lịch (đang tắt). Bấm Bật khi sẵn sàng."); f.hidden = true; sua = null; tai(); }
    catch (err) { f.querySelector("#loiBm").textContent = err.message; nut.removeAttribute("aria-busy"); nut.disabled = false; }
  }
  // nut: khoá nút trong lúc ctl xử lý (Chạy ngay có thể mất cả phút khi phải giao việc), tránh bấm hai lần.
  async function hanhDong(duongDan, body, xong, nut = null) {
    if (nut) { nut.disabled = true; nut.setAttribute("aria-busy", "true"); }
    try { await ctl(duongDan, body, { timeout: 180000 }); bao(xong); tai(); }
    catch (e) { bao(e.message, true); if (nut) { nut.disabled = false; nut.removeAttribute("aria-busy"); } }
  }

  vung.addEventListener("click", (e) => {
    const t = e.target;
    const n = t.closest("[data-ngan]"); if (n) return ngan.mo(n.dataset.ngan, n, { khiDoi: tai });
    if (t.closest("#nutThemLich")) return moBieuMau();
    if (t.closest("#nutDongBm")) { $("bieuMau").hidden = true; sua = null; return; }
    const b = t.closest("[data-bat]"); if (b) { const x = lich.find((y) => y.id === b.dataset.bat); return hanhDong(`/lich-chay/${encodeURIComponent(x.id)}/bat`, { bat: !x.bat }, x.bat ? "Đã tắt lịch." : "Đã bật lịch."); }
    const c = t.closest("[data-chay]"); if (c) { c.textContent = "Đang chạy…"; return hanhDong(`/lich-chay/${encodeURIComponent(c.dataset.chay)}/chay-ngay`, {}, "Đã chạy (xem kết quả ở dòng lịch).", c); }
    const s = t.closest("[data-sua]"); if (s) return moBieuMau(lich.find((y) => y.id === s.dataset.sua));
    const x = t.closest("[data-xoa]"); if (x && confirm("Xoá lịch này?")) return hanhDong(`/lich-chay/${encodeURIComponent(x.dataset.xoa)}/xoa`, {}, "Đã xoá lịch.");
    if (t.closest("[data-thu-lai]")) return tai();
  });
  vung.addEventListener("change", (e) => { if (e.target.closest("#bieuMau")) hienTruong(); });
  vung.addEventListener("submit", (e) => { if (e.target.id === "bieuMau") guiBieuMau(e); });

  await tai();
  const hen = setInterval(() => { if (!document.hidden) tai(); }, 15000);
  return () => { conSong = false; clearInterval(hen); };
}
