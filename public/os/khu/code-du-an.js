// Xưởng code · Dự án (OS-2 + bảo trì): quản lý repo trên máy tính — tạo dự án mới (Phần mềm / Phim AI),
// xem Phase/lượt/blocker, cài Bộ kiểm chu trình CI và Kiểm tra / Xuất bản qua GitHub.
import { esc, cat, luc, dangTai, rong, loi, safeHttps } from "../ui.js";

const TEN_VAI = { SPEC_ARCHITECT: "Hinata (đặc tả)", SOL_ARCHITECT_PLANNER: "Itachi (kiến trúc)", SOL_ARCHITECT_ADVISOR: "Itachi (cố vấn)", CLAUDE_AUDITOR: "Sakura (duyệt)",
  CODEX_ASTRA_DEV: "Sasuke (backend)", FRONTEND_UIUX_DEV: "Kakashi (giao diện)" };
const DAM_TT = { cho: "chờ", dang: "đang làm…", xong: "xong", loi: "lỗi", "bo-qua": "bỏ qua" };
const BO_KIEM = { "da-cai": ["CI đã cài", "song"], cu: ["CI bản cũ", "canh-bao"], "chua-cai": ["chưa có CI", "canh-bao"], "khong-phai-git": ["chưa có git", ""], "van-phong": ["CI riêng của văn phòng", ""] };
const PUB_TT = { running: "Đang kiểm tra & build", ready: "Sẵn sàng, chờ anh bấm Xuất bản", releasing: "Đang gửi lên GitHub", released: "Đã gửi xuất bản: GitHub Actions đang build", failed: "Chưa đạt" };
const STEP_TT = { done: "✓", failed: "✗", running: "…", skipped: "⏭" };

