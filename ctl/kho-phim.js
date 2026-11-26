// Kho phim (CEO yêu cầu 26/11/2026): mọi phim nằm chung một thư mục trên máy, tách khỏi dự án code.
// Mỗi phim là một thư mục con đặt theo tên phim (không dấu), có khuôn phim.json / kich-ban.md / PHIM.md và git cục bộ
// (không remote, không đẩy lên GitHub; media/ nằm ngoài git). Tạo xong thì đăng ký làm workspace để các khu Xưởng phim dùng.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const nhanh = require("./nhanh");
const { datKhungPhim } = require("./du-an-moi");

const err = (code, message) => Object.assign(new Error(message), { code });
const TEN_MAX = 80, Y_TUONG_MAX = 4000;

// Tên thư mục: bỏ dấu tiếng Việt, chữ thường, nối bằng gạch. "Tín hiệu trở về" -> "tin-hieu-tro-ve".
function thuMucTu(ten) {
  return String(ten || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}
const chuanTen = (t) => String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const tenTrongHoSo = (root) => { try { return chuanTen(JSON.parse(fs.readFileSync(path.join(root, "phim.json"), "utf8")).ten); } catch { return ""; } };
const cungDuongDan = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function createKhoPhim({ ws, audit = { log() {} }, goc }) {
  if (!goc) throw new Error("kho phim cần thư mục gốc");
  const trongKho = (p) => { const rel = path.relative(path.resolve(goc), path.resolve(p)); return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel); };

  // Danh sách phim: phim trong kho (kể cả chưa đăng ký, sẽ tự đăng ký lại) rồi phim cũ nằm ngoài kho đã đăng ký.
  function list() {
    const daDangKy = ws.list();
    const ra = [];
    let thuMuc = [];
    try { thuMuc = fs.readdirSync(goc, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { /* kho chưa có: chưa tạo phim nào */ }
    for (const d of thuMuc) {
      const root = path.join(goc, d.name);
      if (!fs.existsSync(path.join(root, "phim.json"))) continue;
      let w = daDangKy.find((x) => cungDuongDan(x.path, root));
      if (!w) { try { w = ws.add(root, "kho-phim"); } catch { continue; } }
      ra.push({ path: w.path, thuMuc: d.name, ten: tenTrongHoSo(root) || d.name, trongKho: true });
    }
    for (const w of daDangKy) {
      if (trongKho(w.path) || !fs.existsSync(path.join(w.path, "phim.json"))) continue;
      ra.push({ path: w.path, thuMuc: path.basename(w.path), ten: tenTrongHoSo(w.path) || path.basename(w.path), trongKho: false });
    }
    return ra;
  }

  function tao({ ten, yTuong = "" } = {}, actor = "ceo") {
    const t = chuanTen(ten);
    if (!t) throw err("BAD_REQUEST", "Đặt tên phim trước khi tạo.");
    if (t.length > TEN_MAX) throw err("BAD_REQUEST", "Tên phim dài tối đa " + TEN_MAX + " ký tự.");
    const y = String(yTuong || "").trim();
    if (y.length > Y_TUONG_MAX) throw err("BAD_REQUEST", "Ý tưởng dài tối đa " + Y_TUONG_MAX + " ký tự.");
    const ten_thu_muc = thuMucTu(t);
    if (ten_thu_muc.length < 2) throw err("BAD_REQUEST", "Tên phim cần ít nhất 2 chữ cái hoặc số.");
    const trung = list().find((p) => p.ten.toLowerCase() === t.toLowerCase());
    if (trung) throw err("CONFLICT", "Đã có phim tên \"" + trung.ten + "\" trong kho. Chọn tên khác.");

    fs.mkdirSync(goc, { recursive: true });
    const root = path.join(goc, ten_thu_muc);
    try { fs.mkdirSync(root); } catch (e) {
      if (e.code === "EEXIST") throw err("CONFLICT", "Kho đã có thư mục " + ten_thu_muc + ". Chọn tên khác.");
      throw err("WRITE_FAILED", "Không tạo được thư mục phim: " + e.message);
    }
    try {
      datKhungPhim(root, t);
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
    audit.log(actor, "phim.kho.tao", ten_thu_muc, { ten: t });
    return { path: w.path, thuMuc: ten_thu_muc, ten: t, trongKho: true };
  }

  return { goc, list, tao };
}

module.exports = { createKhoPhim, thuMucTu };
