"use strict";
// Phòng Frontend & UI/UX (Kakashi, vai FRONTEND_UIUX_DEV, chạy bằng Antigravity) — CEO thêm 11/11/2026.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const k = require("../lib/kiem-agent");
const { checkHandoff } = require("../ctl/handoff");
const { AGENTS, FULL_ROLES } = require("../ctl/runner");
const { createCtl } = require("../ctl/main");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FE = "FRONTEND_UIUX_DEV";

const so = (next, z41 = "- File đã sửa: (chưa có)", z2 = "- Đặc tả: giao diện bảng tin") =>
  `# AGENT\n## [1] HIẾN PHÁP\n- Tên: thử\n## [2] ĐẶC TẢ\n${z2}\n## [3] KIẾN TRÚC\n- Cây thư mục: web/, api/\n` +
  `## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 2 - Giao diện\n- LAST_UPDATED_BY: CODEX_ASTRA_DEV\n- NEXT_OWNER (MUTEX LOCK): ${next}\n` +
  `### [4.1] NHẬT KÝ\n${z41}\n### [4.2] LƯU TRỮ\n- (chưa có)\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PENDING\n- REVIEW_ROUND: 0/3\n- (Hiện không có Blocker)\n`;

test("bộ kiểm agent.md: Kakashi là vai hợp lệ, ghi được [4.1] nhưng không được sửa đặc tả [2]", () => {
  assert.ok(k.ROLES.includes(FE));
  assert.deepEqual(k.checkText(so(FE)), []);
  assert.deepEqual(k.checkChange(so(FE), so("SOL_ARCHITECT_ADVISOR", "- File đã sửa: web/BangTin.tsx"), { role: FE }).loi, []);
  assert.match(k.checkChange(so(FE), so("SOL_ARCHITECT_ADVISOR", undefined, "- Đặc tả: Kakashi tự đổi"), { role: FE }).loi.join(), /FRONTEND_UIUX_DEV sửa Vùng \[2\]/);
  assert.match(k.checkChange(so("CODEX_ASTRA_DEV"), so("CLAUDE_AUDITOR", "- File đã sửa: web/a.tsx"), { role: FE }).loi.join(), /Không phải lượt của FRONTEND_UIUX_DEV/);
  assert.deepEqual(k.parseSync("chore(agent-sync): FRONTEND_UIUX_DEV -> NEXT: SOL_ARCHITECT_ADVISOR"), { role: FE, next: "SOL_ARCHITECT_ADVISOR", force: false });
});

test("bàn giao: Kakashi phải giải thích cho CEO; Astra giao được cho Kakashi; Kakashi không đặt effort", () => {
  const base = { files: ["web/a.tsx"], claim_fixed: [] };
  const why = [{ van_de: "Màn hình bảng tin chưa có trạng thái lỗi", da_lam: "Thêm trạng thái lỗi kèm nút thử lại", vi_sao: "Đặc tả Vùng [2.4] bắt buộc đủ 5 trạng thái", phuong_an_khac: [] }];
  assert.ok(checkHandoff({ role: FE, next_owner: "SOL_ARCHITECT_ADVISOR", ...base }, FE).some((x) => x.startsWith("giai_thich")));
  assert.deepEqual(checkHandoff({ role: FE, next_owner: "SOL_ARCHITECT_ADVISOR", ...base, giai_thich: why }, FE), []);
  assert.deepEqual(checkHandoff({ role: "CODEX_ASTRA_DEV", next_owner: FE, ...base, giai_thich: why }, "CODEX_ASTRA_DEV"), []);
  assert.match(checkHandoff({ role: FE, next_owner: "CLAUDE_AUDITOR", ...base, giai_thich: why, effort: "high" }, FE).join(), /chỉ CLAUDE_AUDITOR được đặt effort/);
});

test("runner: Kakashi chạy bằng Antigravity, dùng lại đường dẫn agy của Hinata, có quyền build/test npm", () => {
  const a = AGENTS[FE];
  assert.equal(a.argv[0], "agy");
  assert.equal(a.base, "SPEC_ARCHITECT", "máy CEO khai đường dẫn agy.exe cho Hinata thì Kakashi dùng chung");
  assert.ok(FULL_ROLES.has(FE));
  const settings = JSON.parse(a.argv[a.argv.indexOf("--settings") + 1]).permissions.allow.join("\n");
  assert.match(settings, /npm \(ci\|install\|test\|run \(build\|lint\|test\|typecheck\)\)/);
  assert.match(a.prompt, /5 trạng thái/);
  assert.match(a.prompt, /Không sửa backend/);
  assert.match(AGENTS.CODEX_ASTRA_DEV.prompt, /FRONTEND_UIUX_DEV/);
});

