// Thế Quân OS (CEO duyệt 21/11/2026): giao diện quản lý văn phòng AI trên máy tính, thay văn phòng 3D (điện thoại giữ 3D).
// Khung: thanh bên + màn chính. Mỗi khu là một mô-đun trong os/khu/, chỉ tải khi mở. Khu chưa viết lại thì nhúng trang cũ.
// Dữ liệu: MỘT kết nối /events (máy chủ đẩy ảnh chụp mỗi giây) dùng chung cho mọi khu; ctl gọi qua /ctl.
// Tab bị ẩn thì đóng luồng /events và các khu ngừng hỏi lại; hiện lại thì nối lại ngay.
import { esc, ctl, bao, icon } from "./ui.js";

// OS-2 (CEO duyệt 21/11/2026): hai xưởng tách hẳn nhau, mỗi xưởng một màu nhận diện (xuong: "code" | "phim");
// "sapCo" là tính năng của xưởng sẽ cập nhật sau, hiện mờ để CEO biết lộ trình, không bấm được.
// Đội ngũ học cách tổ chức của Javis OS (phòng sạch, xem D:\VanPhongAI\os-2\replica): Cộng sự, Việc và lịch chạy, Bộ não, Models và quyền.
const KHU = [
  { id: "", ten: "Tổng quan", icon: "nha", mod: "./khu/tong-quan.js" },
  { id: "tin-nhan", ten: "Tin nhắn", icon: "tin", mod: "./khu/tin-nhan.js" },
  { nhom: "Xưởng code", xuong: "code" },
  { id: "code/du-an", ten: "Dự án", icon: "du_an", mod: "./khu/code-du-an.js", xuong: "code" },
  { id: "code/giao-viec", ten: "Giao việc cho đội", icon: "luong", nhung: "prototype.html", xuong: "code" },
  { id: "code/dieu-khien", ten: "Luồng và bàn giao", icon: "luong", nhung: "dieukhien.html", xuong: "code" },
  { id: "code/skill", ten: "Repo và skill", icon: "skill", nhung: "skill.html", xuong: "code" },
  { id: "code/hop-thu", ten: "Hòm thư", icon: "hop", nhung: "hopthu.html", xuong: "code" },
  { sapCo: "Phát hành một chạm, kiểm CI, xem PR", xuong: "code" },
  { nhom: "Xưởng phim", xuong: "phim" },
  { id: "phim", ten: "Phim và bàn dựng", icon: "phim", mod: "./khu/phim.js", xuong: "phim" },
  { id: "phim/nhan-vat", ten: "Nhân vật", icon: "doi", nhung: "characters.html", xuong: "phim" },
  { id: "phim/xuong-cu", ten: "Trạm phim (bản cũ)", icon: "phim", nhung: "xuong-phim.html", xuong: "phim" },
  { sapCo: "Kịch bản, phân cảnh, lồng tiếng, xuất bản phim", xuong: "phim" },
  { nhom: "Đội ngũ" },
  { id: "doi/cong-su", ten: "Cộng sự và team", icon: "doi", mod: "./khu/cong-su.js" },
  { id: "doi/viec", ten: "Việc và lịch chạy", icon: "lich", mod: "./khu/viec.js" },
  { id: "doi/bo-nao", ten: "Bộ não chung", icon: "nao", mod: "./khu/bo-nao.js" },
  { id: "doi/hieu-suat", ten: "Hiệu suất", icon: "doi", nhung: "hieusuat.html" },
  { id: "doi/noi-quy", ten: "Nội quy", icon: "luat", nhung: "noiquy.html" },
  { nhom: "Hệ thống" },
  { id: "he/models", ten: "Models và quyền", icon: "khoa", mod: "./khu/models.js" },
  { id: "he/ket-noi", ten: "Kết nối", icon: "noi", nhung: "ket-noi.html" },
  { id: "he/dien-thoai", ten: "Điện thoại", icon: "dt", nhung: "dien-thoai.html" },
  { id: "he/cap-nhat", ten: "Cập nhật", icon: "moi", nhung: "cap-nhat.html" },
];

