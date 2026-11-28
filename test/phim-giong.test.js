// Giọng theo nhân vật của Xưởng phim (CEO 28/11/2026): mô tả giọng từng nhân vật, người nói từng cảnh, Edge miễn phí
// hoặc ElevenLabs thiết kế giọng từ mô tả. ElevenLabs ở đây là API giả (fetchImpl), không gọi mạng.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { kiem, goiYGiongEdge, giongCua, giongTheoCanh } = require("../lib/phim");
const { createPhimGiong, doanMau } = require("../ctl/phim-giong");

const PHIM = () => ({
  ten: "Hẹn ở quán", ti_le: ["9:16"], ngon_ngu: "vi", ngan_sach_usd: 0,
  nhan_vat: [{ ma: "lan", ten: "Lan", tham_chieu: [], giong: { mo_ta: "nữ khoảng 20 tuổi, giọng trong trẻo" } },
    { ma: "minh", ten: "Minh", tham_chieu: [], giong: { mo_ta: "nam khoảng 30 tuổi, giọng trầm" } }],
  canh: [{ ma: "C01", cau: [1], loi_dan: "Một chiều thu, hai người gặp nhau ở quán cà phê.", khung_hinh: "quán", nhan_vat: [] },
    { ma: "C02", cau: [2], nguoi_noi: "lan", loi_dan: "Anh đến muộn quá, em đợi nãy giờ rồi.", khung_hinh: "Lan", nhan_vat: ["lan"] },
    { ma: "C03", cau: [3], nguoi_noi: "minh", loi_dan: "Xin lỗi em, đường hôm nay tắc lắm.", khung_hinh: "Minh", nhan_vat: ["minh"] }],
});

test("gợi ý giọng Edge theo mô tả: giới, tuổi, chất giọng (chữ có dấu, không khớp nhầm giữa từ)", () => {
  assert.deepStrictEqual(goiYGiongEdge("nữ khoảng 20 tuổi, giọng trong trẻo"), { may: "edge", ma: "vi-nu", toc_do: "+0%", cao_do: "+7Hz" });
  assert.deepStrictEqual(goiYGiongEdge("nam khoảng 30 tuổi, giọng trầm"), { may: "edge", ma: "vi-nam", toc_do: "+0%", cao_do: "-8Hz" });
  assert.strictEqual(goiYGiongEdge("bé gái 8 tuổi hoạt bát").ma, "vi-nu");
  assert.strictEqual(goiYGiongEdge("ông lão 70 tuổi, nói chậm").toc_do, "-16%");
  assert.strictEqual(goiYGiongEdge("female, 25 years, bright", "en").ma, "en-us-friendly");
  assert.strictEqual(goiYGiongEdge("cảnh trong phim").cao_do, "+0Hz", "\"trong\" giữa câu không phải \"giọng trong trẻo\"");
  for (const m of ["", "giọng cực trầm cực trầm trầm", "12 tuổi bé con trong trẻo nhanh nhanh"]) {
    const g = goiYGiongEdge(m);
    assert.match(g.cao_do, /^[+-]\d{1,2}Hz$/); assert.match(g.toc_do, /^[+-]\d{1,2}%$/);
  }
});

test("hồ sơ phim: người nói phải là nhân vật đã khai, giọng đúng dạng, phim có người nói đọc theo cảnh", () => {
  const p = PHIM();
  const k = kiem(p);
  assert.ok(k.ok, JSON.stringify(k.loi));
  assert.ok(giongTheoCanh(p), "có nguoi_noi thì đọc theo cảnh");
  assert.ok(k.canhBao.some((w) => w.ma === "CHUA_CHON_GIONG"), "nhân vật chưa chọn giọng: cảnh báo, máy tạm dùng Edge");

  const sai = PHIM();
  sai.canh[1].nguoi_noi = "khong-co";
  sai.nhan_vat[1].giong = { mo_ta: "x", may: "azure", ma: "abc" };
  sai.canh[2].cau = [3, 4];
  sai.nguoi_dan = { giong: { may: "edge" } };
  const loi = kiem(sai).loi.map((l) => l.chiTiet).join("\n");
  assert.match(loi, /nguoi_noi "khong-co" chưa khai/);
  assert.match(loi, /giong\.may phải là edge hoặc elevenlabs/);
  assert.match(loi, /cần cau = \[3\]/);
  assert.match(loi, /nguoi_dan: giong\.may và giong\.ma đi cùng nhau/);

  const cu = { ...PHIM(), canh: PHIM().canh.map(({ nguoi_noi, ...c }) => c) };
  cu.canh[1].cau = [2, 3]; cu.canh.pop();
  assert.ok(!giongTheoCanh(cu), "phim cũ không có người nói: giữ cách đọc cũ (cả phim một giọng)");
  assert.ok(kiem(cu).ok);
});

