"use strict";
// Xưởng phim P0 (ctl/xuong-phim.js, tools/xuong-phim/tts_sync.py): mọi phòng dùng chung FFmpeg, Python, giọng đọc.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { PassThrough } = require("node:stream");
const { spawnSync } = require("node:child_process");
const xp = require("../ctl/xuong-phim");

const WIN = process.platform === "win32";
const EXE = WIN ? "ffmpeg.exe" : "ffmpeg";
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-xp-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const ghi = (p, noiDung = "") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, noiDung); return p; };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

test("tìm FFmpeg: PATH trước, rồi lối tắt winget, rồi thư mục gói Gyan.FFmpeg; không có thì null", (t) => {
  const d = tmp(t);
  assert.equal(xp.timFfmpeg({ env: { PATH: path.join(d, "trong") } }), null);
  const goi = ghi(path.join(d, "local", "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-8.0-full_build", "bin", EXE));
  assert.equal(xp.timFfmpeg({ env: { PATH: "", LOCALAPPDATA: path.join(d, "local") } }), goi);
  const link = ghi(path.join(d, "local", "Microsoft", "WinGet", "Links", EXE));
  assert.equal(xp.timFfmpeg({ env: { PATH: "", LOCALAPPDATA: path.join(d, "local") } }), link);
  const tren = ghi(path.join(d, "bin", EXE));
  assert.equal(xp.timFfmpeg({ env: { PATH: path.join(d, "bin"), LOCALAPPDATA: path.join(d, "local") } }), tren);
});

test("biến môi trường cho lượt AI: chỉ đường dẫn; Python chỉ khi venv đã có; FFmpeg khi tìm thấy", (t) => {
  const d = tmp(t);
  const x = xp.createXuongPhim({ dir: d, env: { PATH: "" } });
  let e = x.envAi();
  assert.ok(e.XUONG_PHIM_TTS.endsWith(path.join("tools", "xuong-phim", "tts_sync.py")));
  assert.equal(e.XUONG_PHIM_MODELS, path.join(d, "xuong-phim", "models"));
  assert.equal(e.XUONG_PHIM_PYTHON, undefined, "chưa cài thì không trỏ tới Python không tồn tại");
  assert.equal(e.XUONG_PHIM_FFMPEG, undefined);
  ghi(x.duongDan.python);
  const ff = ghi(path.join(d, "bin", EXE));
  e = xp.createXuongPhim({ dir: d, env: { PATH: path.join(d, "bin") } }).envAi();
  assert.equal(e.XUONG_PHIM_PYTHON, x.duongDan.python);
  assert.equal(e.XUONG_PHIM_FFMPEG, ff);
  assert.ok(Object.values(e).every((v) => typeof v === "string" && !/key|token|sk-|AIza/i.test(v)));
});

test("kiểm: thiếu FFmpeg và Python thì báo cách sửa; đủ thì sẵn sàng", async (t) => {
  const d = tmp(t);
  const models = [{ ten: "a.onnx", bytes: 3, sha256: sha("abc") }];
  const run = (prog, args, opts, cb) => {
    if (/ffmpeg/.test(prog)) return cb(null, "ffmpeg version 8.0-full_build-www.gyan.dev Copyright\n", "");
    return cb(null, JSON.stringify({ "edge-tts": "7.3.1", "kokoro-onnx": "0.6.1", soundfile: "0.14.0", onnxruntime: "1.31.1" }) + "\n", "");
  };
  let x = xp.createXuongPhim({ dir: d, env: { PATH: "" }, run, models, appDir: d });
  let k = await x.kiem({ fresh: true });
  assert.equal(k.san, false);
  assert.match(k.muc.find((m) => m.id === "ffmpeg").cachSua, /Cài xưởng phim/);
  assert.equal(k.muc.find((m) => m.id === "giong-viet").ok, false);

  ghi(path.join(d, "bin", EXE)); ghi(path.join(d, "bin", WIN ? "ffprobe.exe" : "ffprobe"));
  ghi(x.duongDan.python); ghi(path.join(x.duongDan.models, "a.onnx"), "abc"); ghi(x.duongDan.tts);
  x = xp.createXuongPhim({ dir: d, env: { PATH: path.join(d, "bin") }, run, models, appDir: d });
  k = await x.kiem({ fresh: true });
  assert.deepEqual(k.muc.filter((m) => !m.ok).map((m) => m.id), []);
  assert.equal(k.san, true);
  assert.match(k.muc[0].chiTiet, /8\.0-full_build/);
});

