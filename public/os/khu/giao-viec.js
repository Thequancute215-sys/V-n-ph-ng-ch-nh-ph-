// Khu Giao việc cho đội (OS-3, thay bảng "Claude báo cáo & tự động" của prototype.html trong Xưởng code).
// Anh gõ một việc, văn phòng chạy luồng tự chạy (ctl POST /autopilot): Hinata, Sol, Astra/Kakashi lần lượt theo agent.md, Claude duyệt rồi báo cáo.
// Trước khi giao, khu đọc tình trạng dự án (/ai/status, /scan, luồng còn sống) và nói rõ vì sao chưa giao được, kèm nút xử lý ngay tại chỗ.
// Chưa có dự án thì mở repo GitHub (ctl /github/repos, /github/open: clone về máy nếu chưa có, tự sinh agent.md nếu thiếu).
import { esc, cat, luc, dangTai, rong, loi } from "../ui.js";
import { TT_LUONG, LUONG_SONG, LUONG_CHAY, tenDuAn, tenVai, soLuot, lopLuong } from "../viec-chung.js";

const GOI_Y = { AI_BUSY: "Dự án đang có luồng hoặc bàn giao chưa xong.", BAD_AGENT_MD: "Sổ agent.md của dự án chưa đọc được.", DIRTY_REPO: "Repo đang có thay đổi chưa commit: commit hoặc cất đi rồi giao lại (văn phòng không tự đụng vào phần anh đang sửa).",
  SCAN_PENDING: "Dự án có điểm bất thường trong file .md hay thư viện chưa được duyệt." };

