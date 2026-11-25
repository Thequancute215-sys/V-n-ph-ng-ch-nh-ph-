import { esc } from "../ui.js";

const option = (value, text, selected) =>
  `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(text)}</option>`;

export function veHelper(phim, taiLieu, goc, maDangChon, { media, tep, state }) {
  const nhanVat = (phim.nhan_vat || []).find((v) => v.ma === maDangChon) || phim.nhan_vat?.[0];
  const bo = (phim.ai_helper || []).find((b) => b.ma === nhanVat?.ma);
  const anh = taiLieu.filter((t) => /\.(png|jpe?g|webp)$/i.test(t.ten));
  const clips = taiLieu.filter((t) => /\.mp4$/i.test(t.ten));
  const anhCua = (id) => anh.find((t) => t.id === id);
  const dsAnh = (ids = []) => ids.map(anhCua).filter(Boolean);
  const options = (items, current) => option("", "Chọn tệp", false) + items.map((t) => option(t.id, t.ten, t.id === current)).join("");
  const soKhoa = Object.values(bo?.goc || {}).filter((s) => s.khoa).length;
  const dsGoc = goc.map(({ id, ten }) => {
    const s = bo?.goc?.[id], a = anhCua(s?.id);
    return `<li class="phim-helper-goc">
      <h3 class="dau">${esc(ten)} ${s?.khoa ? '<span class="nhan song">Đã khóa</span>' : ""}</h3>
      ${a ? `<a href="${esc(media(a.path))}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(media(a.path))}" alt="${esc(ten)}"></a>` :
        '<p class="mo">Chưa có ảnh.</p>'}
      <label class="cot-doc">Ảnh ${esc(ten)}<select class="o" data-helper-goc="${id}" ${s?.khoa ? "disabled" : ""}>${options(anh, s?.id)}</select></label>
      <div class="hang">
        <button class="nut nho" type="button" data-helper-prompt="${id}">Prompt cho Flow</button>
        <button class="nut nho" type="button" data-helper-tao="${id}" ${s?.khoa ? "disabled" : ""}>Tạo bằng GPT</button>
        ${a ? `<a class="nut nho" href="${esc(tep(a.id))}" download="${esc(a.ten)}">Tải ảnh</a>` : ""}
        ${s ? `<button class="nut nho" type="button" data-helper-khoa="${id}" data-duyet="${s.khoa ? "0" : "1"}">${s.khoa ? "Mở khóa" : "Duyệt và khóa"}</button>` : ""}
      </div>
    </li>`;
  }).join("");
  const apply = nhanVat ? `
    <label class="hang">Nhân vật <select class="o" id="helperNhanVat">${phim.nhan_vat.map(v => option(v.ma, v.ten || v.ma, v.ma === nhanVat.ma)).join("")}</select></label>
    <fieldset class="phim-helper-nguon">
      <legend>Ảnh tham chiếu gốc</legend>
      <label class="cot-doc">Chọn tối đa 3 ảnh đính kèm
        <select class="o" multiple size="4" id="helperAnhNguon">${anh.map((a) => option(a.id, a.ten, bo?.nguon?.includes(a.id))).join("")}</select>
      </label>
      <button class="nut nho" type="button" data-helper-nguon>Lưu ảnh nguồn</button>
      <label class="hang">Hoặc clip MP4 <select class="o" id="helperVideo">${options(clips)}</select></label>
      <button class="nut nho" type="button" data-helper-tach>Tách 6 khung từ clip</button>
      <label class="hang">Đính kèm ảnh hoặc clip <input type="file" class="o" id="helperDinhKem" accept=".png,.jpeg,.jpg,.webp,.mp4" multiple></label>
      ${dsAnh(state.frames?.length ? state.frames : bo?.nguon).length ? `<ul class="phim-helper-anh-nguon">${dsAnh(state.frames?.length ? state.frames : bo.nguon).map((a) => `<li>
          <a href="${esc(media(a.path))}" target="_blank" rel="noopener"><img src="${esc(media(a.path))}" alt="${esc(a.ten)}" loading="lazy"></a>
          ${state.frames?.includes(a.id) ? `<label><input type="checkbox" data-helper-frame="${esc(a.id)}" ${bo?.nguon?.includes(a.id) ? "checked" : ""}> Chọn</label>` : ""}
        </li>`).join("")}</ul>` : ""}
    </fieldset>
    <div class="hang">
      <button class="nut" type="button" data-helper-tao="con-trong">Tạo các góc còn trống bằng GPT</button>
      <button class="nut-chinh" type="button" data-helper-ap-dung ${soKhoa ? "" : "disabled"}>Dùng ${soKhoa} góc đã khóa cho phim</button>
    </div>
    <ul class="phim-helper-luoi">${dsGoc}</ul>
    <label class="cot-doc" id="helperPromptWrap" hidden>Prompt và tên ảnh tham chiếu <textarea class="o" id="helperPrompt" rows="5" readonly></textarea></label>
  ` : '<p class="mo">Thêm nhân vật để tạo bộ ảnh sáu góc.</p>';
  const newCharacter = !phim.cong?.[1]?.luc ? `
    <details>
      <summary>Thêm nhân vật</summary>
      <div class="hang">
        <label for="helperMa">Mã</label><input class="o" id="helperMa" placeholder="robot-mam" maxlength="40">
        <label for="helperTen">Tên</label><input class="o" id="helperTen" maxlength="80">
      </div>
      <label class="cot-doc">Mô tả gương mặt, màu sắc, trang phục<textarea class="o" id="helperMoTa" maxlength="600" rows="2"></textarea></label>
      <div class="hang">
        <label>Phong cách <select class="o" id="helperPhongCach">${option("", "Theo mô tả", true)}${state.styles.map((x) => option(x, x, false)).join("")}</select></label>
        <label>Ánh sáng <input class="o" id="helperAnhSang" maxlength="120"></label>
      </div>
      <label class="hang"><input type="checkbox" id="helperNguoiThat"> Dùng hình người thật</label>
      <label class="hang"><input type="checkbox" id="helperDongY"> Người đó đã đồng ý cho dùng hình</label>
      <button class="nut nho" type="button" data-helper-nhan-vat>Thêm vào hồ sơ phim</button>
    </details>` : "";
  const tabs = [["kich-ban", "Kịch bản"], ["nhan-vat", "Nhân vật"], ["khung", "Bối cảnh & khung"], ["giong", "Animatic & xuất gói"]];
  const scene = (phim.canh || []).find((c) => c.ma === state.canh) || phim.canh?.[0];
  let body;
  if (state.tab === "kich-ban") body = veCanh(phim, scene);
  else if (state.tab === "khung") body = veKhung(phim, scene, anh, options, state, media);
  else if (state.tab === "giong") body = veGiong(phim, scene, taiLieu, options, state, media);
  else body = newCharacter + apply;
  return `<section class="khoi" aria-labelledby="hPhimHelper">
    <h2 id="hPhimHelper" class="dau">AI Helper</h2>
    <nav class="hang" aria-label="Các bước AI Helper">${tabs.map(([id, label]) => `<button type="button" class="${state.tab === id ? "nut-chinh" : "nut"}" aria-pressed="${state.tab === id}" data-helper-tab="${id}">${label}</button>`).join("")}</nav>
    ${body}
  </section>`;
}

