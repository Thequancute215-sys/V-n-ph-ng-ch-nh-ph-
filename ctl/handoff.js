// Khóa lượt agent.md: đọc NEXT_OWNER, tìm dòng JSON bàn giao trong log của AI, và (khi CEO duyệt) ghi 2 dòng
// LAST_UPDATED_BY / NEXT_OWNER rồi commit "chore(agent-sync): VAI -> NEXT: VAI_TIẾP" (chỉ commit cục bộ, không push).
"use strict";
const fs = require("fs");
const path = require("path");

const ROLES = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV", "CLAUDE_AUDITOR"];
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

module.exports = { ROLES, readTurn, setTurn, checkHandoff, findHandoff };
