// Chặn yêu cầu ghi (POST/PUT/DELETE…) không xuất phát từ chính văn phòng.
// Lý do: máy chủ nghe trên localhost nên mọi trang web đang mở trong trình duyệt đều gửi được tới http://localhost:7788
// (CSRF), và tên miền lạ trỏ về 127.0.0.1 cũng vào được (DNS rebinding). Ba lớp chặn:
//  1. Content-Type phải là application/json (form HTML không gửi được kiểu này nếu không qua CORS preflight).
//  2. Có Origin thì host của Origin phải trùng Host của yêu cầu; có Sec-Fetch-Site thì phải là same-origin hoặc none.
//  3. Host không phải localhost thì bắt buộc đã bật khóa xem (accessKey), nếu không thì từ chối.
"use strict";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function checkWrite(req, { hasKey }) {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const host = String(req.headers.host || "");
  if (!LOOPBACK.test(host) && !hasKey) return "Host lạ mà chưa bật khóa xem (accessKey)";
  const ct = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json") return "Content-Type phải là application/json";
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return "Yêu cầu từ trang khác (" + site + ")";
  const origin = req.headers.origin;
  if (origin) {
    let oh;
    try { oh = new URL(origin).host; } catch { return "Origin không hợp lệ"; }
    if (oh.toLowerCase() !== host.toLowerCase()) return "Origin không khớp Host";
  }
  return null;
}

// Đọc thân JSON có giới hạn kích thước; lỗi thì trả về null để route báo 400.
function readJson(req, limit = 100_000) {
  return new Promise((ok) => {
    let b = "", over = false;
    req.on("data", (c) => { if (over) return; b += c; if (b.length > limit) { over = true; ok(null); req.destroy(); } });
    req.on("end", () => { if (over) return; try { const v = JSON.parse(b || "{}"); ok(v && typeof v === "object" ? v : null); } catch { ok(null); } });
    req.on("error", () => ok(null));
  });
}

module.exports = { checkWrite, readJson };
