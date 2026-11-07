"use strict";
// CEO duyệt 07/11/2026: máy tự kiểm chu trình agent.md (lib/kiem-agent.js) ở văn phòng (mỗi lượt AI) và ở CI (mỗi PR).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const k = require("../lib/kiem-agent");
const { createCtl } = require("../ctl/main");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAU = fs.readFileSync(path.join(__dirname, "..", "ctl", "agent-template.md"), "utf8").replace("{{TEN_DU_AN}}", "Thử").replace("{{CONG_NGHE}}", "Node.js").replace(/\r\n/g, "\n");   // checkout Windows có thể là CRLF
const withNext = (txt, role) => txt.replace(/^(- NEXT_OWNER[^:\n]*:\s*)\S+/m, "$1" + role);
const withLast = (txt, role) => txt.replace(/^(- LAST_UPDATED_BY:\s*)\S+/m, "$1" + role);
const add = (txt, heading, line) => txt.replace(heading, heading.replace(/\n$/, "") + "\n" + line + "\n");
const H41 = "### [4.1] NHẬT KÝ PHASE HIỆN TẠI (tối đa 25 dòng)\n";
const BLOCKERS = "- Blocker đang mở (chỉ CLAUDE_AUDITOR đổi [ ] OPEN thành [x] RESOLVED):\n";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vp-kiem-"));

test("bản agent.md: mẫu và agent.md của repo đạt; bắt thiếu dòng, vai sai, log dài, blocker sai mẫu, khóa API", () => {
  assert.deepEqual(k.checkText(MAU), []);
  assert.deepEqual(k.checkText(fs.readFileSync(path.join(__dirname, "..", "agent.md"), "utf8")), []);
  const p = k.parse(MAU);
  assert.equal(p.phaseNo, 1); assert.equal(p.next, "CLAUDE_AUDITOR"); assert.equal(p.last, "CTL_ONBOARDING"); assert.match(p.audit, /^PENDING/);
  assert.equal(p.open.length, 0, "ô [ ] Phase trong lộ trình Vùng [3] không tính là blocker");
  const has = (txt, re) => assert.match(k.checkText(txt).join("\n"), re);
  has(MAU.replace(/^- NEXT_OWNER.*$/m, ""), /Thiếu dòng NEXT_OWNER/);
  has(withNext(MAU, "GPT"), /NEXT_OWNER "GPT" không phải vai/);
  has(withLast(MAU, "ai_do"), /LAST_UPDATED_BY "ai_do"/);
  has(MAU.replace("Phase 1 - Khảo sát", "Khảo sát"), /Phase <số>/);
  has(MAU.replace("### [4.2]", "### [4.9]"), /Thiếu tiêu đề Vùng \[4\.2\]/);
  has(MAU.replace("- AUDIT_STATUS: PENDING", "- AUDIT_STATUS: OK"), /AUDIT_STATUS phải/);
  has(MAU.replace("REVIEW_ROUND: 0/3", "REVIEW_ROUND: 4/3"), /REVIEW_ROUND/);
  const log = (n) => add(MAU, H41, Array.from({ length: n }, (_, i) => "- dòng " + i).join("\n"));
  assert.deepEqual(k.checkText(log(22)), [], "22 + 3 dòng có sẵn = 25: vừa đủ");
  has(log(23), /Vùng \[4\.1\] có 26 dòng, tối đa 25/);
  has(add(MAU, BLOCKERS, "  - [ ] P1-C01 thiếu chữ OPEN"), /\[ \] OPEN <ID>/);
  has(add(MAU, BLOCKERS, "  - [ ] OPEN lỗi không có mã"), /thiếu ID/);
  has(add(MAU, BLOCKERS, "  - [x] P1-C01 xong"), /\[x\] RESOLVED/);
  assert.deepEqual(k.checkText(add(MAU, BLOCKERS, "  - [ ] OPEN P1-C01 [CRITICAL - a.js]: lỗi\n  - [x] RESOLVED P1-H02: đã sửa")), []);
  has(add(MAU, H41, "- khóa: sk-ant-" + "A1b2".repeat(8)), /trông như khóa API/);
});

