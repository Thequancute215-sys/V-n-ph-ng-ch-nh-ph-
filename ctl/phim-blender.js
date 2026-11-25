"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { cleanEnv } = require("../lib/mask");
const { killTree } = require("../lib/proc");
const tep = require("./phim-tai-lieu");

const exec = promisify(execFile);
const err = (code, message) => Object.assign(Error(message), { code });
const FPS = 24;
const script = path.join(__dirname, "..", "tools", "xuong-phim", "blender_turntable.py");

function timBlender(env = process.env) {
  const win = process.platform === "win32";
  const ten = win ? "blender.exe" : "blender";
  const candidates = [env.XUONG_PHIM_BLENDER, ...(env.PATH || "").split(path.delimiter).filter(Boolean).map((p) => path.join(p, ten))];
  if (win) {
    const dir = path.join(env.ProgramFiles || "C:/Program Files", "Blender Foundation");
    try {
      const ds = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^Blender \d/.test(d.name));
      ds.sort((a, b) => b.name.localeCompare(a.name, "en", { numeric: true }));
      candidates.push(...ds.map((d) => path.join(dir, d.name, ten)));
    } catch {}
  }
  return candidates.find((p) => {
    if (!p || !path.isAbsolute(p)) return false;
    try { return fs.statSync(p).isFile(); } catch { return false; }
  }) || null;
}