test("cài: tạo venv, pip chỉ nhận gói đóng sẵn đúng file ghim, chép model khớp mã băm; đang cài thì từ chối lần hai", async (t) => {
  const d = tmp(t), nguon = path.join(d, "agy-models");
  ghi(path.join(nguon, "a.onnx"), "abc");
  ghi(path.join(nguon, "b.bin"), "SAI");                  // sai mã băm: không chép
  const models = [{ ten: "a.onnx", bytes: 3, sha256: sha("abc") }];
  const goi = [];
  let x;
  const moiTruong = [];
  const run = (prog, args, opts, cb) => {
    goi.push([prog, ...args]);
    moiTruong.push(opts.env);
    if (args.includes("venv")) { ghi(x.duongDan.python); return setImmediate(() => cb(null, "", "")); }
    if (prog === "winget") { ghi(path.join(x.duongDan.ffmpeg, "ffmpeg-9.0-full_build", "bin", EXE)); return setImmediate(() => cb(null, "", "")); }
    setImmediate(() => cb(null, "{}", ""));
  };
  x = xp.createXuongPhim({ dir: d, env: { PATH: "" }, run, models, nguonModel: [nguon], appDir: d, get: () => { throw new Error("không được tải khi đã có bản chép"); } });
  if (!WIN) ghi(path.join(x.duongDan.ffmpeg, "bin", EXE));   // ngoài Windows không cài qua winget
  const lan1 = x.cai();
  await assert.rejects(x.cai(), (e) => e.code === "XUONG_BUSY");
  await lan1;
  assert.ok(moiTruong.every((e) => e.TEMP === x.duongDan.tam && e.PIP_CACHE_DIR.startsWith(x.duongDan.goc)), "tải và tạm đều nằm trong thư mục gốc của xưởng");
  if (WIN) {
    const wg = goi.find((g) => g[0] === "winget");
    assert.ok(wg && wg.includes("Gyan.FFmpeg") && wg[wg.indexOf("--location") + 1] === x.duongDan.ffmpeg, "FFmpeg cài vào <gốc>/ffmpeg");
    assert.equal(x.envAi().XUONG_PHIM_FFMPEG, path.join(x.duongDan.ffmpeg, "ffmpeg-9.0-full_build", "bin", EXE));
  }
  const venv = goi.find((g) => g.includes("venv"));
  assert.ok(venv, "có tạo venv");
  const pip = goi.find((g) => g.includes("pip"));
  assert.ok(pip.includes("--only-binary=:all:"), "không chạy script cài của gói");
  assert.ok(pip.includes(path.join(d, "tools", "xuong-phim", "requirements.txt")));
  assert.equal(fs.readFileSync(path.join(x.duongDan.models, "a.onnx"), "utf8"), "abc");
  assert.ok(!fs.existsSync(path.join(x.duongDan.models, "b.bin")));
});

test("thư mục gốc đổi được bằng xuong-phim.json (ổ khác); hỏng hoặc đường dẫn tương đối thì về mặc định; model ở chỗ cũ là nguồn chép", (t) => {
  const d = tmp(t), dich = path.join(d, "o-d", "xuong-phim");
  assert.equal(xp.thuMucGoc(d), path.join(d, "xuong-phim"));
  ghi(path.join(d, "xuong-phim.json"), JSON.stringify({ thuMuc: "tuong-doi" }));
  assert.equal(xp.thuMucGoc(d), path.join(d, "xuong-phim"));
  ghi(path.join(d, "xuong-phim.json"), "{hỏng");
  assert.equal(xp.thuMucGoc(d), path.join(d, "xuong-phim"));
  ghi(path.join(d, "xuong-phim.json"), JSON.stringify({ thuMuc: dich }));
  const x = xp.createXuongPhim({ dir: d, env: { PATH: "" } });
  assert.equal(x.duongDan.goc, dich);
  assert.equal(x.duongDan.python.startsWith(dich), true);
  assert.equal(x.envAi().XUONG_PHIM_MODELS, path.join(dich, "models"));
});

