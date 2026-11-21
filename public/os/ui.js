// Tiện ích dùng chung của Thế Quân OS: thoát HTML, giờ tương đối, gọi ctl, bốn trạng thái vùng dữ liệu, biểu tượng.
// Không thư viện ngoài. Mọi chuỗi từ máy chủ đều qua esc() trước khi vào innerHTML.

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const cat = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export function luc(t) {
  if (!t) return "";
  const d = new Date(t), s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return "vừa xong";
  if (s < 3600) return Math.round(s / 60) + " phút trước";
  if (s < 86400 && new Date().getDate() === d.getDate()) return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}
export const usd = (x) => "$" + (Math.round((Number(x) || 0) * 100) / 100).toFixed(2);

// Gọi OS Controller qua /ctl (chỉ trên chính máy này). Lỗi trả về thông điệp tiếng Việt đọc được.
export async function ctl(p, body, { timeout = 60000 } = {}) {
  let r;
  try {
    r = await fetch("/ctl" + p, { cache: "no-store", method: body === undefined ? "GET" : "POST", signal: AbortSignal.timeout(timeout),
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  } catch (e) { throw Object.assign(new Error(e.name === "TimeoutError" ? "Bộ điều khiển trả lời quá lâu." : "Không nối được bộ điều khiển (ctl). Kiểm tra văn phòng đang chạy."), { code: "CTL_OFFLINE" }); }
  let d = null; try { d = await r.json(); } catch {}
  if (!d) throw Object.assign(new Error("Bộ điều khiển trả dữ liệu lạ (HTTP " + r.status + ")."), { code: "BAD_JSON" });
  if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error || "Lỗi HTTP " + r.status), { code: d.code, status: r.status });
  return d;
}

// Bốn trạng thái của một vùng dữ liệu.
export const dangTai = (dong = 3) => `<div class="dang-tai" aria-label="Đang tải">${"<i></i>".repeat(dong)}</div>`;
export const rong = (tieu, moTa, nut = "") => `<div class="rong"><b>${esc(tieu)}</b><span class="mo">${esc(moTa)}</span>${nut}</div>`;
export const loi = (thongDiep, nutThuLai = true) => `<div class="loi" role="alert"><span>${esc(thongDiep)}</span>${nutThuLai ? '<button type="button" class="nut nho" data-thu-lai>Thử lại</button>' : ""}</div>`;

// Tên hiển thị của các phòng (khóa giống ctl/chat.js PEOPLE) và nền tảng AI chạy phòng đó.
export const PHONG = {
  pain: { ten: "Pain", vai: "Điều hành", nen: "claude" },
  hinata: { ten: "Hinata", vai: "Đặc tả và thiết kế", nen: "antigravity" },
  itachi: { ten: "Itachi", vai: "Kiến trúc (Sol)", nen: "codex" },
  sasuke: { ten: "Sasuke", vai: "Lập trình (Astra)", nen: "codex" },
  kakashi: { ten: "Kakashi", vai: "Giao diện", nen: "antigravity" },
  sakura: { ten: "Sakura", vai: "Kiểm duyệt (Claude)", nen: "claude" },
};
export const chuDau = (ten) => esc(String(ten || "?").trim().slice(0, 2));

// Biểu tượng nét mảnh, vẽ bằng SVG nội tuyến (không tải bộ icon ngoài).
const P = {
  nha: "M3 11l9-7 9 7M5 10v10h14V10",
  tin: "M4 5h16v11H8l-4 4z",
  luong: "M5 4l14 8-14 8z",
  du_an: "M3 6h7l2 2h9v11H3z",
  hop: "M3 7l9 6 9-6M3 7v11h18V7z",
  skill: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  phim: "M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4",
  doi: "M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5",
  luat: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  noi: "M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0zM12 16v5",
  moi: "M4 12a8 8 0 0114-5l2-2v6h-6l2-2a5 5 0 10.9 6",
  dt: "M8 2h8v20H8zM11 18h2",
};
export const icon = (ten) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[ten] || P.nha}"/></svg>`;

// Thông báo nhỏ góc dưới.
let henBao = null;
export function bao(text, laLoi = false) {
  const b = document.getElementById("bao");
  if (!b) return;
  // Hộp rỗng thì CSS ẩn (.bao:empty); có chữ thì hiện, mờ dần vào bằng @starting-style.
  b.textContent = text; b.classList.toggle("loi-bao", !!laLoi);
  clearTimeout(henBao); henBao = setTimeout(() => { b.textContent = ""; }, laLoi ? 7000 : 3500);
}
