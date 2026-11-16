"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { resolveProgram } = require("./policy");
const { cleanEnv } = require("../lib/mask");
const { killTree } = require("../lib/proc");

const EVERY = 2 * 60 * 1000;
const number = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
const percent = (v) => number(v) === null ? null : Math.max(0, Math.min(100, v));
const iso = (v) => { const t = typeof v === "number" ? v * 1000 : Date.parse(v); return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null; };
function bucket(id, label, group, used, resetAt, resetLabel = null) {
  used = percent(used);
  return used === null ? null : { id, label, group, usedPercent: used, remainingPercent: 100 - used, resetAt: iso(resetAt), resetLabel };
}
function codexBuckets(data) {
  const snapshots = data.rateLimitsByLimitId && Object.keys(data.rateLimitsByLimitId).length ? Object.values(data.rateLimitsByLimitId) : [data.rateLimits];
  const buckets = [];
  for (const snap of snapshots.filter(Boolean)) for (const key of ["primary", "secondary"]) {
    const w = snap[key]; if (!w) continue;
    const mins = number(w.windowDurationMins), label = mins === 300 ? "5 giờ" : mins === 10080 ? "7 ngày" : mins ? mins + " phút" : key === "primary" ? "Cửa sổ chính" : "Cửa sổ phụ";
    const b = bucket((snap.limitId || "codex") + "-" + key, label, snap.limitName || snap.limitId || "Codex", w.usedPercent, w.resetsAt);
    if (b) buckets.push(b);
  }
  if (!buckets.length) throw new Error("Chưa có hạn mức ChatGPT; kiểm tra đăng nhập Codex bằng gói thuê bao.");
  return { buckets, plan: data.rateLimits?.planType || null, ordinaryUsageAllowed: typeof data.ordinaryUsageAllowed === "boolean" ? data.ordinaryUsageAllowed : null,
    resetCreditsAvailable: number(data.rateLimitResetCredits?.availableCount) };
}

// Claude /usage trả giờ theo múi giờ ghi trong báo cáo, có thể không kèm năm.
function claudeReset(text, now = Date.now()) {
  if (/^\d{4}-\d\d-\d\dT/.test(text)) return iso(text);
  const m = /^(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*)?(\d{1,2}):(\d\d)\s*(am|pm)\s*\(([^)]+)\)$/i.exec(text.trim());
  if (!m) return null;
  try {
    const zone = m[6], fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    const parts = (t) => Object.fromEntries(fmt.formatToParts(new Date(t)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
    const current = parts(now), hour = Number(m[3]) % 12 + (m[5].toLowerCase() === "pm" ? 12 : 0);
    if (Number(m[3]) < 1 || Number(m[3]) > 12 || Number(m[4]) > 59) return null;
    let year = current.year, month = m[1] ? "jan feb mar apr may jun jul aug sep oct nov dec".split(" ").indexOf(m[1].toLowerCase()) + 1 : current.month;
    let day = m[2] ? Number(m[2]) : current.day;
    if (month === 1 && current.month === 12) year++;
    if (month === 12 && current.month === 1) year--;
    const wall = Date.UTC(year, month - 1, day, hour, Number(m[4]));
    let guess = wall;
    for (let i = 0; i < 3; i++) { const p = parts(guess); guess += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second); }
    // Báo cáo chỉ có giờ: cho phép chuyển qua nửa đêm, không tự dịch một mốc vừa qua sang ngày mới.
    if (!m[1] && guess < now - 12 * 3600000) guess += 24 * 3600000;
    return new Date(guess).toISOString();
  } catch { return null; }
}
function claudeBuckets(data, now) {
  if (data.local_command !== "usage" || data.num_turns !== 0 || data.is_error) throw new Error("Claude CLI chưa trả được báo cáo /usage cục bộ.");
  const buckets = [];
  for (const line of String(data.result || "").split(/\r?\n/)) {
    const m = /^(Current session|Current week(?:\s*\([^)]+\))?)\s*:\s*(\d+(?:\.\d+)?)% used\s*[·•]\s*resets\s+(.+)$/i.exec(line.trim());
    if (!m) continue;
    const label = /^Current session$/i.test(m[1]) ? "5 giờ" : "7 ngày";
    const model = /\(([^)]+)\)/.exec(m[1]);
    const b = bucket("claude-" + buckets.length, label, model && model[1] !== "all models" ? model[1] : "Claude Code", Number(m[2]), claudeReset(m[3], now), m[3]);
    if (b) buckets.push(b);
  }
  if (!buckets.length) throw new Error("Chưa đọc được hạn mức thuê bao từ /usage của Claude. Mở Claude /usage để kiểm tra.");
  return { buckets };
}
function antigravityBuckets(data) {
  if (data.status !== "SUCCESS" || data.command?.name !== "usage" || data.num_turns !== 0 || !Array.isArray(data.command.data?.groups)) throw new Error("Antigravity chưa trả được báo cáo /usage cục bộ.");
  const buckets = [];
  for (const g of data.command.data.groups) for (const w of Array.isArray(g.buckets) ? g.buckets : []) {
    const remaining = number(w.remaining_fraction);
    if (remaining === null) continue;
    const b = bucket(String(w.id), w.window === "weekly" ? "7 ngày" : w.window === "5h" ? "5 giờ" : String(w.name || w.window || "Hạn mức"),
      g.name === "Gemini Models" ? "Gemini" : g.name === "Claude and GPT models" ? "Claude / GPT trong Antigravity" : String(g.name), (1 - remaining) * 100, w.reset_time);
    if (b) buckets.push(b);
  }
  if (!buckets.length) throw new Error("Antigravity chưa cung cấp số liệu hạn mức.");
  return { buckets };
}