const safeGithub = (v) => { const u = safeHttps(v); return u && new URL(u).hostname === "github.com" ? u : null; };
const slugRepo = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export async function mo(vung, { kho, ctl, bao, signal }) {
  const qs = new URLSearchParams(location.hash.split("?")[1] || "");
  let moTao = qs.get("loai") === "phim";
  let loaiMacDinh = qs.get("loai") === "phim" ? "phim" : "phan-mem";

  vung.innerHTML = `<div class="vung">
    <div class="dau-hang"><h2 class="dau">Dự án của xưởng code</h2><span class="mo" id="soDuAn"></span>
      <div class="hang" style="margin-left:auto">
        <button type="button" class="nut" id="nutTaoDuAn" aria-expanded="${moTao}">Tạo dự án mới</button>
        <a class="nut-chinh" href="#/code/giao-viec">Giao việc cho đội</a>
      </div></div>
    <section class="khoi" id="khungTao" aria-labelledby="hTao"${moTao ? "" : " hidden"}></section>
    <section class="khoi" id="khungXuatBan" aria-labelledby="hXuatBan" hidden></section>
    <div id="ds" class="luoi-the">${dangTai(4)}</div>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let ds = null, tq = {}, loiDs = "", conSong = true;
  let damGoiY = null, damOp = null, damGui = false, damLoi = 0, damHen = null, damYTuong = "";
  let boKiemBan = null;
  let pubWs = null, pubData = null, pubLoi = "", pubBan = false, pubHen = null;

  async function tai() {
    try { const d = await ctl("/workspaces"); ds = d.workspaces || []; loiDs = ""; }
    catch (e) { ds = null; loiDs = e.message; }
    if (!conSong) return;
    ve();
    for (const w of ds || []) {
      if (!conSong) return;
      try { const o = await ctl("/workspaces/overview?workspace=" + encodeURIComponent(w.path)); tq[w.path] = o.overview || o; }
      catch (e) { tq[w.path] = { loi: e.message }; }
      if (!conSong) return;
      ve();
    }
  }

  async function taiMot(wsPath) {
    try { const o = await ctl("/workspaces/overview?workspace=" + encodeURIComponent(wsPath)); tq[wsPath] = o.overview || o; }
    catch (e) { tq[wsPath] = { loi: e.message }; }
    if (conSong) ve();
  }

  // ---------- Tạo dự án mới (Phần mềm / Phim AI) ----------
  function veTao() {
    const box = $("khungTao"), btn = $("nutTaoDuAn");
    box.hidden = !moTao;
    btn.setAttribute("aria-expanded", String(moTao));
    if (!moTao) return;
    const dangTao = damGui || !!(damOp && damOp.trangThai === "dang");
    let kq = "";
    if (damOp) {
      kq = `<div class="cot-doc"><div class="hang"><b>${esc(damOp.ten)}</b><span class="nhan ${damOp.trangThai === "xong" ? "song" : damOp.trangThai === "loi" ? "hong" : "canh-bao"}">${esc({ dang: "đang khởi động…", xong: "đã xong", "xong-mot-phan": "xong, có bước lỗi", loi: "dừng vì lỗi" }[damOp.trangThai] || damOp.trangThai)}</span></div>` +
        `<ol class="cac-luot">${(damOp.buoc || []).map((s) => `<li><b>${esc(s.ten)}</b>: ${esc(DAM_TT[s.trangThai] || s.trangThai)}${s.ghiChu ? `<div class="mo">${esc(s.ghiChu)}</div>` : ""}</li>`).join("")}</ol>` +
        (damOp.trangThai !== "dang" ? `<div class="hang"><button type="button" class="nut nho" id="damMoi">Tạo dự án khác</button></div>` : "") + `</div>`;
    } else if (damGoiY) {
      const d = damGoiY, first = (d.goiY || []).find((g) => g.conTrong !== false) || (d.goiY || [])[0] || { ten: "", moTa: "" };
      kq = `<p class="mo">${d.nguon === "ai" ? "Claude gợi ý" : "Gợi ý từ ý tưởng"}${d.login ? " · tài khoản GitHub <b>" + esc(d.login) + "</b>" : ""}${d.ghiChu ? " · " + esc(d.ghiChu) : ""}</p>` +
        `<div class="cot-doc">${(d.goiY || []).map((g, i) => `<label class="hang"><input type="radio" name="damChon" value="${i}"${g === first ? " checked" : ""}><span><b>${esc(g.ten)}</b> ${g.conTrong === false ? '<span class="hong">· đã có repo trùng tên</span>' : g.conTrong ? '<span class="dat">· còn trống</span>' : ""}<br><span class="mo">${esc(g.moTa)}</span></span></label>`).join("")}</div>` +
        `<div class="bieu-mau">` +
        `<label>Tên repo (sửa được)<input class="o" id="damTenRepo" maxlength="40" value="${esc(first.ten)}"></label>` +
        `<label>Mô tả repo<input class="o" id="damMoTa" maxlength="350" value="${esc(first.moTa)}"></label>` +
        `<div class="rong-het hang"><span class="mo">Loại dự án:</span>` +
        `<label class="hang"><input type="radio" name="damLoai" value="phan-mem"${loaiMacDinh === "phim" ? "" : " checked"}> Phần mềm</label>` +
        `<label class="hang"><input type="radio" name="damLoai" value="phim"${loaiMacDinh === "phim" ? " checked" : ""}> Phim AI (dựng sẵn phim.json, Hinata viết kịch bản)</label></div>` +
        `<label class="rong-het hang"><input type="checkbox" id="damBoKiem" checked> Cài bộ kiểm chu trình CI (mở nhánh, anh merge sau)</label>` +
        `<label class="rong-het hang"><input type="checkbox" id="damHinata" checked> Giao Hinata viết đặc tả ngay sau khi tạo</label></div>` +
        `<p class="mo">Repo tạo ở chế độ riêng tư, tải về thư mục dự án trên máy. Văn phòng chỉ tạo khi anh bấm Duyệt.</p>` +
        `<div class="hang"><button type="button" class="nut-chinh" id="damDuyet"${dangTao ? " disabled" : ""}>Duyệt &amp; tạo dự án</button><button type="button" class="nut" id="damHuy"${dangTao ? " disabled" : ""}>Huỷ gợi ý</button></div>`;
    }
    box.innerHTML = `<div class="dau-hang"><h3 class="dau" id="hTao">Tạo dự án mới (repo riêng tư trên GitHub)</h3><button type="button" class="nut nho" id="damDong" style="margin-left:auto">Đóng</button></div>
      <div class="cot-doc">
        <label for="damYTuong" class="mo">Ý tưởng (vài câu: sản phẩm hoặc phim làm gì, cho ai)</label>
        <textarea class="o" id="damYTuong" rows="3" maxlength="2000" placeholder="Ví dụ: phim ngắn 45 giây giới thiệu Văn phòng AI, hoặc app luyện nghe tiếng Anh cho học sinh cấp 2"${dangTao ? " disabled" : ""}>${esc(damYTuong)}</textarea>
        <div class="hang"><button type="button" class="nut-chinh" id="damGoiYBtn"${dangTao ? ' disabled aria-busy="true"' : ""}>${damGui && !damOp ? "Đang xử lý…" : "Gợi ý tên repo"}</button>
          <span class="mo">Đội trưởng gợi ý tên repo còn trống và tạo repo riêng tư khi anh duyệt.</span></div>
      </div>${kq}`;
  }

  async function damTheoDoi() {
    clearTimeout(damHen);
    if (!conSong || !damOp || damOp.trangThai !== "dang") return;
    try { damOp = (await ctl("/du-an-moi/" + encodeURIComponent(damOp.id), undefined, { timeout: 20000 })).duAnMoi; damLoi = 0; }
    catch (e) {
      damLoi++;
      if (e.code === "NOT_FOUND" || damLoi >= 5) {
        damOp = { ...damOp, trangThai: "loi", buoc: (damOp.buoc || []).map((x) => x.trangThai === "dang" ? { ...x, trangThai: "loi", ghiChu: "Mất phiên theo dõi: kiểm tra repo trên GitHub hoặc thử lại." } : x) };
        bao("Mất phiên theo dõi tạo dự án: " + e.message, true);
      }
    }
    if (!conSong) return;
    veTao();
    if (damOp && damOp.trangThai === "dang") damHen = setTimeout(damTheoDoi, 2000);
    else if (damOp) {
      bao(damOp.trangThai === "xong" ? "Đã khởi động dự án " + damOp.ten + "." : "Dự án " + damOp.ten + " dừng ở một bước lỗi.", damOp.trangThai !== "xong");
      kho.taiLaiDuAn(); tai();
    }
  }

  // ---------- Xuất bản qua GitHub ----------
  function veXuatBan() {
    const box = $("khungXuatBan");
    if (!pubWs) { box.hidden = true; return; }
    box.hidden = false;
    const ten = (ds || []).find((w) => w.path === pubWs)?.name || pubWs.split(/[\\/]/).pop();
    if (pubLoi && !pubData) {
      box.innerHTML = `<div class="dau-hang"><h3 class="dau" id="hXuatBan">Xuất bản · ${esc(ten)}</h3><button type="button" class="nut nho" id="pubDong" style="margin-left:auto">Đóng</button></div>${loi(pubLoi)}`;
      return;
    }
    if (!pubData) {
      box.innerHTML = `<div class="dau-hang"><h3 class="dau" id="hXuatBan">Xuất bản · ${esc(ten)}</h3><button type="button" class="nut nho" id="pubDong" style="margin-left:auto">Đóng</button></div>${dangTai(3)}`;
      return;
    }
    const p = pubData, dang = (p.runs || []).some((r) => ["running", "releasing"].includes(r.status));
    const cach = !p.release ? `<span class="hong">chưa có workflow xuất bản (.github/workflows/release.yml)</span>`
      : p.release.mode === "tag" ? `đẩy tag <code>${esc(p.release.pattern)}</code> → <code>${esc(p.release.file)}</code>`
      : `chạy tay workflow <code>${esc(p.release.file)}</code>`;
    const runsHtml = (p.runs || []).map((r, i) => {
      const can = i === 0 && r.status === "ready" && p.release;
      const actUrl = safeHttps(r.release && r.release.actionsUrl);
      const steps = (r.steps || []).map((st) => `<li>${STEP_TT[st.status] || "·"} ${esc(st.name)}${st.note ? `<div class="mo">${esc(st.note)}</div>` : ""}</li>`).join("");
      return `<div class="dong"><div>
        <div class="tieu"><b>${esc(r.tag || "Lượt " + r.id)}</b> · <span class="mo">${esc(PUB_TT[r.status] || r.status)} · ${esc(luc(r.release?.at || r.createdAt))}</span></div>
        ${r.problem ? `<div class="hong">${esc(r.problem)}</div>` : ""}
        ${steps ? `<ol class="cac-luot">${steps}</ol>` : ""}
        ${r.release ? `<div class="chi-tiet">Phiên bản <b>${esc(r.release.tag)}</b>${actUrl ? ` · <a href="${esc(actUrl)}" target="_blank" rel="noopener noreferrer">Xem GitHub Actions</a>` : ""}</div>` : ""}
        ${can ? `<div class="hang" style="margin-top:var(--space-xs)"><label for="pubVer-${esc(r.id)}" class="mo">Phiên bản</label><input class="o" id="pubVer-${esc(r.id)}" data-pub-ver="${esc(r.id)}" value="${esc(p.version || "")}" placeholder="X.Y.Z" maxlength="20" style="width:110px"><button type="button" class="nut-chinh" data-pub-release="${esc(r.id)}"${pubBan ? " disabled" : ""}>Xuất bản qua GitHub</button></div>` : ""}
      </div></div>`;
    }).join("") || `<p class="mo">Chưa có lượt kiểm tra &amp; build nào cho dự án này.</p>`;
    box.innerHTML = `<div class="dau-hang"><h3 class="dau" id="hXuatBan">Xuất bản · ${esc(ten)}</h3>
      <div class="hang" style="margin-left:auto"><button type="button" class="nut-chinh" id="pubPrepare"${pubBan || dang ? " disabled" : ""}>${dang ? "Đang kiểm tra &amp; build…" : "Kiểm tra &amp; build"}</button>
        <button type="button" class="nut nho" id="pubReload"${pubBan ? " disabled" : ""}>Đọc lại</button>
        <button type="button" class="nut nho" id="pubDong">Đóng</button></div></div>
      <div class="mo">Repo: <code>${esc(p.repo || "chưa rõ")}</code> · Dockerfile: ${p.dockerfile ? '<span class="dat">có</span>' : '<span class="hong">chưa có</span>'} · Cách xuất bản: ${cach}${p.version ? " · Bản trong code: <b>" + esc(p.version) + "</b>" : ""}</div>
      <p class="mo">Bước 1 chạy kiểm tra &amp; build thử trên máy (chưa ra ngoài). Bước 2 chỉ đẩy tag / chạy workflow trên GitHub khi anh bấm Xuất bản và xác nhận đúng phiên bản.</p>
      ${pubLoi ? loi(pubLoi, false) : ""}<div>${runsHtml}</div>`;
  }

  async function taiXuatBan(wsPath) {
    clearTimeout(pubHen);
    if (!conSong || !wsPath) return;
    pubWs = wsPath; pubLoi = "";
    veXuatBan();
    try {
      const d = await ctl("/publish?workspace=" + encodeURIComponent(wsPath), undefined, { timeout: 30000 });
      if (!conSong || pubWs !== wsPath) return;
      pubData = d.publish || null;
      veXuatBan();
      if (pubData && (pubData.runs || []).some((r) => ["running", "releasing"].includes(r.status))) {
        pubHen = setTimeout(() => { if (conSong && pubWs === wsPath && !document.hidden) taiXuatBan(wsPath); }, 3000);
      }
    } catch (e) {
      if (!conSong || pubWs !== wsPath) return;
      pubLoi = e.message; veXuatBan();
    }
  }

  function ve() {
    if (!ds) { $("ds").innerHTML = loi(loiDs || "Chưa nối được bộ điều khiển (ctl)."); return; }
    $("soDuAn").textContent = ds.length + " dự án";
    if (!ds.length) { $("ds").innerHTML = rong("Chưa có dự án", "Tạo dự án mới ở nút trên hoặc mở repo từ GitHub ở Giao việc cho đội.", `<a class="nut" href="#/code/giao-viec">Mở repo</a>`); return; }
    $("ds").innerHTML = ds.map((w) => {
      const o = tq[w.path], p = o && o.progress, r = o && o.repo, bk = o && o.boKiem, dang = w.path === kho.duAn;
      const bkInfo = bk ? (BO_KIEM[bk.state] || [bk.state, ""]) : null;
      const prUrl = bk && bk.last ? safeGithub(bk.last.compareUrl) : null;
      const canBoKiem = bk && ["chua-cai", "cu"].includes(bk.state);
      const trangThai = !o ? `<span class="mo">Đang đọc…</span>`
        : o.loi ? `<span class="hong">${esc(cat(o.loi, 120))}</span>`
        : `<span class="hang">${p ? `<span class="nhan">${esc(cat(p.phase || "chưa rõ Phase", 40))}</span><span class="nhan ${p.nextOwner ? "song" : ""}">lượt: ${esc(TEN_VAI[p.nextOwner] || p.nextOwner || "chưa rõ")}</span>
            ${p.openBlockers && p.openBlockers.length ? `<span class="nhan hong">${p.openBlockers.length} lỗi chặn</span>` : '<span class="nhan">0 lỗi chặn</span>'}`
            : `<span class="nhan canh-bao">${esc(o.agentMd === false || (o.agentMd && o.agentMd.exists === false) ? "chưa có sổ dự án (agent.md)" : cat(o.progressReason || "chưa đọc được agent.md", 50))}</span>`}
            ${r && r.branch ? `<span class="nhan">nhánh ${esc(cat(r.branch, 32))}</span>` : o.isRepo === false ? '<span class="nhan canh-bao">chưa quản lý bằng git</span>' : ""}
            ${bkInfo ? `<span class="nhan ${bkInfo[1]}">${esc(bkInfo[0])}</span>` : ""}</span>
          ${prUrl ? `<span class="mo"><a href="${esc(prUrl)}" target="_blank" rel="noopener noreferrer">Mở PR bộ kiểm CI</a></span>` : ""}
          ${p && p.nextStep ? `<span class="dang">${esc(cat(p.nextStep, 180))}</span>` : ""}`;
      return `<div class="the-cs" style="cursor:default"${dang ? ' aria-current="true"' : ""}>
        <span class="ten">${esc(w.name || w.path.split(/[\\/]/).pop())}${dang ? '<span class="nhan song" style="margin-left:auto">đang làm</span>' : ""}</span>
        <span class="viec" title="${esc(w.path)}">${esc(cat(w.path, 70))}${o && o.readAt ? " · đọc " + esc(luc(o.readAt)) : ""}</span>
        ${trangThai}
        <span class="hang">${dang ? "" : `<button type="button" class="nut nho" data-chon="${esc(w.path)}">Làm dự án này</button>`}<button type="button" class="nut nho" data-luong="${esc(w.path)}">Luồng và bàn giao</button>${canBoKiem ? `<button type="button" class="nut nho" data-bo-kiem="${esc(w.path)}"${boKiemBan === w.path || bk.busy ? ' disabled aria-busy="true"' : ""}>${bk.state === "cu" ? "Cập nhật CI" : "Cài bộ kiểm CI"}</button>` : ""}${o && o.isRepo !== false ? `<button type="button" class="nut nho" data-xuat-ban="${esc(w.path)}" aria-expanded="${pubWs === w.path}">Xuất bản</button>` : ""}</span>
      </div>`;
    }).join("");
  }

  vung.addEventListener("input", (e) => {
    if (e.target.id === "damYTuong") damYTuong = e.target.value;
  });
  vung.addEventListener("change", (e) => {
    if (e.target.name === "damChon" && damGoiY) {
      const g = (damGoiY.goiY || [])[Number(e.target.value)];
      if (g) { const t = $("damTenRepo"), m = $("damMoTa"); if (t) t.value = g.ten; if (m) m.value = g.moTa; }
    } else if (e.target.name === "damLoai") {
      loaiMacDinh = e.target.value;
    }
  });
  vung.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("#nutTaoDuAn")) { moTao = !moTao; veTao(); if (moTao) $("damYTuong")?.focus(); return; }
    if (t.closest("#damDong")) { moTao = false; veTao(); return; }
    if (t.closest("#damHuy")) { damGoiY = null; veTao(); return; }
    if (t.closest("#damMoi")) { damOp = null; damGoiY = null; damYTuong = ""; veTao(); $("damYTuong")?.focus(); return; }
    if (t.closest("#damGoiYBtn")) {
      const yTuong = ($("damYTuong")?.value || "").trim();
      damYTuong = yTuong;
      if (yTuong.length < 10) { bao("Viết ý tưởng ít nhất 10 ký tự để văn phòng gợi ý tên.", true); $("damYTuong")?.focus(); return; }
      if (damOp && damOp.trangThai === "dang") { bao("Đang tạo dự án " + damOp.ten + ": chờ xong rồi gợi ý tiếp.", true); return; }
      damGui = true; damOp = null; damGoiY = null; veTao();
      try { damGoiY = (await ctl("/du-an-moi/goi-y", { yTuong }, { timeout: 100000 })).duAnMoi; }
      catch (err) { bao(err.message, true); }
      finally { damGui = false; if (conSong) veTao(); }
      return;
    }
    if (t.closest("#damDuyet")) {
      const ten = slugRepo($("damTenRepo")?.value || "");
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(ten)) { bao("Tên repo 3–40 ký tự: chữ thường không dấu, số, gạch ngang.", true); $("damTenRepo")?.focus(); return; }
      if (!confirm(`Tạo repo riêng tư "${ten}" trên GitHub và khởi động dự án?`)) return;
      const moTa = $("damMoTa")?.value || "", caiBoKiem = !!$("damBoKiem")?.checked, giaoHinata = !!$("damHinata")?.checked;
      const loai = (vung.querySelector('input[name="damLoai"]:checked') || {}).value || loaiMacDinh;
      damGui = true; veTao();
      try {
        damOp = (await ctl("/du-an-moi", { ten, moTa, yTuong: damYTuong.trim(), caiBoKiem, giaoHinata, loai }, { timeout: 30000 })).duAnMoi;
        damGoiY = null; damLoi = 0; damGui = false;
        if (conSong) { veTao(); damTheoDoi(); }
      } catch (err) { damGui = false; bao(err.message, true); if (conSong) veTao(); }
      return;
    }
    const bkBtn = t.closest("[data-bo-kiem]");
    if (bkBtn && !bkBtn.disabled) {
      const wsPath = bkBtn.dataset.boKiem;
      const ten = (ds || []).find((w) => w.path === wsPath)?.name || wsPath.split(/[\\/]/).pop();
      if (!confirm(`Cài bộ kiểm chu trình CI vào repo "${ten}"?\nVăn phòng tạo nhánh mới, commit bộ kiểm, đẩy nhánh lên GitHub rồi mở trang tạo PR để anh duyệt merge.`)) return;
      boKiemBan = wsPath; ve();
      try {
        const { boKiem } = await ctl("/bo-kiem", { workspace: wsPath }, { timeout: 120000 });
        bao("Đã đẩy nhánh cài bộ kiểm CI cho " + ten + ".");
        const url = safeGithub(boKiem && boKiem.last && boKiem.last.compareUrl);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) { bao(err.message, true); }
      finally { boKiemBan = null; if (conSong) await taiMot(wsPath); }
      return;
    }
    const xbBtn = t.closest("[data-xuat-ban]");
    if (xbBtn) {
      const wsPath = xbBtn.dataset.xuatBan;
      if (pubWs === wsPath) { clearTimeout(pubHen); pubWs = null; pubData = null; veXuatBan(); ve(); return; }
      pubData = null; taiXuatBan(wsPath); ve(); $("khungXuatBan")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); return;
    }
    if (t.closest("#pubDong")) { clearTimeout(pubHen); pubWs = null; pubData = null; veXuatBan(); ve(); return; }
    if (t.closest("#pubReload") && pubWs) { taiXuatBan(pubWs); return; }
    if (t.closest("#pubPrepare") && pubWs && !pubBan) {
      if (!confirm("Chạy Kiểm tra & build thử Docker image trên máy? (Chưa đẩy ra ngoài.)")) return;
      pubBan = true; veXuatBan();
      try { await ctl("/publish/prepare", { workspace: pubWs }, { timeout: 60000 }); bao("Đã bắt đầu kiểm tra & build thử."); }
      catch (err) { bao(err.message, true); }
      finally { pubBan = false; if (conSong && pubWs) taiXuatBan(pubWs); }
      return;
    }
    const relBtn = t.closest("[data-pub-release]");
    if (relBtn && pubWs && !pubBan) {
      const id = relBtn.dataset.pubRelease;
      const ver = (vung.querySelector(`[data-pub-ver="${CSS.escape(id)}"]`)?.value || "").trim().replace(/^v/, "");
      if (!/^\d+\.\d+\.\d+$/.test(ver)) { bao("Phiên bản phải có dạng X.Y.Z, ví dụ 1.2.0", true); return; }
      if (!confirm(`XUẤT BẢN v${ver} của ${pubData?.repo || "dự án"} qua GitHub Actions?\nBản phát hành sẽ đưa lên GHCR + GitHub Releases.`)) return;
      pubBan = true; veXuatBan();
      try { await ctl("/publish/" + encodeURIComponent(id) + "/release", { version: ver, confirm: "v" + ver }, { timeout: 60000 }); bao("Đã gửi xuất bản v" + ver + "."); }
      catch (err) { bao(err.message, true); }
      finally { pubBan = false; if (conSong && pubWs) taiXuatBan(pubWs); }
      return;
    }
    const c = t.closest("[data-chon]");
    if (c) { try { await ctl("/workspaces/switch", { path: c.dataset.chon }); kho.duAn = c.dataset.chon; const sel = document.getElementById("chonDuAn"); if (sel) sel.value = c.dataset.chon; kho.bao(); bao("Đã chuyển dự án đang làm."); ve(); } catch (err) { bao(err.message, true); } return; }
    // Xem luồng của dự án khác: chuyển dự án đang làm trước, để trang luồng không hiện nhầm dự án cũ.
    const l = t.closest("[data-luong]");
    if (l) { if (l.dataset.luong !== kho.duAn) { try { await ctl("/workspaces/switch", { path: l.dataset.luong }); kho.duAn = l.dataset.luong; const sel = document.getElementById("chonDuAn"); if (sel) sel.value = l.dataset.luong; kho.bao(); } catch (err) { bao(err.message, true); return; } } location.hash = "#/code/dieu-khien"; return; }
    if (t.closest("[data-thu-lai]")) tai();
  });

  veTao();
  function dong() {
    conSong = false;
    clearTimeout(damHen);
    clearTimeout(pubHen);
  }
  signal?.addEventListener("abort", dong, { once: true });
  try { await tai(); }
  finally { signal?.removeEventListener("abort", dong); }
  return dong;
}
