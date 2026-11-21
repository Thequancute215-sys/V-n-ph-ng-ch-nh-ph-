// Khu Models và quyền (OS-2, học "thuê model, sở hữu bộ não; đổi model theo vai; ba mức quyền" của Javis OS — phòng sạch).
// - Model + mức suy nghĩ theo phòng: ctl /dieu-phoi (coDinh). Bỏ cố định thì văn phòng tự chọn theo độ khó lượt (tuDong).
//   Danh sách model lấy từ chính CLI trên máy (/dieu-phoi/models), không gõ tay.
// - Mức quyền theo vai: ctl /quyen (ctl/quyen.js): Đề xuất (chỉ đọc) / Tự làm (ghi nháp) / Toàn quyền. Áp thật ở lượt kế tiếp.
// - Hạn mức và tài khoản: /quotas, /codex-tai-khoan, /agy-tai-khoan (chỉ đọc ở đây; thêm/đổi tài khoản ở Hệ thống → Kết nối).
import { esc, luc, dangTai, rong, loi, VAI, TEN_NEN } from "../ui.js";

const MUC = [["doc", "Đề xuất (chỉ đọc)", "Chỉ đọc repo, trả đề xuất; không sửa file nào."], ["nhap", "Tự làm (ghi nháp)", "Sửa file trong repo, lệnh giới hạn; không cài, không bỏ qua sandbox."],
  ["toan", "Toàn quyền", "Chạy không giới hạn trên máy để kiểm thử thật; vẫn qua cổng rà soát file chữ của dự án."]];
const PHONG = [...new Map(VAI.map((v) => [v.phong, v])).values()];   // mỗi phòng một dòng model (Itachi làm hai vai, chung model)

