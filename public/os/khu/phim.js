// Khu Phim và bàn dựng (Xưởng phim P2–P3 viết lại cho Thế Quân OS): hồ sơ phim, ngân sách, 4 cổng duyệt, bàn dựng,
// trạm Google Flow, từng cảnh với khung và take. Mọi lần tốn tiền đều hỏi lại số tiền trước khi gọi; luật chặn thật nằm ở ctl
// (cổng 1–2, ngân sách, số take tối đa), giao diện chỉ hiện và hỏi.
import { esc, usd, luc, dangTai, rong, loi, ctl, bao } from "../ui.js";

const TT = { viet: "đang viết", co_khung: "có khung", cho_quay: "chờ quay", da_quay: "đã quay", da_chon: "đã chọn take" };
const NHIP = { "chuan-bi": "Chuẩn bị", tao: "Tạo", "tai-ve": "Tải về" };
const HOI_NHIP = { "chuan-bi": "Opus mở Flow, tải ảnh lên, dán prompt, dừng trước nút tạo rồi báo anh.", tao: "Opus bấm tạo đúng một lần (tốn credit gói Google), chờ xong rồi báo.", "tai-ve": "Opus tải clip vừa tạo về, văn phòng gắn vào cảnh." };
const HOI_CONG = { 1: "Duyệt kịch bản và phân cảnh?", 2: "Duyệt khung chính và khoản quay? Sau cổng này văn phòng mới cho quay.", 3: "Duyệt bản dựng này?", 4: "Xuất xưởng phim này? File cuối nằm trong media/xuat/; anh tự tải và tự đăng." };

