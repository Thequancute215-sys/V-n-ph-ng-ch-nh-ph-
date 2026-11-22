"use strict";
// CEO yêu cầu 04/11/2026: chat trực tiếp với từng AI. Chat chỉ đọc, chạy riêng không chặn lượt làm việc;
// hỏi việc ngoài phạm vi thì AI chỉ sang đúng phòng kèm prompt để CEO đưa cho người đó.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCtl } = require("../ctl/main");
const { parseReply, promptFor } = require("../ctl/chat");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("tách dòng JSON cuối: chuyển phòng, prompt giao việc, trả lời thường; bỏ phòng lạ và chuyển cho chính mình", () => {
  const route = parseReply('Việc viết code là của Astra.\n{"chuyen_phong":"sasuke","ly_do":"Cần sửa code","prompt":"Sửa src/app.js"}', "itachi");
  assert.equal(route.text, "Việc viết code là của Astra.");
  assert.deepEqual(route.route, { to: "sasuke", name: "Sasuke", room: "Phòng Lập trình", why: "Cần sửa code", prompt: "Sửa src/app.js" });
  assert.equal(route.task, null);
  const task = parseReply('Em sẽ sửa hàm login.\n{"chuyen_phong":null,"ly_do":"cần sửa file","prompt":"Sửa hàm login"}', "sasuke");
  assert.equal(task.route, null);
  assert.deepEqual(task.task, { why: "cần sửa file", prompt: "Sửa hàm login" });
  const plain = parseReply('Dự án đang ở Phase 2.\n{"chuyen_phong":null,"ly_do":"","prompt":""}', "pain");
  assert.deepEqual([plain.text, plain.route, plain.task], ["Dự án đang ở Phase 2.", null, null]);
  assert.equal(parseReply('A\n{"chuyen_phong":"phong-la","ly_do":"x","prompt":"y"}', "pain").route, null, "phòng không có thì không chuyển");
  assert.equal(parseReply('A\n{"chuyen_phong":"sasuke","ly_do":"x","prompt":"y"}', "sasuke").route, null, "không chuyển cho chính mình");
  assert.equal(parseReply("Không có dòng JSON nào", "pain").text, "Không có dòng JSON nào");
  const fenced = parseReply('Trả lời\n```json\n{"chuyen_phong":"sakura","ly_do":"kiểm duyệt","prompt":"Rà bảo mật"}\n```', "sasuke");
  assert.equal(fenced.route && fenced.route.to, "sakura");
  assert.equal(fenced.text, "Trả lời");
});

test("lời nhắn cho AI: nêu phạm vi từng phòng, chỉ đọc, đưa lại lịch sử gần nhất", () => {
  const p = promptFor("itachi", [{ from: "ceo", text: "câu cũ" }, { from: "ai", text: "đáp cũ" }], "câu mới");
  assert.match(p, /Bạn là Itachi ở Phòng Kiến trúc/);
  assert.match(p, /CHAT CHỈ ĐỌC/);
  for (const id of ["pain", "hinata", "itachi", "sasuke", "sakura"]) assert.ok(p.includes(`"${id}"`), id);
  assert.match(p, /<truoc>\nSếp: câu cũ\nItachi: đáp cũ\n<\/truoc>/);
  assert.match(p, /<hoi>\ncâu mới\n<\/hoi>$/);
});

