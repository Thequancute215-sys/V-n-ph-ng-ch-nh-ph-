// Điều phối model và mức suy nghĩ cho từng lượt AI (CEO duyệt 11/11/2026): không để mặc định một model, một mức cho mọi việc.
// 1. Chấm độ khó của lượt: nhe | vua | nang — theo vai, chữ trong việc giao, blocker CRITICAL, lượt bị trả lại / Codex sửa lại.
// 2. Bảng chọn theo AI (cờ thật của CLI, kiểm 11/11/2026):
//    Claude `--model sonnet|opus --effort low..max`; Codex `-c model_reasoning_effort=low..max` (model giữ theo vai);
//    Antigravity `--model gemini-3.8-flash-low|medium|high` (Hinata giữ Gemini, không dùng Claude/GPT bên Antigravity).
// 3. Leo thang khi lượt trước bị trả lại; hạ bậc khi AI đó sắp hết hạn mức (đỡ cạn giữa luồng).
// CEO cố định model/mức cho phòng nào thì dùng đúng như vậy (dieu-phoi.json). Lệnh tự cấu hình (ctl-agents.json) đã có
// --model / -m / --effort thì giữ nguyên. Mỗi lượt ghi lý do chọn vào nhật ký kiểm toán để đo hiệu suất về sau.
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../lib/ghi-file");
const { ROLE_PHONG, PHONG } = require("./mcp-phong");

const TIERS = ["nhe", "vua", "nang"];
const TEN = { nhe: "nhẹ", vua: "vừa", nang: "nặng" };
const BANG = {
  claude: { nhe: { model: "sonnet", effort: "low" }, vua: { model: "sonnet", effort: "high" }, nang: { model: "opus", effort: "high" } },
  codex: { nhe: { effort: "low" }, vua: { effort: "medium" }, nang: { effort: "xhigh" } },
  agy: { nhe: { model: "gemini-3.8-flash-low" }, vua: { model: "gemini-3.8-flash-medium" }, nang: { model: "gemini-3.8-flash-high" } },
};
const EFFORT = ["low", "medium", "high", "xhigh", "max", "ultra"];   // ultra: chỉ một số model Codex có
// Mức gốc theo vai: báo cáo/tóm tắt nhẹ; lập kiến trúc nặng; còn lại vừa.
const GOC = { CLAUDE_REPORTER: "nhe", SOL_ARCHITECT_PLANNER: "nang" };
const KHO = /kiến trúc|kien truc|bảo mật|bao mat|lỗ hổng|lo hong|security|migration|nâng cấp sổ|đồng thời|race|hiệu năng|hieu nang|performance|refactor|thiết kế lại|viết lại|toàn bộ|toan bo|critical|thanh toán|payment|xác thực|auth/i;
const DE = /chính tả|chinh ta|typo|đổi chữ|đổi màu|doi mau|đổi tên|readme|chú thích|comment|định dạng|format|câu chữ|nhãn|label|icon/i;
const PROVIDER = { claude: "claude", codex: "codex", agy: "antigravity" };

// Loại CLI theo tên chương trình; chạy qua `node <script>` thì xét tên script.
const kindOf = (argv) => {
  const name = (x) => String(x || "").toLowerCase().replace(/\\/g, "/").split("/").pop().replace(/\.(exe|cmd|js|mjs)$/, "");
  let p = name((argv || [])[0]);
  if (p === "node") p = name((argv || [])[1]);
  return ["claude", "codex", "agy"].includes(p) ? p : null;
};
const step = (t, d) => TIERS[Math.max(0, Math.min(2, TIERS.indexOf(t) + d))];

// Phần trăm còn lại thấp nhất của AI. Antigravity: chỉ xét nhóm "Gemini" (các model Flash mà bảng tự động dùng); bỏ nhóm
// Claude/GPT và nhóm riêng của tài khoản Pro (Gemini 4 Argon) vì lượt tự động không tiêu chúng. null = chưa đọc được.
function remaining(snapshot, kind) {
  const p = ((snapshot && snapshot.providers) || []).find((x) => x.id === PROVIDER[kind]);
  const all = ((p && p.buckets) || []).filter((x) => typeof x.remainingPercent === "number");
  const gemini = kind === "agy" ? all.filter((x) => String(x.group || x.label) === "Gemini") : [];
  const b = kind !== "agy" ? all : gemini.length ? gemini : all.filter((x) => !/Claude|GPT/i.test(String(x.group || x.label)));
  return b.length ? Math.min(...b.map((x) => x.remainingPercent)) : null;
}

