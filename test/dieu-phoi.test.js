"use strict";
// CEO duyệt 11/11/2026: tự chọn model + mức suy nghĩ theo độ khó của lượt (ctl/dieu-phoi.js) và đưa mục lục từ bản đồ
// hệ thống (.ua) vào prompt (ctl/muc-luc.js) để bớt token đọc file.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { classify, createDieuPhoi, remaining, kindOf } = require("../ctl/dieu-phoi");
const mucLuc = require("../ctl/muc-luc");
const { createCtl } = require("../ctl/main");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vp-dieuphoi-"));
const quota = (codex, claude, agy) => ({ providers: [
  { id: "codex", buckets: [{ remainingPercent: codex }] },
  { id: "claude", buckets: [{ remainingPercent: claude }] },
  { id: "antigravity", buckets: [{ group: "Gemini", remainingPercent: agy }, { group: "Claude / GPT trong Antigravity", remainingPercent: 1 }] },
] });

test("chấm độ khó: theo vai, chữ trong việc, blocker CRITICAL, lượt bị trả lại, hạn mức", () => {
  assert.equal(classify({ role: "CLAUDE_REPORTER" }).tier, "nhe");
  assert.equal(classify({ role: "SOL_ARCHITECT_PLANNER" }).tier, "nang");
  assert.equal(classify({ role: "CODEX_ASTRA_DEV", focus: "Viết trang đăng ký" }).tier, "vua");
  assert.equal(classify({ role: "CODEX_ASTRA_DEV", focus: "Vá lỗ hổng bảo mật ở API" }).tier, "nang");
  assert.equal(classify({ role: "CODEX_ASTRA_DEV", focus: "Sửa lỗi chính tả trên trang chủ" }).tier, "nhe");
  assert.equal(classify({ role: "CODEX_ASTRA_DEV", focus: "Sửa chính tả " + "x".repeat(400) }).tier, "vua", "việc dài không coi là việc nhỏ");
  assert.equal(classify({ role: "CLAUDE_AUDITOR", blockers: ["- [ ] OPEN P3-C01 [CRITICAL]: lộ khóa"] }).tier, "nang");
  assert.equal(classify({ role: "SPEC_ARCHITECT", blockers: ["- [ ] OPEN P3-C01"] }).tier, "vua", "blocker CRITICAL chỉ nâng Astra/Claude");
  const back = classify({ role: "CODEX_ASTRA_DEV", returned: true });
  assert.equal(back.tier, "nang"); assert.match(back.why.join(), /bị trả lại/);
  assert.equal(classify({ role: "CODEX_ASTRA_DEV", rework: 1 }).tier, "nang");
  // Hạn mức: ≤15% hạ một bậc, ≤5% về nhẹ nhất; Antigravity bỏ nhóm Claude/GPT (Hinata chỉ dùng Gemini)
  assert.equal(classify({ role: "SOL_ARCHITECT_PLANNER", kind: "codex", quota: quota(12, 90, 90) }).tier, "vua");
  assert.equal(classify({ role: "SOL_ARCHITECT_PLANNER", kind: "codex", quota: quota(4, 90, 90) }).tier, "nhe");
  assert.equal(remaining(quota(50, 50, 70), "agy"), 70);
  assert.equal(remaining({ providers: [{ id: "claude", buckets: [] }] }, "claude"), null, "chưa đọc được hạn mức thì không hạ");
});

test("bảng chọn + chèn cờ: Claude --model/--effort, Antigravity --model Gemini, Codex để codexArgs; giữ cờ tự cấu hình", (t) => {
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dp = createDieuPhoi({ dir });
  const CL = ["claude", "-p", "{prompt}", "--output-format", "json"];
  let d = dp.decide({ role: "CLAUDE_AUDITOR", argv: CL, focus: "Duyệt PR thêm nút" });
  assert.deepEqual([d.kind, d.tier, d.model, d.effort], ["claude", "vua", "sonnet", "high"]);
  assert.deepEqual(dp.apply(CL, d).slice(0, 5), ["claude", "--model", "sonnet", "--effort", "high"]);
  d = dp.decide({ role: "CLAUDE_AUDITOR", argv: CL, blockers: ["- [ ] OPEN P2-C01 [CRITICAL]"] });
  assert.deepEqual([d.model, d.effort], ["opus", "high"]);
  assert.deepEqual(dp.apply(["claude", "--model", "fable", "-p", "{prompt}"], d), ["claude", "--effort", "high", "--model", "fable", "-p", "{prompt}"], "lệnh đã có --model thì giữ");
  const AG = ["agy", "-p", "{prompt}"];
  d = dp.decide({ role: "SPEC_ARCHITECT", argv: AG, focus: "Đổi màu nút" });
  assert.deepEqual(dp.apply(AG, d), ["agy", "--model", "gemini-3.8-flash-low", "-p", "{prompt}"]);
  const CX = ["codex", "exec", "--json", "{prompt}"];
  d = dp.decide({ role: "CODEX_ASTRA_DEV", argv: CX });
  assert.equal(d.effort, "medium"); assert.deepEqual(dp.apply(CX, d), CX, "Codex: mức đi qua codexArgs");
  assert.equal(dp.decide({ role: "CODEX_ASTRA_DEV", argv: CX, explicitEffort: "max" }).effort, "max", "đội trưởng đặt rõ thì thắng");
  assert.equal(kindOf([process.execPath, "C:/x/claude.js"]), "claude");
  assert.equal(dp.decide({ role: "CLAUDE_AUDITOR", argv: ["python", "x.py"] }).kind, null);
});

