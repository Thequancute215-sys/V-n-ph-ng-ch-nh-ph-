// Bàn dựng của xưởng phim (P3, bản thiết kế "Xưởng Phim AI", CEO duyệt 20/11/2026): CĐ-6 dựng, CĐ-7 máy đo, 4 cổng CEO duyệt.
// Máy dựng chạy trên máy, miễn phí: FFmpeg ghép take đã chọn của từng cảnh đúng thời lượng trong phim.json, cắt khung theo tỉ lệ
// (9:16 → 720×1280), vẽ phụ đề theo câu giọng đọc (không có giọng thì theo lời dẫn), ghi nhãn "Video tạo bằng AI" ở cuối,
// trộn tiếng clip + giọng đọc + nhạc (nhạc tự hạ khi có lời), chuẩn âm −14 LUFS, xuất media/xuat/<tỉ lệ>.mp4 và bia.jpg.
// Sau khi dựng, máy đo: thời lượng, độ phân giải, độ to (LUFS), đoạn khung đen. Kết quả ghi vào phim.json → ban_dung.
// Cổng duyệt (phim.json → cong): chỉ CEO bấm, theo thứ tự; bỏ duyệt một cổng thì bỏ luôn các cổng sau; dựng lại thì
// cổng 3–4 phải duyệt lại. Không gọi mạng, không đọc khóa, không tiêu tiền.
// Phông và chữ phụ đề nằm trong thư mục tạm của xưởng (ổ có chỗ) và gọi bằng tên tương đối: không dùng libass/fontconfig
// (trên Windows chúng ghi bộ đệm vào ổ hệ thống) và không phải thoát dấu ":" của ổ đĩa trong chuỗi bộ lọc.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { kiem, giongKhopCanh, MAY_QUAY, MAY_QUAY_MAC_DINH, duongDanHopLe, docFileTrongPhim, dauKhoanQuay } = require("../lib/phim");
const { writeAtomic } = require("../lib/ghi-file");

const err = (code, message) => Object.assign(new Error(message), { code });
const KICH_THUOC = { "9:16": { w: 720, h: 1280 }, "16:9": { w: 1280, h: 720 }, "1:1": { w: 720, h: 720 } };
const tenFile = (tiLe) => tiLe.replace(":", "x");
const FPS = 30;
const LUFS_DICH = -14;
const LECH_GIAY = 0.5;
const NHAN_AI = "Video tạo bằng AI";
const CONG = { 1: "Duyệt kịch bản", 2: "Chọn khung, duyệt khoản quay", 3: "Duyệt bản dựng", 4: "Xuất xưởng" };
const PHONG = process.platform === "win32"
  ? ["arialbd.ttf", "segoeuib.ttf", "arial.ttf"].map((f) => path.join(process.env.WINDIR || "C:\\Windows", "Fonts", f))
  : ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"];
const tron = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

function docJson(f, mac) {
  try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")); }
  catch (e) { if (e.code === "ENOENT" && mac !== undefined) return mac; throw err("BAD_REQUEST", path.basename(f) + " không đọc được: " + e.message); }
}
const coFileTrong = (root) => (rel) => {
  try { return Boolean(docFileTrongPhim(root, rel)); }
  catch (e) { if (e.code === "NOT_FOUND") return false; throw e; }
};
// Cảnh chỉ có một take thì dùng luôn take đó; nhiều take thì CEO phải chọn.
const takeDung = (c) => c.take_chon || (Array.isArray(c.take) && c.take.length === 1 ? c.take[0] : null);
const fileMedia = (rel) => typeof rel === "string" && /^media\//.test(rel) && duongDanHopLe(rel);

