// Bộ kiểm chu trình agent.md (CEO duyệt 07/11/2026): máy tự kiểm những luật đo được của giao thức (~/.ai/agent-protocol.md),
// thay vì trông vào AI tự nhớ. Dùng ở hai nơi: văn phòng kiểm mỗi lượt AI trước khi nhận bàn giao (ctl/runner.js) và
// CI của GitHub kiểm mọi commit sửa agent.md trong PR (tools/kiem-agent.js). Chỉ đọc chữ, không thư viện ngoài.
// Giới hạn: vai lấy từ message commit hoặc từ lượt văn phòng đang chạy, nên đây là lưới bắt sơ suất, không phải lớp bảo mật.
// File này TỰ CHẠY ĐƯỢC MỘT MÌNH (không require file nào của văn phòng): văn phòng chép nguyên file sang repo dự án thành
// tools/kiem-agent.js (ctl/bo-kiem.js) để CI của dự án dùng. Chạy: node kiem-agent.js [đường dẫn] [--tu <nhánh>] [--neu-co].
"use strict";
// Chuỗi đúng hình dạng khóa thật. Chép từ KEY_SHAPE của lib/mask.js (test giữ hai bản giống nhau) để file tự chạy được.
const KEY_SHAPE = /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})/;
const looksLikeKey = (s) => KEY_SHAPE.test(String(s || ""));

// FRONTEND_UIUX_DEV (Kakashi, Antigravity — CEO thêm 11/11/2026): viết code giao diện theo Vùng [2.4]; Astra giữ backend + API.
const ROLES = ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV", "CLAUDE_AUDITOR"];
// LAST_UPDATED_BY còn nhận dấu của người/máy không phải vai AI: CEO (ý tưởng mới), ctl khi tự tạo agent.md, lần khởi tạo đầu.
const WRITERS = [...ROLES, "CEO", "CTL_ONBOARDING", "Auto-Bootstrap"];
const AUDIT = /^(PENDING|PASS|CONDITIONAL PASS|REJECT)\b/;
const ID = /\bP\d+-[CHM]\d+\b/;
const MAX = { "4.1": 25, "4.2": 5 };
// Vùng nào vai nào được ghi (Vùng [4] đầu trang ai cũng ghi: LAST_UPDATED_BY / NEXT_OWNER).
const OWNER = {
  "1": ["SOL_ARCHITECT_PLANNER"],
  "2": ["SPEC_ARCHITECT"],
  "3": ["SOL_ARCHITECT_PLANNER"],
  "4.1": ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV"],
  "4.2": ["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV", "FRONTEND_UIUX_DEV"],
  "5": ["CLAUDE_AUDITOR"],
};
const ZONES = ["1", "2", "3", "4", "4.1", "4.2", "5"];