test("CEO cố định model cho phòng, hoặc tắt điều phối tự động; giá trị sai bị chặn", (t) => {
  const dir = tmp(); const logs = []; t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dp = createDieuPhoi({ dir, audit: { log: (...a) => logs.push(a) } });
  const CL = ["claude", "-p", "{prompt}"];
  dp.save({ coDinh: { sakura: { model: "opus", effort: "max" } } });
  let d = dp.decide({ role: "CLAUDE_AUDITOR", argv: CL });
  assert.deepEqual([d.model, d.effort, d.fixed], ["opus", "max", true]);
  assert.equal(dp.decide({ role: "CODEX_ASTRA_DEV", argv: ["codex", "exec", "{prompt}"] }).fixed, undefined, "phòng khác vẫn tự động");
  dp.save({ coDinh: { sakura: null }, tuDong: false });
  d = dp.decide({ role: "CLAUDE_AUDITOR", argv: CL });
  assert.deepEqual([d.model, d.effort], [null, null]); assert.deepEqual(dp.apply(CL, d), CL);
  assert.equal(dp.status().tuDong, false); assert.deepEqual(dp.status().coDinh, {});
  assert.throws(() => dp.save({ coDinh: { sakura: { effort: "ultra" } } }), /Mức suy nghĩ/);
  assert.throws(() => dp.save({ coDinh: { sakura: { model: "opus; rm -rf /" } } }), /Tên model/);
  assert.throws(() => dp.save({ coDinh: { ai_do: { model: "opus" } } }), /Phòng không chạy/);
  assert.ok(logs.some((l) => l[1] === "dieu_phoi.save"));
});

// Repo thử có đồ thị .ua tối giản: một workflow "Đăng nhập" và vài hàm.
function graphRepo(t) {
  const root = tmp(); t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "t"); git("config", "user.email", "t@l");
  fs.mkdirSync(path.join(root, "src")); fs.mkdirSync(path.join(root, ".ua"));
  fs.writeFileSync(path.join(root, "src", "auth.js"), "function login() {}\nfunction logout() {}\n");
  fs.writeFileSync(path.join(root, "src", "mau.css"), "body{}\n");
  git("add", "-A"); git("commit", "-qm", "init");
  const head = git("rev-parse", "HEAD");
  const kg = { project: { gitCommitHash: head }, nodes: [
    { id: "file:src/auth.js", type: "file", name: "auth.js", filePath: "src/auth.js", summary: "Xử lý đăng nhập và phiên người dùng.", tags: ["dang-nhap", "phien"] },
    { id: "function:src/auth.js:login", type: "function", name: "login", filePath: "src/auth.js", lineRange: [1, 1], summary: "Kiểm mật khẩu và tạo phiên đăng nhập.", tags: ["dang-nhap"] },
    { id: "file:src/mau.css", type: "file", name: "mau.css", filePath: "src/mau.css", summary: "Bảng màu giao diện.", tags: ["giao-dien", "mau"] },
  ], edges: [] };
  const dg = { nodes: [
    { id: "flow:dang-nhap", type: "flow", name: "Đăng nhập", summary: "Người dùng đăng nhập bằng mật khẩu." },
    { id: "step:dang-nhap:kiem", type: "step", name: "Kiểm mật khẩu", summary: "", filePath: "src/auth.js", lineRange: [1, 1] },
    { id: "step:dang-nhap:phien", type: "step", name: "Tạo phiên", summary: "", filePath: "src/auth.js", lineRange: [1, 2] },
  ], edges: [{ source: "flow:dang-nhap", target: "step:dang-nhap:phien", type: "flow_step", weight: 0.2 }, { source: "flow:dang-nhap", target: "step:dang-nhap:kiem", type: "flow_step", weight: 0.1 }] };
  fs.writeFileSync(path.join(root, ".ua", "knowledge-graph.json"), JSON.stringify(kg));
  fs.writeFileSync(path.join(root, ".ua", "domain-graph.json"), JSON.stringify(dg));
  return { root, git };
}

