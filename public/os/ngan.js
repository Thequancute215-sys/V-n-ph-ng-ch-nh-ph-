// Ngăn trượt tại chỗ (OS-3, "xem ở đâu, xử lý ngay ở đó"): bấm một việc ở Tổng quan, Việc và lịch chạy, Luồng và bàn giao
// hay Giao việc thì ngăn mở bên phải để duyệt/trả lại bàn giao, trả lời câu hỏi của AI, xem tiến độ lượt đang chạy — không chuyển trang.
// Một ngăn dùng chung cho cả OS: <dialog> mở dạng modal nên bàn phím ở yên trong ngăn, Esc đóng, đóng xong trả tiêu điểm về nút đã mở.
// Ba loại việc: "luong:<id>" (luồng tự chạy, ctl /autopilot/:id), "ban-giao:<job_id>" (/handoffs/:id), "lenh:<id>" (lượt AI hay lệnh, /jobs/:id).
// Nhật ký lượt đọc tiếp từ chỗ đã đọc (/jobs/:id/log?from=), chỉ giữ phần cuối để ngăn không phình khi lượt chạy lâu.
import { esc, cat, luc, dangTai, rong, loi, safeHttps } from "./ui.js";
import { TT_LUONG, LUONG_CHAY, TT_LENH, tenDuAn, tenVai, tenLenh, cauHoi, soLuot, lopLuong, danhSachGiaiThich } from "./viec-chung.js";

const LOG_GIU = 24000;                 // số ký tự nhật ký giữ trong ngăn
const NHIP_CHAY = 3000, NHIP_NGHI = 12000;
const LOAI = { luong: "Luồng tự chạy", "ban-giao": "Bàn giao", lenh: "Lượt AI" };
const KQ_BG = { approved: "anh đã duyệt", rejected: "anh đã trả lại", answered: "anh đã trả lời" };

