// Khu Tin nhắn: đọc đội AI nói gì với nhau và với anh; hỏi một AI (chỉ đọc) hoặc giao việc cho cả đội.
// Nguồn: sổ lâu dài GET /tin-nhan của máy chủ (lọc theo AI, tìm không dấu, tải trang cũ). Máy chủ cũ chưa có sổ thì
// dùng tạm 24 giờ trong /events và ghi rõ. Tin mới từ luồng /events làm trang đầu tải lại (không hỏi máy chủ mỗi giây).
// Hỏi: POST /ctl/chat (AI đọc repo + web; xin làm thì anh bấm Đồng ý → POST /ctl/chat/duyet chạy đúng việc đó, máy chụp repo để chặn sửa/xoá ngoài phạm vi). Giao việc: POST /ctl/autopilot (đi đúng khóa lượt agent.md và cổng duyệt).
import { esc, cat, luc, dangTai, rong, loi, PHONG, chuDau, bao } from "../ui.js";

const TRANG = 60;

export async function mo(vung, { kho, ctl, signal }) {
  const thamSo = new URLSearchParams(location.hash.split("?")[1] || "");
  let ai = thamSo.get("ai") || "", q = "", tin = [], conNua = false, coSo = true, dangTaiTin = false, loiTin = "", moiNhat = 0;
  let phienTin = 0, taiThemKey = "", tinKey = "", dangTaiDau = false, ctrlTin = null;
  let nguoiHoi = "pain", cheDo = "hoi", henHoi = null, phienHoi = 0, nguCanhHoi = "", conSong = true, chatHienTai = null, veCuoi = "";

  vung.innerHTML = `<div class="vung">
    <div class="tin-khung">
      <aside aria-label="Lọc theo người"><div class="loc-nguoi" id="locNguoi"></div></aside>
      <section aria-labelledby="hTin" style="min-width:0;display:flex;flex-direction:column;gap:var(--space-sm)">
        <div class="hang"><h2 class="dau" id="hTin">Dòng tin</h2><span class="mo" id="ghiChuNguon"></span>
          <label class="visually-hidden" for="timTin">Tìm trong tin nhắn</label>
          <input class="o" id="timTin" type="search" placeholder="Tìm, ví dụ: giao viec" style="margin-left:auto;width:min(260px,100%)"></div>
        <div id="dsTin" aria-live="polite">${dangTai(5)}</div>
        <form class="soan" id="soan" novalidate>
          <div id="traLoi" aria-live="polite"></div>
          <div class="hang">
            <div class="chon-nhom" role="group" aria-label="Kiểu tin">
              <button type="button" data-che-do="hoi" aria-pressed="true">Hỏi một AI</button>
              <button type="button" data-che-do="giao" aria-pressed="false">Giao việc cho đội</button>
            </div>
            <label class="visually-hidden" for="nguoiHoi">Hỏi ai</label>
            <select class="o" id="nguoiHoi">${Object.entries(PHONG).map(([k, p]) => `<option value="${k}">${esc(p.ten)}, ${esc(p.vai)}</option>`).join("")}</select>
            <span class="mo" id="goiYCheDo">AI đọc repo, tự tìm web; muốn làm gì thì xin, anh bấm Đồng ý mới làm.</span>
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
    nguCanhHoi = ""; veCuoi = ""; chatHienTai = null;
    const el = $("traLoi");
    if (el) el.innerHTML = "";
  }

  function datCheDo(m, taiLai = true) {
    const doi = m !== cheDo;
    cheDo = m;
    vung.querySelectorAll("[data-che-do]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cheDo === m)));
    $("nguoiHoi").hidden = m !== "hoi";
    $("goiYCheDo").textContent = m === "hoi" ? "AI đọc repo, tự tìm web; muốn làm gì thì xin, anh bấm Đồng ý mới làm." : "Tạo một luồng tự chạy trong dự án đang chọn; đội làm theo lượt agent.md, anh duyệt báo cáo cuối.";
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
      nguCanhHoi = ""; veCuoi = ""; chatHienTai = null;
      const el = $("traLoi");
      if (el) el.innerHTML = "";
      return;
    }
    const key = ws + "\u0000" + who;
    if (xoaTruoc || key !== nguCanhHoi) {
      nguCanhHoi = key; veCuoi = ""; chatHienTai = null;
      $("traLoi").innerHTML = "";
    }
    const conDung = () => conSong && mine === phienHoi && cheDo === "hoi" && kho.duAn === ws && nguoiHoi === who;
    try {
      const d = await ctl("/chat?workspace=" + encodeURIComponent(ws) + "&who=" + encodeURIComponent(who));
      if (!conDung()) return;
      const c = (d && d.chat) || {};
      const cuoi = (c.messages || []).slice(-2);
      const ten = esc(c.name || (PHONG[who] && PHONG[who].ten) || who);
      chatHienTai = c;
      const henLai = () => { if ((c.busy || c.dangKiem) && conDung()) henHoi = setTimeout(() => { if (conDung()) veTraLoi(); }, 3000); };
      // Chỉ vẽ lại khi dữ liệu đổi: đang chờ cổng (poll 3 giây) thì không đọc lặp vùng aria-live, không mất focus nút.
      const kyTu = JSON.stringify(cuoi);
      if (kyTu === veCuoi) return henLai();
      veCuoi = kyTu;
      const xin = (m) => {
        if (!m.xinLam) return "";
        const tt = m.xinLam.trangThai, kq = m.xinLam.cong, dangKiem = kq && kq.trangThai === "dang-kiem";
        // Hiện TRỌN việc xin làm (không cắt): đúng chữ này sẽ được giao cho lượt có quyền.
        return `<div class="xin-lam"><span class="mo">${ten} xin phép làm${m.xinLam.why ? " (" + esc(m.xinLam.why) + ")" : ""}:</span><pre class="van-ban">${esc(m.xinLam.viec)}</pre>` +
          vePhamVi(m.xinLam) + veCong(kq) +
          (tt === "cho" ? `<div class="hang"><button type="button" class="nut-chinh" data-duyet="${esc(m.id)}"${dangKiem ? " disabled" : ""}>${dangKiem ? "Chờ cổng kiểm web…" : "Đồng ý làm"}</button><button type="button" class="nut" data-tu-choi="${esc(m.id)}">Không</button>` +
            `<span class="mo">Lượt đó chạy theo quyền của phòng ở trang Models và quyền.</span></div>`
            : `<span class="mo">${{ "da-duyet": "Anh đã đồng ý.", "tu-choi": "Anh đã từ chối.", "het-han": "Hết hiệu lực (anh đã nhắn câu khác)." }[tt] || ""}</span>`) + `</div>`;
      };
      const nhan = (m) => m.from === "ceo" ? (m.duyet ? "Anh duyệt" : "Anh hỏi") : ten + (m.status === "cho"
        ? (m.duyetMuc ? (m.toanQuyen ? " đang làm (toàn quyền)…" : " đang làm (ghi nháp)…") : " đang trả lời…") : m.status === "loi" ? " báo lỗi" : " trả lời");
      $("traLoi").innerHTML = cuoi.length ? `<div class="tra-loi">` + cuoi.map((m) => `<div><span class="${m.status === "loi" ? "hong" : "mo"}">${nhan(m)}:</span>` +
        `<pre class="van-ban">${esc(m.status === "cho" ? "" : cat(m.text, 1500))}</pre>${xin(m)}${veKiemFile(m)}${m.canhBao ? `<p class="hong" role="alert">${esc(m.canhBao)}</p>` : ""}</div>`).join("") + `</div>` : "";
      henLai();
    } catch (e) {
      if (!conDung()) return;
      veCuoi = "";
      $("traLoi").innerHTML = loi("Không đọc được cuộc hỏi: " + e.message, false);
    }
  }

  // Phạm vi AI xin: file sẽ tạo/sửa; mục xoá (đỏ, kèm lý do) — anh đồng ý là đồng ý đúng các mục này.
  function vePhamVi(x) {
    const sua = x.suaFile || [], xoa = x.xoa || [];
    return `<p class="mo">File sẽ tạo/sửa: ${sua.length ? sua.map((f) => `<code>${esc(f)}</code>`).join(", ") : "không có (chỉ chạy lệnh/đọc)"}</p>` +
      (xoa.length ? `<div class="cong-xau" role="alert"><b>Sẽ XOÁ ${xoa.length} mục (cần anh đồng ý):</b><ul>${xoa.map((d) => `<li><code>${esc(d.duongDan)}</code> — vì: ${esc(d.lyDo)}</li>`).join("")}</ul></div>` : "") +
      (x.khongGit ? `<p class="hong">Dự án không dùng git: máy KHÔNG chụp/khôi phục được file nếu AI sửa hay xoá ngoài phạm vi.</p>` : "") +
      (x.coSubmodule ? `<p class="hong">Dự án có submodule: máy không thấy thay đổi bên trong submodule.</p>` : "");
  }
  // Kết quả kiểm file sau lượt anh đã duyệt (so với ảnh chụp repo trước lượt).
  function veKiemFile(m) {
    const k = m.kiemFile;
    if (!k) return "";
    if (k.khongGit) return `<p class="hong" role="alert">Dự án không dùng git: không kiểm được AI đã sửa/xoá những file nào.</p>`;
    if (k.loi) return `<p class="hong" role="alert">Không kiểm được file sau lượt: ${esc(k.loi)}</p>`;
    const tong = k.tong || {}, them = (key, a) => (tong[key] > a.length ? ` (và ${tong[key] - a.length} file nữa)` : "");
    const ds = (a, key) => a.map((f) => `<code>${esc(typeof f === "string" ? f : f.file)}</code>`).join(", ") + (key ? them(key, a) : ""), xl = k.daXuLy || {};
    const dong = [];
    if (k.dungPhamVi.length) dong.push(`<li>Sửa đúng phạm vi: ${ds(k.dungPhamVi)}</li>`);
    if (k.xoaDuocDuyet.length) dong.push(`<li>Đã xoá (anh đã duyệt): ${ds(k.xoaDuocDuyet)}</li>`);
    if (k.daTraVe.length) dong.push(`<li class="hong">Sửa NGOÀI phạm vi — máy đã trả về bản cũ: ${ds(k.daTraVe, "daTraVe")} ` +
      (xl["dung-ban-ai"] ? "(anh đã lấy lại bản sau lượt" + (xl["dung-ban-ai-bo-qua"] ? "; bỏ qua vì đã đổi sau đó: " + ds(xl["dung-ban-ai-bo-qua"]) : "") + ")" : `<button type="button" class="nut" data-file="${esc(m.id)}" data-hanh="dung-ban-ai">Lấy lại bản sau lượt</button>`) + "</li>");
    if (k.daKhoiPhuc.length) dong.push(`<li class="hong">AI xoá khi chưa được duyệt — máy đã khôi phục: ${ds(k.daKhoiPhuc, "daKhoiPhuc")}</li>`);
    if (k.fileMoiNgoai.length) dong.push(`<li class="hong">File mới ngoài phạm vi (máy không tự xoá; thư mục thì anh tự xoá): ${ds(k.fileMoiNgoai, "fileMoiNgoai")} ` +
      (xl["xoa-file-moi"] ? "(anh đã xoá" + (xl["xoa-file-moi-bo-qua"] ? "; giữ lại vì đã đổi sau đó: " + ds(xl["xoa-file-moi-bo-qua"]) : "") + ")" : `<button type="button" class="nut" data-file="${esc(m.id)}" data-hanh="xoa-file-moi">Xoá các file mới này</button>`) + "</li>");
    if (k.boQuaMat.length) dong.push(`<li class="hong">File/thư mục bị gitignore đã MẤT, máy không khôi phục được: ${ds(k.boQuaMat, "boQuaMat")}</li>`);
    if ((k.boQuaDoi || []).length) dong.push(`<li class="hong">File bị gitignore đã ĐỔI trong lúc lượt chạy (AI hoặc app đang chạy), máy không có bản cũ: ${ds(k.boQuaDoi, "boQuaDoi")}</li>`);
    if ((k.loiKhoiPhuc || []).length) dong.push(`<li class="hong">Máy KHÔNG khôi phục được (anh kiểm tay bằng git): ${k.loiKhoiPhuc.map((h) => `<code>${esc(h.file)}</code> (${esc(h.loi)})`).join(", ")}</li>`);
    if (k.coSubmodule) dong.push(`<li class="hong">Dự án có submodule: thay đổi bên trong submodule không kiểm được.</li>`);
    const xau = k.daTraVe.length || k.daKhoiPhuc.length || k.fileMoiNgoai.length || k.boQuaMat.length || (k.boQuaDoi || []).length || (k.loiKhoiPhuc || []).length || k.coSubmodule;
    return `<div class="${xau ? "cong-xau" : "cong-tot"}"${xau ? ' role="alert"' : ""}><b>Kiểm file sau lượt:</b> ${dong.length ? `<ul>${dong.join("")}</ul>` : "không đổi file nào."}</div>`;
  }
  // Sau await: trang đã đóng hay anh đã đổi người/dự án/chế độ thì không đụng DOM của ngữ cảnh mới.
  const conNguCanh = (ws, who) => conSong && cheDo === "hoi" && kho.duAn === ws && nguoiHoi === who;
  const ghiLoi = (msg) => { const el = $("loiSoan"); if (el) el.textContent = msg; };
  async function xuLyFile(b) {
    const id = b.dataset.file, hanh = b.dataset.hanh, who = nguoiHoi, duAn = kho.duAn;
    const m = chatHienTai && chatHienTai.messages.find((x) => x.id === id), k = m && m.kiemFile;
    const ds = k ? (hanh === "xoa-file-moi" ? k.fileMoiNgoai : k.daTraVe).join("\n") : "";
    ghiLoi("");
    if (!confirm(hanh === "xoa-file-moi" ? `XOÁ các file mới AI tạo ngoài phạm vi? Không hoàn tác được.\n\n${ds}` : `Ghi đè bằng bản sau lượt (AI sửa ngoài phạm vi anh duyệt, hoặc anh sửa trong lúc lượt chạy) cho các file:\n\n${ds}\n\nFile nào đã đổi sau đó thì máy bỏ qua.`)) return;
    clearTimeout(henHoi); henHoi = null; phienHoi++;   // bỏ lượt đọc đang bay: không vẽ đè, không bật lại nút
    b.disabled = true;
    try { await ctl("/chat/file", { workspace: duAn, who, id, hanhDong: hanh }); if (conNguCanh(duAn, who)) bao("Đã xong."); }
    catch (err) { if (conNguCanh(duAn, who)) ghiLoi(err.message); }
    if (!conNguCanh(duAn, who)) return;
    veCuoi = ""; veTraLoi();
  }

  // Kết quả cổng kiểm web (Claude + máy quét) trên các trang AI vừa đọc. Mức nào cũng cho bấm (CEO chọn), chỉ cảnh báo đỏ.
  const TEN_MUC = { "an-toan": "an toàn", "chua-ro": "chưa rõ", "nghi-ngo": "nghi ngờ", "nguy-hiem": "NGUY HIỂM" };
  function veCong(kq) {
    if (!kq || kq.trangThai === "khong-can") return "";
    if (kq.trangThai === "dang-kiem") return `<p class="mo" role="status">Claude đang kiểm ${(kq.urls || []).length || ""} trang web AI vừa đọc (chèn lệnh cho AI, mã độc, SQL injection)…</p>`;
    const xau = kq.muc !== "an-toan";
    return `<div class="${xau ? "cong-xau" : "cong-tot"}"${xau ? ' role="alert"' : ""}><b>Cổng kiểm web: ${esc(TEN_MUC[kq.muc] || kq.muc)}</b>${kq.tomTat ? " — " + esc(kq.tomTat) : ""}` +
      (xau && (kq.phatHien || []).length ? `<ul>${kq.phatHien.slice(0, 8).map((f) => `<li>${esc(cat(f.nguon, 80))}: ${esc(f.ten || f.loai)}${f.trich ? ` <code>${esc(cat(f.trich, 120))}</code>` : ""}</li>`).join("")}</ul>` : "") + `</div>`;
  }
  const canhBaoXacNhan = (kq) => kq && kq.trangThai === "xong" && kq.muc !== "an-toan"
    ? `\n\n⚠ CỔNG KIỂM WEB: ${TEN_MUC[kq.muc] || kq.muc}. ${kq.tomTat || ""}\nAnh vẫn có thể đồng ý, nhưng nên đọc kỹ cảnh báo đỏ trước.` : "";

  // Anh bấm Đồng ý / Không cho việc AI xin làm ở câu trả lời mới nhất.
  async function xuLyXin(b) {
    const id = b.dataset.duyet || b.dataset.tuChoi, who = nguoiHoi, duAn = kho.duAn;
    const m = chatHienTai && chatHienTai.messages.find((x) => x.id === id);
    ghiLoi("");
    const x = m && m.xinLam;
    if (b.dataset.duyet && !confirm(`Cho ${((PHONG[who] && PHONG[who].ten) || who)} làm đúng việc này trên máy (theo quyền của phòng)?\n\n${x ? x.viec : ""}` +
      `\n\nFile được tạo/sửa: ${x && x.suaFile && x.suaFile.length ? x.suaFile.join(", ") : "không có"}` +
      (x && x.xoa && x.xoa.length ? `\n\n⚠ SẼ XOÁ:\n${x.xoa.map((d) => "- " + d.duongDan + " — vì: " + d.lyDo).join("\n")}` : "\nKhông xoá gì.") +
      canhBaoXacNhan(x && x.cong) +
      (x && x.khongGit ? "\n\n⚠ Dự án không dùng git: máy KHÔNG chụp/khôi phục được file. Máy chỉ chặn cứng: gửi email/lịch/triển khai nhân danh anh, chạy chồng lượt khác."
        : "\n\nMáy chặn cứng: sửa file ngoài danh sách (trả về bản cũ), xoá chưa duyệt (khôi phục), gửi email/lịch/triển khai nhân danh anh, chạy chồng lượt khác." +
          (x && x.coSubmodule ? " (Không thấy được thay đổi bên trong submodule.)" : "") + "\nTrong lúc lượt chạy, anh đừng tự sửa file khác trong dự án: máy sẽ coi là sửa ngoài phạm vi và trả về (vẫn lấy lại được).") +
      "\nAI được dặn không push, không đọc file khóa.")) return;
    clearTimeout(henHoi); henHoi = null; phienHoi++;   // bỏ lượt đọc đang bay: không vẽ đè, không bật lại nút khi yêu cầu đang gửi
    const khoi = b.closest(".xin-lam");
    (khoi ? khoi.querySelectorAll("button") : [b]).forEach((x) => { x.disabled = true; });
    b.setAttribute("aria-busy", "true");
    try {
      await ctl(b.dataset.duyet ? "/chat/duyet" : "/chat/tu-choi", { workspace: duAn, who, id });
      if (conNguCanh(duAn, who)) bao(b.dataset.duyet ? ((PHONG[who] && PHONG[who].ten) || who) + " bắt đầu làm." : "Đã từ chối.");
    } catch (err) { if (conNguCanh(duAn, who)) ghiLoi(err.message); }
    if (!conNguCanh(duAn, who)) return;
    veCuoi = "";   // vẽ lại kể cả khi dữ liệu không đổi (bật lại nút sau lỗi)
    veTraLoi();
    const o = $("noiDung"); if (o) o.focus();
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
    if (b.dataset.duyet || b.dataset.tuChoi) return xuLyXin(b);
    if (b.dataset.file) return xuLyFile(b);
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
