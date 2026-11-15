"use strict";
// Tạo dự án mới (CEO duyệt 16/11/2026): gợi ý tên repo, chỉ tạo khi CEO duyệt, quy trình khởi động từng bước;
// văn phòng 3D trên điện thoại đi qua danh sách lệnh của điện thoại đã ghép. Không gọi GitHub/Claude thật.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDuAnMoi, slug, chuanTen, goiYQuyTac } = require("../ctl/du-an-moi");
const { allowed } = require("../lib/dieu-khien-xa");

const Y = "Ứng dụng học tiếng Anh cho trẻ em, có bài nghe theo chủ đề và chấm điểm phát âm";
function gia({ ai = async () => [{ ten: "kid-english", moTa: "Học tiếng Anh cho trẻ" }, { ten: "Bé Nói Hay!", moTa: "Luyện nói" }, { ten: "x", moTa: "quá ngắn" }],
  coSan = ["oanh/kid-english"], loi = {} } = {}) {
  const goi = [], log = [];
  const github = {
    login: async () => "oanh",
    exists: async (f) => coSan.includes(f),
    createRepo: async ({ name, description, isPrivate }) => { goi.push(["createRepo", name, description, isPrivate]); if (loi.repo) throw Object.assign(new Error(loi.repo), { code: "CHANGED" }); return { fullName: "oanh/" + name, private: isPrivate, url: "https://github.com/oanh/" + name }; },
    open: (fullName) => { goi.push(["open", fullName]); return { id: "op1", status: "running" }; },
    get: () => ({ id: "op1", status: "done", workspace: "D:/Projects/oanh/kid-english", agentMdCreated: true }),
  };
  const ideas = {
    add: ({ workspace, title, detail }) => { goi.push(["idea.add", workspace, title, detail.length]); return { id: "idea-1" }; },
    start: (id, o) => { goi.push(["idea.start", id, o.force]); return { id, runId: "auto-1" }; },
  };
  const boKiem = { install: (root) => { goi.push(["boKiem", root]); if (loi.boKiem) throw new Error(loi.boKiem); return { last: { compareUrl: "https://github.com/oanh/x/compare/main...vp/bo-kiem" } }; } };
  const dam = createDuAnMoi({ github, ideas, boKiem, audit: { log: (...a) => log.push(a) }, goiYAi: ai, cho: async () => {} });
  return { dam, goi, log };
}
const xong = async (dam, id) => { for (let i = 0; i < 50; i++) { const o = dam.get(id); if (o.trangThai !== "dang") return o; await new Promise((r) => setImmediate(r)); } return dam.get(id); };

test("tên repo: bỏ dấu, bỏ từ đệm, chỉ chữ thường/số/gạch ngang 3–40 ký tự", () => {
  assert.equal(slug(Y), "ung-dung-hoc-tieng");
  assert.equal(chuanTen("Bé Nói Hay!"), "be-noi-hay");
  assert.equal(chuanTen("x"), null);
  assert.equal(chuanTen("../../etc"), "etc");
  assert.ok(goiYQuyTac(Y).every((g) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(g.ten)));
});

test("gợi ý: AI đề xuất (đã chuẩn hoá, bỏ tên hỏng), đủ 3 tên, báo tên nào đã có trên GitHub; không tạo gì", async () => {
  const { dam, goi } = gia();
  const r = await dam.goiY(Y);
  assert.equal(r.login, "oanh"); assert.equal(r.nguon, "ai");
  assert.deepEqual(r.goiY.map((g) => [g.ten, g.conTrong]).slice(0, 2), [["kid-english", false], ["be-noi-hay", true]]);
  assert.equal(r.goiY.length, 3);
  assert.deepEqual(goi, [], "gợi ý không gọi tạo repo");
  await assert.rejects(dam.goiY("ngắn"), { code: "BAD_REQUEST" });
});

test("gợi ý khi Claude lỗi: đặt tên theo quy tắc từ chữ của ý tưởng, ghi lý do", async () => {
  const { dam } = gia({ ai: async () => { throw new Error("Claude gợi ý tên quá 60 giây"); } });
  const r = await dam.goiY(Y);
  assert.equal(r.nguon, "quy-tac"); assert.match(r.ghiChu, /60 giây/);
  assert.equal(r.goiY[0].ten, "ung-dung-hoc-tieng");
});

