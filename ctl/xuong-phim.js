// Xưởng phim AI — P0 "sửa nền máy" (CEO duyệt 20/11/2026, bản thiết kế "Xưởng Phim AI").
// Mọi phòng (Claude, Codex, Antigravity) dùng CHUNG một bộ công cụ làm phim trên máy:
//   - FFmpeg: CEO cài một lần (winget install Gyan.FFmpeg); văn phòng tìm trên PATH rồi trong thư mục của winget,
//     vì ctl có thể đã chạy từ trước khi cài nên PATH của nó chưa có FFmpeg.
//   - Python chung ~/.van-phong-ao/xuong-phim/venv: edge-tts, kokoro-onnx, soundfile đúng bản ghim ở tools/xuong-phim/requirements.txt.
//     Trước đây các gói này nằm trong bản Python của Microsoft Store mà Antigravity tình cờ dùng, phòng khác không thấy.
//   - Model Kokoro (giọng Anh chạy trên máy) ở ~/.van-phong-ao/xuong-phim/models, kiểm mã băm SHA-256 đã ghim.
// Mỗi lượt AI nhận biến môi trường XUONG_PHIM_* (envFor của ctl/jobs.js) để gọi đúng Python, script giọng đọc và FFmpeg.
// Cài chỉ chạy khi CEO bấm "Cài xưởng phim" ở trang Kết nối: pip chỉ nhận gói đóng sẵn (--only-binary=:all:), không chạy
// script cài; model chép lại từ bản Antigravity đã tải nếu khớp mã băm, không có thì tải từ release đã ghim rồi kiểm mã băm.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { execFile } = require("child_process");

const err = (code, message) => Object.assign(new Error(message), { code });
const WIN = process.platform === "win32";
const APP = path.join(__dirname, "..");

// Model Kokoro v1.0 (release "model-files-v1.1" của thewh1teagle/kokoro-onnx). Mã băm đo trên bản đã chạy được 20/11/2026.
const MODELS = [
  { ten: "kokoro-v1.0.onnx", bytes: 325505369, sha256: "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
    url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx" },
  { ten: "voices-v1.0.bin", bytes: 28214398, sha256: "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
    url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin" },
];
const TAI_HOST = /^(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)$/;
const GOI_PY = ["edge_tts", "kokoro_onnx", "soundfile"];

function duongDan(dir, appDir = APP) {
  const goc = path.join(dir, "xuong-phim");
  const venv = path.join(goc, "venv");
  return {
    goc, venv,
    python: WIN ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python"),
    models: path.join(goc, "models"),
    tts: path.join(appDir, "tools", "xuong-phim", "tts_sync.py"),
    req: path.join(appDir, "tools", "xuong-phim", "requirements.txt"),
  };
}

// FFmpeg: PATH của ctl trước, rồi lối tắt winget (Links), rồi thư mục gói Gyan.FFmpeg do winget giải nén.
function timFfmpeg({ env = process.env, fsx = fs } = {}) {
  const exe = WIN ? "ffmpeg.exe" : "ffmpeg";
  const co = (p) => { try { return fsx.statSync(p).isFile(); } catch { return false; } };
  for (const d of String(env.PATH || env.Path || "").split(path.delimiter).filter(Boolean)) if (co(path.join(d, exe))) return path.join(d, exe);
  const local = env.LOCALAPPDATA;
  if (!local) return null;
  const link = path.join(local, "Microsoft", "WinGet", "Links", exe);
  if (co(link)) return link;
  const goi = path.join(local, "Microsoft", "WinGet", "Packages");
  let ds = [];
  try { ds = fsx.readdirSync(goi).filter((n) => /^Gyan\.FFmpeg/i.test(n)); } catch {}
  for (const g of ds) {
    let con = [];
    try { con = fsx.readdirSync(path.join(goi, g)); } catch {}
    for (const c of con) { const p = path.join(goi, g, c, "bin", exe); if (co(p)) return p; }
  }
  return null;
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(p).on("error", reject).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex")));
  });
}

