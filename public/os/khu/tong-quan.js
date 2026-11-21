// Khu Tổng quan: hàng việc cần anh (chữ ký của màn: khung góc), đội AI đang làm gì, luồng tự chạy, hạn mức, máy.
// Việc cần anh gộp ba nguồn thật: câu hỏi/yêu cầu phát hiện trong nhật ký phiên (/state asks), bàn giao chờ duyệt (ctl /handoffs),
// luồng tự chạy đang chờ anh (ctl /autopilot). Không có số nào tự đặt ra.
import { esc, cat, luc, dangTai, rong, loi, ctl } from "../ui.js";

const TT_LUONG = { running: "đang chạy", reporting: "đang viết báo cáo", awaiting_answer: "chờ anh trả lời", awaiting_approval: "chờ anh duyệt báo cáo",
  attention: "cần anh xem", waiting_quota: "chờ hạn mức", awaiting_scan: "chờ anh duyệt rà soát", stopped: "đã dừng", approved: "anh đã duyệt", acknowledged: "đã ghi nhận", done: "xong", failed: "lỗi" };
const CHO_ANH = new Set(["awaiting_answer", "awaiting_approval", "attention", "waiting_quota", "awaiting_scan"]);
const TT_AI = { active: ["đang làm", "song"], idle: ["rảnh", "phu"], away: ["vắng", "mo"] };
const NEN = { claude: "Claude", codex: "Codex", antigravity: "Antigravity", gemini: "Gemini", human: "Người" };

