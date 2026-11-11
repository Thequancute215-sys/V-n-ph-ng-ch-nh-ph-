"use strict";
// CEO yêu cầu 07/11/2026: kết nối là của chung, nhưng mỗi phòng chỉ bật vài kết nối đúng phần việc.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const phong = require("../ctl/mcp-phong");
const { withMcp, fullAccessArgs } = require("../ctl/runner");
const { CHAN_CLAUDE } = require("../ctl/ket-noi-danh-muc");
const { createConnectors } = require("../ctl/ket-noi");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vp-mcp-"));
const CLAUDE = ["claude", "-p", "{prompt}", "--output-format", "json", "--permission-mode", "acceptEdits"];
const CODEX = ["codex", "exec", "--json", "{prompt}"];

test("mặc định theo phần việc; lưu được; chặn kết nối phòng không dùng được hoặc nhóm gửi", () => {
  const dir = tmp();
  const g = phong.read(dir);
  assert.deepEqual(Object.keys(g), ["hinata", "itachi", "sasuke", "kakashi", "sakura"], "Pain chỉ báo cáo, không có kết nối");
  assert.ok(g.kakashi.includes("figma") && !g.kakashi.includes("supabase"), "Kakashi dựng giao diện theo bản thiết kế, không động vào CSDL");
  assert.equal(phong.ROLE_PHONG("FRONTEND_UIUX_DEV"), "kakashi");
  assert.ok(g.hinata.includes("figma") && !g.hinata.includes("supabase"));
  assert.ok(g.sakura.includes("google-docs") && !g.sasuke.includes("google-docs"), "Google chỉ Claude dùng được");
  assert.throws(() => phong.save(dir, "sasuke", ["google-docs"]), /không dùng được: google-docs/);
  assert.throws(() => phong.save(dir, "sakura", ["gmail"]), /gmail/);
  assert.throws(() => phong.save(dir, "pain", ["notion"]), /không chạy lượt/);
  phong.save(dir, "sasuke", ["supabase", "supabase", "figma"]);
  assert.deepEqual(phong.read(dir).sasuke, ["supabase", "figma"]);
  assert.deepEqual(phong.read(dir).itachi, phong.MAC_DINH.itachi, "phòng khác giữ mặc định");
});

test("Claude toàn quyền: một --disallowedTools gồm chặn gửi + kết nối không thuộc phòng (kể cả kết nối ngoài danh mục)", () => {
  const dir = tmp();
  phong.save(dir, "sakura", ["notion", "google-docs"]);
  const a = withMcp(fullAccessArgs(CLAUDE), "CLAUDE_AUDITOR", dir, { claude: ["claude.ai Notion", "claude.ai Blaze SQL", "capcut"] });
  assert.equal(a.filter((x) => x === "--disallowedTools").length, 1);
  const off = a.slice(a.indexOf("--disallowedTools") + 1);
  for (const x of CHAN_CLAUDE) assert.ok(off.includes(x), "vẫn chặn gửi: " + x);
  for (const x of ["mcp__claude_ai_Figma", "mcp__claude_ai_Supabase", "mcp__claude_ai_Google_Drive", "mcp__claude_ai_Cloudflare_Developer_Platform", "mcp__claude_ai_Blaze_SQL", "mcp__capcut"]) assert.ok(off.includes(x), "tắt " + x);
  for (const x of ["mcp__claude_ai_Notion", "mcp__claude_ai_Google_Docs"]) assert.ok(!off.includes(x), "giữ " + x);
  assert.ok(a.includes("--dangerously-skip-permissions") && a.includes("{prompt}"));
  // Không toàn quyền: vẫn chỉ bật kết nối của phòng
  const b = withMcp(CLAUDE, "CLAUDE_AUDITOR", dir, {});
  assert.ok(b.includes("--disallowedTools") && b.includes("mcp__claude_ai_Figma") && !b.includes("mcp__claude_ai_Notion"));
});

