// Xưởng phim · Kho phim (#/phim/kho, CEO yêu cầu 26/11/2026): mọi phim hiện trực quan theo loại như các thư mục.
// Mỗi loại một nhóm (Tài liệu kiến thức, Phim AI giải trí, Quảng cáo / giới thiệu, Mạng xã hội ngắn); mỗi phim một thẻ
// có ảnh bìa, cổng đang chờ, số cảnh. Phim qua Cổng 4 vào nhóm Đã xuất, có nút dọn nháp (take/khung không chọn, gói CapCut).
// Phim cũ ngoài kho giữ nguyên chỗ, chỉ gắn loại. Bấm thẻ: mở phim ở đúng bước đang làm.
import { esc, luc, dangTai, rong, loi, ctl as ctlMacDinh, bao as baoMacDinh } from "../ui.js";

const BUOC = { 1: ["#/phim", "Chờ duyệt Cổng 1 · kịch bản"], 2: ["#/phim/canh", "Chờ duyệt Cổng 2 · phân cảnh"], 3: ["#/phim/ban-dung", "Chờ duyệt Cổng 3 · bản dựng"], 4: ["#/phim/ban-dung", "Chờ duyệt Cổng 4 · xuất xưởng"] };
const mb = (b) => (b / 1048576).toFixed(b >= 1048576 * 100 ? 0 : 1) + " MB";