test("lệnh chat mặc định luôn chỉ đọc kể cả khi bật toàn quyền; Sol và Astra đúng model", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chat-argv-"));
  const ctl = createCtl({ dir });
  t.after(async () => { await ctl.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  assert.equal(ctl.runner.fullOn(), true);
  const claude = ctl.runner.chatArgv("claude"), sol = ctl.runner.chatArgv("sol"), astra = ctl.runner.chatArgv("astra"), agy = ctl.runner.chatArgv("antigravity");
  assert.deepEqual(claude.slice(claude.indexOf("--permission-mode"), claude.indexOf("--permission-mode") + 2), ["--permission-mode", "plan"]);
  assert.ok(claude.includes("Read,Grep,Glob"));
  for (const a of [sol, astra]) assert.deepEqual(a.slice(a.indexOf("--sandbox"), a.indexOf("--sandbox") + 2), ["--sandbox", "read-only"]);
  assert.equal(sol[sol.indexOf("-m") + 1], "gpt-6.2-sol");
  assert.equal(astra[astra.indexOf("-m") + 1], "gpt-6.2-astra");
  assert.deepEqual(agy.slice(agy.indexOf("--mode"), agy.indexOf("--mode") + 2), ["--mode", "plan"]);
  assert.match(agy[agy.indexOf("--settings") + 1], /Get-ChildItem/, "Antigravity được lệnh chỉ đọc để không bị chặn trả lời rỗng");
  for (const a of [claude, sol, astra, agy]) assert.ok(!a.some((x) => /dangerously/.test(x)), a.join(" "));
  assert.throws(() => ctl.runner.chatArgv("pain"), /Không có AI để chat/);
});

// Lỗi gặp thật 22/11/2026: máy chạy Codex qua `node --preserve-symlinks … codex.js` (ctl-agents.json); vai phụ (chat, soạn prompt)
// cắt lệnh ở dấu "-" đầu tiên nên chỉ còn "node.exe exec …" và Node báo không tìm thấy module.
test("chat/soạn prompt của Codex giữ đủ cờ node và file codex.js khi lệnh chính chạy qua node.exe", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chat-node-"));
  const prog = [process.execPath, "--preserve-symlinks", "--preserve-symlinks-main", "C:\\cx\\bin\\codex.js"];
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify({ CODEX_ASTRA_DEV: [...prog, "exec", "--json", "--approve-for-me", "{prompt}"] }));
  const ctl = createCtl({ dir });
  t.after(async () => { await ctl.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const sol = ctl.runner.chatArgv("sol");
  assert.deepEqual(sol.slice(0, 5), [...prog, "exec"]);
  assert.deepEqual(sol.slice(sol.indexOf("--sandbox"), sol.indexOf("--sandbox") + 2), ["--sandbox", "read-only"]);
  assert.ok(!sol.includes("--approve-for-me"), "chat không mượn cờ của lượt làm việc");
});

// CLI giả: Claude/Codex/agy trả lời theo người được hỏi; Itachi được nhờ viết code thì chỉ sang Sasuke.
async function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chat-")), dir = path.join(temp, "home"), repo = path.join(temp, "repo");
  fs.mkdirSync(dir); fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(repo, "agent.md"), "# Agent\n## [4] KHÓA LƯỢT\n- CURRENT_PHASE: Phase 1\n- LAST_UPDATED_BY: CLAUDE_AUDITOR\n- NEXT_OWNER (MUTEX LOCK): CODEX_ASTRA_DEV\n");
  git("add", "."); git("commit", "-qm", "init");
  const fake = path.join(temp, "cli.cjs");
  fs.writeFileSync(fake, `const kind=process.argv[2],prompt=process.argv[process.argv.length-1];
    const who=(/Bạn là (\\S+) ở/.exec(prompt)||[])[1];const hoi=(/<hoi>\\n([\\s\\S]*)\\n<\\/hoi>$/.exec(prompt)||[])[1]||'';
    const slow=hoi.includes('chậm');
    setTimeout(()=>{
      let text='Dùng token (--base-size-*) trong static. Em là '+who+', cwd='+require('path').basename(process.cwd())+', nhớ='+(prompt.includes('<truoc>\\n')?'có':'không')+', token=abc123secret';
      let line={chuyen_phong:null,ly_do:'',prompt:''};
      if(who==='Itachi'&&hoi.includes('viết code'))line={chuyen_phong:'sasuke',ly_do:'Viết code là việc của Astra',prompt:'Astra ơi, viết hàm đăng nhập trong src/app.js'};
      if(hoi.includes('hỏng'))process.exit(3);if(hoi.includes('im lặng')){console.log('jetski: no output produced');console.log(JSON.stringify({result:''}));return;}if(hoi.includes('credit')){console.log(JSON.stringify({type:'error',message:'Your workspace is out of credits.'}));process.exit(1);}
      const out=text+'\\n'+JSON.stringify(line);
      if(kind==='CODEX_CHAT'){console.log(JSON.stringify({type:'thread.started'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:out}}));}
      else console.log(JSON.stringify({result:out}));
    }, slow?800:50);`);
  fs.writeFileSync(path.join(dir, "ctl-agents.json"), JSON.stringify(Object.fromEntries(["CLAUDE_CHAT", "CODEX_CHAT", "AGY_CHAT"].map((r) => [r, [process.execPath, fake, r, "{prompt}"]]))));
  const ctl = createCtl({ dir });
  ctl.ws.add(repo);
  t.after(async () => { await ctl.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const wait = async (who) => { for (let i = 0; i < 200; i++) { const c = ctl.chat.get(repo, who); if (!c.busy) return c; await sleep(50); } assert.fail("chat " + who + " chưa xong"); };
  return { ctl, repo, dir, wait };
}

test("chat từng người: đúng AI, chạy trong repo, nhớ mạch chuyện, che khóa; Itachi chỉ sang Sasuke kèm prompt", async (t) => {
  const { ctl, repo, wait } = await fixture(t);
  for (const who of ["pain", "hinata", "itachi", "sasuke", "sakura"]) {
    const sent = ctl.chat.send({ workspace: repo, who, text: "Dự án đang ở đâu?" });
    assert.equal(sent.busy, true);
    const c = await wait(who);
    const last = c.messages.at(-1);
    assert.equal(last.status, "xong", JSON.stringify(last));
    assert.ok(last.text.startsWith("Dùng token (--base-size-*) trong static."), "không che nhầm chữ token thường");
    assert.match(last.text, new RegExp("Em là " + c.name + ", cwd=repo, nhớ=không"));
    assert.ok(!last.text.includes("abc123secret"), "che khóa");
    assert.equal(last.route, null);
  }
  ctl.chat.send({ workspace: repo, who: "itachi", text: "Anh viết code đăng nhập giúp tôi" });
  const c = await wait("itachi"), last = c.messages.at(-1);
  assert.match(last.text, /nhớ=có/, "câu thứ hai có lịch sử");
  assert.deepEqual(last.route, { to: "sasuke", name: "Sasuke", room: "Phòng Lập trình", why: "Viết code là việc của Astra", prompt: "Astra ơi, viết hàm đăng nhập trong src/app.js" });
  assert.equal(c.messages.length, 4);
  assert.equal(ctl.chat.get(repo, "sasuke").messages.length, 2, "mỗi người một cuộc chat riêng");
});

test("chat không phải lượt AI: không chặn lượt làm việc; một người chỉ trả lời một câu một lúc; lỗi CLI báo rõ", async (t) => {
  const { ctl, repo, wait } = await fixture(t);
  const c = ctl.chat.send({ workspace: repo, who: "sakura", text: "câu chậm" });
  const job = ctl.jobs.get(c.messages.at(-1).jobId);
  assert.equal(job.kind, "cmd");
  assert.equal(job.agent, "CHAT_SAKURA");
  assert.equal(ctl.jobs.aiBusy(repo), false, "đang chat vẫn giao lượt làm việc được");
  assert.throws(() => ctl.chat.send({ workspace: repo, who: "sakura", text: "câu nữa" }), (e) => e.code === "CHAT_BUSY");
  assert.throws(() => ctl.chat.clear(repo, "sakura"), (e) => e.code === "CHAT_BUSY");
  ctl.chat.send({ workspace: repo, who: "pain", text: "song song" });
  await wait("sakura"); await wait("pain");
  ctl.chat.send({ workspace: repo, who: "sasuke", text: "chạy hỏng" });
  const bad = (await wait("sasuke")).messages.at(-1);
  assert.equal(bad.status, "loi");
  assert.match(bad.text, /Lỗi khi chạy Sasuke \(failed\)/);
  ctl.chat.send({ workspace: repo, who: "itachi", text: "hết credit" });
  assert.match((await wait("itachi")).messages.at(-1).text, /^Itachi .* đã hết hạn mức gói/);
  ctl.chat.send({ workspace: repo, who: "hinata", text: "im lặng" });
  const quiet = (await wait("hinata")).messages.at(-1);
  assert.equal(quiet.status, "loi");
  assert.match(quiet.text, /^Hinata không trả lời được\.\njetski: no output produced/);
  assert.throws(() => ctl.chat.send({ workspace: repo, who: "ceo", text: "x" }), /Không có người để chat/);
  assert.throws(() => ctl.chat.send({ workspace: repo, who: "pain", text: "   " }), /trống/);
  assert.equal(ctl.chat.clear(repo, "sasuke").messages.length, 0);
});

test("app tắt giữa lúc đang trả lời: mở lại thì tin chờ thành lỗi, không treo mãi", async (t) => {
  const { ctl, repo, dir } = await fixture(t);
  fs.writeFileSync(path.join(dir, "chat.json"), JSON.stringify({ [ctl.ws.find(repo).path]: { pain: [{ id: "m1", from: "ai", text: "", status: "cho", at: 1 }] } }));
  const { createChat } = require("../ctl/chat");
  const chat = createChat({ jobs: ctl.jobs, ws: ctl.ws, runner: ctl.runner, audit: ctl.audit, dir });
  const m = chat.get(repo, "pain").messages[0];
  assert.equal(m.status, "loi");
  assert.match(m.text, /khởi động lại/);
});