// Danh sách model để CEO chọn ngoài chế độ tự động. Đọc từ CLI thật (agy models, codex app-server model/list);
// Claude Code nhận bí danh (haiku/sonnet/opus = bản mới nhất) hoặc mã model đầy đủ.
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const CLAUDE_MODELS = [["opus", "Opus (bản mới nhất)"], ["sonnet", "Sonnet (bản mới nhất)"], ["haiku", "Haiku (bản mới nhất)"], ["claude-fable-5-2", "Fable 5.2"],
  ["claude-opus-5-5", "Opus 5.5"], ["claude-sonnet-5-5", "Sonnet 5.5"], ["claude-haiku-5-5", "Haiku 5.5"]].map(([id, name]) => ({ id, name, efforts: EFFORTS }));
const ID = /^[\w.:-]{2,60}$/;
function agyModelList(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) { const [id, name] = line.split("\t"); if (ID.test((id || "").trim()) && name) out.push({ id: id.trim(), name: name.trim(), efforts: EFFORTS }); }
  if (!out.length) throw new Error("Antigravity chưa trả danh sách model.");
  return out;
}
function codexModelList(result) {
  const list = Array.isArray(result?.data) ? result.data : Array.isArray(result?.models) ? result.models : [];
  const out = list.filter((m) => !m.hidden && ID.test(String(m.id || m.model || ""))).map((m) => ({ id: String(m.id || m.model), name: String(m.displayName || m.id || m.model),
    efforts: (m.supportedReasoningEfforts || []).map((e) => String(e.reasoningEffort || e)).filter((e) => /^[a-z]{2,10}$/.test(e)), macDinh: !!m.isDefault }));
  if (!out.length) throw new Error("Codex chưa trả danh sách model.");
  return out;
}