test("lần sửa: đúng vùng của vai, đúng lượt; tăng Phase khi còn OPEN; Claude không tự sửa Phase; FORCE_OVERRIDE chỉ cảnh báo", () => {
  const astra = withNext(MAU, "CODEX_ASTRA_DEV");
  const ok = k.checkChange(astra, add(astra, H41, "- CLAIM_FIXED: P1-C01 -> a.js"), { role: "CODEX_ASTRA_DEV" });
  assert.deepEqual(ok, { loi: [], canhBao: [] });
  const z5 = astra.replace("LAST_AUDITED_COMMIT: (chưa có)", "LAST_AUDITED_COMMIT: abc1234");
  assert.match(k.checkChange(astra, z5, { role: "CODEX_ASTRA_DEV" }).loi.join(), /CODEX_ASTRA_DEV sửa Vùng \[5\], vùng này chỉ CLAUDE_AUDITOR/);
  assert.match(k.checkChange(astra, astra.replace("[Chưa cập nhật]", "[Sửa]"), { role: "CODEX_ASTRA_DEV" }).loi.join(), /Vùng \[(2|3)\]/);
  assert.match(k.checkChange(MAU, add(MAU, H41, "- x"), { role: "CODEX_ASTRA_DEV" }).loi.join(), /Không phải lượt của CODEX_ASTRA_DEV: .*NEXT_OWNER: CLAUDE_AUDITOR/);
  const forced = k.checkChange(MAU, z5, { role: "CODEX_ASTRA_DEV", force: true });
  assert.deepEqual(forced.loi, []); assert.match(forced.canhBao.join(), /FORCE_OVERRIDE/);
  // Claude ghi Vùng [5] là đúng quyền; tự sửa CURRENT_PHASE thì không
  assert.deepEqual(k.checkChange(MAU, add(MAU, BLOCKERS, "  - [ ] OPEN P1-C01: lỗi"), { role: "CLAUDE_AUDITOR" }).loi, []);
  assert.match(k.checkChange(MAU, MAU.replace("Phase 1 - Khảo sát", "Phase 2 - Khảo sát"), { role: "CLAUDE_AUDITOR" }).loi.join(), /không tự sửa CURRENT_PHASE/);
  // Tăng Phase khi còn OPEN: lỗi kể cả khi FORCE_OVERRIDE
  const open = add(astra, BLOCKERS, "  - [ ] OPEN P1-H01: lỗi");
  const up = open.replace("Phase 1 - Khảo sát", "Phase 2 - Khảo sát");
  assert.match(k.checkChange(open, up, { role: "CODEX_ASTRA_DEV", force: true }).loi.join(), /Phase 1 lên Phase 2 khi Vùng \[5\] còn 1 mục/);
  assert.deepEqual(k.checkChange(astra, astra.replace("Phase 1 - Khảo sát", "Phase 2 - Khảo sát"), { role: "CODEX_ASTRA_DEV" }).loi, [], "hết OPEN thì Astra được sang Phase");
  // CI: hai dòng khóa lượt phải khớp message commit
  const sync = withNext(withLast(add(astra, H41, "- x"), "CODEX_ASTRA_DEV"), "CLAUDE_AUDITOR");
  assert.deepEqual(k.checkChange(astra, sync, { role: "CODEX_ASTRA_DEV", next: "CLAUDE_AUDITOR", turnLines: true }).loi, []);
  assert.match(k.checkChange(astra, sync, { role: "CODEX_ASTRA_DEV", next: "SPEC_ARCHITECT", turnLines: true }).loi.join(), /NEXT_OWNER phải là SPEC_ARCHITECT/);
  // CEO (ý tưởng mới, FORCE_OVERRIDE) không bị kiểm quyền vùng
  assert.deepEqual(k.checkChange(MAU, withNext(z5, "SPEC_ARCHITECT"), { role: "CEO" }).loi, []);
});

