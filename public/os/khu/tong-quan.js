// Khu Tổng quan: hàng việc cần anh (chữ ký của màn: khung góc), đội AI đang làm gì, luồng tự chạy, hạn mức, máy.
// Việc cần anh gộp ba nguồn thật: câu hỏi/yêu cầu phát hiện trong nhật ký phiên (/state asks), bàn giao chờ duyệt (ctl /handoffs),
// luồng tự chạy đang chờ anh (ctl /autopilot). Không có số nào tự đặt ra.
// OS-3: bấm Duyệt, Trả lời hay Xem thì mở ngăn trượt ngay tại Tổng quan, không chuyển sang trang Luồng.
import { esc, cat, luc, dangTai, rong, loi, ctl } from "../ui.js";
import { TT_LUONG, LUONG_CAN_ANH, LUONG_CHO, tenVai, cauHoi, tomTatGiaiThich } from "../viec-chung.js";

const CHO_ANH = new Set([...LUONG_CAN_ANH, ...LUONG_CHO]);
const TT_AI = { active: ["đang làm", "song"], idle: ["rảnh", "phu"], away: ["vắng", "mo"] };
const NEN = { claude: "Claude", codex: "Codex", antigravity: "Antigravity", gemini: "Gemini", human: "Người" };

export async function mo(vung, { kho, ngan, signal }) {
  vung.innerHTML = `<div class="vung">
    <div class="luoi-2">
      <section class="khung-goc" aria-labelledby="hCanAnh"><div style="display:flex;flex-direction:column;gap:var(--space-sm)">
        <div class="dau-hang"><h2 class="dau" id="hCanAnh">Việc cần anh</h2><span class="mo" id="soCanAnh"></span></div>
        <div id="canAnh">${dangTai(4)}</div></div></section>
      <section class="khoi" aria-labelledby="hHanMuc"><div class="dau-hang"><h2 class="dau" id="hHanMuc">Hạn mức AI</h2><span class="mo" id="lucHanMuc"></span></div><div id="hanMuc">${dangTai(3)}</div></section>
    </div>
    <section class="khoi" aria-labelledby="hPhim"><div class="dau-hang"><h2 class="dau" id="hPhim">Phim đang làm</h2><a class="nut nho" href="#/phim/kho">Kho phim</a></div><div id="phimDangLam">${dangTai(2)}</div></section>
    <section class="khoi" aria-labelledby="hDoi"><h2 class="dau" id="hDoi">Đội AI</h2><div id="doi" class="bang-cuon">${dangTai(4)}</div></section>
    <div class="luoi-2">
      <section class="khoi" aria-labelledby="hLuong"><h2 class="dau" id="hLuong">Luồng tự chạy gần đây</h2><div id="luong">${dangTai(3)}</div></section>
      <section class="khoi" aria-labelledby="hMay"><h2 class="dau" id="hMay">Máy</h2><div id="may">${dangTai(2)}</div></section>
    </div>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let handoffs = null, runs = null, loiCtl = "", hen = null, conSong = true, phien = 0;

  async function taiCtl() {
    clearTimeout(hen);
    if (!conSong) return;
    const mine = ++phien;
    if (!document.hidden) {
      const [h, a, q, ph] = await Promise.allSettled([ctl("/handoffs?scope=manual"), ctl("/autopilot"), ctl("/quotas"), ctl("/phim/du-an")]);
      if (!conSong || mine !== phien) return;
      handoffs = h.status === "fulfilled" ? h.value.handoffs || [] : null;
      runs = a.status === "fulfilled" ? a.value.runs || [] : null;
      loiCtl = [h, a].find((x) => x.status === "rejected")?.reason?.message || "";
      veHanMuc(q.status === "fulfilled" ? q.value : null, q.status === "rejected" ? q.reason.message : "");
      veCanAnh(); veLuong(); vePhim(ph.status === "fulfilled" ? ph.value : null, ph.status === "rejected" ? ph.reason.message : "");
    }
    if (!conSong || mine !== phien) return;
    hen = setTimeout(taiCtl, 15000);
  }

  function veCanAnh() {
    const s = kho.state, ten = (k) => (s && s.agents.find((a) => a.key === k) || {}).name || k || "AI";
    if (!s && !handoffs && !runs) { $("canAnh").innerHTML = kho.loiState ? loi(kho.loiState, false) : dangTai(4); return; }
    const bay = Date.now(), muc = [];
    for (const a of (s && s.asks) || []) muc.push({ sap: a.since || 0, t: a.since, tieu: cat(a.text, 220), nguon: ten(a.who) + (a.guess ? " (máy đoán từ câu cuối)" : ""), nut: `<a class="nut nho" href="#/tin-nhan?ai=${encodeURIComponent(a.who || "")}">Xem tin</a>` });
    const nutNgan = (ref, chu, tieu, chinh = false) => `<button type="button" class="${chinh ? "nut-chinh" : "nut nho"}" data-ngan="${esc(ref)}" aria-label="${esc(chu + ": " + cat(tieu, 80))}">${esc(chu)}</button>`;
    (handoffs || []).forEach((h, idx) => { const p = h.payload || {}, tieu = cat(tomTatGiaiThich(p.giai_thich) || p.tom_tat || h.summary || "Bàn giao chờ duyệt", 220);
      const t = h.createdAt || h.created_at || h.decided_at || 0;
      muc.push({ sap: t || (bay - idx), t, tieu, nguon: "Bàn giao của " + tenVai(h.role || p.vai) + (h.next_owner || p.next_owner ? " cho " + tenVai(h.next_owner || p.next_owner) : ""), nut: nutNgan("ban-giao:" + h.job_id, p.ask_ceo ? "Trả lời" : "Duyệt", tieu) }); });
    for (const r of runs || []) if (CHO_ANH.has(r.status)) { const tieu = cat(cauHoi(r) || r.task, 220);
      muc.push({ sap: r.updatedAt || 0, t: r.updatedAt, tieu, nguon: "Luồng tự chạy: " + TT_LUONG[r.status], nut: nutNgan("luong:" + r.id, r.status === "awaiting_answer" ? "Trả lời" : "Mở", tieu, true) }); }
    muc.sort((x, y) => (y.sap || 0) - (x.sap || 0));
    $("soCanAnh").textContent = muc.length ? muc.length + " việc" : "";
    $("canAnh").innerHTML = (loiCtl ? loi("Chưa đọc được bàn giao và luồng: " + loiCtl) : "") + (muc.length
      ? muc.map((m) => `<div class="dong"><div><div class="tieu">${esc(m.tieu)}</div><div class="chi-tiet">${esc(m.nguon)}${m.t ? ", " + esc(luc(m.t)) : ""}</div></div>${m.nut}</div>`).join("")
      : rong("Không có việc nào chờ anh", "Câu hỏi của AI, bàn giao chờ duyệt và luồng cần anh trả lời sẽ hiện ở đây.", `<a class="nut" href="#/code/giao-viec">Giao việc mới</a>`));
  }

  // Phim đang làm (chưa qua Cổng 4), mới nhất trước; bấm để mở đúng bước. Đủ danh sách và nhóm theo loại ở Kho phim.
  const BUOC_PHIM = { 1: ["#/phim", "chờ Cổng 1 · kịch bản"], 2: ["#/phim/canh", "chờ Cổng 2 · phân cảnh"], 3: ["#/phim/ban-dung", "chờ Cổng 3 · bản dựng"], 4: ["#/phim/ban-dung", "chờ Cổng 4 · xuất xưởng"] };
  function vePhim(r, loiPhim) {
    if (!r) { $("phimDangLam").innerHTML = loiPhim ? loi("Chưa đọc được kho phim: " + loiPhim) : dangTai(2); return; }
    const tenLoai = Object.fromEntries((r.loai || []).map((l) => [l.id, l.ten]));
    const ds = (r.duAn || []).filter((p) => !p.daXuat).sort((x, y) => String(y.capNhat || "").localeCompare(String(x.capNhat || ""))).slice(0, 6);
    $("phimDangLam").innerHTML = ds.length ? ds.map((p) => { const [href, viec] = BUOC_PHIM[p.choCong] || BUOC_PHIM[1];
      return `<div class="dong"><div><div class="tieu">${esc(p.ten)}</div><div class="chi-tiet">${esc(tenLoai[p.loai] || "Chưa phân loại")} · ${esc(viec)} · ${p.soCanh} cảnh${p.capNhat ? ", " + esc(luc(p.capNhat)) : ""}</div></div>` +
        `<a class="nut nho" href="${href}" data-mo-phim="${esc(p.path)}" aria-label="Mở phim ${esc(p.ten)}">Mở</a></div>`; }).join("")
      : rong("Không có phim nào đang làm", "Tạo phim mới ở Kho phim: đặt tên, chọn loại.", `<a class="nut" href="#/phim/kho">Mở Kho phim</a>`);
  }
  vung.addEventListener("click", (e) => { const a = e.target.closest("[data-mo-phim]"); if (a) { try { localStorage.setItem("tqos-phim", a.dataset.moPhim); } catch {} } });

  function veDoi() {
    const s = kho.state;
    if (!s) { $("doi").innerHTML = kho.loiState ? loi(kho.loiState, false) : dangTai(4); return; }
    const ds = s.agents.filter((a) => a.platform !== "human");
    if (!ds.length) { $("doi").innerHTML = rong("Chưa thấy AI nào làm việc", "Văn phòng đọc nhật ký phiên của Claude, Codex và Antigravity; khi một AI chạy, nó hiện ở đây."); return; }
    ds.sort((x, y) => (x.status === "active" ? 0 : 1) - (y.status === "active" ? 0 : 1) || (y.lastTextAt || 0) - (x.lastTextAt || 0));
    $("doi").innerHTML = `<table class="bang"><thead><tr><th>AI</th><th>Nền</th><th>Trạng thái</th><th>Vừa nói</th><th class="so">Lúc</th></tr></thead><tbody>` +
      ds.map((a) => { const [nhan, lop] = TT_AI[a.status] || [a.status, "mo"]; return `<tr><td><b>${esc(a.name)}</b><div class="mo">${esc(a.role || "")}</div></td><td>${esc(NEN[a.platform] || a.platform)}</td>` +
        `<td class="${lop}">${esc(nhan)}${a.flag === "blocked" ? ' <span class="hong">bị chặn</span>' : ""}</td><td class="phu">${esc(cat(a.lastText, 140))}</td><td class="so mo">${esc(luc(a.lastTextAt))}</td></tr>`; }).join("") + `</tbody></table>`;
  }

  function veLuong() {
    if (runs === null) { $("luong").innerHTML = loiCtl ? loi(loiCtl) : dangTai(3); return; }
    const ds = runs.slice().sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).slice(0, 6);
    $("luong").innerHTML = ds.length ? ds.map((r) => `<div class="dong"><div><div class="tieu">${esc(cat(r.task, 160))}</div><div class="chi-tiet">${esc((r.workspace || "").split(/[\\/]/).pop())}, ${r.steps ? r.steps.length : 0} lượt, ${esc(luc(r.updatedAt))}</div></div>` +
      `<div class="hang"><span class="${CHO_ANH.has(r.status) ? "canh-bao" : r.status === "running" ? "song" : "mo"}">${esc(TT_LUONG[r.status] || r.status)}</span><button type="button" class="nut nho" data-ngan="luong:${esc(r.id)}" aria-label="Xem luồng: ${esc(cat(r.task, 60))}">Xem</button></div></div>`).join("")
      : rong("Chưa có luồng nào", "Giao một việc cho cả đội, văn phòng chạy lần lượt Hinata, Sol, Astra rồi Claude duyệt.", `<a class="nut" href="#/code/giao-viec">Giao việc</a>`);
  }

  function veHanMuc(q, loiQ) {
    if (loiQ) { $("hanMuc").innerHTML = loi(loiQ); return; }
    const ds = (q && q.providers) || [];
    if (!ds.length) { $("hanMuc").innerHTML = rong("Chưa đọc được hạn mức", "Văn phòng đọc hạn mức từ CLI đã đăng nhập; mở trang Kết nối nếu thiếu."); return; }
    const TEN = { codex: "Codex (GPT)", claude: "Claude", antigravity: "Antigravity" };
    const phanTram = (v) => Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
    const dong = (nhan, con, ghiChu = "") => `<tr><td class="mo" style="white-space:normal">${nhan}</td>` +
      `<td style="width:34%"><div class="thanh-do" style="min-width:32px" role="img" aria-label="${esc(ghiChu || "Còn")} ${con ?? "?"}%"><i class="${con !== null && con < 15 ? "it" : ""}" style="transform:scaleX(${con === null ? 0 : con / 100})"></i></div></td>` +
      `<td class="so">${con === null ? "?" : con + "%"}</td></tr>`;
    // Mỗi nhà cung cấp: một dòng tên, các ô hạn mức của TÀI KHOẢN ĐANG DÙNG (ghi rõ nhóm: Gemini hay Claude/GPT trong
    // Antigravity), rồi một dòng cho từng tài khoản đã cất (văn phòng tự chuyển khi tài khoản đang dùng gần hết).
    $("hanMuc").innerHTML = `<table class="bang"><tbody>` + ds.map((p) => {
      const tk = (p.taiKhoan && p.taiKhoan.ds) || [];
      const nhieuNhom = new Set((p.buckets || []).map((b) => b.group)).size > 1;
      const nhomNgan = (g) => /claude|gpt/i.test(String(g)) ? "Claude/GPT" : g;   // "Claude / GPT trong Antigravity" quá dài cho cột hẹp
      const dau = `<tr><th colspan="3" scope="rowgroup" style="text-align:left"><b>${esc(TEN[p.id] || p.id)}</b>${tk.length > 1 ? ` <span class="mo">· ${tk.length} tài khoản</span>` : ""}` +
        `${p.error ? `<div class="hong">${esc(cat(p.error, 80))}</div>` : ""}</th></tr>`;
      const oDang = (p.buckets || []).map((b) => dong(esc((nhieuNhom && b.group ? nhomNgan(b.group) + " · " : "") + (b.label || "")), phanTram(b.remainingPercent)));
      const oTk = tk.length > 1 ? tk.map((a) => dong(`<span class="${a.dangDung ? "song" : ""}">TK ${esc(a.nhan)}${a.dangDung ? " · đang dùng" : ""}</span>`,
        phanTram(a.conLai), "Tài khoản " + a.nhan + " còn")) : [];
      return dau + [...oDang, ...oTk].join("");
    }).join("") + `</tbody></table>`;
    $("lucHanMuc").textContent = "còn lại";
  }

  function veMay() {
    const s = kho.state;
    if (!s) { $("may").innerHTML = kho.loiState ? loi(kho.loiState, false) : dangTai(2); return; }
    const sys = s.sys || {}, canh = s.alerts || [];
    $("may").innerHTML = `<table class="bang"><tbody>` +
      (sys.cFreeGB != null ? `<tr><td>Ổ ${esc(sys.diskLabel)}</td><td class="so ${sys.cFreeGB < 15 ? "hong" : ""}">còn ${esc(sys.cFreeGB)} GB</td></tr>` : "") +
      `<tr><td>AI đang làm</td><td class="so">${s.agents.filter((a) => a.platform !== "human" && a.status === "active").length}</td></tr>` +
      `<tr><td>Tin của đội trong 24 giờ</td><td class="so">${s.events.length}</td></tr></tbody></table>` +
      (canh.length ? canh.map((a) => `<div class="${a.level === "bad" ? "hong" : "canh-bao"}">${esc(a.text)}</div>`).join("") : `<div class="mo">Không có cảnh báo.</div>`);
  }

  const veTuKho = () => { veCanAnh(); veDoi(); veMay(); };
  const bo = kho.on(veTuKho);
  vung.addEventListener("click", (e) => {
    const n = e.target.closest("[data-ngan]"); if (n) return ngan.mo(n.dataset.ngan, n, { khiDoi: taiCtl });
    if (e.target.closest("[data-thu-lai]")) taiCtl();
  });
  const khiHien = () => { if (!document.hidden) taiCtl(); };
  document.addEventListener("visibilitychange", khiHien);
  function dong() {
    if (!conSong) return;
    conSong = false;
    phien++;
    clearTimeout(hen);
    bo();
    document.removeEventListener("visibilitychange", khiHien);
  }
  signal?.addEventListener("abort", dong, { once: true });
  veTuKho();
  taiCtl();
  return dong;
}