export function taoNgan({ ctl, bao }) {
  const dlg = document.createElement("dialog");
  dlg.className = "ngan";
  dlg.setAttribute("aria-labelledby", "nganTieu");
  dlg.innerHTML = `<header class="ngan-dau"><div class="ngan-tieu"><span class="mo" id="nganLoai"></span><h2 id="nganTieu" tabindex="-1">Đang mở</h2></div>
      <button type="button" class="nut nho" data-dong data-k="dong">Đóng</button></header>
    <p class="ngan-bao" id="nganBao" role="status"></p>
    <div class="ngan-than" id="nganThan"></div>
    <section class="ngan-log" id="nganLog" hidden aria-labelledby="nganLogTieu">
      <div class="dau-hang"><h3 id="nganLogTieu">Nhật ký lượt</h3><span class="mo" id="nganLogTT" aria-live="polite"></span></div>
      <pre class="log" tabindex="0" aria-labelledby="nganLogTieu"></pre></section>
    <footer class="ngan-chan" id="nganChan" hidden></footer>`;
  document.body.append(dlg);
  const $ = (id) => dlg.querySelector("#" + id), pre = dlg.querySelector("pre.log");

  let ref = null, du = null, loiTai = "", hen = null, ky = "", khiDoi = null, nguoiMo = null, phien = 0, dangLam = false;
  let log = { job: null, from: null };

  function mo(chuoi, opener = null, { khiDoi: cb = null } = {}) {
    const i = String(chuoi || "").indexOf(":"), loai = String(chuoi).slice(0, i), id = String(chuoi).slice(i + 1);
    if (!LOAI[loai] || !id) return;
    ref = { loai, id }; du = null; loiTai = ""; ky = ""; dangLam = false; khiDoi = cb; nguoiMo = opener || document.activeElement; phien++;
    log = { job: null, from: null }; pre.textContent = ""; $("nganLog").hidden = true; baoNgan("");
    $("nganLoai").textContent = LOAI[loai]; $("nganTieu").textContent = "Đang mở…";
    $("nganThan").innerHTML = dangTai(5); $("nganChan").hidden = true;
    if (!dlg.open) dlg.showModal();
    $("nganTieu").focus();
    tai();
  }
  function dong() { if (dlg.open) dlg.close(); }
  dlg.addEventListener("close", () => {
    const chuoi = ref ? ref.loai + ":" + ref.id : "";
    clearTimeout(hen); ref = null; dangLam = false; phien++;
    // Trả tiêu điểm về nút đã mở; nút đó bị khoá (vd. Giao cho đội khi luồng đang chạy) hay khu đã vẽ lại danh sách
    // thì về nút khác của cùng việc, cuối cùng về vùng chính, để bàn phím không rơi về đầu trang.
    const dung = (el) => el && el.isConnected && !el.disabled && !el.closest("[hidden]");
    const dich = dung(nguoiMo) ? nguoiMo : [...document.querySelectorAll("[data-ngan]")].find((el) => el.dataset.ngan === chuoi && dung(el)) || document.getElementById("vung");
    if (dich) dich.focus();
    nguoiMo = null;
  });
  // Bấm vào nền mờ ngoài ngăn thì đóng (nền mờ thuộc chính <dialog>, nên đích của cú bấm là dlg).
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dong(); });

  const duongDan = () => ref.loai === "luong" ? "/autopilot/" : ref.loai === "ban-giao" ? "/handoffs/" : "/jobs/";
  async function tai() {
    clearTimeout(hen);
    if (!ref) return;
    const mine = phien, r = ref;
    if (!document.hidden) {
      try {
        const d = await ctl(duongDan() + encodeURIComponent(r.id), undefined, { timeout: 20000 });
        if (mine !== phien) return;
        du = d.run || d.handoff || d.job || null; loiTai = "";
      } catch (e) { if (mine !== phien) return; loiTai = e.status === 404 || e.code === "NOT_FOUND" ? "" : e.message; if (e.status === 404 || e.code === "NOT_FOUND") du = false; }
      ve();
      await duoiLog(mine);
      if (mine !== phien) return;
    }
    hen = setTimeout(tai, dangChay() ? NHIP_CHAY : NHIP_NGHI);
  }
  const dangChay = () => !!du && (ref.loai === "luong" ? LUONG_CHAY.has(du.status) : ref.loai === "lenh" ? du.status === "running" : false);

  // ---------- vẽ ----------
  function ve() {
    let tieu = LOAI[ref.loai], than, chan = "";
    if (du === null) than = loiTai ? loi("Chưa đọc được việc này: " + loiTai) : dangTai(5);
    else if (du === false) { tieu = "Không tìm thấy"; than = rong("Việc này không còn trong sổ", "Có thể việc đã được dọn khỏi sổ của bộ điều khiển. Đóng ngăn và mở lại danh sách để xem việc mới nhất."); }
    else {
      const x = ref.loai === "luong" ? veLuong(du) : ref.loai === "ban-giao" ? veBanGiao(du) : veLenh(du);
      tieu = x.tieu; than = (loiTai ? loi("Mất kết nối, đang hiện bản đọc trước: " + loiTai) : "") + x.than; chan = x.chan;
      $("nganLoai").textContent = x.loai || LOAI[ref.loai];
    }
    const moi = tieu + "\u0000" + than + "\u0000" + chan + "\u0000" + dangLam;
    if (moi === ky) return;
    ky = moi;
    // Giữ tiêu điểm và các mục <details> đang mở khi vẽ lại (ngăn tự đọc lại mỗi vài giây).
    const kTd = document.activeElement && dlg.contains(document.activeElement) ? document.activeElement.closest("[data-k]")?.dataset.k : null;
    const moSan = new Set([...dlg.querySelectorAll("details[data-k]")].filter((d) => d.open).map((d) => d.dataset.k));
    const dongSan = new Set([...dlg.querySelectorAll("details[data-k]")].filter((d) => !d.open).map((d) => d.dataset.k));
    $("nganTieu").textContent = tieu;
    $("nganThan").innerHTML = than;
    $("nganChan").innerHTML = chan; $("nganChan").hidden = !chan;
    dlg.querySelectorAll("details[data-k]").forEach((d) => { if (moSan.has(d.dataset.k)) d.open = true; else if (dongSan.has(d.dataset.k)) d.open = false; });
    if (kTd) { const el = dlg.querySelector(`[data-k="${CSS.escape(kTd)}"]`); (el && !el.disabled ? el : $("nganTieu")).focus(); }
  }

  const nut = (k, nhan, lop = "nut") => `<button type="button" class="${lop}" data-hd="${k}" data-k="hd-${k}"${dangLam ? " disabled" : ""}${dangLam === k ? ' aria-busy="true"' : ""}>${esc(dangLam === k ? "Đang gửi…" : nhan)}</button>`;
  const chonPhuongAn = (q, k) => `<section class="hoi-anh" aria-labelledby="hoi-${k}"><h3 id="hoi-${k}">${q.kind === "mien-hop-dong" ? "Sol đề nghị miễn hợp đồng: anh quyết" : "Claude hỏi anh"}</h3>
      <pre class="van-ban">${esc(q.question)}</pre>
      <div class="phuong-an">${(q.options || []).map((o) => `<button type="button" class="nut" data-tra-loi="${esc(o.id)}" data-k="tl-${esc(o.id)}"${dangLam ? " disabled" : ""}>
        <b>${esc(o.id)}</b><span>${esc(o.label)}${o.next_owner ? `<small>Lượt sang ${esc(tenVai(o.next_owner))}</small>` : ""}</span></button>`).join("")}</div></section>`;
  const dangChayHtml = (chu) => `<p class="dang-chay" role="status"><span class="cham" aria-hidden="true"></span>${esc(chu)}</p>`;

  function veLuong(r) {
    const conLai = r.deadline && LUONG_CHAY.has(r.status) ?Math.max(0, Math.round((r.deadline - Date.now()) / 60000)) : null;
    const cuoi = (r.steps || []).at(-1);
    let than = `<div class="hang"><span class="nhan ${lopLuong(r.status)}">${esc(TT_LUONG[r.status] || r.status)}</span>
        <span class="mo">${esc(tenDuAn(r.workspace))} · ${soLuot(r)}/${esc(r.maxSteps)} lượt${conLai !== null ? " · còn " + conLai + " phút" : ""} · cập nhật ${esc(luc(r.updatedAt))}</span></div>`;
    if (LUONG_CHAY.has(r.status)) than += dangChayHtml(r.status === "reporting" ? "Pain đang viết báo cáo cho anh" : cuoi ? tenVai(cuoi.role) + " đang làm lượt " + (r.steps.length) : "Đang chuẩn bị lượt đầu");
    if (r.git) than += `<p class="mo">Nhánh <code>${esc(r.git.branch)}</code> tách từ <code>${esc(r.git.from || "?")}</code>${r.git.pushed ? ", đã đẩy lên GitHub " + esc(luc(r.git.pushed.at)) : ""}</p>`;
    if (r.status === "awaiting_answer" && r.question) than += chonPhuongAn(r.question, "luong");
    if (r.status === "waiting_quota" && r.wait) than += `<section class="hoi-anh"><h3>${esc(r.wait.providerName || "AI")} hết hạn mức ở lượt của ${esc(tenVai(r.wait.role))}</h3>
      <p>Tự chạy lại lúc ${esc(new Date(r.wait.until).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }))} (giờ lấy từ ${esc(r.wait.source)}).</p>
      <p class="mo">Muốn làm lượt này trên ChatGPT web thì mở Công cụ cũ, Bảng điều phối (bản cũ).</p></section>`;
    if (r.status === "awaiting_scan") {
      const lyDo = r.scan?.truncated
        ? "Rà soát chưa hoàn tất. Mở Giao việc cho đội để kiểm tra trước khi chạy Toàn quyền."
        : "Luồng tạm dừng chờ anh duyệt rà soát. Duyệt ở Xưởng code, Giao việc cho đội.";
      than += `<p class="canh-bao">${lyDo}</p>`;
    }
    if (r.problem) than += loi(r.problem, false);
    if (r.report) than += `<details data-k="bao-cao"${["awaiting_approval", "attention"].includes(r.status) ? " open" : ""}><summary>Báo cáo của Claude</summary><pre class="van-ban">${esc(r.report)}</pre></details>`;
    than += `<section aria-labelledby="hLuot"><h3 id="hLuot">Các lượt</h3>${(r.steps || []).length ? `<ol class="cac-luot">${r.steps.map((s, i) => {
      const dangLuot = LUONG_CHAY.has(r.status) && i === r.steps.length - 1;
      return `<li${dangLuot ? ' aria-current="step"' : ""}><div><b>${esc(tenVai(s.role))}</b>${s.model ? ` <span class="mo">${esc(s.model)}${s.effort ? " · " + esc(s.effort) : ""}</span>` : ""}</div>
        <div class="mo">${s.quota ? (s.rejected ? "chưa áp: " + esc(s.rejected) : "hết hạn mức, chờ chạy lại") : s.saved?.commit ? "commit " + esc(s.saved.commit) : s.saved?.secret ? '<span class="hong">có chuỗi giống khóa API, chưa commit</span>' : dangLuot ? "đang làm" : "xong"}${s.via === "web" ? " · kết quả GPT web" : ""}</div>
        ${(s.explain || []).length ? `<details data-k="vs-${i}"><summary>Vì sao làm vậy</summary><ul>${s.explain.map((x) => `<li><b>Vấn đề:</b> ${esc(x.van_de)}<br><b>Đã làm:</b> ${esc(x.da_lam)}<br><b>Vì sao:</b> ${esc(x.vi_sao)}</li>`).join("")}</ul></details>` : ""}</li>`; }).join("")}</ol>`
      : `<p class="mo">Chưa có lượt nào.</p>`}</section>`;
    for (const d of r.decisions || []) than += `<p class="mo">Anh đã chọn ${esc(d.option)}: ${esc(d.label)}</p>`;
    let chan = "";
    if (["awaiting_approval", "attention"].includes(r.status)) chan += nut("approve", r.status === "attention" ? "Đã xem lỗi" : r.problem ? "Đã nhận báo cáo" : "Duyệt báo cáo", "nut-chinh") + nut("reject", "Từ chối");
    if (r.status === "waiting_quota") chan += nut("resume", "Chạy lại ngay", "nut-chinh");
    if (["running", "reporting", "awaiting_answer", "waiting_quota", "awaiting_scan"].includes(r.status)) chan += nut("stop", "Dừng luồng", "nut nguy");
    if (["approved", "acknowledged"].includes(r.status) && r.git && !r.git.pushed) chan += nut("push", "Đẩy nhánh lên GitHub");
    const compareUrl = safeHttps(r.git?.pushed?.compareUrl);
    if (compareUrl) chan += `<a class="nut" href="${esc(compareUrl)}" target="_blank" rel="noopener noreferrer" data-k="pr">Mở trang tạo PR</a>`;
    return { tieu: cat(r.task, 140), than, chan };
  }

  function veBanGiao(h) {
    const p = h.payload || {}, ask = p.ask_ceo && !(h.problems || []).length && !h.decided ? p.ask_ceo : null;
    let than = `<div class="hang"><span class="nhan ${h.decided ? "" : "canh-bao"}">${esc(h.decided ? KQ_BG[h.decided] || h.decided : "chờ anh duyệt")}</span>
      <span class="mo">${esc(tenVai(h.role))} ${h.next_owner || p.next_owner ? "chuyển lượt cho " + esc(tenVai(h.next_owner || p.next_owner)) : "chưa ghi lượt kế tiếp"} · ${esc(tenDuAn(h.workspace))}${h.decided_at ? " · " + esc(luc(h.decided_at)) : ""}</span></div>`;
    const dsGt = danhSachGiaiThich(p.giai_thich);
    const gtChuoi = typeof p.giai_thich === "string" ? p.giai_thich.trim() : "";
    const tomTat = typeof p.tom_tat === "string" ? p.tom_tat.trim() : "";
    if (dsGt.length) {
      than += `<section aria-labelledby="hGt"><h3 id="hGt">AI giải thích</h3>${tomTat ? `<p class="mo">${esc(tomTat)}</p>` : ""}<ol class="cac-luot">${dsGt.map((x) =>
        `<li>${x.van_de ? `<div><b>Vấn đề:</b> ${esc(x.van_de)}</div>` : ""}${x.da_lam ? `<div><b>Đã làm:</b> ${esc(x.da_lam)}</div>` : ""}${x.vi_sao ? `<div><b>Vì sao:</b> ${esc(x.vi_sao)}</div>` : ""}` +
        (x.phuong_an_khac.length ? `<div><b>Cách khác đã cân nhắc:</b><ul>${x.phuong_an_khac.map((a) => `<li>${esc(a.cach)}${a.vi_sao_khong ? ` — <i>không chọn vì</i> ${esc(a.vi_sao_khong)}` : ""}</li>`).join("")}</ul></div>` : "") + `</li>`).join("")}</ol></section>`;
    } else if (gtChuoi || tomTat) {
      than += `<section aria-labelledby="hGt"><h3 id="hGt">AI giải thích</h3><pre class="van-ban">${esc(gtChuoi || tomTat)}</pre></section>`;
    }
    if ((h.problems || []).length) than += `<div class="loi" role="alert"><span>Bàn giao sai mẫu, không duyệt được: ${esc(h.problems.join("; "))}</span></div>`;
    if (ask) than += chonPhuongAn(ask, "bg");
    const files = p.files || [];
    than += `<section aria-labelledby="hFile"><h3 id="hFile">File đã sửa</h3>${files.length ? `<ul class="ds-file">${files.map((f) => `<li><code>${esc(f)}</code></li>`).join("")}</ul>` : '<p class="mo">AI không khai file nào.</p>'}</section>`;
    const suaXong = [].concat(p.claim_fixed || []).filter(Boolean);
    if (suaXong.length) than += `<p class="mo">Báo đã sửa: ${esc(suaXong.join(", "))}</p>`;
    if ((p.skill_da_dung || []).length) than += `<p class="mo">Skill đã dùng: ${esc(p.skill_da_dung.join(", "))}</p>`;
    let chan = "";
    if (!h.decided && !ask) chan = ((h.problems || []).length ? "" : nut("approve", "Duyệt chuyển lượt", "nut-chinh")) + nut("reject", "Trả lại");
    return { tieu: "Bàn giao của " + tenVai(h.role), than, chan };
  }

  function veLenh(j) {
    let than = `<div class="hang"><span class="nhan ${j.status === "running" ? "song" : j.status === "pending_approval" ? "canh-bao" : j.status === "failed" ? "hong" : ""}">${esc(TT_LENH[j.status] || j.status)}</span>
      <span class="mo">${esc(tenDuAn(j.workspace))}${j.started_at ? " · bắt đầu " + esc(luc(j.started_at)) : ""}${j.ended_at ? " · xong " + esc(luc(j.ended_at)) : ""}${j.exit_code != null ? " · mã thoát " + esc(j.exit_code) : ""}</span></div>`;
    if (j.status === "running") than += dangChayHtml(tenLenh(j) + " đang chạy");
    if (j.status === "pending_approval") {
      let lenh = j.argv; try { if (typeof lenh === "string") lenh = JSON.parse(lenh); } catch {}
      than += `<section aria-labelledby="hLenh"><h3 id="hLenh">Lệnh chờ anh duyệt</h3><pre class="van-ban"><code>${esc(Array.isArray(lenh) ? lenh.join(" ") : lenh || "")}</code></pre>
        <p class="mo">Lệnh nằm ngoài danh sách cho phép nên bộ điều khiển hỏi anh trước khi chạy.</p></section>`;
    }
    let chan = "";
    if (j.status === "pending_approval") chan = nut("approve", "Cho chạy", "nut-chinh") + nut("reject", "Từ chối");
    if (j.status === "running") chan = nut("kill", "Dừng lượt này", "nut nguy");
    return { tieu: tenLenh(j), than, chan, loai: j.kind === "cmd" ? "Lệnh trên máy" : "Lượt AI" };
  }

  // ---------- nhật ký ----------
  async function duoiLog(mine) {
    const jobId = !du ? null : ref.loai === "luong" ? du.jobId || (du.steps || []).at(-1)?.jobId : ref.loai === "ban-giao" ? du.job_id : du.status === "pending_approval" ? null : du.id;
    const sec = $("nganLog"), tt = $("nganLogTT");
    if (!jobId) { sec.hidden = true; return; }
    if (log.job !== jobId) { log = { job: jobId, from: null }; pre.textContent = ""; }
    const url = (from) => "/ctl/jobs/" + encodeURIComponent(jobId) + "/log?from=" + from;
    try {
      // Lần đầu chỉ hỏi cỡ file (from vượt cuối thì ctl trả rỗng kèm X-Size), rồi đọc phần cuối.
      if (log.from === null) {
        const r0 = await fetch(url(1e15), { cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!r0.ok) throw new Error("HTTP " + r0.status);
        log.from = Math.max(0, (Number(r0.headers.get("x-size")) || 0) - LOG_GIU);
      }
      const r = await fetch(url(log.from), { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (mine !== phien) return;
      if (!r.ok) throw new Error("HTTP " + r.status);
      const chu = await r.text();
      if (mine !== phien) return;
      log.from = Number(r.headers.get("x-next-offset")) || log.from;
      if (chu) { const cuoiCung = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4; pre.textContent = (pre.textContent + chu).slice(-LOG_GIU); if (cuoiCung) pre.scrollTop = pre.scrollHeight; }
      sec.hidden = false;
      tt.textContent = !pre.textContent ? "lượt chưa ghi gì" : dangChay() ? "đang cập nhật" : "";
    } catch (e) { if (mine !== phien) return; sec.hidden = false; tt.textContent = "Chưa đọc được nhật ký: " + (e.name === "TimeoutError" ? "quá lâu" : e.message); }
  }

  // ---------- hành động ----------
  const HD = {
    luong: { approve: ["approve", "Đã ghi nhận duyệt. Văn phòng không tự merge hay phát hành."], reject: ["reject", "Đã từ chối báo cáo."], stop: ["stop", "Đã dừng luồng."],
      resume: ["resume", "Đã chạy lại lượt đang chờ hạn mức."], push: ["push", "Đã đẩy nhánh lên GitHub."] },
    "ban-giao": { approve: ["approve", "Đã duyệt: agent.md đã ghi và chuyển lượt."], reject: ["reject", "Đã trả lại bàn giao, lượt giữ nguyên."] },
    lenh: { approve: ["approve", "Đã cho chạy."], reject: ["reject", "Đã từ chối lệnh."], kill: ["kill", "Đã dừng lượt."] },
  };
  const HOI_TRUOC = {
    "luong:stop": "Dừng luồng này? Lượt đang chạy sẽ bị ngắt.",
    "luong:push": () => `Đẩy nhánh ${du.git?.branch || ""} lên GitHub? Văn phòng không tự merge.`,
    "ban-giao:approve": () => `Duyệt bàn giao: văn phòng ghi agent.md, commit và chuyển lượt cho ${tenVai(du.next_owner)}?`,
    "lenh:kill": "Dừng lượt này? Phần AI đang làm dở có thể mất.",
  };
  // Hộp thông báo góc dưới của OS nằm dưới lớp của dialog modal, nên kết quả hành động hiện ngay trong ngăn.
  function baoNgan(chu, laLoi = false) { const el = $("nganBao"); el.textContent = chu; el.classList.toggle("hong", laLoi); }
  async function guiHanhDong(k, body = {}, xong) {
    if (dangLam || !ref) return;
    const mine = phien, r = ref;
    dangLam = k; ve();
    try {
      const timeout = k === "push" ? 130000 : 60000;
      await ctl(duongDan() + encodeURIComponent(r.id) + "/" + (HD[r.loai][k] ? HD[r.loai][k][0] : k), body, { timeout });
      bao(xong); if (mine === phien) baoNgan(xong);
      if (khiDoi) try { khiDoi(); } catch {}
    } catch (e) { bao(e.message, true); if (mine === phien) baoNgan(e.message, true); }
    if (mine !== phien) return;
    dangLam = false; ky = ""; tai();
  }
  dlg.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-dong]")) return dong();
    if (t.closest("[data-thu-lai]")) return tai();
    const tl = t.closest("[data-tra-loi]");
    if (tl) return guiHanhDong("answer", { option: tl.dataset.traLoi }, "Đã chọn " + tl.dataset.traLoi + ". Luồng chạy tiếp.");
    const b = t.closest("[data-hd]");
    if (b && HD[ref.loai][b.dataset.hd]) {
      const hoi = HOI_TRUOC[ref.loai + ":" + b.dataset.hd];
      if (hoi && !confirm(typeof hoi === "function" ? hoi() : hoi)) return;
      guiHanhDong(b.dataset.hd, {}, HD[ref.loai][b.dataset.hd][1]);
    }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ref) tai(); });

  return { mo, dong, get dangMo() { return !!ref; } };
}