export async function mo(vung, { signal } = {}) {
  let ws = "", data = null, flow = null, loiTai = "", ban = false, hen = null, conSong = true, dsPhim = null, kyCu = "", phien = 0;
  vung.innerHTML = `<div class="vung" id="phim">${dangTai(4)}</div>`;
  const goc = vung.querySelector("#phim");
  const media = (rel, v) => "/ctl/phim/media?workspace=" + encodeURIComponent(ws) + "&path=" + encodeURIComponent(rel) + (v ? "&v=" + encodeURIComponent(v) : "");

  async function batDau() {
    let ds = null;
    try { ds = (await ctl("/phim/du-an")).duAn || []; }
    catch (e) { if (conSong) goc.innerHTML = loi(e.message); return; }
    if (!conSong) return;
    dsPhim = ds;
    if (!dsPhim.length) { goc.innerHTML = rong("Chưa có dự án phim nào", "Tạo một dự án loại Phim AI ở Dự án; văn phòng dựng sẵn phim.json.", `<a class="nut" href="#/code/du-an?loai=phim">Tạo dự án phim</a>`); return; }
    let nho = ""; try { nho = localStorage.getItem("tqos-phim") || ""; } catch {}
    ws = dsPhim.some((d) => d.path === nho) ? nho : dsPhim[0].path;
    tai();
  }

  async function tai() {
    clearTimeout(hen);
    if (!conSong) return;
    const mine = ++phien, reqWs = ws;
    if (!document.hidden) {
      let nextData = data, nextLoi = "", nextFlow = null;
      try { nextData = await ctl("/phim?workspace=" + encodeURIComponent(reqWs)); } catch (e) { nextLoi = e.message; }
      if (!conSong || mine !== phien || ws !== reqWs) return;
      try { nextFlow = (await ctl("/flow")).flow; } catch { nextFlow = null; }
      if (!conSong || mine !== phien || ws !== reqWs) return;
      data = nextData; loiTai = nextLoi; flow = nextFlow;
      // Không vẽ lại khi dữ liệu không đổi hoặc anh đang xem một clip: vẽ lại sẽ tạo video mới và mất chỗ đang xem.
      const ky = JSON.stringify([data, flow, loiTai]);
      const dangXem = [...goc.querySelectorAll("video")].some((v) => !v.paused && !v.ended);
      if (ky !== kyCu && !dangXem) { kyCu = ky; ve(); }
    }
    if (!conSong || mine !== phien || ws !== reqWs) return;
    const ban2 = data && (data.mayQuay.dang || (data.banDung && data.banDung.dang)) || (flow && flow.nhipDang);
    hen = setTimeout(tai, ban2 ? 4000 : 20000);
  }

  function ve() {
    const chon = `<div class="hang"><label for="chonPhim" class="mo">Phim</label><select class="o" id="chonPhim">${dsPhim.map((d) => `<option value="${esc(d.path)}"${d.path === ws ? " selected" : ""}>${esc(d.ten)}</option>`).join("")}</select>` +
      `<button type="button" class="nut" data-tai-lai>Tải lại</button><span class="mo">Mọi lần tốn tiền đều hỏi lại số tiền trước. Google Flow dùng credit gói Google, Opus làm từng nhịp anh bấm.</span></div>`;
    if (!data) { goc.innerHTML = chon + (loiTai ? loi(loiTai) : dangTai(4)); return; }
    const p = data.phim, k = data.kiem, mq = data.mayQuay, bd = data.banDung;
    const ngan = Number(p.ngan_sach_usd) || 0, toiDa = (k.chiPhi && k.chiPhi.usdToiDa) || 0;
    const pt = (x) => ngan > 0 ? Math.min(1, x / ngan) : (x > 0 ? 1 : 0);

    const hoSo = `<section class="khoi" aria-labelledby="hHoSo">
      <div class="hang"><div class="dau-hang"><h2 class="dau" id="hHoSo">${esc(p.ten || "(chưa đặt tên)")}</h2><span class="mo">${esc((p.ti_le || []).join(", "))}, ${esc(p.ngon_ngu)}</span></div></div>
      <div class="hang"><span>Đã chi máy quay Gemini <b class="so">${usd(mq.daChi)}</b> trên ngân sách</span>
        <label class="visually-hidden" for="nganSach">Ngân sách USD</label><input class="o so" type="number" id="nganSach" min="0" max="1000" step="1" value="${esc(p.ngan_sach_usd)}" style="width:96px">
        <button type="button" class="nut" data-luu-ns>Lưu ngân sách</button>
        <span class="mo">Tối đa ước tính cả phim ${usd(toiDa)}${k.chiPhi && k.chiPhi.luotFlow ? ", " + k.chiPhi.luotFlow + " lượt Flow" : ""}</span></div>
      <div class="thanh-do" role="img" aria-label="Đã chi ${usd(mq.daChi)} trên ngân sách ${usd(ngan)}"><i style="transform:scaleX(${pt(mq.daChi)})"></i></div>
      ${mq.coKhoa ? "" : `<div class="canh-bao">Chưa có khóa Gemini API (bậc trả phí): dán ở <a href="#/he/ket-noi">Kết nối</a> để dùng máy quay Gemini.</div>`}
      ${mq.dang ? `<div class="canh-bao">Đang quay ${esc(mq.dang.loai)} cảnh ${esc(mq.dang.canh)}, một clip có thể mất vài phút.</div>` : ""}
      ${mq.loiCuoi ? `<div class="hong">Lần quay trước lỗi: ${esc(mq.loiCuoi)}</div>` : ""}
      ${k.loi.length ? `<div class="hong"><b>Hồ sơ còn lỗi, chưa quay được:</b><br>${k.loi.map((l) => esc(l.chiTiet)).join("<br>")}</div>` : `<div class="dat">Hồ sơ phim hợp lệ.</div>`}
      ${k.canhBao.length ? `<div class="mo">${k.canhBao.map((w) => esc(w.chiTiet)).join("<br>")}</div>` : ""}
      ${(p.nguoi_that || []).length ? `<div><b>Người thật trong phim</b>, chỉ đánh dấu khi người đó đã đồng ý cho dùng hình:<div class="hang">` +
        p.nguoi_that.map((n) => `<label class="hang"><input type="checkbox" data-dong-y="${esc(n.ma)}"${n.dong_y ? " checked" : ""}> ${esc(n.ma)} đã đồng ý</label>`).join("") + `</div></div>` : ""}
    </section>`;

    const thieuP3 = bd ? "" : `<section class="khoi"><div class="dau-hang"><h2 class="dau">Cổng duyệt và bàn dựng</h2></div>` +
      `<div class="canh-bao">Bộ điều khiển (ctl) đang chạy bản chưa có bàn dựng. Cập nhật văn phòng lên bản có Xưởng phim P3 rồi khởi động lại ctl để duyệt cổng và dựng phim.</div></section>`;
    const cong = bd ? `<section class="khoi" aria-labelledby="hCong"><div class="dau-hang"><h2 class="dau" id="hCong">Cổng duyệt</h2><span class="mo">theo thứ tự; bỏ một cổng thì các cổng sau cũng bỏ</span></div><div class="cong-hang">` +
      bd.cong.map((g) => `<div class="cong-o${g.duyet ? " da" : ""}"><span class="so-cong">Cổng ${g.so}</span><b>${esc(g.ten)}</b>` +
        (g.duyet ? `<span class="dat">Đã duyệt${g.luc ? ", " + esc(luc(g.luc)) : ""}</span><button type="button" class="nut nho" data-cong="${g.so}" data-duyet="0">Bỏ duyệt</button>`
          : g.duoc ? `<button type="button" class="nut-chinh" data-cong="${g.so}" data-duyet="1">Duyệt</button>` : `<span class="ly">${esc(g.lyDo)}</span>`) + `</div>`).join("") + `</div></section>` : "";

    let banDung = "";
    if (bd) {
      const b = bd.banDung;
      const khoaDung = !bd.coFfmpeg;
      banDung = `<section class="khoi" aria-labelledby="hDung"><div class="hang"><h2 class="dau" id="hDung">Bàn dựng</h2><button type="button" class="nut-chinh" data-dung${khoaDung ? ' disabled aria-describedby="canhBaoFfmpeg" title="Chưa có FFmpeg: bấm Cài xưởng phim ở Kết nối trước khi dựng."' : ""}>${b ? "Dựng lại" : "Dựng bản xem thử"}</button>` +
        `<span class="mo">Miễn phí, chạy trên máy: ghép take đã chọn, phụ đề, giọng đọc, nhạc, chuẩn âm −14 LUFS.</span></div>` +
        (!bd.coFfmpeg ? `<div class="canh-bao" id="canhBaoFfmpeg">Chưa có FFmpeg: bấm Cài xưởng phim ở <a href="#/he/ket-noi">Kết nối</a>.</div>` : "") +
        (bd.dang ? `<div class="canh-bao">${esc(bd.dang.buoc)}</div>` : "") +
        (bd.loiCuoi ? `<div class="hong">Lần dựng trước lỗi: ${esc(bd.loiCuoi)}</div>` : "") +
        (b && bd.cu ? `<div class="canh-bao">Bản dựng này cũ: take hoặc thời lượng cảnh đã đổi. Bấm Dựng lại.</div>` : "") +
        (b ? b.ban.map((x) => `<div class="ban-dung-xem"><video src="${esc(media(x.file, b.luc))}" controls preload="metadata" playsinline${b.bia ? ` poster="${esc(media(b.bia, b.luc))}"` : ""}></video>` +
          `<div><table class="bang"><tbody><tr><td>Tỉ lệ</td><td class="so">${esc(x.ti_le)}</td></tr><tr><td>Thời lượng</td><td class="so">${esc(x.giay)} giây</td></tr>` +
          `<tr><td>Khung</td><td class="so">${esc(x.rong)}×${esc(x.cao)}</td></tr><tr><td>Độ to</td><td class="so">${x.lufs === null ? "không đo được" : esc(x.lufs) + " LUFS"}</td></tr>` +
          `<tr><td>Khung đen</td><td class="so">${x.khungDen.length ? "có" : "không"}</td></tr></tbody></table>` +
          (x.dat ? `<div class="dat">Máy đo đạt.</div>` : `<div class="hong">${esc(x.loi.join("; "))}</div>`) +
          `<div class="mo">Dựng ${esc(luc(b.luc))}, ${b.co_giong ? "có giọng đọc" : "chưa có giọng đọc"}, ${b.nhac ? "nhạc " + esc(b.nhac) : "không nhạc"}. File ở media/xuat/ của phim.</div>` +
          (b.canh_bao && b.canh_bao.length ? `<div class="canh-bao">${b.canh_bao.map(esc).join("<br>")}</div>` : "") + `</div></div>`).join("")
          : rong("Chưa có bản dựng", "Chọn take cho từng cảnh rồi bấm Dựng bản xem thử.")) + `</section>`;
    }

    const coFlow = (p.canh || []).some((c) => (c.may_quay || p.may_quay_mac_dinh || "flow") === "flow");
    const tram = coFlow && flow ? `<section class="khoi" aria-labelledby="hFlow"><div class="dau-hang"><h2 class="dau" id="hFlow">Trạm Google Flow</h2><span class="mo">mỗi tài khoản một cửa sổ Chrome riêng; anh tự đăng nhập, văn phòng không gõ mật khẩu</span></div>` +
      `<table class="bang"><tbody>` + flow.taiKhoan.map((t) => { const c = t.credit; return `<tr><td><b>${esc(t.nhan)}</b></td><td class="${t.dangMo ? "song" : "mo"}">${t.dangMo ? "đang mở" : "tắt"}</td>` +
        `<td class="mo">${c ? (c.conLai === null ? "Flow không hiện số dư" : "còn " + esc(c.conLai) + " credit, đọc " + esc(luc(c.lucDoc))) + ", tháng này " + esc(c.luotTaoThang) + " lượt" : ""}</td>` +
        `<td class="so"><button type="button" class="nut nho" data-mo-flow="${esc(t.id)}">Mở trình duyệt</button></td></tr>`; }).join("") + `</tbody></table>` +
      (!flow.mcp ? `<div class="canh-bao">Chưa cài Chrome DevTools MCP (<a href="#/he/ket-noi">Kết nối</a>): Opus chưa lái được Flow.</div>` : "") +
      (flow.nhipDang ? `<div class="canh-bao">Opus đang làm nhịp ${esc(NHIP[flow.nhipDang.buoc])} cảnh ${esc(flow.nhipDang.canh)} (${esc(flow.nhipDang.taiKhoan)}).</div>` : "") +
      (flow.ketQuaCuoi ? `<div class="${flow.ketQuaCuoi.ket_qua === "xong" ? "dat" : "canh-bao"}">Nhịp vừa xong, ${esc(NHIP[flow.ketQuaCuoi.buoc])} cảnh ${esc(flow.ketQuaCuoi.canh)}: ${esc(flow.ketQuaCuoi.ket_qua)}. ${esc(flow.ketQuaCuoi.ghi_chu)}</div>` : "") + `</section>` : "";

    const canh = `<section class="khoi" aria-labelledby="hCanh"><div class="dau-hang"><h2 class="dau" id="hCanh">Cảnh</h2><span class="mo">${(p.canh || []).length} cảnh</span></div>` + ((p.canh || []).map((c) => {
      const may = c.may_quay || p.may_quay_mac_dinh || "flow";
      const khung = (c.khung || []).map((f) => `<figure class="${c.khung_chon === f ? "chon" : ""}"><img src="${esc(media(f))}" alt="Khung ${esc(f)}" loading="lazy">` +
        `<button type="button" class="nut nho" data-chon-khung="${esc(c.ma)}" data-file="${esc(f)}">${c.khung_chon === f ? "Đã chọn" : "Chọn khung"}</button></figure>`).join("");
      const take = (c.take || []).map((f) => `<figure class="${c.take_chon === f ? "chon" : ""}"><video src="${esc(media(f))}" controls preload="metadata" playsinline></video>` +
        `<button type="button" class="nut nho" data-chon-take="${esc(c.ma)}" data-file="${esc(f)}">${c.take_chon === f ? "Take đã chọn" : "Chọn take"}</button></figure>`).join("");
      let nut = "";
      if (may === "omni-flash") nut = `<button type="button" class="nut" data-quay="${esc(c.ma)}" data-loai="khung">Tạo ${c.so_phuong_an_khung || 3} khung</button><button type="button" class="nut-chinh" data-quay="${esc(c.ma)}" data-loai="video">Quay video Gemini</button>`;
      else if (may === "flow" && flow) nut = `<label class="visually-hidden" for="tk-${esc(c.ma)}">Tài khoản Flow</label><select class="o" id="tk-${esc(c.ma)}" data-tk="${esc(c.ma)}">${flow.taiKhoan.map((t) => `<option value="${esc(t.id)}">${esc(t.nhan)}</option>`).join("")}</select>` +
        Object.entries(NHIP).map(([b, t], i) => `<button type="button" class="nut" data-nhip="${esc(c.ma)}" data-buoc="${b}">${i + 1}. ${t}</button>`).join("");
      else nut = `<span class="mo">Máy quay ${esc(may)}: dựng bằng code hoặc chưa nối.</span>`;
      if ((c.take || []).length && may !== "dung-code") nut += `<button type="button" class="nut" data-quay-lai="${esc(c.ma)}">Quay lại cảnh này</button>`;
      return `<div class="canh-dong"><div><div class="ma">${esc(c.ma)}</div><div class="mo">${c.giay ? esc(c.giay) + " giây" : "chưa chốt"}</div><div class="mo">${esc(TT[c.trang_thai] || c.trang_thai || "")}</div></div>` +
        `<div style="min-width:0;display:flex;flex-direction:column;gap:var(--space-xs)"><div>${esc(c.loi_dan || "")}</div><div class="mo">Khung hình: ${esc(c.khung_hinh || "(chưa có)")}</div>` +
        (khung ? `<div class="media-hang">${khung}</div>` : "") + (take ? `<div class="media-hang">${take}</div>` : "") + `<div class="hang">${nut}</div></div></div>`;
    }).join("") || rong("Phim chưa có cảnh nào", "Hinata viết phân cảnh vào phim.json; xong thì duyệt cổng 1.")) + `</section>`;

    goc.innerHTML = chon + (loiTai ? loi(loiTai) : "") + hoSo + thieuP3 + cong + banDung + tram + canh;
    goc.querySelectorAll("button, input, select").forEach((el) => {
      if (el.id === "chonPhim" || el.hasAttribute("data-tai-lai")) return;
      el.disabled = ban || (el.hasAttribute("data-dung") && !(bd && bd.coFfmpeg));
    });
  }

  async function lam(fn, xong) {
    ban = true; ve();
    try { await fn(); if (conSong && xong) bao(xong); } catch (e) { if (conSong) bao(e.message, true); }
    finally { ban = false; kyCu = ""; if (conSong) await tai(); }
  }

  goc.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "chonPhim") { ws = t.value; try { localStorage.setItem("tqos-phim", ws); } catch {} data = null; ve(); return tai(); }
    if (t.dataset && t.dataset.dongY) {
      if (t.checked && !confirm(`Xác nhận ${t.dataset.dongY} đã đồng ý cho dùng hình trong phim này?`)) { t.checked = false; return; }
      lam(() => ctl("/phim/ceo", { workspace: ws, nguoiThat: { ma: t.dataset.dongY, dongY: t.checked } }), "Đã ghi đồng ý dùng hình.");
    }
  });
  goc.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || ban) return;
    const d = b.dataset;
    if (d.taiLai !== undefined) return tai();
    if (d.thuLai !== undefined) return dsPhim ? tai() : batDau();
    if (d.luuNs !== undefined) return lam(() => ctl("/phim/ceo", { workspace: ws, nganSach: Number(goc.querySelector("#nganSach").value) }), "Đã lưu ngân sách.");
    if (d.dung !== undefined) {
      if (!(data && data.banDung && data.banDung.coFfmpeg)) return bao("Chưa có FFmpeg: bấm Cài xưởng phim ở Kết nối trước khi dựng.", true);
      return lam(() => ctl("/phim/dung", { workspace: ws }), "Đang dựng. Trang tự cập nhật khi xong.");
    }
    if (d.cong) { const duyet = d.duyet === "1"; if (!confirm(duyet ? HOI_CONG[d.cong] : `Bỏ duyệt cổng ${d.cong}? Các cổng sau cũng bị bỏ.`)) return;
      return lam(() => ctl("/phim/cong", { workspace: ws, cong: Number(d.cong), duyet }), duyet ? `Đã duyệt cổng ${d.cong}.` : `Đã bỏ duyệt từ cổng ${d.cong}.`); }
    if (d.chonKhung) return lam(() => ctl("/phim/ceo", { workspace: ws, canh: d.chonKhung, khungChon: d.file }), "Đã chọn khung cho " + d.chonKhung + ".");
    if (d.chonTake) return lam(() => ctl("/phim/ceo", { workspace: ws, canh: d.chonTake, takeChon: d.file }), "Đã chọn take cho " + d.chonTake + ".");
    if (d.moFlow) return lam(() => ctl("/flow/" + encodeURIComponent(d.moFlow) + "/mo", {}), "Đã mở Chrome. Lần đầu anh tự đăng nhập Google trong cửa sổ đó.");
    if (d.quayLai) {
      const c = data.phim.canh.find((x) => x.ma === d.quayLai), may = c.may_quay || data.phim.may_quay_mac_dinh || "flow";
      const tien = may === "flow" ? "1 lượt tạo Flow (credit gói Google)" : "khoảng " + usd((c.giay || 0) * (may === "kling-3" ? 0.14 : 0.07));
      if (!confirm(`Cho phép quay thêm một take cảnh ${c.ma}?\nLần quay đó sẽ tốn ${tien}. Văn phòng chưa quay ngay: anh vẫn bấm quay và được hỏi lại.`)) return;
      return lam(() => ctl("/phim/quay-lai", { workspace: ws, canh: c.ma }), "Đã mở thêm một take cho " + c.ma + ".");
    }
    if (d.quay) {
      const c = data.phim.canh.find((x) => x.ma === d.quay), loai = d.loai;
      const opts = { workspace: ws, canh: c.ma, loai, soPhuongAn: loai === "khung" ? (c.so_phuong_an_khung || 3) : 1 };
      let u; try { u = (await ctl("/phim/uoc-tinh", opts)).uocTinh; } catch (err) { if (conSong) bao(err.message, true); return; }
      if (!conSong) return;
      if (!u.du) return bao(`Vượt ngân sách: lần này khoảng ${usd(u.usd)}, đã chi ${usd(u.daChi)} trên ${usd(u.nganSach)}. Nâng ngân sách trước.`, true);
      if (!confirm(`${loai === "khung" ? "Tạo " + opts.soPhuongAn + " khung" : "Quay video"} cảnh ${c.ma} bằng ${u.moHinh}?\nChi khoảng ${usd(u.usd)}, đã chi ${usd(u.daChi)}, còn ${usd(u.conLai)} trong ngân sách.`)) return;
      return lam(() => ctl("/phim/quay", opts), "Đã bắt đầu. Trang tự cập nhật khi xong.");
    }
    if (d.nhip) {
      const tk = goc.querySelector(`select[data-tk="${CSS.escape(d.nhip)}"]`).value;
      if (!confirm(`Nhịp ${NHIP[d.buoc]} cảnh ${d.nhip} (${tk}):\n${HOI_NHIP[d.buoc]}\nAnh nên nhìn cửa sổ Chrome trong lúc Opus làm.`)) return;
      return lam(() => ctl("/flow/nhip", { workspace: ws, canh: d.nhip, taiKhoan: tk, buoc: d.buoc }), "Opus bắt đầu nhịp " + NHIP[d.buoc] + ".");
    }
  });
  const khiHien = () => { if (!document.hidden && ws) tai(); };
  document.addEventListener("visibilitychange", khiHien);
  function dong() {
    if (!conSong) return;
    conSong = false;
    phien++;
    clearTimeout(hen);
    document.removeEventListener("visibilitychange", khiHien);
  }
  signal?.addEventListener("abort", dong, { once: true });
  batDau();
  return dong;
}
