// Xưởng code · Xem PR: đọc Pull Request của dự án đang chọn từ GitHub (qua Git Credential Manager phía ctl, chỉ đọc).
// Xem trạng thái CI, nhận xét review, mô tả và diff từng file ngay tại chỗ; việc merge trên GitHub vẫn do anh quyết.
import { esc, cat, luc, dangTai, rong, loi, safeHttps } from "../ui.js";

const TT_PR = {
  open: ["đang mở", "song"],
  merged: ["đã gộp", ""],
  closed: ["đã đóng", "hong"],
};
const TT_REVIEW = {
  APPROVED: ["Đã duyệt", "dat"],
  CHANGES_REQUESTED: ["Yêu cầu sửa", "hong"],
  COMMENTED: ["Nhận xét", "mo"],
  DISMISSED: ["Đã huỷ", "mo"],
};
const TT_FILE = { added: "thêm", modified: "sửa", removed: "xoá", renamed: "đổi tên" };

const safeGithub = (v) => {
  const u = safeHttps(v);
  return u && new URL(u).hostname === "github.com" ? u : null;
};

export async function mo(vung, { kho, ctl, signal }) {
  const qs = new URLSearchParams(location.hash.split("?")[1] || "");
  let state = ["open", "closed", "all"].includes(qs.get("state")) ? qs.get("state") : "open";
  let tim = "";
  let dsData = null, loiDs = "", chonSo = Number(qs.get("pr")) || null;
  let chiTiet = null, loiCt = "", dangTaiCt = false;
  let conSong = true, phienDs = 0, phienCt = 0, docLuc = 0, duAnHienTai = kho.duAn || "";

  vung.innerHTML = `<div class="vung">
    <div class="hang thanh-loc">
      <div class="chon-nhom" role="group" aria-label="Trạng thái Pull Request">
        <button type="button" data-pr-tt="open" aria-pressed="${state === "open"}">Đang mở</button>
        <button type="button" data-pr-tt="closed" aria-pressed="${state === "closed"}">Đã đóng / gộp</button>
        <button type="button" data-pr-tt="all" aria-pressed="${state === "all"}">Tất cả</button>
      </div>
      <label class="visually-hidden" for="timPr">Tìm Pull Request</label>
      <input class="o" type="search" id="timPr" placeholder="Tìm #số, tiêu đề, nhánh, tác giả…" style="flex:0 1 280px;min-width:200px">
      <span class="mo" id="prLucDoc" aria-live="polite"></span>
      <div class="hang" style="margin-left:auto">
        <span id="prNhanhMoi"></span>
        <span id="prLinkRepo"></span>
        <button type="button" class="nut nho" id="prLamMoi">Đọc lại</button>
      </div>
    </div>
    <div class="pr-khung">
      <section class="khoi" aria-labelledby="hDsPr">
        <div class="dau-hang"><h2 class="dau" id="hDsPr">Pull Request</h2><span class="mo" id="soPr"></span></div>
        <div id="dsPr" class="cot-doc">${dangTai(4)}</div>
      </section>
      <section class="khoi" aria-labelledby="hCtPr">
        <div class="dau-hang"><h2 class="dau" id="hCtPr">Chi tiết Pull Request</h2></div>
        <div id="ctPr">${rong("Chọn một Pull Request", "Bấm một dòng ở danh sách bên trái để xem mô tả, trạng thái CI, nhận xét duyệt và diff từng file.")}</div>
      </section>
    </div>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);

  async function taiDs() {
    if (!conSong) return;
    const ws = kho.duAn;
    duAnHienTai = ws || "";
    if (!ws) {
      dsData = null; loiDs = ""; chonSo = null; chiTiet = null;
      veDs(); veCt();
      return;
    }
    const mine = ++phienDs;
    $("prLamMoi").setAttribute("aria-busy", "true");
    if (!dsData) $("dsPr").innerHTML = dangTai(4);
    try {
      const d = await ctl(`/github/pulls?workspace=${encodeURIComponent(ws)}&state=${encodeURIComponent(state)}`, undefined, { timeout: 25000 });
      if (!conSong || mine !== phienDs || ws !== kho.duAn) return;
      dsData = d; loiDs = ""; docLuc = Date.now();
      const pulls = d.pulls || [];
      if (chonSo && !pulls.some((p) => p.number === chonSo)) { chonSo = null; chiTiet = null; }
      if (!chonSo && pulls.length) chonSo = pulls[0].number;
      veDs();
      if (chonSo) await taiChiTiet(chonSo);
      else veCt();
    } catch (e) {
      if (!conSong || mine !== phienDs) return;
      dsData = null; loiDs = e.message;
      veDs(); veCt();
    } finally {
      if (conSong && mine === phienDs) $("prLamMoi")?.removeAttribute("aria-busy");
    }
  }

  async function taiChiTiet(so) {
    if (!conSong || !kho.duAn || !so) return;
    const ws = kho.duAn, mine = ++phienCt;
    chonSo = so; dangTaiCt = true; loiCt = "";
    veDs(); veCt();
    try {
      const d = await ctl(`/github/pulls/${encodeURIComponent(so)}?workspace=${encodeURIComponent(ws)}`, undefined, { timeout: 30000 });
      if (!conSong || mine !== phienCt || ws !== kho.duAn) return;
      chiTiet = d.pull || null; loiCt = "";
    } catch (e) {
      if (!conSong || mine !== phienCt) return;
      chiTiet = null; loiCt = e.message;
    } finally {
      if (conSong && mine === phienCt) { dangTaiCt = false; veCt(); }
    }
  }

  function locPulls() {
    const all = (dsData && dsData.pulls) || [];
    const q = tim.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      ("#" + p.number).includes(q)
      || p.title.toLowerCase().includes(q)
      || p.author.toLowerCase().includes(q)
      || p.head.ref.toLowerCase().includes(q)
      || p.base.ref.toLowerCase().includes(q));
  }

  function veDs() {
    $("prLucDoc").textContent = docLuc && !loiDs ? "đọc lúc " + new Date(docLuc).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
    const repoUrl = safeGithub(dsData?.repo?.url);
    const cmpUrl = safeGithub(dsData?.compareUrl);
    $("prLinkRepo").innerHTML = repoUrl ? `<a class="nut nho" href="${esc(repoUrl)}/pulls" target="_blank" rel="noopener noreferrer">Mở GitHub PRs</a>` : "";
    $("prNhanhMoi").innerHTML = cmpUrl && dsData?.branch ? `<a class="nut-chinh nho" href="${esc(cmpUrl)}" target="_blank" rel="noopener noreferrer">Tạo PR nhánh ${esc(cat(dsData.branch, 24))}</a>` : "";

    if (!kho.duAn) {
      $("soPr").textContent = "";
      $("dsPr").innerHTML = rong("Chưa chọn dự án", "Chọn một dự án ở thanh trên hoặc mở repo từ GitHub.", `<a class="nut nho" href="#/code/du-an">Mở Dự án</a>`);
      return;
    }
    if (loiDs) {
      $("soPr").textContent = "";
      $("dsPr").innerHTML = loi(loiDs);
      return;
    }
    if (!dsData) { $("dsPr").innerHTML = dangTai(4); return; }
    if (dsData.kind === "no-remote" || dsData.kind === "not-github") {
      $("soPr").textContent = "";
      $("dsPr").innerHTML = rong("Dự án chưa nối GitHub", "Repo đang chọn chưa có remote origin trỏ tới github.com nên không có danh sách Pull Request.");
      return;
    }
    const items = locPulls();
    $("soPr").textContent = dsData.repo ? `${dsData.repo.fullName} · ${items.length} PR` : `${items.length} PR`;
    if (!items.length) {
      const moTa = tim.trim() ? "Không có Pull Request nào khớp từ khoá tìm kiếm."
        : state === "open" ? "Hiện không có Pull Request nào đang mở trên repo này."
        : "Chưa có Pull Request nào ở bộ lọc này.";
      $("dsPr").innerHTML = rong("Danh sách trống", moTa, cmpUrl ? `<a class="nut nho" href="${esc(cmpUrl)}" target="_blank" rel="noopener noreferrer">Tạo PR từ nhánh hiện tại</a>` : `<a class="nut nho" href="#/code/dieu-khien">Xem Luồng và bàn giao</a>`);
      return;
    }
    $("dsPr").innerHTML = items.map((p) => {
      const [nhan, lop] = p.draft && p.state === "open" ? ["bản nháp", "canh-bao"] : (TT_PR[p.state] || [p.state, ""]);
      return `<button type="button" class="pr-muc" data-chon-pr="${p.number}"${chonSo === p.number ? ' aria-current="true"' : ""}>
        <div class="hang"><span class="so mo">#${p.number}</span><span class="nhan ${lop}">${esc(nhan)}</span><span class="mo" style="margin-left:auto">${esc(luc(p.mergedAt || p.updatedAt))}</span></div>
        <div class="tieu">${esc(p.title)}</div>
        <div class="mo" style="font-size:var(--text-xs)"><code>${esc(cat(p.head.ref, 28))}</code> → <code>${esc(cat(p.base.ref, 20))}</code>${p.author ? " · " + esc(p.author) : ""}</div>
      </button>`;
    }).join("");
  }

  function veChecks(checks) {
    if (!checks || !checks.length) return `<p class="mo">Chưa ghi nhận lượt kiểm CI nào trên commit đầu nhánh.</p>`;
    const dat = checks.filter((c) => c.conclusion === "success" || c.conclusion === "neutral" || c.conclusion === "skipped").length;
    const hong = checks.filter((c) => c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion)).length;
    const chay = checks.filter((c) => c.status !== "completed").length;
    return `<div class="cot-doc">
      <div class="hang">
        ${hong ? `<span class="nhan hong">${hong} kiểm lỗi</span>` : ""}
        ${chay ? `<span class="nhan canh-bao">${chay} đang chạy</span>` : ""}
        ${dat ? `<span class="nhan song">${dat}/${checks.length} đạt</span>` : ""}
      </div>
      <div class="cot-doc">${checks.slice(0, 15).map((c) => {
        const ky = c.status !== "completed" ? "…" : ["success", "neutral", "skipped"].includes(c.conclusion) ? "✓" : "✗";
        const lop = c.status !== "completed" ? "canh-bao" : ["success", "neutral", "skipped"].includes(c.conclusion) ? "dat" : "hong";
        const u = safeGithub(c.url);
        return `<div class="hang" style="font-size:var(--text-xs)"><b class="${lop}">${ky}</b><span>${esc(c.name)}</span><span class="mo">${esc(c.conclusion || c.status)}</span>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="mo" style="margin-left:auto">Xem log</a>` : ""}</div>`;
      }).join("")}</div>
    </div>`;
  }

  function veCt() {
    if (!chonSo) {
      $("hCtPr").textContent = "Chi tiết Pull Request";
      $("ctPr").innerHTML = rong("Chọn một Pull Request", "Bấm một dòng ở danh sách bên trái để xem mô tả, trạng thái CI, nhận xét duyệt và diff từng file.");
      return;
    }
    $("hCtPr").textContent = "PR #" + chonSo;
    if (loiDs && !chiTiet) { $("ctPr").innerHTML = rong("Chưa đọc được Pull Request", "Khắc phục lỗi tải danh sách bên trái rồi bấm Đọc lại."); return; }
    if (dangTaiCt && (!chiTiet || chiTiet.number !== chonSo)) { $("ctPr").innerHTML = dangTai(6); return; }
    if (loiCt) { $("ctPr").innerHTML = loi(loiCt, false) + `<div class="hang" style="margin-top:var(--space-xs)"><button type="button" class="nut nho" data-doc-lai-ct="${chonSo}">Thử đọc lại PR #${chonSo}</button></div>`; return; }
    if (!chiTiet) { $("ctPr").innerHTML = dangTai(4); return; }

    const p = chiTiet;
    const [nhan, lop] = p.draft && p.state === "open" ? ["bản nháp", "canh-bao"] : (TT_PR[p.state] || [p.state, ""]);
    const mergeNhan = p.merged ? `<span class="nhan">đã gộp ${esc(luc(p.mergedAt))}</span>`
      : p.state !== "open" ? ""
      : p.mergeable === false || p.mergeableState === "dirty" ? `<span class="nhan hong">có xung đột (conflict)</span>`
      : p.mergeable === true ? `<span class="nhan song">không xung đột</span>` : "";
    const prUrl = safeGithub(p.url);
    const linkGiao = "#/code/giao-viec" + (kho.duAn ? "?workspace=" + encodeURIComponent(kho.duAn) : "");
    const bodyHtml = p.body
      ? (globalThis.MD ? `<div class="md-xem">${globalThis.MD.render(p.body)}</div>` : `<pre class="van-ban">${esc(p.body)}</pre>`)
      : `<p class="mo">Pull Request này không có phần mô tả.</p>`;

    const reviewsHtml = (p.reviews || []).length
      ? `<div class="cot-doc">${p.reviews.map((r) => {
          const [t, cl] = TT_REVIEW[r.state] || [r.state, "mo"];
          return `<div class="dong"><div><div class="tieu"><b>${esc(r.author || "Reviewer")}</b> · <span class="${cl}">${esc(t)}</span> · <span class="mo">${esc(luc(r.submittedAt))}</span></div>${r.body ? `<div class="chi-tiet">${esc(cat(r.body, 300))}</div>` : ""}</div></div>`;
        }).join("")}</div>`
      : `<p class="mo">Chưa có lượt đánh giá (review) nào.</p>`;

    const filesHtml = (p.files || []).length
      ? `<div class="cot-doc">${p.files.map((f, idx) => `<details${idx < 2 && f.patch ? " open" : ""}>
          <summary class="hang" style="font-size:var(--text-xs)"><code>${esc(f.filename)}</code><span class="mo">${esc(TT_FILE[f.status] || f.status)}</span><span class="so dat" style="margin-left:auto">+${f.additions}</span><span class="so hong">−${f.deletions}</span></summary>
          ${f.patch ? `<pre class="pr-diff">${esc(f.patch)}${f.truncated ? "\n… (đã cắt bớt file dài, mở trên GitHub để xem trọn vẹn)" : ""}</pre>` : `<p class="mo" style="font-size:var(--text-xs);margin-top:var(--space-2xs)">File nhị phân hoặc không có diff văn bản.</p>`}
        </details>`).join("")}${p.filesTruncated ? `<p class="mo" style="font-size:var(--text-xs)">PR có hơn 100 file: mở trên GitHub để xem đầy đủ.</p>` : ""}</div>`
      : `<p class="mo">Chưa có danh sách file thay đổi.</p>`;

    $("hCtPr").textContent = `#${p.number} · ${p.title}`;
    $("ctPr").innerHTML = `<div class="cot-doc">
      <div class="hang">
        <span class="nhan ${lop}">${esc(nhan)}</span>
        ${mergeNhan}
        <span class="mo"><code>${esc(p.head.ref)}</code> → <code>${esc(p.base.ref)}</code> · bởi <b>${esc(p.author || "?")}</b> · cập nhật ${esc(luc(p.updatedAt))}</span>
      </div>
      <div class="hang">
        <span class="so dat">+${p.additions}</span><span class="so hong">−${p.deletions}</span>
        <span class="mo">· ${p.changedFiles} file · ${p.commits} commit${p.comments ? ` · ${p.comments} trao đổi` : ""}</span>
        <div class="hang" style="margin-left:auto">
          <a class="nut nho" href="${esc(linkGiao)}">Giao đội rà soát / sửa</a>
          ${prUrl ? `<a class="nut-chinh nho" href="${esc(prUrl)}" target="_blank" rel="noopener noreferrer">Mở trên GitHub</a>` : ""}
        </div>
      </div>
      <section class="khoi" aria-labelledby="hPrCi"><h3 class="dau" id="hPrCi">Kiểm tra tự động (CI)</h3>${veChecks(p.checks)}</section>
      <section class="khoi" aria-labelledby="hPrMoTa"><h3 class="dau" id="hPrMoTa">Mô tả</h3>${bodyHtml}</section>
      <section class="khoi" aria-labelledby="hPrRev"><h3 class="dau" id="hPrRev">Đánh giá (Reviews)</h3>${reviewsHtml}</section>
      <section class="khoi" aria-labelledby="hPrFiles"><h3 class="dau" id="hPrFiles">File thay đổi (${p.changedFiles})</h3>${filesHtml}</section>
    </div>`;
  }

  vung.addEventListener("input", (e) => {
    if (e.target.id === "timPr") { tim = e.target.value; veDs(); }
  });
  vung.addEventListener("click", (e) => {
    const t = e.target;
    const nutTt = t.closest("[data-pr-tt]");
    if (nutTt) {
      state = nutTt.dataset.prTt;
      vung.querySelectorAll("[data-pr-tt]").forEach((b) => b.setAttribute("aria-pressed", String(b === nutTt)));
      chonSo = null; chiTiet = null;
      return taiDs();
    }
    const chon = t.closest("[data-chon-pr]");
    if (chon) {
      const so = Number(chon.dataset.chonPr);
      if (so && so !== chonSo) taiChiTiet(so);
      return;
    }
    const docLaiCt = t.closest("[data-doc-lai-ct]");
    if (docLaiCt) return taiChiTiet(Number(docLaiCt.dataset.docLaiCt));
    if (t.closest("#prLamMoi") || t.closest("[data-thu-lai]")) return taiDs();
  });

  const boKho = kho.on((k) => {
    if ((k.duAn || "") !== duAnHienTai) {
      dsData = null; chonSo = null; chiTiet = null;
      taiDs();
    }
  });
  const khiHien = () => { if (!document.hidden && kho.duAn) taiDs(); };
  document.addEventListener("visibilitychange", khiHien);
  function dong() {
    if (!conSong) return;
    conSong = false;
    phienDs++; phienCt++;
    boKho();
    document.removeEventListener("visibilitychange", khiHien);
  }
  signal?.addEventListener("abort", dong, { once: true });
  taiDs();
  return dong;
}
