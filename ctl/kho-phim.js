// Kho phim (CEO yêu cầu 26/11/2026): mọi phim nằm chung một kho trên máy, tách khỏi dự án code, chia thư mục theo loại phim:
//   <kho>\<loại>\<tên phim không dấu>\  (vd. D:\XuongPhim\tai-lieu-kien-thuc\tin-hieu-tro-ve)
// Mỗi phim có khuôn phim.json / kich-ban.md / PHIM.md và git cục bộ (không remote, không đẩy lên GitHub; media/ nằm ngoài git).
// Tạo xong thì đăng ký workspace để các khu Xưởng phim dùng. Phim cũ ngoài kho giữ nguyên chỗ, chỉ gắn loại (CEO chọn 26/11/2026).
// Phim qua Cổng 4 vào nhóm "Đã xuất"; dọn nháp xoá take/khung không được chọn và gói CapCut (tạo lại được), giữ bản xuất và media/raw.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const nhanh = require("./nhanh");
const { datKhungPhim } = require("./du-an-moi");
const libPhim = require("../lib/phim");
const { writeAtomic } = require("../lib/ghi-file");
const { takeDung, banDungCu } = require("./ban-dung");

const err = (code, message) => Object.assign(new Error(message), { code });
const TEN_MAX = 80, Y_TUONG_MAX = 4000;
const LOAI = [
  { id: "tai-lieu-kien-thuc", ten: "Tài liệu kiến thức" },
  { id: "giai-tri-ai", ten: "Phim AI giải trí" },
  { id: "quang-cao", ten: "Quảng cáo / giới thiệu" },
  { id: "mxh-ngan", ten: "Mạng xã hội ngắn" },
];
const LOAI_ID = new Set(LOAI.map((l) => l.id));
const CHUA_PHAN_LOAI = "chua-phan-loai";
// Tên thiết bị Windows cấm làm tên thư mục (CON, NUL, COM1…): thêm hậu tố.
const WIN_CAM = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

