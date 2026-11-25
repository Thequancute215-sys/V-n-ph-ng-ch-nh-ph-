"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { docFileTrongPhim } = require("../lib/phim");
const { FPS, keHoachTrong } = require("./ban-dung");
const runFfmpeg = promisify(execFile);

function gioSrt(seconds) {
  const ms = Math.round(seconds * 1000);
  const pairs = [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60];
  return pairs.map((value) => String(value).padStart(2, "0")).join(":") + "," + String(ms % 1000).padStart(3, "0");
}

async function goiCapCut(root, phim, ffmpeg, run = runFfmpeg) {
  if (!ffmpeg) throw Object.assign(Error("Cần FFmpeg để cắt clip đúng thời lượng trước khi nhập CapCut."), { code: "THIEU_FFMPEG" });
  const kh = keHoachTrong(root, phim);
  const media = path.join(fs.realpathSync(root), "media");
  if (!fs.lstatSync(media).isDirectory()) throw Object.assign(Error("Thư mục media phải nằm trong dự án."), { code: "PATH_ESCAPE" });
  const sources = kh.canh.map((c) => {
    const ext = path.extname(c.take).toLowerCase();
    if (!/^C\d{2,3}$/.test(c.ma) || ![".mp4", ".mov", ".webm"].includes(ext)) {
      throw Object.assign(Error("Gói CapCut cần mã cảnh hợp lệ và clip MP4, MOV hoặc WebM."), { code: "BAD_REQUEST" });
    }
    const start = Math.round(c.batDau * FPS);
    const frames = Math.round((c.batDau + c.giay) * FPS) - start;
    if (frames < 1) throw Object.assign(Error(c.ma + ": cảnh ngắn hơn một khung hình."), { code: "BAD_REQUEST" });
    return { nguon: docFileTrongPhim(root, c.take), ten: c.ma + ".mp4", frames, start };
  });
  const giong = [];
  for (const name of ["voice.mp3", "voice.wav"]) {
    try { giong.push({ nguon: docFileTrongPhim(root, "media/giong/" + name), ten: name }); }
    catch (error) { if (error.code !== "NOT_FOUND") throw error; }
  }
  const folder = await fs.promises.mkdtemp(path.join(media, "capcut-"));
  try {
    for (const { nguon, ten, frames } of sources) {
      const duration = (frames / FPS).toFixed(6);
      try {
        await run(ffmpeg, ["-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-i", nguon,
          "-map", "0:v:0", "-map", "0:a:0?", "-vf", `fps=${FPS},tpad=stop_mode=clone:stop=${frames},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          "-frames:v", String(frames), "-af", "apad", "-t", duration, "-c:v", "libx264", "-preset", "fast",
          "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", path.join(folder, ten)],
        { timeout: 5 * 60 * 1000, windowsHide: true });
      } catch {
        throw Object.assign(Error("FFmpeg không cắt được " + ten + " cho gói CapCut."), { code: "DUNG_LOI" });
      }
    }
    for (const { nguon, ten } of giong) {
      await fs.promises.copyFile(nguon, path.join(folder, ten), fs.constants.COPYFILE_EXCL);
    }
    if (kh.phuDe.length) {
      const srt = kh.phuDe.map((cue, i) =>
        `${i + 1}\n${gioSrt(cue.batDau)} --> ${gioSrt(cue.ketThuc)}\n${cue.chu}\n`).join("\n");
      await fs.promises.writeFile(path.join(folder, "voice.srt"), srt, { flag: "wx" });
    }
    await fs.promises.writeFile(path.join(folder, "thu-tu-canh.csv"), "\uFEFFtep,bat_dau_giay,do_dai_giay\n" +
      sources.map((c) => [c.ten, (c.start / FPS).toFixed(6), (c.frames / FPS).toFixed(6)].join(",")).join("\n") + "\n", { flag: "wx" });
    const audio = giong.map((c) => c.ten);
    if (kh.phuDe.length) audio.push("voice.srt");
    return { folder, clips: sources.length, giong: audio };
  } catch (error) {
    await fs.promises.rm(folder, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { goiCapCut };