test("mục lục: chọn đúng workflow và hàm kèm file:dòng; không có đồ thị hoặc không khớp thì rỗng; báo khi mã đổi sau khi vẽ", (t) => {
  const { root } = graphRepo(t);
  const s = mucLuc.note(root, "Sửa lỗi đăng nhập sai mật khẩu");
  assert.match(s, /MỤC LỤC TỪ BẢN ĐỒ HỆ THỐNG/);
  assert.match(s, /Workflow "Đăng nhập": 1\) Kiểm mật khẩu \[src\/auth\.js:1-1\] → 2\) Tạo phiên \[src\/auth\.js:1-2\]/, "bước theo đúng thứ tự");
  assert.match(s, /src\/auth\.js:1-1 \(function login\)/);
  assert.ok(!/mau\.css/.test(s), "không kéo file không liên quan");
  assert.ok(!/dòng có thể lệch/.test(s), "đồ thị đúng commit thì không cảnh báo");
  assert.equal(mucLuc.note(root, "Viết tài liệu tuyển dụng"), "", "không khớp thì không thêm gì");
  const empty = tmp(); t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  assert.equal(mucLuc.note(empty, "Sửa đăng nhập"), "", "repo chưa có đồ thị");
  fs.appendFileSync(path.join(root, "src", "auth.js"), "// sửa\n");
  assert.match(mucLuc.note(root, "Sửa đăng nhập"), /1 file mã đã đổi: dòng có thể lệch/);
  assert.equal(mucLuc.fold("Đăng Nhập"), "dang nhap");
});

test("runner: lượt Claude có mục lục trong prompt và cờ --model/--effort theo độ khó; ghi lý do vào nhật ký kiểm toán", async (t) => {
  const { root, git } = graphRepo(t);
  fs.writeFileSync(path.join(root, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1\n- LAST_UPDATED_BY: CODEX_ASTRA_DEV\n- NEXT_OWNER (MUTEX LOCK): CLAUDE_AUDITOR\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PENDING\n- [ ] OPEN P1-C01 [CRITICAL - src/auth.js]: đăng nhập không kiểm mật khẩu\n");
  git("add", "-A"); git("commit", "-qm", "agent");
  const home = tmp(); t.after(() => fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const fake = path.join(home, "claude.js");   // tên "claude" để bộ điều phối nhận đúng loại CLI
  fs.writeFileSync(fake, "const a=process.argv.slice(2),i=a.indexOf('-p');console.log(JSON.stringify({argv:a.slice(0,i),prompt:a[i+1]}));");
  fs.writeFileSync(path.join(home, "ctl-agents.json"), JSON.stringify({ CLAUDE_AUDITOR: [process.execPath, fake, "-p", "{prompt}"] }));
  fs.writeFileSync(path.join(home, "quyen.json"), JSON.stringify({ toanQuyen: false }));
  const ctl = createCtl({ dir: home });
  try { await runCase(ctl, root); } finally { await ctl.close(); }   // tắt ctl (nhả file sổ) trước khi dọn thư mục thử
});

async function runCase(ctl, root) {
  ctl.ws.add(root);
  const job = ctl.runner.run({ workspace: root, role: "CLAUDE_AUDITOR", task: "Duyệt sửa lỗi đăng nhập" });
  assert.deepEqual([job.dieuPhoi.tier, job.dieuPhoi.model, job.dieuPhoi.effort], ["nang", "opus", "high"], "còn blocker CRITICAL");
  for (let i = 0; i < 100 && ctl.jobs.get(job.id).status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
  const out = JSON.parse(ctl.jobs.rawLog(job.id).split(/\r?\n/).find((l) => l.startsWith("{")));
  assert.deepEqual(out.argv.slice(0, 4), ["--model", "opus", "--effort", "high"]);
  assert.match(out.prompt, /MỤC LỤC TỪ BẢN ĐỒ HỆ THỐNG[\s\S]*Workflow "Đăng nhập"/);
  const a = ctl.audit.recent(20).find((x) => x.action === "ai.run");
  assert.match(JSON.stringify(a), /còn blocker CRITICAL/);
}

test("API /dieu-phoi: đọc bảng và lưu cố định cho phòng", async (t) => {
  const home = tmp(); t.after(() => fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const ctl = createCtl({ dir: home });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  try {
    const base = "http://127.0.0.1:" + ctl.server.address().port;
    const call = async (p, body) => { const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, ...await r.json() }; };
    let r = await call("/dieu-phoi");
    assert.equal(r.dieuPhoi.tuDong, true); assert.equal(r.dieuPhoi.bang.claude.nang.model, "opus");
    r = await call("/dieu-phoi", { coDinh: { hinata: { model: "gemini-3.8-flash-high", effort: null } } });
    assert.equal(r.status, 200); assert.equal(r.dieuPhoi.coDinh.hinata.model, "gemini-3.8-flash-high");
    r = await call("/dieu-phoi", { coDinh: { hinata: { effort: "ultra" } } });
    assert.equal(r.status, 400);
  } finally { await ctl.close(); }
});
