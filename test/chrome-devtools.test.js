"use strict";
// Chrome DevTools MCP (ctl/chrome-devtools.js): ghim bản, chạy an toàn, chỉ gắn vào lượt của phòng được bật.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cdt = require("../ctl/chrome-devtools");
const phong = require("../ctl/mcp-phong");
const { withMcp, fullAccessArgs } = require("../ctl/runner");
const { createConnectors } = require("../ctl/ket-noi");

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-cdt-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
// Giả lập bản đã cài: đúng cấu trúc npm --prefix tạo ra
function giaCai(dir, version = cdt.PHIEN_BAN) {
  const g = path.join(cdt.thuMuc(dir), "node_modules", cdt.GOI);
  fs.mkdirSync(path.join(g, "build/src/bin"), { recursive: true });
  fs.writeFileSync(path.join(g, "package.json"), JSON.stringify({ name: cdt.GOI, version, bin: { [cdt.GOI]: "./build/src/bin/chrome-devtools-mcp.js" } }));
  fs.writeFileSync(path.join(g, "build/src/bin/chrome-devtools-mcp.js"), "");
}
const CLAUDE = ["claude", "-p", "{prompt}", "--output-format", "json", "--allowedTools", "Read", "Edit"];
const CODEX = ["codex", "exec", "--json", "{prompt}"];

test("ghim bản đã qua 2 tuần, cờ chạy an toàn: Chrome ẩn, hồ sơ tạm, không gửi thống kê/CrUX, không mở file:", () => {
  assert.match(cdt.PHIEN_BAN, /^\d+\.\d+\.\d+$/, "bản cụ thể, không @latest");
  for (const f of ["--headless", "--isolated", "--no-usage-statistics", "--no-performance-crux", "--no-file-navigations", "--redactNetworkHeaders"]) assert.ok(cdt.CO.includes(f), f);
  assert.ok(!cdt.CO.some((f) => /autoConnect|browserUrl|userDataDir|experimentalDevtools|allowUnrestrictedPaths/.test(f)), "không nối vào Chrome thật của CEO, không mở rộng quyền");
});

test("trạng thái: chưa cài, cài đúng bản, bản cũ; lệnh chạy bằng node + file của gói (không npx)", (t) => {
  const dir = tmp(t);
  assert.equal(cdt.trangThai(dir).daCai, false);
  assert.equal(cdt.lenh(dir), null);
  giaCai(dir, "1.0.0");
  assert.deepEqual([cdt.trangThai(dir).daCai, cdt.trangThai(dir).dungBan], [true, false]);
  giaCai(dir);
  const l = cdt.lenh(dir, "C:\\node\\node.exe");
  assert.equal(l.command, "C:/node/node.exe");
  assert.match(l.args[0], /node_modules\/chrome-devtools-mcp\/build\/src\/bin\/chrome-devtools-mcp\.js$/);
  assert.deepEqual(l.args.slice(1), cdt.CO);
  assert.ok(!JSON.stringify(l).includes("npx"));
});