// ---------- kho dữ liệu dùng chung ----------
const nghe = new Set();
const kho = {
  state: null, loiState: "", duAn: null, dsDuAn: [],
  on(fn) { nghe.add(fn); return () => nghe.delete(fn); },
  bao() { for (const fn of nghe) { try { fn(kho); } catch (e) { console.error(e); } } },
};
let es = null, henPoll = null, chuKy = "";
function noiState() {
  if (es || document.hidden) return;
  if (!("EventSource" in window)) return pollState();
  es = new EventSource("events");
  es.onmessage = (m) => {
    let s; try { s = JSON.parse(m.data); } catch { return; }
    // Chỉ báo các khu khi có gì đổi (tin mới, trạng thái AI, việc cần anh, cảnh báo): đỡ vẽ lại mỗi giây.
    const ky = [s.events.length, s.events.at(-1)?.t, (s.asks || []).length, (s.alerts || []).length, s.agents.map((a) => a.status + (a.lastTextAt || "")).join(","), s.sys && s.sys.cFreeGB].join("|");
    kho.state = s; kho.loiState = "";
    trangThaiMay();
    if (ky !== chuKy) { chuKy = ky; kho.bao(); }
  };
  es.onerror = () => { if (es && es.readyState === EventSource.CLOSED) { es = null; kho.loiState = "Mất kết nối máy chủ văn phòng. Đang thử lại…"; trangThaiMay(); kho.bao(); setTimeout(noiState, 4000); } };
}
async function pollState() {
  clearTimeout(henPoll);
  if (document.hidden) return;
  try { const r = await fetch("state", { cache: "no-store" }); kho.state = await r.json(); kho.loiState = ""; }
  catch { kho.loiState = "Mất kết nối máy chủ văn phòng."; }
  trangThaiMay(); kho.bao(); henPoll = setTimeout(pollState, 5000);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (es) { es.close(); es = null; } clearTimeout(henPoll); }
  else noiState();
});
function trangThaiMay() {
  const el = document.getElementById("trangThaiMay");
  if (kho.loiState) { el.textContent = kho.loiState; el.className = "hong"; return; }
  const s = kho.state; if (!s) return;
  const dang = s.agents.filter((a) => a.platform !== "human" && a.status === "active").length;
  el.className = "mo";
  el.textContent = (dang ? dang + " AI đang làm" : "Không AI nào đang làm") + (s.sys && s.sys.cFreeGB != null ? ", ổ " + s.sys.diskLabel + " còn " + s.sys.cFreeGB + " GB" : "");
}

// ---------- dự án đang làm ----------
async function taiDuAn() {
  const sel = document.getElementById("chonDuAn");
  try {
    const d = await ctl("/workspaces");
    kho.dsDuAn = d.workspaces || [];
    kho.duAn = (d.active && d.active.path) || (kho.dsDuAn.find((w) => w.active) || {}).path || (kho.dsDuAn[0] || {}).path || null;
    sel.innerHTML = kho.dsDuAn.length ? kho.dsDuAn.map((w) => `<option value="${esc(w.path)}"${w.path === kho.duAn ? " selected" : ""}>${esc(w.name || w.path.split(/[\\/]/).pop())}</option>`).join("")
      : `<option value="">Chưa có dự án</option>`;
  } catch (e) { sel.innerHTML = `<option value="">Chưa nối ctl</option>`; kho.duAn = null; }
  kho.bao();
}
document.getElementById("chonDuAn").addEventListener("change", async (e) => {
  const p = e.target.value; if (!p) return;
  try { await ctl("/workspaces/switch", { path: p }); kho.duAn = p; bao("Đã chuyển dự án."); kho.bao(); }
  catch (err) { bao(err.message, true); taiDuAn(); }
});

