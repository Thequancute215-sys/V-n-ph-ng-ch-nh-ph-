// Khu Models và quyền (OS-2, học "thuê model, sở hữu bộ não; đổi model theo vai; ba mức quyền" của Javis OS — phòng sạch).
// - Model + mức suy nghĩ theo phòng: ctl /dieu-phoi (coDinh). Bỏ cố định thì văn phòng tự chọn theo độ khó lượt (tuDong).
//   Danh sách model lấy từ chính CLI trên máy (/dieu-phoi/models), không gõ tay.
// - Mức quyền theo vai: ctl /quyen (ctl/quyen.js): Đề xuất (chỉ đọc) / Tự làm (ghi nháp) / Toàn quyền. Áp thật ở lượt kế tiếp.
// - Hạn mức: /quotas. Tài khoản AI: /codex-tai-khoan (GPT cho Codex: thêm + đăng nhập trên trình duyệt, dùng, bỏ, tự chuyển) và
//   /agy-tai-khoan (Antigravity: cất tài khoản đang đăng nhập trong agy, dùng, bỏ, tự chuyển, đọc tài khoản nghỉ).
//   Trước OS-2 các nút này chỉ có trong hộp thoại văn phòng 3D (public/office-desk.js); máy tính không còn vào 3D nên đặt ở đây.
import { esc, luc, dangTai, rong, loi, VAI, TEN_NEN } from "../ui.js";

const MUC = [["doc", "Đề xuất (chỉ đọc)", "Chỉ đọc repo, trả đề xuất; không sửa file nào."], ["nhap", "Tự làm (ghi nháp)", "Sửa file trong repo, lệnh giới hạn; không cài, không bỏ qua sandbox."],
  ["toan", "Toàn quyền", "Chạy không giới hạn trên máy để kiểm thử thật; vẫn qua cổng rà soát file chữ của dự án."]];
