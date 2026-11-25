// Thế Quân OS (CEO duyệt 21/11/2026): giao diện quản lý văn phòng AI trên máy tính, thay văn phòng 3D (điện thoại giữ 3D).
// Khung: thanh bên + màn chính. Mỗi khu là một mô-đun trong os/khu/, chỉ tải khi mở. Khu chưa viết lại thì nhúng trang cũ.
// Dữ liệu: MỘT kết nối /events (máy chủ đẩy ảnh chụp mỗi giây) dùng chung cho mọi khu; ctl gọi qua /ctl.
// Tab bị ẩn thì đóng luồng /events và các khu ngừng hỏi lại; hiện lại thì nối lại ngay.
import { esc, ctl, bao, icon } from "./ui.js";
import { taoNgan } from "./ngan.js";

// OS-2 (CEO duyệt 21/11/2026): hai xưởng tách hẳn nhau, mỗi xưởng một màu nhận diện (xuong: "code" | "phim");
// "sapCo" là tính năng của xưởng sẽ cập nhật sau, hiện mờ để CEO biết lộ trình, không bấm được.
// Đội ngũ học cách tổ chức của Javis OS (phòng sạch): Cộng sự, Việc và lịch chạy, Bộ não, Models và quyền.
// OS-3 (CEO cấp FORCE_OVERRIDE 22/11/2026): "xem ở đâu, xử lý ngay ở đó". Giao việc và Luồng và bàn giao thành khu gốc;
// thanh bên chỉ giữ khu gốc, trang cũ còn lại gom vào mục "Công cụ cũ" (mảng CU, đường dẫn cũ vẫn mở được).
const KHU = [
  { id: "", ten: "Tổng quan", icon: "nha", mod: "./khu/tong-quan.js" },
  { id: "tin-nhan", ten: "Tin nhắn", icon: "tin", mod: "./khu/tin-nhan.js" },
  { nhom: "Xưởng code", xuong: "code" },
  { id: "code/du-an", ten: "Dự án", icon: "du_an", mod: "./khu/code-du-an.js", xuong: "code" },
  { id: "code/giao-viec", ten: "Giao việc cho đội", icon: "giao", mod: "./khu/giao-viec.js", xuong: "code" },
  { id: "code/dieu-khien", ten: "Luồng và bàn giao", icon: "luong", mod: "./khu/luong.js", xuong: "code" },
  { id: "code/pr", ten: "Xem PR", icon: "pr", mod: "./khu/code-pr.js", xuong: "code" },
  { nhom: "Xưởng phim", xuong: "phim" },
  { id: "phim", ten: "Kịch bản và giọng đọc", icon: "luat", mod: "./khu/phim.js", xuong: "phim" },
  { id: "phim/canh", ten: "Phân cảnh và quay", icon: "canh", mod: "./khu/phim-canh.js", xuong: "phim" },
  { id: "phim/ban-dung", ten: "Bàn dựng và xuất xưởng", icon: "xuat", mod: "./khu/phim-ban-dung.js", xuong: "phim" },
  { nhom: "Đội ngũ" },
  { id: "doi/cong-su", ten: "Cộng sự và team", icon: "doi", mod: "./khu/cong-su.js" },
  { id: "doi/viec", ten: "Việc và lịch chạy", icon: "lich", mod: "./khu/viec.js" },
  { id: "doi/bo-nao", ten: "Bộ não chung", icon: "nao", mod: "./khu/bo-nao.js" },
  { nhom: "Hệ thống" },
  { id: "he/models", ten: "Models và quyền", icon: "khoa", mod: "./khu/models.js" },
  { id: "cu", ten: "Công cụ cũ", icon: "hop", mod: "./khu/cong-cu-cu.js" },
];
// Công cụ cũ: trang chưa viết lại, không lên thanh bên; mở từ khu Công cụ cũ hoặc đường dẫn cũ (#/code/skill…).
// nhomCu: nhóm hiển thị trong khu Công cụ cũ; xuong giữ nhãn xưởng trên tiêu đề khi mở.
const CU = [
  { id: "cu/bang-dieu-phoi", ten: "Bảng điều phối (bản cũ)", icon: "luong", nhung: "prototype.html", nhomCu: "code", xuong: "code", moTa: "Ý tưởng giao Hinata đặc tả, làm lượt trên ChatGPT web khi hết hạn mức, xem diff từng lượt, biên bản hội chẩn." },
  { id: "cu/dieu-khien-may", ten: "Điều khiển máy (bản cũ)", icon: "khoa", nhung: "dieukhien.html", nhomCu: "code", xuong: "code", moTa: "Chạy tay từng lượt, lệnh trong danh sách cho phép, duyệt file, CPU và RAM." },
  { id: "code/skill", ten: "Repo và skill", icon: "skill", nhung: "skill.html", nhomCu: "code", xuong: "code", moTa: "Bộ skill mặc định của đội, duyệt skill mới từ link GitHub." },
  { id: "code/hop-thu", ten: "Hòm thư", icon: "hop", nhung: "hopthu.html", nhomCu: "code", xuong: "code", moTa: "Thư giao việc và trả lời giữa các AI." },
  { id: "phim/nhan-vat", ten: "Nhân vật", icon: "doi", nhung: "characters.html", nhomCu: "phim", xuong: "phim", moTa: "Nhân vật 3D của văn phòng và yêu cầu chỉnh tạo hình." },
  { id: "phim/xuong-cu", ten: "Trạm phim (bản cũ)", icon: "phim", nhung: "xuong-phim.html", nhomCu: "phim", xuong: "phim", moTa: "Trạm phim trước khi có Phim và bàn dựng." },
  { id: "doi/hieu-suat", ten: "Hiệu suất", icon: "doi", nhung: "hieusuat.html", nhomCu: "doi", moTa: "Số lượt, thời gian và chi phí của từng AI." },
  { id: "doi/noi-quy", ten: "Nội quy", icon: "luat", nhung: "noiquy.html", nhomCu: "doi", moTa: "Nội quy chung của văn phòng cho mọi AI." },
  { id: "he/ket-noi", ten: "Kết nối", icon: "noi", nhung: "ket-noi.html", nhomCu: "he", moTa: "Đăng nhập CLI Claude, Codex, Antigravity và các dịch vụ." },
  { id: "he/dien-thoai", ten: "Điện thoại", icon: "dt", nhung: "dien-thoai.html", nhomCu: "he", moTa: "Mở văn phòng trên điện thoại, điều khiển từ xa." },
  { id: "he/cap-nhat", ten: "Cập nhật", icon: "moi", nhung: "cap-nhat.html", nhomCu: "he", moTa: "Cập nhật app lên bản phát hành mới, quay lại bản trước." },
];