// Chấm độ khó. focus: việc CEO giao (không kèm lời dặn chung của bộ điều phối); blockers: dòng [ ] OPEN của agent.md.
function classify({ role, focus = "", blockers = [], returned = false, rework = 0, kind = null, quota = null }) {
  const why = [];
  let t = GOC[role] || "vua";
  why.push(`vai ${role}: ${TEN[t]}`);
  if (KHO.test(focus)) { t = step(t, 1); why.push("việc có dấu hiệu khó (kiến trúc/bảo mật/hiệu năng…)"); }
  else if (DE.test(focus) && String(focus).length < 300) { t = step(t, -1); why.push("việc nhỏ (chữ, màu, tên…)"); }
  if (["CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV", "CLAUDE_AUDITOR"].includes(role) && blockers.some((b) => /CRITICAL|-C\d/.test(b))) { t = "nang"; why.push("còn blocker CRITICAL"); }
  if (returned || rework > 0) { t = step(t, 1); why.push(returned ? "lượt trước bị trả lại" : `đội code đã phải sửa ${rework} lần`); }
  const left = kind ? remaining(quota, kind) : null;
  if (left !== null && left <= 5) { t = "nhe"; why.push(`hạn mức còn ${Math.round(left)}%: dùng mức nhẹ nhất`); }
  else if (left !== null && left <= 15) { t = step(t, -1); why.push(`hạn mức còn ${Math.round(left)}%: hạ một bậc`); }
  return { tier: t, why, quotaLeft: left };
}

function createDieuPhoi({ dir, audit = { log() {} } }) {
  const file = path.join(dir, "dieu-phoi.json");
  // { tuDong: true, coDinh: { sakura: { model, effort }, ... } } — đọc mỗi lượt để CEO đổi không cần khởi động lại.
  const read = () => { try { const c = JSON.parse(fs.readFileSync(file, "utf8")); return { tuDong: c.tuDong !== false, coDinh: c.coDinh && typeof c.coDinh === "object" ? c.coDinh : {} }; } catch { return { tuDong: true, coDinh: {} }; } };

  function save(body, actor = "ceo") {
    const cur = read();
    const next = { tuDong: body.tuDong === undefined ? cur.tuDong : body.tuDong !== false, coDinh: { ...cur.coDinh } };
    for (const [room, v] of Object.entries(body.coDinh || {})) {
      if (!PHONG[room] && room !== "pain") throw Object.assign(new Error("Phòng không chạy lượt AI: " + room), { code: "BAD_REQUEST" });
      if (v === null) { delete next.coDinh[room]; continue; }
      const model = v.model == null ? null : String(v.model).trim(), effort = v.effort == null ? null : String(v.effort);
      if (model !== null && !/^[\w.:-]{2,60}$/.test(model)) throw Object.assign(new Error("Tên model không hợp lệ: " + model), { code: "BAD_REQUEST" });
      if (effort !== null && !EFFORT.includes(effort)) throw Object.assign(new Error("Mức suy nghĩ phải là " + EFFORT.join(", ")), { code: "BAD_REQUEST" });
      next.coDinh[room] = { model, effort };
    }
    writeAtomic(file, JSON.stringify(next, null, 2));
    audit.log(actor, "dieu_phoi.save", null, next);
    return status();
  }

  // Quyết định cho một lượt. explicitEffort: mức Claude (đội trưởng) tự đặt cho lượt Codex kế tiếp — ưu tiên hơn tự động.
  function decide({ role, argv, focus, blockers, returned, rework, quota, explicitEffort = null, kind: forced = null }) {
    const kind = forced || kindOf(argv);
    const room = role === "CLAUDE_REPORTER" ? "pain" : ROLE_PHONG(role);
    const conf = read();
    if (!kind) return { kind: null, tier: null, model: null, effort: null, why: ["lệnh không phải claude/codex/agy: giữ nguyên"] };
    const fixed = room && conf.coDinh[room];
    if (fixed) return { kind, tier: null, model: fixed.model || null, effort: explicitEffort || fixed.effort || null, why: [`CEO cố định cho phòng ${room}`], fixed: true };
    const c = classify({ role, focus, blockers, returned, rework, kind, quota });
    if (!conf.tuDong) return { kind, tier: c.tier, model: null, effort: explicitEffort, why: ["CEO tắt điều phối tự động: dùng mặc định của CLI"], quotaLeft: c.quotaLeft };
    const pick = BANG[kind][c.tier];
    const why = explicitEffort ? [...c.why, "đội trưởng đặt mức " + explicitEffort] : c.why;
    return { kind, tier: c.tier, model: pick.model || null, effort: explicitEffort || pick.effort || null, why, quotaLeft: c.quotaLeft };
  }

  // Chèn cờ vào lệnh; lệnh đã tự có cờ model/effort thì giữ nguyên cờ đó.
  function apply(argv, d) {
    if (!d || !d.kind) return argv;
    // Codex: model theo vai và mức suy nghĩ do runner.codexArgs chèn (runner truyền d.effort vào đó).
    if (d.kind === "codex") return argv;
    const has = (names) => argv.some((x) => names.includes(x) || names.some((n) => x.startsWith(n + "=")));
    const out = [...argv];
    const extra = [];
    if (d.model && !has(["--model", "-m"])) extra.push("--model", d.model);
    if (d.effort && !has(["--effort"])) extra.push("--effort", d.effort);
    if (!extra.length) return out;
    // Chèn ngay sau tên chương trình (trước -p {prompt} …); chạy qua `node <script>` thì chèn sau script.
    const at = /(^|[\\/])node(\.exe)?$/i.test(out[0]) ? 2 : 1;
    return [...out.slice(0, at), ...extra, ...out.slice(at)];
  }

  const status = () => ({ ...read(), bang: BANG, tiers: TIERS });
  return { decide, apply, status, save, read };
}

module.exports = { createDieuPhoi, classify, remaining, kindOf, BANG, TIERS };