test("Codex: tắt app kết nối ChatGPT và server đã cấu hình không thuộc phòng; server lạ của Codex giữ nguyên", () => {
  const dir = tmp();
  phong.save(dir, "sasuke", ["figma", "supabase"]);
  const a = withMcp(fullAccessArgs(CODEX), "CODEX_ASTRA_DEV", dir, { codex: ["canva", "figma", "notion", "supabase", "cua_repl"] });
  const at = a.indexOf("exec");
  assert.deepEqual(a.slice(at + 1, at + 7), ["-c", "features.apps=false", "-c", "mcp_servers.canva.enabled=false", "-c", "mcp_servers.notion.enabled=false"]);
  assert.ok(!a.some((x) => /figma|supabase|cua_repl/.test(x)));
  assert.ok(a.includes("--dangerously-bypass-approvals-and-sandbox"));
  // Itachi (Sol) theo phòng Kiến trúc
  const s = withMcp(CODEX, "SOL_ARCHITECT_PLANNER", dir, { codex: ["canva", "figma", "notion"] });
  assert.ok(s.includes("mcp_servers.figma.enabled=false") && !s.includes("mcp_servers.notion.enabled=false"));
  // Chưa đọc được danh sách Codex: không tắt server nào (tắt server chưa khai báo làm Codex lỗi), vẫn tắt app ChatGPT
  assert.deepEqual(withMcp(CODEX, "CODEX_ASTRA_DEV", dir, {}).slice(0, 4), ["codex", "exec", "-c", "features.apps=false"]);
});

test("Antigravity và vai không thuộc phòng giữ nguyên lệnh; lời giao việc nêu kết nối của phòng", () => {
  const dir = tmp();
  const agy = ["agy", "-p", "{prompt}"];
  assert.deepEqual(withMcp(agy, "SPEC_ARCHITECT", dir, {}), agy);
  assert.match(phong.note("SPEC_ARCHITECT", dir), /Figma, Canva, Webflow, Notion/);
  assert.equal(phong.note("BAO_CAO", dir), "");
  phong.save(dir, "itachi", []);
  assert.match(phong.note("SOL_ARCHITECT_ADVISOR", dir), /không có/);
});

test("trang Kết nối: phòng được giao, đã sẵn sàng chưa, phòng có thể giao; CEO bật/tắt cho phòng", async () => {
  const dir = tmp(), logs = [];
  const out = { "claude mcp list": "claude.ai Notion: https://mcp.notion.com/mcp - √ Connected", "mcp list --json": '[{"name":"notion","enabled":true,"auth_status":"not_logged_in"},{"name":"supabase","enabled":true,"auth_status":"o_auth"}]', "agy mcp list": "" };
  const run = (prog, args, opts, cb) => { const cmd = [prog, ...args].join(" "); const k = Object.keys(out).find((x) => cmd.endsWith(x)); setImmediate(() => cb(null, k ? out[k] : "", "")); };
  const c = createConnectors({ runner: { cliOf: (k) => [k === "agy" ? "agy" : k] }, audit: { log: (...a) => logs.push(a) }, dir, run });
  let s = await c.status();
  const row = (id) => s.rows.find((r) => r.id === id);
  assert.deepEqual(row("notion").rooms, ["hinata", "itachi", "sakura"]);
  assert.deepEqual(row("notion").ready, { hinata: false, itachi: false, sakura: true }, "Codex chưa đăng nhập Notion");
  assert.deepEqual(row("google-docs").coTheGiao, ["sakura"]);
  assert.deepEqual(row("gmail").coTheGiao, []);
  assert.deepEqual(c.known(), { claude: ["claude.ai Notion"], codex: ["notion", "supabase"] });
  s = await c.setPhong("sasuke", ["notion"]);
  assert.deepEqual(s.phong.sasuke, ["notion"]);
  assert.ok(row("notion").rooms.includes("sasuke") || s.rows.find((r) => r.id === "notion").rooms.includes("sasuke"));
  assert.ok(logs.some((l) => l[1] === "mcp.phong"));
  await assert.rejects(c.setPhong("sasuke", ["google-docs"]), /không dùng được/);
});