// ---------- kho dữ liệu dùng chung ----------
const nghe = new Set();
const kho = {
  state: null, loiState: "", duAn: null, dsDuAn: [],
  on(fn) { nghe.add(fn); return () => nghe.delete(fn); },
  taiLaiDuAn: () => taiDuAn(),   // khu Giao việc gọi sau khi mở repo GitHub mới
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
let henDuAn = null;
async function taiDuAn() {
  const sel = document.getElementById("chonDuAn");
  try {
    const d = await ctl("/workspaces");
    kho.dsDuAn = d.workspaces || [];
    kho.duAn = (d.active && d.active.path) || (kho.dsDuAn.find((w) => w.active) || {}).path || (kho.dsDuAn[0] || {}).path || null;
    sel.innerHTML = kho.dsDuAn.length ? kho.dsDuAn.map((w) => `<option value="${esc(w.path)}"${w.path === kho.duAn ? " selected" : ""}>${esc(w.name || w.path.split(/[\\/]/).pop())}</option>`).join("")
      : `<option value="">Chưa có dự án</option>`;
  } catch (e) {
    sel.innerHTML = `<option value="">Chưa nối ctl</option>`; kho.duAn = null;
    // ctl có thể bật sau văn phòng (hoặc vừa khởi động lại): thử lại thay vì giữ "Chưa nối ctl" tới khi tải lại trang.
    clearTimeout(henDuAn); henDuAn = setTimeout(taiDuAn, 8000);
  }
  kho.bao();
}
document.getElementById("chonDuAn").addEventListener("change", async (e) => {
  const p = e.target.value; if (!p) return;
  try { await ctl("/workspaces/switch", { path: p }); kho.duAn = p; bao("Đã chuyển dự án."); kho.bao(); }
  catch (err) { bao(err.message, true); taiDuAn(); }
});

// ---------- nền sáng/tối ----------
const nutNen = document.getElementById("doiNen");
// Nút bật/tắt: nhãn cố định "Nền sáng", aria-pressed cho biết đang bật hay không (đổi nhãn kèm aria-pressed thì trình đọc màn hình nói ngược nghĩa).
const veNutNen = () => { const sang = document.documentElement.dataset.theme === "light"; nutNen.textContent = "Nền sáng"; nutNen.setAttribute("aria-pressed", String(sang)); };
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

// Ngăn trượt dùng chung (OS-3): các khu mở việc tại chỗ bằng ngan.mo("luong:<id>" | "ban-giao:<id>" | "lenh:<id>", nút đã bấm).
const ngan = taoNgan({ ctl, bao });

let dong = null, phien = 0;
async function moKhu() {
  const [id, truyVan = ""] = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("?");
  const cu = CU.find((x) => x.id === id);
  const k = cu || KHU.find((x) => x.id !== undefined && x.id === id) || KHU[0];
  // Công cụ cũ không có mục riêng trên thanh bên: sáng mục "Công cụ cũ".
  const sang = cu ? "cu" : k.id;
  document.querySelectorAll(".thanh-ben a.muc").forEach((a) => { if (a.dataset.khu === sang) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  ngan.dong();
  // Tiêu đề ghi rõ đang ở xưởng nào (CEO: "trong đấy ghi rõ xưởng phim và xưởng code").
  document.getElementById("tieuDe").innerHTML = (k.xuong ? `<span class="nhan-xuong" data-xuong="${esc(k.xuong)}">Xưởng ${k.xuong === "code" ? "code" : "phim"}</span>` : "")
    + (cu ? `<a class="ve-cu" href="#/cu">Công cụ cũ</a><span class="mo" aria-hidden="true"> / </span>` : "") + esc(k.ten);
  document.title = k.ten + " · Thế Quân OS";
  os.classList.remove("mo-ben"); nutMenu.setAttribute("aria-expanded", "false");
  if (dong) { try { dong(); } catch {} dong = null; }
  const vung = document.getElementById("vung"), mine = ++phien;
  window.scrollTo(0, 0);
  document.querySelector(".chinh").scrollTop = 0;   // khu mới mở từ đầu, không giữ chỗ cuộn của khu trước
  if (k.nhung) {
    vung.innerHTML = `<div class="nhung"><iframe src="${esc(k.nhung)}" title="${esc(k.ten)}"></iframe></div>`;
    return;
  }
  vung.innerHTML = `<div class="vung"><div class="dang-tai" aria-label="Đang tải"><i></i><i></i><i></i></div></div>`;
  try {
    const m = await import(k.mod);
    if (mine !== phien) return;
    // Mỗi lần mở khu dùng một khung con MỚI: khu gắn bộ nghe sự kiện lên khung được giao, nên khung cũ bị thay là bộ nghe
    // cũ đi theo. (Trước đây giao thẳng #vung — phần tử sống suốt phiên — nên đổi khu vài lần thì một cú bấm Lưu chạy vài lần.)
    const khung = document.createElement("div");
    khung.className = "khung-khu";
    vung.replaceChildren(khung);
    // Hủy vòng đời khu ngay khi rời trang, kể cả khi lần tải đầu chưa xong.
    const vongDoi = new AbortController();
    const { signal } = vongDoi;
    dong = () => vongDoi.abort();
    const dongKhu = await m.mo(khung, { kho, ctl, bao, ngan, congCuCu: CU, signal });
    // Khu tải chậm có thể mở xong sau khi người dùng đã chuyển trang.
    if (mine !== phien) { dongKhu?.(); return; }
    dong = dongKhu || null;
    // Đường dẫn #/<khu>?mo=luong:<id> mở thẳng ngăn của việc đó (rồi bỏ ?mo khỏi địa chỉ để tải lại không mở lại).
    const moNgay = new URLSearchParams(truyVan).get("mo");
    if (moNgay) { history.replaceState(null, "", "#/" + id); ngan.mo(moNgay); }
  } catch (e) {
    if (mine !== phien) return;
    vung.innerHTML = `<div class="vung"><div class="loi" role="alert"><span>Không mở được khu ${esc(k.ten)}: ${esc(e.message)}</span></div></div>`;
  }
}
window.addEventListener("hashchange", moKhu);

noiState();
taiDuAn();
moKhu();
