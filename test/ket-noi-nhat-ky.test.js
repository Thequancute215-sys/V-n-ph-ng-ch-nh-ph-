"use strict";
// CEO yêu cầu 07/11/2026: trang Kết nối (MCP) của đội với chính sách "đọc + làm việc, chặn gửi", và Nhật ký "ai làm gì, lúc nào".
const test = require("node:test");
const assert = require("node:assert/strict");
const { createConnectors, CHAN_CLAUDE, parseClaude, parseCodex, parseAgy } = require("../ctl/ket-noi");
const { createJournal, parseLine } = require("../ctl/nhat-ky");
const { fullAccessArgs } = require("../ctl/runner");

const CLAUDE_LIST = `Checking MCP server health…

claude.ai Notion: https://mcp.notion.com/mcp - √ Connected
claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - √ Connected
claude.ai Vercel: https://mcp.vercel.com - ! Needs authentication
blender: uvx blender-mcp - √ Connected`;

test("đọc danh sách kết nối của Claude, Codex, Antigravity", () => {
  assert.deepEqual(parseClaude(CLAUDE_LIST), { "claude.ai Notion": "da-ket-noi", "claude.ai Gmail": "da-ket-noi", "claude.ai Vercel": "can-dang-nhap", blender: "da-ket-noi" });
  assert.deepEqual(parseCodex('[{"name":"notion","enabled":true,"auth_status":"o_auth"},{"name":"figma","enabled":false}]'), { notion: "da-cau-hinh", figma: "tat" });
  assert.deepEqual(parseCodex("không phải JSON"), {});
  assert.deepEqual(parseAgy("No MCP servers configured."), {});
  assert.deepEqual(parseAgy("notion: https://mcp.notion.com/mcp (http)\nfigma  https://mcp.figma.com/mcp"), { notion: "da-cau-hinh", figma: "da-cau-hinh" });
});

test("chính sách toàn quyền: Claude bị chặn nhóm gửi/triển khai và tạo/sửa/huỷ lịch Notion; xuất từng bước cho Nhật ký", () => {
  for (const x of ["mcp__claude_ai_Gmail", "mcp__claude_ai_Google_Calendar", "mcp__claude_ai_Zoom_for_Claude", "mcp__claude_ai_Composio", "mcp__claude_ai_Vercel", "mcp__claude_ai_AppDeploy", "mcp__claude_ai_Notion__notion-calendar-create-events"]) assert.ok(CHAN_CLAUDE.includes(x), x);
  assert.ok(!CHAN_CLAUDE.some((x) => /Notion$|Figma|Drive|Docs|Sheets|Slides|Canva/.test(x)), "kết nối đọc/làm việc không bị chặn");
  const a = fullAccessArgs(["claude", "-p", "{prompt}", "--output-format", "json", "--permission-mode", "acceptEdits"]);
  assert.deepEqual(a.slice(a.indexOf("--disallowedTools") + 1), CHAN_CLAUDE);
  assert.equal(a[a.indexOf("--output-format") + 1], "stream-json");
  assert.ok(a.includes("--verbose") && a.includes("--dangerously-skip-permissions"));
  const c = fullAccessArgs(["codex", "exec", "--json", "{prompt}"]);
  assert.ok(!c.includes("--disallowedTools") && !c.includes("stream-json"), "Codex không đổi");
});

function fakeConnectors(outputs) {
  const calls = [], logs = [];
  const run = (prog, args, opts, cb) => { const cmd = [prog, ...args].join(" "); calls.push([prog, ...args]); const key = Object.keys(outputs).find((k) => cmd.endsWith(k)); setImmediate(() => cb(null, key ? outputs[key] : "", "")); };
  const runner = { cliOf: (k) => ({ claude: ["claude"], codex: ["node", "codex.js"], agy: ["agy.exe"] })[k] };
  return { calls, c: createConnectors({ runner, audit: { log: (...a) => logs.push(a) }, dir: ".", run }), logs };
}

test("trang Kết nối: trạng thái từng AI, phòng dùng, nhóm bị chặn không có phòng; thêm cho Codex/Antigravity; đăng nhập Codex", async () => {
  const { c, calls, logs } = fakeConnectors({ "claude mcp list": CLAUDE_LIST, "mcp list --json": '[{"name":"notion","enabled":true}]', "agy.exe mcp list": "No MCP servers configured." });
  let s = await c.status();
  const row = (id) => s.rows.find((r) => r.id === id);
  assert.deepEqual(row("notion").ai, { claude: "da-ket-noi", codex: "da-cau-hinh", agy: "chua-co" });
  assert.deepEqual(row("notion").rooms, ["pain", "sakura", "itachi", "sasuke"]);
  assert.equal(row("gmail").chan, true); assert.deepEqual(row("gmail").rooms, [], "bị chặn thì không phòng nào dùng");
  assert.equal(row("google-drive").ai.codex, "khong-ho-tro");
  assert.deepEqual(row("blender").ai, { claude: "da-ket-noi", codex: "chua-co", agy: "chua-co" }, "MCP chạy trên máy hiện đúng hàng của app");
  assert.deepEqual(s.extra, []);
  await c.add("figma", "agy");
  assert.deepEqual(calls.at(-4), ["agy.exe", "mcp", "add", "figma", "https://mcp.figma.com/mcp"]);
  await c.add("canva", "codex");
  assert.ok(calls.some((x) => x.join(" ") === "node codex.js mcp add canva --url https://mcp.canva.com/mcp"));
  await assert.rejects(c.add("gmail", "codex"), (e) => e.code === "BAD_REQUEST" || e.code === "COMMAND_DENIED");
  await assert.rejects(c.add("vercel", "codex"), (e) => e.code === "COMMAND_DENIED");
  await assert.rejects(c.add("notion", "claude"), /codex hoặc agy/);
  await c.login("notion");
  assert.ok(calls.some((x) => x.join(" ") === "node codex.js mcp login notion"));
  assert.ok(logs.some((l) => l[1] === "mcp.add") && logs.some((l) => l[1] === "mcp.login"));
});

