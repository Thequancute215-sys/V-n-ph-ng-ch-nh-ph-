// Phần "app trên máy" của Văn phòng AI (không thư viện ngoài): tìm trình duyệt để mở cửa sổ app, kiểm văn phòng đã chạy chưa,
// tạo file biểu tượng .ico cho lối tắt Windows. Dùng bởi scripts/mo-app.js, tat-app.js, cai-app.js.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { execFileSync } = require("child_process");

const HOME = () => process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
const PID_FILE = () => path.join(HOME(), "app.pid");
const LOG_FILE = () => path.join(HOME(), "logs", "app.log");

// Địa chỉ để gọi văn phòng: `host` trong config.json; nghe mọi địa chỉ (0.0.0.0 / ::) hay để trống thì gọi 127.0.0.1 (P7-M04).
function officeHost(cfg) {
  const h = String((cfg && cfg.host) || "").trim();
  return !h || h === "0.0.0.0" || h === "::" ? "127.0.0.1" : h;
}
const hostPort = (host, port) => (host.includes(":") ? `[${host}]` : host) + ":" + port;

// Văn phòng đang trả lời chưa (200, hoặc 401 khi bật khóa xem, đều là đang chạy).
function isUp(port, { host = "127.0.0.1", timeoutMs = 1500 } = {}) {
  return new Promise((ok) => {
    const r = http.get({ host, port, path: "/manifest.webmanifest", timeout: timeoutMs, headers: { host: hostPort(host, port) } }, (res) => { res.resume(); ok(res.statusCode === 200 || res.statusCode === 401); });
    r.on("timeout", () => r.destroy());
    r.on("error", () => ok(false));
  });
}

async function waitUp(port, { host, ms = 20000, want = true } = {}) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await isUp(port, { host })) === want) return true;
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
  const dirs = String(env.PATH || "").split(":").filter(Boolean);
  return ["microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser"].flatMap((n) => dirs.map((d) => path.posix.join(d, n)));
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

// Dòng lệnh của một tiến trình, hoặc null nếu không đọc được (tiến trình đã tắt, không có quyền).
function commandLineOf(pid, platform = process.platform) {
  pid = Number(pid);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    if (platform === "linux") return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ").trim() || null;
    if (platform === "win32") {
      const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`], { encoding: "utf8", windowsHide: true, timeout: 10000 });
      return out.trim() || null;
    }
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 5000 }).trim() || null;
  } catch { return null; }
}
// PID trong app.pid có còn đúng là bộ chạy văn phòng không. Hệ điều hành dùng lại số PID, nên PID cũ còn "sống"
// chưa chắc là của văn phòng: không kiểm thì `npm run tat-app` có thể giết nhầm chương trình khác (P7-H02).
function isAppProcess(pid, platform = process.platform) {
  const cmd = commandLineOf(pid, platform);
  return !!cmd && /(^|[\s"'\\/])scripts[\\/]chay-tat-ca\.js(?=$|[\s"'])/.test(cmd); // đường dẫn tuyệt đối (npm run app) hay tương đối (npm run all)
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

module.exports = { HOME, PID_FILE, LOG_FILE, officeHost, isUp, waitUp, commandLineOf, isAppProcess, browserCandidates, findBrowser, openCommand, pngToIco };