function createQueries(dir) {
  const children = new Set();
  let closed = false;
  function program(name) {
    const role = { codex: "CODEX_ASTRA_DEV", claude: "CLAUDE_AUDITOR", agy: "SPEC_ARCHITECT" }[name];
    try {
      const custom = JSON.parse(fs.readFileSync(path.join(dir, "ctl-agents.json"), "utf8"))[role];
      const at = custom?.findIndex((s) => name === "codex" ? s === "exec" : s === "-p" || s === "--print");
      if (at > 0) return [...resolveProgram(custom[0]), ...custom.slice(1, at)];
    } catch {}
    return resolveProgram(name);
  }
  // rpc: phương thức JSON-RPC gửi sau initialize (Codex app-server); text: trả nguyên văn bản thay vì JSON.
  function query(name, args, rpc = null, text = false, env = null) {
    return new Promise((resolve, reject) => {
      if (closed) return reject(new Error("Bộ theo dõi đã dừng."));
      let prog;
      try { prog = program(name); } catch { return reject(new Error("Không tìm thấy CLI " + name + " trên máy.")); }
      const child = spawn(prog[0], [...prog.slice(1), ...args], { cwd: os.tmpdir(), env: env || cleanEnv(), windowsHide: true, shell: false, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "ignore"] });
      children.add(child);
      let output = "", pending = "", result, problem = null, done = false;
      const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
      const stop = (message) => { problem = new Error(message); if (child.pid) killTree(child.pid).catch(() => {}); };
      const timer = setTimeout(() => stop("CLI " + name + " quá thời gian đọc hạn mức (25 giây)."), 25000);
      child.stdin.on("error", () => {});
      child.stdout.on("data", (chunk) => {
        output += chunk; if (output.length > 2 * 1024 * 1024) return stop("CLI trả dữ liệu hạn mức quá lớn.");
        if (!rpc) return;
        pending += chunk;
        let i;
        while ((i = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, i); pending = pending.slice(i + 1);
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.id === 1) {
            if (m.error) return stop("Codex không khởi tạo được kênh đọc hạn mức.");
            send({ method: "initialized", params: {} }); send(rpc === "model/list" ? { id: 2, method: rpc, params: {} } : { id: 2, method: rpc });
          }
          if (m.id === 2) { if (m.error) problem = new Error("Codex chưa trả lời " + rpc + "; kiểm tra đăng nhập ChatGPT."); else result = m.result; child.stdin.end(); }
        }
      });
      const finish = (code) => {
        if (done) return; done = true; clearTimeout(timer); children.delete(child);
        if (problem) return reject(problem);
        if (code !== 0) return reject(new Error("CLI " + name + " không đọc được hạn mức. Kiểm tra đăng nhập hoặc thử lại sau."));
        try { if (rpc && !result) throw new Error(); resolve(rpc ? result : text ? output : JSON.parse(output)); }
        catch { reject(new Error("CLI " + name + " trả báo cáo không hợp lệ.")); }
      };
      child.on("error", () => { problem = new Error("Không chạy được CLI " + name + "."); finish(1); });
      child.on("close", finish);
      if (rpc) send({ id: 1, method: "initialize", params: { clientInfo: { name: "van_phong_usage", title: "Van phong AI", version: "1.0.0" } } });
      else child.stdin.end();
    });
  }
  return {
    codex: () => query("codex", ["app-server", "-c", "analytics.enabled=false", "--listen", "stdio://"], "account/rateLimits/read"),
    codexModels: () => query("codex", ["app-server", "-c", "analytics.enabled=false", "--listen", "stdio://"], "model/list"),
    agyModels: () => query("agy", ["models"], null, true),
    claude: () => query("claude", ["-p", "/usage", "--output-format", "json", "--max-turns", "1", "--tools", "", "--safe-mode"]),
    antigravity: () => query("agy", ["-p", "/usage", "--output-format", "json", "--print-timeout", "20s", "--mode", "plan"]),
    close: async () => { closed = true; await Promise.allSettled([...children].filter((c) => c.pid).map((c) => killTree(c.pid))); },
  };
}