test("tải model: chỉ host GitHub, theo chuyển hướng, sai mã băm thì bỏ file", async (t) => {
  const d = tmp(t), dich = path.join(d, "m.bin");
  await assert.rejects(xp.taiFile("https://example.com/m.bin", dich, { sha256: sha("x") }), (e) => e.code === "BAD_URL");
  const gia = (body) => (u, opts, cb) => {
    const res = new PassThrough();
    if (u.hostname === "github.com") { res.statusCode = 302; res.headers = { location: "https://objects.githubusercontent.com/m.bin" }; }
    else { res.statusCode = 200; res.headers = {}; }
    setImmediate(() => { cb(res); res.end(res.statusCode === 200 ? body : undefined); });
    const req = new PassThrough(); req.setTimeout = () => req; return req;
  };
  await xp.taiFile("https://github.com/a/b/releases/download/v/m.bin", dich, { sha256: sha("dung"), get: gia("dung") });
  assert.equal(fs.readFileSync(dich, "utf8"), "dung");
  fs.rmSync(dich);
  await assert.rejects(xp.taiFile("https://github.com/a/b/releases/download/v/m.bin", dich, { sha256: sha("dung"), get: gia("sai") }), (e) => e.code === "SAI_MA_BAM");
  assert.ok(!fs.existsSync(dich) && !fs.existsSync(dich + ".dang-tai"));
});

test("model Kokoro ghim mã băm SHA-256 và tải từ release cố định của GitHub", () => {
  for (const m of xp.MODELS) {
    assert.match(m.sha256, /^[0-9a-f]{64}$/);
    assert.match(m.url, /^https:\/\/github\.com\/thewh1teagle\/kokoro-onnx\/releases\/download\/model-files-v1\.1\//);
    assert.ok(m.bytes > 1e6);
  }
  const req = fs.readFileSync(path.join(__dirname, "..", "tools", "xuong-phim", "requirements.txt"), "utf8");
  for (const dong of req.split(/\r?\n/).filter((l) => l && !l.startsWith("#"))) assert.match(dong, /^[a-z0-9-]+==\d+(\.\d+)+$/, "ghim đúng bản: " + dong);
});

// Script giọng đọc: kiểm đầu vào trước khi gọi bộ giọng (không cần mạng hay thư viện).
const PY = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);
const ffmpeg = xp.timFfmpeg();
test("TTS theo cảnh đo âm thanh thật và ghép hai mốc liền nhau dù lời dẫn có nhiều câu", { skip: (!PY || !ffmpeg) && "cần Python và FFmpeg" }, (t) => {
  const d = tmp(t);
  const script = path.join(__dirname, "..", "tools", "xuong-phim", "tts_sync.py");
  const loi = ["Cảnh hai lên trước. Câu này vẫn ở cảnh hai.", "Cảnh một đứng sau."];
  const canh = ghi(path.join(d, "canh.json"), JSON.stringify(loi));
  const soMau = [];
  function docPcm(file) {
    const ketQua = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-f", "s16le", "-"]);
    assert.equal(ketQua.status, 0, ketQua.stderr?.toString());
    return ketQua.stdout.length / 2;
  }
  for (const [i, giay] of [0.4, 0.6].entries()) {
    const mau = path.join(d, `mau-${i}.mp3`);
    const tao = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `sine=duration=${giay}:sample_rate=24000`,
      "-c:a", "libmp3lame", mau], { encoding: "utf8" });
    assert.equal(tao.status, 0, tao.stderr);
    soMau.push(docPcm(mau));
  }
  ghi(path.join(d, "pylib", "edge_tts.py"), [
    "from pathlib import Path",
    "class SubMaker:",
    "    def get_srt(self): return ''",
    "class Communicate:",
    "    def __init__(self, text, voice, **kwargs):",
    "        self.which = 0 if text.startswith('Cảnh hai') else 1",
    "    async def stream(self):",
    "        audio = Path.cwd() / f'mau-{self.which}.mp3'",
    "        yield {'type': 'audio', 'data': audio.read_bytes()}",
  ].join("\n"));
  const out = path.join(d, "out", "voice");
  const env = { ...process.env, PYTHONPATH: path.join(d, "pylib"), XUONG_PHIM_FFMPEG: ffmpeg };
  const r = spawnSync(PY, [script, "--scenes-file", canh, "--output", out], { cwd: d, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const moc = JSON.parse(fs.readFileSync(out + ".json", "utf8"));
  const mocGiua = Math.round(soMau[0] / 24), mocCuoi = Math.round((soMau[0] + soMau[1]) / 24);
  assert.deepEqual(moc.map(({ index, startMs, endMs, text }) => [index, startMs, endMs, text]), [
    [1, 0, mocGiua, loi[0]], [2, mocGiua, mocCuoi, loi[1]],
  ]);
  const srt = fs.readFileSync(out + ".srt", "utf8");
  const timecodes = srt.trim().split(/\r?\n/).filter((s) => s.includes(" --> "));
  assert.equal(timecodes.length, 2);
  assert.equal(timecodes[0].split(" --> ")[1], timecodes[1].split(" --> ")[0]);
  // Một số phiên bản FFmpeg giữ một phần độ trễ bộ mã hóa MP3 khi giải mã.
  assert.ok(Math.abs(docPcm(out + ".mp3") - (soMau[0] + soMau[1])) <= 576);
});