const TEN_MUC = { low: "nhẹ (low)", medium: "vừa (medium)", high: "kỹ (high)", xhigh: "rất kỹ (xhigh)", max: "tối đa (max)", ultra: "cực đại (ultra)" };
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
    <section class="khoi" aria-labelledby="hTk">
      <div class="dau-hang"><h2 class="dau" id="hTk">Tài khoản AI</h2><span class="mo">Đổi tài khoản áp dụng từ lượt kế tiếp; lượt đang chạy không bị ảnh hưởng.</span></div>
      <div class="luoi-2"><div id="tkGpt">${dangTai(3)}</div><div id="tkAgy">${dangTai(3)}</div></div>
    </section>
    <section class="khoi" aria-labelledby="hHan"><div class="dau-hang"><h2 class="dau" id="hHan">Hạn mức</h2><a class="nut nho" href="#/he/ket-noi" style="margin-left:auto">Kết nối khác (MCP, khoá)</a></div><div id="hanMuc">${dangTai(3)}</div></section>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let dp = null, models = null, quyen = null, gpt = null, agy = null, conSong = true, henDn = null;

  // Mỗi ô vẽ ngay khi nguồn của nó trả lời: đọc tài khoản Antigravity mất vài giây (ctl dò kho mật khẩu Windows), không bắt cả trang chờ.
  async function tai() {
    const ve = (fn) => (...x) => { if (conSong) fn(...x); };
    await Promise.allSettled([
      Promise.allSettled([ctl("/dieu-phoi"), ctl("/dieu-phoi/models")]).then(ve(([a, b]) => {
        dp = a.status === "fulfilled" ? a.value.dieuPhoi : null; models = b.status === "fulfilled" ? b.value.models : null;
        veModel(a.status === "rejected" ? a.reason.message : ""); })),
      ctl("/quyen").then(ve((v) => { quyen = v.quyen; veQuyen(""); }), ve((e) => { quyen = null; veQuyen(e.message); })),
      ctl("/quotas").then(ve((v) => veHan(v, "")), ve((e) => veHan(null, e.message))),
      ctl("/codex-tai-khoan").then(ve((v) => { gpt = v.taiKhoan; veGpt(""); }), ve((e) => { gpt = null; veGpt(e.message); })),
      ctl("/agy-tai-khoan").then(ve((v) => { agy = v.taiKhoan; veAgy(""); }), ve((e) => { agy = null; veAgy(e.message); })),
    ]);
    if (!conSong) return;
    // Đang chờ anh đăng nhập GPT trên trình duyệt: đọc lại sau ít giây để thấy đăng nhập xong.
    clearTimeout(henDn);
    if (gpt && (gpt.ds || []).some((x) => x.dangNhap && !x.dangNhap.loi)) henDn = setTimeout(() => { if (conSong && !document.hidden) tai(); }, 4000);
  }

  const conLai = (v) => (v === null || v === undefined ? "chưa đọc" : "còn " + Math.round(v) + "%");
  const tuChuyen = (tk, loai) => `<div class="hang" style="font-size:var(--text-sm)"><label class="hang"><input type="checkbox" data-tu="${loai}"${tk.tuChuyen ? " checked" : ""}> Tự chuyển khi tài khoản đang dùng còn ≤</label>
    <label class="visually-hidden" for="ng-${loai}">Ngưỡng tự chuyển (%)</label><input class="o" id="ng-${loai}" type="number" min="1" max="50" value="${esc(tk.nguong)}" data-nguong="${loai}" style="width:5em"><span>%</span></div>`;
  function veGpt(l) {
    if (!gpt) { $("tkGpt").innerHTML = loi("Chưa đọc được tài khoản GPT" + (l ? ": " + l : "")); return; }
    $("tkGpt").innerHTML = `<h3 class="dau">GPT cho Codex (Itachi, Sasuke)</h3>
      ${gpt.trung ? '<p class="hong">Hai tài khoản đang cùng một email: bấm Đăng nhập lại ở tài khoản thêm và chọn đúng tài khoản kia.</p>' : ""}
      ${(gpt.ds || []).map((x) => { const dn = x.dangNhap;
        return `<div class="dong"><div><div class="tieu">${esc(x.nhan)} ${x.dangDung ? '<span class="nhan song">đang dùng</span>' : ""}</div>
          <div class="chi-tiet">${esc([x.email, x.plan ? "gói " + x.plan : ""].filter(Boolean).join(" · "))}</div>
          <div class="chi-tiet">${x.loi ? `<span class="hong">${esc(x.loi)}</span>` : "Hạn mức " + esc(conLai(x.conLai)) + (x.hanMuc && x.hanMuc.luc ? ", đọc " + esc(luc(x.hanMuc.luc)) : "")}</div>
          ${dn && dn.url ? `<div class="chi-tiet canh-bao">Đang chờ anh đăng nhập: <a href="${esc(dn.url)}" target="_blank" rel="noopener noreferrer">mở trang đăng nhập</a> (trình duyệt đang đăng nhập tài khoản GPT khác thì mở link trong cửa sổ ẩn danh).</div>`
            : dn && !dn.loi ? '<div class="chi-tiet">Đang mở trang đăng nhập…</div>' : dn && dn.loi ? `<div class="chi-tiet hong">${esc(dn.loi)}</div>` : ""}</div>
          <div class="hang">${x.dangDung || !x.daDangNhap ? "" : `<button type="button" class="nut nho" data-gpt-chuyen="${esc(x.id)}">Dùng</button>`}
            <button type="button" class="nut nho" data-gpt-dn="${esc(x.id)}">${x.daDangNhap ? "Đăng nhập lại" : "Đăng nhập"}</button>
            ${x.macDinh ? "" : `<button type="button" class="nut nho nguy" data-gpt-bo="${esc(x.id)}">Bỏ</button>`}</div></div>`; }).join("") || rong("Chưa có tài khoản GPT", "Thêm tài khoản để Codex chạy.")}
      ${tuChuyen(gpt, "gpt")}
      <form class="hang" id="fGpt" novalidate><label class="visually-hidden" for="nhanGpt">Tên tài khoản GPT mới</label><input class="o" id="nhanGpt" maxlength="40" placeholder="Tên, vd. GPT Pro 3" style="flex:1;min-width:140px">
        <button type="submit" class="nut nho">Thêm và đăng nhập</button><button type="button" class="nut nho" data-gpt-doc>Đọc hạn mức mọi tài khoản</button></form>`;
  }
  function veAgy(l) {
    if (!agy) { $("tkAgy").innerHTML = loi("Chưa đọc được tài khoản Antigravity" + (l ? ": " + l : "")); return; }
    if (!agy.hoTro) { $("tkAgy").innerHTML = `<h3 class="dau">Antigravity (Hinata, Kakashi)</h3><p class="mo">Đổi tài khoản Antigravity chỉ làm được khi văn phòng chạy trên Windows.</p>`; return; }
    $("tkAgy").innerHTML = `<h3 class="dau">Antigravity (Hinata, Kakashi)</h3>
      ${agy.loi ? `<p class="hong">${esc(agy.loi)}</p>` : ""}${agy.dangTrao ? '<p class="mo">Đang tạm đổi tài khoản để đọc hạn mức…</p>' : ""}
      ${(agy.ds || []).map((x) => `<div class="dong"><div><div class="tieu">${esc(x.nhan)} ${x.dangDung ? '<span class="nhan song">đang dùng</span>' : ""}</div>
          <div class="chi-tiet">${esc(x.email || "")}${x.soModel ? " · " + esc(x.soModel) + " model" : ""}</div>
          <div class="chi-tiet">Gemini ${esc(conLai(x.conLai))}${x.hanMuc && x.hanMuc.luc ? ", đọc " + esc(luc(x.hanMuc.luc)) : ""}</div></div>
          <div class="hang">${x.dangDung ? "" : `<button type="button" class="nut nho" data-agy-chuyen="${esc(x.id)}">Dùng</button>`}<button type="button" class="nut nho nguy" data-agy-xoa="${esc(x.id)}">Bỏ</button></div></div>`).join("")
        || rong("Chưa cất tài khoản nào", "Làm theo các bước bên dưới để cất tài khoản đầu tiên.")}
      ${tuChuyen(agy, "agy")}
      <details><summary>Thêm tài khoản Antigravity</summary><ol style="margin:var(--space-xs) 0;padding-left:var(--space-lg);line-height:1.6">
        <li>Mở PowerShell, gõ <code>agy</code>.</li><li>Trong agy gõ <code>/logout</code>, rồi đăng nhập tài khoản mới trên trình duyệt.</li>
        <li>Thoát agy (gõ <code>/exit</code>).</li><li>Đặt tên rồi bấm Cất. Văn phòng giữ một bản sao đăng nhập trong kho mật khẩu của Windows.</li></ol>
        <p class="mo" style="font-size:var(--text-xs)">Văn phòng chỉ đổi tài khoản khi không có phiên agy nào đang chạy. Tài khoản đang đăng nhập chưa cất thì văn phòng không tự đổi đi, để không mất đăng nhập đó.</p></details>
      <form class="hang" id="fAgy" novalidate><label class="visually-hidden" for="nhanAgy">Tên tài khoản Antigravity đang đăng nhập</label><input class="o" id="nhanAgy" maxlength="40" placeholder="Tên, vd. Pro 2" style="flex:1;min-width:140px">
        <button type="submit" class="nut nho">Cất tài khoản đang đăng nhập</button>${(agy.ds || []).length > 1 ? '<button type="button" class="nut nho" data-agy-doc>Đọc hạn mức tài khoản đang nghỉ</button>' : ""}</form>`;
  }
  async function goiTk(duong, body, xong, timeout = 60000) {
    try { await ctl(duong, body, { timeout }); bao(xong); } catch (e) { bao(e.message, true); }
    tai();
  }

  function veModel(l) {
    if (!dp) { $("bangModel").innerHTML = loi("Chưa đọc được điều phối model" + (l ? ": " + l : "")); $("nutTuDong").hidden = true; return; }
    $("nutTuDong").hidden = false;
    $("nutTuDong").textContent = dp.tuDong === false ? "Bật tự chọn theo độ khó" : "Tắt tự chọn theo độ khó";
    $("tuDongMo").textContent = dp.tuDong === false ? "Đang tắt tự chọn: phòng không cố định dùng model mặc định của vai." : "Phòng không cố định: văn phòng tự chọn model và mức theo độ khó từng lượt.";
    $("bangModel").innerHTML = `<table class="bang"><thead><tr><th>Phòng</th><th>AI</th><th>Model</th><th>Mức suy nghĩ</th></tr></thead><tbody>${PHONG.map((v) => {
      const ds = (models && models[v.nen] && models[v.nen].models) || [], co = (dp.coDinh || {})[v.phong] || null;
      const chon = co && co.model, mucChon = co && co.effort, m = ds.find((x) => x.id === chon), efforts = (m && m.efforts) || ["low", "medium", "high", "xhigh", "max"];
      return `<tr data-phong="${esc(v.phong)}"><td>${esc(v.ten.replace(/ \(.*\)$/, ""))}<div class="mo" style="font-size:var(--text-xs)">${esc(VAI.filter((x) => x.phong === v.phong).map((x) => x.viec).join("; "))}</div></td>
        <td>${esc(TEN_NEN[v.nen])}</td>
        <td><label class="visually-hidden" for="m-${esc(v.phong)}">Model của ${esc(v.ten)}</label><select class="o" id="m-${esc(v.phong)}" data-model>
          <option value="">${dp.tuDong === false ? "Mặc định của vai" : "Tự chọn theo độ khó"}</option>
          ${ds.map((x) => `<option value="${esc(x.id)}"${x.id === chon ? " selected" : ""}>${esc(x.name || x.id)}</option>`).join("")}
          ${chon && !m ? `<option value="${esc(chon)}" selected>${esc(chon)} (phần mềm trên máy chưa có)</option>` : ""}</select></td>
        <td><label class="visually-hidden" for="e-${esc(v.phong)}">Mức suy nghĩ của ${esc(v.ten)}</label><select class="o" id="e-${esc(v.phong)}" data-effort${chon ? "" : " disabled"}>
          <option value="">mặc định</option>${efforts.map((e) => `<option value="${esc(e)}"${e === mucChon ? " selected" : ""}>${esc(TEN_MUC[e] || e)}</option>`).join("")}</select></td></tr>`; }).join("")}</tbody></table>
      ${models ? `<p class="mo" style="font-size:var(--text-xs)">Danh sách model đọc từ phần mềm AI cài trên máy ${models.checkedAt ? esc(luc(models.checkedAt)) : ""}. Model không có ở đây là phần mềm trên máy chưa hỗ trợ.</p>` : '<p class="canh-bao">Chưa đọc được danh sách model từ phần mềm AI trên máy.</p>'}`;
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
       <td class="so ${b.remainingPercent == null ? "" : b.remainingPercent < 15 ? "hong" : b.remainingPercent < 35 ? "canh-bao" : ""}">${b.remainingPercent == null ? "?" : Math.round(b.remainingPercent) + "%"}</td>
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
    if (t.closest("#nutTuDong")) { try { await ctl("/dieu-phoi", { tuDong: dp.tuDong === false }); bao("Đã đổi chế độ tự chọn."); tai(); } catch (err) { bao(err.message, true); } return; }
    const g = t.closest("[data-gpt-chuyen]"); if (g) return goiTk(`/codex-tai-khoan/${encodeURIComponent(g.dataset.gptChuyen)}/chuyen`, {}, "Đã đổi tài khoản GPT. Lượt Codex kế tiếp dùng tài khoản này.");
    const dn = t.closest("[data-gpt-dn]"); if (dn) return goiTk(`/codex-tai-khoan/${encodeURIComponent(dn.dataset.gptDn)}/dang-nhap`, {}, "Đang mở trang đăng nhập ChatGPT trên máy này. Đăng nhập xong văn phòng tự đọc hạn mức.");
    const gb = t.closest("[data-gpt-bo]"); if (gb) { if (confirm("Bỏ tài khoản GPT này khỏi văn phòng? (Thư mục đăng nhập vẫn giữ trên máy.)")) goiTk(`/codex-tai-khoan/${encodeURIComponent(gb.dataset.gptBo)}/bo`, {}, "Đã bỏ tài khoản GPT."); return; }
    if (t.closest("[data-gpt-doc]")) return goiTk("/codex-tai-khoan/doc", {}, "Đã đọc hạn mức mọi tài khoản GPT.", 120000);
    const ac = t.closest("[data-agy-chuyen]"); if (ac) return goiTk(`/agy-tai-khoan/${encodeURIComponent(ac.dataset.agyChuyen)}/chuyen`, {}, "Đã đổi tài khoản Antigravity. Lượt Hinata/Kakashi kế tiếp dùng tài khoản này.");
    const ax = t.closest("[data-agy-xoa]"); if (ax) { if (confirm("Bỏ tài khoản này khỏi văn phòng? (Không đăng xuất tài khoản đang dùng trong Antigravity.)")) goiTk(`/agy-tai-khoan/${encodeURIComponent(ax.dataset.agyXoa)}/xoa`, {}, "Đã bỏ tài khoản Antigravity."); return; }
    if (t.closest("[data-agy-doc]")) return goiTk("/agy-tai-khoan/doc-nghi", {}, "Đang đọc hạn mức tài khoản đang nghỉ (khi máy rảnh Antigravity).", 120000);
    if (t.closest("[data-thu-lai]")) tai();
  });
  vung.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (e.target.id === "fAgy") return goiTk("/agy-tai-khoan/cat", { nhan: $("nhanAgy").value.trim() }, "Đã cất tài khoản Antigravity đang đăng nhập.");
    if (e.target.id === "fGpt") {
      const o = $("nhanGpt"), nhan = o.value.trim();
      if (!nhan) { o.setAttribute("aria-invalid", "true"); o.focus(); bao("Đặt tên cho tài khoản GPT trước (vd. GPT Pro 3).", true); return; }
      try {
        const { taiKhoan } = await ctl("/codex-tai-khoan/them", { nhan }, { timeout: 60000 });
        const moi = (taiKhoan.ds || []).find((x) => x.nhan === nhan);
        if (moi) await ctl(`/codex-tai-khoan/${encodeURIComponent(moi.id)}/dang-nhap`, {}, { timeout: 60000 });
        bao("Đã thêm " + nhan + ". Trình duyệt sẽ mở trang đăng nhập ChatGPT: chọn đúng tài khoản này (cửa sổ ẩn danh nếu trình duyệt đang đăng nhập tài khoản khác).");
      } catch (err) { bao(err.message, true); }
      tai();
    }
  });
  vung.addEventListener("change", async (e) => {
    const t = e.target;
    // Đổi model thì nạp lại đúng các mức suy nghĩ model đó có, rồi lưu luôn (giống bảng quyền: chọn là lưu, không có nút Lưu ẩn ý).
    if (t.matches("[data-model]") || t.matches("[data-effort]")) {
      const tr = t.closest("tr"), ef = tr.querySelector("[data-effort]");
      if (t.matches("[data-model]")) {
        const v = PHONG.find((x) => x.phong === tr.dataset.phong), m = ((models && models[v.nen] && models[v.nen].models) || []).find((x) => x.id === t.value);
        const ds = (m && m.efforts) || ["low", "medium", "high", "xhigh", "max"], cu = ef.value;
        ef.innerHTML = `<option value="">mặc định</option>` + ds.map((e) => `<option value="${esc(e)}"${e === cu ? " selected" : ""}>${esc(TEN_MUC[e] || e)}</option>`).join("");
        ef.disabled = !t.value;
      }
      return luuModel(tr);
    }
    if (t.matches("[data-tu]")) return goiTk(`/${t.dataset.tu === "gpt" ? "codex" : "agy"}-tai-khoan/sua`, { tuChuyen: t.checked }, t.checked ? "Đã bật tự chuyển tài khoản." : "Đã tắt tự chuyển tài khoản.");
    if (t.matches("[data-nguong]")) { const n = Number(t.value); if (!(n >= 1 && n <= 50)) { bao("Ngưỡng từ 1 đến 50%.", true); return; }
      return goiTk(`/${t.dataset.nguong === "gpt" ? "codex" : "agy"}-tai-khoan/sua`, { nguong: n }, "Đã đặt ngưỡng tự chuyển " + n + "%."); }
    if (t.matches("input[type=radio][data-role]")) {
      const role = t.dataset.role, muc = t.value;
      if (muc === "toan" && !confirm("Cho " + (VAI.find((v) => v.role === role) || {}).ten + " toàn quyền trên máy (không sandbox)?")) { veQuyen(""); return; }
      try { const d = await ctl("/quyen", { role, muc }); quyen = d.quyen || quyen; bao("Đã đặt mức quyền, áp ở lượt kế tiếp."); veQuyen(""); }
      catch (err) { bao(err.message, true); veQuyen(""); }
    }
  });

  await tai();
  return () => { conSong = false; clearTimeout(henDn); };
}
