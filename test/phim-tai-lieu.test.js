"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { list, save, file, approve } = require("../ctl/phim-tai-lieu");
const { goiCapCut } = require("../ctl/phim-capcut");

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-tai-lieu-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixtureGlb(extra = {}) {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, meshes: [{ primitives: [] }], scenes: [{}], ...extra }), "utf8");
  const padding = (4 - (json.length % 4)) % 4;
  const glb = Buffer.alloc(20 + json.length + padding, 32);
  [0x46546c67, 2, glb.length, json.length + padding, 0x4e4f534a].forEach((v, i) => glb.writeUInt32LE(v, i * 4));
  json.copy(glb, 20);
  return glb;
}

test("tài liệu đính kèm giữ đúng byte và tên có dấu, gửi lại trả đúng tệp", (t) => {
  const root = project(t);
  const input = { name: "Đề tài.zip", base64: Buffer.from("nội dung mẫu").toString("base64") };
  const item = save(root, input);
  assert.equal(item.ten, "Đề tài.zip");
  assert.deepEqual(save(root, input), item);
  assert.deepEqual(list(root), [item]);
  assert.equal(fs.readFileSync(file(root, item.id).real, "utf8"), "nội dung mẫu");
  assert.throws(() => save(root, { ...input, name: "tệp.html" }), { code: "BAD_REQUEST" });
});

test("GLB duyệt theo đúng phiên bản đính kèm, từ chối tệp có tài nguyên ngoài", (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, "phim.json"), '{"ten":"Mẫu","canh":[]}');
  const item = save(root, { name: "robot.glb", base64: fixtureGlb().toString("base64") });
  const duyet = approve(root, item.id);
  assert.equal(duyet.sha256, item.sha256);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "phim.json"), "utf8")).mo_hinh_duyet.id, item.id);
  assert.throws(() => save(root, { name: "ngoai.glb", base64: fixtureGlb({ images: [{ uri: "ảnh.png" }] }).toString("base64") }), { code: "BAD_REQUEST" });
});

test("CapCut nhận clip Remotion đã dựng, giọng, SRT và bảng thời lượng", async (t) => {
  const root = project(t);
  fs.mkdirSync(path.join(root, "media", "quay"), { recursive: true });
  fs.mkdirSync(path.join(root, "media", "giong"));
  fs.writeFileSync(path.join(root, "media", "quay", "remotion.mp4"), "clip");
  fs.writeFileSync(path.join(root, "media", "giong", "voice.mp3"), "voice");
  fs.writeFileSync(path.join(root, "media", "giong", "voice.json"), '[{"startMs":250,"endMs":4500,"text":"Lời thoại"}]');
  const phim = { canh: [{ ma: "C01", may_quay: "dung-code", giay: 4.5, take: ["media/quay/remotion.mp4"] }] };
  const ffmpeg = async (command, args) => {
    assert.equal(command, "ffmpeg");
    assert.equal(args[args.indexOf("-frames:v") + 1], "135");
    assert.equal(args[args.indexOf("-t") + 1], "4.500000");
    fs.writeFileSync(args.at(-1), "clip cắt");
  };
  const goi = await goiCapCut(root, phim, "ffmpeg", ffmpeg);
  assert.equal(goi.clips, 1);
  assert.deepEqual(goi.giong, ["voice.mp3", "voice.srt"]);
  assert.equal(fs.readFileSync(path.join(goi.folder, "C01.mp4"), "utf8"), "clip cắt");
  assert.match(fs.readFileSync(path.join(goi.folder, "voice.srt"), "utf8"), /00:00:00,250 --> 00:00:04,500\nLời thoại/);
  assert.match(fs.readFileSync(path.join(goi.folder, "thu-tu-canh.csv"), "utf8"), /C01.mp4,0\.000000,4\.500000/);
  const khac = await goiCapCut(root, phim, "ffmpeg", ffmpeg);
  assert.notEqual(khac.folder, goi.folder);
});