test("chu trình tự chạy: Astra làm backend → Kakashi làm giao diện → Claude trả lỗi giao diện về Kakashi → báo cáo CEO", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-kakashi-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 2 - Giao diện\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): SPEC_ARCHITECT\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PASS\n");
  git("add", "agent.md"); git("commit", "-qm", "init");
  const fake = path.join(temp, "cli.cjs"), count = path.join(temp, "claude-lan.txt");
  // Vai lấy từ "--role=" hoặc, với Antigravity cấu hình kiểu "agy -p {prompt}", từ câu "Bạn là <VAI>" của prompt.
  fs.writeFileSync(fake, `const fs=require('fs');const a=process.argv.slice(2);
    const p=a.includes('-p')?a[a.indexOf('-p')+1]:a[a.length-1];
    let role=(a.find(x=>x.startsWith('--role='))||'').slice(7);
    if(!role){const m=/Bạn là (FRONTEND_UIUX_DEV|SPEC_ARCHITECT)\\b/.exec(p);role=m?m[1]:'?';}
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo.'}));return;}
    let h={SPEC_ARCHITECT:'SOL_ARCHITECT_PLANNER',SOL_ARCHITECT_PLANNER:'CODEX_ASTRA_DEV',CODEX_ASTRA_DEV:'FRONTEND_UIUX_DEV',FRONTEND_UIUX_DEV:'CLAUDE_AUDITOR'}[role];
    let extra={};
    if(role==='CLAUDE_AUDITOR'){const n=(fs.existsSync(${JSON.stringify(count)})?Number(fs.readFileSync(${JSON.stringify(count)},'utf8')):0)+1;fs.writeFileSync(${JSON.stringify(count)},String(n));
      h=n===1?'FRONTEND_UIUX_DEV':'SPEC_ARCHITECT';extra=n===1?{effort:'high'}:{done:true};}
    if(role==='FRONTEND_UIUX_DEV')fs.writeFileSync('BangTin.html','<main>bảng tin</main>');
    console.log(JSON.stringify({result:'Xong lượt '+role+'.\\n'+JSON.stringify({role,next_owner:h,files:[],claim_fixed:[],...extra,giai_thich:[{van_de:'Vấn đề của lượt thử nghiệm',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì đây là CLI giả dùng cho test',phuong_an_khac:[]}]})}));`);
  const cfg = Object.fromEntries(["SOL_ARCHITECT_PLANNER", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR", "CLAUDE_REPORTER"].map((r) => [r, [process.execPath, fake, "--role=" + r, "{prompt}"]]));
  const reporter = path.join(temp, "claude.js");
  fs.writeFileSync(reporter, `process.argv.splice(2, process.argv.length, "--role=CLAUDE_REPORTER", process.argv.at(-1)); require(${JSON.stringify(fake)});`);
  cfg.CLAUDE_REPORTER = [process.execPath, reporter, "-p", "{prompt}"];
  cfg.SPEC_ARCHITECT = [process.execPath, fake, "-p", "{prompt}"];   // không khai FRONTEND_UIUX_DEV: phải mượn chương trình của Hinata
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(cfg));
  const ctl = createCtl({ dir });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  ctl.ws.add(repo);
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const r = await fetch(base + "/autopilot", { method: "POST", headers: { authorization: "Bearer " + ctl.token, "Content-Type": "application/json" }, body: JSON.stringify({ workspace: repo, task: "Làm màn hình bảng tin" }) }).then((x) => x.json());
  let run;
  for (let i = 0; i < 300; i++) { run = ctl.autopilot.get(r.run.id); if (run.status === "awaiting_approval" || run.status === "attention") break; await sleep(50); }
  assert.equal(run.status, "awaiting_approval", run.problem || "");
  assert.deepEqual(run.steps.map((s) => s.role), ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "CODEX_ASTRA_DEV", FE, "CLAUDE_AUDITOR", FE, "CLAUDE_AUDITOR"]);
  assert.equal(run.rework, 1, "Claude trả về Kakashi tính là một lần sửa lại của đội code");
  assert.equal((run.effort || {})[FE], undefined, "mức effort của Codex không áp cho lượt Antigravity");
  assert.ok(fs.existsSync(path.join(repo, "BangTin.html")), "lượt Kakashi chạy thật bằng chương trình mượn của Hinata");
});