test("onlyNew (văn phòng): lỗi có sẵn của agent.md cũ không chặn lượt, lỗi lượt này gây ra thì chặn", () => {
  const old = "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER: CODEX_ASTRA_DEV\n";
  assert.ok(k.checkText(old).length, "agent.md cũ thiếu vùng");
  assert.deepEqual(k.checkChange(old, old + "- ghi chú\n", { role: "CODEX_ASTRA_DEV", onlyNew: true }).loi, []);
  assert.match(k.checkChange(old, old.replace("CODEX_ASTRA_DEV", "ASTRA"), { role: "CODEX_ASTRA_DEV", onlyNew: true }).loi.join(), /NEXT_OWNER "ASTRA"/);
  const astra = withNext(MAU, "CODEX_ASTRA_DEV");
  const long = (n) => add(astra, H41, Array.from({ length: n }, (_, i) => "- dòng " + i).join("\n"));
  assert.deepEqual(k.checkChange(long(30), long(31), { role: "CODEX_ASTRA_DEV", onlyNew: true }).loi, [], "log vốn đã dài: không chặn vì thêm một dòng");
  assert.match(k.checkChange(long(22), long(23), { role: "CODEX_ASTRA_DEV", onlyNew: true }).loi.join(), /26 dòng/);
});

test("message commit agent-sync", () => {
  assert.deepEqual(k.parseSync("chore(agent-sync): CODEX_ASTRA_DEV -> NEXT: CLAUDE_AUDITOR — sửa P1-C01"), { role: "CODEX_ASTRA_DEV", next: "CLAUDE_AUDITOR", force: false });
  assert.equal(k.parseSync("chore(agent-sync): CLAUDE_AUDITOR -> NEXT: SPEC_ARCHITECT — FORCE_OVERRIDE (CEO)").force, true);
  assert.equal(k.parseSync("chore(agent-sync): CEO -> NEXT: SPEC_ARCHITECT — ý tưởng mới").force, true);
  assert.equal(k.parseSync("feat: thêm nút"), null);
});

// Repo git thử: mỗi commit một lần sửa agent.md.
function repo() {
  const root = tmp();
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost"); git("config", "core.autocrlf", "false");
  const commit = (files, msg) => { for (const [f, v] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), v); } git("add", "-A"); git("commit", "-qm", msg); return git("rev-parse", "--short=7", "HEAD"); };
  return { root, git, commit };
}
const CLI = path.join(__dirname, "..", "tools", "kiem-agent.js");
const cli = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a], { cwd, encoding: "utf8" });