test("nhật ký: đọc câu nói, lệnh, file sửa của Codex/Claude/Antigravity; dòng thời gian mới nhất trên cùng", () => {
  assert.deepEqual(parseLine('{"type":"item.completed","item":{"type":"agent_message","text":"Đã sửa lỗi đăng nhập"}}'), [{ kind: "noi", text: "Đã sửa lỗi đăng nhập" }]);
  assert.deepEqual(parseLine('{"type":"item.completed","item":{"type":"command_execution","command":"npm test","exit_code":1}}'), [{ kind: "loi", text: "Chạy lệnh npm test (lỗi 1)" }]);
  assert.deepEqual(parseLine('{"type":"assistant","message":{"content":[{"type":"text","text":"Xem code"},{"type":"tool_use","name":"Edit","input":{"file_path":"C:\\\\repo\\\\src\\\\app.js"}},{"type":"tool_use","name":"mcp__claude_ai_Notion__notion-search","input":{}}]}}'),
    [{ kind: "noi", text: "Xem code" }, { kind: "sua", text: "Sửa src/app.js" }, { kind: "lenh", text: "Dùng kết nối Notion · notion-search" }]);
  assert.deepEqual(parseLine('{"type":"message","role":"assistant","text":"Viết đặc tả"}'), [{ kind: "noi", text: "Viết đặc tả" }]);
  assert.deepEqual(parseLine("chữ thường"), []);

  const LOG = { j1: '{"type":"item.completed","item":{"type":"agent_message","text":"Bắt đầu viết code"}}\n{"type":"item.completed","item":{"type":"agent_message","text":"token=abc123secret xong"}}\n', j2: '{"type":"assistant","message":{"content":[{"type":"text","text":"Đang kiểm duyệt"}]}}\n' };
  const JOBS = { j1: { id: "j1", status: "done", started_at: 1000, ended_at: 5000 }, j2: { id: "j2", status: "running", started_at: 6000 } };
  const jobs = { get: (id) => JOBS[id], readLog: (id, from) => { const t = LOG[id].slice(Number(from) || 0); return { text: t, next: LOG[id].length, size: LOG[id].length }; } };
  const runs = [{ workspace: "W", task: "Làm trang đăng nhập", status: "awaiting_approval", createdAt: 500, steps: [{ jobId: "j1", role: "CODEX_ASTRA_DEV", startedAt: 1000, model: "gpt-6-astra" }, { jobId: "j2", role: "CLAUDE_AUDITOR", startedAt: 6000 }] },
    { workspace: "KHAC", task: "dự án khác", status: "running", createdAt: 400, steps: [] }];
  const j = createJournal({ jobs, autopilot: { list: () => runs } });
  const items = j.list("W");
  assert.equal(items[0].kind, "cho-duyet");
  assert.deepEqual(items.map((x) => x.who + ":" + x.text).slice(1), [
    "sakura:Đang kiểm duyệt", "sakura:CLAUDE_AUDITOR bắt đầu lượt", "sasuke:CODEX_ASTRA_DEV xong lượt", "sasuke:token=‹ẩn› xong", "sasuke:Bắt đầu viết code",
    "sasuke:CODEX_ASTRA_DEV bắt đầu lượt · gpt-6-astra", "pain:Pain nhận việc: Làm trang đăng nhập"]);
  assert.ok(!items.some((x) => /dự án khác/.test(x.text)), "chỉ nhật ký của dự án đang chọn");
  assert.ok(items.find((x) => x.text === "Bắt đầu viết code").at === 5000, "lượt đã xong lấy giờ kết thúc");
  assert.equal(j.list("W", 2).length, 2);
});

test("thêm kết nối mà Codex tự mở đăng nhập OAuth rồi hết giờ chờ: vẫn tính là đã thêm; lỗi khác thì báo", async () => {
  const runner = { cliOf: (k) => ({ claude: ["claude"], codex: ["codex"], agy: ["agy"] })[k] };
  const mk = (out) => createConnectors({ runner, audit: { log() {} }, dir: ".", run: (p, a, o, cb) => setImmediate(() => a.includes("add") ? cb(new Error("timeout"), out, "") : cb(null, a.includes("--json") ? "[{\"name\":\"notion\",\"auth_status\":\"not_logged_in\"}]" : "", "")) });
  const s = await mk("Starting OAuth flow…\nAuthorize `notion` by opening this URL in your browser").add("notion", "codex");
  assert.equal(s.rows.find((r) => r.id === "notion").ai.codex, "can-dang-nhap");
  await assert.rejects(mk("error: invalid url").add("notion", "codex"), /lỗi: error: invalid url/);
});