function createPhimBlender({ blender = timBlender, ffmpeg, ffprobe, tmp, audit = { log() {} }, run = exec, stop = killTree }) {
  const jobs = new Map();
  const errors = new Map();

  const trangThai = (target) => {
    const root = fs.realpathSync(target);
    return { coBlender: !!blender(), dang: jobs.get(root)?.stage || null, loi: errors.get(root) || null };
  };
  function batDau(root, { id, giay = 5, tiLe = "1:1" }) {
    if (!Number.isInteger(giay) || giay < 3 || giay > 12 || !["1:1", "9:16", "16:9"].includes(tiLe)) {
      throw err("BAD_REQUEST", "Chọn tỉ lệ 1:1, 9:16 hoặc 16:9 và thời lượng 3–12 giây nguyên.");
    }
    if (jobs.size) throw err("DANG_DUNG", "Blender đang tạo một bản xoay 360°, chờ xong trước khi tạo thêm.");
    root = fs.realpathSync(root);
    const program = blender(), ff = ffmpeg(), probe = ffprobe();
    if (!program) throw err("NOT_SUPPORTED", "Chưa tìm thấy Blender. Cài Blender hoặc cấu hình XUONG_PHIM_BLENDER.");
    if (!ff || !probe) throw err("THIEU_FFMPEG", "Cần FFmpeg và FFprobe để đóng và kiểm video xem trước.");
    const { item, bytes } = tep.fileXacThuc(root, id);
    if (!item.moHinh) throw err("BAD_REQUEST", "Chọn mô hình GLB.");
    tep.hoSo(root);
    const output = tep.directory(root, true, "blender");
    const controller = new AbortController();
    const job = { controller, stage: "Blender đang dựng các góc…" };
    jobs.set(root, job);
    errors.delete(root);
    job.promise = ve()
      .catch((error) => {
        const message = controller.signal.aborted ? "Đã dừng tạo bản xoay." :
          ["DUNG_LOI", "CONFLICT", "CHANGED"].includes(error.code) ? error.message : "Không lưu được bản xoay. Kiểm tra ổ đĩa và mô hình.";
        errors.set(root, message);
        audit.log("ceo", "phim.blender.loi", path.basename(root), { message, stage: job.stage, code: error.code || null });
      })
      .finally(() => jobs.delete(root));
    return trangThai(root);

    async function ve() {
      const base = tmp();
      await fs.promises.mkdir(base, { recursive: true });
      const scratch = await fs.promises.mkdtemp(path.join(base, "blender-"));
      try {
        const input = path.join(scratch, "nhan-vat.glb");
        await fs.promises.writeFile(input, bytes, { flag: "wx" });
        const local = cleanEnv({ ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch,
          BLENDER_USER_RESOURCES: path.join(scratch, "settings") });
        const opts = { cwd: scratch, env: local, windowsHide: true, detached: process.platform !== "win32", maxBuffer: 4 * 1024 * 1024, timeout: 10 * 60 * 1000 };
        async function chay(program, args, options = opts) {
          controller.signal.throwIfAborted();
          const process = run(program, args, options);
          job.child = process.child;
          try { return await process; } finally { job.child = null; }
        }
        try {
          await chay(program, ["--background", "--factory-startup", "--disable-autoexec", "--threads", "4",
            "--python-exit-code", "1", "--python", script, "--", input, scratch, tiLe, String(giay)]);
        } catch { throw err("DUNG_LOI", "Blender không render được mô hình này hoặc đã quá thời gian chờ."); }
        const expected = giay * FPS;
        const names = (await fs.promises.readdir(scratch)).filter((name) => /^turn-\d{4}\.png$/.test(name)).sort();
        if (names.length !== expected || names.some((name, i) => name !== `turn-${String(i + 1).padStart(4, "0")}.png`)) {
          throw err("DUNG_LOI", "Blender xuất thiếu khung hình liên tục.");
        }
        const angles = JSON.parse(await fs.promises.readFile(path.join(scratch, "angles.json"), "utf8"));
        if (!Array.isArray(angles) || angles.length !== 5 || angles.some((a, i) => a.degrees !== i * 90 || a.frame !== 1 + expected * i / 4)) {
          throw err("DUNG_LOI", "Blender chưa xác nhận đủ các góc trong một vòng.");
        }
        job.stage = "FFmpeg đang đóng video…";
        const media = path.join(scratch, "turn.mp4");
        try {
          await chay(ff, ["-hide_banner", "-nostdin", "-v", "error", "-n", "-framerate", String(FPS), "-start_number", "1", "-i",
            path.join(scratch, "turn-%04d.png"), "-frames:v", String(expected), "-an", "-c:v", "libx264", "-preset", "fast",
            "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", media], { ...opts, timeout: 60000 });
          const { stdout } = await chay(probe, ["-v", "error", "-select_streams", "v:0", "-show_entries",
            "stream=nb_frames,codec_name,r_frame_rate,duration", "-of", "json", media], { ...opts, timeout: 10000 });
          const info = JSON.parse(stdout).streams[0];
          if (info.codec_name !== "h264" || Number(info.nb_frames) !== expected || info.r_frame_rate !== FPS + "/1" || Number(info.duration) !== giay) throw Error();
        } catch { throw err("DUNG_LOI", "FFmpeg không xuất đủ khung hoặc đúng thời lượng của bản xoay."); }
        const content = await fs.promises.readFile(media);
        controller.signal.throwIfAborted();
        tep.fileXacThuc(root, id);
        const sha256 = createHash("sha256").update(content).digest("hex");
        const name = "xoay-" + sha256 + ".mp4";
        const dest = path.join(output, name);
        const same = fs.lstatSync(dest, { throwIfNoEntry: false });
        if (same && (!same.isFile() || !fs.readFileSync(dest).equals(content))) throw err("CONFLICT", "Đã có tệp khác trùng tên.");
        if (!same) tep.writeFile(dest, content, 0o600);
        const preview = { id, modelSha: item.sha256, sha256, path: "media/blender/" + name, giay, tiLe, angles, created: new Date().toISOString() };
        tep.suaHoSo(root, (p) => { p.blender_preview = preview; });
        audit.log("ceo", "phim.blender.xoay", path.basename(root), { giay, tiLe, sha256 });
      } finally {
        try { await fs.promises.rm(scratch, { recursive: true, force: true, maxRetries: 3 }); }
        catch (error) { audit.log("ceo", "phim.blender.temp", path.basename(root), { code: error.code }); }
      }
    }
  }

  async function dungJob(job) {
    if (!job) return false;
    job.controller.abort();
    if (job.child?.pid) {
      const result = await stop(job.child.pid);
      if (!result.ok) throw err("KILL_FAILED", "Chưa dừng được tiến trình Blender.");
    }
    await job.promise;
    return true;
  }

  const dung = (target) => dungJob(jobs.get(fs.realpathSync(target)));
  async function close() { await Promise.all([...jobs.values()].map(dungJob)); }

  return { trangThai, batDau, dung, close, cho: (root) => jobs.get(root)?.promise };
}

module.exports = { createPhimBlender, timBlender };
