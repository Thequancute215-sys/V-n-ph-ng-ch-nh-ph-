// Điều khiển văn phòng từ điện thoại (CEO chọn 11/11/2026, cách B).
// Văn phòng chạy AI toàn quyền trên máy, nên điều khiển từ xa phải qua ĐỦ ba lớp, không lớp nào thay được lớp nào:
//  1. Khóa xem (accessKey) như khi xem trên điện thoại: chưa đặt khóa thì không nhận lệnh từ xa nào (server.js chặn trước).
//  2. Khóa thiết bị: điện thoại phải ghép một lần bằng mã 6 số hiện trên CHÍNH máy tính (hết hạn sau 5 phút, dùng một lần,
//     sai 5 lần thì khóa ghép 15 phút). Ghép xong máy chủ cấp khóa ngẫu nhiên 256 bit, chỉ lưu bản băm; mất máy thì thu hồi.
//  3. Danh sách lệnh: chỉ mở các lệnh xem tình hình, giao việc, duyệt/trả bàn giao, trả lời câu hỏi và phanh khẩn cấp.
//     Không mở chạy lệnh tùy ý (/jobs), đọc/ghi file (/fs), duyệt rà soát, xuất bản, đẩy nhánh, sửa kết nối hay cấu hình.
// Mọi lệnh ghi từ điện thoại được ghi nhật ký kèm tên máy và IP (dieu-khien-xa.log, mỗi dòng một JSON).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { writeAtomic } = require("./ghi-file");

const HOME = () => process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
const MA_HET = 5 * 60 * 1000;          // mã ghép sống 5 phút
const SAI_TOI_DA = 5, KHOA_GHEP = 15 * 60 * 1000;
const THIET_BI_TOI_DA = 5;
const ID = "[A-Za-z0-9_-]{1,80}";
// [phương thức, đường dẫn của ctl]. Đường dẫn so khớp cả chuỗi, không tính phần ?query.
const ALLOW = [
  ["GET", "/health"], ["GET", "/quotas"], ["POST", "/quotas/refresh"], ["GET", "/dieu-phoi"],
  ["GET", "/workspaces"], ["GET", "/workspaces/overview"], ["GET", "/ai/status"], ["GET", "/jobs"],
  ["GET", "/autopilot"], ["GET", `/autopilot/${ID}`], ["GET", `/autopilot/${ID}/steps/\\d{1,3}/diff`],
  ["POST", "/autopilot"], ["POST", `/autopilot/${ID}/(stop|answer|resume|approve|reject)`],
  ["GET", "/handoffs"], ["GET", `/handoffs/${ID}`], ["POST", `/handoffs/${ID}/(approve|reject|answer)`],
  ["GET", "/chat"], ["POST", "/chat"],
  ["POST", "/kill-all"],
  // Văn phòng 3D trên điện thoại (CEO chọn 16/11/2026): bàn làm việc trong 3D đọc thêm các mục chỉ xem, chọn dự án đang làm,
  // ghi/giao ý tưởng, và tạo dự án mới (gợi ý tên rồi CEO bấm duyệt mới tạo repo).
  // CEO yêu cầu thêm 16/11/2026: đổi tài khoản Antigravity (một chạm trong menu) và đặt model cho từng phòng (chạm nhãn nhân vật).
  // Vẫn KHÔNG mở: cất/bỏ tài khoản hay đổi ngưỡng tự chuyển, rà soát/duyệt file .md, xuất bản, cài bộ kiểm riêng lẻ,
  // mở repo tùy ý, cập nhật app.
  ["GET", "/ideas"], ["POST", "/ideas"], ["POST", `/ideas/${ID}/start`],
  ["GET", "/scan"], ["GET", "/publish"], ["GET", "/nhat-ky"],
  ["POST", "/workspaces/switch"],
  ["GET", "/dieu-phoi/models"], ["GET", "/agy-tai-khoan"],
  ["POST", `/agy-tai-khoan/${ID}/chuyen`], ["POST", `/codex-tai-khoan/${ID}/chuyen`], ["POST", "/dieu-phoi"],
  ["POST", "/du-an-moi/goi-y"], ["POST", "/du-an-moi"], ["GET", `/du-an-moi/${ID}`],
  ["POST", "/chat/clear"],   // xoá lịch sử chat với một AI (nút trong văn phòng 3D)
  // Xưởng phim P3 (CEO yêu cầu 21/11/2026, bản thiết kế: "duyệt đủ 4 cổng từ iPhone"): xem phim, clip và bản dựng (GET /phim/media
  // chuyển nguyên luồng video), chọn khung/take, duyệt cổng, dựng bản xem thử (miễn phí), mở thêm một take trong ngân sách.
  // Vẫn KHÔNG mở cho điện thoại: lệnh tốn tiền (quay Gemini /phim/quay, nhịp Flow, mở Chrome Flow), đổi ngân sách,
  // đánh dấu người thật đồng ý (thân /phim/ceo bị lọc chỉ còn chọn khung/take).
  ["GET", "/phim/du-an"], ["GET", "/phim"], ["GET", "/phim/media"], ["GET", "/flow"],
  ["POST", "/phim/ceo"], ["POST", "/phim/cong"], ["POST", "/phim/dung"], ["POST", "/phim/quay-lai"],
].map(([m, p]) => [m, new RegExp("^" + p + "$")]);