function chonCanh(phim, scene) {
  if (!scene) return '<p class="mo">Thêm cảnh ở bước Kịch bản.</p>';
  return `<label>Cảnh <select class="o" id="helperCanh">${phim.canh.map((c) => option(c.ma, c.ma, c.ma === scene.ma)).join("")}</select></label>`;
}

function veCanh(phim, c) {
  const khoa = phim.cong?.[1]?.luc ? "disabled" : "";
  return `
    <div class="hang">${chonCanh(phim, c)}
      <button class="nut nho" type="button" data-helper-canh-sua="them" ${khoa}>Thêm cảnh</button>
      <a class="nut nho" href="#hLuong" data-helper-y-tuong>Tạo kịch bản từ đề bài</a>
    </div>
    ${khoa ? '<p class="mo">Bỏ duyệt Cổng 1 trước khi chỉnh kịch bản.</p>' : ""}
    ${c ? `<div class="bieu-mau">
      <label class="rong-het">Lời dẫn <textarea class="o" id="helperLoiDan" rows="3" maxlength="1400" ${khoa}>${esc(c.loi_dan)}</textarea></label>
      <label class="rong-het">Mô tả khung hình <textarea class="o" id="helperKhungHinh" rows="3" maxlength="2000" ${khoa}>${esc(c.khung_hinh)}</textarea></label>
      <label>Góc máy <input class="o" id="helperGocMay" maxlength="200" value="${esc(c.goc_may)}" ${khoa}></label>
      <label>Thời lượng dự kiến <input type="number" class="o" id="helperGiay" min="1" max="60" step=".1" value="${esc(c.giay || 5)}" ${khoa}></label>
      <label>Nhân vật xuất hiện <select class="o" id="helperNhanVatCanh" multiple ${khoa}>${(phim.nhan_vat || []).map(v => option(v.ma, v.ten, c.nhan_vat?.includes(v.ma))).join("")}</select></label>
      <div class="hang rong-het">
        <button class="nut-chinh" type="button" data-helper-canh-sua="luu" ${khoa}>Lưu cảnh</button>
        <button class="nut nho" type="button" data-helper-canh-sua="len" ${khoa}>Lên</button>
        <button class="nut nho" type="button" data-helper-canh-sua="xuong" ${khoa}>Xuống</button>
        <button class="nut nho" type="button" data-helper-canh-sua="xoa" ${khoa}>Bỏ cảnh</button>
      </div>
    </div>` : ""}`;
}