test("giọng của cảnh: nhân vật đã chọn > gợi ý Edge từ mô tả; người dẫn > mặc định theo ngôn ngữ", () => {
  const p = PHIM();
  assert.deepStrictEqual(giongCua(p, p.canh[0]), { may: "edge", ma: "vi-nam", toc_do: "+0%", cao_do: "+0Hz" });
  assert.strictEqual(giongCua(p, p.canh[1]).ma, "vi-nu");
  p.nhan_vat[1].giong = { mo_ta: "nam trầm", may: "elevenlabs", ma: "voiceMinh123" };
  assert.deepStrictEqual(giongCua(p, p.canh[2]), { may: "elevenlabs", ma: "voiceMinh123" });
  p.nguoi_dan = { giong: { mo_ta: "nữ trung niên, giọng ấm" } };
  assert.strictEqual(giongCua(p, p.canh[0]).ma, "vi-nu");
  assert.strictEqual(giongCua({ ...p, ngon_ngu: "en", nguoi_dan: undefined }, p.canh[0]).ma, "en-us-authority");
});

function taoPhim(t, { khoa = "sk_" + "a".repeat(40) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-giong-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "phim"); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "phim.json"), JSON.stringify(PHIM(), null, 2));
  if (khoa) fs.writeFileSync(path.join(dir, "keys.json"), JSON.stringify({ elevenlabs: khoa }));
  const doc = () => JSON.parse(fs.readFileSync(path.join(root, "phim.json"), "utf8"));
  return { dir, root, doc };
}

test("ctl: liệt kê người nói, chọn Edge gợi ý, tự chọn cho người chưa có giọng (giữ mô tả của Hinata)", (t) => {
  const { dir, root, doc } = taoPhim(t, { khoa: null });
  const g = createPhimGiong({ dir, fetchImpl: () => assert.fail("không gọi mạng") });
  const ds = g.list(root);
  assert.strictEqual(ds.coKhoaEleven, false);
  assert.deepStrictEqual(ds.nguoi.map((n) => [n.ma, n.soCanh, n.daChon]), [["nguoi-dan", 1, false], ["lan", 1, false], ["minh", 1, false]]);
  g.chonEdge(root, { ma: "lan" });
  assert.deepStrictEqual(doc().nhan_vat[0].giong, { mo_ta: "nữ khoảng 20 tuổi, giọng trong trẻo", may: "edge", ma: "vi-nu", toc_do: "+0%", cao_do: "+7Hz" });
  assert.throws(() => g.chonEdge(root, { ma: "lan", cao_do: "+999Hz" }), /Cao độ/);
  assert.throws(() => g.chonEdge(root, { ma: "khong-co" }), /Không có nhân vật/);
  assert.deepStrictEqual(g.tuDong(root).daChon, ["nguoi-dan", "minh"]);
  assert.strictEqual(doc().nhan_vat[1].giong.cao_do, "-8Hz");
  assert.strictEqual(doc().nhan_vat[0].giong.ma, "vi-nu", "không đụng giọng đã chọn");
  assert.ok(kiem(doc()).ok, JSON.stringify(kiem(doc()).loi));
});