function allowed(method, p) {
  const only = String(p || "").split("?")[0];
  if (only.includes("..") || only.includes("//")) return false;
  return ALLOW.some(([m, re]) => m === method && re.test(only));
}

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const err = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

function createDieuKhienXa({ home = HOME, now = () => Date.now() } = {}) {
  const file = () => path.join(home(), "dieu-khien-xa.json");
  const logFile = () => path.join(home(), "dieu-khien-xa.log");
  let ma = null;                       // { ma, het } — chỉ trong bộ nhớ, tắt máy chủ là mất
  let sai = [];                        // mốc thời gian các lần nhập sai mã
  const lastSeenWrite = new Map();

  const read = () => { try { const d = JSON.parse(fs.readFileSync(file(), "utf8")); return { thietBi: Array.isArray(d.thietBi) ? d.thietBi : [] }; } catch { return { thietBi: [] }; } };
  const save = (d) => { fs.mkdirSync(home(), { recursive: true }); writeAtomic(file(), JSON.stringify(d, null, 2)); };
  const pub = (t) => ({ id: t.id, ten: t.ten, taoLuc: t.taoLuc, dungLuc: t.dungLuc || null, ip: t.ip || null });

  function ghiNhatKy(entry) {
    try { fs.mkdirSync(home(), { recursive: true }); fs.appendFileSync(logFile(), JSON.stringify({ at: new Date(now()).toISOString(), ...entry }) + "\n"); } catch {}
  }

  // Chỉ gọi khi yêu cầu đến từ chính máy tính (server.js kiểm).
  function taoMa() {
    ma = { ma: String(crypto.randomInt(0, 1e6)).padStart(6, "0"), het: now() + MA_HET };
    ghiNhatKy({ su: "tao-ma" });
    return { ma: ma.ma, hetLuc: new Date(ma.het).toISOString() };
  }

  function ghep(maNhap, ten, ip) {
    const t = now();
    sai = sai.filter((x) => t - x < KHOA_GHEP);
    if (sai.length >= SAI_TOI_DA) throw err("LOCKED", "Nhập sai mã quá nhiều lần: thử lại sau 15 phút, rồi tạo mã mới trên máy tính.", 429);
    const ok = ma && t <= ma.het && typeof maNhap === "string" && maNhap.length === 6 && crypto.timingSafeEqual(Buffer.from(maNhap), Buffer.from(ma.ma));
    if (!ok) { sai.push(t); ghiNhatKy({ su: "ghep-sai", ip }); throw err("BAD_CODE", "Mã ghép không đúng hoặc đã hết hạn. Tạo mã mới trên máy tính (mục Điện thoại).", 403); }
    ma = null; sai = [];
    const d = read();
    if (d.thietBi.length >= THIET_BI_TOI_DA) throw err("TOO_MANY", `Đã ghép đủ ${THIET_BI_TOI_DA} máy: thu hồi máy cũ trên máy tính trước.`, 409);
    const token = crypto.randomBytes(32).toString("base64url");
    const tb = { id: crypto.randomBytes(6).toString("hex"), ten: String(ten || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) || "Điện thoại", hash: hash(token), taoLuc: new Date(t).toISOString(), dungLuc: new Date(t).toISOString(), ip: ip || null };
    d.thietBi.push(tb); save(d);
    ghiNhatKy({ su: "ghep", thietBi: tb.id, ten: tb.ten, ip });
    return { token, thietBi: pub(tb) };
  }

  // Trả về thiết bị nếu khóa còn hiệu lực, null nếu không. So bản băm bằng timingSafeEqual.
  function xacThuc(token, ip) {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
    const h = Buffer.from(hash(token)), d = read();
    const tb = d.thietBi.find((x) => typeof x.hash === "string" && x.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(x.hash), h));
    if (!tb) return null;
    const t = now();
    if (t - (lastSeenWrite.get(tb.id) || 0) > 60000) {   // ghi "dùng lúc" tối đa mỗi phút một lần
      lastSeenWrite.set(tb.id, t); tb.dungLuc = new Date(t).toISOString(); if (ip) tb.ip = ip; save(d);
    }
    return pub(tb);
  }

  const danhSach = () => read().thietBi.map(pub);

  function thuHoi(id, by = "may-tinh") {
    const d = read(), n = d.thietBi.length;
    d.thietBi = d.thietBi.filter((x) => x.id !== id);
    if (d.thietBi.length === n) throw err("NOT_FOUND", "Không có thiết bị này.", 404);
    save(d); ghiNhatKy({ su: "thu-hoi", thietBi: id, by });
    return danhSach();
  }

  function nhatKy(limit = 50) {
    try { return fs.readFileSync(logFile(), "utf8").trim().split("\n").filter(Boolean).slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse(); } catch { return []; }
  }

  return { taoMa, ghep, xacThuc, danhSach, thuHoi, ghiNhatKy, nhatKy, maDangCo: () => !!(ma && now() <= ma.het) };
}

