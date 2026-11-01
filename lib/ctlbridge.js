// Cầu nối văn phòng (server.js) → OS Controller (ctl, 127.0.0.1:7790). Token đọc lại mỗi yêu cầu từ ~/.van-phong-ao/ctl-token
// (ctl sinh token mới mỗi lần khởi động) và chỉ gắn vào yêu cầu gửi tới ctl, không bao giờ trả xuống trình duyệt.
// Chỉ phục vụ trình duyệt trên CHÍNH máy này: xem qua đường hầm điện thoại / máy khác trong mạng thì bị chặn (403),
// vì điều khiển máy tính từ xa là rủi ro lớn hơn nhiều so với xem văn phòng.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { LOOPBACK } = require("./guard");

const HOME = () => process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
const PORT = () => Number(process.env.CTL_PORT || 7790);
const token = () => { try { return fs.readFileSync(path.join(HOME(), "ctl-token"), "utf8").trim(); } catch { return ""; } };

function isLocal(req) {
  const a = req.socket.remoteAddress || "";
  return /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(a) && !req.headers["cf-ray"] && !req.headers["cf-connecting-ip"] && !req.headers["x-forwarded-for"];
}

// Gọi ctl từ mã máy chủ. Trả về { status, json } hoặc null nếu ctl chưa chạy.
function call(method, p, body, timeoutMs = 5000) {
  const t = token();
  if (!t) return Promise.resolve(null);
  return new Promise((ok) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ host: "127.0.0.1", port: PORT(), method, path: p, timeout: timeoutMs,
      headers: { host: "127.0.0.1:" + PORT(), authorization: "Bearer " + t, ...(data ? { "content-type": "application/json", "content-length": data.length } : {}) } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { ok({ status: res.statusCode, json: JSON.parse(b) }); } catch { ok({ status: res.statusCode, json: null }); } });
    });
    r.on("timeout", () => r.destroy());
    r.on("error", () => ok(null));
    r.end(data);
  });
}

// /ctl/<đường dẫn> của văn phòng → <đường dẫn> của ctl, chuyển nguyên luồng (cả SSE).
function proxy(req, res) {
  const send = (code, error) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify({ ok: false, code: code === 403 ? "REMOTE_DENIED" : "CTL_OFFLINE", error })); };
  if (!isLocal(req) || !LOOPBACK.test(String(req.headers.host || ""))) return send(403, "Bảng điều khiển máy chỉ dùng được trên chính máy này");
  const t = token();
  if (!t) return send(503, "OS Controller chưa chạy: mở terminal, chạy `npm run ctl` (hoặc `npm run all`)");
  const target = req.url.replace(/^\/ctl(?=\/|$)/, "") || "/";
  const headers = { host: "127.0.0.1:" + PORT(), authorization: "Bearer " + t };
  for (const h of ["content-type", "content-length", "accept"]) if (req.headers[h]) headers[h] = req.headers[h];
  const up = http.request({ host: "127.0.0.1", port: PORT(), method: req.method, path: target, headers }, (r) => {
    const out = {};
    for (const h of ["content-type", "cache-control", "x-next-offset", "x-size"]) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode, out);
    r.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) send(503, "Không kết nối được OS Controller (127.0.0.1:" + PORT() + "): có thể ctl đã tắt"); else res.end(); });
  // Trình duyệt đóng (ví dụ rời trang đang nghe SSE) thì cắt luôn kết nối tới ctl. Không dùng req "close": sự kiện đó bắn ngay khi đọc xong thân yêu cầu.
  res.on("close", () => { if (!res.writableFinished) up.destroy(); });
  req.pipe(up);
}

module.exports = { call, proxy, isLocal };