function veKhung(phim, c, pictures, options, state, media) {
  if (!c) return chonCanh(phim, c);
  const frames = c.khung || [];
  const both = [state.compareA || frames[0], state.compareB || frames[1]].filter((source) => frames.includes(source));
  const opts = (curr) => frames.map((f, i) => option(f, "Phương án " + (i + 1), f === curr)).join("");
  const khoa = phim.cong?.[2]?.luc ? "disabled" : "";
  return `
    <div class="hang">${chonCanh(phim, c)}
      <label>Tông màu chung <input class="o" id="helperTongMau" maxlength="240" value="${esc(phim.helper_tong_mau)}" ${khoa}></label>
      <button type="button" class="nut nho" data-helper-tong-mau ${khoa}>Lưu tông màu</button>
    </div>
    <div class="hang">
      <label>Ảnh bối cảnh <select class="o" id="helperBoiCanh" ${khoa}>${options(pictures, pictures.find((p) => p.path === c.helper_boi_canh)?.id)}</select></label>
      <button type="button" class="nut nho" data-helper-khung="nen" ${khoa}>Dùng làm ảnh nền tham chiếu</button>
      <button type="button" class="nut nho" data-helper-khung="khung" ${khoa}>Thêm vào phương án khung</button>
      <label>Số phương án <select class="o" id="helperSoKhung">${[2,3,4].map(n => option(n, n, n === 3)).join("")}</select></label>
      <button type="button" class="nut-chinh" data-helper-khung-tao ${khoa}>Tạo khung chính</button>
    </div>
    ${frames.length ? `<div class="hang">
      <label>So sánh A <select class="o" id="helperSoSanhA">${opts(both[0])}</select></label>
      ${frames.length > 1 ? `<label>So sánh B <select class="o" id="helperSoSanhB">${opts(both[1])}</select></label>` : ""}
    </div>
    <div class="phim-helper-luoi">${both.map((f, i) => `<figure class="phim-helper-goc">
      <img src="${esc(media(f))}" alt="Phương án ${i + 1} của cảnh ${esc(c.ma)}">
      <button class="nut nho" type="button" data-helper-chon-khung="${esc(f)}" ${khoa}>${c.khung_chon === f ? "Khung đã chọn" : "Chọn khung"}</button>
    </figure>`).join("")}</div>` : ""}
  `;
}