test("ctl: ElevenLabs thiết kế 3 bản mẫu từ mô tả, CEO chọn một bản → lưu giọng, ghi mã giọng; khóa chỉ đi qua header", async (t) => {
  const { dir, root, doc } = taoPhim(t);
  const goi = [];
  const fetchImpl = async (url, opt) => {
    goi.push({ url, opt, body: opt.body ? JSON.parse(opt.body) : null });
    if (url.endsWith("/v1/text-to-voice/design")) return { ok: true, status: 200, json: async () => ({ text: "x",
      previews: [1, 2, 3, 4].map((i) => ({ audio_base_64: Buffer.from("mp3-" + i).toString("base64"), generated_voice_id: "gen" + i, media_type: "audio/mpeg", duration_secs: 3.2 })) }) };
    if (url.endsWith("/v1/text-to-voice")) return { ok: true, status: 200, json: async () => ({ voice_id: "voiceLan42" }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const g = createPhimGiong({ dir, fetchImpl });
  const tk = await g.thietKe(root, { ma: "lan" });
  assert.strictEqual(tk.mau.length, 3, "tối đa 3 bản mẫu");
  for (const m of tk.mau) assert.ok(fs.existsSync(path.join(root, m.duongDan)), m.duongDan);
  const d = goi[0];
  assert.strictEqual(d.opt.headers["xi-api-key"], "sk_" + "a".repeat(40));
  assert.strictEqual(d.body.model_id, "eleven_ttv_v3", "model thiết kế có tiếng Việt");
  assert.strictEqual(d.body.voice_description, "nữ khoảng 20 tuổi, giọng trong trẻo");
  assert.ok(d.body.text.length >= 100 && d.body.text.length <= 1000 && d.body.text.includes("Anh đến muộn quá"), "đoạn mẫu là lời của nhân vật, 100–1000 ký tự");
  assert.ok(!JSON.stringify(goi.map((x) => [x.url, x.body])).includes("aaaaaaaaaa"), "khóa không nằm trong URL hay thân yêu cầu");

  await assert.rejects(g.chonMau(root, { ma: "lan", generatedVoiceId: "gen4" }), /Bản mẫu không còn/, "bản thứ 4 không được trả về nên không chọn được");
  await assert.rejects(g.chonMau(root, { ma: "minh", generatedVoiceId: "gen1" }), /Bản mẫu không còn/, "bản mẫu thuộc nhân vật khác");
  const kq = await g.chonMau(root, { ma: "lan", generatedVoiceId: "gen2" });
  assert.strictEqual(kq.ma_giong, "voiceLan42");
  assert.strictEqual(goi[1].body.generated_voice_id, "gen2");
  assert.deepStrictEqual(doc().nhan_vat[0].giong, { mo_ta: "nữ khoảng 20 tuổi, giọng trong trẻo", may: "elevenlabs", ma: "voiceLan42" });
  assert.deepStrictEqual(giongCua(doc(), doc().canh[1]), { may: "elevenlabs", ma: "voiceLan42" });
  await assert.rejects(g.chonMau(root, { ma: "lan", generatedVoiceId: "gen2" }), /Bản mẫu không còn/, "mỗi lần thiết kế chỉ chọn một lần");
});

test("ctl: lỗi ElevenLabs rõ ràng — chưa có khóa, khóa sai, hết hạn mức, mô tả quá ngắn", async (t) => {
  const khong = taoPhim(t, { khoa: null });
  await assert.rejects(createPhimGiong({ dir: khong.dir }).thietKe(khong.root, { ma: "lan" }), (e) => e.code === "CHUA_CO_KHOA");
  // Khóa sai thật của ElevenLabs là HTTP 400 + detail.code "invalid_api_key" (đã kiểm với API thật 28/11/2026).
  for (const [status, detail, code] of [[401, {}, "KHOA_SAI"], [400, { type: "authentication_error", code: "invalid_api_key", message: "API key is invalid." }, "KHOA_SAI"],
    [429, {}, "HET_HAN_MUC"], [401, { status: "quota_exceeded" }, "KHOA_SAI"], [400, { status: "quota_exceeded" }, "HET_HAN_MUC"], [500, { message: "boom token: bimat99" }, "ELEVENLABS_LOI"]]) {
    const f = taoPhim(t);
    const g = createPhimGiong({ dir: f.dir, fetchImpl: async () => ({ ok: false, status, json: async () => ({ detail }) }) });
    await assert.rejects(g.thietKe(f.root, { ma: "lan" }), (e) => e.code === code && !e.message.includes("bimat99"), status + " " + JSON.stringify(detail));
  }
  const f = taoPhim(t);
  const p = f.doc(); p.nhan_vat[0].giong.mo_ta = "nữ"; fs.writeFileSync(path.join(f.root, "phim.json"), JSON.stringify(p));
  await assert.rejects(createPhimGiong({ dir: f.dir, fetchImpl: () => assert.fail() }).thietKe(f.root, { ma: "lan" }), /ít nhất 10 ký tự/);
});

test("đoạn mẫu thiết kế giọng: lời của đúng người nói, đủ 100 ký tự, không quá 1000", () => {
  const p = PHIM();
  const a = doanMau(p, "minh");
  assert.ok(a.startsWith("Xin lỗi em") && a.length >= 100 && a.length <= 1000);
  assert.ok(doanMau(p, "nguoi-dan").startsWith("Một chiều thu"));
  const dai = { ...p, canh: Array.from({ length: 30 }, (_, i) => ({ ...p.canh[1], ma: "C" + String(i + 1).padStart(2, "0"), cau: [i + 1] })) };
  assert.ok(doanMau(dai, "lan").length <= 1000);
});

test("tts_sync.py: cảnh mang giọng riêng (Edge/ElevenLabs) và khóa ElevenLabs chỉ đọc từ biến môi trường", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "tools", "xuong-phim", "tts_sync.py"), "utf8");
  assert.match(src, /os\.environ\.get\("XUONG_PHIM_ELEVENLABS_KEY", ""\)/, "khóa chỉ từ biến môi trường");
  assert.doesNotMatch(src, /add_argument\("--(api-)?key/, "không nhận khóa qua dòng lệnh");
  assert.match(src, /"xi-api-key": khoa/);
  assert.match(src, /ELEVENLABS_MODEL = "eleven_flash_v2_5"/, "model đọc có tiếng Việt");
  assert.match(src, /def canh_hop_le\(c\)/);
});