export async function mo(vung, { kho }) {
  vung.innerHTML = `<div class="vung">
    <div class="luoi-2">
      <section class="khung-goc" aria-labelledby="hCanAnh"><div style="display:flex;flex-direction:column;gap:var(--space-sm)">
        <div class="dau-hang"><h2 class="dau" id="hCanAnh">Việc cần anh</h2><span class="mo" id="soCanAnh"></span></div>
        <div id="canAnh">${dangTai(4)}</div></div></section>
      <section class="khoi" aria-labelledby="hHanMuc"><div class="dau-hang"><h2 class="dau" id="hHanMuc">Hạn mức AI</h2><span class="mo" id="lucHanMuc"></span></div><div id="hanMuc">${dangTai(3)}</div></section>
    </div>
    <section class="khoi" aria-labelledby="hDoi"><h2 class="dau" id="hDoi">Đội AI</h2><div id="doi" class="bang-cuon">${dangTai(4)}</div></section>
    <div class="luoi-2">
      <section class="khoi" aria-labelledby="hLuong"><h2 class="dau" id="hLuong">Luồng tự chạy gần đây</h2><div id="luong">${dangTai(3)}</div></section>
      <section class="khoi" aria-labelledby="hMay"><h2 class="dau" id="hMay">Máy</h2><div id="may">${dangTai(2)}</div></section>
    </div>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let handoffs = null, runs = null, loiCtl = "", hen = null, conSong = true;

  async function taiCtl() {
    clearTimeout(hen);
    if (!conSong) return;
    if (!document.hidden) {
      const [h, a, q] = await Promise.allSettled([ctl("/handoffs"), ctl("/autopilot"), ctl("/quotas")]);
      handoffs = h.status === "fulfilled" ? h.value.handoffs || [] : null;
      runs = a.status === "fulfilled" ? a.value.runs || [] : null;
      loiCtl = [h, a].find((x) => x.status === "rejected")?.reason?.message || "";
      veHanMuc(q.status === "fulfilled" ? q.value : null, q.status === "rejected" ? q.reason.message : "");
      veCanAnh(); veLuong();
    }
    hen = setTimeout(taiCtl, 15000);
  }

  function veCanAnh() {
    const s = kho.state, ten = (k) => (s && s.agents.find((a) => a.key === k) || {}).name || k || "AI";
    if (!s && !handoffs && !runs) { $("canAnh").innerHTML = kho.loiState ? loi(kho.loiState, false) : dangTai(4); return; }
    const muc = [];
    for (const a of (s && s.asks) || []) muc.push({ t: a.since, tieu: cat(a.text, 220), nguon: ten(a.who) + (a.guess ? " (máy đoán từ câu cuối)" : ""), nut: `<a class="nut nho" href="#/tin-nhan?ai=${encodeURIComponent(a.who || "")}">Xem tin</a>` });
    for (const h of handoffs || []) { const p = h.payload || {}; muc.push({ t: h.createdAt || h.created_at, tieu: cat(p.giai_thich || p.tom_tat || h.summary || "Bàn giao chờ duyệt", 220), nguon: "Bàn giao của " + (h.role || p.vai || "AI") + (p.next_owner ? " cho " + p.next_owner : ""), nut: `<a class="nut nho" href="#/code/dieu-khien">Duyệt</a>` }); }
    for (const r of runs || []) if (CHO_ANH.has(r.status)) muc.push({ t: r.updatedAt, tieu: cat(r.question && r.question.text ? r.question.text : r.task, 220), nguon: "Luồng tự chạy: " + TT_LUONG[r.status], nut: `<a class="nut-chinh" href="#/code/du-an">Mở luồng</a>` });
    muc.sort((x, y) => (y.t || 0) - (x.t || 0));
    $("soCanAnh").textContent = muc.length ? muc.length + " việc" : "";
    $("canAnh").innerHTML = (loiCtl ? loi("Chưa đọc được bàn giao và luồng: " + loiCtl) : "") + (muc.length
      ? muc.map((m) => `<div class="dong"><div><div class="tieu">${esc(m.tieu)}</div><div class="chi-tiet">${esc(m.nguon)}${m.t ? ", " + esc(luc(m.t)) : ""}</div></div>${m.nut}</div>`).join("")
      : rong("Không có việc nào chờ anh", "Câu hỏi của AI, bàn giao chờ duyệt và luồng cần anh trả lời sẽ hiện ở đây.", `<a class="nut" href="#/code/du-an">Giao việc mới</a>`));
  }

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
      `<span class="${CHO_ANH.has(r.status) ? "canh-bao" : r.status === "running" ? "song" : "mo"}">${esc(TT_LUONG[r.status] || r.status)}</span></div>`).join("")
      : rong("Chưa có luồng nào", "Giao một việc cho cả đội, văn phòng chạy lần lượt Hinata, Sol, Astra rồi Claude duyệt.", `<a class="nut" href="#/code/du-an">Giao việc</a>`);
  }

  function veHanMuc(q, loiQ) {
    if (loiQ) { $("hanMuc").innerHTML = loi(loiQ); return; }
    const ds = (q && q.providers) || [];
    if (!ds.length) { $("hanMuc").innerHTML = rong("Chưa đọc được hạn mức", "Văn phòng đọc hạn mức từ CLI đã đăng nhập; mở trang Kết nối nếu thiếu."); return; }
    const TEN = { codex: "Codex (GPT)", claude: "Claude", antigravity: "Antigravity" };
    $("hanMuc").innerHTML = `<table class="bang"><tbody>` + ds.flatMap((p) => (p.buckets || []).map((b, i) => {
      const con = Number.isFinite(b.remainingPercent) ? Math.max(0, Math.min(100, Math.round(b.remainingPercent))) : null;
      return `<tr><td>${i ? "" : `<b>${esc(TEN[p.id] || p.id)}</b>`}${p.error ? `<div class="hong">${esc(cat(p.error, 80))}</div>` : ""}</td><td class="mo" style="white-space:nowrap">${esc(b.label || "")}</td>` +
        `<td style="width:40%"><div class="thanh-do" role="img" aria-label="Còn ${con ?? "?"}%"><i class="${con !== null && con < 15 ? "it" : ""}" style="transform:scaleX(${con === null ? 0 : con / 100})"></i></div></td>` +
        `<td class="so">${con === null ? "?" : con + "%"}</td></tr>`; })).join("") + `</tbody></table>`;
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
  vung.addEventListener("click", (e) => { if (e.target.closest("[data-thu-lai]")) taiCtl(); });
  const khiHien = () => { if (!document.hidden) taiCtl(); };
  document.addEventListener("visibilitychange", khiHien);
  veTuKho();
  taiCtl();
  return () => { conSong = false; clearTimeout(hen); bo(); document.removeEventListener("visibilitychange", khiHien); };
}