test("duyệt: tạo repo riêng tư → tải về → lưu ý tưởng → cài bộ kiểm → giao Hinata (ghi đè lượt vì CEO đã duyệt)", async () => {
  const { dam, goi, log } = gia();
  const op = dam.tao({ ten: "be-noi-hay", moTa: "Luyện nói", yTuong: Y });
  assert.equal(op.trangThai, "dang");
  const r = await xong(dam, op.id);
  assert.equal(r.trangThai, "xong", JSON.stringify(r.buoc));
  assert.deepEqual(goi.map((g) => g[0]), ["createRepo", "open", "idea.add", "boKiem", "idea.start"]);
  assert.deepEqual(goi[0], ["createRepo", "be-noi-hay", "Luyện nói", true], "mặc định riêng tư");
  assert.deepEqual(goi[4], ["idea.start", "idea-1", true]);
  assert.match(r.buoc.find((b) => b.id === "bo-kiem").ghiChu, /compare/);
  assert.ok(log.some((a) => a[1] === "du_an_moi.duyet" && a[4] === "approved"));
  assert.throws(() => dam.tao({ ten: "Bé Nói", yTuong: Y }), { code: "BAD_REQUEST" }, "tên phải đúng dạng đã chuẩn hoá");
});

test("bước lỗi: tạo repo lỗi thì dừng ngay; bộ kiểm lỗi thì vẫn giao Hinata và báo xong một phần; bỏ chọn thì bỏ qua", async () => {
  let g = gia({ loi: { repo: "tên đã có" } });
  let r = await xong(g.dam, g.dam.tao({ ten: "kid-english", yTuong: Y }).id);
  assert.equal(r.trangThai, "loi");
  assert.deepEqual(r.buoc.map((b) => b.trangThai), ["loi", "cho", "cho", "cho", "cho"]);
  assert.deepEqual(g.goi.map((x) => x[0]), ["createRepo"]);
  g = gia({ loi: { boKiem: "Repo chưa có commit" } });
  r = await xong(g.dam, g.dam.tao({ ten: "be-noi-hay", yTuong: Y }).id);
  assert.equal(r.trangThai, "xong-mot-phan");
  assert.deepEqual(r.buoc.map((b) => b.trangThai), ["xong", "xong", "xong", "loi", "xong"]);
  g = gia();
  r = await xong(g.dam, g.dam.tao({ ten: "be-noi-hay", yTuong: Y, caiBoKiem: false, giaoHinata: false }).id);
  assert.deepEqual(r.buoc.map((b) => b.trangThai), ["xong", "xong", "xong", "bo-qua", "bo-qua"]);
  assert.ok(!g.goi.some((x) => x[0] === "boKiem" || x[0] === "idea.start"));
});

test("điện thoại đã ghép: văn phòng 3D dùng được mục xem, ý tưởng, tạo dự án; vẫn chặn cấu hình, đổi tài khoản, xuất bản", () => {
  for (const [m, p] of [["GET", "/ideas?workspace=x"], ["POST", "/ideas"], ["POST", "/ideas/idea-abc/start"], ["GET", "/scan"], ["GET", "/publish"], ["GET", "/nhat-ky"],
    ["POST", "/workspaces/switch"], ["GET", "/dieu-phoi/models"], ["GET", "/agy-tai-khoan"], ["POST", "/du-an-moi/goi-y"], ["POST", "/du-an-moi"], ["GET", "/du-an-moi/da-1"]]) assert.ok(allowed(m, p), m + " " + p);
  for (const [m, p] of [["POST", "/dieu-phoi"], ["POST", "/agy-tai-khoan/cat"], ["POST", "/agy-tai-khoan/x/chuyen"], ["POST", "/publish/prepare"], ["POST", "/scan/approve"],
    ["POST", "/bo-kiem"], ["POST", "/github/open"], ["POST", "/cap-nhat"], ["POST", "/workspaces"]]) assert.ok(!allowed(m, p), m + " " + p);
});

