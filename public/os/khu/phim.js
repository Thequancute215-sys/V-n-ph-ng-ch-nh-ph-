// Xưởng phim (Thế Quân OS): tách rõ 3 phần trên thanh bên thay vì dồn một trang dài:
//   1. Kịch bản và giọng đọc (#/phim): Làm phim tự động, Hồ sơ & ngân sách, Cổng 1, lời dẫn & nghe giọng đọc.
//   2. Phân cảnh và quay (#/phim/canh): Cổng 2, Trạm Google Flow, tạo/chọn khung hình và quay/chọn take từng cảnh.
//   3. Bàn dựng và xuất xưởng (#/phim/ban-dung): Bàn dựng FFmpeg, máy đo LUFS, nghiệm thu Claude, Cổng 3–4 & file xuất.
// Mọi lần tốn tiền đều hỏi lại số tiền trước khi gọi; luật chặn thật nằm ở ctl (cổng 1–2, ngân sách, số take tối đa).
import { esc, usd, luc, dangTai, rong, loi, ctl as ctlMacDinh, bao as baoMacDinh } from "../ui.js";
import { veBlender, veHelper } from "./phim-helper-ui.js";

const TT = { viet: "đang viết", co_khung: "có khung", cho_quay: "chờ quay", da_quay: "đã quay", da_chon: "đã chọn take" };
const NHIP = { "chuan-bi": "Chuẩn bị", tao: "Tạo", "tai-ve": "Tải về" };
const HOI_NHIP = { "chuan-bi": "Opus mở Flow, tải ảnh lên, dán prompt, dừng trước nút tạo rồi báo anh.", tao: "Opus bấm tạo đúng một lần (tốn credit gói Google), chờ xong rồi báo.", "tai-ve": "Opus tải clip vừa tạo về, văn phòng gắn vào cảnh." };
const HOI_CONG = { 1: "Duyệt kịch bản và phân cảnh?", 2: "Duyệt khung chính và khoản quay? Sau cổng này văn phòng mới cho quay.", 3: "Duyệt bản dựng này?", 4: "Xuất xưởng phim này? File cuối nằm trong media/xuat/; anh tự tải và tự đăng." };
const CONG_DOAN = [["kich_ban", "Kịch bản", "Hinata"], ["cong_1", "Cổng 1", "anh duyệt"], ["giong", "Giọng đọc", "máy"], ["khung", "Ảnh nhân vật, khung", "máy ảnh GPT"],
  ["cong_2", "Cổng 2", "anh chọn khung"], ["quay", "Quay", "máy quay"], ["dung", "Dựng", "máy"], ["cong_3", "Cổng 3", "anh duyệt"], ["nghiem_thu", "Nghiệm thu", "Claude"], ["cong_4", "Cổng 4", "xuất xưởng"]];
const TT_LUONG = {
  dang_chay: [null, "Đang làm"],
  cho_cong_1: ["cong_1", "Chờ anh duyệt kịch bản ở Cổng 1 bên dưới."],
  cho_cong_2: ["cong_2", "Chờ anh chọn khung cho từng cảnh rồi duyệt Cổng 2 ở phần Phân cảnh và quay."],
  cho_flow: ["quay", "Chờ quay ở trạm Google Flow: mỗi cảnh anh bấm 3 nhịp ở phần Phân cảnh và quay."],
  cho_chon_take: ["quay", "Có cảnh nhiều take: anh chọn take ở phần Phân cảnh và quay."],
  cho_cong_3: ["cong_3", "Chờ anh xem bản dựng và duyệt Cổng 3 ở phần Bàn dựng và xuất xưởng."],
  cho_cong_4: ["cong_4", "Nghiệm thu xong. Chờ anh duyệt Cổng 4 ở phần Bàn dựng và xuất xưởng."],
  can_anh: [null, "Cần anh xem: luồng dừng vì gặp việc không tự làm được."],
  dung: [null, "Đã dừng theo lệnh anh."],
  xong: ["cong_4", "Xong: phim đã xuất xưởng, file ở media/xuat/."],
  loi: [null, "Lỗi, luồng dừng."],
};
const LINK_LUONG = {
  cho_cong_1: ["#/phim", "Tới Cổng 1 (Kịch bản)"],
  cho_cong_2: ["#/phim/canh", "Mở Phân cảnh và quay"],
  cho_flow: ["#/phim/canh", "Mở Phân cảnh và quay"],
  cho_chon_take: ["#/phim/canh", "Mở Phân cảnh và quay"],
  cho_cong_3: ["#/phim/ban-dung", "Mở Bàn dựng và xuất xưởng"],
  cho_cong_4: ["#/phim/ban-dung", "Mở Bàn dựng và xuất xưởng"],
};
const PHAN_DUONG = { "kich-ban": "#/phim", canh: "#/phim/canh", "ban-dung": "#/phim/ban-dung" };

const takeSan = (c) => c.take_chon || ((c.take || []).length === 1 ? c.take[0] : null);

function docTep(file) {
  if (file.size > 16 * 1024 * 1024) return Promise.reject(Error(file.name + " vượt 16 MiB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(Error("Không đọc được " + file.name));
    reader.readAsDataURL(file);
  });
}