// Tải một file qua HTTPS, theo chuyển hướng tới đúng các host của GitHub, ghi ra đích tạm rồi kiểm mã băm mới đổi tên.
function taiFile(url, dich, { sha256, get = https.get, soLan = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== "https:" || !TAI_HOST.test(u.hostname)) return reject(err("BAD_URL", "Không tải từ host ngoài GitHub: " + u.hostname));
    get(u, { headers: { "User-Agent": "van-phong-ai" }, timeout: 60000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (soLan <= 0) return reject(err("TAI_LOI", "Chuyển hướng quá nhiều lần"));
        return resolve(taiFile(new URL(res.headers.location, u).toString(), dich, { sha256, get, soLan: soLan - 1 }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(err("TAI_LOI", "Tải model lỗi HTTP " + res.statusCode)); }
      const tam = dich + ".dang-tai", h = crypto.createHash("sha256"), out = fs.createWriteStream(tam);
      res.on("data", (d) => h.update(d));
      res.pipe(out);
      const huy = (e) => { out.destroy(); try { fs.rmSync(tam, { force: true }); } catch {} reject(e); };
      res.on("error", huy);
      out.on("error", huy);
      out.on("close", () => {
        const so = h.digest("hex");
        if (sha256 && so !== sha256) return huy(err("SAI_MA_BAM", "Model tải về sai mã băm, đã bỏ: " + path.basename(dich)));
        fs.renameSync(tam, dich);
        resolve(dich);
      });
    }).on("error", (e) => reject(err("TAI_LOI", "Không tải được model: " + e.message))).on("timeout", function () { this.destroy(err("TAI_LOI", "Tải model quá thời gian chờ")); });
  });
}