// Kế hoạch dựng (không chạy gì): danh sách cảnh với take, mốc bắt đầu, thời lượng; phụ đề; nhạc.
function keHoach(phim, { giong = null, coFile = () => true } = {}) {
  if (!giongKhopCanh(phim, giong)) throw err("CHUA_DUNG_DUOC", "Lời dẫn hoặc thứ tự cảnh đã đổi. Tạo lại giọng trước khi dựng.");
  const canh = Array.isArray(phim.canh) ? phim.canh : [];
  if (!canh.length) throw err("CHUA_DUNG_DUOC", "Phim chưa có cảnh nào.");
  const loi = [], ds = [];
  let t = 0;
  for (const c of canh) {
    const may = MAY_QUAY[c.may_quay || phim.may_quay_mac_dinh || MAY_QUAY_MAC_DINH];
    const tk = takeDung(c);
    if (may?.khongQuay && !tk) { loi.push(`${c.ma}: nhập và chọn clip đã render từ công cụ dựng bằng code.`); continue; }
    if (!(typeof c.giay === "number" && c.giay > 0)) { loi.push(`${c.ma}: chưa chốt thời lượng (giay).`); continue; }
    if (!tk) { loi.push(`${c.ma}: ${(c.take || []).length ? "chưa chọn take" : "chưa quay"}.`); continue; }
    if (!fileMedia(tk)) { loi.push(`${c.ma}: take phải nằm trong media/.`); continue; }
    if (!coFile(tk)) { loi.push(`${c.ma}: không thấy file ${tk}.`); continue; }
    ds.push({ ma: c.ma, take: tk, batDau: tron(t), giay: c.giay });
    t += c.giay;
  }
  if (loi.length) throw err("CHUA_DUNG_DUOC", "Chưa dựng được: " + loi.join(" "));
  const tong = tron(t);
  let phuDe;
  if (Array.isArray(giong) && giong.length) {
    phuDe = giong.filter((c) => c && typeof c.text === "string" && c.text.trim() && Number.isFinite(c.startMs) && Number.isFinite(c.endMs))
      .map((c) => ({ batDau: tron(c.startMs / 1000), ketThuc: tron(Math.min(c.endMs / 1000, tong)), chu: c.text.trim() }));
  } else {
    phuDe = ds.map((d) => { const c = canh.find((x) => x.ma === d.ma); return c.loi_dan && String(c.loi_dan).trim() ? { batDau: d.batDau, ketThuc: tron(d.batDau + d.giay), chu: String(c.loi_dan).trim() } : null; }).filter(Boolean);
  }
  phuDe = phuDe.filter((p) => p.ketThuc > p.batDau).sort((a, b) => a.batDau - b.batDau);
  phuDe = phuDe.map((p, i) => ({ ...p, ketThuc: Math.min(p.ketThuc, phuDe[i + 1]?.batDau ?? p.ketThuc) }))
    .filter((p) => p.ketThuc > p.batDau);
  let nhac = null;
  if (phim.nhac !== undefined && phim.nhac !== null) {
    const f = phim.nhac && phim.nhac.file;
    if (!fileMedia(f)) throw err("CHUA_DUNG_DUOC", "nhac.file phải là file trong media/ (ghi kèm nguồn nhạc ở nhac.nguon).");
    if (!coFile(f)) throw err("CHUA_DUNG_DUOC", "Không thấy file nhạc " + f);
    nhac = f;
  }
  return { canh: ds, tong, phuDe, nhac, take: Object.fromEntries(ds.map((d) => [d.ma, d.take])) };
}

function keHoachTrong(root, phim) {
  const coFile = coFileTrong(root);
  const voice = "media/giong/voice.json";
  const giong = coFile(voice) ? docJson(docFileTrongPhim(root, voice)) : null;
  return keHoach(phim, { giong, coFile });
}