// --- Phần HTTP (server.js gọi). deps: { local, hasKey, call(method, path, body, timeout), readJson(req, limit) } ---
const cookieOf = (req, name) => { const c = (req.headers.cookie || "").split(/;\s*/).find((x) => x.startsWith(name + "=")); return c ? decodeURIComponent(c.slice(name.length + 1)) : ""; };
// IP ghi vào nhật ký và cột "IP lần dùng cuối" (chỉ để xem lại, KHÔNG dùng để xác thực). Tiêu đề proxy do phía trước máy chủ
// đặt, nên chỉ tin khi yêu cầu nối từ chính máy (đường hầm cloudflared / tailscale serve chạy trên máy này); nối thẳng từ máy
// khác trong mạng thì tiêu đề là do máy đó tự gửi, lấy địa chỉ socket. Qua Tailscale (Host *.ts.net) lấy phần tử CUỐI của
// X-Forwarded-For (tailscale serve nối thêm địa chỉ thật vào cuối; phần đầu có thể do điện thoại tự gửi) và bỏ qua cf-*;
// qua Cloudflare thì cf-connecting-ip do Cloudflare ghi đè. (Sửa 19/11/2026, mục 6 của docs/BAN-DO-HE-THONG.md.)
const LOOP_ADDR = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/;
const lastXff = (req) => String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean).pop() || "";
function ipOf(req) {
  const sock = String((req.socket && req.socket.remoteAddress) || "");
  let ip = sock;
  if (LOOP_ADDR.test(sock)) {
    if (/\.ts\.net(:\d+)?$/i.test(String(req.headers.host || ""))) ip = lastXff(req) || String(req.headers["tailscale-user-login"] || "") || sock;
    else ip = String(req.headers["cf-connecting-ip"] || "") || lastXff(req) || sock;
  }
  return ip.slice(0, 64);
}
// Qua HTTPS: Cloudflare (cf-visitor), proxy chuẩn (x-forwarded-proto) hoặc tailscale serve (Host *.ts.net luôn là HTTPS).
const https = (req) => req.headers["x-forwarded-proto"] === "https" || /"scheme":"https"/.test(String(req.headers["cf-visitor"] || "")) || /\.ts\.net(:\d+)?$/i.test(String(req.headers.host || ""));