// Tách agent.md thành các vùng theo tiêu đề "## [N]" và "### [4.1]" / "### [4.2]"; tiêu đề con khác (vd. [2.1]) thuộc vùng cha.
function parse(txt) {
  const zones = {};
  let cur = null;
  for (const line of String(txt).replace(/\r\n/g, "\n").split("\n")) {
    const h = /^(##|###)\s+\[(\d+(?:\.\d+)?)\]/.exec(line);
    if (h && (h[1] === "##" || ["4.1", "4.2"].includes(h[2]))) { cur = h[2]; zones[cur] = []; continue; }
    if (cur) zones[cur].push(line);
  }
  const head = (zones["4"] || []).join("\n");
  const five = (zones["5"] || []).join("\n");
  const field = (re, s) => { const m = re.exec(s); return m ? m[1].trim() : null; };
  const phase = field(/^- CURRENT_PHASE:\s*(.+)$/m, head);
  const blockers = (zones["5"] || []).filter((l) => /^\s*- \[[ xX]\]/.test(l));
  return {
    zones,
    phase,
    phaseNo: phase && /Phase\s+(\d+)/i.test(phase) ? Number(/Phase\s+(\d+)/i.exec(phase)[1]) : null,
    last: field(/^- LAST_UPDATED_BY:\s*(\S+)/m, head),
    next: field(/^- NEXT_OWNER[^:\n]*:\s*(\S+)/m, head),
    audit: field(/^- AUDIT_STATUS:\s*(.+)$/m, five),
    round: field(/^- REVIEW_ROUND:\s*(\S+)/m, five),
    blockers,
    open: blockers.filter((l) => /^\s*- \[ \]/.test(l)),
  };
}

const lines = (z) => (z || []).filter((l) => l.trim()).length;

// Luật đọc được từ một bản agent.md. Trả về danh sách lỗi (chuỗi tiếng Việt); rỗng là đạt.
function checkText(txt) {
  const a = parse(txt), bad = [];
  for (const z of ZONES) if (!a.zones[z]) bad.push(`Thiếu tiêu đề Vùng [${z}]`);
  if (!a.phase) bad.push("Thiếu dòng CURRENT_PHASE ở Vùng [4]");
  else if (a.phaseNo === null) bad.push("CURRENT_PHASE phải có dạng \"Phase <số> - <tên>\"");
  if (!a.last) bad.push("Thiếu dòng LAST_UPDATED_BY ở Vùng [4]");
  else if (!WRITERS.includes(a.last)) bad.push(`LAST_UPDATED_BY "${a.last}" không phải vai hợp lệ (${WRITERS.join(", ")})`);
  if (!a.next) bad.push("Thiếu dòng NEXT_OWNER ở Vùng [4]");
  else if (!ROLES.includes(a.next)) bad.push(`NEXT_OWNER "${a.next}" không phải vai hợp lệ (${ROLES.join(", ")})`);
  if (a.zones["5"]) {
    if (!a.audit) bad.push("Thiếu dòng AUDIT_STATUS ở Vùng [5]");
    else if (!AUDIT.test(a.audit)) bad.push("AUDIT_STATUS phải bắt đầu bằng PENDING, PASS, CONDITIONAL PASS hoặc REJECT");
    if (a.round && !/^[0-3]\/3$/.test(a.round)) bad.push(`REVIEW_ROUND "${a.round}" phải là 0/3 đến 3/3`);
  }
  for (const [z, max] of Object.entries(MAX)) if (lines(a.zones[z]) > max) bad.push(`Vùng [${z}] có ${lines(a.zones[z])} dòng, tối đa ${max}: nén log cũ (Luật 2)`);
  for (const l of a.blockers) {
    const t = l.trim();
    if (/^- \[ \]/.test(t) && !/^- \[ \] OPEN\b/.test(t)) bad.push(`Blocker chưa đóng phải ghi "[ ] OPEN <ID>": ${t.slice(0, 80)}`);
    else if (/^- \[[xX]\]/.test(t) && !/^- \[[xX]\] RESOLVED\b/.test(t)) bad.push(`Blocker đã đóng phải ghi "[x] RESOLVED": ${t.slice(0, 80)}`);
    else if (/^- \[ \] OPEN\b/.test(t) && !ID.test(t)) bad.push(`Blocker thiếu ID dạng P2-C01: ${t.slice(0, 80)}`);
  }
  if (looksLikeKey(txt)) bad.push("agent.md có chuỗi trông như khóa API/token: xoá ngay, không ghi secret vào file này");
  return bad;
}

// Luật về một lần sửa: từ bản `before` sang `after`, do vai `role` ghi.
// force: CEO gõ FORCE_OVERRIDE (lỗi về quyền chỉ còn là cảnh báo). turnLines: kiểm LAST_UPDATED_BY / NEXT_OWNER khớp
// message commit (CI); văn phòng kiểm trước khi CEO duyệt nên chưa có hai dòng đó. onlyNew: chỉ tính lỗi bản `after` mà
// bản `before` chưa có (văn phòng: không chặn lượt AI vì agent.md cũ của repo vốn đã thiếu vùng hay quá dài).
function checkChange(before, after, { role, force = false, next = null, turnLines = false, onlyNew = false } = {}) {
  const key = (s) => s.replace(/\d+/g, "#");   // "có 27 dòng" và "có 26 dòng" là cùng một lỗi có sẵn
  const old = onlyNew && before != null ? new Set(checkText(before).map(key)) : new Set();
  const loi = checkText(after).filter((x) => !old.has(key(x))), canhBao = [];
  const perm = (msg) => (force ? canhBao : loi).push(msg + (force ? " (cho qua vì FORCE_OVERRIDE)" : ""));
  const b = before == null ? null : parse(before), a = parse(after);
  const isAi = ROLES.includes(role);
  if (b && isAi) {
    if (b.next && b.next !== role) perm(`Không phải lượt của ${role}: agent.md trước đó ghi NEXT_OWNER: ${b.next} (Luật 1)`);
    for (const z of Object.keys(OWNER)) {
      if ((b.zones[z] || []).join("\n").trim() !== (a.zones[z] || []).join("\n").trim() && !OWNER[z].includes(role)) perm(`${role} sửa Vùng [${z}], vùng này chỉ ${OWNER[z].join(" / ")} được ghi`);
    }
    if (role === "CLAUDE_AUDITOR" && b.phase !== a.phase) perm("CLAUDE_AUDITOR không tự sửa CURRENT_PHASE: ghi \"Phase X được phép đóng\" ở Vùng [5] rồi giao CODEX_ASTRA_DEV");
  }
  if (b && b.phaseNo !== null && a.phaseNo !== null && a.phaseNo > b.phaseNo && a.open.length) {
    loi.push(`Tăng CURRENT_PHASE từ Phase ${b.phaseNo} lên Phase ${a.phaseNo} khi Vùng [5] còn ${a.open.length} mục [ ] OPEN (Luật 3)`);
  }
  if (turnLines) {
    if (role && a.last !== role) loi.push(`LAST_UPDATED_BY phải là ${role} (vai ghi trong message commit), đang là ${a.last}`);
    if (next && a.next !== next) loi.push(`NEXT_OWNER phải là ${next} (theo message commit), đang là ${a.next}`);
  }
  return { loi, canhBao };
}

// Message commit chuẩn: "chore(agent-sync): VAI -> NEXT: VAI_TIẾP[ — ghi chú]".
function parseSync(subject) {
  const m = /^chore\(agent-sync\):\s*([A-Za-z_-]+)\s*->\s*NEXT:\s*([A-Z_]+)/.exec(String(subject || ""));
  return m ? { role: m[1], next: m[2], force: /FORCE_OVERRIDE/.test(subject) || m[1] === "CEO" } : null;
}

// Kiểm mọi commit sửa agent.md từ điểm rẽ nhánh với `from` tới HEAD (CI chạy trên PR). Mỗi commit sửa agent.md phải là commit
// riêng với message chore(agent-sync) (giao thức [4]), rồi kiểm lần sửa đó theo vai trong message.
function checkHistory(root, from, git = gitIn(root)) {
  const base = git(["merge-base", from, "HEAD"]).trim();
  const out = [];
  const log = git(["log", "--no-merges", "--reverse", "--format=%H%x1f%s", base + "..HEAD", "--", "agent.md"]).trim();
  for (const row of log ? log.split("\n") : []) {
    const [sha, subject] = row.split("\x1f");
    const short = sha.slice(0, 7), loi = [], canhBao = [];
    const show = (rev) => { try { return git(["show", rev + ":agent.md"]); } catch { return null; } };
    const after = show(sha);
    const files = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", sha]).trim().split("\n").filter(Boolean);
    const sync = parseSync(subject);
    if (after == null) loi.push("commit xoá agent.md");
    if (!sync) loi.push("commit sửa agent.md phải có message \"chore(agent-sync): VAI -> NEXT: VAI_TIẾP\"");
    if (files.length > 1) loi.push("commit sửa agent.md phải tách riêng, không kèm file khác: " + files.filter((f) => f !== "agent.md").slice(0, 5).join(", "));
    if (after != null) {
      const r = checkChange(show(sha + "^"), after, sync ? { role: sync.role, next: sync.next, force: sync.force, turnLines: true } : {});
      loi.push(...r.loi); canhBao.push(...r.canhBao);
    }
    out.push({ commit: short, subject, loi, canhBao });
  }
  return out;
}

function gitIn(root) {
  const { execFileSync } = require("child_process");
  return (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

// Dòng lệnh. Trả mã thoát: 0 đạt, 1 có lỗi, 2 không đọc được file hoặc git.
//   [đường dẫn]   file agent.md cần kiểm (mặc định agent.md ở thư mục đang đứng)
//   --tu <nhánh>  thêm: kiểm mọi commit sửa agent.md từ chỗ rẽ khỏi <nhánh> (vd. origin/main)
//   --neu-co      repo không có agent.md (vd. repo công khai giữ agent.md trên máy) thì bỏ qua, coi là đạt
function main(args, { log = console.log, error = console.error } = {}) {
  const fs = require("fs"), path = require("path");
  const at = args.indexOf("--tu");
  const from = at >= 0 ? args[at + 1] : null;
  if (at >= 0 && (!from || from.startsWith("--"))) { error("Thiếu tên nhánh sau --tu (vd. --tu origin/main)"); return 2; }
  const file = path.resolve(args.find((a, i) => !a.startsWith("--") && (at < 0 || i !== at + 1)) || "agent.md");
  let txt;
  try { txt = fs.readFileSync(file, "utf8"); }
  catch {
    if (args.includes("--neu-co") && !fs.existsSync(file)) { log("– Không có " + path.basename(file) + ": bỏ qua (--neu-co)"); return 0; }
    error("Không đọc được " + file); return 2;
  }
  let fail = 0;
  const loi = checkText(txt);
  log((loi.length ? "✗ " : "✓ ") + path.basename(file) + (loi.length ? "" : ": đạt"));
  for (const l of loi) log("   - " + l);
  fail += loi.length;
  if (from) {
    let rows;
    try { rows = checkHistory(path.dirname(file), from); } catch (e) { error("Không đọc được lịch sử git từ " + from + ": " + String(e.stderr || e.message).trim()); return 2; }
    log(rows.length ? `Commit sửa agent.md từ ${from}: ${rows.length}` : `Không có commit nào sửa agent.md từ ${from}`);
    for (const r of rows) {
      log((r.loi.length ? "✗ " : "✓ ") + r.commit + " " + r.subject.slice(0, 100));
      for (const l of r.loi) log("   - " + l);
      for (const c of r.canhBao) log("   ! " + c);
      fail += r.loi.length;
    }
  }
  return fail ? 1 : 0;
}

module.exports = { ROLES, WRITERS, OWNER, KEY_SHAPE, parse, checkText, checkChange, parseSync, checkHistory, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
