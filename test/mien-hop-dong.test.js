"use strict";
// Miễn hợp đồng giao tiếp chỉ CEO quyết (CEO yêu cầu 16/11/2026: "cứ ngoại lệ thì sẽ hỏi tôi và giải thích").
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { createMienHopDong } = require("../ctl/mien-hop-dong");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-mien-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), "# Agent\n## [1] HIẾN PHÁP\n- Tên: công cụ dòng lệnh\n## [2] ĐẶC TẢ\n- F1: đổi tên file hàng loạt\n## [3] KIẾN TRÚC\n- API Contract: Không có API — công cụ chạy dòng lệnh trên máy, không có máy chủ\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1 - Thử\n- LAST_UPDATED_BY: SPEC_ARCHITECT\n- NEXT_OWNER (MUTEX LOCK): SOL_ARCHITECT_PLANNER\n\n### [4.1] NHẬT KÝ\n- (trống)\n\n### [4.2] LƯU TRỮ\n- (trống)\n\n## [5] CHỐT CHẶN\n- AUDIT_STATUS: PENDING\n");
  git("add", "-A"); git("commit", "-qm", "init");
  const fake = path.join(temp, "cli.cjs");
  // Sol: lượt đầu đề nghị miễn; bị CEO từ chối (lời giao có "KHÔNG đồng ý miễn") thì tạo hợp đồng và bỏ dòng miễn.
  fs.writeFileSync(fake, `const fs=require('fs');const role=process.argv[2],prompt=process.argv[3]||'';
    if(role==='CLAUDE_REPORTER'){console.log(JSON.stringify({result:'Claude báo cáo.'}));process.exit(0);}
    let files=[];
    if(role==='SOL_ARCHITECT_PLANNER'&&/KHÔNG đồng ý miễn/.test(prompt)){
      fs.mkdirSync('contract',{recursive:true});
      fs.writeFileSync('contract/api.json',JSON.stringify({openapi:'3.0.3',info:{title:'t',version:'1.0.0'},paths:{'/api/x':{get:{operationId:'x',responses:{200:{description:'ok'}}}}}}));
      fs.writeFileSync('agent.md',fs.readFileSync('agent.md','utf8').replace(/- API Contract: .*/,'- API Contract: contract/api.json'));
      files=['contract/api.json'];
    }
    const next={SOL_ARCHITECT_PLANNER:'CLAUDE_AUDITOR',CLAUDE_AUDITOR:'SPEC_ARCHITECT'}[role];
    console.log(JSON.stringify({result:'Xong.'+String.fromCharCode(10)+JSON.stringify({role,next_owner:next,files,claim_fixed:[],done:role==='CLAUDE_AUDITOR'?true:undefined,giai_thich:[{van_de:'Dự án không có API vì chạy dòng lệnh',da_lam:'Đã làm phần việc thử nghiệm',vi_sao:'Vì công cụ không có máy chủ hay sự kiện mạng',phuong_an_khac:[]}]})}));`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries(["SOL_ARCHITECT_PLANNER", "CLAUDE_AUDITOR", "CLAUDE_REPORTER", "SPEC_ARCHITECT"].map((r) => [r, [process.execPath, fake, r, "{prompt}"]]))));
  fs.writeFileSync(path.join(dir, "quyen.json"), JSON.stringify({ toanQuyen: false }));
  const ctl = createCtl({ dir });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  ctl.ws.add(repo);
  const call = async (p, body) => { const r = await fetch("http://127.0.0.1:" + ctl.server.address().port + p, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + ctl.token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, ...await r.json() }; };
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const wait = async (id, status) => { for (let i = 0; i < 300; i++) { const run = ctl.autopilot.get(id); if (run.status === status) return run; if (run.status === "attention") assert.fail(run.problem); await sleep(50); } assert.fail("Không tới " + status + ": " + JSON.stringify(ctl.autopilot.get(id)).slice(0, 1500)); };
  return { ctl, repo, dir, call, wait };
}

test("Sol đề nghị miễn hợp đồng: luồng dừng hỏi CEO kèm giải thích; CEO đồng ý thì ghi nhận miễn và chạy tiếp", async (t) => {
  const { ctl, repo, dir, call, wait } = await fixture(t);
  const r = await call("/autopilot", { workspace: repo, task: "Lập kế hoạch công cụ đổi tên file" });
  const hoi = await wait(r.run.id, "awaiting_answer");
  assert.equal(hoi.question.kind, "mien-hop-dong");
  assert.match(hoi.question.question, /Sol đề nghị MIỄN hợp đồng giao tiếp/);
  assert.match(hoi.question.question, /công cụ chạy dòng lệnh trên máy, không có máy chủ/, "nguyên văn lý do của Sol");
  assert.match(hoi.question.question, /Miễn thì mất cả ba thứ đó/, "giải thích miễn thì mất gì");
  assert.deepEqual(hoi.question.options.map((o) => o.id), ["A", "B"]);
  assert.equal(createMienHopDong({ dir }).coMien(repo), false, "chưa ghi miễn khi CEO chưa quyết");
  assert.equal((await call(`/autopilot/${r.run.id}/answer`, { option: "A" })).status, 200);
  const run = await wait(r.run.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), ["SOL_ARCHITECT_PLANNER", "CLAUDE_AUDITOR"], "Sol không phải chạy lại");
  assert.equal(createMienHopDong({ dir }).coMien(repo), true, "đã ghi miễn cho dự án");
  assert.ok(ctl.audit.recent(200).some((a) => a.action === "mien_hop_dong.dong_y"));
});

test("CEO không đồng ý miễn: trả lại Sol để tạo contract/api.json, rồi chạy tiếp", async (t) => {
  const { repo, dir, call, wait } = await fixture(t);
  const r = await call("/autopilot", { workspace: repo, task: "Lập kế hoạch công cụ đổi tên file" });
  await wait(r.run.id, "awaiting_answer");
  await call(`/autopilot/${r.run.id}/answer`, { option: "B" });
  const run = await wait(r.run.id, "awaiting_approval");
  assert.deepEqual(run.steps.map((s) => s.role), ["SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_PLANNER", "CLAUDE_AUDITOR"]);
  assert.ok(fs.existsSync(path.join(repo, "contract", "api.json")), "Sol đã tạo hợp đồng");
  assert.equal(createMienHopDong({ dir }).coMien(repo), false, "không ghi miễn");
});
