"use strict";
// Sổ tin nhắn lâu dài của văn phòng (CEO duyệt 21/11/2026): data/tin-nhan/YYYY-MM.jsonl, mỗi dòng một tin đã che khóa.
// Máy chủ ghi khi pushEvent nhận tin mới; GET /tin-nhan đọc theo trang (mới trước), lọc người, tìm không dấu.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { maskText } = require("./mask");

function thang(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}.jsonl`;
}
function boDau(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
function hopLe(e) {
  return e && typeof e === "object" && Number.isFinite(e.t) &&
    typeof e.id === "string" && /^[a-f0-9]{16}$/.test(e.id) &&
    ["kind", "from", "to", "title", "body"].every(k => typeof e[k] === "string");
}

const CACHE_THANG = 3;

function createSoTinNhan({ dataDir }) {
  const dir = path.join(dataDir, "tin-nhan");
  const ids = new Set();
  const cache = new Map();

  function docFile(name) {
    const file = path.join(dir, name);
    try {
      const stat = fs.statSync(file);
      const old = cache.get(name);
      if (old && old.mtime === stat.mtimeMs && old.size === stat.size) { cache.delete(name); cache.set(name, old); return old.tin; }
      const tin = [];
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        try {
          const e = JSON.parse(line);
          if (hopLe(e)) tin.push(e);
        } catch { /* Bỏ dòng hỏng, vẫn đọc tiếp các tin còn lại. */ }
      }
      cache.set(name, { mtime: stat.mtimeMs, size: stat.size, tin });
      // Chỉ giữ trong bộ nhớ vài tháng dùng gần nhất: sổ nhiều năm không được chiếm RAM của máy chủ.
      while (cache.size > CACHE_THANG) cache.delete(cache.keys().next().value);
      return tin;
    } catch {
      cache.delete(name);
      return [];
    }
  }

  const now = new Date();
  for (const name of [thang(now), thang(new Date(now.getFullYear(), now.getMonth() - 1, 1))]) {
    for (const e of docFile(name)) ids.add(e.id);
  }

  function ghi(e) {
    try {
      if (!e || !Number.isFinite(e.t) || !Number.isFinite(new Date(e.t).getTime())) return;
      const { t, kind, from, to, title, body } = e;
      if (![kind, from, to, title, body].every(s => typeof s === "string")) return;
      const id = crypto.createHash("sha1")
        .update(`${kind}|${from}|${to}|${Math.floor(t / 60000)}|${title.slice(0, 60)}`)
        .digest("hex").slice(0, 16);
      if (ids.has(id)) return;
      // Che trước khi cắt để không lưu một mẩu khóa bị cắt mất tiền tố/hậu tố.
      const tin = { id, t, kind: maskText(kind), from: maskText(from), to: maskText(to),
        title: maskText(title).slice(0, 120), body: maskText(body).slice(0, 700) };
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, thang(t)), JSON.stringify(tin) + "\n", "utf8");
      // Chỉ đánh dấu sau khi ghi thành công, để có thể thử lại khi đĩa hết chỗ.
      ids.add(id);
    } catch { /* Sổ phụ không được làm sập máy chủ nếu đĩa lỗi. */ }
  }

  function doc({ ai, tu, toi, q, truoc, gioiHan = 100 } = {}) {
    const limit = Number.isFinite(Number(gioiHan)) ? Math.max(1, Math.min(200, Math.floor(Number(gioiHan)))) : 100;
    const query = typeof q === "string" ? boDau(q) : "";
    let files;
    try { files = fs.readdirSync(dir).filter(n => /^\d{4}-(0[1-9]|1[0-2])\.jsonl$/.test(n)).sort().reverse(); }
    catch { return { tin: [], conNua: false }; }
    const tin = [];
    for (const file of files) {
      for (const e of docFile(file)) {
        if (ai && e.from !== ai && e.to !== ai) continue;
        if (tu && e.from !== tu || toi && e.to !== toi) continue;
        if (Number.isFinite(truoc) && e.t >= truoc) continue;
        if (query && !boDau(e.title + "\n" + e.body).includes(query)) continue;
        tin.push(e);
      }
      // File theo tháng, đọc từ mới tới cũ: đã đủ tin cho trang này thì tháng cũ hơn không cần đọc.
      if (tin.length > limit) break;
    }
    tin.sort((a, b) => b.t - a.t);
    return { tin: tin.slice(0, limit).map(e => ({ ...e })), conNua: tin.length > limit };
  }
  return { ghi, doc };
}

module.exports = { createSoTinNhan };