test("lịch sử git (CI): commit agent-sync đúng thì đạt; sai lượt, kèm file khác, message lạ, xoá agent.md thì báo; CLI trả mã thoát", (t) => {
  const r = repo();
  t.after(() => fs.rmSync(r.root, { recursive: true, force: true }));
  const v0 = withNext(MAU, "CODEX_ASTRA_DEV");
  r.commit({ "agent.md": v0, "a.js": "1\n" }, "init");
  r.git("switch", "-q", "-c", "nhanh");
  const v1 = withNext(withLast(add(v0, H41, "- CLAIM_FIXED: P1-C01 -> a.js"), "CODEX_ASTRA_DEV"), "CLAUDE_AUDITOR");
  r.commit({ "a.js": "2\n" }, "ai(CODEX_ASTRA_DEV): sửa a.js");
  const ok = r.commit({ "agent.md": v1 }, "chore(agent-sync): CODEX_ASTRA_DEV -> NEXT: CLAUDE_AUDITOR");
  let rows = k.checkHistory(r.root, "main");
  assert.deepEqual(rows, [{ commit: ok, subject: "chore(agent-sync): CODEX_ASTRA_DEV -> NEXT: CLAUDE_AUDITOR", loi: [], canhBao: [] }], "commit code không sửa agent.md thì không xét");
  let out = cli(r.root, "--tu", "main");
  assert.equal(out.status, 0, out.stdout + out.stderr); assert.match(out.stdout, /✓ agent\.md: đạt/);
  // Astra ghi tiếp khi đã hết lượt + kèm file code + Vùng [5]
  const v2 = withLast(v1.replace("REVIEW_ROUND: 0/3", "REVIEW_ROUND: 1/3"), "CODEX_ASTRA_DEV");
  const bad = r.commit({ "agent.md": v2, "a.js": "3\n" }, "chore(agent-sync): CODEX_ASTRA_DEV -> NEXT: CLAUDE_AUDITOR");
  r.commit({ "agent.md": v2 + "\n" }, "docs: sửa chữ agent.md");
  rows = k.checkHistory(r.root, "main");
  const row = rows.find((x) => x.commit === bad);
  assert.match(row.loi.join("\n"), /tách riêng, không kèm file khác: a\.js/);
  assert.match(row.loi.join("\n"), /Không phải lượt của CODEX_ASTRA_DEV/);
  assert.match(row.loi.join("\n"), /sửa Vùng \[5\]/);
  assert.match(rows[rows.length - 1].loi.join(), /phải có message "chore\(agent-sync\)/);
  out = cli(r.root, "--tu", "main");
  assert.equal(out.status, 1); assert.match(out.stdout, new RegExp("✗ " + bad));
  // FORCE_OVERRIDE: lỗi quyền thành cảnh báo
  r.git("reset", "-q", "--hard", ok);
  const forced = r.commit({ "agent.md": withLast(v2, "CODEX_ASTRA_DEV") }, "chore(agent-sync): CODEX_ASTRA_DEV -> NEXT: CLAUDE_AUDITOR — FORCE_OVERRIDE (CEO cho sửa)");
  rows = k.checkHistory(r.root, "main");
  assert.deepEqual(rows.find((x) => x.commit === forced).loi, []);
  assert.match(rows.find((x) => x.commit === forced).canhBao.join(), /FORCE_OVERRIDE/);
  assert.equal(cli(r.root, "--tu", "main").status, 0);
  // Xoá agent.md
  r.git("rm", "-q", "agent.md"); r.git("commit", "-qm", "chore(agent-sync): CODEX_ASTRA_DEV -> NEXT: CLAUDE_AUDITOR");
  assert.match(k.checkHistory(r.root, "main").pop().loi.join(), /xoá agent\.md/);
  // Mã thoát 2: thiếu file, thiếu tên nhánh, nhánh không có
  assert.equal(cli(r.root).status, 2);
  assert.equal(cli(r.root, path.join(r.root, "khong-co.md")).status, 2);
  fs.writeFileSync(path.join(r.root, "agent.md"), MAU);
  assert.equal(cli(r.root, "--tu").status, 2);
  assert.equal(cli(r.root, "--tu", "khong-co-nhanh").status, 2);
  assert.equal(cli(r.root, "agent.md").status, 0, "đường dẫn tương đối");
  fs.writeFileSync(path.join(r.root, "x.md"), withNext(MAU, "GPT"));
  out = cli(r.root, "x.md");
  assert.equal(out.status, 1); assert.match(out.stdout, /NEXT_OWNER "GPT"/);
});

// Văn phòng: Astra sửa Vùng [5] (của Claude) thì bàn giao bị trả lại đúng Astra một lần; lần sau trả vùng về như cũ thì đi tiếp,
// và commit agent-sync bộ điều phối tạo ra qua được bộ kiểm CI.
test("văn phòng: lượt sửa sai vùng bị trả lại kèm lý do, sửa xong thì đi tiếp; commit chuyển lượt qua được kiểm CI", async (t) => {
  const temp = tmp(), dir = path.join(temp, "home"), root = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(root);
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost"); git("config", "core.autocrlf", "false");
  fs.writeFileSync(path.join(root, "agent.md"), withNext(MAU, "CODEX_ASTRA_DEV"));
  git("add", "."); git("commit", "-qm", "init");
  const GOOD = [{ van_de: "Thiếu hàm cộng hai số trong src/app.js", da_lam: "Viết hàm cộng trong src/app.js và ghi log Vùng [4.1]", vi_sao: "Việc CEO giao cần hàm này để chạy được", phuong_an_khac: [] }];
  const fake = path.join(temp, "cli.cjs"), count = path.join(temp, "dem");
  fs.writeFileSync(fake, `const fs=require('fs');const role=process.argv[2],prompt=process.argv[process.argv.length-1];
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo'}));return;}
    if(role==='CLAUDE_AUDITOR'){console.log(JSON.stringify({result:'ok\\n'+JSON.stringify({role,next_owner:'SPEC_ARCHITECT',files:[],claim_fixed:[],done:true})}));return;}
    const n=(fs.existsSync(${JSON.stringify(count)})?+fs.readFileSync(${JSON.stringify(count)},'utf8'):0)+1;fs.writeFileSync(${JSON.stringify(count)},String(n));
    fs.mkdirSync('src',{recursive:true});fs.writeFileSync('src/app.js','module.exports=(a,b)=>a+b;\\n');
    let a=fs.readFileSync('agent.md','utf8');
    if(!a.includes('- Đã viết src/app.js'))a=a.replace(${JSON.stringify(H41)},${JSON.stringify(H41)}+'- Đã viết src/app.js\\n');
    a=prompt.includes('LƯỢT TRƯỚC CỦA BẠN BỊ TRẢ LẠI')?a.replace('AUDIT_STATUS: PASS (Astra tự ghi)','AUDIT_STATUS: PENDING'):a.replace('AUDIT_STATUS: PENDING','AUDIT_STATUS: PASS (Astra tự ghi)');
    fs.writeFileSync('agent.md',a);
    console.log(JSON.stringify({result:'Xong.\\n'+JSON.stringify({role,next_owner:'CLAUDE_AUDITOR',files:['src/app.js'],claim_fixed:[],giai_thich:${JSON.stringify(GOOD)}})}));`);
  const ROLES = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR", "CLAUDE_REPORTER"];
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries(ROLES.map((r) => [r, [process.execPath, fake, r, "{prompt}"]]))));
  const ctl = createCtl({ dir });
  ctl.ws.add(root);
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const r = ctl.autopilot.start({ workspace: root, task: "Viết hàm cộng" });
  let run;
  for (let i = 0; i < 300; i++) { run = ctl.autopilot.get(r.id); if (["awaiting_approval", "attention"].includes(run.status)) break; await sleep(50); }
  assert.equal(run.status, "awaiting_approval", run.problem);
  assert.deepEqual(run.steps.map((s) => s.role), ["CODEX_ASTRA_DEV", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR"]);
  assert.match(run.steps[0].explainRejected, /^agent\.md: CODEX_ASTRA_DEV sửa Vùng \[5\], vùng này chỉ CLAUDE_AUDITOR/);
  assert.equal(ctl.runner.get(run.steps[0].jobId).decided, "rejected");
  const now = fs.readFileSync(path.join(root, "agent.md"), "utf8");
  assert.match(now, /AUDIT_STATUS: PENDING/); assert.match(now, /- Đã viết src\/app\.js/);
  const rows = k.checkHistory(root, "main");
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.match(rows[0].subject, /^chore\(agent-sync\): CODEX_ASTRA_DEV -> NEXT: CLAUDE_AUDITOR/);
  assert.deepEqual(rows[0].loi, [], "commit chuyển lượt của văn phòng đạt kiểm CI");
});