// Sau rà soát độc lập 16/11/2026:
test("gợi ý tên chỉ một lượt Claude tại một thời điểm: cùng ý tưởng dùng chung, ý tưởng khác báo bận", async () => {
  let goiAi = 0, xongAi;
  const { dam } = gia({ ai: () => { goiAi++; return new Promise((r) => { xongAi = () => r([{ ten: "abc-xyz", moTa: "" }]); }); } });
  const a = dam.goiY(Y), b = dam.goiY(Y);
  assert.throws(() => dam.goiY("Một ý tưởng hoàn toàn khác cho dự án khác"), { code: "AI_BUSY" });
  await new Promise((r) => setImmediate(r)); xongAi();
  assert.equal((await a).goiY[0].ten, "abc-xyz"); assert.equal(await b, await a);
  assert.equal(goiAi, 1);
});

test("repo đã tạo ở lần duyệt trước (bước sau lỗi): duyệt lại cùng tên thì làm tiếp từ bước tải về, không tạo lại", async () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-dam-"));
  try {
    const g = gia();
    let lanOpen = 0;
    g.goi.length = 0;
    const github = { login: async () => "oanh", exists: async () => true,
      createRepo: async ({ name }) => { g.goi.push(["createRepo", name]); return { fullName: "oanh/" + name, url: "u" }; },
      open: () => { lanOpen++; if (lanOpen === 1) throw Object.assign(new Error("Đang mở một repo"), { code: "AI_BUSY" }); return { id: "o", status: "running" }; },
      get: () => ({ id: "o", status: lanOpen < 3 ? "failed" : "done", code: "GITHUB_CLONE", message: "mạng rớt", workspace: "D:/P/oanh/abc-xyz" }) };
    const ideas = { add: () => ({ id: "i1" }), start: () => ({ runId: "r1" }) }, boKiem = { install: () => ({}) };
    let dam = createDuAnMoi({ github, ideas, boKiem, dir, goiYAi: async () => [], cho: async () => {} });
    let r = await xong(dam, dam.tao({ ten: "abc-xyz", yTuong: Y }).id);
    assert.equal(r.buoc[0].trangThai, "xong"); assert.equal(r.buoc[1].trangThai, "loi", "lần 1: đang mở repo khác → chờ, rồi tải lỗi");
    dam = createDuAnMoi({ github, ideas, boKiem, dir, goiYAi: async () => [], cho: async () => {} });   // như ctl khởi động lại
    r = await xong(dam, dam.tao({ ten: "abc-xyz", yTuong: Y }).id);
    assert.equal(r.trangThai, "xong", JSON.stringify(r.buoc));
    assert.match(r.buoc[0].ghiChu, /đã tạo ở lần trước/);
    assert.equal(g.goi.filter((x) => x[0] === "createRepo").length, 1, "chỉ tạo repo một lần");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("điện thoại: tạo dự án luôn riêng tư (ép rieng=true), gợi ý tên được chờ 95 giây, xoá chat được", async () => {
  const { handle } = require("../lib/dieu-khien-xa");
  assert.ok(allowed("POST", "/chat/clear"));
  const goi = [];
  const dkx = { thietBiCua: () => ({ id: "tb1", ten: "iPhone" }), xacThuc: () => ({ id: "tb1", ten: "iPhone" }), ghiNhatKy: () => {} };
  const res = () => { const o = { code: 0, body: "" }; o.writeHead = (c) => { o.code = c; }; o.end = (b) => { o.body = b; }; return o; };
  for (const [p, body] of [["/dkx/api/du-an-moi", { ten: "abc-xyz", yTuong: Y, rieng: false }], ["/dkx/api/du-an-moi/goi-y", { yTuong: Y }]]) {
    const req = { method: "POST", headers: { cookie: "vpd=x", host: "oanh.ts.net" }, socket: { remoteAddress: "127.0.0.1" } };
    await handle(dkx, req, res(), new URL("https://oanh.ts.net" + p), { local: false, hasKey: true, readJson: async () => body,
      call: async (m, target, b, het) => { goi.push({ target, b, het }); return { status: 202, json: { ok: true } }; } });
  }
  assert.equal(goi[0].b.rieng, true, "tham số ẩn rieng:false bị ép thành riêng tư");
  assert.equal(goi[1].het, 95000);
});