export async function moKhuPhim(vung, { ctl = ctlMacDinh, bao = baoMacDinh, signal, phan = "kich-ban" } = {}) {
  let ws = "", data = null, flow = null, nghiemThu = null, loiTai = "", ban = false, hen = null, conSong = true, dsPhim = null, kyCu = "", phien = 0;
  let taiLieu = [], loiTaiLieu = "", xem = null, goi = null;
  let gocHelper = [], helperNhanVat = "";
  const helperUI = { tab: "nhan-vat", styles: [], canh: "", frames: [], compareA: "", compareB: "", goi: null };
  let dangGhi = null, dangPhat = null;
  vung.innerHTML = `<div class="vung" id="phim">${dangTai(4)}</div>`;
  const goc = vung.querySelector("#phim");
  const media = (rel, v) => "/ctl/phim/media?workspace=" + encodeURIComponent(ws) + "&path=" + encodeURIComponent(rel) + (v ? "&v=" + encodeURIComponent(v) : "");
  const tep = (id) => "/ctl/phim/tai-lieu/tep?workspace=" + encodeURIComponent(ws) + "&id=" + encodeURIComponent(id);

  async function batDau() {
    let ds = null;
    try { ds = (await ctl("/phim/du-an")).duAn || []; }
    catch (e) { if (conSong) goc.innerHTML = loi(e.message); return; }
    if (!conSong) return;
    dsPhim = ds;
    if (!dsPhim.length) { goc.innerHTML = rong("Chưa có phim nào", "Tạo phim ở Kho phim: đặt tên, chọn loại, văn phòng dựng sẵn phim.json.", `<a class="nut" href="#/phim/kho">Mở Kho phim</a>`); return; }
    if (phan === "kich-ban") {
      try { const schema = await ctl("/phim/helper/goc"); gocHelper = schema.goc || []; helperUI.styles = schema.phongCach || []; } catch {}
      if (!conSong) return;
    }
    let nho = ""; try { nho = localStorage.getItem("tqos-phim") || ""; } catch {}
    ws = dsPhim.some((d) => d.path === nho) ? nho : dsPhim[0].path;
    tai();
  }

  async function tai() {
    clearTimeout(hen);
    if (!conSong) return;
    const mine = ++phien, reqWs = ws;
    if (!document.hidden) {
      let nextData = data, nextLoi = "", nextFlow = null, nextNt = nghiemThu;
      try { nextData = await ctl("/phim?workspace=" + encodeURIComponent(reqWs)); } catch (e) { nextLoi = e.message; }
      if (!conSong || mine !== phien || ws !== reqWs) return;
      if (phan === "kich-ban") {
        let ds = [], error = "";
        try { ds = (await ctl("/phim/tai-lieu?workspace=" + encodeURIComponent(reqWs))).taiLieu || []; }
        catch (e) { error = e.message; }
        if (!conSong || mine !== phien || ws !== reqWs) return;
        taiLieu = ds; loiTaiLieu = error;
      }
      if (phan === "canh") {
        try { nextFlow = (await ctl("/flow")).flow; } catch { nextFlow = null; }
        if (!conSong || mine !== phien || ws !== reqWs) return;
      }
      if (phan === "ban-dung" && nextData && nextData.banDung && nextData.banDung.banDung) {
        try { nextNt = (await ctl("/fs/read?workspace=" + encodeURIComponent(reqWs) + "&path=" + encodeURIComponent("media/xuat/nghiem-thu.md"))).content || null; }
        catch { nextNt = null; }
        if (!conSong || mine !== phien || ws !== reqWs) return;
      } else if (phan === "ban-dung") nextNt = null;
      data = nextData; loiTai = nextLoi; flow = nextFlow; nghiemThu = nextNt;
      // Không vẽ lại khi dữ liệu không đổi hoặc anh đang xem/nghe một clip hay giọng đọc.
      const ky = JSON.stringify([phan, data, flow, nghiemThu, loiTai, taiLieu, loiTaiLieu, goi]);
      const dangXem = [...goc.querySelectorAll("video, audio")].some((v) => v.paused === false && !v.ended);
      if (ky !== kyCu && !dangXem && !xem && !ban && !dangGhi && !dangPhat) { kyCu = ky; ve(); }
    }
    if (!conSong || mine !== phien || ws !== reqWs) return;
    const ban2 = data && (data.blender?.dang || data.mayQuay.dang || (data.banDung && data.banDung.dang) || (data.luong && data.luong.trangThai === "dang_chay")) || (flow && flow.nhipDang);
    hen = setTimeout(tai, ban2 ? 4000 : 20000);
  }

  function veDauTrang(p, k, bd) {
    const chon = `<div class="hang"><label for="chonPhim" class="mo">Phim</label><select class="o" id="chonPhim">${dsPhim.map((d) => `<option value="${esc(d.path)}"${d.path === ws ? " selected" : ""}>${esc(d.ten)}</option>`).join("")}</select>` +
      `<a class="nut nho" href="#/phim/kho">Kho phim</a><button type="button" class="nut nho" data-tai-lai>Tải lại</button><span class="mo">Mọi khoản tốn tiền đều hỏi lại trước khi gọi.</span></div>`;
    if (!p) return chon;
    const dsCanh = p.canh || [];
    const daKhung = dsCanh.filter((c) => !!c.khung_chon).length;
    const daTake = dsCanh.filter((c) => !!takeSan(c)).length;
    const c1 = bd?.cong?.[0]?.duyet, c2 = bd?.cong?.[1]?.duyet, c3 = bd?.cong?.[2]?.duyet, c4 = bd?.cong?.[3]?.duyet;
    const coGiong = dsCanh.length > 0 && !(k?.canhBao || []).some((w) => w.ma === "CHUA_CO_GIONG");
    const buoc = `<nav class="phim-buoc" aria-label="Các bước Xưởng phim">
      <a href="#/phim"${phan === "kich-ban" ? ' aria-current="page"' : ""}>
        <b>1. Kịch bản và giọng đọc</b>
        <small>${dsCanh.length} cảnh · ${coGiong ? "đã có giọng đọc" : "chưa có giọng đọc"} · Cổng 1: ${c1 ? "đã duyệt" : "chờ duyệt"}</small>
      </a>
      <a href="#/phim/canh"${phan === "canh" ? ' aria-current="page"' : ""}>
        <b>2. Phân cảnh và quay</b>
        <small>Khung ${daKhung}/${dsCanh.length} · Take ${daTake}/${dsCanh.length} · Cổng 2: ${c2 ? "đã duyệt" : "chờ duyệt"}</small>
      </a>
      <a href="#/phim/ban-dung"${phan === "ban-dung" ? ' aria-current="page"' : ""}>
        <b>3. Bàn dựng và xuất xưởng</b>
        <small>${bd?.banDung ? (bd.cu ? "bản dựng cũ" : "đã có bản dựng") : "chưa dựng"} · Cổng 3: ${c3 ? "đã duyệt" : "chờ"} · Cổng 4: ${c4 ? "xuất xưởng" : "chờ"}</small>
      </a>
    </nav>`;
    return chon + buoc;
  }

  function veCong(bd, cacSo, tieuDe, ghiChu = "") {
    if (!bd) {
      return `<section class="khoi"><div class="dau-hang"><h2 class="dau">Cổng duyệt và bàn dựng</h2></div>` +
        `<div class="canh-bao">Bộ điều khiển (ctl) đang chạy bản chưa có bàn dựng. Cập nhật văn phòng lên bản có Xưởng phim P3 rồi khởi động lại ctl để duyệt cổng và dựng phim.</div></section>`;
    }
    const items = bd.cong.filter((g) => cacSo.includes(g.so));
    const luoiLop = items.length === 1 ? "" : ' class="cong-hang" style="grid-template-columns:repeat(' + items.length + ',minmax(0,1fr))"';
    return `<section class="khoi" aria-labelledby="hCong-${cacSo.join("-")}"><div class="dau-hang"><h2 class="dau" id="hCong-${cacSo.join("-")}">${esc(tieuDe)}</h2>${ghiChu ? `<span class="mo">${esc(ghiChu)}</span>` : ""}</div><div${luoiLop}>` +
      items.map((g) => `<div class="cong-o${g.duyet ? " da" : ""}"><span class="so-cong">Cổng ${g.so}</span><b>${esc(g.ten)}</b>` +
        (g.duyet ? `<span class="dat">Đã duyệt${g.luc ? ", " + esc(luc(g.luc)) : ""}</span><div class="hang"><button type="button" class="nut nho" data-cong="${g.so}" data-duyet="0">Bỏ duyệt</button></div>`
          : `${g.canDuyetLai ? '<span class="canh-bao">Phương án đã đổi, cần duyệt lại.</span>' : ""}<div class="hang">${g.duoc
            ? `<button type="button" class="nut-chinh" data-cong="${g.so}" data-duyet="1">${g.canDuyetLai ? "Duyệt lại Cổng 2" : "Duyệt cổng " + g.so}</button>`
            : `<span class="ly">${esc(g.lyDo)}</span>`}${g.canDuyetLai ? '<button class="nut nho" type="button" data-cong="2" data-duyet="0">Bỏ duyệt</button>' : ""}</div>`) + `</div>`).join("") + `</div></section>`;
  }

  function veLuong(L, p, gon = false) {
    if (L === undefined) return "";
    const coCanh = (p.canh || []).length > 0;
    if (!L || ["dung", "loi"].includes(L.trangThai)) {
      if (gon) return "";
      const truoc = L ? `<div class="${L.trangThai === "xong" ? "dat" : L.trangThai === "loi" ? "hong" : "mo"}">Lần chạy trước: ${esc((TT_LUONG[L.trangThai] || [, L.trangThai])[1])}${L.loi ? " " + esc(L.loi) : ""}</div>` : "";
      return `<section class="khoi" aria-labelledby="hLuong"><div class="dau-hang"><h2 class="dau" id="hLuong">Làm phim tự động</h2>
        <span class="mo">Hinata viết kịch bản, máy làm giọng đọc và ảnh (GPT, miễn phí), quay, dựng, Claude nghiệm thu. Văn phòng dừng ở 4 cổng chờ anh duyệt; mọi khoản tốn tiền vẫn hỏi lại.</span></div>${truoc}
        <form id="fLuong" class="bieu-mau" novalidate>
          <label class="rong-het">Đề bài${coCanh ? " (để trống: làm tiếp từ kịch bản hiện có)" : ""}<textarea class="o" name="deBai" maxlength="4000" placeholder="Ví dụ: Phim 30 giây chúc mừng 20/11, cô giáo áo dài trắng nhận hoa trước cổng trường, giọng nữ ấm, kết bằng lời cảm ơn."></textarea></label>
          <label>Tỉ lệ<select class="o" name="ti_le"><option value="9:16">9:16 (TikTok, Reels)</option><option value="16:9">16:9 (YouTube)</option><option value="1:1">1:1</option></select></label>
          <label>Ngôn ngữ<select class="o" name="ngon_ngu"><option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option></select></label>
          <label>Độ dài (giây)<input class="o so" type="number" name="giay_muc_tieu" min="15" max="180" step="5" value="30"></label>
          <label>Máy quay<select class="o" name="may_quay"><option value="flow">Google Flow (credit gói Google, anh bấm từng nhịp)</option><option value="omni-flash">Gemini Omni (~$0,07/giây, tự quay)</option></select></label>
          <label>Ngân sách (USD)<input class="o so" type="number" name="ngan_sach_usd" min="0" max="1000" step="1" value="${esc(p.ngan_sach_usd ?? 0)}"></label>
          <div class="hang rong-het"><button type="submit" class="nut-chinh">${coCanh ? "Chạy tự động" : "Bắt đầu làm phim"}</button><span class="hong" id="loiLuong" role="alert"></span></div>
        </form></section>`;
    }
    const [dangO, cau] = TT_LUONG[L.trangThai] || [null, L.trangThai];
    const oHienTai = dangO || L.buoc;
    const vt = CONG_DOAN.findIndex(([id]) => id === oHienTai);
    const dai = `<ol class="dai-team" style="list-style:none;margin:0;padding:0">${CONG_DOAN.map(([id, ten, ai], i) =>
      `<li class="buoc"${i === vt ? ' aria-current="step"' : ""}><b>${esc(ten)}</b><small>${esc(ai)}</small>${i < vt ? '<small class="dat">xong</small>' : i === vt ? `<small class="song">${L.trangThai === "dang_chay" ? "đang làm" : "đang chờ"}</small>` : ""}</li>`).join("")}</ol>`;
    const ls = (L.lichSu || []).slice(-5).reverse();
    const dich = LINK_LUONG[L.trangThai];
    const nutChuyen = dich && dich[0] !== PHAN_DUONG[phan] ? `<a class="nut-chinh nho" href="${dich[0]}">${esc(dich[1])}</a>` : "";
    return `<section class="khoi khung-goc" aria-labelledby="hLuong"><div style="display:flex;flex-direction:column;gap:var(--space-sm)">
      <div class="dau-hang"><h2 class="dau" id="hLuong">Luồng làm phim tự động</h2><span class="mo">bắt đầu ${esc(luc(L.batDau))}</span>
        ${["dung", "xong", "loi"].includes(L.trangThai) ? "" : '<button type="button" class="nut nho nguy" data-dung-luong style="margin-left:auto">Dừng luồng</button>'}</div>
      ${gon ? "" : dai}
      <div class="${L.trangThai.startsWith("cho_") ? "canh-bao" : L.trangThai === "loi" || L.trangThai === "can_anh" ? "hong" : "song"}" role="status">${esc(cau)}${L.loi ? " " + esc(L.loi) : ""}</div>
      <div class="hang">${nutChuyen}${L.trangThai === "can_anh" ? '<button type="button" class="nut nho" data-tiep-luong>Tiếp tục luồng</button>' : ""}</div>
      ${!gon && ls.length ? `<details><summary class="mo">Nhật ký luồng</summary>${ls.map((x) => `<div class="mo" style="font-size:var(--text-xs)">${esc(luc(x.luc))} · ${esc(x.buoc)}: ${esc(x.ketQua)}${x.ghiChu ? " — " + esc(x.ghiChu) : ""}</div>`).join("")}</details>` : ""}
    </div></section>`;
  }

  function veKichBanVaGiong(p, k, mq, bd) {
    const ngan = Number(p.ngan_sach_usd) || 0, toiDa = (k.chiPhi && k.chiPhi.usdToiDa) || 0;
    const pt = (x) => ngan > 0 ? Math.min(1, x / ngan) : (x > 0 ? 1 : 0);
    const hoSo = `<section class="khoi" aria-labelledby="hHoSo">
      <div class="hang"><div class="dau-hang"><h2 class="dau" id="hHoSo">${esc(p.ten || "(chưa đặt tên)")}</h2><span class="mo">${esc((p.ti_le || []).join(", "))} · ngôn ngữ ${esc(p.ngon_ngu)} · máy ảnh ${esc(p.may_anh || "gpt")}</span></div></div>
      <div class="hang"><span>Đã chi máy quay Gemini <b class="so">${usd(mq.daChi)}</b> trên ngân sách</span>
        <label class="visually-hidden" for="nganSach">Ngân sách USD</label><input class="o so" type="number" id="nganSach" min="0" max="1000" step="1" value="${esc(p.ngan_sach_usd)}" style="width:96px">
        <button type="button" class="nut" data-luu-ns>Lưu ngân sách</button>
        <span class="mo">Tối đa ước tính cả phim ${usd(toiDa)}${k.chiPhi && k.chiPhi.luotFlow ? ", " + k.chiPhi.luotFlow + " lượt Flow" : ""}${k.chiPhi && k.chiPhi.soAnhGpt ? ", " + k.chiPhi.soAnhGpt + " ảnh GPT miễn phí" : ""}</span></div>
      <div class="thanh-do" role="img" aria-label="Đã chi ${usd(mq.daChi)} trên ngân sách ${usd(ngan)}"><i style="transform:scaleX(${pt(mq.daChi)})"></i></div>
      ${mq.coKhoa ? "" : `<div class="canh-bao">Chưa có khóa Gemini API (bậc trả phí): dán ở <a href="#/he/ket-noi">Kết nối</a> để dùng máy quay Gemini.</div>`}
      ${mq.dang ? `<div class="canh-bao">Đang quay ${esc(mq.dang.loai)} cảnh ${esc(mq.dang.canh)}, một clip có thể mất vài phút.</div>` : ""}
      ${mq.loiCuoi ? `<div class="hong">Lần quay trước lỗi: ${esc(mq.loiCuoi)}</div>` : ""}
      ${k.loi.length ? `<div class="hong"><b>Hồ sơ còn lỗi, chưa quay được:</b><br>${k.loi.map((l) => esc(l.chiTiet)).join("<br>")}</div>` : `<div class="dat">Hồ sơ phim hợp lệ.</div>`}
      ${k.canhBao.length ? `<div class="mo">${k.canhBao.map((w) => esc(w.chiTiet)).join("<br>")}</div>` : ""}
      ${(p.nguoi_that || []).length ? `<div><b>Người thật trong phim</b>, chỉ đánh dấu khi người đó đã đồng ý cho dùng hình:<div class="hang">` +
        p.nguoi_that.map((n) => `<label class="hang"><input type="checkbox" data-dong-y="${esc(n.ma)}"${n.dong_y ? " checked" : ""}> ${esc(n.ma)} đã đồng ý</label>`).join("") + `</div></div>` : ""}
    </section>`;

    const dsCanh = p.canh || [];
    const coGiong = dsCanh.length > 0 && !(k.canhBao || []).some((w) => w.ma === "CHUA_CO_GIONG");
    const tongGiay = dsCanh.reduce((s, c) => s + (Number(c.giay) || 0), 0);
    const giongHtml = `<section class="khoi" aria-labelledby="hGiong">
      <div class="dau-hang"><h2 class="dau" id="hGiong">Giọng đọc và lời dẫn</h2><span class="mo">${dsCanh.length} cảnh${tongGiay ? " · tổng " + Math.round(tongGiay * 100) / 100 + " giây" : ""}</span></div>
      ${coGiong
        ? `<div class="hang"><span class="dat">Đã đồng bộ giọng đọc (media/giong/voice.mp3).</span><audio class="giong-nghe" controls preload="none" src="${esc(media("media/giong/voice.mp3"))}"></audio></div>`
        : `<p class="mo">Chưa có tệp giọng đọc. Duyệt Cổng 1 rồi chạy luồng tự động (hoặc công cụ TTS của xưởng) để tạo giọng đọc và chốt thời lượng từng cảnh.</p>`}
      ${dsCanh.length ? `<div class="bang-cuon"><table class="bang"><thead><tr><th>Cảnh</th><th class="so">Giây</th><th>Câu</th><th>Lời dẫn</th><th>Mô tả khung hình</th><th>Máy quay</th></tr></thead><tbody>` +
        dsCanh.map((c) => `<tr><td><b>${esc(c.ma)}</b></td><td class="so">${c.giay ? esc(c.giay) + "s" : "—"}</td><td class="so mo">${esc((c.cau || []).join(", ") || "—")}</td><td>${esc(c.loi_dan || "(không lời)")}</td><td class="mo">${esc(c.khung_hinh || "(chưa có)")}</td><td><span class="nhan">${esc(c.may_quay || p.may_quay_mac_dinh || "flow")}</span></td></tr>`).join("") +
        `</tbody></table></div><div class="hang"><a class="nut-chinh" href="#/phim/canh">Sang bước 2: Phân cảnh và quay →</a></div>`
        : rong("Phim chưa có cảnh nào", "Nhập đề bài ở mục Làm phim tự động phía trên để Hinata viết kịch bản và phân cảnh.")}
    </section>`;

    return veTaiLieu(p) + veHelper(p, taiLieu, gocHelper, helperNhanVat, { media, tep, state: helperUI }) +
      veBlender(p, data.blender || {}, taiLieu, bd, media) + veLuong(data.luong, p, false) + hoSo +
      veCong(bd, [1], "Cổng 1 · Duyệt kịch bản", "Duyệt kịch bản xong máy mới tạo giọng đọc và khung hình") + giongHtml;
  }

  function veTaiLieu(p) {
    const rows = taiLieu.filter((item) => !/\.mp4$/i.test(item.ten)).map((item) => `<li class="hang">
        <a href="${esc(tep(item.id))}" download="${esc(item.ten)}">${esc(item.ten)}</a>
        <span class="mo">${(item.bytes / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KiB</span>
        ${item.moHinh ? `<button type="button" class="nut nho" data-xem-mo-hinh="${esc(item.id)}">Xem 3D</button>` : ""}
        ${p.mo_hinh_duyet?.id === item.id ? '<span class="nhan song">Đã duyệt</span>' : ""}
      </li>`).join("");
    return `<section class="khoi" aria-labelledby="hTaiLieuPhim">
      <h2 class="dau" id="hTaiLieuPhim">Tài liệu và mô hình</h2>
      <p class="mo">Đính kèm PDF, tài liệu Office, tệp văn bản, ZIP của dự án, ảnh hoặc GLB. Tối đa 16 MiB mỗi tệp. Với tài liệu quét, kèm bản TXT hoặc Markdown để tiện đối chiếu nguồn.</p>
      <label class="hang">Chọn tệp <input class="o phim-dinh-kem" type="file" id="tepPhim" multiple accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json,.zip,.glb,.png,.jpg,.jpeg,.webp"></label>
      ${loiTaiLieu ? loi(loiTaiLieu) : rows ? `<ul class="cot-doc phim-ds-tep">${rows}</ul>` : '<p class="mo">Chưa có tệp đính kèm.</p>'}
      <dialog id="xemMoHinh" class="phim-dialog" aria-labelledby="tenMoHinh">
        <div class="hang"><h3 class="dau" id="tenMoHinh"></h3><button class="nut nho" type="button" data-dong-3d>Đóng</button></div>
        <div class="phim-khung-3d"></div>
        <p class="mo" id="trangThaiMoHinh" role="status"></p>
        <div class="hang">
          <button class="nut nho" type="button" data-xoay-3d disabled>Xoay 90°</button>
          <button class="nut nho" type="button" data-ve-goc-3d disabled>Về góc đầu</button>
          <button class="nut nho" type="button" data-anh-3d disabled>Lưu góc này làm ảnh tham chiếu</button>
          <button class="nut-chinh" type="button" data-duyet-3d disabled>Duyệt mô hình này</button>
        </div>
      </dialog>
    </section>`;
  }

  function dongXem() {
    if (!xem) return;
    const c = xem;
    xem = null;
    c.abort.abort();
    c.dialog.close();
  }

  async function moXem(id) {
    const item = taiLieu.find((x) => x.id === id && x.moHinh);
    if (!item || xem) return;
    const dialog = goc.querySelector("#xemMoHinh");
    const abort = new AbortController();
    const c = { dialog, abort, id, controls: null, name: item.ten };
    xem = c;
    const actions = dialog.querySelectorAll("[data-xoay-3d], [data-ve-goc-3d], [data-anh-3d], [data-duyet-3d]");
    for (const b of actions) b.disabled = true;
    dialog.querySelector("#tenMoHinh").textContent = item.ten;
    const status = dialog.querySelector("#trangThaiMoHinh");
    status.textContent = "Đang tải mô hình…";
    dialog.addEventListener("close", () => { if (xem === c) { dongXem(); tai(); } }, { once: true });
    dialog.showModal();
    try {
      const { xem3D } = await import("./phim-xem-3d.js");
      c.controls = await xem3D(dialog.querySelector(".phim-khung-3d"), tep(id), abort.signal);
      if (xem !== c) return;
      status.textContent = "Kéo để xoay và cuộn để phóng to.";
      for (const b of actions) b.disabled = false;
    } catch (e) {
      if (xem === c) status.textContent = "Không mở được mô hình: " + e.message;
    }
  }

  function vePhanCanhVaQuay(p, k, mq, bd) {
    const dsCanh = p.canh || [];
    const daKhung = dsCanh.filter((c) => !!c.khung_chon).length;
    const daTake = dsCanh.filter((c) => !!takeSan(c)).length;
    const tomTatChi = `<section class="khoi" aria-labelledby="hChiQuay">
      <div class="hang"><h2 class="dau" id="hChiQuay">Ngân sách &amp; máy quay</h2>
        <span class="mo">Đã chi <b class="so">${usd(mq.daChi)}</b> / ngân sách <b class="so">${usd(p.ngan_sach_usd)}</b> · Ước tính tối đa ${usd(k.chiPhi?.usdToiDa)}${k.chiPhi?.luotFlow ? " · " + k.chiPhi.luotFlow + " lượt Flow" : ""}</span>
        <a class="nut nho" href="#/phim" style="margin-left:auto">Đổi ngân sách ở Hồ sơ</a></div>
      ${mq.coKhoa ? "" : `<div class="canh-bao">Chưa có khóa Gemini API (bậc trả phí): dán ở <a href="#/he/ket-noi">Kết nối</a> nếu cần quay bằng Gemini Omni.</div>`}
      ${mq.dang ? `<div class="canh-bao">Đang tạo/quay ${esc(mq.dang.loai)} cảnh ${esc(mq.dang.canh)}…</div>` : ""}
      ${mq.loiCuoi ? `<div class="hong">Lần quay trước lỗi: ${esc(mq.loiCuoi)}</div>` : ""}
    </section>`;

    const coFlow = dsCanh.some((c) => (c.may_quay || p.may_quay_mac_dinh || "flow") === "flow");
    const tram = coFlow && flow ? `<section class="khoi" aria-labelledby="hFlow"><div class="dau-hang"><h2 class="dau" id="hFlow">Trạm Google Flow</h2><span class="mo">mỗi tài khoản một cửa sổ Chrome riêng; anh tự đăng nhập, văn phòng không gõ mật khẩu</span></div>` +
      `<table class="bang"><tbody>` + flow.taiKhoan.map((t) => { const c = t.credit; return `<tr><td><b>${esc(t.nhan)}</b></td><td class="${t.dangMo ? "song" : "mo"}">${t.dangMo ? "đang mở" : "tắt"}</td>` +
        `<td class="mo">${c ? (c.conLai === null ? "Flow không hiện số dư" : "còn " + esc(c.conLai) + " credit, đọc " + esc(luc(c.lucDoc))) + ", tháng này " + esc(c.luotTaoThang) + " lượt" : ""}</td>` +
        `<td class="so"><button type="button" class="nut nho" data-mo-flow="${esc(t.id)}">Mở trình duyệt</button></td></tr>`; }).join("") + `</tbody></table>` +
      (!flow.mcp ? `<div class="canh-bao">Chưa cài Chrome DevTools MCP (<a href="#/he/ket-noi">Kết nối</a>): Opus chưa lái được Flow.</div>` : "") +
      (flow.nhipDang ? `<div class="canh-bao">Opus đang làm nhịp ${esc(NHIP[flow.nhipDang.buoc])} cảnh ${esc(flow.nhipDang.canh)} (${esc(flow.nhipDang.taiKhoan)}).</div>` : "") +
      (flow.ketQuaCuoi ? `<div class="${flow.ketQuaCuoi.ket_qua === "xong" ? "dat" : "canh-bao"}">Nhịp vừa xong, ${esc(NHIP[flow.ketQuaCuoi.buoc])} cảnh ${esc(flow.ketQuaCuoi.canh)}: ${esc(flow.ketQuaCuoi.ket_qua)}. ${esc(flow.ketQuaCuoi.ghi_chu)}</div>` : "") + `</section>` : "";

    const canh = `<section class="khoi" aria-labelledby="hCanh"><div class="dau-hang"><h2 class="dau" id="hCanh">Phân cảnh, khung hình và take</h2><span class="mo">${dsCanh.length} cảnh · đã chọn khung ${daKhung}/${dsCanh.length} · đã có take ${daTake}/${dsCanh.length}</span></div>` +
      (dsCanh.map((c) => {
        const may = c.may_quay || p.may_quay_mac_dinh || "flow";
        const khung = (c.khung || []).map((f) => `<figure class="${c.khung_chon === f ? "chon" : ""}"><img src="${esc(media(f))}" alt="Khung ${esc(f)}" loading="lazy">` +
          `<button type="button" class="nut nho" data-chon-khung="${esc(c.ma)}" data-file="${esc(f)}">${c.khung_chon === f ? "Đã chọn" : "Chọn khung"}</button></figure>`).join("");
        const take = (c.take || []).map((f) => `<figure class="${c.take_chon === f ? "chon" : ""}"><video src="${esc(media(f))}" controls preload="metadata" playsinline></video>` +
          `<button type="button" class="nut nho" data-chon-take="${esc(c.ma)}" data-file="${esc(f)}">${c.take_chon === f ? "Take đã chọn" : "Chọn take"}</button></figure>`).join("");
        const anhGpt = (p.may_anh || "gpt") === "gpt";
        const nutKhung = may !== "dung-code" ? `<button type="button" class="nut" data-quay="${esc(c.ma)}" data-loai="khung" ${p.cong?.[2]?.luc ? "disabled" : ""}>Tạo ${c.so_phuong_an_khung || 3} khung${anhGpt ? " (GPT)" : ""}</button>` : "";
        let nutQuay = "";
        const khoaQuay = bd?.cong?.[1]?.duyet ? "" : " disabled";
        if (may === "omni-flash") nutQuay += `<button type="button" class="nut-chinh" data-quay="${esc(c.ma)}" data-loai="video"${khoaQuay}>Quay video Gemini</button>`;
        else if (may === "flow" && flow) nutQuay += `<label class="visually-hidden" for="tk-${esc(c.ma)}">Tài khoản Flow</label><select class="o" id="tk-${esc(c.ma)}" data-tk="${esc(c.ma)}">${flow.taiKhoan.map((t) => `<option value="${esc(t.id)}">${esc(t.nhan)}</option>`).join("")}</select>` +
          Object.entries(NHIP).map(([b, t], i) => `<button type="button" class="nut" data-nhip="${esc(c.ma)}" data-buoc="${b}"${b === "tao" ? khoaQuay : ""}>${i + 1}. ${t}</button>`).join("");
        else if (may !== "omni-flash") nutQuay += `<span class="mo">Máy quay ${esc(may)}: ${may === "dung-code" ? "dựng bằng code, không quay" : "chưa nối"}.</span>`;
        if ((c.take || []).length && may !== "dung-code") nutQuay += `<button type="button" class="nut" data-quay-lai="${esc(c.ma)}">Quay lại cảnh này</button>`;

        return `<div class="canh-dong">
          <div><div class="ma">${esc(c.ma)}</div><div class="mo">${c.giay ? esc(c.giay) + " giây" : "chưa chốt"}</div><div class="mo">${esc(TT[c.trang_thai] || c.trang_thai || "")}</div></div>
          <div class="cot-doc">
            <div><b>Lời dẫn:</b> ${esc(c.loi_dan || "(không lời)")}</div>
            <div class="mo"><b>Khung hình:</b> ${esc(c.khung_hinh || "(chưa có)")}</div>
            <div class="canh-nhom">
              <div class="hang"><b class="phu">Khung mở đầu (${(c.khung || []).length})</b>${c.khung_chon ? '<span class="nhan song">đã chọn khung</span>' : '<span class="nhan canh-bao">chưa chọn khung</span>'}${nutKhung}</div>
              ${khung ? `<div class="media-hang">${khung}</div>` : `<span class="mo">Chưa có ảnh khung cho cảnh này.</span>`}
            </div>
            <div class="canh-nhom">
              <div class="hang"><b class="phu">Video đã quay (${(c.take || []).length} take)</b>${takeSan(c) ? '<span class="nhan song">đã sẵn sàng dựng</span>' : '<span class="nhan">chưa có take</span>'}${nutQuay}</div>
              ${bd?.cong?.[1]?.duyet ? `<label class="hang">Nhập MP4 từ Flow hoặc phần mềm dựng <input class="o phim-dinh-kem" type="file" accept=".mp4,video/mp4" data-nhap-take="${esc(c.ma)}"></label>` : ""}
              ${take ? `<div class="media-hang">${take}</div>` : `<span class="mo">Duyệt Cổng 2 rồi quay cảnh này.</span>`}
            </div>
          </div>
        </div>`;
      }).join("") || rong("Phim chưa có cảnh nào", "Quay lại bước 1 (Kịch bản và giọng đọc) để Hinata viết phân cảnh trước.", `<a class="nut" href="#/phim">Về Kịch bản và giọng đọc</a>`)) +
      (dsCanh.length ? `<div class="hang"><a class="nut-chinh" href="#/phim/ban-dung">Sang bước 3: Bàn dựng và xuất xưởng →</a></div>` : "") + `</section>`;

    return veLuong(data.luong, p, true) + tomTatChi + veCong(bd, [2], "Cổng 2 · Chọn khung và duyệt khoản quay", `Đã chọn khung ${daKhung}/${dsCanh.length} cảnh · duyệt cổng này xong mới cho quay`) + tram + canh;
  }

  function veBanDungVaXuat(p, bd) {
    const dsCanh = p.canh || [];
    const thieuTake = dsCanh.filter((c) => !takeSan(c)).map((c) => c.ma);
    let banDungHtml = "";
    if (bd) {
      const b = bd.banDung;
      const khoaDung = !bd.coFfmpeg;
      banDungHtml = `<section class="khoi" aria-labelledby="hDung"><div class="hang"><h2 class="dau" id="hDung">Bàn dựng FFmpeg</h2><button type="button" class="nut-chinh" data-dung${khoaDung ? ' disabled aria-describedby="canhBaoFfmpeg" title="Chưa có FFmpeg: bấm Cài xưởng phim ở Kết nối trước khi dựng."' : ""}>${b ? "Dựng lại" : "Dựng bản xem thử"}</button>` +
        `<span class="mo">Miễn phí, chạy trên máy: ghép take đã chọn, phụ đề, giọng đọc, nhạc, chuẩn âm −14 LUFS.</span></div>` +
        (thieuTake.length ? `<div class="canh-bao">Còn ${thieuTake.length} cảnh chưa chọn take (${esc(thieuTake.join(", "))}): <a href="#/phim/canh">mở Phân cảnh và quay</a> để hoàn tất trước khi dựng.</div>` : dsCanh.length ? `<div class="dat">Đủ ${dsCanh.length}/${dsCanh.length} cảnh đã có take sẵn sàng dựng.</div>` : "") +
        (!bd.coFfmpeg ? `<div class="canh-bao" id="canhBaoFfmpeg">Chưa có FFmpeg: bấm Cài xưởng phim ở <a href="#/he/ket-noi">Kết nối</a>.</div>` : "") +
        (bd.dang ? `<div class="canh-bao">${esc(bd.dang.buoc)}</div>` : "") +
        (bd.loiCuoi ? `<div class="hong">Lần dựng trước lỗi: ${esc(bd.loiCuoi)}</div>` : "") +
        (b && bd.cu ? `<div class="canh-bao">Bản dựng này cũ: take hoặc thời lượng cảnh đã đổi. Bấm Dựng lại.</div>` : "") +
        (b ? b.ban.map((x) => `<div class="ban-dung-xem"><video src="${esc(media(x.file, b.luc))}" controls preload="metadata" playsinline${b.bia ? ` poster="${esc(media(b.bia, b.luc))}"` : ""}></video>` +
          `<div><table class="bang"><tbody><tr><td>Tỉ lệ</td><td class="so">${esc(x.ti_le)}</td></tr><tr><td>Thời lượng</td><td class="so">${esc(x.giay)} giây</td></tr>` +
          `<tr><td>Khung</td><td class="so">${esc(x.rong)}×${esc(x.cao)}</td></tr><tr><td>Độ to</td><td class="so">${x.lufs === null ? "không đo được" : esc(x.lufs) + " LUFS"}</td></tr>` +
          `<tr><td>Khung đen</td><td class="so">${x.khungDen.length ? "có" : "không"}</td></tr></tbody></table>` +
          (x.dat ? `<div class="dat">Máy đo đạt.</div>` : `<div class="hong">${esc(x.loi.join("; "))}</div>`) +
          `<div class="mo">Dựng ${esc(luc(b.luc))}, ${b.co_giong ? "có giọng đọc" : "chưa có giọng đọc"}, ${b.nhac ? "nhạc " + esc(b.nhac) : "không nhạc"}. File ở <code>${esc(x.file)}</code>.</div>` +
          (b.canh_bao && b.canh_bao.length ? `<div class="canh-bao">${b.canh_bao.map(esc).join("<br>")}</div>` : "") + `</div></div>`).join("")
          : rong("Chưa có bản dựng", "Chọn đủ take ở Phân cảnh và quay rồi bấm Dựng bản xem thử.", `<a class="nut nho" href="#/phim/canh">Về Phân cảnh và quay</a>`)) + `</section>`;
    }

    const ntSach = nghiemThu ? nghiemThu.replace(/^<!--[\s\S]*?-->\s*/, "") : "";
    const ntHtml = `<section class="khoi" aria-labelledby="hNghiemThu">
      <div class="dau-hang"><h2 class="dau" id="hNghiemThu">Biên bản nghiệm thu &amp; Xuất xưởng</h2><span class="mo">media/xuat/nghiem-thu.md</span></div>
      ${ntSach
        ? (globalThis.MD ? `<div class="md-xem">${globalThis.MD.render(ntSach)}</div>` : `<pre class="van-ban">${esc(ntSach)}</pre>`)
        : `<p class="mo">Sau khi anh duyệt Cổng 3, luồng tự động giao Claude soát bản dựng và ghi báo cáo nghiệm thu vào đây trước khi mở Cổng 4.</p>`}
      ${bd?.cong?.[3]?.duyet ? `<div class="dat"><b>Đã xuất xưởng:</b> tệp video hoàn chỉnh nằm tại <code>${esc(ws)}\\media\\xuat\\</code>. Anh tự kiểm và đăng tải.</div>` : ""}
    </section>`;

    const capcut = dsCanh.length && !thieuTake.length ? `<section class="khoi" aria-labelledby="hCapCut">
      <div class="hang"><h2 class="dau" id="hCapCut">Chuyển sang CapCut</h2><button class="nut nho" type="button" data-goi-capcut>Tạo gói nhập</button></div>
      <p class="mo">Nhập clip theo thứ tự trong bảng thời lượng, rồi nhập giọng đọc và SRT qua mục Phụ đề của CapCut.</p>
      ${goi ? `<p class="phu phim-capcut-path" role="status">Thư mục: <code>${esc(goi.folder)}</code></p>` : ""}
    </section>` : "";
    return veLuong(data.luong, p, true) + banDungHtml + capcut + veCong(bd, [3, 4], "Cổng 3 & Cổng 4 · Duyệt bản dựng và xuất xưởng", "Duyệt Cổng 3 để nghiệm thu; máy đo đạt thì duyệt Cổng 4 xuất xưởng") + ntHtml;
  }

  function ve() {
    if (!data) {
      goc.innerHTML = veDauTrang(null, null, null) + (loiTai ? loi(loiTai) : dangTai(4));
      return;
    }
    const p = data.phim, k = data.kiem, mq = data.mayQuay, bd = data.banDung;
    if (!Array.isArray(p.canh) || p.canh.some((c) => !c || typeof c !== "object") ||
        (p.nhan_vat != null && (!Array.isArray(p.nhan_vat) || p.nhan_vat.some((v) => !v || typeof v !== "object")))) {
      goc.innerHTML = veDauTrang(null, null, null) + loi(k.loi.map((l) => l.chiTiet).join(" · "));
      return;
    }
    const than = phan === "canh" ? vePhanCanhVaQuay(p, k, mq, bd)
      : phan === "ban-dung" ? veBanDungVaXuat(p, bd)
      : veKichBanVaGiong(p, k, mq, bd);

    goc.innerHTML = veDauTrang(p, k, bd) + (loiTai ? loi(loiTai) : "") + than;
    goc.querySelectorAll("button, input, select").forEach((el) => {
      if (el.id === "chonPhim" || el.hasAttribute("data-tai-lai")) return;
      if (el.closest("dialog")) return;
      el.disabled = el.disabled || ban || (el.hasAttribute("data-dung") && !(bd && bd.coFfmpeg));
    });
  }

  async function lam(fn, xong) {
    ban = true; ve();
    try { await fn(); if (conSong && xong) bao(xong); } catch (e) { if (conSong) bao(e.message, true); }
    finally { ban = false; kyCu = ""; if (conSong) await tai(); }
  }

  goc.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "chonPhim") {
      dongXem(); dungAnimatic(); huyGhi();
      ws = t.value;
      try { localStorage.setItem("tqos-phim", ws); } catch {}
      data = null; nghiemThu = null; taiLieu = []; loiTaiLieu = ""; goi = null; helperNhanVat = "";
      Object.assign(helperUI, { canh: "", frames: [], compareA: "", compareB: "", goi: null });
      ve(); return tai();
    }
    if (t.id === "helperNhanVat") { helperNhanVat = t.value; helperUI.frames = []; ve(); return; }
    if (t.id === "helperCanh") { dungAnimatic(); huyGhi(); Object.assign(helperUI, { canh: t.value, compareA: "", compareB: "" }); ve(); return; }
    if (t.id === "helperSoSanhA" || t.id === "helperSoSanhB") { helperUI[t.id.endsWith("A") ? "compareA" : "compareB"] = t.value; ve(); return; }
    if (t.dataset.helperGoc && t.value) {
      const params = { workspace: ws, ma: giaTri("helperNhanVat"), slot: t.dataset.helperGoc, id: t.value };
      return lam(() => ctl("/phim/helper/goc", params), "Đã chọn ảnh cho góc.");
    }
    if (["tepPhim", "helperDinhKem"].includes(t.id) && t.files?.length) {
      const files = [...t.files], workspace = ws;
      t.value = "";
      return lam(async () => {
        for (const file of files) {
          const base64 = await docTep(file);
          if (!conSong || workspace !== ws) return;
          await ctl("/phim/tai-lieu", { workspace, name: file.name, base64 });
        }
      }, "Đã đính kèm tệp.");
    }
    if (t.dataset.nhapTake && t.files?.length) {
      const file = t.files[0], canh = t.dataset.nhapTake, workspace = ws;
      t.value = "";
      return lam(async () => {
        const base64 = await docTep(file);
        if (!conSong || workspace !== ws) return;
        const { taiLieu } = await ctl("/phim/tai-lieu", { workspace, name: file.name, base64 });
        await ctl("/phim/take-nhap", { workspace, canh, id: taiLieu.id });
      }, "Đã nhập clip vào cảnh.");
    }
    if (t.dataset && t.dataset.dongY) {
      if (t.checked && !confirm(`Xác nhận ${t.dataset.dongY} đã đồng ý cho dùng hình trong phim này?`)) { t.checked = false; return; }
      lam(() => ctl("/phim/ceo", { workspace: ws, nguoiThat: { ma: t.dataset.dongY, dongY: t.checked } }), "Đã ghi đồng ý dùng hình.");
    }
  });
  const giaTri = (id) => goc.querySelector("#" + id)?.value || "";
  const daChon = (id) => !!goc.querySelector("#" + id)?.checked;

  function dungAnimatic() {
    if (!dangPhat) return;
    cancelAnimationFrame(dangPhat.frame);
    dangPhat.audio.pause();
    dangPhat.button.textContent = "Phát animatic";
    dangPhat = null;
  }

  function choiAnimatic(button) {
    if (dangPhat) { dungAnimatic(); return; }
    const { canh, ti_le: tiLe } = data.phim;
    if (!canh?.length) return;
    const box = goc.querySelector("#helperAnimatic"), audio = goc.querySelector("#helperAnimaticGiong"), image = goc.querySelector("#helperAnimaticAnh");
    const text = goc.querySelector("#helperAnimaticChu"), status = goc.querySelector("#helperAnimaticMoc");
    const items = canh.map((c) => ({ ...c, time: Math.max(1, Math.min(60, c.helper_giay || c.giay || 5)) }));
    const sum = items.reduce((s, c) => s + c.time, 0);
    const pt = { start: performance.now(), i: -1, frame: null, audio, button };
    box.dataset.ratio = tiLe?.[0] || "16:9";
    box.hidden = false;
    button.textContent = "Dừng animatic";
    dangPhat = pt;
    function go(now) {
      if (dangPhat !== pt) return;
      const t = (now - pt.start) / 1000;
      if (t >= sum) { status.textContent = "Đã hết animatic"; dungAnimatic(); return; }
      let available = 0;
      const i = items.findIndex((c) => { available += c.time; return t < available; });
      if (i !== pt.i) {
        const c = items[i]; pt.i = i;
        image.hidden = !c.khung_chon;
        if (c.khung_chon) image.src = media(c.khung_chon);
        else image.removeAttribute("src");
        text.textContent = c.loi_dan || "";
        audio.pause();
        if (c.helper_audio) { audio.src = media(c.helper_audio); audio.play().catch(() => {}); }
        else audio.removeAttribute("src");
      }
      status.textContent = `${items[i].ma} · ${t.toFixed(1)} / ${sum.toFixed(1)} giây`;
      pt.frame = requestAnimationFrame(go);
    }
    go(pt.start);
  }

  function huyGhi() {
    if (!dangGhi) return;
    const old = dangGhi;
    dangGhi = null;
    clearTimeout(old.timer);
    if (old.recorder.state !== "inactive") old.recorder.stop();
    old.stream.getTracks().forEach(track => track.stop());
  }

  async function ghiGiong(button) {
    if (dangGhi) { if (dangGhi.recorder.state !== "inactive") dangGhi.recorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder?.isTypeSupported("audio/webm")) {
      return bao("Máy chưa hỗ trợ ghi trực tiếp. Đính kèm MP3 hoặc WAV để xem thử.", true);
    }
    const params = { workspace: ws, canh: giaTri("helperCanh"), giay: Number(giaTri("helperGiayThu")) };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!conSong || ws !== params.workspace || helperUI.tab !== "giong" || giaTri("helperCanh") !== params.canh) {
        stream.getTracks().forEach(track => track.stop()); return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" }), chunks = [];
      const recording = { recorder, stream, timer: null };
      dangGhi = recording;
      const status = goc.querySelector("#helperTrangThaiGhi");
      status.textContent = "Đang ghi, tối đa 30 giây";
      button.textContent = "Dừng và lưu";
      recorder.addEventListener("dataavailable", (e) => { if (e.data.size) chunks.push(e.data); });
      recorder.addEventListener("stop", () => {
        clearTimeout(recording.timer);
        stream.getTracks().forEach(track => track.stop());
        if (dangGhi !== recording || !conSong || ws !== params.workspace) return;
        dangGhi = null;
        const audio = new File(chunks, params.canh + "-giong-thu.webm", { type: "audio/webm" });
        lam(async () => {
          const { taiLieu } = await ctl("/phim/tai-lieu", { workspace: params.workspace, name: audio.name, base64: await docTep(audio) });
          await ctl("/phim/helper/giong-thu", { ...params, id: taiLieu.id });
        }, "Đã lưu giọng thử.");
      }, { once: true });
      recorder.start();
      recording.timer = setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 30000);
    } catch (error) { huyGhi(); bao("Không ghi được micro: " + error.message, true); }
  }

  async function quayKhungHelper() {
    const opts = { workspace: ws, canh: giaTri("helperCanh"), loai: "khung", soPhuongAn: Number(giaTri("helperSoKhung")) };
    try {
      const { uocTinh } = await ctl("/phim/uoc-tinh", opts);
      if (!conSong || ws !== opts.workspace) return;
      if (!uocTinh.du) return bao("Lượt tạo khung vượt ngân sách.", true);
      const cost = uocTinh.usd > 0 ? usd(uocTinh.usd) : "0 USD, dùng hạn mức Codex";
      if (!confirm(`Tạo ${opts.soPhuongAn} khung cho ${opts.canh}? Chi phí dự kiến ${cost}.`)) return;
      return lam(() => ctl("/phim/quay", opts), "Đã bắt đầu tạo khung.");
    } catch (error) { bao(error.message, true); }
  }

  goc.addEventListener("click", async (e) => {
    if (e.target.closest("[data-helper-y-tuong]")) {
      e.preventDefault();
      const f = goc.querySelector("#fLuong textarea");
      if (f) { f.scrollIntoView({ block: "center" }); f.focus(); }
      else goc.querySelector("#hLuong")?.scrollIntoView();
      return;
    }
    const b = e.target.closest("button"); if (!b || ban) return;
    const d = b.dataset;
    const helper = { workspace: ws, ma: giaTri("helperNhanVat") };
    if (d.helperTab) { dungAnimatic(); huyGhi(); helperUI.tab = d.helperTab; ve(); return; }
    if (d.helperCanhSua) {
      const ma = giaTri("helperCanh");
      if (d.helperCanhSua === "xoa" && !confirm("Bỏ " + ma + " khỏi kịch bản?")) return;
      const info = { workspace: ws, ma, tacVu: d.helperCanhSua, loiDan: giaTri("helperLoiDan"), khungHinh: giaTri("helperKhungHinh"),
        gocMay: giaTri("helperGocMay"), giay: Number(giaTri("helperGiay")), nhanVat: [...goc.querySelectorAll("#helperNhanVatCanh option:checked")].map((x) => x.value) };
      return lam(async () => {
        const { canh } = await ctl("/phim/helper/canh", info);
        if (ws === info.workspace) helperUI.canh = info.tacVu === "xoa" ? "" : canh.ma;
      }, "Đã cập nhật kịch bản.");
    }
    if (d.helperTongMau !== undefined) {
      const args = { workspace: ws, moTa: giaTri("helperTongMau") };
      return lam(() => ctl("/phim/helper/tong-mau", args), "Đã lưu tông màu.");
    }
    if (d.helperKhungTao !== undefined) return quayKhungHelper();
    if (d.helperChonKhung) {
      const args = { workspace: ws, canh: giaTri("helperCanh"), khungChon: d.helperChonKhung };
      return lam(() => ctl("/phim/ceo", args), "Đã chọn khung chính.");
    }
    if (d.helperLuuGiong !== undefined) {
      dungAnimatic();
      const args = { workspace: ws, canh: giaTri("helperCanh"), id: giaTri("helperGiongThu"), giay: Number(giaTri("helperGiayThu")) };
      return lam(() => ctl("/phim/helper/giong-thu", args), "Đã lưu giọng và thời lượng thử.");
    }
    if (d.helperGhi !== undefined) { dungAnimatic(); return ghiGiong(b); }
    if (d.helperXemThu !== undefined) return choiAnimatic(b);
    if (d.helperGoi !== undefined) {
      dungAnimatic();
      const workspace = ws;
      return lam(async () => {
        const { goi } = await ctl("/phim/helper/goi", { workspace }, { timeout: 0 });
        if (ws === workspace) helperUI.goi = goi;
      }, "Đã chuẩn bị ZIP.");
    }
    if (d.helperNhanVat !== undefined) {
      const args = { workspace: ws, ma: giaTri("helperMa").trim(), ten: giaTri("helperTen"), moTa: giaTri("helperMoTa"),
        phongCach: giaTri("helperPhongCach"), anhSang: giaTri("helperAnhSang"), nguoiThat: daChon("helperNguoiThat"), dongY: daChon("helperDongY") };
      return lam(async () => {
        await ctl("/phim/helper/nhan-vat", args);
        if (ws === args.workspace) helperNhanVat = args.ma;
      }, "Đã thêm nhân vật.");
    }
    if (d.helperNguon !== undefined) {
      const ids = [...new Set([...goc.querySelectorAll("#helperAnhNguon option:checked")].map((item) => item.value)
        .concat([...goc.querySelectorAll("[data-helper-frame]:checked")].map((item) => item.dataset.helperFrame)))];
      if (ids.length > 3) return bao("Chọn tối đa 3 ảnh, hoặc tách 6 khung từ clip.", true);
      return lam(() => ctl("/phim/helper/nguon", { ...helper, ids }), "Đã lưu nguồn ảnh.");
    }
    if (d.helperTach !== undefined) {
      const id = giaTri("helperVideo");
      if (!id) return bao("Chọn clip MP4 trước.", true);
      return lam(async () => {
        const { frames } = await ctl("/phim/helper/tach-khung", { ...helper, id }, { timeout: 0 });
        if (helper.workspace === ws && helper.ma === giaTri("helperNhanVat")) helperUI.frames = frames;
      }, "Đã tách sáu khung. Chọn 1–3 khung rõ nhất rồi lưu nguồn.");
    }
    if (d.helperKhoa) return lam(() => ctl("/phim/helper/khoa", { ...helper, slot: d.helperKhoa, duyet: d.duyet === "1" }), "Đã cập nhật trạng thái góc.");
    if (d.helperApDung !== undefined) {
      if (!confirm("Dùng các góc đã khóa làm bộ ảnh tham chiếu của nhân vật này?")) return;
      const bo = data.phim.ai_helper?.find((v) => v.ma === helper.ma);
      const ids = gocHelper.map(({ id }) => bo?.goc[id]).filter((item) => item?.khoa).map((item) => item.id);
      return lam(() => ctl("/phim/helper/ap-dung", { ...helper, ids, xacNhan: true }), "Đã dùng bộ ảnh tham chiếu cho phim.");
    }
    if (d.helperKhung !== undefined) {
      const args = { workspace: ws, canh: giaTri("helperCanh"), id: giaTri("helperBoiCanh"), lamNen: d.helperKhung === "nen" };
      if (!args.id) return bao("Chọn ảnh bối cảnh trước.", true);
      return lam(() => ctl("/phim/helper/khung", args), args.lamNen ? "Đã lưu ảnh nền tham chiếu." : "Đã thêm phương án khung cho cảnh.");
    }
    if (d.helperPrompt) {
      try {
        const { prompt, source } = await ctl("/phim/helper/prompt", { ...helper, slot: d.helperPrompt });
        if (!conSong || helper.workspace !== ws || helper.ma !== giaTri("helperNhanVat")) return;
        const wrap = goc.querySelector("#helperPromptWrap"), field = goc.querySelector("#helperPrompt");
        if (!wrap || !field) return;
        wrap.hidden = false;
        field.value = prompt + (source.length ? "\n\nẢnh tham chiếu cần thêm: " + source.map((a) => a.ten).join(", ") : "");
        field.focus(); field.select();
      } catch (error) { bao(error.message, true); }
      return;
    }
    if (d.helperTao) {
      if (!confirm(d.helperTao === "con-trong" ? "Tạo tối đa sáu ảnh bằng GPT? Lượt này dùng hạn mức Codex." : "Tạo một ảnh bằng GPT? Lượt này dùng hạn mức Codex.")) return;
      return lam(() => ctl("/phim/helper/goi-anh", { ...helper, slot: d.helperTao, xacNhan: true }, { timeout: 0 }), "Đã xử lý các góc đã chọn.");
    }
    if (d.blenderTao !== undefined) {
      const args = { workspace: ws, id: giaTri("blenderModel"), tiLe: giaTri("blenderTiLe"), giay: Number(giaTri("blenderGiay")) };
      return lam(() => ctl("/phim/blender", args), "Blender bắt đầu dựng bản xoay.");
    }
    if (d.blenderDung !== undefined) return lam(() => ctl("/phim/blender/dung", { workspace: ws }), "Đã dừng Blender.");
    if (d.blenderGan) {
      const args = { workspace: ws, sha256: d.blenderGan, canh: giaTri("blenderCanh") };
      return lam(() => ctl("/phim/blender/gan-canh", args), "Đã gắn take. Xem ở Phân cảnh và quay.");
    }
    if (d.goiCapcut !== undefined) {
      const workspace = ws;
      return lam(async () => {
        const result = await ctl("/phim/capcut", { workspace }, { timeout: 0 });
        if (ws === workspace) goi = result.goi;
      }, "Đã tạo gói nhập CapCut.");
    }
    if (d.xemMoHinh) return moXem(d.xemMoHinh);
    if (b.hasAttribute("data-dong-3d")) { dongXem(); return tai(); }
    if (b.hasAttribute("data-xoay-3d")) return xem?.controls?.rotate();
    if (b.hasAttribute("data-ve-goc-3d")) return xem?.controls?.reset();
    if (b.hasAttribute("data-anh-3d") && xem?.controls) {
      const { id, name, controls } = xem;
      const base64 = controls.capture().split(",")[1];
      const workspace = ws;
      dongXem();
      return lam(() => ctl("/phim/tai-lieu", { workspace, name: name.slice(0, 80) + "-" + id.slice(0, 8) + ".png", base64 }), "Đã lưu ảnh tham chiếu.");
    }
    if (b.hasAttribute("data-duyet-3d") && xem?.controls) {
      const id = xem.id;
      dongXem();
      return lam(() => ctl("/phim/mo-hinh/duyet", { workspace: ws, id }), "Đã duyệt mô hình.");
    }
    if (d.taiLai !== undefined) return tai();
    if (d.thuLai !== undefined) return dsPhim ? tai() : batDau();
    if (d.tiepLuong !== undefined) return lam(() => ctl("/phim/luong", { workspace: ws }), "Đã tiếp tục luồng.");
    if (d.dungLuong !== undefined) { if (!confirm("Dừng luồng làm phim tự động? Văn phòng dừng sau bước đang làm; những gì đã làm vẫn giữ.")) return;
      return lam(() => ctl("/phim/luong/dung", { workspace: ws }), "Đã gửi lệnh dừng luồng."); }
    if (d.luuNs !== undefined) return lam(() => ctl("/phim/ceo", { workspace: ws, nganSach: Number(goc.querySelector("#nganSach").value) }), "Đã lưu ngân sách.");
    if (d.dung !== undefined) {
      if (!(data && data.banDung && data.banDung.coFfmpeg)) return bao("Chưa có FFmpeg: bấm Cài xưởng phim ở Kết nối trước khi dựng.", true);
      return lam(() => ctl("/phim/dung", { workspace: ws }), "Đang dựng. Trang tự cập nhật khi xong.");
    }
    if (d.cong) {
      const duyet = d.duyet === "1";
      const nganSach = d.cong === "2" ? `\nNgân sách phim ${usd(data.phim.ngan_sach_usd)}. Ước tính tối đa ${usd(data.kiem.chiPhi?.usdToiDa)}.` : "";
      if (!confirm(duyet ? HOI_CONG[d.cong] + nganSach : `Bỏ duyệt cổng ${d.cong}? Các cổng sau cũng bị bỏ.`)) return;
      return lam(() => ctl("/phim/cong", { workspace: ws, cong: Number(d.cong), duyet }), duyet ? `Đã duyệt cổng ${d.cong}.` : `Đã bỏ duyệt từ cổng ${d.cong}.`);
    }
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
      const tien = u.usd > 0 ? `Chi khoảng ${usd(u.usd)}, đã chi ${usd(u.daChi)}, còn ${usd(u.conLai)} trong ngân sách.` : "Miễn phí: dùng gói ChatGPT qua Codex (trừ hạn mức Codex), mỗi ảnh khoảng 2–3 phút.";
      if (!confirm(`${loai === "khung" ? "Tạo " + opts.soPhuongAn + " khung" : "Quay video"} cảnh ${c.ma} bằng ${u.moHinh}?\n${tien}`)) return;
      return lam(() => ctl("/phim/quay", opts), "Đã bắt đầu. Trang tự cập nhật khi xong.");
    }
    if (d.nhip) {
      const tk = goc.querySelector(`select[data-tk="${CSS.escape(d.nhip)}"]`).value;
      if (!confirm(`Nhịp ${NHIP[d.buoc]} cảnh ${d.nhip} (${tk}):\n${HOI_NHIP[d.buoc]}\nAnh nên nhìn cửa sổ Chrome trong lúc Opus làm.`)) return;
      return lam(() => ctl("/flow/nhip", { workspace: ws, canh: d.nhip, taiKhoan: tk, buoc: d.buoc }), "Opus bắt đầu nhịp " + NHIP[d.buoc] + ".");
    }
  });
  goc.addEventListener("submit", (e) => {
    if (e.target.id !== "fLuong") return;
    e.preventDefault();
    const f = e.target, g = (n) => f.querySelector(`[name=${n}]`).value.trim(), deBai = g("deBai");
    const coCanh = data && (data.phim.canh || []).length > 0;
    if (!deBai && !coCanh) { f.querySelector("[name=deBai]").setAttribute("aria-invalid", "true"); f.querySelector("[name=deBai]").focus(); f.querySelector("#loiLuong").textContent = "Nhập đề bài cho phim."; return; }
    const tuyChon = { ti_le: g("ti_le"), ngon_ngu: g("ngon_ngu"), giay_muc_tieu: Number(g("giay_muc_tieu")), ngan_sach_usd: Number(g("ngan_sach_usd")), may_quay: g("may_quay") };
    if (!confirm(`Bắt đầu làm phim tự động?\nHinata viết kịch bản (tốn token gói Antigravity), rồi văn phòng dừng ở cổng 1 chờ anh duyệt. Ảnh bằng GPT miễn phí; quay ${tuyChon.may_quay === "omni-flash" ? "Gemini Omni tốn tiền, trong ngân sách $" + tuyChon.ngan_sach_usd : tuyChon.may_quay === "flow" ? "Google Flow anh bấm từng nhịp" : "không quay"}.`)) return;
    lam(() => ctl("/phim/luong", { workspace: ws, deBai, tuyChon }), "Đã bắt đầu. Trang tự cập nhật theo từng công đoạn.");
  });
  const khiHien = () => { if (document.hidden) dungAnimatic(); else if (ws) tai(); };
  document.addEventListener("visibilitychange", khiHien);
  function dong() {
    if (!conSong) return;
    conSong = false;
    dungAnimatic();
    huyGhi();
    dongXem();
    phien++;
    clearTimeout(hen);
    document.removeEventListener("visibilitychange", khiHien);
  }
  signal?.addEventListener("abort", dong, { once: true });
  batDau();
  return dong;
}

export async function mo(vung, opts = {}) {
  return moKhuPhim(vung, { ...opts, phan: "kich-ban" });
}