export async function mo(vung, { ctl = ctlMacDinh, bao = baoMacDinh, signal } = {}) {
  vung.innerHTML = `<div class="vung" id="khoPhim">${dangTai(4)}</div>`;
  const goc = vung.querySelector("#khoPhim");
  let ds = null, loaiDs = [], kho = "", loiTai = "", moTao = false, ban = false, conSong = true, hen = null;
  // Thư viện phim mẫu: danh sách, lỗi tải, tệp đang tải lên, phim mẫu đang dùng để tạo phim mới, báo cáo đang mở.
  let mau = null, loiMau = "", taiLenDang = "", taoMau = null;
  const moBaoCao = new Set();
  const anh = (p) => "/ctl/phim/media?workspace=" + encodeURIComponent(p.path) + "&path=" + encodeURIComponent(p.anhBia) + "&v=" + encodeURIComponent(p.capNhat || "");

  async function tai() {
    clearTimeout(hen);
    if (!conSong) return;
    if (!document.hidden) {
      const [r1, r2] = await Promise.allSettled([ctl("/phim/du-an"), ctl("/phim/mau")]);
      if (!conSong) return;
      if (r1.status === "fulfilled") { const r = r1.value; ds = r.duAn || []; loaiDs = r.loai || []; kho = r.kho || ""; loiTai = ""; }
      else loiTai = r1.reason.message;
      if (r2.status === "fulfilled") { mau = r2.value.phimMau || { workspace: null, ds: [] }; loiMau = ""; }
      else loiMau = r2.reason.message;
      // Đang thao tác (ban) thì lam() tự vẽ lại khi xong. ve() không đụng biểu mẫu Phim mới khi nó đang mở.
      if (!ban) ve();
    }
    const dangChay = taiLenDang || (mau && mau.ds.some((m) => m.phanTich && m.phanTich.trangThai === "dang"));
    if (conSong) hen = setTimeout(tai, dangChay ? 5000 : 30000);
  }

  function veThe(p) {
    const [href, viec] = p.daXuat ? ["#/phim/ban-dung", "Đã xuất xưởng"] : (BUOC[p.choCong] || BUOC[1]);
    const bia = p.anhBia ? `<img src="${esc(anh(p))}" alt="" loading="lazy">` : `<span class="bia-trong" aria-hidden="true">${esc((Array.from(p.ten)[0] || "?").toUpperCase())}</span>`;
    const ganLoai = !p.trongKho ? `<label class="mo">Loại<select class="o" data-gan-loai="${esc(p.path)}"><option value="">Chưa phân loại</option>${loaiDs.map((l) => `<option value="${esc(l.id)}"${l.id === p.loai ? " selected" : ""}>${esc(l.ten)}</option>`).join("")}</select></label>` : "";
    const don = p.daXuat ? `<button type="button" class="nut nho" data-don-nhap="${esc(p.path)}" aria-label="Dọn file nháp của ${esc(p.ten)}">Dọn nháp</button>` : "";
    return `<article class="the-phim">
      <a class="bia" href="${href}" data-mo-phim="${esc(p.path)}" aria-label="Mở phim ${esc(p.ten)}">${bia}</a>
      <div class="than">
        <a class="ten" href="${href}" data-mo-phim="${esc(p.path)}">${esc(p.ten)}</a>
        <span class="${p.daXuat ? "song" : "canh-bao"}">${esc(viec)}</span>
        <span class="mo">${p.soCanh} cảnh · Cổng ${p.cong}/4${p.capNhat ? " · " + esc(luc(p.capNhat)) : ""}${p.trongKho ? "" : " · ngoài kho"}</span>
        ${ganLoai || don ? `<div class="hang">${ganLoai}${don}</div>` : ""}
      </div>
    </article>`;
  }

  // Biểu mẫu Phim mới; tạo theo phim mẫu (taoMau) thì điền sẵn tên, loại, ý tưởng từ gợi ý của Antigravity.
  function veTao() {
    const m = taoMau && mau && mau.ds.find((x) => x.ma === taoMau), g = (m && m.goiY) || {};
    return `<form id="fTaoPhim" class="bieu-mau khoi" novalidate aria-label="Tạo phim mới">
      ${m ? `<p class="rong-het"><b>Theo phim mẫu:</b> ${esc(m.ten)}. Báo cáo phân tích được chép vào phim mới (phim-mau.md).</p>` : ""}
      <label>Tên phim<input class="o" name="ten" maxlength="80" required autocomplete="off" placeholder="Ví dụ: Tín hiệu trở về" value="${esc(g.ten_goi_y || "")}"></label>
      <label>Loại phim<select class="o" name="loai" required><option value="">Chọn loại…</option>${loaiDs.map((l) => `<option value="${esc(l.id)}"${l.id === g.loai ? " selected" : ""}>${esc(l.ten)}</option>`).join("")}</select></label>
      <label class="rong-het">Ý tưởng (tuỳ chọn)<textarea class="o" name="yTuong" maxlength="${m ? 3000 : 4000}" placeholder="Vài câu về nội dung phim. Có thể để trống và viết đề bài sau.">${esc(g.y_tuong || "")}</textarea></label>
      <p class="mo rong-het" id="khoTaoPhim">Lưu vào: ${esc(kho || "kho phim")}\\&lt;loại&gt;\\&lt;tên phim&gt;</p>
      <div class="hang rong-het"><button type="submit" class="nut-chinh">Tạo phim</button><button type="button" class="nut nho" data-huy-tao>Huỷ</button><span class="hong" id="loiTaoPhim" role="alert"></span></div>
    </form>`;
  }

  // Hai vùng riêng: đầu trang + biểu mẫu Phim mới (#dauKho) và danh sách phim (#dsKho). Làm mới định kỳ, Thử lại,
  // Dọn nháp, gắn loại chỉ vẽ lại và khoá danh sách, không bao giờ đụng biểu mẫu anh đang gõ.
  goc.innerHTML = `<div id="dauKho" class="cot-doc"></div><div id="dsKho" class="cot-doc">${dangTai(4)}</div><div id="mauKho" class="cot-doc"></div>`;
  const dauKho = goc.querySelector("#dauKho"), dsKho = goc.querySelector("#dsKho"), mauKho = goc.querySelector("#mauKho");
  function veDau() {
    // Chưa tải được danh sách loại thì chưa cho mở biểu mẫu (tránh ô Loại phim trống).
    dauKho.innerHTML = `<div class="dau-hang"><h2 class="dau">Kho phim</h2><span class="mo">${esc(kho)}</span>
      <button type="button" class="nut-chinh" data-phim-moi aria-expanded="${moTao}"${loaiDs.length ? "" : " disabled"}>+ Phim mới</button></div>` + (moTao ? veTao() : "");
  }
  // Biểu mẫu đang mở: chỉ bổ sung phần còn thiếu (loại, đường dẫn kho), không vẽ lại để giữ chữ đang gõ.
  function boSungTao() {
    const chon = dauKho.querySelector("#fTaoPhim [name=loai]");
    if (chon && chon.options.length <= 1 && loaiDs.length) chon.insertAdjacentHTML("beforeend", loaiDs.map((l) => `<option value="${esc(l.id)}">${esc(l.ten)}</option>`).join(""));
    const noi = dauKho.querySelector("#khoTaoPhim");
    if (noi && kho) noi.textContent = "Lưu vào: " + kho + "\\<loại>\\<tên phim>";
  }
  function ve() {
    if (!moTao) veDau(); else boSungTao();
    dsKho.innerHTML = veDs();
    mauKho.innerHTML = veMau();
    if (ban) [dsKho, mauKho].forEach((v) => v.querySelectorAll("button, select, input, textarea").forEach((el) => { el.disabled = true; }));
  }

  // Thư viện phim mẫu: video anh thấy hay -> Antigravity xem khung hình, báo làm được không và làm kiểu gì.
  const LAM_DUOC = { duoc: ["dat", "Làm được"], mot_phan: ["canh-bao", "Làm được một phần"], kho: ["hong", "Khó làm"] };
  const giay = (x) => (x >= 60 ? Math.floor(x / 60) + " phút " : "") + Math.round(x % 60) + " giây";
  function veTheMau(m) {
    const bia = m.khung && m.khung[0] && mau.workspace
      ? `<img src="${esc("/ctl/phim/media?workspace=" + encodeURIComponent(mau.workspace) + "&path=" + encodeURIComponent(m.khung[0].path))}" alt="" loading="lazy">`
      : `<span class="bia-trong" aria-hidden="true">▶</span>`;
    const pt = m.phanTich || {}, dang = pt.trangThai === "dang";
    const ld = m.goiY && LAM_DUOC[m.goiY.lam_duoc];
    const tt = dang ? `<span class="canh-bao" role="status">Antigravity đang xem và phân tích…</span>`
      : pt.trangThai === "xong" ? (ld ? `<b class="${ld[0]}">${ld[1]}</b>` : `<span class="dat">Đã phân tích</span>`)
      : pt.trangThai === "loi" ? `<span class="hong">Phân tích lỗi: ${esc(pt.loi || "")}</span>` : `<span class="mo">Chưa phân tích</span>`;
    const baoCao = m.baoCao ? m.baoCao.replace(/^#\s[^\n]*\n+/, "") : "";
    const xem = baoCao ? `<details data-bao-cao="${esc(m.ma)}"${moBaoCao.has(m.ma) ? " open" : ""}><summary>Xem báo cáo</summary>${globalThis.MD ? `<div class="md-xem">${globalThis.MD.render(baoCao)}</div>` : `<pre class="van-ban">${esc(baoCao)}</pre>`}</details>` : "";
    return `<article class="the-phim the-mau">
      <div class="bia">${bia}</div>
      <div class="than">
        <b class="ten">${esc(m.ten)}</b>
        <span class="mo">${esc(giay(m.giay || 0))} · ${esc(m.rong)}×${esc(m.cao)}${m.coTieng ? "" : " · không tiếng"} · ${esc(luc(m.them))}</span>
        ${tt}
        <div class="hang">
          <button type="button" class="nut nho" data-mau-phan-tich="${esc(m.ma)}"${dang ? " disabled" : ""}>${pt.trangThai === "xong" || pt.trangThai === "loi" ? "Phân tích lại" : "Phân tích"}</button>
          ${m.goiY ? `<button type="button" class="nut-chinh" data-mau-tao="${esc(m.ma)}">Tạo phim theo mẫu</button>` : ""}
          <button type="button" class="nut nho nguy" data-mau-xoa="${esc(m.ma)}" aria-label="Bỏ phim mẫu ${esc(m.ten)}"${dang ? " disabled" : ""}>Bỏ</button>
        </div>
        ${xem}
      </div>
    </article>`;
  }
  function veMau() {
    const nhap = `<label class="nut nho" style="cursor:pointer">${taiLenDang ? "Đang tải lên…" : "+ Thêm phim mẫu"}<input type="file" id="taiMau" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv" class="visually-hidden"${taiLenDang ? " disabled" : ""}></label>`;
    const than = !mau ? (loiMau ? loi("Chưa đọc được thư viện phim mẫu: " + loiMau) : dangTai(2))
      : (taiLenDang ? `<p class="canh-bao" role="status">Đang tải lên và cắt khung: ${esc(taiLenDang)}. Video lớn có thể mất vài phút.</p>` : "") +
        (mau.ds.length ? `<div class="luoi-phim">${mau.ds.map(veTheMau).join("")}</div>`
          : `<p class="mo">Thấy phim nào hay, thêm video vào đây (mp4, mov, webm; tối đa 2 GB). Văn phòng cắt khung hình chính, Antigravity xem và cho biết Xưởng phim làm được không, làm kiểu gì; rồi bấm Tạo phim theo mẫu.</p>`);
    return `<section class="khoi nhom-phim" aria-labelledby="h-phim-mau">
      <div class="dau-hang"><h3 class="dau" id="h-phim-mau"><span class="thu-muc" aria-hidden="true"></span>Phim mẫu</h3><span class="mo">${mau ? mau.ds.length + " phim · chỉ học phong cách, không sao chép" : ""}</span>${nhap}</div>
      ${than}
    </section>`;
  }
  function veDs() {
    if (!ds) return loiTai ? loi(loiTai) : dangTai(4);
    if (!ds.length) return (loiTai ? loi(loiTai) : "") + rong("Kho phim còn trống", "Bấm + Phim mới, đặt tên và chọn loại. Mỗi loại là một thư mục trong kho.");
    const dangLam = ds.filter((p) => !p.daXuat), daXuat = ds.filter((p) => p.daXuat);
    const nhom = [...loaiDs, { id: "chua-phan-loai", ten: "Chưa phân loại" }].map((l) => {
      const ps = dangLam.filter((p) => p.loai === l.id);
      if (!ps.length && l.id === "chua-phan-loai") return "";
      return `<section class="khoi nhom-phim" aria-labelledby="h-${esc(l.id)}">
        <div class="dau-hang"><h3 class="dau" id="h-${esc(l.id)}"><span class="thu-muc" aria-hidden="true"></span>${esc(l.ten)}</h3><span class="mo">${ps.length} phim đang làm</span></div>
        ${ps.length ? `<div class="luoi-phim">${ps.map(veThe).join("")}</div>` : `<p class="mo">Chưa có phim nào.</p>`}
      </section>`;
    }).join("");
    const xuat = daXuat.length ? `<details class="khoi nhom-phim"><summary><b>Đã xuất</b> <span class="mo">${daXuat.length} phim</span></summary>
      <div class="luoi-phim">${daXuat.map(veThe).join("")}</div></details>` : "";
    return (loiTai ? loi(loiTai) : "") + nhom + xuat;
  }

  async function lam(fn) {
    ban = true; ve();
    try { await fn(); } catch (e) { if (conSong) bao(e.message, true); }
    finally { ban = false; if (conSong) await tai(); }
  }

  goc.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-phim-moi], [data-huy-tao], [data-mo-phim], [data-don-nhap], [data-thu-lai], [data-mau-phan-tich], [data-mau-tao], [data-mau-xoa]");
    if (!t) return;
    if (t.dataset.mauPhanTich) {
      const ma = t.dataset.mauPhanTich;
      return lam(async () => { await ctl("/phim/mau/" + encodeURIComponent(ma) + "/phan-tich", {}); if (conSong) bao("Đã giao Antigravity xem phim mẫu. Thường mất 1–4 phút, trang tự cập nhật."); });
    }
    if (t.dataset.mauTao) {
      taoMau = t.dataset.mauTao; moTao = true; veDau();
      dauKho.scrollIntoView({ block: "start" }); dauKho.querySelector("#fTaoPhim [name=ten]")?.focus();
      return;
    }
    if (t.dataset.mauXoa) {
      const ma = t.dataset.mauXoa, m = mau && mau.ds.find((x) => x.ma === ma);
      if (!confirm(`Bỏ phim mẫu "${m ? m.ten : ma}" khỏi thư viện? Video, khung hình và báo cáo trong kho sẽ bị xoá hẳn (tệp gốc anh chọn trên máy vẫn còn).`)) return;
      return lam(async () => { await ctl("/phim/mau/" + encodeURIComponent(ma) + "/xoa", {}); moBaoCao.delete(ma); if (taoMau === ma) taoMau = null; if (conSong) bao("Đã bỏ phim mẫu."); });
    }
    if (t.hasAttribute("data-thu-lai")) { ds = null; ve(); return tai(); }
    if (t.hasAttribute("data-mo-phim")) { try { localStorage.setItem("tqos-phim", t.dataset.moPhim); } catch {} return; }   // để liên kết tự chuyển trang
    if (t.hasAttribute("data-phim-moi") || t.hasAttribute("data-huy-tao")) {
      moTao = t.hasAttribute("data-phim-moi") ? !moTao : false; taoMau = null; veDau();
      if (moTao) goc.querySelector("#fTaoPhim [name=ten]")?.focus(); else goc.querySelector("[data-phim-moi]")?.focus();
      return;
    }
    const ws = t.dataset.donNhap;
    return lam(async () => {
      const n = await ctl("/phim/don-nhap?workspace=" + encodeURIComponent(ws));
      if (!conSong) return;
      if (!n.tep.length) { bao("Phim này không còn file nháp."); return; }
      const mau = n.tep.slice(0, 8).map((x) => "• " + x.path + " (" + mb(x.byte) + ")").join("\n") + (n.tep.length > 8 ? "\n… và " + (n.tep.length - 8) + " file khác" : "");
      if (!confirm(`Xoá hẳn ${n.tep.length} file nháp, giải phóng ${mb(n.tong)}?\nGiữ lại: bản xuất, take và khung đã chọn, giọng đọc, file gốc (media/raw).\n\n${mau}\n\nKhông khôi phục được.`)) return;
      const r = (await ctl("/phim/don-nhap", { workspace: ws, ma: n.ma })).donNhap;
      if (conSong) bao(`Đã dọn ${r.soTep} file, giải phóng ${mb(r.byte)}.` + (r.conLai ? ` ${r.conLai} file bị khoá chưa xoá được.` : ""));
    });
  });

  // Báo cáo phim mẫu đang mở thì giữ mở qua các lần vẽ lại ("toggle" không nổi bọt: nghe ở pha bắt).
  goc.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d instanceof HTMLDetailsElement && d.dataset.baoCao) { if (d.open) moBaoCao.add(d.dataset.baoCao); else moBaoCao.delete(d.dataset.baoCao); }
  }, true);

  goc.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id === "taiMau") {
      const file = t.files && t.files[0];
      t.value = "";
      if (!file) return;
      if (file.size > 2 * 1024 * 1024 * 1024) { bao("Video tối đa 2 GB.", true); return; }
      taiLenDang = file.name + " (" + mb(file.size) + ")"; ve();
      try {
        // Gửi thẳng tệp (không base64): ctl nhận theo luồng. Content-Type octet-stream là bắt buộc (chống gửi chéo trang).
        const r = await fetch("/ctl/phim/mau/tai-len?ten=" + encodeURIComponent(file.name), { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
        let d = null; try { d = await r.json(); } catch {}
        if (!r.ok || !d || d.ok === false) throw new Error((d && d.error) || "Tải lên lỗi (HTTP " + r.status + ").");
        if (conSong) bao(`Đã thêm phim mẫu "${d.phimMau.ten}". Bấm Phân tích để Antigravity xem.`);
      } catch (err) { if (conSong) bao(err.message, true); }
      finally { taiLenDang = ""; if (conSong) await tai(); }
      return;
    }
    if (!t.dataset.ganLoai || !t.value) return;
    lam(async () => { await ctl("/phim/kho/loai", { workspace: t.dataset.ganLoai, loai: t.value }); if (conSong) bao("Đã gắn loại cho phim."); });
  });

  goc.addEventListener("submit", async (e) => {
    if (e.target.id !== "fTaoPhim") return;
    e.preventDefault();
    const f = e.target, o = (n) => f.querySelector(`[name=${n}]`);
    const ten = o("ten").value.trim(), loai = o("loai").value, yTuong = o("yTuong").value.trim();
    const baoLoi = (el, m) => { f.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid")); el.setAttribute("aria-invalid", "true"); f.querySelector("#loiTaoPhim").textContent = m; el.focus(); };
    if (!ten) return baoLoi(o("ten"), "Đặt tên phim trước khi tạo.");
    if (!loai) return baoLoi(o("loai"), "Chọn loại phim.");
    const nut = f.querySelector("[type=submit]"); nut.disabled = true; nut.textContent = "Đang tạo…";
    try {
      const { phim } = taoMau ? await ctl("/phim/mau/" + encodeURIComponent(taoMau) + "/tao-phim", { ten, loai, yTuong }) : await ctl("/phim/kho", { ten, loai, yTuong });
      taoMau = null;
      if (!conSong) return;
      try { localStorage.setItem("tqos-phim", phim.path); } catch {}
      moTao = false; bao(`Đã tạo phim "${phim.ten}". Mở Kịch bản để viết đề bài.`);
      await tai();
      if (conSong) [...goc.querySelectorAll("a.ten")].find((x) => x.dataset.moPhim === phim.path)?.focus();   // con trỏ về thẻ phim vừa tạo
    } catch (err) {
      if (!conSong) return;
      nut.disabled = false; nut.textContent = "Tạo phim"; baoLoi(o("ten"), err.message);
    }
  });

  const khiHien = () => { if (!document.hidden) tai(); };
  document.addEventListener("visibilitychange", khiHien);
  // OS gọi hàm trả về khi rời khu (app.js: dong = dongKhu); signal lo trường hợp rời trang trước khi mo() xong.
  const dong = () => { conSong = false; clearTimeout(hen); document.removeEventListener("visibilitychange", khiHien); };
  signal?.addEventListener("abort", dong, { once: true });
  ve(); tai();
  return dong;
}