// Ngắt dòng theo từ và ngắt cả từ quá dài để giữ lề.
function ngatDong(chu, toiDa) {
  const dong = [];
  for (const tu of String(chu).replace(/\s+/g, " ").trim().split(" ")) {
    const kyTu = Array.from(tu.normalize("NFC"));
    if (kyTu.length > toiDa) {
      for (let i = 0; i < kyTu.length; i += toiDa) dong.push(kyTu.slice(i, i + toiDa).join(""));
      continue;
    }
    const cuoi = dong.length ? dong[dong.length - 1] : null;
    if (cuoi !== null && (cuoi + " " + tu).length <= toiDa) dong[dong.length - 1] = cuoi + " " + tu;
    else dong.push(tu);
  }
  return dong;
}

function trangPhuDe(cue, toiDa) {
  const dong = ngatDong(cue.chu, toiDa);
  const soDongMoiTrang = Math.ceil(dong.length / Math.ceil(dong.length / 3));
  const tong = dong.join("").length;
  const trang = [];
  let tu = cue.batDau, daDoc = 0;
  for (let i = 0; i < dong.length; i += soDongMoiTrang) {
    const nhom = dong.slice(i, i + soDongMoiTrang);
    daDoc += nhom.join("").length;
    const den = tron(cue.batDau + (cue.ketThuc - cue.batDau) * daDoc / tong, 6);
    trang.push({ tu, den, chu: nhom.join("\n") });
    tu = den;
  }
  return trang;
}