// Tên thư mục: bỏ dấu tiếng Việt, chữ thường, nối bằng gạch. "Tín hiệu trở về" -> "tin-hieu-tro-ve".
function thuMucTu(ten) {
  const s = String(ten || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return WIN_CAM.test(s) ? s + "-phim" : s;
}
const chuanTen = (t) => String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const cung = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const docJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const ghiJson = (f, obj) => writeAtomic(f, JSON.stringify(obj, null, 2) + "\n", 0o644);
// Đường dẫn trong phim.json để so: "\" -> "/", bỏ "./", gộp "a/../b". relGoc giữ hoa thường để mở file; chuanRel để so (Windows không phân biệt).
const relGoc = (p) => path.posix.normalize(String(p).replace(/\\/g, "/")).replace(/^(\.\/)+/, "");
const chuanRel = (p) => { const s = relGoc(p); return process.platform === "win32" ? s.toLowerCase() : s; };
// Mọi đường dẫn media/ phim.json đang nhắc tới (take dùng, khung chọn, bản dựng, tham chiếu nhân vật, nhạc…), trừ danh sách phương án take[]/khung[].
function duongDanDangDung(phim) {
  const giu = new Set();
  const di = (v, sau = 0) => {
    if (sau > 12 || v === null || v === undefined) return;
    if (typeof v === "string") { const r = chuanRel(v); if (/^media\//.test(r)) giu.add(r); return; }
    if (Array.isArray(v)) { for (const x of v) di(x, sau + 1); return; }
    if (typeof v === "object") for (const x of Object.values(v)) di(x, sau + 1);
  };
  const canh = Array.isArray(phim.canh) ? phim.canh : [];
  di({ ...phim, canh: canh.map((c) => { if (!c || typeof c !== "object") return c; const { take, khung, ...con } = c; return con; }) });
  // Cảnh chỉ có một take thì bàn dựng dùng luôn take đó dù không ghi take_chon (ctl/ban-dung.js takeDung).
  for (const c of canh) {
    if (!c || typeof c !== "object") continue;
    const t = takeDung(c); if (typeof t === "string") giu.add(chuanRel(t));
  }
  return giu;
}

// Tiến độ cho thẻ phim: số cảnh, cổng đã duyệt liên tiếp, cổng đang chờ, ảnh bìa (khung chọn đầu tiên).
function tomTat(root, phim) {
  const canh = Array.isArray(phim && phim.canh) ? phim.canh.filter((c) => c && typeof c === "object") : [];
  let cong = 0; while (cong < 4 && libPhim.congDaDuyet(phim, cong + 1)) cong++;
  const bia = canh.map((c) => c.khung_chon).filter((p) => typeof p === "string").map(relGoc)
    .find((p) => libPhim.duongDanHopLe(p) && /^media\//.test(p) && fs.existsSync(path.join(root, p))) || null;
  let capNhat = null; try { capNhat = fs.statSync(path.join(root, "phim.json")).mtime.toISOString(); } catch { /* phim.json mất giữa chừng */ }
  return { soCanh: canh.length, cong, choCong: cong < 4 ? cong + 1 : null, daXuat: cong === 4, anhBia: bia, capNhat };
}

function createKhoPhim({ ws, audit = { log() {} }, goc }) {
  if (!goc) throw new Error("kho phim cần thư mục gốc");
  // So cả đường dẫn đã gõ lẫn đường dẫn thật (kho đi qua junction chuyển ổ hay tên 8.3 của Windows).
  const ben = (cha, con) => { const rel = path.relative(cha, con); return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel); };
  const that = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const trongKho = (p) => [path.resolve(goc), that(goc)].some((g) => ben(g, path.resolve(p)) || ben(g, that(p)));

  function thongTin(w, loaiThuMuc, thuMuc, laTrongKho) {
    const phim = docJson(path.join(w.path, "phim.json")) || {};
    const loai = laTrongKho ? loaiThuMuc : (LOAI_ID.has(phim.loai) ? phim.loai : CHUA_PHAN_LOAI);
    return { path: w.path, thuMuc, ten: chuanTen(phim.ten) || thuMuc, loai, trongKho: laTrongKho, ...tomTat(w.path, phim) };
  }

  // Danh sách phim: phim trong kho theo từng loại (thư mục chép tay vào kho cũng được nhận và đăng ký), rồi phim cũ ngoài kho đã đăng ký.
  function list() {
    const daDangKy = ws.list();
    const ra = [];
    for (const l of LOAI) {
      const thuMucLoai = path.join(goc, l.id);
      let con = [];
      try { con = fs.readdirSync(thuMucLoai, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.isSymbolicLink()); } catch { continue; }
      for (const d of con) {
        const root = path.join(thuMucLoai, d.name);
        if (!fs.existsSync(path.join(root, "phim.json"))) continue;
        // Junction/đường tắt trỏ ra ngoài kho thì bỏ qua: kho chỉ nhận thư mục thật nằm trong kho.
        let that; try { that = fs.realpathSync(root); } catch { continue; }
        if (!cung(that, root) && !trongKho(that)) continue;
        let w = daDangKy.find((x) => cung(x.path, root) || cung(x.path, that));
        if (!w) { try { w = ws.add(root, "kho-phim"); } catch { continue; } }
        ra.push(thongTin(w, l.id, d.name, true));
      }
    }
    for (const w of daDangKy) {
      if (trongKho(w.path) || !fs.existsSync(path.join(w.path, "phim.json"))) continue;
      ra.push(thongTin(w, null, path.basename(w.path), false));
    }
    return ra;
  }

  function tao({ ten, loai, yTuong = "" } = {}, actor = "ceo") {
    const t = chuanTen(ten);
    if (!t) throw err("BAD_REQUEST", "Đặt tên phim trước khi tạo.");
    if (t.length > TEN_MAX) throw err("BAD_REQUEST", "Tên phim dài tối đa " + TEN_MAX + " ký tự.");
    if (!LOAI_ID.has(loai)) throw err("BAD_REQUEST", "Chọn loại phim: " + LOAI.map((l) => l.ten).join(", ") + ".");
    const y = String(yTuong || "").trim();
    if (y.length > Y_TUONG_MAX) throw err("BAD_REQUEST", "Ý tưởng dài tối đa " + Y_TUONG_MAX + " ký tự.");
    const thuMuc = thuMucTu(t);
    if (thuMuc.length < 2) throw err("BAD_REQUEST", "Tên phim cần ít nhất 2 chữ cái hoặc số.");
    const trung = list().find((p) => p.ten.toLowerCase() === t.toLowerCase() || (p.trongKho && p.thuMuc === thuMuc));
    if (trung) throw err("CONFLICT", "Đã có phim \"" + trung.ten + "\" trong kho. Chọn tên khác.");

    const thuMucLoai = path.join(goc, loai);
    fs.mkdirSync(thuMucLoai, { recursive: true });
    const root = path.join(thuMucLoai, thuMuc);
    try { fs.mkdirSync(root); } catch (e) {
      if (e.code === "EEXIST") throw err("CONFLICT", "Kho đã có thư mục " + thuMuc + ". Chọn tên khác.");
      throw err("WRITE_FAILED", "Không tạo được thư mục phim: " + e.message);
    }
    try {
      datKhungPhim(root, t);
      const f = path.join(root, "phim.json");
      ghiJson(f, { ...docJson(f), loai });
      if (y) fs.writeFileSync(path.join(root, "y-tuong.md"), "# Ý tưởng của CEO\n\n" + y + "\n", { flag: "wx" });
      nhanh.git(root, ["init", "--quiet"]);
      nhanh.git(root, ["add", "--", "."]);
      nhanh.git(root, ["commit", "--quiet", "--no-verify", "-m", "chore(phim): tạo phim " + t]);
    } catch (e) {
      // Tạo dở thì dọn đúng thư mục vừa tạo (chưa có gì của CEO trong đó) để tạo lại được cùng tên.
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* Windows khoá file: để nguyên, báo lỗi */ }
      throw err("WRITE_FAILED", "Không tạo được phim: " + String(e.stderr || e.message).slice(0, 250));
    }
    const w = ws.add(root, actor);
    audit.log(actor, "phim.kho.tao", loai + "/" + thuMuc, { ten: t });
    return thongTin(w, loai, thuMuc, true);
  }

  // Gắn loại cho phim cũ ngoài kho (không di chuyển file). Phim trong kho có loại theo thư mục, không đổi ở đây.
  function datLoai(root, loai, actor = "ceo") {
    if (!LOAI_ID.has(loai)) throw err("BAD_REQUEST", "Loại phim không hợp lệ.");
    const w = ws.find(root);
    if (trongKho(w.path)) throw err("CONFLICT", "Phim trong kho có loại theo thư mục chứa nó.");
    const f = path.join(w.path, "phim.json");
    const phim = docJson(f);
    if (!phim) throw err("NOT_FOUND", "Dự án không có phim.json.");
    ghiJson(f, { ...phim, loai });
    audit.log(actor, "phim.kho.dat_loai", w.path, { loai });
    return thongTin(w, null, path.basename(w.path), false);
  }

  // File nháp của phim đã xuất: take/khung không được chọn ở cảnh nào, và gói CapCut (media/capcut-*, tạo lại được).
  // Không đụng media/xuat (bản xuất), media/raw (file gốc CEO đưa vào), media/giong.
  function nhap(root) {
    const w = ws.find(root);
    const phim = docJson(path.join(w.path, "phim.json"));
    if (!phim) throw err("NOT_FOUND", "Dự án không có phim.json.");
    if (!libPhim.congDaDuyet(phim, 4)) throw err("CHUA_DU_DIEU_KIEN", "Chỉ dọn nháp khi phim đã qua Cổng 4.");
    if (banDungCu(phim)) throw err("CHUA_DU_DIEU_KIEN", "Bản dựng cũ hơn hồ sơ phim: dựng lại và duyệt trước khi dọn nháp.");
    const giu = duongDanDangDung(phim);
    const rong = { root: w.path, tep: [], tong: 0, ma: maCua([]) };
    // media/ phải là thư mục thật của chính phim (không phải junction/đường tắt); mỗi file con cũng kiểm đích thật nằm trong đó.
    const media = path.join(w.path, "media");
    let mediaThat;
    try { if (fs.lstatSync(media).isSymbolicLink()) return rong; mediaThat = fs.realpathSync(media); } catch { return rong; }
    if (!cung(mediaThat, path.join(fs.realpathSync(w.path), "media"))) return rong;
    const trongMedia = (abs) => { try { return ben(mediaThat, fs.realpathSync(abs)); } catch { return false; } };
    const tep = [];
    const quet = (rel, sau = 0) => {
      if (sau > 8) return;
      let ds = []; try { ds = fs.readdirSync(path.join(w.path, rel), { withFileTypes: true }); } catch { return; }
      for (const d of ds) {
        const r = rel + "/" + d.name, abs = path.join(w.path, r);
        if (d.isSymbolicLink() || !trongMedia(abs)) continue;
        if (d.isDirectory()) quet(r, sau + 1);
        else if (d.isFile() && !giu.has(chuanRel(r))) tep.push({ path: r, byte: fs.statSync(abs).size });
      }
    };
    let tenCon = []; try { tenCon = fs.readdirSync(media, { withFileTypes: true }); } catch { /* không đọc được media */ }
    for (const d of tenCon) if (d.isDirectory() && !d.isSymbolicLink() && (d.name === "quay" || d.name === "khung" || /^capcut-/.test(d.name))) quet("media/" + d.name);
    tep.sort((a, b) => a.path.localeCompare(b.path));
    return { root: w.path, tep, tong: tep.reduce((s, x) => s + x.byte, 0), ma: maCua(tep) };
  }
  const maCua = (tep) => crypto.createHash("sha256").update(JSON.stringify(tep)).digest("hex").slice(0, 16);

  // Xoá đúng danh sách CEO đã xem (mã khớp), rồi bỏ các đường dẫn đã xoá khỏi take[]/khung[] trong phim.json.
  function donNhap(root, ma, { ban = () => false } = {}, actor = "ceo") {
    const n = nhap(root);
    if (ban(n.root)) throw err("DANG_DUNG", "Phim đang quay, dựng hoặc chạy luồng: chờ xong rồi dọn.");
    if (!ma || ma !== n.ma) throw err("CHANGED", "Danh sách file nháp đã đổi. Xem lại rồi xác nhận.");
    if (!n.tep.length) return { soTep: 0, byte: 0, conLai: 0 };
    const daXoa = new Set();
    for (const t of n.tep) { try { fs.rmSync(path.join(n.root, t.path), { force: true }); daXoa.add(t.path); } catch { /* file bị khoá: để lại */ } }
    let con = []; try { con = fs.readdirSync(path.join(n.root, "media"), { withFileTypes: true }); } catch { /* không còn media */ }
    for (const d of con) {
      if (d.isDirectory() && !d.isSymbolicLink() && /^capcut-/.test(d.name)) { try { fs.rmdirSync(path.join(n.root, "media", d.name)); } catch { /* còn file */ } }
    }
    const xoa = new Set([...daXoa].map(chuanRel));
    // Đọc lại phim.json ngay trước khi ghi (phần khác có thể vừa ghi) và chỉ bỏ đúng các đường dẫn đã xoá.
    const f = path.join(n.root, "phim.json"), phim = docJson(f);
    if (phim) {
      for (const c of Array.isArray(phim.canh) ? phim.canh : []) {
        if (!c || typeof c !== "object") continue;
        for (const k of ["take", "khung"]) if (Array.isArray(c[k])) c[k] = c[k].filter((p) => !xoa.has(chuanRel(p)));
      }
      ghiJson(f, phim);
    }
    const byte = n.tep.filter((t) => daXoa.has(t.path)).reduce((s, x) => s + x.byte, 0);
    audit.log(actor, "phim.kho.don_nhap", n.root, { soTep: daXoa.size, byte });
    return { soTep: daXoa.size, byte, conLai: n.tep.length - daXoa.size };
  }

  return { goc, list, tao, datLoai, nhap, donNhap, LOAI };
}

module.exports = { createKhoPhim, thuMucTu, LOAI, CHUA_PHAN_LOAI };