test("tts_sync.py: kịch bản rỗng (kể cả chỉ có BOM) và tham số sai thoát mã 1, không tạo file", { skip: !PY && "không có Python" }, (t) => {
  const d = tmp(t), script = path.join(__dirname, "..", "tools", "xuong-phim", "tts_sync.py");
  const bom = ghi(path.join(d, "bom.txt"), "﻿  \n");
  let r = spawnSync(PY, [script, "--file", bom, "--output", path.join(d, "ra", "v")], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /rỗng/);
  r = spawnSync(PY, [script, "--text", "Xin chào", "--rate", "nhanh", "--output", path.join(d, "ra", "v")], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  assert.ok(!fs.existsSync(path.join(d, "ra", "v.mp3")));
});

test("tts_sync.py: rút câu trước khi chồng mốc 50 ms (3125 -> 3075), giữ nguyên startMs, âm thanh và hai câu liền mốc (5275 -> 5275)", { skip: !PY && "không có Python" }, (t) => {
  const d = tmp(t), script = path.join(__dirname, "..", "tools", "xuong-phim", "tts_sync.py");
  const fakeAudio = Buffer.from("ID3-FAKE-AUDIO-KHONG-DOI-BYTE-NAO");
  ghi(path.join(d, "pylib", "edge_tts.py"), [
    "class SubMaker:",
    "    def feed(self, chunk): pass",
    "    def get_srt(self):",
    "        return (",
    "            '1\\n00:00:00,100 --> 00:00:03,125\\nMỗi thước phim bắt đầu từ một ý tưởng.\\n\\n'",
    "            '2\\n00:00:03,075 --> 00:00:05,275\\nCắt cảnh đúng nhịp lời đọc.\\n\\n'",
    "            '3\\n00:00:05,275 --> 00:00:07,862\\nXem lại toàn bộ trước khi xuất.\\n'",
    "        )",
    "class Communicate:",
    "    def __init__(self, text, voice, rate='+0%', volume='+0%'): pass",
    "    async def stream(self):",
    `        yield {'type': 'audio', 'data': ${JSON.stringify(fakeAudio.toString("latin1"))}.encode('latin1')}`,
    "        yield {'type': 'WordBoundary'}",
  ].join("\n") + "\n");

  const outBase = path.join(d, "out", "voice");
  const env = { ...process.env, PYTHONPATH: path.join(d, "pylib") + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : "") };
  const r = spawnSync(PY, [script, "--text", "Ba câu thử giọng Việt.", "--voice", "vi-nu", "--output", outBase], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  // 1. Âm thanh giữ nguyên tuyệt đối
  assert.deepEqual(fs.readFileSync(outBase + ".mp3"), fakeAudio);

  // 2. JSON rút câu 1 từ 3125 ms về đúng 3075 ms (= startMs câu 2), giữ nguyên startMs và cho phép câu 2–3 liền mốc ở 5275 ms
  const rows = JSON.parse(fs.readFileSync(outBase + ".json", "utf8"));
  assert.deepEqual(rows, [
    { index: 1, startMs: 100, endMs: 3075, startSec: 0.1, endSec: 3.075, durationMs: 2975, text: "Mỗi thước phim bắt đầu từ một ý tưởng." },
    { index: 2, startMs: 3075, endMs: 5275, startSec: 3.075, endSec: 5.275, durationMs: 2200, text: "Cắt cảnh đúng nhịp lời đọc." },
    { index: 3, startMs: 5275, endMs: 7862, startSec: 5.275, endSec: 7.862, durationMs: 2587, text: "Xem lại toàn bộ trước khi xuất." },
  ]);

  // 3. SRT khớp từng mili-giây với JSON, không còn chồng mốc 03,125 > 03,075
  const srt = fs.readFileSync(outBase + ".srt", "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    srt,
    "1\n00:00:00,100 --> 00:00:03,075\nMỗi thước phim bắt đầu từ một ý tưởng.\n\n" +
    "2\n00:00:03,075 --> 00:00:05,275\nCắt cảnh đúng nhịp lời đọc.\n\n" +
    "3\n00:00:05,275 --> 00:00:07,862\nXem lại toàn bộ trước khi xuất.\n"
  );
});
