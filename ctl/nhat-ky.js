// Nhật ký văn phòng (CEO yêu cầu 07/11/2026): dòng thời gian "ai làm gì, lúc nào" của dự án, như bảng tin của đội.
// Lấy từ sổ luồng tự động (bắt đầu/kết thúc lượt, chờ CEO duyệt) và nhật ký từng lượt AI: câu AI nói, lệnh chạy, file sửa.
// Nhật ký CLI không có giờ từng dòng: dòng đọc thấy lúc lượt đang chạy lấy giờ đọc (trang hỏi lại mỗi vài giây),
// lượt đã xong lấy giờ kết thúc của lượt.
"use strict";
const { maskText } = require("../lib/mask");

// Vai → nhân vật trong văn phòng 3D
const WHO = (role = "") => role === "SPEC_ARCHITECT" || role.startsWith("AGY_") ? "hinata" : role.startsWith("SOL_") ? "itachi"
  : role.startsWith("CODEX_") ? "sasuke" : role.startsWith("CLAUDE_") ? "sakura" : "pain";
const short = (s, n = 400) => { const t = maskText(String(s || "")).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const file = (p) => String(p || "").replace(/\\/g, "/").split("/").slice(-2).join("/");

// Một dòng nhật ký CLI (JSON mỗi dòng) → các mục dễ đọc. Hỗ trợ Codex (--json), Claude (stream-json), Antigravity (stream-json).
function parseLine(line) {
  let v;
  try { v = JSON.parse(line); } catch { return []; }
  if (!v || typeof v !== "object") return [];
  const out = [];
  // Codex: {"type":"item.completed","item":{"type":"agent_message"|"command_execution"|"file_change",...}}
  if (v.type === "item.completed" && v.item) {
    const it = v.item;
    if (it.type === "agent_message" && it.text) out.push({ kind: "noi", text: it.text });
    else if (it.type === "command_execution" && it.command) out.push({ kind: Number(it.exit_code) ? "loi" : "lenh", text: "Chạy lệnh " + String(it.command).replace(/^.*?-Command\s+/, "") + (Number(it.exit_code) ? " (lỗi " + it.exit_code + ")" : "") });
    else if (it.type === "file_change" && Array.isArray(it.changes)) out.push({ kind: "sua", text: "Sửa " + it.changes.map((c) => file(c.path)).join(", ") });
    return out;
  }
  // Claude stream-json: {"type":"assistant","message":{"content":[{type:"text"},{type:"tool_use",name,input}]}}
  if (v.type === "assistant" && v.message && Array.isArray(v.message.content)) {
    for (const c of v.message.content) {
      if (c.type === "text" && c.text && c.text.trim()) out.push({ kind: "noi", text: c.text });
      else if (c.type === "tool_use") {
        const i = c.input || {};
        if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(c.name)) out.push({ kind: "sua", text: "Sửa " + file(i.file_path || i.notebook_path) });
        else if (c.name === "Bash" && i.command) out.push({ kind: "lenh", text: "Chạy lệnh " + i.command });
        else if (/^mcp__/.test(c.name)) out.push({ kind: "lenh", text: "Dùng kết nối " + c.name.replace(/^mcp__(claude_ai_)?/, "").replace(/__/, " · ") });
      }
    }
    return out;
  }
  // Antigravity / dạng chung: tin nhắn của trợ lý có trường text
  if ((v.type === "message" || v.type === "assistant_message" || v.role === "assistant" || v.role === "model") && typeof (v.text || v.content) === "string") out.push({ kind: "noi", text: v.text || v.content });
  return out;
}

function createJournal({ jobs, autopilot }) {
  const seen = new Map();   // jobId → { offset, entries[] } đọc dần nhật ký, nhớ giờ thấy từng dòng

  function readJob(job, role) {
    let st = seen.get(job.id);
    if (!st) { st = { offset: 0, rest: "", entries: [] }; seen.set(job.id, st); if (seen.size > 200) seen.delete(seen.keys().next().value); }
    if (st.done) return st.entries;
    const now = job.status === "running" ? Date.now() : job.ended_at || Date.now();
    for (let guard = 0; guard < 20; guard++) {
      const chunk = jobs.readLog(job.id, st.offset);
      if (!chunk || !chunk.text) break;
      st.offset = chunk.next;
      const lines = (st.rest + chunk.text).split(/\r?\n/);
      st.rest = lines.pop();
      for (const l of lines) for (const e of parseLine(l)) st.entries.push({ at: now, who: WHO(role), role, kind: e.kind, text: short(e.text) });
      if (chunk.next >= chunk.size) break;
    }
    if (job.status !== "running") st.done = true;
    if (st.entries.length > 400) st.entries.splice(0, st.entries.length - 400);
    return st.entries;
  }

  function list(workspace, limit = 80) {
    const items = [];
    const runs = autopilot.list().filter((r) => r.workspace === workspace).slice(0, 3);   // list() đã xếp mới nhất trước
    for (const run of runs) {
      const t0 = run.createdAt || (run.steps[0] && run.steps[0].startedAt) || 0;
      if (t0) items.push({ at: t0, who: "pain", kind: "giao", text: "Pain nhận việc: " + short(run.task, 200) });
      for (const s of run.steps || []) {
        const job = s.jobId && jobs.get(s.jobId);
        items.push({ at: s.startedAt || t0, who: WHO(s.role), role: s.role, kind: "bat-dau", text: s.role + " bắt đầu lượt" + (s.model ? " · " + s.model + (s.effort ? " " + s.effort : "") : "") });
        if (job) {
          for (const e of readJob(job, s.role)) items.push(e);
          if (job.status !== "running" && job.ended_at) items.push({ at: job.ended_at, who: WHO(s.role), role: s.role, kind: job.status === "done" ? "xong" : "loi", text: s.role + (job.status === "done" ? " xong lượt" : " dừng: " + job.status) });
        }
      }
      if (["awaiting_approval", "awaiting_answer", "awaiting_scan", "attention"].includes(run.status)) items.push({ at: Date.now(), who: run.status === "attention" ? "pain" : "sakura", kind: "cho-duyet", text: { awaiting_approval: "Chờ sếp duyệt báo cáo", awaiting_answer: "Claude hỏi sếp chọn phương án", awaiting_scan: "Chờ sếp duyệt rà soát file", attention: "Luồng cần sếp xem: " + short(run.problem, 160) }[run.status] });
    }
    items.forEach((x, i) => { x.i = i; });
    return items.sort((a, b) => b.at - a.at || b.i - a.i).map(({ i, ...x }) => x).slice(0, Math.max(1, Math.min(300, Number(limit) || 80)));
  }

  return { list };
}

module.exports = { createJournal, parseLine };
