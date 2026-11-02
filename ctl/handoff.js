// Khóa lượt agent.md: đọc NEXT_OWNER, tìm dòng JSON bàn giao trong log của AI, và (khi CEO duyệt) ghi 2 dòng
// LAST_UPDATED_BY / NEXT_OWNER rồi commit "chore(agent-sync): VAI -> NEXT: VAI_TIẾP" (chỉ commit cục bộ, không push).
"use strict";
const fs = require("fs");
const path = require("path");

const ROLES = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR"];
// Mức suy luận của lượt Codex (Sol/Astra) kế tiếp mà đội trưởng được tự đặt, không cần hỏi CEO (CEO cho phép 02/11/2026).
// Mặc định medium; "ultra" (tốn hạn mức nhất) vẫn để CEO quyết.
const EFFORTS = ["medium", "high", "xhigh", "max"];
const RE = {
  phase: /^- CURRENT_PHASE:\s*(.+)$/m,
  last: /^(- LAST_UPDATED_BY:\s*)(\S+)/m,
  next: /^(- NEXT_OWNER[^:\n]*:\s*)([A-Z_]+)/m,
};
const err = (code, msg) => Object.assign(new Error(msg), { code });

function readTurn(root) {
  let txt;
  try { txt = fs.readFileSync(path.join(root, "agent.md"), "utf8"); } catch { throw err("NO_AGENT_MD", "Workspace chưa có agent.md"); }
  const next = RE.next.exec(txt), last = RE.last.exec(txt), phase = RE.phase.exec(txt);
  if (!next) throw err("BAD_AGENT_MD", "agent.md không có dòng NEXT_OWNER");
  return { phase: phase ? phase[1].trim() : null, lastUpdatedBy: last ? last[2] : null, nextOwner: next[2] };
}

function setTurn(root, role, nextOwner) {
  const f = path.join(root, "agent.md");
  let txt = fs.readFileSync(f, "utf8");
  if (!RE.last.test(txt)) throw err("BAD_AGENT_MD", "agent.md không có dòng LAST_UPDATED_BY");
  txt = txt.replace(RE.last, `$1${role}`).replace(RE.next, `$1${nextOwner}`);
  fs.writeFileSync(f, txt);
}

// Kiểm schema dòng bàn giao (không dùng thư viện ngoài).
function checkHandoff(h, role) {
  const bad = [];
  if (!h || typeof h !== "object" || Array.isArray(h)) return ["không phải object JSON"];
  if (h.role !== role) bad.push(`role phải là ${role}`);
  if (!ROLES.includes(h.next_owner)) bad.push("next_owner phải là một trong " + ROLES.join(", "));
  if (h.next_owner === role) bad.push("next_owner không được trùng vai hiện tại");
  if (!Array.isArray(h.files) || !h.files.every((x) => typeof x === "string")) bad.push("files phải là mảng chuỗi");
  if (!Array.isArray(h.claim_fixed) || !h.claim_fixed.every((x) => typeof x === "string" && /^P\d+-[CHM]\d+/.test(x))) bad.push("claim_fixed phải là mảng ID dạng P2-C01");
  if (h.done !== undefined && typeof h.done !== "boolean") bad.push("done (nếu có) phải là true/false");
  if (h.ask_ceo !== undefined) bad.push(...checkAsk(h.ask_ceo, role));
  if (h.effort !== undefined) {
    if (role !== "CLAUDE_AUDITOR") bad.push("chỉ CLAUDE_AUDITOR được đặt effort cho lượt kế tiếp");
    else if (!EFFORTS.includes(h.effort)) bad.push("effort phải là một trong " + EFFORTS.join(", "));
  }
  return bad;
}

// Claude (đội trưởng) phản biện AI khác thì không tự ra lệnh sửa mà hỏi CEO (CEO quyết 02/11/2026):
// "ask_ceo": {"question": "...", "options": [{"id":"A","label":"...","next_owner":"<VAI>","task":"lệnh cho vai đó"}, ...]}.
function checkAsk(a, role) {
  if (role !== "CLAUDE_AUDITOR") return ["chỉ CLAUDE_AUDITOR được hỏi CEO (ask_ceo)"];
  if (!a || typeof a !== "object" || Array.isArray(a)) return ["ask_ceo phải là object"];
  const bad = [];
  if (typeof a.question !== "string" || !a.question.trim() || a.question.length > 2000) bad.push("ask_ceo.question phải là chuỗi 1–2000 ký tự");
  if (!Array.isArray(a.options) || a.options.length < 2 || a.options.length > 4) return [...bad, "ask_ceo.options phải có 2–4 phương án"];
  const ids = new Set();
  for (const o of a.options) {
    if (!o || typeof o !== "object") { bad.push("mỗi phương án phải là object"); continue; }
    if (typeof o.id !== "string" || !/^[A-Za-z0-9]{1,8}$/.test(o.id) || ids.has(o.id)) bad.push("phương án cần id ngắn, không trùng (A, B…)");
    ids.add(o.id);
    if (typeof o.label !== "string" || !o.label.trim() || o.label.length > 300) bad.push("phương án " + o.id + ": label 1–300 ký tự");
    if (o.next_owner !== undefined && (!ROLES.includes(o.next_owner) || o.next_owner === role)) bad.push("phương án " + o.id + ": next_owner không hợp lệ");
    if (o.task !== undefined && (typeof o.task !== "string" || o.task.length > 4000)) bad.push("phương án " + o.id + ": task tối đa 4000 ký tự");
  }
  return bad;
}

// Tìm object {"role": ...} cuối cùng trong log. Log có thể là văn bản thường, hoặc JSON/JSONL của CLI (claude --output-format json,
// codex exec --json) mà nội dung trả lời nằm trong một trường chuỗi, nên quét cả các chuỗi bên trong.
function findHandoff(log) {
  const texts = [];
  const collect = (v) => { if (typeof v === "string") texts.push(v); else if (v && typeof v === "object") for (const x of Object.values(v)) collect(x); };
  for (const line of String(log).split(/\r?\n/)) {
    texts.push(line);
    const t = line.trim();
    if (t.startsWith("{") || t.startsWith("[")) { try { collect(JSON.parse(t)); } catch {} }
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const s = texts[i];
    for (let at = s.lastIndexOf('{"role"'); at >= 0; at = s.lastIndexOf('{"role"', at - 1)) {
      let depth = 0, inStr = false, esc = false;
      for (let k = at; k < s.length; k++) {
        const c = s[k];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) {
          try { return JSON.parse(s.slice(at, k + 1)); } catch { break; }
        }
      }
      if (at === 0) break;
    }
  }
  return null;
}

module.exports = { ROLES, EFFORTS, readTurn, setTurn, checkHandoff, findHandoff };
