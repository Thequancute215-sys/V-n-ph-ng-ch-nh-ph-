// Nút "Xin góp ý" của Cố vấn kịch bản và cảnh quay (CEO yêu cầu 26/11/2026): CEO bấm lúc nào cũng được, kể cả phim làm tay
// không chạy luồng tự động. Dùng chung lời giao, chữ ký và tệp media/co-van/cong-N.md với bước Cố vấn trong luồng phim
// (ctl/luong-phim.js), nên luồng thấy tệp có đúng chữ ký thì không gọi Antigravity lần nữa. Lượt Antigravity chạy CHỈ ĐỌC.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { noiDungAgy, chuKyCoVan, promptCoVan, thuMucThat, tepThat, ghiAtomic, VAI_CO_VAN } = require("./luong-phim");
const { maskSecrets } = require("../lib/mask");

const err = (code, message) => Object.assign(new Error(message), { code });
const docPhim = (root) => { try { return JSON.parse(fs.readFileSync(path.join(root, "phim.json"), "utf8").replace(/^﻿/, "")); } catch { return null; } };

function createCoVanTay({ chayAi, audit = { log() {} }, now = Date.now }) {
  const viec = new Map();   // root -> { 1: {dang, luc, loi}, 2: {...} } (chỉ trong bộ nhớ: lỗi gần nhất và đang chạy)
  const cua = (root) => { if (!viec.has(root)) viec.set(root, {}); return viec.get(root); };

  function trangThai(root) {
    const v = viec.get(root) || {};
    return { 1: v[1] || null, 2: v[2] || null };
  }

  // Chạy nền; trả ngay trạng thái. Lượt Antigravity khác đang chạy trên phim này thì runner báo AI_BUSY.
  function batDau(root, so, actor = "ceo") {
    so = Number(so);
    if (so !== 1 && so !== 2) throw err("BAD_REQUEST", "Cổng góp ý là 1 (kịch bản) hoặc 2 (phân cảnh).");
    const phim = docPhim(root);
    if (!phim || !Array.isArray(phim.canh) || !phim.canh.length) throw err("CHUA_DU_DIEU_KIEN", "Phim chưa có cảnh nào để góp ý. Viết kịch bản trước.");
    const o = cua(root);
    if (o[so] && o[so].dang) throw err("DANG_CHAY", "Cố vấn đang góp ý cổng này.");
    const chuKy = chuKyCoVan(root, phim, so);
    tepThat(path.join(thuMucThat(root, "media", "co-van"), `cong-${so}.md`));   // chặn junction/tệp cứng trước khi tốn lượt AI
    o[so] = { dang: true, luc: new Date(now()).toISOString(), loi: "" };
    audit.log(actor, "phim.co_van_tay", path.basename(root), { cong: so });
    const xong = (loi) => { o[so] = { dang: false, luc: new Date(now()).toISOString(), loi }; };
    // Bắt AI_BUSY và lỗi khởi chạy ngay (đồng bộ) để báo CEO thay vì để chạy nền im lặng.
    let p;
    try { p = Promise.resolve(chayAi({ root, vai: VAI_CO_VAN, prompt: promptCoVan(so, phim), chiDoc: true })); }
    catch (e) { o[so] = null; throw e; }
    p.then((kq) => {
      if (!kq || !kq.ok) return xong(maskSecrets(String(kq?.loi || "Antigravity chưa hoàn thành lượt góp ý.")).slice(0, 400));
      const text = maskSecrets(noiDungAgy(kq.text));
      if (!text) return xong("Antigravity chưa trả lời góp ý.");
      const hien = docPhim(root);
      if (!hien || chuKyCoVan(root, hien, so) !== chuKy) return xong("Kịch bản hoặc khung hình đã đổi trong lúc góp ý. Bấm Xin góp ý lại.");
      const thuMuc = thuMucThat(root, "media", "co-van");
      fs.mkdirSync(thuMuc, { recursive: true });
      const file = tepThat(path.join(thuMucThat(root, "media", "co-van"), `cong-${so}.md`));
      const luc = new Date(now()).toISOString();
      ghiAtomic(file, `<!-- co-van: ${chuKy} -->\n# Góp ý của Cố vấn trước Cổng ${so}\n\n_Antigravity, ${luc}. Chỉ là góp ý: anh quyết định duyệt hay sửa._\n\n${text.slice(0, 20000)}\n`, 0o644);
      xong("");
    }).catch((e) => xong(maskSecrets(String(e && e.message || e)).slice(0, 400)));
    return trangThai(root);
  }

  return { batDau, trangThai };
}

module.exports = { createCoVanTay };
