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
  const anh = (p) => "/ctl/phim/media?workspace=" + encodeURIComponent(p.path) + "&path=" + encodeURIComponent(p.anhBia) + "&v=" + encodeURIComponent(p.capNhat || "");

  async function tai() {
    clearTimeout(hen);
    if (!conSong) return;
    if (!document.hidden) {
      try { const r = await ctl("/phim/du-an"); if (!conSong) return; ds = r.duAn || []; loaiDs = r.loai || []; kho = r.kho || ""; loiTai = ""; }
      catch (e) { if (!conSong) return; loiTai = e.message; }
      if (!ban) ve();
    }
    if (conSong) hen = setTimeout(tai, 30000);
  }

  function veThe(p) {
    const [href, viec] = p.daXuat ? ["#/phim/ban-dung", "Đã xuất xưởng"] : (BUOC[p.choCong] || BUOC[1]);
    const bia = p.anhBia ? `<img src="${esc(anh(p))}" alt="" loading="lazy">` : `<span class="bia-trong" aria-hidden="true">${esc(p.ten.slice(0, 1).toUpperCase())}</span>`;
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

  function veTao() {
    return `<form id="fTaoPhim" class="bieu-mau khoi" novalidate aria-label="Tạo phim mới">
      <label>Tên phim<input class="o" name="ten" maxlength="80" required autocomplete="off" placeholder="Ví dụ: Tín hiệu trở về"></label>
      <label>Loại phim<select class="o" name="loai" required><option value="">Chọn loại…</option>${loaiDs.map((l) => `<option value="${esc(l.id)}">${esc(l.ten)}</option>`).join("")}</select></label>
      <label class="rong-het">Ý tưởng (tuỳ chọn)<textarea class="o" name="yTuong" maxlength="4000" placeholder="Vài câu về nội dung phim. Có thể để trống và viết đề bài sau."></textarea></label>
      <p class="mo rong-het">Lưu vào: ${esc(kho || "kho phim")}\\&lt;loại&gt;\\&lt;tên phim&gt;</p>
      <div class="hang rong-het"><button type="submit" class="nut-chinh">Tạo phim</button><button type="button" class="nut nho" data-huy-tao>Huỷ</button><span class="hong" id="loiTaoPhim" role="alert"></span></div>
    </form>`;
  }

  function ve() {
    if (!ds) { goc.innerHTML = loiTai ? loi(loiTai) : dangTai(4); return; }
    const dau = `<div class="dau-hang"><h2 class="dau">Kho phim</h2><span class="mo">${esc(kho)}</span>
      <button type="button" class="nut-chinh" data-phim-moi aria-expanded="${moTao}">+ Phim mới</button></div>` + (moTao ? veTao() : "");
    if (!ds.length) { goc.innerHTML = (loiTai ? loi(loiTai) : "") + dau + (moTao ? "" : rong("Kho phim còn trống", "Bấm + Phim mới, đặt tên và chọn loại. Mỗi loại là một thư mục trong kho.")); return; }
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
    goc.innerHTML = (loiTai ? loi(loiTai) : "") + dau + nhom + xuat;
    if (ban) goc.querySelectorAll("button, select, input, textarea").forEach((el) => { el.disabled = true; });
  }

  async function lam(fn) {
    ban = true; ve();
    try { await fn(); } catch (e) { if (conSong) bao(e.message, true); }
    finally { ban = false; if (conSong) await tai(); }
  }

  goc.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-phim-moi], [data-huy-tao], [data-mo-phim], [data-don-nhap], [data-thu-lai]");
    if (!t) return;
    if (t.hasAttribute("data-thu-lai")) { ds = null; ve(); return tai(); }
    if (t.hasAttribute("data-mo-phim")) { try { localStorage.setItem("tqos-phim", t.dataset.moPhim); } catch {} return; }   // để liên kết tự chuyển trang
    if (t.hasAttribute("data-phim-moi") || t.hasAttribute("data-huy-tao")) {
      moTao = t.hasAttribute("data-phim-moi") ? !moTao : false; ve();
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

  goc.addEventListener("change", (e) => {
    const t = e.target;
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
      const { phim } = await ctl("/phim/kho", { ten, loai, yTuong });
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
  signal?.addEventListener("abort", () => { conSong = false; clearTimeout(hen); document.removeEventListener("visibilitychange", khiHien); }, { once: true });
  ve(); tai();
}