export async function mo(vung, { kho, ctl, bao, ngan, signal }) {
  vung.innerHTML = `<div class="vung">
    <div class="luoi-2">
      <section class="khung-goc" aria-labelledby="hGiao"><form id="bieuMau" class="cot-doc" novalidate>
        <div class="dau-hang"><h2 class="dau" id="hGiao">Việc mới cho đội</h2><span class="mo">Đội làm trên nhánh git riêng; văn phòng không tự merge, không phát hành.</span></div>
        <div class="bieu-mau">
          <label class="rong-het">Dự án<select class="o" name="workspace" id="chonDA"></select></label>
          <label class="rong-het">Việc anh giao<textarea class="o" name="task" id="oViec" rows="6" maxlength="3000" required aria-describedby="demChu"
            placeholder="Ví dụ: Thêm trang Đăng nhập bằng email; khoá tài khoản sau 5 lần sai; có test."></textarea></label>
          <label>Số lượt tối đa<input class="o" name="maxSteps" type="number" min="1" max="12" step="1" value="10"></label>
          <label>Thời gian tối đa (phút)<input class="o" name="phut" type="number" min="5" max="120" step="5" value="90"></label>
        </div>
        <div class="hang"><button type="submit" class="nut-chinh" id="nutGiao">Giao cho đội</button><span class="mo so" id="demChu">0/3000</span></div>
        <p class="hong" id="loiGiao" role="alert"></p>
      </form></section>
      <section class="khoi" aria-labelledby="hTinh"><div class="dau-hang"><h2 class="dau" id="hTinh">Tình trạng dự án</h2><button type="button" class="nut nho" id="nutDocLai" style="margin-left:auto">Đọc lại</button></div>
        <div id="tinhTrang" aria-live="polite">${dangTai(3)}</div></section>
    </div>
    <section class="khoi" aria-labelledby="hGan"><div class="dau-hang"><h2 class="dau" id="hGan">Luồng gần đây của dự án</h2><a class="mo" href="#/code/dieu-khien">Xem mọi luồng</a></div><div id="dsGan">${dangTai(2)}</div></section>
    <section class="khoi" aria-labelledby="hGh">
      <div class="dau-hang"><h2 class="dau" id="hGh">Mở repo từ GitHub</h2><span class="mo">Repo chưa có trên máy thì văn phòng clone về; thiếu agent.md thì tạo theo mẫu.</span>
        <button type="button" class="nut nho" id="nutGh" aria-expanded="false" aria-controls="khungGh" style="margin-left:auto">Chọn repo</button></div>
      <div id="khungGh" class="cot-doc" hidden>
        <div class="hang"><label class="visually-hidden" for="timGh">Tìm repo</label><input class="o" id="timGh" type="search" placeholder="Tìm theo tên hoặc mô tả" autocomplete="off">
          <span class="mo" id="taiKhoanGh"></span></div>
        <p class="mo" id="tinGh" aria-live="polite"></p>
        <div id="dsGh"></div>
        <div class="hang"><button type="button" class="nut nho" id="nutThemGh" hidden>Tải thêm</button></div>
      </div>
    </section>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  const cungDuAn = (a, b) => a === b || (/^[a-zA-Z]:[\\/]/.test(a || "") && String(a).toLowerCase() === String(b || "").toLowerCase());
  let wsYeuCau = new URLSearchParams(location.hash.split("?")[1] || "").get("workspace") || "";
  let conSong = true, hen = null, dangGiao = false, tt = null, loiTT = "", runs = null, phien = 0;
  let gh = { ds: [], trang: 0, conNua: false, dangTai: false, dangMo: false, loi: "", daTai: false };

  // ---------- dự án và tình trạng ----------
  const daChon = () => $("chonDA").value || wsYeuCau || kho.duAn || "";
  let kyDA = null;
  function veChonDuAn() {
    const sel = $("chonDA");
    const mucTieu = wsYeuCau && kho.dsDuAn.find((w) => cungDuAn(w.path, wsYeuCau))?.path || "";
    const cu = mucTieu || sel.value || kho.duAn;
    // Kho báo đổi mỗi khi có tin mới: chỉ vẽ lại ô chọn khi danh sách dự án đổi thật (đang mở ô chọn thì không bị đóng ngang).
    const ky = kho.dsDuAn.map((w) => w.path).join("|");
    if (ky === kyDA) {
      if (mucTieu) { sel.value = mucTieu; wsYeuCau = ""; return true; }
      return false;
    }
    kyDA = ky;
    sel.innerHTML = kho.dsDuAn.length ? kho.dsDuAn.map((w) => `<option value="${esc(w.path)}"${w.path === cu ? " selected" : ""}>${esc(w.name || tenDuAn(w.path))}</option>`).join("") : `<option value="">Chưa có dự án</option>`;
    sel.disabled = !kho.dsDuAn.length;
    if (mucTieu) { sel.value = mucTieu; wsYeuCau = ""; return true; }
    return false;
  }
  async function taiTinhTrang({ fresh = false } = {}) {
    clearTimeout(hen);
    if (!conSong) return;
    const w = daChon(), mine = ++phien;
    if (!w) { tt = null; loiTT = ""; runs = runs || []; veTinh(); veGan(); return; }
    if (!document.hidden) {
      const q = encodeURIComponent(w);
      const [s, sc, a] = await Promise.allSettled([ctl("/ai/status?workspace=" + q), ctl("/scan?workspace=" + q + (fresh ? "&fresh=1" : ""), undefined, { timeout: 25000 }), ctl("/autopilot")]);
      if (!conSong || mine !== phien) return;
      tt = s.status === "fulfilled" ? { ...s.value, scan: sc.status === "fulfilled" ? sc.value.scan : null,
        fullAccess: sc.status !== "fulfilled" || sc.value.fullAccess !== false,
        canResumeLimited: sc.status === "fulfilled" && sc.value.canResumeLimited === true, loiScan: sc.status === "rejected" ? sc.reason.message : "" } : null;
      loiTT = s.status === "rejected" ? s.reason.message : "";
      runs = a.status === "fulfilled" ? a.value.runs || [] : runs;
      veTinh(); veGan();
    }
    hen = setTimeout(taiTinhTrang, (runs || []).some((r) => cungDuAn(r.workspace, w) && LUONG_CHAY.has(r.status)) ? 5000 : 20000);
  }
  // Lý do chưa giao được (null = giao được). Mỗi lý do kèm cách xử lý ngay trong khu hoặc mở ngăn.
  function chan() {
    const w = daChon();
    if (!w) return { ly: "Chưa có dự án nào. Mở một repo GitHub ở dưới.", nut: `<button type="button" class="nut nho" data-mo-gh>Chọn repo GitHub</button>` };
    if (!tt) return loiTT ? { ly: "Chưa đọc được tình trạng dự án." } : { ly: "Đang đọc tình trạng dự án…" };
    const song = (runs || []).find((r) => cungDuAn(r.workspace, w) && LUONG_SONG.has(r.status));
    if (song) return { ly: `Dự án đang có luồng ${TT_LUONG[song.status]}: "${cat(song.task, 80)}".`, nut: `<button type="button" class="nut nho" data-ngan="luong:${esc(song.id)}">Mở luồng</button>`, chay: LUONG_CHAY.has(song.status) };
    if (tt.handoffPending) return { ly: "Có bàn giao đang chờ anh duyệt.", nut: `<button type="button" class="nut nho" data-ngan="ban-giao:${esc(tt.handoffPending)}">Duyệt bàn giao</button>` };
    if (tt.aiBusy) return { ly: "Một AI đang chạy lượt trong dự án này.", nut: `<a class="nut nho" href="#/code/dieu-khien">Xem lượt đang chạy</a>`, chay: true };
    if (!tt.turn) return { ly: tt.problem || "Chưa đọc được sổ agent.md của dự án." };
    if (tt.fullAccess && tt.scan?.truncated) return { ly: "Rà soát chưa hoàn tất. Xử lý phần chưa quét hoặc chọn mức quyền thấp hơn trước khi chạy Toàn quyền." };
    if (tt.fullAccess && tt.scan && !tt.scan.approved) return { ly: GOI_Y.SCAN_PENDING, scan: true };
    return null;
  }
  function veTinh() {
    const el = $("tinhTrang"), w = daChon();
    if (!w) { el.innerHTML = rong("Chưa có dự án", "Văn phòng chỉ giao việc cho repo đã mở trên máy. Chọn một repo GitHub để bắt đầu.", `<button type="button" class="nut" data-mo-gh>Chọn repo GitHub</button>`); capNhatNut(); return; }
    if (!tt) { el.innerHTML = loiTT ? loi("Chưa đọc được tình trạng dự án: " + loiTT) : dangTai(3); capNhatNut(); return; }
    const c = chan(), t = tt.turn || {};
    const choScan = (runs || []).find((r) => cungDuAn(r.workspace, w) && r.status === "awaiting_scan");
    let h = `<table class="bang"><tbody><tr><td class="mo">Phase</td><td>${esc(t.phase || "chưa đọc được")}</td></tr>
      <tr><td class="mo">Đang giữ lượt</td><td>${esc(t.nextOwner ? tenVai(t.nextOwner) : "chưa đọc được")}</td></tr></tbody></table>`;
    if (c && c.chay) h += `<p class="dang-chay"><span class="cham" aria-hidden="true"></span>Đội đang làm việc trong dự án này</p>`;
    h += c ? `<div class="hoi-anh"><p>${esc(c.ly)}</p>${c.nut ? `<div class="hang">${c.nut}</div>` : ""}</div>` : `<p class="dat">Sẵn sàng nhận việc.</p>`;
    const s = tt.scan;
    if (choScan && (!tt.fullAccess || tt.canResumeLimited)) {
      h += `<div class="hoi-anh" data-scan-resume><p>Vai đang chờ có thể chạy tiếp ở mức quyền hiện tại.</p>
        <div class="hang"><button type="button" class="nut-chinh" data-chay-tiep-scan="" data-scan-mode="limited" data-scan-workspace="${esc(w)}">Chạy tiếp</button></div></div>`;
    } else if (tt.fullAccess && s?.truncated) {
      h += `<div class="loi" role="alert" data-scan-truncated><span>Rà soát chưa hoàn tất: văn phòng chưa đọc được toàn bộ phạm vi dự án nên chưa thể duyệt Toàn quyền. Xử lý phần chưa quét hoặc chọn mức quyền thấp hơn.</span><a class="nut nho" href="#/he/models">Đổi mức quyền</a></div>`;
      if ((s.findings || []).length) {
        h += `<details data-k="scan"><summary>${esc(s.total)} điểm đã ghi nhận trong phần đã quét</summary>
          <ol class="ds-file">${(s.findings || []).map((f) => `<li><code>${esc(f.file)}${f.line ? ":" + esc(f.line) : ""}</code> ${esc(f.name)}<br><code>${esc(cat(f.text, 200))}</code></li>`).join("")}</ol>
          ${s.total > (s.findings || []).length ? `<p class="mo">… và ${esc(s.total - s.findings.length)} điểm khác.</p>` : ""}</details>`;
      }
    } else if (tt.fullAccess && s && !s.approved) {
      h += `<details data-k="scan" open><summary>${esc(s.total)} điểm cần anh xem</summary><p class="mo">Văn phòng rà bằng quy tắc so mẫu (không gọi AI) nên có thể báo nhầm. Thấy an toàn thì duyệt${choScan ? " để chạy tiếp luồng đang tạm dừng" : ""}; file đổi thêm điểm mới thì phải duyệt lại.</p>
        <ol class="ds-file">${(s.findings || []).map((f) => `<li><code>${esc(f.file)}${f.line ? ":" + esc(f.line) : ""}</code> ${esc(f.name)}<br><code>${esc(cat(f.text, 200))}</code></li>`).join("")}</ol>
        ${s.total > (s.findings || []).length ? `<p class="mo">… và ${esc(s.total - s.findings.length)} điểm khác.</p>` : ""}
        <button type="button" class="nut-chinh" data-duyet-scan="${esc(s.fingerprint || "")}" data-scan-workspace="${esc(w)}">Đã xem, cho AI chạy toàn quyền</button></details>`;
    } else if (s && s.approved && choScan) {
      h += `<div class="hoi-anh" data-scan-resume><p>${s.total ? "Các điểm bất thường hiện tại đã được duyệt trước đó" : "Lần rà soát mới nhất không còn điểm bất thường"}, nhưng luồng đang tạm dừng chờ rà soát.</p>
        <div class="hang"><button type="button" class="nut-chinh" data-chay-tiep-scan="${esc(s.fingerprint || "")}" data-scan-workspace="${esc(w)}">Chạy tiếp</button></div></div>`;
    }
    if (tt.loiScan) h += `<p class="canh-bao">Chưa rà được file .md và thư viện: ${esc(tt.loiScan)}</p>`;
    el.innerHTML = h;
    capNhatNut();
  }
  function capNhatNut() {
    const c = chan(), nut = $("nutGiao");
    nut.disabled = dangGiao || !!c;
    if (dangGiao) nut.setAttribute("aria-busy", "true"); else nut.removeAttribute("aria-busy");
    nut.textContent = dangGiao ? "Đang giao…" : "Giao cho đội";
    nut.title = c ? c.ly : "";
  }
  function veGan() {
    const w = daChon(), el = $("dsGan");
    if (runs === null) { el.innerHTML = dangTai(2); return; }
    const ds = runs.filter((r) => cungDuAn(r.workspace, w)).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).slice(0, 5);
    el.innerHTML = ds.length ? ds.map((r) => `<div class="dong"><div><div class="tieu">${esc(cat(r.task, 160))}</div><div class="chi-tiet">${soLuot(r)}/${esc(r.maxSteps)} lượt · ${esc(luc(r.updatedAt))}</div></div>
      <div class="hang"><span class="nhan ${lopLuong(r.status)}">${esc(TT_LUONG[r.status] || r.status)}</span><button type="button" class="nut nho" data-ngan="luong:${esc(r.id)}" aria-label="Xem luồng: ${esc(cat(r.task, 60))}">Xem</button></div></div>`).join("")
      : rong("Dự án chưa có luồng nào", "Việc đầu tiên anh giao sẽ hiện ở đây cùng tiến độ từng lượt.");
  }

  // ---------- giao việc ----------
  $("oViec").addEventListener("input", () => { $("demChu").textContent = $("oViec").value.length + "/3000"; $("oViec").removeAttribute("aria-invalid"); });
  $("chonDA").addEventListener("change", () => { tt = null; loiTT = ""; veTinh(); veGan(); taiTinhTrang(); });
  $("bieuMau").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (dangGiao || chan()) return;
    const f = $("bieuMau"), task = $("oViec").value.trim(), maxSteps = Number(f.maxSteps.value), phut = Number(f.phut.value);
    f.querySelectorAll("[aria-invalid]").forEach((o) => o.removeAttribute("aria-invalid"));
    const [o, thieu] = !task ? ["task", "Nhập việc anh giao."] : !(Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 12) ? ["maxSteps", "Số lượt từ 1 đến 12."]
      : !(phut >= 5 && phut <= 120) ? ["phut", "Thời gian từ 5 đến 120 phút."] : [null, ""];
    $("loiGiao").textContent = thieu;
    if (thieu) { f[o].setAttribute("aria-invalid", "true"); f[o].focus(); return; }
    dangGiao = true; capNhatNut();
    try {
      const { run } = await ctl("/autopilot", { workspace: daChon(), task, maxSteps, timeoutMs: phut * 60000 }, { timeout: 90000 });
      $("oViec").value = ""; $("demChu").textContent = "0/3000";
      bao("Đã giao. Đội bắt đầu từ lượt của " + tenVai(tt?.turn?.nextOwner) + ".");
      dangGiao = false; runs = [run, ...(runs || []).filter((r) => r.id !== run.id)];
      veTinh(); veGan();
      ngan.mo("luong:" + run.id, $("nutGiao"), { khiDoi: taiTinhTrang });
      taiTinhTrang();
    } catch (err) {
      $("loiGiao").textContent = (GOI_Y[err.code] && !err.message.includes(GOI_Y[err.code]) ? GOI_Y[err.code] + " " : "") + err.message;
      dangGiao = false; capNhatNut(); taiTinhTrang();
    }
  });

  // ---------- GitHub ----------
  function veGh() {
    const q = $("timGh").value.trim().toLocaleLowerCase(), ds = gh.ds.filter((r) => (r.fullName + " " + r.description).toLocaleLowerCase().includes(q));
    $("nutThemGh").hidden = !gh.conNua; $("nutThemGh").disabled = gh.dangTai || gh.dangMo;
    $("dsGh").setAttribute("aria-busy", String(gh.dangTai));
    $("dsGh").innerHTML = gh.loi && !gh.ds.length ? loi(gh.loi) : gh.dangTai && !gh.ds.length ? dangTai(4)
      : ds.length ? ds.map((r) => `<div class="dong"><div><div class="tieu"><code>${esc(r.fullName)}</code></div><div class="chi-tiet">${r.private ? "riêng tư" : "công khai"}${r.archived ? " · lưu trữ" : ""}${r.defaultBranch ? " · nhánh " + esc(r.defaultBranch) : ""}${r.description ? " · " + esc(cat(r.description, 140)) : ""}</div></div>
          <button type="button" class="nut nho" data-mo-repo="${esc(r.fullName)}"${gh.dangMo ? " disabled" : ""}>Mở</button></div>`).join("")
      : rong(q ? "Không có repo khớp" : "Tài khoản chưa có repo", q ? "Thử từ khoá khác, hoặc Tải thêm nếu còn trang sau." : "Tạo repo ở mục Dự án của Xưởng code.");
  }
  async function taiGh(them = false) {
    if (gh.dangTai || gh.dangMo) return;
    gh.dangTai = true; gh.loi = ""; if (!them) { gh.ds = []; gh.trang = 0; }
    veGh();
    try {
      const d = await ctl("/github/repos?page=" + (gh.trang + 1), undefined, { timeout: 35000 });
      if (!conSong) return;
      gh.ds = [...new Map([...gh.ds, ...(d.repositories || [])].map((r) => [r.fullName, r])).values()];
      gh.trang = d.page; gh.conNua = !!d.hasMore; gh.daTai = true;
      $("taiKhoanGh").textContent = d.account ? "Tài khoản GitHub: " + d.account.login : "";
    } catch (e) { gh.loi = "Chưa đọc được repo GitHub: " + e.message; $("tinGh").textContent = gh.ds.length ? gh.loi : ""; }
    gh.dangTai = false; veGh();
  }
  async function moRepo(ten, nut) {
    if (gh.dangMo) return;
    gh.dangMo = true; veGh(); $("tinGh").textContent = "Đang mở " + ten + "…";
    try {
      let { operation: op } = await ctl("/github/open", { fullName: ten });
      while (op.status === "running" && conSong) {
        $("tinGh").textContent = op.message;
        await new Promise((ok) => setTimeout(ok, 900));
        ({ operation: op } = await ctl("/github/operations/" + encodeURIComponent(op.id)));
      }
      if (!conSong) return;
      if (op.status !== "done") throw new Error(op.message);
      $("tinGh").textContent = op.message;
      await kho.taiLaiDuAn();
      veChonDuAn(); $("chonDA").value = op.workspace; tt = null; veTinh(); veGan(); taiTinhTrang();
      bao("Đã mở " + ten + ".");
      $("oViec").focus();
    } catch (e) { if (conSong) $("tinGh").textContent = e.message; }
    gh.dangMo = false; if (conSong) veGh();
    if (nut && nut.isConnected && document.activeElement === document.body) nut.focus();
  }
  function moKhungGh(mo) {
    $("khungGh").hidden = !mo; $("nutGh").setAttribute("aria-expanded", String(mo)); $("nutGh").textContent = mo ? "Ẩn danh sách" : "Chọn repo";
    if (mo) { if (!gh.daTai) taiGh(); $("timGh").focus(); }
  }
  $("timGh").addEventListener("input", veGh);

  vung.addEventListener("click", async (e) => {
    const t = e.target;
    const n = t.closest("[data-ngan]"); if (n) return ngan.mo(n.dataset.ngan, n, { khiDoi: taiTinhTrang });
    if (t.closest("#nutGh")) return moKhungGh($("khungGh").hidden);
    if (t.closest("[data-mo-gh]")) { moKhungGh(true); return $("hGh").scrollIntoView({ block: "start" }); }
    if (t.closest("#nutThemGh")) return taiGh(true);
    const r = t.closest("[data-mo-repo]"); if (r) return moRepo(r.dataset.moRepo, r);
    if (t.closest("#nutDocLai")) { tt = null; veTinh(); return taiTinhTrang({ fresh: true }); }
    if (t.closest("[data-thu-lai]")) return $("khungGh").contains(t) ? taiGh() : taiTinhTrang();
    const s = t.closest("[data-duyet-scan], [data-chay-tiep-scan]");
    if (s && !s.disabled) {
      const laChayTiep = s.hasAttribute("data-chay-tiep-scan");
      const workspace = s.dataset.scanWorkspace || daChon();
      const fingerprint = laChayTiep ? (s.dataset.chayTiepScan || "") : (s.dataset.duyetScan || "");
      s.disabled = true; s.setAttribute("aria-busy", "true");
      try {
        const d = s.dataset.scanMode === "limited"
          ? await ctl("/scan/resume", { workspace }, { timeout: 20000 })
          : await ctl("/scan/approve", { workspace, fingerprint }, { timeout: 20000 });
        const nRes = (d.resumed || []).length;
        bao(laChayTiep
          ? (nRes ? "Đã chạy tiếp " + nRes + " luồng đang tạm dừng." : "Không còn luồng nào đang chờ.")
          : ("Đã duyệt rà soát." + (nRes ? " Chạy tiếp " + nRes + " luồng đang tạm dừng." : "")));
      } catch (err) {
        bao(err.message, true);
      }
      taiTinhTrang();
    }
  });

  // Dự án ở thanh trên đổi thì ô Dự án theo (anh vẫn chọn được dự án khác chỉ cho lần giao này).
  let duAnTruoc = kho.duAn;
  const bo = kho.on(() => {
    const daDatTheoLink = veChonDuAn();
    if (kho.duAn !== duAnTruoc) {
      duAnTruoc = kho.duAn;
      if (!daDatTheoLink) $("chonDA").value = kho.duAn || "";
      tt = null; veTinh(); veGan(); taiTinhTrang();
    }
  });
  const khiHien = () => { if (!document.hidden) taiTinhTrang(); };
  document.addEventListener("visibilitychange", khiHien);
  veChonDuAn(); veTinh();
  function dong() {
    if (!conSong) return;
    conSong = false;
    clearTimeout(hen);
    bo();
    document.removeEventListener("visibilitychange", khiHien);
  }
  signal?.addEventListener("abort", dong, { once: true });
  try { await taiTinhTrang({ fresh: true }); }
  finally { signal?.removeEventListener("abort", dong); }
  return dong;
}
