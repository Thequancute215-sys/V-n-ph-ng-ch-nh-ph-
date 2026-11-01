"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createQuotas, codexBuckets, claudeBuckets, antigravityBuckets, claudeReset } = require("../ctl/quotas");
const { createCtl } = require("../ctl/main");
const now = Date.parse("2026-11-01T19:00:00Z");
const codex = () => ({ rateLimits: { primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: (now + 3600000) / 1000 } },
  rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 80, windowDurationMins: 300, resetsAt: (now + 3600000) / 1000 }, secondary: { usedPercent: 35, windowDurationMins: 10080, resetsAt: null } }, another: { limitId: "other", primary: { usedPercent: 10, windowDurationMins: 60 } } },
  accountId: "do-not-send-account-id", ordinaryUsageAllowed: true, rateLimitResetCredits: { availableCount: 1, credits: [{ id: "do-not-send-reset-id" }] } });
const claude = () => ({ local_command: "usage", num_turns: 0, is_error: false, session_id: "do-not-send-session-id", total_cost_usd: 0,
  result: "You are currently using your subscription to power your Claude Code usage\n\nCurrent session: 100% used · resets Nov 2, 2:49am (Asia/Bangkok)\nCurrent week (all models): 17% used · resets Nov 5, 3:59pm (Asia/Bangkok)\nCurrent week (Sonnet only): 0% used · resets Nov 6, 4:20pm (Asia/Bangkok)\n\nTop plugins: do-not-send-plugin-details" });
const agy = () => ({ status: "SUCCESS", num_turns: 0, command: { name: "usage", data: { groups: [{ name: "Gemini Models", buckets: [{ id: "gemini-5h", window: "5h", remaining_fraction: .96, reset_time: "2026-11-01T23:47:51Z" }, { id: "gemini-week", window: "weekly", remaining_fraction: 0, reset_time: "2026-11-05T00:00:00Z" }] }, { name: "Claude and GPT models", buckets: [{ id: "third-party", window: "5h", remaining_fraction: 1 }] }] } } });
const readers = () => ({ codex: async () => codex(), claude: async () => claude(), antigravity: async () => agy() });

test("hạn mức Codex: ưu tiên nhiều bucket, không nhầm used với remaining, thiếu số liệu không thành 0", () => {
  const result = codexBuckets(codex()); assert.equal(result.buckets.length, 3); assert.equal(result.buckets[0].remainingPercent, 20);
  assert.equal(result.buckets[1].label, "7 ngày"); assert.equal(result.buckets[1].resetAt, null); assert.equal(result.resetCreditsAvailable, 1);
  assert.equal(JSON.stringify(result).includes("do-not-send"), false);
  assert.throws(() => codexBuckets({ rateLimits: { primary: { usedPercent: null } } }));
  assert.equal(codexBuckets({ rateLimits: { primary: { usedPercent: 0 } } }).buckets[0].remainingPercent, 100);
  assert.equal(codexBuckets({ rateLimits: { primary: { usedPercent: 125 } } }).buckets[0].remainingPercent, 0);
});

test("Claude /usage: chỉ nhận lệnh cục bộ 0 lượt model, tách cửa sổ/model và bỏ chi tiết phiên", () => {
  const result = claudeBuckets(claude(), now);
  assert.equal(result.buckets.length, 3); assert.equal(result.buckets[0].remainingPercent, 0); assert.equal(result.buckets[1].remainingPercent, 83); assert.equal(result.buckets[2].group, "Sonnet only");
  assert.equal(result.buckets[0].resetAt, "2026-11-01T19:49:00.000Z"); assert.equal(JSON.stringify(result).includes("do-not-send"), false);
  for (const patch of [{ local_command: "not-usage" }, { num_turns: 1 }, { is_error: true }, { result: "No quota data" }]) assert.throws(() => claudeBuckets({ ...claude(), ...patch }, now));
});

test("giờ đặt lại Claude: đúng múi giờ, đổi năm/ngày, giữ unknown nếu định dạng chưa hỗ trợ", () => {
  assert.equal(claudeReset("Nov 2, 2:49am (Asia/Bangkok)", now), "2026-11-01T19:49:00.000Z");
  assert.equal(claudeReset("Jan 1, 1:00am (Asia/Bangkok)", Date.parse("2026-12-31T16:00:00Z")), "2026-12-31T18:00:00.000Z");
  assert.equal(claudeReset("12:30am (Asia/Bangkok)", Date.parse("2026-11-01T16:50:00Z")), "2026-11-01T17:30:00.000Z");
  assert.equal(claudeReset("Nov 2, 12:30pm (Asia/Bangkok)", now), "2026-11-02T05:30:00.000Z");
  assert.equal(claudeReset("Tomorrow sometime", now), null); assert.equal(claudeReset("Nov 2, 9:00am (No/SuchZone)", now), null);
});