test("chỉ gắn vào lượt của phòng được bật và khi máy đã cài; Antigravity không dùng được", (t) => {
  const dir = tmp(t);
  assert.ok(phong.MAC_DINH.sakura.includes("chrome-devtools"), "mặc định Sakura (kiểm duyệt) dùng");
  assert.ok(phong.hopLe("chrome-devtools", "sasuke") && !phong.hopLe("chrome-devtools", "kakashi"), "Codex được, Antigravity chạy nền chưa nạp MCP");
  // Chưa cài: không gắn gì
  assert.ok(!withMcp(CLAUDE, "CLAUDE_AUDITOR", dir).includes("--mcp-config"));
  giaCai(dir);
  const c = withMcp(fullAccessArgs(CLAUDE), "CLAUDE_AUDITOR", dir);
  const cfg = JSON.parse(fs.readFileSync(c[c.indexOf("--mcp-config") + 1], "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers), ["chrome-devtools"]);
  assert.ok(cfg.mcpServers["chrome-devtools"].args.includes("--isolated"));
  assert.ok(phong.note("CLAUDE_AUDITOR", dir).includes("KHÔNG đăng nhập tài khoản thật"), "lời giao việc nhắc cách dùng an toàn");
  const ca = withMcp(CLAUDE, "CLAUDE_AUDITOR", dir);
  assert.ok(ca.slice(ca.indexOf("--allowedTools") + 1).includes("mcp__chrome-devtools"), "chế độ hạn chế: cho phép công cụ của máy chủ");
  // Phòng chưa bật (Sasuke mặc định không có) thì không gắn
  assert.ok(!withMcp(CODEX, "CODEX_ASTRA_DEV", dir).some((x) => /chrome_devtools/.test(x)));
  phong.save(dir, "sasuke", ["supabase", "chrome-devtools"]);
  const x = withMcp(CODEX, "CODEX_ASTRA_DEV", dir);
  assert.ok(x.includes('mcp_servers.chrome_devtools.tool_timeout_sec=180'));
  assert.ok(x.some((a) => /^mcp_servers\.chrome_devtools\.args=\[".*chrome-devtools-mcp\.js","--headless"/.test(a)));
  assert.ok(x.indexOf("{prompt}") > x.findIndex((a) => a.startsWith("mcp_servers.chrome_devtools")), "cờ nằm trước prompt");
  // CEO tắt cho Sakura
  phong.save(dir, "sakura", ["notion"]);
  assert.ok(!withMcp(CLAUDE, "CLAUDE_AUDITOR", dir).includes("--mcp-config"));
  assert.throws(() => phong.save(dir, "kakashi", ["chrome-devtools"]), /không dùng được/);
});

test("đã có khóa tra cứu: Claude nhận một file cấu hình gộp cả hai máy chủ", (t) => {
  const dir = tmp(t);
  giaCai(dir);
  fs.writeFileSync(path.join(dir, "keys.json"), JSON.stringify({ gemini: "AIza" + "x".repeat(35) }));
  const c = withMcp(CLAUDE, "CLAUDE_AUDITOR", dir);
  assert.equal(c.filter((a) => a === "--mcp-config").length, 1);
  const cfg = JSON.parse(fs.readFileSync(c[c.indexOf("--mcp-config") + 1], "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), ["chrome-devtools", "tra-cuu"]);
  assert.doesNotMatch(JSON.stringify(cfg), /AIza/);
});

test("trang Kết nối: hiện trạng thái cài trên máy; nút Cài chỉ nhận đúng kết nối này", async (t) => {
  const dir = tmp(t);
  const run = (cmd, args, o, cb) => cb(null, "", "");   // CLI giả: không có kết nối nào
  const k = createConnectors({ runner: { cliOf: (x) => [x] }, audit: { log() {} }, dir, run });
  let row = (await k.status()).rows.find((r) => r.id === "chrome-devtools");
  assert.deepEqual([row.may, row.ai.claude, row.ai.codex, row.ai.agy], [true, "chua-co", "chua-co", "khong-ho-tro"]);
  assert.deepEqual(row.coTheGiao.sort(), ["itachi", "sakura", "sasuke"]);
  giaCai(dir, "1.0.0");
  row = (await k.status()).rows.find((r) => r.id === "chrome-devtools");
  assert.equal(row.ai.claude, "cu");
  giaCai(dir);
  row = (await k.status()).rows.find((r) => r.id === "chrome-devtools");
  assert.equal(row.ai.claude, "da-cau-hinh");
  assert.deepEqual(row.ready, { sakura: true });
  await assert.rejects(k.caiMay("notion"), /Không có kết nối chạy trên máy/);
});

test("cài: đúng gói, đúng bản, không chạy script cài; lỗi thì báo rõ", async (t) => {
  const dir = tmp(t);
  let goi = null;
  const ok = await cdt.cai(dir, { npm: "npm", run: (cmd, args, o, cb) => { goi = args; giaCai(dir); cb(null, "", ""); } });
  assert.equal(ok.phienBan, cdt.PHIEN_BAN);
  assert.ok(goi.includes(`chrome-devtools-mcp@${cdt.PHIEN_BAN}`) && goi.includes("--ignore-scripts") && goi.includes("--save-exact"));
  assert.ok(!goi.some((a) => /@latest/.test(a)));
  const dir2 = tmp(t);
  await assert.rejects(cdt.cai(dir2, { npm: "npm", run: (cmd, args, o, cb) => cb(new Error("x"), "", "npm ERR! network") }), /network/);
});