async function handle(dkx, req, res, url, { local, hasKey, call, readJson, stream = null }) {
  const send = (code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }); res.end(JSON.stringify(body)); };
  const fail = (e) => send(e.status || 400, { ok: false, code: e.code || "BAD_REQUEST", error: e.message });
  const p = url.pathname.slice("/dkx".length) || "/", m = req.method, ip = ipOf(req);
  // Từ xa mà văn phòng chưa đặt khóa xem: không nhận gì cả (kể cả ghép), vì ai có link cũng vào được tới đây.
  if (!local && !hasKey) return send(403, { ok: false, code: "NEED_ACCESS_KEY", error: "Văn phòng chưa đặt khóa xem (accessKey) nên chưa cho điều khiển từ xa." });
  const tb = dkx.xacThuc(cookieOf(req, "vpd"), ip);
  try {
    if (m === "GET" && p === "/trang-thai") return send(200, { ok: true, local, ghep: !!tb, thietBi: tb });
    // Trên chính máy tính: tạo mã, xem và thu hồi thiết bị, đọc nhật ký.
    if (["/ma", "/thiet-bi", "/thu-hoi", "/nhat-ky"].includes(p)) {
      if (!local) return send(403, { ok: false, code: "LOCAL_ONLY", error: "Chỉ làm được trên chính máy tính chạy văn phòng." });
      if (m === "POST" && p === "/ma") return send(200, { ok: true, ...dkx.taoMa() });
      if (m === "GET" && p === "/thiet-bi") return send(200, { ok: true, thietBi: dkx.danhSach(), maDangCo: dkx.maDangCo() });
      if (m === "POST" && p === "/thu-hoi") { const b = await readJson(req, 2000); return send(200, { ok: true, thietBi: dkx.thuHoi(String(b && b.id || "")) }); }
      if (m === "GET" && p === "/nhat-ky") return send(200, { ok: true, nhatKy: dkx.nhatKy(100) });
    }
    if (m === "POST" && p === "/ghep") {
      const b = await readJson(req, 2000);
      const r = dkx.ghep(String(b && b.ma || ""), b && b.ten, ip);
      const cookie = `vpd=${r.token}; Path=/dkx; HttpOnly; SameSite=Strict; Max-Age=7776000${https(req) ? "; Secure" : ""}`;
      return send(200, { ok: true, thietBi: r.thietBi }, { "Set-Cookie": cookie });
    }
    if (m === "POST" && p === "/thoat") {
      if (tb) dkx.thuHoi(tb.id, "chinh-dien-thoai");
      return send(200, { ok: true }, { "Set-Cookie": "vpd=; Path=/dkx; HttpOnly; SameSite=Strict; Max-Age=0" });
    }
    if (p.startsWith("/api/")) {
      if (!tb) return send(401, { ok: false, code: "NOT_PAIRED", error: "Điện thoại chưa ghép hoặc đã bị thu hồi: nhập mã ghép mới." });
      const target = p.slice(4) + (url.search || "");
      if (!allowed(m, target)) { dkx.ghiNhatKy({ su: "chan", thietBi: tb.id, ten: tb.ten, ip, lenh: m + " " + p.slice(4) }); return send(403, { ok: false, code: "NOT_ALLOWED", error: "Lệnh này chỉ làm trên máy tính, không mở cho điện thoại." }); }
      // Clip và ảnh của phim: chuyển nguyên luồng (không đọc hết vào bộ nhớ, giữ Range để tua). ctl chỉ trả file trong media/ của phim.
      if (m === "GET" && target.split("?")[0] === "/phim/media") return stream ? stream(req, res, target) : send(501, { ok: false, code: "NOT_SUPPORTED", error: "Máy chủ chưa hỗ trợ xem media qua điện thoại." });
      let body;
      if (m === "POST") { body = await readJson(req, 20000); if (!body) return send(400, { ok: false, code: "BAD_JSON", error: "Thân yêu cầu không phải JSON hợp lệ" }); }
      // Repo tạo từ điện thoại luôn riêng tư: không cho tham số ẩn lách câu xác nhận "riêng tư" (công khai chỉ khi CEO tự đổi trên GitHub).
      if (m === "POST" && target.split("?")[0] === "/du-an-moi") body = { ...body, rieng: true };
      // Điện thoại chỉ đặt model/mức cho từng phòng (chạm nhãn nhân vật); bật/tắt điều phối tự động vẫn làm trên máy tính.
      // Điện thoại chỉ chọn khung/take; ngân sách và đồng ý dùng hình người thật làm trên máy tính.
      if (m === "POST" && target.split("?")[0] === "/phim/ceo") body = { workspace: body.workspace, canh: body.canh, khungChon: body.khungChon, takeChon: body.takeChon };
      if (m === "POST" && target.split("?")[0] === "/dieu-phoi") body = { coDinh: body && body.coDinh && typeof body.coDinh === "object" ? body.coDinh : {} };
      // Gợi ý tên repo gọi Claude (tới 60 giây) + GitHub: cho 95 giây thay vì 10 giây, kẻo bị cắt rồi báo nhầm "ctl chưa chạy".
      // Đọc danh sách model lần đầu (Codex + Antigravity CLI) có thể gần 1 phút; đổi tài khoản Antigravity chạy PowerShell vài lần.
      const het = target.startsWith("/du-an-moi/goi-y") ? 95000 : target.startsWith("/dieu-phoi/models") ? 70000 : /^\/agy-tai-khoan\/[^/]+\/chuyen/.test(target) ? 60000 : target.startsWith("/kill-all") ? 20000 : 10000;
      const r = await call(m, target, body, het);
      if (m === "POST") dkx.ghiNhatKy({ su: "lenh", thietBi: tb.id, ten: tb.ten, ip, lenh: m + " " + target.split("?")[0], ketQua: r ? r.status : "ctl-tat" });
      if (!r) return send(503, { ok: false, code: "CTL_OFFLINE", error: "Bộ điều khiển (ctl) chưa chạy trên máy tính." });
      return send(r.status, r.json || { ok: false, error: "ctl trả dữ liệu lạ" });
    }
    return send(404, { ok: false, code: "NOT_FOUND", error: "Không có " + m + " /dkx" + p });
  } catch (e) { return fail(e); }
}

module.exports = { createDieuKhienXa, handle, allowed, ALLOW, ipOf };