// ---------- nền sáng/tối ----------
const nutNen = document.getElementById("doiNen");
const veNutNen = () => { const sang = document.documentElement.dataset.theme === "light"; nutNen.textContent = sang ? "Nền tối" : "Nền sáng"; nutNen.setAttribute("aria-pressed", String(sang)); };
nutNen.addEventListener("click", () => {
  const moi = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = moi; try { localStorage.setItem("tqos-theme", moi); } catch {}
  veNutNen();
});
veNutNen();

// ---------- thanh bên và định tuyến ----------
const os = document.getElementById("os"), nutMenu = document.getElementById("moMenu");
const datBen = (mo) => { os.classList.toggle("mo-ben", mo); nutMenu.setAttribute("aria-expanded", String(mo)); };
nutMenu.addEventListener("click", (e) => { e.stopPropagation(); datBen(!os.classList.contains("mo-ben")); });
// Khổ hẹp: bấm ra ngoài thanh bên hoặc nhấn Esc thì gập lại.
document.querySelector(".chinh").addEventListener("click", () => { if (os.classList.contains("mo-ben")) datBen(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && os.classList.contains("mo-ben")) { datBen(false); nutMenu.focus(); } });
const xuongCua = (k) => (k.xuong ? ` data-xuong="${esc(k.xuong)}"` : "");
document.getElementById("dsKhu").innerHTML = KHU.map((k) => k.nhom ? `<div class="nhom"${xuongCua(k)}>${esc(k.nhom)}</div>`
  : k.sapCo ? `<div class="sap-co"${xuongCua(k)}><span>Sắp có</span>${esc(k.sapCo)}</div>`
  : `<a class="muc" href="#/${k.id}" data-khu="${esc(k.id)}"${xuongCua(k)}>${icon(k.icon)}<span>${esc(k.ten)}</span>${k.id === "" ? '<span class="dem" id="demCanAnh" hidden></span>' : ""}</a>`).join("");

// Số việc cần anh trên mục Tổng quan (từ máy chủ, không đoán).
kho.on((k) => { const n = k.state ? (k.state.asks || []).length : 0; const el = document.getElementById("demCanAnh"); el.hidden = !n; el.textContent = n; });

let dong = null, phien = 0;
async function moKhu() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("?")[0];
  const k = KHU.find((x) => x.id !== undefined && x.id === id) || KHU[0];
  document.querySelectorAll(".thanh-ben a.muc").forEach((a) => { if (a.dataset.khu === k.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  // Tiêu đề ghi rõ đang ở xưởng nào (CEO: "trong đấy ghi rõ xưởng phim và xưởng code").
  document.getElementById("tieuDe").innerHTML = (k.xuong ? `<span class="nhan-xuong" data-xuong="${esc(k.xuong)}">Xưởng ${k.xuong === "code" ? "code" : "phim"}</span>` : "") + esc(k.ten);
  document.title = k.ten + " · Thế Quân OS";
  os.classList.remove("mo-ben"); nutMenu.setAttribute("aria-expanded", "false");
  if (dong) { try { dong(); } catch {} dong = null; }
  const vung = document.getElementById("vung"), mine = ++phien;
  document.querySelector(".chinh").scrollTop = 0;   // khu mới mở từ đầu, không giữ chỗ cuộn của khu trước
  if (k.nhung) {
    vung.innerHTML = `<div class="nhung"><iframe src="${esc(k.nhung)}" title="${esc(k.ten)}"></iframe></div>`;
    return;
  }
  vung.innerHTML = `<div class="vung"><div class="dang-tai" aria-label="Đang tải"><i></i><i></i><i></i></div></div>`;
  try {
    const m = await import(k.mod);
    if (mine !== phien) return;
    vung.innerHTML = "";
    dong = (await m.mo(vung, { kho, ctl, bao })) || null;
  } catch (e) {
    if (mine !== phien) return;
    vung.innerHTML = `<div class="vung"><div class="loi" role="alert"><span>Không mở được khu ${esc(k.ten)}: ${esc(e.message)}</span></div></div>`;
  }
}
window.addEventListener("hashchange", moKhu);

noiState();
taiDuAn();
moKhu();
