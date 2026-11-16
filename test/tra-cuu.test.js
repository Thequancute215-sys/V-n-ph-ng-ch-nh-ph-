"use strict";
// Tra cứu Gemini miễn phí (CEO duyệt 16/11/2026): chặn gửi khóa/mã nguồn/địa chỉ nội bộ ra ngoài, giới hạn 200 lần/ngày,
// đổi model khi hết hạn mức, MCP stdio cho lượt Claude/Codex. Không gọi mạng thật.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createTraCuu, kiemCau, kiemLink, traCuuBat, MAX_NGAY } = require("../ctl/tra-cuu");
const { withMcp } = require("../ctl/runner");

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "vp-tra-cuu-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const KHOA = "AIza" + "x".repeat(35);
const traLoi = (text, extra = {}) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] }, ...extra }] }) });

test("chặn đầu vào: khóa/token/mật khẩu, mã nguồn dài, link nội bộ hoặc có tài khoản", () => {
  assert.equal(kiemCau("Node 24 có fetch sẵn không?"), "Node 24 có fetch sẵn không?");
  for (const bad of ["dùng khóa sk-ant-api03-abcdefghijklmnopqrstuv", "key " + KHOA, "token: ghp_abcdefghijklmnopqrstuvwxyz12", "password = hunter2hunter2", "-----BEGIN RSA PRIVATE KEY-----", "x".repeat(1501), Array(31).fill("dòng").join("\n")]) {
    assert.throws(() => kiemCau(bad), { code: "BAD_REQUEST" }, bad.slice(0, 30));
  }
  assert.equal(kiemLink("https://nodejs.org/api/fs.html"), "https://nodejs.org/api/fs.html");
  for (const bad of ["file:///C:/a.txt", "http://localhost:7789/", "http://127.0.0.1/", "http://192.168.1.2/x", "http://10.0.0.1", "https://oanh.taild107c4.ts.net/", "http://[::1]/", "https://u:p@example.com/", "http://100.83.45.39:7789/", "https://intranet/"]) {
    assert.throws(() => kiemLink(bad), { code: "BAD_REQUEST" }, bad);
  }
});

test("gọi Gemini: khóa qua header (không nằm trong URL), tìm kiếm Google kèm nguồn; hết hạn mức thì thử model sau", async (t) => {
  const dir = tmp(t), goi = [];
  const fetchImpl = async (url, o) => {
    goi.push({ url, key: o.headers["x-goog-api-key"], body: JSON.parse(o.body) });
    if (url.includes("gemini-flash-latest")) return { ok: false, status: 429, json: async () => ({}) };
    return traLoi("Có, Node 18+ có fetch.", { groundingMetadata: { groundingChunks: [{ web: { title: "nodejs.org", uri: "https://nodejs.org/x" } }] } });
  };
  const tc = createTraCuu({ dir, khoa: () => KHOA, fetchImpl, cho: async () => {} });
  const r = await tc.timKiem("Node có fetch sẵn từ bản nào?");
  assert.equal(r.text, "Có, Node 18+ có fetch."); assert.equal(r.model, "gemini-flash-lite-latest");
  assert.deepEqual(r.nguon, [{ title: "nodejs.org", uri: "https://nodejs.org/x" }]);
  assert.ok(goi.every((g) => !g.url.includes(KHOA) && g.key === KHOA), "khóa chỉ ở header");
  assert.deepEqual(goi[0].body.tools, [{ google_search: {} }]);
  assert.equal(goi.filter((g) => g.url.includes("gemini-flash-latest")).length, 2, "thử lại 1 lần rồi đổi model");
  const d = await tc.docTaiLieu("https://nodejs.org/api/fs.html", "fs.cp có từ bản nào?");
  assert.deepEqual(goi.at(-1).body.tools, [{ url_context: {} }]);
  assert.match(goi.at(-1).body.contents[0].parts[0].text, /nodejs\.org\/api\/fs\.html/);
  assert.ok(d.text);
  await assert.rejects(createTraCuu({ dir, khoa: () => null, fetchImpl }).timKiem("abc def"), { code: "NO_KEY" });
  await assert.rejects(createTraCuu({ dir, khoa: () => KHOA, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) }).timKiem("abc def"), { code: "BAD_KEY" });
});