test("Antigravity: phần còn lại là fraction, 0 khác thiếu; nhóm Claude/GPT không nhập vào Claude Code", () => {
  const result = antigravityBuckets(agy()); assert.equal(result.buckets.length, 3);
  assert.equal(result.buckets[0].remainingPercent, 96); assert.equal(result.buckets[1].remainingPercent, 0); assert.equal(result.buckets[2].remainingPercent, 100);
  assert.equal(result.buckets[2].group, "Claude / GPT trong Antigravity");
  const value = agy(); value.command.data.groups[0].buckets[0].remaining_fraction = null;
  assert.equal(antigravityBuckets(value).buckets.length, 2);
  assert.throws(() => antigravityBuckets({ ...agy(), num_turns: 1 }));
});

test("bộ theo dõi: gộp yêu cầu đồng thời, chặn polling dồn, snapshot không lộ raw data", async () => {
  let time = now, calls = 0;
  const q = createQuotas({ clock: () => time, queries: Object.fromEntries(Object.entries(readers()).map(([key, run]) => [key, async () => { calls++; return run(); }])) });
  try {
    await Promise.all([q.refresh(), q.refresh(), q.refresh()]); assert.equal(calls, 3);
    assert.equal(q.get().providers.every((p) => p.status === "ready"), true); await q.refresh(); assert.equal(calls, 3);
    assert.equal(JSON.stringify(q.snapshot()).includes("do-not-send"), false);
    time += 120001; await q.refresh(); assert.equal(calls, 6);
  } finally { await q.close(); }
});

test("lỗi từng hãng độc lập; giữ số liệu cũ, đánh dấu stale, chờ 5 phút thay vì retry liên tục", async () => {
  let time = now, fail = false, calls = 0;
  const source = readers(); source.claude = async () => { calls++; if (fail) throw new Error("Bearer do-not-send-credentials"); return claude(); };
  const q = createQuotas({ queries: source, clock: () => time });
  try {
    await q.refresh(); fail = true; time += 120001; await q.refresh();
    const p = q.snapshot().providers.find((p) => p.id === "claude"); assert.equal(p.status, "stale"); assert.equal(p.buckets[0].remainingPercent, 0);
    assert.equal(Date.parse(p.nextCheckAt), time + 300000); assert.equal(calls, 2); assert.equal(JSON.stringify(q.snapshot()).includes("do-not-send"), false);
    time += 120001; await q.refresh(); assert.equal(calls, 2);
  } finally { await q.close(); }
  const initial = createQuotas({ queries: { ...readers(), claude: async () => { throw new Error(); } }, clock: () => now });
  try { await initial.refresh(); const p = initial.snapshot().providers.find((p) => p.id === "claude"); assert.equal(p.status, "error"); assert.deepEqual(p.buckets, []); } finally { await initial.close(); }
});

test("tắt bộ theo dõi khi còn đọc: không ghi kết quả muộn hoặc tự chạy lại", async () => {
  let release, closed = 0;
  const gate = new Promise((r) => { release = r; });
  const q = createQuotas({ queries: { ...readers(), codex: () => gate, close: async () => { closed++; release(codex()); } } });
  q.get(); await q.close(); assert.equal(closed, 1);
  assert.equal(q.snapshot().providers.find((p) => p.id === "codex").lastSuccessAt, null); await q.refresh(); assert.equal(closed, 1);
});

test("API hạn mức cần token, không nhận Origin lạ và trả cache nhanh khi CLI đang đọc", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-quota-api-"));
  let release;
  const gate = new Promise((r) => { release = r; });
  const ctl = createCtl({ dir, quotaOptions: { queries: { ...readers(), codex: () => gate } } });
  await new Promise((r) => ctl.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  try {
    assert.equal((await fetch(base + "/quotas")).status, 401);
    const headers = { Authorization: "Bearer " + ctl.token, "Content-Type": "application/json" };
    assert.equal((await fetch(base + "/quotas/refresh", { method: "POST", headers: { ...headers, Origin: "https://evil.example" }, body: "{}" })).status, 403);
    const r = await fetch(base + "/quotas", { headers }); assert.equal(r.status, 200); assert.equal((await r.json()).providers.find((p) => p.id === "codex").refreshing, true);
    assert.equal((await fetch(base + "/quotas/refresh", { method: "POST", headers, body: "{}" })).status, 202);
  } finally { release(codex()); await ctl.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
