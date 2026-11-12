// Chặn yêu cầu ghi (POST/PUT/DELETE…) không xuất phát từ chính văn phòng.
// Lý do: máy chủ nghe trên localhost nên mọi trang web đang mở trong trình duyệt đều gửi được tới http://localhost:7788
// (CSRF), và tên miền lạ trỏ về 127.0.0.1 cũng vào được (DNS rebinding). Ba lớp chặn:
//  1. Content-Type phải là application/json (form HTML không gửi được kiểu này nếu không qua CORS preflight).
//  2. Có Origin thì host của Origin phải trùng Host của yêu cầu; có Sec-Fetch-Site thì phải là same-origin hoặc none.
//  3. Host là tên miền lạ (không phải localhost / địa chỉ IP) thì bắt buộc đã bật khóa xem (accessKey): checkHost, áp dụng cả GET.
"use strict";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
// Host là địa chỉ IP (máy khác trong mạng LAN gõ http://192.168.x.x:7788) thì không bị DNS rebinding, vì rebinding cần tên miền.
const IP_HOST = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])(:\d+)?$/i;

// Áp dụng cho MỌI yêu cầu (cả GET): chưa bật khóa xem thì chỉ nhận Host là localhost hoặc địa chỉ IP.
// Nếu không, trang lạ dùng tên miền trỏ về 127.0.0.1 sẽ đọc được dữ liệu văn phòng (nhật ký, file qua /ctl) như cùng nguồn.
function checkHost(req, { hasKey }) {
  const host = String(req.headers.host || "");
  if (LOOPBACK.test(host) || IP_HOST.test(host) || hasKey) return null;
  return "Host lạ mà chưa bật khóa xem (accessKey)";
}

function checkWrite(req, { hasKey }) {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const host = String(req.headers.host || "");
  const bad = checkHost(req, { hasKey });
  if (bad) return bad;
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

// Yêu cầu từ CHÍNH máy này (trình duyệt trên máy tính). Đường hầm/proxy chạy trên máy (cloudflared, tailscale serve, Caddy…)
// cũng nối vào từ 127.0.0.1, nên phải loại cả theo tiêu đề proxy và theo Host: điện thoại qua Tailscale gửi Host là tên *.ts.net.
const PROXY_HEADERS = ["cf-ray", "cf-connecting-ip", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded", "tailscale-user-login", "tailscale-funnel-request"];
function isLocal(req) {
  const a = (req.socket && req.socket.remoteAddress) || "";
  return /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(a) && LOOPBACK.test(String(req.headers.host || "")) && !PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
}

module.exports = { checkWrite, checkHost, readJson, isLocal, LOOPBACK, PROXY_HEADERS };