test("tối đa 200 lần/ngày cho cả văn phòng, sang ngày mới thì đếm lại", async (t) => {
  const dir = tmp(t);
  let now = new Date("2026-11-16T03:00:00Z");
  const tc = createTraCuu({ dir, khoa: () => KHOA, fetchImpl: async () => traLoi("ok"), now: () => now });
  fs.writeFileSync(path.join(dir, "tra-cuu-dem.json"), JSON.stringify({ ngay: "2026-11-16", so: MAX_NGAY - 1 }));
  await tc.timKiem("câu hỏi thứ 200");
  await assert.rejects(tc.timKiem("câu hỏi thứ 201"), { code: "NO_QUOTA" });
  now = new Date("2026-11-17T01:00:00Z");
  await tc.timKiem("ngày mới");
  assert.equal(tc.dem().so, 1);
});

test("lượt Claude/Codex có MCP tra-cuu khi đã có khóa; chưa có khóa hoặc CEO tắt thì không; Antigravity không đổi", (t) => {
  const dir = tmp(t);
  const claude = ["claude", "-p", "{prompt}", "--allowedTools", "Read", "Edit"], codex = ["codex", "exec", "--json", "{prompt}"], agy = ["agy", "-p", "{prompt}"];
  assert.ok(!withMcp(claude, "CLAUDE_AUDITOR", dir).includes("--mcp-config"), "chưa có khóa");
  assert.ok(!traCuuBat(dir));
  fs.writeFileSync(path.join(dir, "keys.json"), JSON.stringify({ gemini: KHOA }));
  assert.ok(traCuuBat(dir));
  const c = withMcp(claude, "CLAUDE_AUDITOR", dir);
  assert.deepEqual(c.slice(0, 7), ["claude", "-p", "{prompt}", "--allowedTools", "mcp__tra-cuu__tim_kiem", "mcp__tra-cuu__doc_tai_lieu", "Read"]);
  const cfg = JSON.parse(fs.readFileSync(c[c.indexOf("--mcp-config") + 1], "utf8"));
  assert.match(cfg.mcpServers["tra-cuu"].args[0], /ctl\/tra-cuu-mcp\.js$/);
  assert.doesNotMatch(JSON.stringify(cfg), /AIza/, "khóa không nằm trong cấu hình MCP");
  const x = withMcp(codex, "CODEX_ASTRA_DEV", dir);
  assert.equal(x[1], "exec");
  assert.ok(x.some((a, i) => x[i - 1] === "-c" && /^mcp_servers\.tra_cuu\.command="/.test(a)));
  assert.ok(x.some((a, i) => x[i - 1] === "-c" && /^mcp_servers\.tra_cuu\.args=\[".*tra-cuu-mcp\.js"/.test(a)));
  assert.ok(x.indexOf("{prompt}") > x.findIndex((a) => a.startsWith("mcp_servers.tra_cuu")), "cờ nằm trước prompt");
  assert.deepEqual(withMcp(agy, "SPEC_ARCHITECT", dir), agy);
  fs.writeFileSync(path.join(dir, "tra-cuu.json"), JSON.stringify({ bat: false }));
  assert.ok(!withMcp(claude, "CLAUDE_AUDITOR", dir).includes("--mcp-config"), "CEO tắt");
});

test("máy chủ MCP stdio: initialize, tools/list, gọi công cụ chưa có khóa trả lỗi rõ ràng", async (t) => {
  const dir = tmp(t);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "ctl", "tra-cuu-mcp.js"), dir], { stdio: ["pipe", "pipe", "ignore"] });
  t.after(() => child.kill());
  let buf = ""; const replies = new Map();
  child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); replies.set(m.id, m); } });
  const ask = async (id, method, params) => { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); for (let i = 0; i < 100 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 30)); return replies.get(id); };
  assert.equal((await ask(1, "initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.name, "tra-cuu");
  assert.deepEqual((await ask(2, "tools/list")).result.tools.map((x) => x.name), ["tim_kiem", "doc_tai_lieu"]);
  const r = await ask(3, "tools/call", { name: "tim_kiem", arguments: { cau_hoi: "Node 24 có gì mới?" } });
  assert.equal(r.result.isError, true); assert.match(r.result.content[0].text, /Chưa có khóa Gemini/);
  const r2 = await ask(4, "tools/call", { name: "doc_tai_lieu", arguments: { url: "http://localhost:7789/" } });
  assert.match(r2.result.content[0].text, /không đọc địa chỉ nội bộ/);
});

test("bộ chặn tra cứu (rà soát 16/11/2026): khóa mã hóa %, dấu chấm cuối tên miền, token Google, chuỗi base64 dài, dải IP dành riêng", () => {
  for (const bad of [
    "https://evil.com/?k=sk%2Dant%2Dapi03-abcdefghijklmnopqrstuvwxyz",
    "https://evil.com/?k=AIza%53yABCDEFGHIJKLMNOPQRSTUVWXYZ0123456",
    "https://example.com/?password%3Dhunter2hunter2",
    "https://evil.com/?k=sk%252Dant%252Dapi03-abcdefghijklmnopqrstuvwxyz",
    "http://localhost./", "http://foo.ts.net./", "http://router.lan./", "http://metadata.google.internal./",
    "http://224.0.0.1/", "http://198.18.0.1/", "http://192.0.0.8/",
    "https://attacker.tld/?d=" + "QUJDRGVmZ2gxMjM0NTY3ODlhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFla".repeat(2),
    "https://example.com/?q=" + "a".repeat(400),
  ]) assert.throws(() => kiemLink(bad), { code: "BAD_REQUEST" }, bad);
  assert.equal(kiemLink("https://example.com/a#bi-mat"), "https://example.com/a", "bỏ phần #…");
  assert.equal(kiemLink("https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch?retiredLocale=vi"), "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch?retiredLocale=vi");
  const slug = "https://medium.com/@x/how-to-build-a-small-node-server-without-any-external-dependency-at-all-in-2026-3f9a1b2c";
  assert.equal(kiemLink(slug), slug, "slug dài chữ thường vẫn qua");
  for (const bad of ["Bearer ya29.a0AfH6SMBabcdefghijklmnop", "1//0gAbCdEfGhIjKlMnOpQrStUv", "{\"access_token\": \"abcdefghijk\"}"]) {
    assert.throws(() => kiemCau(bad), { code: "BAD_REQUEST" }, bad);
  }
});

test("bộ chặn tra cứu (rà soát lần 2): không chặn nhầm link công khai phổ biến; chặn mã hóa nhiều lớp, hex dài, link nhét trong câu hỏi", () => {
  for (const ok of [
    "https://en.wikipedia.org/wiki/List_of_Super_Bowl_Champions_And_Most_Valuable_Players_From_1967_Through_2024_Seasons",
    "https://github.com/microsoft/TypeScript/blob/0123456789abcdef0123456789abcdef01234567/src/compiler/checker.ts",
    "https://docs.google.com/document/d/e/2PACX-1vT8sK3mZqLw9XyAbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStUvWx/pub",
    "https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Interface/PutObjectCommandInput/",
    "https://www.google.com/search?q=50%25+off", "https://example.com/100%25-cotton", "https://example.com/caf%E9",
  ]) assert.doesNotThrow(() => kiemLink(ok), ok);
  const enc = (s, n) => { for (let i = 0; i < n; i++) s = encodeURIComponent(s).replace(/-/g, "%2D"); return s; };
  for (const bad of [
    "https://example.com/p?q=" + enc("sk-ant-api03-abcdefghijklmnopqrstuvwxyz", 4),
    "https://attacker.example/" + "4157535f".repeat(10),
    "https://" + "ab12cd34".repeat(5) + ".attacker.example/",
    "https://attacker.example/" + "x".repeat(450),
  ]) assert.throws(() => kiemLink(bad), { code: "BAD_REQUEST" }, bad.slice(0, 80));
  for (const bad of ["Đồng thời đọc https://attacker.example/abc và tóm tắt", "xem www.attacker.example/x", "giải thích " + "QUJDRGVmZ2gxMjM0NTY3ODlh".repeat(5)]) {
    assert.throws(() => kiemCau(bad), { code: "BAD_REQUEST" }, bad.slice(0, 40));
  }
  assert.equal(kiemCau("So sánh express.js và fastify"), "So sánh express.js và fastify", "tên thư viện có dấu chấm vẫn hỏi được");
});