// Lệnh FFmpeg cho một tỉ lệ. Trả về tham số, đồ thị lọc (ghi ra file trong thư mục tạm) và các file chữ phụ đề cần ghi.
// vao: { takeAbs: [đường dẫn tuyệt đối theo thứ tự cảnh], coTieng: [bool], giong: abs|null, nhac: abs|null, ra: abs, phong: bool }
function lenhDung(kh, tiLe, vao) {
  const kt = KICH_THUOC[tiLe];
  if (!kt) throw err("BAD_REQUEST", "Tỉ lệ khung không hỗ trợ: " + tiLe);
  const { w, h } = kt, T = kh.tong;
  const args = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error"];
  const g = [], chu = [];
  kh.canh.forEach((d, i) => {
    args.push("-i", vao.takeAbs[i]);
    g.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${FPS},format=yuv420p,` +
      `tpad=stop_mode=clone:stop_duration=${d.giay},trim=duration=${d.giay},setpts=PTS-STARTPTS[v${i}]`);
    g.push(vao.coTieng[i]
      ? `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${d.giay},asetpts=PTS-STARTPTS[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${d.giay}[a${i}]`);
  });
  const n = kh.canh.length;
  g.push(kh.canh.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${n}:v=1:a=1[vc][ac]`);

  // Chữ: phụ đề ở dưới, nhãn AI góc trên trong 3 giây cuối. Mỗi đoạn chữ một file (không phải thoát ký tự trong bộ lọc).
  const ve = [];
  if (vao.phong) {
    const co = Math.round(Math.min(w, h) * 0.06), toiDa = Math.max(14, Math.floor(w / (co * 0.65)) - 3);
    const chung = `fontfile=font.ttf:expansion=none:fontcolor=white:borderw=${Math.max(2, Math.round(co / 14))}:bordercolor=black@0.85:text_align=C`;
    kh.phuDe.flatMap((cue) => trangPhuDe(cue, toiDa)).forEach((p, i) => {
      const ten = `pd-${String(i + 1).padStart(3, "0")}.txt`;
      chu.push({ ten, noiDung: p.chu });
      ve.push(`drawtext=${chung}:textfile=${ten}:fontsize=${co}:line_spacing=${Math.round(co * 0.25)}:x=(w-text_w)/2:y=h-text_h-h*0.13:enable='gte(t,${p.tu})*lt(t,${p.den})'`);
    });
    chu.push({ ten: "nhan-ai.txt", noiDung: NHAN_AI });
    const coNho = Math.round(co * 0.55);
    ve.push(`drawtext=${chung}:textfile=nhan-ai.txt:fontsize=${coNho}:x=w-text_w-${Math.round(w * 0.04)}:y=${Math.round(h * 0.04)}:enable='gte(t,${tron(Math.max(0, T - 3))})'`);
  }
  g.push(ve.length ? `[vc]${ve.join(",")}[vout]` : "[vc]null[vout]");

  // Tiếng: có giọng đọc thì tiếng clip lùi về 25%; nhạc hạ tự động khi có lời (sidechain theo giọng).
  const tron2 = [];
  let k = n;
  if (vao.giong) {
    args.push("-i", vao.giong);
    g.push(`[ac]volume=0.25[nen]`);
    g.push(`[${k}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${T}${vao.nhac ? ",asplit=2[g1][g2]" : "[g1]"}`);
    tron2.push("[nen]", "[g1]");
    k++;
  } else tron2.push("[ac]");
  if (vao.nhac) {
    args.push("-stream_loop", "-1", "-i", vao.nhac);
    g.push(`[${k}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.5,atrim=duration=${T},asetpts=PTS-STARTPTS[nhac0]`);
    if (vao.giong) { g.push(`[nhac0][g2]sidechaincompress=threshold=0.02:ratio=10:attack=20:release=500[nhac]`); tron2.push("[nhac]"); }
    else tron2.push("[nhac0]");
  }
  const chuan = `loudnorm=I=${LUFS_DICH}:TP=-1.5:LRA=11,aresample=48000[aout]`;
  g.push(tron2.length > 1 ? `${tron2.join("")}amix=inputs=${tron2.length}:duration=first:normalize=0,${chuan}` : `${tron2[0]}${chuan}`);

  args.push("-/filter_complex", "do-thi.txt", "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(T), "-f", "mp4", vao.ra);
  return { args, doThi: g.join(";\n"), chu };
}

// Đọc kết quả máy đo từ stderr của lượt ebur128 + blackdetect.
function docDo(stderr) {
  const s = String(stderr || "");
  const tomTat = s.lastIndexOf("Summary:");
  const m = /I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/.exec(tomTat >= 0 ? s.slice(tomTat) : s);
  const den = [...s.matchAll(/black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)/g)].map((x) => ({ tu: tron(Number(x[1]), 2), den: tron(Number(x[2]), 2) }));
  return { lufs: m ? Number(m[1]) : null, khungDen: den };
}

// Kết luận máy đo cho một bản xuất.
function danhGia({ giay, rong, cao, lufs, khungDen }, { tiLe, tong }) {
  const kt = KICH_THUOC[tiLe], loi = [];
  if (!(Math.abs(giay - tong) <= LECH_GIAY)) loi.push(`dài ${giay} giây, kịch bản ${tong} giây`);
  if (rong !== kt.w || cao !== kt.h) loi.push(`khung ${rong}×${cao}, cần ${kt.w}×${kt.h}`);
  if (lufs === null) loi.push("không đo được độ to");
  else if (Math.abs(lufs - LUFS_DICH) > 1.5) loi.push(`độ to ${lufs} LUFS, cần ${LUFS_DICH}±1,5`);
  if (khungDen.length) loi.push("có khung đen: " + khungDen.map((d) => `${d.tu}–${d.den} giây`).join(", "));
  return { dat: !loi.length, loi };
}

// Bản dựng cũ: take đang chọn hoặc thời lượng cảnh đã khác lúc dựng.
function banDungCu(phim) {
  const b = phim.ban_dung;
  if (!b || !b.take) return false;
  const canh = Array.isArray(phim.canh) ? phim.canh : [];
  if (canh.length !== Object.keys(b.take).length) return true;
  return canh.some((c) => b.take[c.ma] !== takeDung(c) || (b.giay_canh && b.giay_canh[c.ma] !== c.giay));
}

// Trạng thái 4 cổng: đã duyệt chưa, duyệt được chưa, vì sao chưa.
function dsCong(phim, { giong = null, coFile = () => true, conDauQuay = true } = {}) {
  const cong = phim.cong && typeof phim.cong === "object" ? phim.cong : {};
  const k = kiem(phim, { giong });
  const b = phim.ban_dung, cu = banDungCu(phim);
  const ra = [];
  for (const so of [1, 2, 3, 4]) {
    let lyDo = "";
    const truoc = so > 1 ? ra[so - 2] : null;
    if (truoc && !truoc.duyet) lyDo = `Duyệt cổng ${so - 1} trước.`;
    else if (so <= 2 && !k.ok) lyDo = k.loi.length ? k.loi[0].chiTiet : "Hồ sơ phim chưa hợp lệ.";
    else if (so === 1 && !(phim.canh || []).length) lyDo = "Chưa có cảnh nào.";
    else if (so === 1 && phim.helper_giong_theo_canh === true && phim.canh.some((c) => typeof c.loi_dan !== "string" || !c.loi_dan.trim())) lyDo = "Điền lời dẫn cho từng cảnh trước khi duyệt.";
    else if (so >= 3 && !b) lyDo = "Chưa có bản dựng.";
    else if (so >= 3 && cu) lyDo = "Bản dựng cũ: take hoặc thời lượng đã đổi, dựng lại.";
    else if (so >= 3 && !(b.ban || []).every((x) => coFile(x.file))) lyDo = "Thiếu file bản dựng, dựng lại.";
    else if (so === 4 && !(b.ban || []).every((x) => x.dat)) lyDo = "Máy đo chưa đạt: " + (b.ban || []).flatMap((x) => x.loi || []).join("; ");
    const da = cong[so] && cong[so].luc;
    const canDuyetLai = so === 2 && !!da && !conDauQuay;
    const conHieuLuc = !!da && !canDuyetLai && !(so >= 3 && (cu || !b)) && (!truoc || truoc.duyet);
    ra.push({ so, ten: CONG[so], duyet: conHieuLuc, luc: da || null, duoc: !lyDo, lyDo, ...(canDuyetLai ? { canDuyetLai } : {}) });
  }
  return ra;
}

function createBanDung({ dir, audit = { log() {} }, ffmpeg = () => null, tam = () => null, run = execFile, now = () => new Date(), phong = PHONG, timeoutMs = 20 * 60 * 1000 } = {}) {
  const dang = new Map(), loiCuoi = new Map();
  const fileDuyet = dir && path.join(dir, "duyet-quay.json");
  let daDuyet = new Map();
  if (fileDuyet) {
    try { daDuyet = new Map(JSON.parse(fs.readFileSync(fileDuyet, "utf8"))); }
    catch (e) { if (e.code !== "ENOENT") audit.log("ctl", "phim.duyet_quay_loi", "", String(e.code || "INVALID_STATE")); }
  }
  function ghiDauQuay(root, dau) {
    const that = fs.realpathSync(root), moi = new Map(daDuyet);
    if (dau) moi.set(that, dau); else moi.delete(that);
    if (fileDuyet) writeAtomic(fileDuyet, JSON.stringify([...moi]));
    daDuyet = moi;
  }
  function coDuyetQuay(root, phim) {
    const dau = dauKhoanQuay(phim);
    return !!dau && daDuyet.get(fs.realpathSync(root)) === dau;
  }
  const doc = (root) => {
    const phim = docJson(path.join(root, "phim.json"));
    const giong = docJson(path.join(root, "media", "giong", "voice.json"), null);
    return { phim, giong };
  };
  const ghi = (root, phim) => writeAtomic(path.join(root, "phim.json"), JSON.stringify(phim, null, 2) + "\n", 0o644);
  const chay = (prog, args, cwd) => new Promise((resolve) => {
    run(prog, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (e, stdout, stderr) => resolve({ ok: !e, out: String(stdout || ""), err: String(stderr || ""), loi: e && e.message }));
  });
  const ffprobeOf = (ff) => path.join(path.dirname(ff), path.basename(ff).replace(/ffmpeg/i, "ffprobe"));
  const loiNgan = (r) => (r.err || r.loi || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-3).join(" | ").slice(0, 400);

  async function coTieng(fp, file) {
    const r = await chay(fp, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]);
    return r.ok && r.out.trim().length > 0;
  }
  async function doFile(ff, fp, file, cwd) {
    const p = await chay(fp, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file]);
    let j = {}; try { j = JSON.parse(p.out); } catch {}
    const v = (j.streams || []).find((s) => s.codec_type === "video") || {};
    const r = await chay(ff, ["-hide_banner", "-nostdin", "-nostats", "-i", file, "-vf", "blackdetect=d=0.5:pix_th=0.10", "-af", "ebur128=framelog=quiet", "-f", "null", "-"], cwd);
    return { giay: tron(Number(j.format && j.format.duration) || 0, 2), rong: v.width || 0, cao: v.height || 0, ...docDo(r.err) };
  }

  async function dung(root, actor = "ceo") {
    const ff = ffmpeg();
    if (!ff) throw err("THIEU_FFMPEG", "Chưa có FFmpeg: bấm Cài xưởng phim ở trang Kết nối.");
    const { phim, giong } = doc(root);
    const kh = keHoach(phim, { giong, coFile: coFileTrong(root) });
    const fp = ffprobeOf(ff);
    const goc = tam();
    if (!goc) throw err("THIEU_THU_MUC", "Chưa có thư mục gốc của xưởng phim.");
    const viec = fs.mkdtempSync(path.join((fs.mkdirSync(goc, { recursive: true }), goc), "dung-"));
    const xuat = path.join(root, "media", "xuat");
    fs.mkdirSync(xuat, { recursive: true });
    try {
      const font = phong.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
      if (font) fs.copyFileSync(font, path.join(viec, "font.ttf"));
      const takeAbs = kh.canh.map((d) => docFileTrongPhim(root, d.take));
      const tieng = [];
      for (const f of takeAbs) tieng.push(await coTieng(fp, f));
      const voice = "media/giong/voice.mp3";
      const coGiong = Array.isArray(giong) && giong.length && coFileTrong(root)(voice);
      const mp3 = coGiong ? docFileTrongPhim(root, voice) : null;
      const nhac = kh.nhac ? docFileTrongPhim(root, kh.nhac) : null;
      const tiLe = (phim.ti_le || ["9:16"]).filter((t) => KICH_THUOC[t]);
      const ban = [], canhBao = [];
      if (!font) canhBao.push("Không thấy phông chữ trên máy: bản dựng không có phụ đề và nhãn AI.");
      if (Array.isArray(giong) && giong.length && !coGiong) canhBao.push("Có voice.json nhưng thiếu voice.mp3: bản dựng chưa có giọng đọc.");
      for (const tl of tiLe) {
        dang.set(root, { buoc: "Đang dựng " + tl + "…", luc: now().toISOString() });
        const ten = tenFile(tl) + ".mp4", ra = path.join(xuat, "." + tenFile(tl) + ".dang-dung.mp4");
        const l = lenhDung(kh, tl, { takeAbs, coTieng: tieng, giong: mp3, nhac, ra, phong: !!font });
        fs.writeFileSync(path.join(viec, "do-thi.txt"), l.doThi, "utf8");
        for (const c of l.chu) fs.writeFileSync(path.join(viec, c.ten), c.noiDung, "utf8");
        const r = await chay(ff, l.args, viec);
        if (!r.ok || !fs.existsSync(ra)) { try { fs.unlinkSync(ra); } catch {} throw err("DUNG_LOI", "FFmpeg dựng " + tl + " lỗi: " + loiNgan(r)); }
        const dich = path.join(xuat, ten);
        try { fs.unlinkSync(dich); } catch {}
        fs.renameSync(ra, dich);
        dang.set(root, { buoc: "Đang đo bản " + tl + "…", luc: now().toISOString() });
        const so = await doFile(ff, fp, dich, viec);
        ban.push({ ti_le: tl, file: "media/xuat/" + ten, ...so, ...danhGia(so, { tiLe: tl, tong: kh.tong }) });
      }
      let bia = null;
      if (ban.length) {
        const r = await chay(ff, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-ss", String(tron(Math.min(1, kh.tong / 2), 2)), "-i", path.join(root, ban[0].file), "-frames:v", "1", "-q:v", "3", path.join(xuat, "bia.jpg")], viec);
        if (r.ok) bia = "media/xuat/bia.jpg"; else canhBao.push("Không tách được ảnh bìa.");
      }
      // Ghi vào hồ sơ mới nhất (CEO có thể vừa sửa hồ sơ trong lúc dựng): bản dựng mới thì cổng 3–4 duyệt lại.
      const moi = docJson(path.join(root, "phim.json"));
      const cong = { ...(moi.cong || {}) }; delete cong[3]; delete cong[4];
      moi.cong = cong;
      moi.ban_dung = { luc: now().toISOString(), tong: kh.tong, take: kh.take, giay_canh: Object.fromEntries(kh.canh.map((d) => [d.ma, d.giay])),
        co_giong: !!coGiong, nhac: kh.nhac, bia, ban, canh_bao: canhBao };
      ghi(root, moi);
      audit.log(actor, "phim.dung", path.basename(root), { tong: kh.tong, ban: ban.map((b) => ({ ti_le: b.ti_le, dat: b.dat })) });
      return moi.ban_dung;
    } finally {
      fs.rmSync(viec, { recursive: true, force: true });
    }
  }

  // Dựng chạy nền (một clip vài chục giây mất cỡ một phút): trang hỏi lại trạng thái tới khi xong.
  // Kiểm trước + giữ cờ "đang dựng" cho cả lần dựng: lỗi báo ngay (chưa chọn take, thiếu FFmpeg), không dựng chồng.
  // Kiểm ném lỗi NGAY (đồng bộ) để CEO bấm sai được báo tức thì; phần dựng trả Promise.
  function chuanBiDungVoi(root, actor) {
    if (dang.has(root)) throw err("DANG_DUNG", "Phim này đang dựng, chờ xong lần này.");
    const { phim, giong } = doc(root);
    keHoach(phim, { giong, coFile: coFileTrong(root) });
    if (!ffmpeg()) throw err("THIEU_FFMPEG", "Chưa có FFmpeg: bấm Cài xưởng phim ở trang Kết nối.");
    dang.set(root, { buoc: "Đang chuẩn bị…", luc: now().toISOString() });
    loiCuoi.delete(root);
    return dung(root, actor)
      .catch((e) => { loiCuoi.set(root, e.message); audit.log(actor, "phim.dung", path.basename(root), { ok: false, loi: String(e.message).slice(0, 200) }); throw e; })
      .finally(() => dang.delete(root));
  }
  // CEO bấm Dựng: chạy nền, trả trạng thái ngay.
  function batDauDung(root, actor = "ceo") {
    chuanBiDungVoi(root, actor).catch(() => {});
    return trangThai(root);
  }
  // Luồng phim tự chạy (ctl/luong-phim.js): cùng kiểm và cùng cờ "đang dựng", nhưng CHỜ dựng xong để biết kết quả.
  // (Gọi thẳng dung() thì cờ "đang dựng" không được gỡ: trang báo đang dựng mãi và không dựng lại được.)
  function dungVaCho(root, actor = "luong-phim") { return chuanBiDungVoi(root, actor); }

  function trangThai(root) {
    const { phim, giong } = doc(root);
    return { dang: dang.get(root) || null, loiCuoi: loiCuoi.get(root) || "", banDung: phim.ban_dung || null, cu: banDungCu(phim),
      cong: dsCong(phim, { giong, coFile: coFileTrong(root), conDauQuay: coDuyetQuay(root, phim) }), coFfmpeg: !!ffmpeg() };
  }

  // CEO duyệt hoặc bỏ duyệt một cổng. Duyệt: phải đủ điều kiện và đúng thứ tự. Bỏ duyệt: bỏ luôn các cổng sau.
  function duyetCong(root, { cong, duyet } = {}, actor = "ceo") {
    const so = Number(cong);
    if (![1, 2, 3, 4].includes(so)) throw err("BAD_REQUEST", "Cổng là 1, 2, 3 hoặc 4.");
    const { phim, giong } = doc(root);
    const moi = { ...(phim.cong && typeof phim.cong === "object" ? phim.cong : {}) };
    if (duyet === true) {
      const tt = dsCong(phim, { giong, coFile: coFileTrong(root), conDauQuay: coDuyetQuay(root, phim) })[so - 1];
      if (!tt.duoc) throw err("CHUA_DU_DIEU_KIEN", `Chưa duyệt được cổng ${so} (${CONG[so]}): ${tt.lyDo}`);
      if (!tt.duyet) for (let i = so + 1; i <= 4; i++) delete moi[i];
      if (so === 2) ghiDauQuay(root, dauKhoanQuay(phim));
      else if (so === 1 && !moi[1]?.luc) ghiDauQuay(root, null);
      moi[so] = { luc: now().toISOString() };
    } else if (duyet === false) {
      if (so <= 2) ghiDauQuay(root, null);
      for (let i = so; i <= 4; i++) delete moi[i];
    } else throw err("BAD_REQUEST", "duyet phải là true hoặc false.");
    phim.cong = moi;
    ghi(root, phim);
    audit.log(actor, "phim.cong", path.basename(root), { cong: so, duyet });
    return dsCong(phim, { giong, coFile: coFileTrong(root), conDauQuay: coDuyetQuay(root, phim) });
  }

  // "Quay lại cảnh này": CEO cho phép thêm một take (so_take_toi_da + 1, tối đa 5) nếu chi phí tối đa vẫn trong ngân sách.
  // Không tự quay: sau đó CEO vẫn bấm quay (Gemini) hoặc 3 nhịp Flow như thường, có hỏi lại số tiền.
  function quayLai(root, { canh } = {}, actor = "ceo") {
    const { phim, giong } = doc(root);
    const c = (phim.canh || []).find((x) => x.ma === canh);
    if (!c) throw err("NOT_FOUND", "Không có cảnh " + canh);
    const hienTai = Math.max(c.so_take_toi_da === undefined ? 2 : c.so_take_toi_da, (c.take || []).length);
    if (hienTai >= 5) throw err("TOI_DA_TAKE", c.ma + ": đã cho tối đa 5 take, không mở thêm.");
    const thu = { ...phim, canh: phim.canh.map((x) => (x === c ? { ...x, so_take_toi_da: hienTai + 1, trang_thai: "cho_quay" } : x)) };
    const k = kiem(thu, { giong });
    const vuot = k.loi.find((l) => l.ma === "VUOT_NGAN_SACH");
    if (vuot) throw err("VUOT_NGAN_SACH", "Quay lại " + c.ma + " sẽ vượt ngân sách: " + vuot.chiTiet);
    ghi(root, thu);
    const may = MAY_QUAY[c.may_quay || phim.may_quay_mac_dinh || MAY_QUAY_MAC_DINH] || {};
    audit.log(actor, "phim.quay_lai", path.basename(root), { canh: c.ma, so_take_toi_da: hienTai + 1 });
    return { phim: thu, uocTinh: { usd: tron((c.giay || 0) * (may.usdGiay || 0), 2), luotFlow: may.luot ? 1 : 0 } };
  }

  return { batDauDung, dungVaCho, dung, trangThai, duyetCong, coDuyetQuay, quayLai };
}

module.exports = { createBanDung, keHoach, keHoachTrong, lenhDung, ngatDong, docDo, danhGia, banDungCu, dsCong, takeDung, KICH_THUOC, CONG, NHAN_AI, FPS };