function createXuongPhim({ dir, audit = null, appDir = APP, run = execFile, env = process.env, fsx = fs, get = https.get,
  nguonModel = [path.join(os.homedir(), ".gemini", "config", "skills", "videopromax", "models")], models = MODELS, cacheMs = 60000 } = {}) {
  const p = duongDan(dir, appDir);
  let cache = null, cacheAt = 0, dangCai = null, buoc = "", loiCuoi = "";
  const exec = (prog, args, timeout = 60000) => new Promise((resolve) => {
    run(prog, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...env, PYTHONIOENCODING: "utf-8", PIP_DISABLE_PIP_VERSION_CHECK: "1" } },
      (e, stdout, stderr) => resolve({ ok: !e, out: String(stdout || ""), err: String(stderr || ""), error: e && e.message }));
  });
  const coFile = (f) => { try { return fsx.statSync(f).isFile(); } catch { return false; } };

  // Biến môi trường cho mỗi lượt AI. Chỉ đường dẫn, không có khóa nào.
  function envAi() {
    const ff = timFfmpeg({ env, fsx });
    const out = { XUONG_PHIM_TTS: p.tts, XUONG_PHIM_MODELS: p.models };
    if (coFile(p.python)) out.XUONG_PHIM_PYTHON = p.python;
    if (ff) { out.XUONG_PHIM_FFMPEG = ff; out.XUONG_PHIM_FFPROBE = path.join(path.dirname(ff), WIN ? "ffprobe.exe" : "ffprobe"); }
    return out;
  }

  async function docPython() {
    if (!coFile(p.python)) return { ok: false, chiTiet: "Chưa có Python chung của xưởng phim" };
    const ma = "import json,importlib.metadata as m\nout={}\nfor g in ('edge-tts','kokoro-onnx','soundfile','onnxruntime'):\n    try: out[g]=m.version(g)\n    except Exception: out[g]=None\nprint(json.dumps(out))";
    const r = await exec(p.python, ["-I", "-c", ma], 30000);
    let v = {};
    try { v = JSON.parse(r.out.trim().split(/\r?\n/).pop()); } catch {}
    return { ok: r.ok, banGoi: v, chiTiet: r.ok ? "" : (r.err || r.error || "").slice(0, 300) };
  }

  async function kiem({ fresh = false } = {}) {
    if (dangCai || (!fresh && cache && Date.now() - cacheAt < cacheMs)) return { ...(cache || { san: false, muc: [] }), dangCai: !!dangCai, buoc, loiCuoi };
    const muc = [];
    const ff = timFfmpeg({ env, fsx });
    if (ff) {
      const r = await exec(ff, ["-hide_banner", "-version"], 20000);
      const dong = (r.out.split(/\r?\n/)[0] || "").replace(/^ffmpeg version\s+/i, "").split(" ")[0];
      const probe = coFile(path.join(path.dirname(ff), WIN ? "ffprobe.exe" : "ffprobe"));
      muc.push({ id: "ffmpeg", ten: "FFmpeg + ffprobe", ok: r.ok && probe, chiTiet: r.ok ? "Bản " + dong + (probe ? "" : " · thiếu ffprobe") : "Có file nhưng không chạy được", cachSua: r.ok && probe ? "" : "Cài lại: winget install Gyan.FFmpeg" });
    } else muc.push({ id: "ffmpeg", ten: "FFmpeg + ffprobe", ok: false, chiTiet: "Chưa có trên máy", cachSua: "Mở PowerShell, chạy: winget install Gyan.FFmpeg" });

    const py = await docPython();
    const b = py.banGoi || {};
    muc.push({ id: "giong-viet", ten: "Giọng Việt và Anh (Edge-TTS, cần mạng)", ok: py.ok && !!b["edge-tts"], chiTiet: b["edge-tts"] ? "edge-tts " + b["edge-tts"] : py.chiTiet || "Thiếu edge-tts", cachSua: "Bấm Cài xưởng phim" });
    const thieuModel = [];
    for (const m of models) { let s = -1; try { s = fsx.statSync(path.join(p.models, m.ten)).size; } catch {} if (s !== m.bytes) thieuModel.push(m.ten); }
    muc.push({ id: "giong-anh-offline", ten: "Giọng Anh chạy trên máy (Kokoro-82M)", ok: py.ok && !!b["kokoro-onnx"] && !!b.soundfile && !thieuModel.length,
      chiTiet: [b["kokoro-onnx"] ? "kokoro-onnx " + b["kokoro-onnx"] : "Thiếu kokoro-onnx", thieuModel.length ? "thiếu model " + thieuModel.join(", ") : "model đủ"].join(" · "), cachSua: "Bấm Cài xưởng phim" });
    muc.push({ id: "script-giong", ten: "Script đọc lời dẫn", ok: coFile(p.tts), chiTiet: p.tts, cachSua: "Cập nhật văn phòng lên bản mới" });

    cache = { san: muc.every((m) => m.ok), muc, duongDan: { python: p.python, tts: p.tts, models: p.models, ffmpeg: ff }, luc: new Date().toISOString() };
    cacheAt = Date.now();
    return { ...cache, dangCai: !!dangCai, buoc, loiCuoi };
  }

  async function taoVenv() {
    if (coFile(p.python)) return;
    fsx.mkdirSync(p.goc, { recursive: true });
    const thu = WIN ? [["py", ["-3", "-m", "venv", p.venv]], ["python", ["-m", "venv", p.venv]]] : [["python3", ["-m", "venv", p.venv]]];
    let loi = "";
    for (const [prog, args] of thu) { const r = await exec(prog, args, 180000); if (r.ok && coFile(p.python)) return; loi = (r.err || r.error || "").slice(0, 300); }
    throw err("CAI_LOI", "Không tạo được Python chung (cần Python 3.10 trở lên trên máy): " + loi);
  }

  async function caiGoi() {
    const r = await exec(p.python, ["-m", "pip", "install", "--only-binary=:all:", "--no-input", "-r", p.req], 900000);
    if (!r.ok) throw err("CAI_LOI", "pip cài thư viện lỗi: " + (r.err || r.error || "").split(/\r?\n/).filter(Boolean).slice(-3).join(" | ").slice(0, 400));
  }

  async function caiModel() {
    fsx.mkdirSync(p.models, { recursive: true });
    for (const m of models) {
      const dich = path.join(p.models, m.ten);
      if (coFile(dich) && fsx.statSync(dich).size === m.bytes && (await sha256File(dich)) === m.sha256) continue;
      let xong = false;
      for (const nguon of nguonModel) {
        const f = path.join(nguon, m.ten);
        if (!coFile(f) || fsx.statSync(f).size !== m.bytes || (await sha256File(f)) !== m.sha256) continue;
        fsx.copyFileSync(f, dich + ".dang-chep");
        fsx.renameSync(dich + ".dang-chep", dich);
        xong = true;
        break;
      }
      if (!xong) { buoc = "Đang tải model " + m.ten + " (" + Math.round(m.bytes / 1048576) + " MB)…"; await taiFile(m.url, dich, { sha256: m.sha256, get }); }
    }
  }

  // Trang Kết nối gọi batDauCai() rồi hỏi lại kiem() mỗi vài giây: cài có thể lâu hơn thời gian chờ của một yêu cầu HTTP.
  function batDauCai() {
    if (dangCai) throw err("XUONG_BUSY", "Đang cài xưởng phim, chờ xong lần này.");
    loiCuoi = "";
    cai().catch((e) => { loiCuoi = e.message; });
    return { ...(cache || { san: false, muc: [] }), dangCai: true, buoc, loiCuoi };
  }

  async function cai() {
    if (dangCai) throw err("XUONG_BUSY", "Đang cài xưởng phim, chờ xong lần này.");
    dangCai = (async () => {
      buoc = "Đang tạo Python chung…"; await taoVenv();
      buoc = "Đang cài thư viện giọng đọc (có thể mất vài phút)…"; await caiGoi();
      buoc = "Đang chép model Kokoro…"; await caiModel();
    })();
    try { await dangCai; if (audit) audit.log("ceo", "xuong_phim.cai", null, { ok: true }); }
    catch (e) { if (audit) audit.log("ceo", "xuong_phim.cai", null, { ok: false, loi: String(e.message).slice(0, 200) }); throw e; }
    finally { dangCai = null; buoc = ""; cache = null; }
    return kiem({ fresh: true });
  }

  return { kiem, cai, batDauCai, envAi, duongDan: p };
}

module.exports = { createXuongPhim, timFfmpeg, taiFile, duongDan, MODELS };