// agyTk (ctl/agy-tai-khoan.js): nhiều tài khoản Antigravity — ghi hạn mức theo tài khoản, đọc tài khoản đang nghỉ.
function createQuotas({ dir, queries, clock = Date.now, intervalMs = EVERY, agyTk = null } = {}) {
  const reader = queries || createQueries(dir);
  const defs = [
    { id: "codex", name: "Codex · Sol & Astra", source: "Codex app-server", parse: codexBuckets, url: "https://chatgpt.com/codex/settings/usage" },
    { id: "claude", name: "Claude Code", source: "Claude CLI /usage", parse: claudeBuckets, url: "https://claude.ai/settings/usage" },
    { id: "antigravity", name: "Antigravity", source: "Antigravity CLI /usage", parse: antigravityBuckets, url: "https://antigravity.google/docs/cli/commands/usage/" },
  ];
  const states = new Map(defs.map((d) => [d.id, { id: d.id, name: d.name, source: d.source, url: d.url, status: "loading", checkedAt: null, lastSuccessAt: null, nextCheckAt: null, buckets: [], refreshing: false, error: "" }]));
  let pending = null, stopped = false;
  function snapshot() {
    const providers = JSON.parse(JSON.stringify([...states.values()]));
    if (agyTk) { const a = providers.find((p) => p.id === "antigravity"); try { if (a) a.taiKhoan = agyTk.trangThai({ nhanh: true }); } catch {} }
    return { providers, intervalMs };
  }
  // Đọc hạn mức tài khoản Antigravity đang nghỉ (đổi sang ~10 giây rồi đổi về; agyTk tự giữ nhịp 30 phút và chỉ làm khi máy rảnh).
  let nghiPending = null;
  function docNghi(force = false) {
    // Anh bấm đọc ngay (force) đúng lúc bảng hạn mức đang làm mới hoặc đang có lần đọc thường: chờ xong rồi đọc, không bỏ qua im lặng.
    if (force && agyTk && !stopped && (pending || nghiPending)) return Promise.resolve(pending).catch(() => {}).then(() => nghiPending).then((r) => r || docNghi(true));
    if (!agyTk || stopped || nghiPending || pending) return nghiPending || Promise.resolve(false);
    nghiPending = agyTk.docNghi(async () => antigravityBuckets(await reader.antigravity()).buckets,
      { force, docModels: reader.agyModels ? async () => agyModelList(await reader.agyModels()).map((m) => m.id) : null })
      .catch(() => false).finally(() => { nghiPending = null; });
    return nghiPending;
  }
  function refresh(force = false) {
    if (force && !pending) for (const s of states.values()) s.nextCheckAt = null;
    if (stopped || pending) return pending || Promise.resolve(snapshot());
    // Đang tạm đổi tài khoản Antigravity để đọc tài khoản nghỉ thì không đọc Antigravity chen vào (tránh ghi nhầm, tránh chặn lúc đổi về).
    const due = defs.filter((d) => !(d.id === "antigravity" && agyTk && agyTk.dangTrao()) && (!states.get(d.id).nextCheckAt || Date.parse(states.get(d.id).nextCheckAt) <= clock()));
    if (!due.length) return Promise.resolve(snapshot());
    pending = Promise.allSettled(due.map(async (d) => {
      const s = states.get(d.id); s.refreshing = true;
      try {
        // Antigravity: biết chắc hạn mức vừa đọc là của tài khoản nào (đổi tài khoản chen giữa thì không ghi cho tài khoản nào).
        const r = d.id === "antigravity" && agyTk ? await agyTk.docVoiTk(() => reader.antigravity()) : { value: await reader[d.id]() };
        const parsed = d.parse(r.value, clock());
        if (stopped) return;
        Object.assign(s, parsed, { status: "ready", error: "", lastSuccessAt: new Date(clock()).toISOString() });
        if (d.id === "antigravity" && agyTk && r.email) { try { agyTk.ghiHanMuc(parsed.buckets, r.email); } catch {} }
      } catch (e) {
        if (stopped) return;
        s.status = s.buckets.length ? "stale" : "error";
        // Không trả stdout/stderr của CLI hoặc đối tượng lỗi có thể chứa dữ liệu tài khoản.
        s.error = queries ? "Chưa đọc được hạn mức. Thử lại sau." : String(e.message).slice(0, 250);
      } finally {
        if (!stopped) Object.assign(s, { refreshing: false, checkedAt: new Date(clock()).toISOString(), nextCheckAt: new Date(clock() + (s.status === "ready" ? intervalMs : Math.max(intervalMs, 5 * 60000))).toISOString() });
      }
    })).finally(() => { pending = null; if (!stopped) docNghi(); });
    return pending;
  }
  function get() { refresh(); return snapshot(); }
  // Danh sách model của 3 AI, nhớ 6 giờ. AI nào đọc lỗi thì trả lỗi riêng cho AI đó (CEO vẫn gõ được tên model).
  // Antigravity: mỗi tài khoản thấy model khác nhau. Danh sách vừa đọc ghi cho tài khoản đang dùng; bảng chọn hiện hợp các
  // tài khoản đã cất, model chỉ một số tài khoản có thì ghi "chỉ <tên>" để CEO biết lượt sẽ chạy bằng tài khoản nào.
  let modelCache = null, modelPending = null;
  function gopAgy(data) {
    if (!agyTk) return data;
    let tk; try { tk = agyTk.modelTheoTk(); } catch { return data; }
    if (!tk.length) return data;
    const map = new Map((data.agy.models || []).map((m) => [m.id, m]));
    for (const t of tk) for (const id of t.models) if (!map.has(id)) map.set(id, { id, name: id, efforts: EFFORTS });
    const models = [...map.values()].map((m) => {
      const co = tk.filter((t) => t.models.includes(m.id)).map((t) => t.nhan);
      return co.length && co.length < tk.length ? { ...m, name: m.name + " · chỉ " + co.join(", "), chiCo: co } : m;
    });
    return { ...data, agy: { ...data.agy, models } };
  }
  async function models(force = false) {
    if (!force && modelCache && clock() - modelCache.at < 6 * 3600000) return gopAgy(modelCache.data);
    if (modelPending) return modelPending;
    modelPending = (async () => {
      // Danh sách model Antigravity ghi cho đúng tài khoản đã đọc, ngay khi đọc xong (không đợi Codex: chờ lâu thì tài khoản có thể đã đổi).
      const docAgy = () => (agyTk ? agyTk.docVoiTk(() => reader.agyModels()) : reader.agyModels().then((value) => ({ value, email: null })))
        .then(({ value, email }) => { const list = agyModelList(value); if (agyTk && email) { try { agyTk.ghiModels(list.map((m) => m.id), email); } catch {} } return list; });
      const [codex, agy] = await Promise.allSettled([reader.codexModels ? reader.codexModels().then(codexModelList) : Promise.reject(new Error("không hỗ trợ")),
        reader.agyModels ? docAgy() : Promise.reject(new Error("không hỗ trợ"))]);
      const pick = (r) => r.status === "fulfilled" ? { models: r.value } : { models: [], error: String(r.reason && r.reason.message || r.reason).slice(0, 200) };
      const data = { claude: { models: CLAUDE_MODELS }, codex: pick(codex), agy: pick(agy), checkedAt: new Date(clock()).toISOString() };
      if (!data.codex.error && !data.agy.error) modelCache = { at: clock(), data };
      return gopAgy(data);
    })().finally(() => { modelPending = null; });
    return modelPending;
  }
  async function close() { stopped = true; await reader.close?.(); await pending; await nghiPending; }
  return { get, refresh, snapshot, close, models, docNghi };
}
module.exports = { createQuotas, codexBuckets, claudeBuckets, antigravityBuckets, claudeReset, agyModelList, codexModelList, CLAUDE_MODELS };
