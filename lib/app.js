// Phần "app trên máy" của Văn phòng AI (không thư viện ngoài): tìm trình duyệt để mở cửa sổ app, kiểm văn phòng đã chạy chưa,
// tạo file biểu tượng .ico cho lối tắt Windows. Dùng bởi scripts/mo-app.js, tat-app.js, cai-app.js.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const HOME = () => process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
const PID_FILE = () => path.join(HOME(), "app.pid");
const LOG_FILE = () => path.join(HOME(), "logs", "app.log");

// Văn phòng đang trả lời chưa (200, hoặc 401 khi bật khóa xem, đều là đang chạy).
function isUp(port, timeoutMs = 1500) {
  return new Promise((ok) => {
    const r = http.get({ host: "127.0.0.1", port, path: "/manifest.webmanifest", timeout: timeoutMs, headers: { host: "127.0.0.1:" + port } }, (res) => { res.resume(); ok(res.statusCode === 200 || res.statusCode === 401); });
    r.on("timeout", () => r.destroy());
    r.on("error", () => ok(false));
  });
}

async function waitUp(port, ms = 20000, want = true) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await isUp(port)) === want) return true;
    await new Promise((ok) => setTimeout(ok, 400));
  }
  return false;
}

// Trình duyệt nhân Chromium (Edge, Chrome, Brave, Chromium) để mở chế độ cửa sổ app (--app=URL, không thanh địa chỉ).
// Trả về đường dẫn đầu tiên tồn tại, hoặc null thì mở bằng trình duyệt mặc định.
function browserCandidates(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    const roots = [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
    const rel = ["Microsoft\\Edge\\Application\\msedge.exe", "Google\\Chrome\\Application\\chrome.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe", "Chromium\\Application\\chrome.exe"];
    return rel.flatMap((r) => roots.map((root) => path.win32.join(root, r)));
  }
  if (platform === "darwin") {
    return ["Microsoft Edge", "Google Chrome", "Brave Browser", "Chromium"].map((n) => `/Applications/${n}.app/Contents/MacOS/${n}`);
  }
  const dirs = String(env.PATH || "").split(path.delimiter).filter(Boolean);
  return ["microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser"].flatMap((n) => dirs.map((d) => path.join(d, n)));
}
function findBrowser(env = process.env, platform = process.platform, exists = fs.existsSync) {
  return browserCandidates(env, platform).find((f) => exists(f)) || null;
}

// Lệnh mở URL. Có trình duyệt Chromium: cửa sổ app riêng. Không có: trình duyệt mặc định của hệ điều hành.
// Không đi qua shell (cmd /c start) để URL không bao giờ bị diễn giải thành lệnh.
function openCommand(url, browser, platform = process.platform) {
  if (browser) return [browser, ["--app=" + url, "--new-window"]];
  if (platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}

// File .ico chứa sẵn ảnh PNG (Windows Vista trở lên đọc được), để lối tắt Desktop có biểu tượng của văn phòng.
function pngToIco(png) {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("Không phải file PNG");
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);       // ICONDIR: 1 ảnh
  head.writeUInt8(w >= 256 ? 0 : w, 6); head.writeUInt8(h >= 256 ? 0 : h, 7);          // 0 nghĩa là 256
  head.writeUInt8(0, 8); head.writeUInt8(0, 9); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);                      // kích thước + vị trí dữ liệu
  return Buffer.concat([head, png]);
}

module.exports = { HOME, PID_FILE, LOG_FILE, isUp, waitUp, browserCandidates, findBrowser, openCommand, pngToIco };
