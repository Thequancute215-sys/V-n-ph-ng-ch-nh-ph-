"use strict";
// Bộ kiểm hợp đồng giao tiếp (CEO duyệt 16/11/2026): hợp đồng máy đọc được, bắt lệch giữa hợp đồng và mã hai bên.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { kiemCauTruc, kiemRepo, kiemMau, regexBackend, main } = require("../lib/kiem-hop-dong");

const HOP_DONG = () => ({
  openapi: "3.0.3",
  info: { title: "Speak Coach", version: "1.0.0" },
  "x-thu-muc": { backend: ["server", "api"], frontend: ["client", "Assets/Scripts"] },
  "x-tien-to-api": "/api",
  paths: {
    "/api/bai-noi": { get: { operationId: "listBaiNoi", responses: { 200: { description: "ok", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/BaiNoi" } } } } } } } },
    "/api/bai-noi/{id}/cham": {
      post: {
        operationId: "chamBaiNoi", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/YeuCauCham" } } } },
        responses: { 200: { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/KetQuaCham" }, example: { diem: 82, goiY: ["Nói chậm hơn"] } } } } },
      },
    },
    "/api/bang-xep-hang": { "x-phase": 3, get: { operationId: "bangXepHang", responses: { 200: { description: "ok" } } } },
  },
  "x-su-kien": { "cham.xong": { huong: "server->client", schema: { $ref: "#/components/schemas/KetQuaCham" } } },
  components: { schemas: {
    BaiNoi: { type: "object", required: ["id", "chuDe"], properties: { id: { type: "integer" }, chuDe: { type: "string" } }, additionalProperties: false },
    YeuCauCham: { type: "object", required: ["amThanh"], properties: { amThanh: { type: "string", minLength: 1 } } },
    KetQuaCham: { type: "object", required: ["diem"], properties: { diem: { type: "integer", minimum: 0, maximum: 100 }, goiY: { type: "array", items: { type: "string" } } } },
  } },
});
function repo(t, files, hopDong = HOP_DONG(), phase = 2) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-hopdong-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ghi = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };
  if (hopDong) ghi("contract/api.json", JSON.stringify(hopDong, null, 2));
  ghi("agent.md", `# A\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase ${phase} - Thử\n`);
  for (const [p, s] of Object.entries(files)) ghi(p, s);
  return root;
}
const BE_DUNG = { "server/routes.js": "app.get('/api/bai-noi', list);\napp.post('/api/bai-noi/:id/cham', cham);\nio.emit(\"cham.xong\", kq);" };
const FE_DUNG = { "client/api.ts": "export const list = () => fetch('/api/bai-noi');\nexport const cham = (id) => fetch(`/api/bai-noi/${id}/cham`, { method: 'POST' });\nsocket.on('cham.xong', hien);" };

test("hợp đồng đúng và mã hai bên khớp: đạt; đường dẫn của Phase sau (x-phase 3) chưa bắt buộc", (t) => {
  const r = kiemRepo(repo(t, { ...BE_DUNG, ...FE_DUNG }));
  assert.deepEqual(r.loi, []);
  assert.equal(r.coHopDong, true);
});

test("cấu trúc: thiếu openapi/version, $ref sai, required không có trong properties, example sai kiểu, tham số đường dẫn chưa khai", () => {
  const d = HOP_DONG();
  delete d.openapi; delete d.info.version;
  d.paths["/api/bai-noi"].get.responses[200].content["application/json"].schema.items.$ref = "#/components/schemas/KhongCo";
  d.components.schemas.BaiNoi.required.push("tenSai");
  d.paths["/api/bai-noi/{id}/cham"].post.responses[200].content["application/json"].example = { diem: "tám mươi" };
  d.paths["/api/bai-noi/{id}/cham"].post.parameters = [];
  d.paths["/api/x"] = { get: { operationId: "listBaiNoi", responses: {} } };
  d["x-su-kien"]["sai"] = { huong: "ngang", schema: { $ref: "other.json#/X" } };
  const loi = kiemCauTruc(d).loi.join("\n");
  for (const m of [/openapi/, /info.version/, /không tìm thấy #\/components\/schemas\/KhongCo/, /required "tenSai"/, /example không khớp kiểu .*diem: phải là integer/, /\{id\} chưa khai/, /operationId "listBaiNoi" bị trùng/, /GET \/api\/x: thiếu responses/, /huong phải là/, /\$ref chỉ được trỏ trong chính file/]) {
    assert.match(loi, m);
  }
});

test("lệch mã: backend thiếu đường dẫn, frontend gọi đường dẫn ngoài hợp đồng, thiếu sự kiện ở một bên", (t) => {
  const r = kiemRepo(repo(t, {
    "server/routes.js": "app.get('/api/bai-noi', list);",
    "client/api.ts": "fetch('/api/bai-noi'); fetch(`/api/diem-cao/${id}`); fetch('/api/bai-noi?trang=2');",
    "Assets/Scripts/Api.cs": "var url = \"/api/bai-noi/\" + id + \"/cham\"; Socket.On(\"cham.xong\", Hien);",
  }));
  const loi = r.loi.join("\n");
  assert.match(loi, /Backend chưa có đường dẫn \/api\/bai-noi\/\{id\}\/cham/);
  assert.match(loi, /Frontend gọi \/api\/diem-cao\/x \(client\/api.ts\)/);
  assert.match(loi, /Backend chưa có sự kiện "cham.xong"/);
  assert.doesNotMatch(loi, /bai-noi\?trang/, "query không tính là đường dẫn khác");
  assert.doesNotMatch(loi, /Frontend chưa có sự kiện/, "C# Unity đã có sự kiện");
  assert.doesNotMatch(loi, /bang-xep-hang/, "Phase 3 chưa tới");
});

test("tham số đường dẫn theo nhiều framework: :id, {id}, <int:id>, [id]", () => {
  const re = regexBackend("/api/bai-noi/{id}/cham");
  for (const s of ["'/api/bai-noi/:id/cham'", "\"/api/bai-noi/{id}/cham\"", "'/api/bai-noi/<int:id>/cham'", "'/api/bai-noi/[id]/cham'", "\"api/bai-noi/<id>/cham/\""]) assert.ok(re.test(s), s);
  assert.ok(!re.test("'/api/bai-noi/:id/cham-lai'"));
  assert.ok(!regexBackend("/api/users").test("app.get('/api/users/:id')"), "không khớp theo tiền tố: có /api/users/:id chưa phải có /api/users");
});

test("rà soát 16/11/2026: route ghép tiền tố, Next.js theo tên file, ghép chuỗi ở frontend, servers.url, ${BASE}, readOnly, constructor, x-thu-muc lỗi, không có Phase, BOM", (t) => {
  // Express mount + Next.js file route: không báo thiếu
  let r = kiemRepo(repo(t, {
    "server/app.js": "const r = express.Router();\napp.use('/api', r);\nr.get('/bai-noi', list);\nio.emit('cham.xong', kq);",
    "server/app/api/bai-noi/[id]/cham/route.ts": "export async function POST(req) { return Response.json({ diem: 1 }); }",
    "Assets/Scripts/Net.cs": "var u1 = baseUrl + \"/api/bai-noi/\" + id + \"/cham\"; var u2 = \"/api/bai-noi\"; Socket.On(\"cham.xong\", Hien);",
  }));
  assert.deepEqual(r.loi, [], r.loi.join("\n"));
  // ${BASE} trước tiền tố vẫn bị bắt khi gọi đường dẫn ngoài hợp đồng
  r = kiemRepo(repo(t, { ...{ "server/routes.js": "app.get('/api/bai-noi', list);\napp.post('/api/bai-noi/:id/cham', cham);\nio.emit(\"cham.xong\", kq);" }, "client/a.ts": "fetch(`${BASE}/api/khong-co`); fetch('https://h.vn/api/khong-co2'); socket.on('cham.xong', f);" }));
  assert.match(r.loi.join("\n"), /Frontend gọi \/api\/khong-co /); assert.match(r.loi.join("\n"), /Frontend gọi \/api\/khong-co2/);
  // servers[0].url là tiền tố, paths không kèm tiền tố; đường dẫn có gạch cuối
  const d = HOP_DONG(); d.servers = [{ url: "https://may.vn/api" }]; delete d["x-tien-to-api"];
  d.paths = { "/bai-noi/": d.paths["/api/bai-noi"], "/bai-noi/{id}/cham": d.paths["/api/bai-noi/{id}/cham"] };
  r = kiemRepo(repo(t, { "server/routes.js": "app.get('/api/bai-noi/', list);\napp.post('/api/bai-noi/:id/cham', cham);\nio.emit('cham.xong', k);", "client/a.ts": "fetch('/api/bai-noi/'); fetch(`/api/bai-noi/${id}/cham`); s.on('cham.xong', f);" }, d));
  assert.deepEqual(r.loi, [], r.loi.join("\n"));
  // Ví dụ của yêu cầu không có trường readOnly bắt buộc (id do máy chủ sinh): không báo
  const d2 = HOP_DONG();
  d2.components.schemas.BaiMoi = { type: "object", required: ["id", "chuDe"], properties: { id: { type: "integer", readOnly: true }, chuDe: { type: "string" } } };
  d2.paths["/api/bai-noi"].post = { operationId: "taoBai", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/BaiMoi" }, example: { chuDe: "x" } } } }, responses: { 201: { description: "ok" } } };
  assert.deepEqual(kiemCauTruc(d2).loi, []);
  // Trường tên constructor/toString không lọt additionalProperties:false, required "toString" không bị coi là có
  assert.match(kiemMau(HOP_DONG(), "BaiNoi", { id: 1, chuDe: "x", constructor: 1 }).join(), /"constructor" không có trong hợp đồng/);
  // x-thu-muc có phần tử không phải chuỗi: báo lỗi cấu trúc, không sập
  const d3 = HOP_DONG(); d3["x-thu-muc"].backend = [null];
  assert.match(kiemRepo(repo(t, {}, d3)).loi.join(), /x-thu-muc.backend phải là mảng đường dẫn/);
  // Không có agent.md (repo công khai trên CI): bỏ qua mục có x-phase, cảnh báo
  const khongPhase = repo(t, { ...BE_DUNG, ...FE_DUNG });
  fs.rmSync(path.join(khongPhase, "agent.md"));
  const d4 = HOP_DONG(); d4.paths["/api/bang-xep-hang"]["x-phase"] = 9;
  fs.writeFileSync(path.join(khongPhase, "contract/api.json"), JSON.stringify(d4));
  r = kiemRepo(khongPhase);
  assert.deepEqual(r.loi, []); assert.match(r.canhBao.join(), /Không đọc được CURRENT_PHASE/);
  // --kiem-mau đọc được file có BOM
  const out = [];
  fs.writeFileSync(path.join(khongPhase, "bom.json"), "﻿" + JSON.stringify({ diem: 5 }));
  assert.equal(main(["--file", path.join(khongPhase, "contract/api.json"), "--kiem-mau", "KetQuaCham", path.join(khongPhase, "bom.json")], { log: (s) => out.push(s), error: (s) => out.push(s) }), 0, out.join("\n"));
});

test("kiểm mẫu thật: phản hồi lệch kiểu thì báo đúng chỗ", () => {
  const d = HOP_DONG();
  assert.deepEqual(kiemMau(d, "KetQuaCham", { diem: 90, goiY: [] }), []);
  const loi = kiemMau(d, "KetQuaCham", { diem: 90.5, goiY: [1] }).join("\n");
  assert.match(loi, /\$\.diem: phải là integer/); assert.match(loi, /\$\.goiY\[0\]: phải là string/);
  assert.match(kiemMau(d, "BaiNoi", { id: 1, chuDe: "x", thua: true }).join(), /trường "thua" không có trong hợp đồng/);
  assert.match(kiemMau(d, "cham.xong", {}).join(), /thiếu trường bắt buộc "diem"/, "kiểm được dữ liệu của sự kiện");
  assert.match(kiemMau(d, "KhongCo", {}).join(), /không có schema/);
});

test("dòng lệnh: --neu-co bỏ qua khi chưa có hợp đồng; có lỗi thì mã thoát 1; --kiem-mau đọc file", (t) => {
  const out = [], log = (s) => out.push(s);
  const trong = repo(t, {}, null);
  assert.equal(main([trong, "--neu-co"], { log, error: log }), 0);
  assert.equal(main([trong], { log, error: log }), 2);
  const sai = repo(t, { "server/routes.js": "" });
  assert.equal(main([sai], { log, error: log }), 1);
  const dung = repo(t, { ...BE_DUNG, ...FE_DUNG, "mau.json": JSON.stringify({ diem: 101 }) });
  assert.equal(main([dung], { log, error: log }), 0);
  assert.equal(main(["--file", path.join(dung, "contract/api.json"), "--kiem-mau", "KetQuaCham", path.join(dung, "mau.json")], { log, error: log }), 1);
  assert.ok(out.some((s) => /lớn hơn 100/.test(s)));
});

test("văn phòng kiểm hợp đồng ngay sau lượt Astra: lượt làm mất đường dẫn thì bàn giao có lỗi hop-dong; lỗi có sẵn từ trước không tính", async (t) => {
  const { createCtl } = require("../ctl/main");
  const { execFileSync } = require("node:child_process");
  // Trước lượt: đủ hai đường dẫn, nhưng thiếu sự kiện "cham.xong" (lỗi có sẵn, không bắt Astra chịu)
  const root = repo(t, { "server/routes.js": "app.get('/api/bai-noi', list);\napp.post('/api/bai-noi/:id/cham', cham);" });
  fs.writeFileSync(path.join(root, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 2 - Thử\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): CODEX_ASTRA_DEV\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n");
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t"); git("add", "-A"); git("commit", "-qm", "init");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-hopdong-home-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const fake = path.join(home, "dev.cjs");
  // Lượt Astra viết lại routes.js và làm mất đường dẫn chấm bài (lỗi mới của lượt)
  fs.writeFileSync(fake, `require('fs').writeFileSync('server/routes.js', "app.get('/api/bai-noi', list);\\n");console.log(JSON.stringify({result:'Xong.'+String.fromCharCode(10)+JSON.stringify({role:'CODEX_ASTRA_DEV',next_owner:'CLAUDE_AUDITOR',files:['server/routes.js'],claim_fixed:[],skill_da_dung:[],skill_ly_do:'thử',giai_thich:[{van_de:'Vấn đề thử nghiệm của lượt',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}]})}));`);
  fs.writeFileSync(path.join(home, "ctl-agents.json"), JSON.stringify({ CODEX_ASTRA_DEV: [process.execPath, fake, "{prompt}"] }));
  fs.writeFileSync(path.join(home, "quyen.json"), JSON.stringify({ toanQuyen: false }));
  const ctl = createCtl({ dir: home });
  try {
    ctl.ws.add(root);
    const job = ctl.runner.run({ workspace: root, role: "CODEX_ASTRA_DEV", task: "Làm API chấm bài" });
    for (let i = 0; i < 100 && ctl.jobs.get(job.id).status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    const h = ctl.runner.get(job.id);
    const loi = h.problems.join("\n");
    assert.match(loi, /hop-dong: Backend chưa có đường dẫn \/api\/bai-noi\/\{id\}\/cham/);
    assert.doesNotMatch(loi, /hop-dong: Frontend/, "phần frontend không tính cho Astra");
    assert.doesNotMatch(loi, /sự kiện "cham.xong"/, "lỗi có sẵn từ trước lượt không tính cho Astra");
  } finally { await ctl.close(); }
});

test("dự án chưa có hợp đồng: lượt Sol lập kế hoạch bị trả lại để tạo contract/api.json, trừ khi Vùng [3] ghi 'Không có API'", async (t) => {
  const { createCtl } = require("../ctl/main");
  const { execFileSync } = require("node:child_process");
  const chay = async (vung3, coHopDong) => {
    const root = repo(t, {}, coHopDong ? HOP_DONG() : null);
    fs.writeFileSync(path.join(root, "agent.md"), `# Agent\n## [1] HIẾN PHÁP\n- Tên: thử\n## [2] ĐẶC TẢ\n- F1\n## [3] KIẾN TRÚC\n${vung3}\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1 - Thử\n- LAST_UPDATED_BY: SPEC_ARCHITECT\n- NEXT_OWNER (MUTEX LOCK): SOL_ARCHITECT_PLANNER\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PENDING\n`);
    const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
    git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t"); git("add", "-A"); git("commit", "-qm", "init");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-hopdong-sol-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
    const fake = path.join(home, "sol.cjs");
    fs.writeFileSync(fake, `console.log(JSON.stringify({result:'Xong.'+String.fromCharCode(10)+JSON.stringify({role:'SOL_ARCHITECT_PLANNER',next_owner:'CLAUDE_AUDITOR',files:[],claim_fixed:[],giai_thich:[{van_de:'Vấn đề thử nghiệm của lượt',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}]})}));`);
    fs.writeFileSync(path.join(home, "ctl-agents.json"), JSON.stringify({ SOL_ARCHITECT_PLANNER: [process.execPath, fake, "{prompt}"] }));
    fs.writeFileSync(path.join(home, "quyen.json"), JSON.stringify({ toanQuyen: false }));
    const ctl = createCtl({ dir: home });
    try {
      ctl.ws.add(root);
      const job = ctl.runner.run({ workspace: root, role: "SOL_ARCHITECT_PLANNER", task: "Lập kế hoạch" });
      for (let i = 0; i < 100 && ctl.jobs.get(job.id).status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
      return ctl.runner.get(job.id).problems.join("\n");
    } finally { await ctl.close(); }
  };
  assert.match(await chay("- API Contract & Giao thức streaming: [Chưa cập nhật]", false), /hop-dong: chưa có contract\/api.json — Sol tạo hợp đồng/);
  assert.doesNotMatch(await chay("- API Contract: Không có API (công cụ dòng lệnh)", false), /hop-dong/);
  assert.doesNotMatch(await chay("- API Contract: contract/api.json", true), /hop-dong/);
});
