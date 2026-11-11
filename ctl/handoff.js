// Khóa lượt agent.md: đọc NEXT_OWNER, tìm dòng JSON bàn giao trong log của AI, và (khi CEO duyệt) ghi 2 dòng
// LAST_UPDATED_BY / NEXT_OWNER rồi commit "chore(agent-sync): VAI -> NEXT: VAI_TIẾP" (chỉ commit cục bộ, không push).
"use strict";
const fs = require("fs");
const path = require("path");

const { ROLES } = require("../lib/kiem-agent");   // một danh sách vai cho cả bộ kiểm và bàn giao
const { checkSkill } = require("./skill");
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
// opts.skills: máy đã cài bộ skill mặc định thì mọi lượt phải khai skill_da_dung (CEO duyệt 11/11/2026).
function checkHandoff(h, role, opts = {}) {
  const bad = [];
  if (!h || typeof h !== "object" || Array.isArray(h)) return ["không phải object JSON"];
  if (h.role !== role) bad.push(`role phải là ${role}`);
  if (!ROLES.includes(h.next_owner)) bad.push("next_owner phải là một trong " + ROLES.join(", "));
  if (h.next_owner === role) bad.push("next_owner không được trùng vai hiện tại");
  if (!Array.isArray(h.files) || !h.files.every((x) => typeof x === "string")) bad.push("files phải là mảng chuỗi");
  if (!Array.isArray(h.claim_fixed) || !h.claim_fixed.every((x) => typeof x === "string" && /^P\d+-[CHM]\d+/.test(x))) bad.push("claim_fixed phải là mảng ID dạng P2-C01");
  if (h.done !== undefined && typeof h.done !== "boolean") bad.push("done (nếu có) phải là true/false");
  if (opts.skills) bad.push(...checkSkill(h));
  if (h.ask_ceo !== undefined) bad.push(...checkAsk(h.ask_ceo, role));
  if (h.effort !== undefined) {
    if (role !== "CLAUDE_AUDITOR") bad.push("chỉ CLAUDE_AUDITOR được đặt effort cho lượt kế tiếp");
    else if (!EFFORTS.includes(h.effort)) bad.push("effort phải là một trong " + EFFORTS.join(", "));
  }
  if (h.giai_thich !== undefined || EXPLAIN_REQUIRED.includes(role)) bad.push(...checkExplain(h.giai_thich));
  // Xoá file/thư mục (CEO quyết 03/11/2026): chỉ Claude được xoá và phải giải thích; vai khác chỉ đề nghị.
  if (h.de_nghi_xoa !== undefined) bad.push(...checkList(h.de_nghi_xoa, "de_nghi_xoa", { duong_dan: 1, ly_do: 10 }));
  if (h.da_xoa !== undefined) {
    if (role !== "CLAUDE_AUDITOR") bad.push("chỉ CLAUDE_AUDITOR được xoá (da_xoa); vai khác ghi đề nghị vào de_nghi_xoa");
    else bad.push(...checkList(h.da_xoa, "da_xoa", { duong_dan: 1, ly_do: 10, da_kiem: 10 }));
  }
  return bad;
}

// Danh sách xoá: mảng tối đa 50 mục, mỗi trường là chuỗi đủ dài (ly_do / da_kiem viết rõ, không viết cho có).
function checkList(list, name, fields) {
  if (!Array.isArray(list) || list.length > 50) return [name + " phải là mảng tối đa 50 mục"];
  const bad = [];
  list.forEach((x, i) => {
    for (const [k, min] of Object.entries(fields)) {
      const v = x && x[k];
      if (typeof v !== "string" || v.trim().length < min || v.length > 1000 || (min > 1 && filler(v))) bad.push(`${name}[${i + 1}].${k} phải viết rõ (${min}–1000 ký tự)`);
    }
  });
  return bad;
}

// CEO yêu cầu (03/11/2026): mỗi lượt của Hinata, Sol, Astra phải giải thích cho CEO duyệt: vấn đề/lỗi gì, đã làm gì,
// vì sao làm vậy, cách khác đã cân nhắc và vì sao bỏ. Claude (đội trưởng) có báo cáo riêng nên không bắt buộc.
// Mọi lỗi ở đây bắt đầu bằng "giai_thich" để bộ điều phối nhận ra và trả lại đúng lượt đó bổ sung (không dừng cả luồng).
const EXPLAIN_REQUIRED = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV"];
const EXPLAIN_FIELDS = { van_de: "vấn đề hoặc lỗi", da_lam: "đã làm gì", vi_sao: "vì sao làm vậy" };
// Chép nguyên mẫu (<...>) hoặc viết cho có ("ok", "như trên") thì không tính là giải thích.
const filler = (s) => /^\s*<[^>]*>\s*$/.test(s) || /^\s*(ok|xong|như trên|n\/a|không có|đã sửa|đã làm|done|fixed)\.?\s*$/i.test(s);
function checkExplain(list) {
  if (!Array.isArray(list) || !list.length) return ["giai_thich bắt buộc: mảng 1–20 mục, mỗi thay đổi một mục {van_de, da_lam, vi_sao, phuong_an_khac}"];
  if (list.length > 20) return ["giai_thich tối đa 20 mục: gộp các thay đổi nhỏ cùng lý do"];
  const bad = [];
  list.forEach((x, i) => {
    const at = "giai_thich[" + (i + 1) + "]";
    if (!x || typeof x !== "object" || Array.isArray(x)) { bad.push(at + " phải là object"); return; }
    for (const [k, name] of Object.entries(EXPLAIN_FIELDS)) {
      const v = x[k];
      if (typeof v !== "string" || v.trim().length < 15 || v.length > 2000) bad.push(`${at}.${k} (${name}) phải viết rõ, 15–2000 ký tự`);
      else if (filler(v)) bad.push(`${at}.${k} (${name}) đang là chữ mẫu hoặc viết cho có`);
    }
    const alt = x.phuong_an_khac;
    if (!Array.isArray(alt) || alt.length > 5) { bad.push(`${at}.phuong_an_khac phải là mảng 0–5 phương án {cach, vi_sao_khong} (không có cách khác hợp lý thì [] và nói rõ trong vi_sao)`); return; }
    alt.forEach((a, j) => {
      const ok = (v) => typeof v === "string" && v.trim().length >= 8 && v.length <= 1000 && !filler(v);
      if (!a || typeof a !== "object" || !ok(a.cach) || !ok(a.vi_sao_khong)) bad.push(`${at}.phuong_an_khac[${j + 1}] cần cach và vi_sao_khong, mỗi phần 8–1000 ký tự`);
    });
  });
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

module.exports = { ROLES, EFFORTS, EXPLAIN_REQUIRED, readTurn, setTurn, checkHandoff, checkExplain, findHandoff };