function veGiong(phim, c, taiLieu, options, state, media) {
  if (!c) return chonCanh(phim, c);
  const audios = taiLieu.filter((t) => /\.(mp3|wav|webm)$/i.test(t.ten));
  return `
    <div class="hang">${chonCanh(phim, c)}
      <label>Giọng thử <select class="o" id="helperGiongThu">${options(audios, audios.find((t) => t.path === c.helper_audio)?.id)}</select></label>
      <label>Đính kèm giọng <input id="helperDinhKem" class="o" type="file" accept=".mp3,.wav,.webm"></label>
      <label>Giây xem thử <input type="number" class="o" id="helperGiayThu" min="1" max="60" step=".1" value="${esc(c.helper_giay || c.giay || 5)}"></label>
      <button class="nut nho" type="button" data-helper-luu-giong>Lưu giọng và thời lượng</button>
      <button class="nut nho" type="button" data-helper-ghi>Ghi giọng thử</button>
      <span id="helperTrangThaiGhi" role="status"></span>
    </div>
    ${c.helper_audio ? `<audio controls preload="none" src="${esc(media(c.helper_audio))}"></audio>` : ""}
    <div class="phim-helper-animatic" id="helperAnimatic" hidden>
      <img id="helperAnimaticAnh" alt="Khung diễn thử"><p id="helperAnimaticChu"></p><audio id="helperAnimaticGiong"></audio>
    </div>
    <div class="hang">
      <button class="nut-chinh" type="button" data-helper-xem-thu>Phát animatic</button>
      <span id="helperAnimaticMoc" role="status"></span>
      <button class="nut" type="button" data-helper-goi>Đóng gói ZIP</button>
      ${state.goi ? `<a class="nut" href="${esc(media(state.goi.path))}" download="phim.zip">Tải ZIP (${esc(state.goi.soTep)} tài sản)</a>` : ""}
    </div>`;
}

export function veBlender(phim, state, taiLieu, bangDung, media) {
  const models = taiLieu.filter((t) => t.moHinh);
  const clip = phim.blender_preview;
  const selected = phim.mo_hinh_duyet?.id || models[0]?.id;
  return `<section class="khoi" aria-labelledby="hPhimBlender">
    <h2 id="hPhimBlender" class="dau">Blender · Xem thử xoay 360°</h2>
    ${state.loi ? `<p class="hong" role="alert">${esc(state.loi)}</p>` : ""}
    ${state.dang ? `<p role="status">${esc(state.dang)}</p>` : ""}
    ${state.coBlender && models.length ? `<div class="hang">
      <label>Mô hình <select class="o" id="blenderModel">${models.map(t => option(t.id, t.ten, t.id === selected)).join("")}</select></label>
      <label>Tỉ lệ <select class="o" id="blenderTiLe">${["1:1", "9:16", "16:9"].map(t => option(t, t, t === "1:1")).join("")}</select></label>
      <label>Số giây <input class="o" id="blenderGiay" type="number" min="3" max="12" value="5"></label>
      <button class="nut-chinh" type="button" data-blender-tao ${state.dang ? "disabled" : ""}>Tạo bản xoay</button>
    </div>` : `<p class="mo">${models.length ? "Văn phòng chưa tìm thấy Blender đã cài." : "Đính kèm tệp GLB ở phần Tài liệu và mô hình."}</p>`}
    ${clip ? `<div class="cot-doc">
      <video class="phim-blender-video" src="${esc(media(clip.path, clip.sha256))}" preload="metadata" controls playsinline loop></video>
      <span class="mo">${esc(clip.giay)} giây · ${esc(clip.tiLe)} · Một vòng 360°</span>
      ${phim.canh?.length ? `<div class="hang">
        <label>Gắn vào cảnh <select class="o" id="blenderCanh">${phim.canh.map(c => option(c.ma, c.ma, false)).join("")}</select></label>
        <button class="nut" type="button" data-blender-gan="${esc(clip.sha256)}" ${bangDung?.cong?.[1]?.duyet ? "" : "disabled"}>Dùng bản này làm take</button>
      </div>` : ""}
    </div>` : ""}
  </section>`;
}
