// Khu Tin nhắn: đọc đội AI nói gì với nhau và với anh; hỏi một AI (chỉ đọc) hoặc giao việc cho cả đội.
// Nguồn: sổ lâu dài GET /tin-nhan của máy chủ (lọc theo AI, tìm không dấu, tải trang cũ). Máy chủ cũ chưa có sổ thì
// dùng tạm 24 giờ trong /events và ghi rõ. Tin mới từ luồng /events làm trang đầu tải lại (không hỏi máy chủ mỗi giây).
// Hỏi: POST /ctl/chat (AI chỉ đọc repo, không sửa file). Giao việc: POST /ctl/autopilot (đi đúng khóa lượt agent.md và cổng duyệt).
import { esc, cat, luc, dangTai, rong, loi, PHONG, chuDau, bao } from "../ui.js";

const TRANG = 60;

export async function mo(vung, { kho, ctl, signal }) {
  const thamSo = new URLSearchParams(location.hash.split("?")[1] || "");
  let ai = thamSo.get("ai") || "", q = "", tin = [], conNua = false, coSo = true, dangTaiTin = false, loiTin = "", moiNhat = 0;
  let phienTin = 0, taiThemKey = "", tinKey = "", dangTaiDau = false, ctrlTin = null;
  let nguoiHoi = "pain", cheDo = "hoi", henHoi = null, phienHoi = 0, nguCanhHoi = "", conSong = true;

  vung.innerHTML = `<div class="vung">
    <div class="tin-khung">
      <aside aria-label="Lọc theo người"><div class="loc-nguoi" id="locNguoi"></div></aside>
      <section aria-labelledby="hTin" style="min-width:0;display:flex;flex-direction:column;gap:var(--space-sm)">
        <div class="hang"><h2 class="dau" id="hTin">Dòng tin</h2><span class="mo" id="ghiChuNguon"></span>
          <label class="visually-hidden" for="timTin">Tìm trong tin nhắn</label>
          <input class="o" id="timTin" type="search" placeholder="Tìm, ví dụ: giao viec" style="margin-left:auto;width:min(260px,100%)"></div>
        <div id="dsTin" aria-live="polite">${dangTai(5)}</div>
        <form class="soan" id="soan" novalidate>
          <div id="traLoi"></div>
          <div class="hang">
            <div class="chon-nhom" role="group" aria-label="Kiểu tin">
              <button type="button" data-che-do="hoi" aria-pressed="true">Hỏi một AI</button>
              <button type="button" data-che-do="giao" aria-pressed="false">Giao việc cho đội</button>
            </div>
            <label class="visually-hidden" for="nguoiHoi">Hỏi ai</label>
            <select class="o" id="nguoiHoi">${Object.entries(PHONG).map(([k, p]) => `<option value="${k}">${esc(p.ten)}, ${esc(p.vai)}</option>`).join("")}</select>
            <span class="mo" id="goiYCheDo">AI chỉ đọc repo để trả lời, không sửa file.</span>
          </div>
          <label class="visually-hidden" for="noiDung">Nội dung</label>
          <textarea class="o" id="noiDung" rows="2" placeholder="Dự án đang tới lượt ai, và còn vướng gì?"></textarea>
          <div class="hang"><span class="hong" id="loiSoan" role="alert"></span><button type="submit" class="nut-chinh" id="nutGui" style="margin-left:auto">Gửi câu hỏi</button></div>
        </form>
      </section>
    </div>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);

  const tenCua = (k) => { if (k === "ceo") return (kho.state && kho.state.ownerName) || "Anh"; const a = kho.state && kho.state.agents.find((x) => x.key === k); return a ? a.name : k; };
  const nenCua = (k) => { if (k === "ceo") return "human"; const a = kho.state && kho.state.agents.find((x) => x.key === k); return a ? a.platform : ""; };

  function veLoc() {
    const s = kho.state, ds = s ? s.agents.filter((a) => a.platform !== "human") : [];
    const nut = (k, nhan, nen) => `<button type="button" data-ai="${esc(k)}" aria-pressed="${ai === k}">${nen !== null ? `<span class="anh-dai" data-nen="${esc(nen)}">${chuDau(nhan)}</span>` : ""}<span>${esc(nhan)}</span></button>`;
    $("locNguoi").innerHTML = nut("", "Tất cả", null) + nut("ceo", "Việc anh giao", "human") + ds.map((a) => nut(a.key, a.name, a.platform)).join("");
  }

  function datLaiDanhSachTin() {
    tin = [];
    conNua = false;
    loiTin = "";
    tinKey = "";
    const el = $("dsTin");
    if (el) el.innerHTML = dangTai(4);
  }

  // Tải trang đầu (them = false) hoặc trang cũ hơn (them = true).
  async function taiTin(them = false, { tuDong = false } = {}) {
    if (!conSong) return;
    const reqAi = ai, reqQ = q, key = reqAi + "\u0000" + reqQ;
    if (them) {
      const qO = ($("timTin")?.value || "").trim().slice(0, 120);
      if (dangTaiDau || taiThemKey === key || tinKey !== key || qO !== reqQ || !tin.length || !conNua) return;
      taiThemKey = key;
    } else {
      if (tuDong && (dangTaiTin || dangTaiDau || taiThemKey)) return;
      if (key !== tinKey) datLaiDanhSachTin();
      taiThemKey = "";
      dangTaiDau = true;
      if (ctrlTin) { try { ctrlTin.abort(); } catch {} ctrlTin = null; }
    }
    const mine = ++phienTin;
    dangTaiTin = true;
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    ctrlTin = ac;
    const tinCuoi = them ? tin.at(-1) : null;
    const conDung = () => conSong && mine === phienTin && ai === reqAi && q === reqQ;
    try {
      if (coSo) {
        const u = new URLSearchParams({ gioiHan: String(TRANG) });
        if (reqAi) u.set("ai", reqAi);
        if (reqQ) u.set("q", reqQ);
        if (tinCuoi) {
          u.set("truoc", String(tinCuoi.t));
          if (tinCuoi.id) u.set("truocId", tinCuoi.id);
        }
        const r = await fetch("tin-nhan?" + u, { cache: "no-store", ...(ac ? { signal: ac.signal } : {}) });
        if (!conDung()) return;
        if (r.status === 404) {
          coSo = false;
          if (mine === phienTin) { dangTaiTin = false; if (!them) dangTaiDau = false; if (ctrlTin === ac) ctrlTin = null; }
          if (them && taiThemKey === key) taiThemKey = "";
          return taiTin(them, { tuDong });
        }
        const d = await r.json();
        if (!conDung()) return;
        if (!r.ok || d.ok === false) throw new Error(d.error || "Lỗi HTTP " + r.status);
        tin = them ? tin.concat(d.tin) : d.tin; conNua = !!d.conNua; tinKey = key;
        $("ghiChuNguon").textContent = "lưu lâu dài";
      } else {
        const s = kho.state;
        if (!s) return;
        const bo = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
        tin = s.events.filter((e) => (!reqAi || e.from === reqAi || e.to === reqAi) && (!reqQ || bo(e.title + " " + e.body).includes(bo(reqQ)))).slice().reverse();
        conNua = false; tinKey = key;
        $("ghiChuNguon").textContent = "24 giờ gần nhất (máy chủ chưa có sổ lưu lâu dài)";
      }
      loiTin = "";
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (!conDung()) return;
      loiTin = "Không đọc được tin nhắn: " + e.message;
    } finally {
      if (mine === phienTin) {
        dangTaiTin = false;
        if (!them) dangTaiDau = false;
        if (ctrlTin === ac) ctrlTin = null;
        if (them && taiThemKey === key) taiThemKey = "";
      }
    }
    if (!conDung()) return;
    veTin(!them);
  }

  function veTin(cuonXuong) {
    const el = $("dsTin");
    if (loiTin && !tin.length) { el.innerHTML = loi(loiTin); return; }
    if (!tin.length) { el.innerHTML = rong(q ? "Không có tin nào khớp" : "Chưa có tin nhắn", q ? "Thử từ khác, hoặc bỏ lọc người." : "Khi các AI nhắn nhau hoặc anh giao việc, tin hiện ở đây.", q ? '<button type="button" class="nut" data-bo-tim>Bỏ tìm</button>' : ""); return; }
    const ds = tin.slice().reverse();
    el.innerHTML = (conNua ? `<div class="hang" style="justify-content:center;padding-bottom:var(--space-xs)"><button type="button" class="nut" data-them>Tải tin cũ hơn</button></div>` : "") +
      (loiTin ? loi(loiTin) : "") +
      ds.map((e) => { const canAnh = /^\s*\[CẦN ANH/.test(e.body || e.title); return `<article class="dong-tin${e.from === "ceo" ? " cua-anh" : ""}${canAnh ? " can-anh" : ""}">` +
        `<span class="anh-dai" data-nen="${esc(nenCua(e.from))}" aria-hidden="true">${chuDau(tenCua(e.from))}</span><div style="min-width:0">` +
        `<div class="ai-gui"><b>${esc(tenCua(e.from))}</b><span class="mo" title="${esc(tenCua(e.to))}">gửi ${esc(cat(tenCua(e.to), 48))}</span><time class="mo" datetime="${esc(new Date(e.t).toISOString())}">${esc(luc(e.t))}</time></div>` +
        `<pre class="van-ban noi-dung">${esc(e.body || e.title)}</pre></div></article>`; }).join("");
    if (cuonXuong) el.lastElementChild?.scrollIntoView({ block: "end" });
  }

  // ---------- soạn ----------
  function xoaTraLoi() {
    phienHoi++;
    clearTimeout(henHoi);
    henHoi = null;
    nguCanhHoi = "";
    const el = $("traLoi");
    if (el) el.innerHTML = "";
  }

  function datCheDo(m, taiLai = true) {
    const doi = m !== cheDo;
    cheDo = m;
    vung.querySelectorAll("[data-che-do]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cheDo === m)));
    $("nguoiHoi").hidden = m !== "hoi";
    $("goiYCheDo").textContent = m === "hoi" ? "AI chỉ đọc repo để trả lời, không sửa file." : "Tạo một luồng tự chạy trong dự án đang chọn; đội làm theo lượt agent.md, anh duyệt báo cáo cuối.";
    $("nutGui").textContent = m === "hoi" ? "Gửi câu hỏi" : "Giao việc";
    $("noiDung").placeholder = m === "hoi" ? "Dự án đang tới lượt ai, và còn vướng gì?" : "Thêm nút xuất CSV cho bảng hạn mức, có test";
    if (m !== "hoi") xoaTraLoi();
    else if (taiLai && doi) veTraLoi({ xoaTruoc: true });
  }

  async function veTraLoi({ xoaTruoc = false } = {}) {
    clearTimeout(henHoi);
    henHoi = null;
    const mine = ++phienHoi;
    const ws = kho.duAn, who = nguoiHoi;
    if (!conSong || cheDo !== "hoi" || !ws) {
      nguCanhHoi = "";
      const el = $("traLoi");
      if (el) el.innerHTML = "";
      return;
    }
    const key = ws + "\u0000" + who;
    if (xoaTruoc || key !== nguCanhHoi) {
      nguCanhHoi = key;
      $("traLoi").innerHTML = "";
    }
    const conDung = () => conSong && mine === phienHoi && cheDo === "hoi" && kho.duAn === ws && nguoiHoi === who;
    try {
      const d = await ctl("/chat?workspace=" + encodeURIComponent(ws) + "&who=" + encodeURIComponent(who));
      if (!conDung()) return;
      const c = (d && d.chat) || {};
      const cuoi = (c.messages || []).slice(-2);
      const ten = c.name || (PHONG[who] && PHONG[who].ten) || who;
      $("traLoi").innerHTML = cuoi.length ? `<div class="tra-loi">` + cuoi.map((m) => `<div><span class="mo">${m.from === "ceo" ? "Anh hỏi" : esc(ten) + (m.status === "cho" ? " đang trả lời…" : " trả lời")}:</span>` +
        `<pre class="van-ban">${esc(m.status === "cho" ? "" : cat(m.text, 1500))}</pre></div>`).join("") + `</div>` : "";
      if (c.busy && conDung()) henHoi = setTimeout(() => { if (conDung()) veTraLoi(); }, 3000);
    } catch (e) {
      if (!conDung()) return;
      $("traLoi").innerHTML = loi("Không đọc được cuộc hỏi: " + e.message, false);
    }
  }

  $("soan").addEventListener("submit", async (e) => {
    e.preventDefault();
    const o = $("noiDung"), nhap = o.value, text = nhap.trim();
    const nut = $("nutGui");
    if (nut.disabled) return;
    if (!text) { $("loiSoan").textContent = "Gõ nội dung trước đã."; o.setAttribute("aria-invalid", "true"); o.focus(); return; }
    if (!kho.duAn) { $("loiSoan").textContent = "Chọn dự án ở thanh trên trước."; return; }
    nut.setAttribute("aria-busy", "true"); nut.disabled = true;
    const ws = kho.duAn, who = nguoiHoi, mode = cheDo;
    const conDung = () => conSong && kho.duAn === ws && cheDo === mode && (mode !== "hoi" || nguoiHoi === who);
    try {
      if (mode === "hoi") {
        await ctl("/chat", { workspace: ws, who, text });
        if (!conDung()) return;
        if (o.value === nhap) o.value = "";
        bao("Đã gửi câu hỏi cho " + ((PHONG[who] && PHONG[who].ten) || who) + ".");
        veTraLoi();
      } else {
        const duAn = (kho.dsDuAn.find((w) => w.path === ws) || {}).name || ws.split(/[\\/]/).pop();
        if (!confirm(`Giao việc này cho cả đội trong dự án ${duAn}?\n\n${cat(text, 300)}\n\nĐội làm theo lượt agent.md; báo cáo cuối chờ anh duyệt, không tự push hay phát hành.`)) return;
        await ctl("/autopilot", { workspace: ws, task: text });
        if (!conDung()) return;
        if (o.value === nhap) o.value = "";
        bao("Đã giao việc. Theo dõi ở Tổng quan hoặc Dự án và giao việc.");
      }
    } catch (err) { if (conDung()) $("loiSoan").textContent = err.message; }
    finally { if (conSong) { nut.removeAttribute("aria-busy"); nut.disabled = false; } }
  });
  $("noiDung").addEventListener("input", () => { $("loiSoan").textContent = ""; $("noiDung").removeAttribute("aria-invalid"); });
  $("noiDung").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("soan").requestSubmit(); });
  $("nguoiHoi").addEventListener("change", (e) => { nguoiHoi = e.target.value; veTraLoi({ xoaTruoc: true }); });

  let henTim = null;
  $("timTin").addEventListener("input", (e) => { clearTimeout(henTim); henTim = setTimeout(() => { q = e.target.value.trim().slice(0, 120); taiTin(); }, 300); });
  vung.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cheDo) return datCheDo(b.dataset.cheDo);
    if (b.dataset.ai !== undefined) {
      ai = b.dataset.ai; veLoc();
      history.replaceState(null, "", "#/tin-nhan" + (ai ? "?ai=" + encodeURIComponent(ai) : ""));
      if (PHONG[ai] && ai !== nguoiHoi) { nguoiHoi = ai; $("nguoiHoi").value = ai; veTraLoi({ xoaTruoc: true }); }
      return taiTin();
    }
    if (b.hasAttribute("data-them")) return taiTin(true);
    if (b.hasAttribute("data-bo-tim")) { q = ""; $("timTin").value = ""; return taiTin(); }
    if (b.hasAttribute("data-thu-lai")) return taiTin();
  });

  // Tin mới trong /events → tải lại trang đầu (chỉ khi đang xem trang mới nhất); đổi dự án → xóa cũ và đọc lại cuộc hỏi.
  let duAnCu = kho.duAn;
  const bo = kho.on((k) => {
    veLoc();
    if (k.duAn !== duAnCu) { duAnCu = k.duAn; veTraLoi({ xoaTruoc: true }); }
    const t = k.state && k.state.events.length ? k.state.events.at(-1).t : 0;
    if (t && t !== moiNhat) { moiNhat = t; if (tin.length <= TRANG) taiTin(false, { tuDong: true }); }
  });
  if (PHONG[ai]) { nguoiHoi = ai; $("nguoiHoi").value = ai; }
  datCheDo("hoi", false);
  veLoc();
  moiNhat = kho.state && kho.state.events.length ? kho.state.events.at(-1).t : 0;
  function dong() {
    if (!conSong) return;
    conSong = false;
    phienTin++;
    taiThemKey = "";
    tinKey = "";
    dangTaiDau = false;
    if (ctrlTin) { try { ctrlTin.abort(); } catch {} ctrlTin = null; }
    xoaTraLoi();
    clearTimeout(henTim);
    bo();
  }
  signal?.addEventListener("abort", dong, { once: true });
  taiTin();
  veTraLoi();
  return dong;
}