export async function mo(vung, { ctl, bao }) {
  vung.innerHTML = `<div class="vung">
    <section class="khoi" aria-labelledby="hModel">
      <div class="dau-hang"><h2 class="dau" id="hModel">Model theo phòng</h2><span class="mo" id="tuDongMo"></span><button type="button" class="nut nho" id="nutTuDong" style="margin-left:auto"></button></div>
      <div id="bangModel" class="bang-cuon">${dangTai(4)}</div>
    </section>
    <section class="khoi" aria-labelledby="hQuyen">
      <div class="dau-hang"><h2 class="dau" id="hQuyen">Mức quyền theo vai</h2><span class="mo">Áp ở lượt kế tiếp của vai đó. Trò chuyện, báo cáo và soạn prompt luôn chỉ đọc.</span></div>
      <div id="bangQuyen" class="bang-cuon">${dangTai(4)}</div>
    </section>
    <section class="khoi" aria-labelledby="hHan"><div class="dau-hang"><h2 class="dau" id="hHan">Hạn mức và tài khoản</h2><a class="nut nho" href="#/he/ket-noi" style="margin-left:auto">Thêm hoặc đổi tài khoản</a></div><div id="hanMuc">${dangTai(3)}</div></section>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let dp = null, models = null, quyen = null, conSong = true;

  async function tai() {
    const [a, b, c, d] = await Promise.allSettled([ctl("/dieu-phoi"), ctl("/dieu-phoi/models"), ctl("/quyen"), ctl("/quotas")]);
    if (!conSong) return;
    dp = a.status === "fulfilled" ? a.value.dieuPhoi : null;
    models = b.status === "fulfilled" ? b.value.models : null;
    quyen = c.status === "fulfilled" ? c.value.quyen : null;
    veModel(a.status === "rejected" ? a.reason.message : "");
    veQuyen(c.status === "rejected" ? c.reason.message : "");
    veHan(d.status === "fulfilled" ? d.value : null, d.status === "rejected" ? d.reason.message : "");
  }

  function veModel(l) {
    if (!dp) { $("bangModel").innerHTML = loi("Chưa đọc được điều phối model" + (l ? ": " + l : "")); $("nutTuDong").hidden = true; return; }
    $("nutTuDong").hidden = false;
    $("nutTuDong").textContent = dp.tuDong === false ? "Bật tự chọn theo độ khó" : "Tắt tự chọn theo độ khó";
    $("tuDongMo").textContent = dp.tuDong === false ? "Đang tắt tự chọn: phòng không cố định dùng model mặc định của vai." : "Phòng không cố định: văn phòng tự chọn model và mức theo độ khó từng lượt.";
    $("bangModel").innerHTML = `<table class="bang"><thead><tr><th>Phòng</th><th>AI</th><th>Model</th><th>Mức suy nghĩ</th><th></th></tr></thead><tbody>${PHONG.map((v) => {
      const ds = (models && models[v.nen] && models[v.nen].models) || [], co = (dp.coDinh || {})[v.phong] || null;
      const chon = co && co.model, mucChon = co && co.effort, m = ds.find((x) => x.id === chon), efforts = (m && m.efforts) || ["low", "medium", "high", "xhigh", "max"];
      return `<tr data-phong="${esc(v.phong)}"><td>${esc(v.ten.replace(/ \(.*\)$/, ""))}<div class="mo" style="font-size:var(--text-xs)">${esc(VAI.filter((x) => x.phong === v.phong).map((x) => x.viec).join("; "))}</div></td>
        <td>${esc(TEN_NEN[v.nen])}</td>
        <td><label class="visually-hidden" for="m-${esc(v.phong)}">Model của ${esc(v.ten)}</label><select class="o" id="m-${esc(v.phong)}" data-model>
          <option value="">${dp.tuDong === false ? "Mặc định của vai" : "Tự chọn theo độ khó"}</option>
          ${ds.map((x) => `<option value="${esc(x.id)}"${x.id === chon ? " selected" : ""}>${esc(x.name || x.id)}</option>`).join("")}
          ${chon && !m ? `<option value="${esc(chon)}" selected>${esc(chon)} (không thấy trong CLI)</option>` : ""}</select></td>
        <td><label class="visually-hidden" for="e-${esc(v.phong)}">Mức suy nghĩ của ${esc(v.ten)}</label><select class="o" id="e-${esc(v.phong)}" data-effort${chon ? "" : " disabled"}>
          <option value="">mặc định</option>${efforts.map((e) => `<option${e === mucChon ? " selected" : ""}>${esc(e)}</option>`).join("")}</select></td>
        <td><button type="button" class="nut nho" data-luu-model>Lưu</button></td></tr>`; }).join("")}</tbody></table>
      ${models ? `<p class="mo" style="font-size:var(--text-xs)">Danh sách model đọc từ CLI trên máy ${models.checkedAt ? esc(luc(models.checkedAt)) : ""}. Model không thấy ở đây là CLI trên máy chưa hỗ trợ.</p>` : '<p class="canh-bao">Chưa đọc được danh sách model từ CLI.</p>'}`;
  }

  function veQuyen(l) {
    if (!quyen) { $("bangQuyen").innerHTML = loi("Chưa đọc được mức quyền" + (l ? ": " + l : "")); return; }
    $("bangQuyen").innerHTML = `<table class="bang"><thead><tr><th>Vai</th>${MUC.map(([, t, g]) => `<th title="${esc(g)}">${esc(t)}</th>`).join("")}</tr></thead><tbody>${VAI.map((v) => {
      const m = (quyen.muc || {})[v.role];
      return `<tr><td>${esc(v.ten)}<div class="mo" style="font-size:var(--text-xs)">${esc(v.viec)}</div></td>${MUC.map(([k, t]) =>
        `<td><label class="hang"><input type="radio" name="q-${esc(v.role)}" value="${k}" data-role="${esc(v.role)}"${m === k ? " checked" : ""}><span class="visually-hidden">${esc(v.ten)}: </span>${esc(t)}</label></td>`).join("")}</tr>`; }).join("")}</tbody></table>
      <ul class="mo" style="font-size:var(--text-xs);margin:0;padding-left:var(--space-md)">${MUC.map(([, t, g]) => `<li><b class="phu">${esc(t)}</b>: ${esc(g)}</li>`).join("")}</ul>`;
  }

  function veHan(q, l) {
    if (!q) { $("hanMuc").innerHTML = loi("Chưa đọc được hạn mức" + (l ? ": " + l : ""), false); return; }
    const ps = q.providers || [];
    $("hanMuc").innerHTML = ps.length ? `<table class="bang"><thead><tr><th>AI</th><th>Khung</th><th class="so">Còn</th><th>Đặt lại</th></tr></thead><tbody>${ps.flatMap((p) => (p.buckets || []).map((b, i) =>
      `<tr><td>${i ? "" : esc(p.name || p.id)}${!i && p.error ? `<div class="hong" style="font-size:var(--text-xs)">${esc(p.error)}</div>` : ""}</td><td>${esc((b.group && b.group !== p.id ? b.group + " · " : "") + b.label)}</td>
       <td class="so ${b.remainingPercent < 15 ? "hong" : b.remainingPercent < 35 ? "canh-bao" : ""}">${b.remainingPercent == null ? "?" : Math.round(b.remainingPercent) + "%"}</td>
       <td class="mo">${b.resetAt ? esc(new Date(b.resetAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })) : esc(b.resetLabel || "")}</td></tr>`)).join("")}</tbody></table>`
      : rong("Chưa có hạn mức", "Văn phòng chưa đọc được hạn mức của AI nào.");
  }

  async function luuModel(tr) {
    const phong = tr.dataset.phong, model = tr.querySelector("[data-model]").value, effort = tr.querySelector("[data-effort]").value;
    try { const d = await ctl("/dieu-phoi", { coDinh: { [phong]: model ? { model, ...(effort ? { effort } : {}) } : null } }); dp = d.dieuPhoi || dp;
      bao(model ? `Đã cố định ${model}${effort ? " · " + effort : ""}.` : "Đã bỏ cố định: văn phòng tự chọn theo độ khó."); tai(); }
    catch (e) { bao(e.message, true); }
  }

  vung.addEventListener("click", async (e) => {
    const t = e.target;
    const l = t.closest("[data-luu-model]"); if (l) return luuModel(l.closest("tr"));
    if (t.closest("#nutTuDong")) { try { await ctl("/dieu-phoi", { tuDong: dp.tuDong === false }); bao("Đã đổi chế độ tự chọn."); tai(); } catch (err) { bao(err.message, true); } return; }
    if (t.closest("[data-thu-lai]")) tai();
  });
  vung.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.matches("[data-model]")) { const ef = t.closest("tr").querySelector("[data-effort]"); ef.disabled = !t.value; return; }
    if (t.matches("input[type=radio][data-role]")) {
      const role = t.dataset.role, muc = t.value;
      if (muc === "toan" && !confirm("Cho " + (VAI.find((v) => v.role === role) || {}).ten + " toàn quyền trên máy (không sandbox)?")) { veQuyen(""); return; }
      try { const d = await ctl("/quyen", { role, muc }); quyen = d.quyen || quyen; bao("Đã đặt mức quyền, áp ở lượt kế tiếp."); veQuyen(""); }
      catch (err) { bao(err.message, true); veQuyen(""); }
    }
  });

  await tai();
  return () => { conSong = false; };
}
