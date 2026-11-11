// Mục lục từ bản đồ hệ thống (CEO duyệt 11/11/2026): trước mỗi lượt AI, tra đồ thị Understand Anything của repo
// (.ua/knowledge-graph.json + .ua/domain-graph.json) để chọn đúng vài file/hàm/workflow liên quan tới việc được giao,
// rồi đưa vào prompt kèm file:dòng. AI đọc đúng chỗ thay vì dò cả repo → bớt token đọc file ở mọi vai.
// Tóm tắt trong đồ thị chỉ là gợi ý (vẽ ở một commit cũ hơn có thể lệch): AI phải mở mã để kiểm trước khi kết luận.
// Repo chưa có đồ thị thì không làm gì. Chỉ đọc, không thư viện ngoài.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const MAX_NODES = 14, MAX_FLOWS = 2, MAX_CHARS = 3500;
// Từ quá chung (tiếng Việt bỏ dấu + tiếng Anh) không dùng để so khớp.
const STOP = new Set(("cho cua va cac nhung trong duoc khong mot nay lam viec the voi tu den khi neu thi la co da dang se can phai hay hoac "
  + "nhu sau truoc tren duoi ra vao lai con moi bang theo ve tai nen cung chi rat qua them sua lam lai xem doc ghi file ham trang du an "
  + "the and for with from that this into when then also have will can not are was use the anh em toi ban ceo giao").split(/\s+/));
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const words = (s) => [...new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
const brief = (s, max = 150) => { const t = String(s || "").replace(/\s+/g, " ").trim(); const first = (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim(); return first.length > max ? first.slice(0, max - 1) + "…" : first; };

// Đồ thị đọc lại khi file đổi (so mtime), không đọc mỗi lượt.
const cache = new Map();
function load(root) {
  const kgF = path.join(root, ".ua", "knowledge-graph.json"), dgF = path.join(root, ".ua", "domain-graph.json");
  let st;
  try { st = fs.statSync(kgF); } catch { return null; }
  let dgM = 0;
  try { dgM = fs.statSync(dgF).mtimeMs; } catch {}
  const key = st.mtimeMs + ":" + dgM, hit = cache.get(root);
  if (hit && hit.key === key) return hit.g;
  let kg, dg = null;
  try { kg = JSON.parse(fs.readFileSync(kgF, "utf8")); } catch { return null; }
  try { dg = JSON.parse(fs.readFileSync(dgF, "utf8")); } catch {}
  // Chỉ mục: mỗi node một túi từ, trọng số theo chỗ xuất hiện.
  const nodes = (kg.nodes || []).filter((n) => n.filePath).map((n) => ({
    n, name: words(n.name + " " + String(n.id).split(":").pop()), file: words(n.filePath), tags: words((n.tags || []).join(" ")), text: words(n.summary),
  }));
  const flows = dg ? dg.nodes.filter((x) => x.type === "flow").map((f) => {
    const steps = dg.edges.filter((e) => e.type === "flow_step" && e.source === f.id).sort((a, b) => a.weight - b.weight).map((e) => dg.nodes.find((x) => x.id === e.target)).filter(Boolean);
    return { f, steps, name: words(f.name), text: words(f.summary + " " + steps.map((s) => s.name).join(" ")) };
  }) : [];
  const g = { commit: (kg.project && kg.project.gitCommitHash) || null, nodes, flows };
  cache.set(root, { key, g });
  return g;
}

const hits = (q, bag) => q.reduce((a, w) => a + (bag.includes(w) ? 1 : bag.some((b) => b.length >= 5 && (b.startsWith(w) || w.startsWith(b))) ? 0.5 : 0), 0);

// Chọn phần liên quan tới `text` (việc giao + blocker OPEN). Trả { commit, flows:[...], nodes:[...] } hoặc null.
function relevant(root, text) {
  const g = load(root);
  const q = words(text);
  if (!g || !q.length) return null;
  // Phải khớp tên/đường dẫn/nhãn, hoặc khớp ít nhất 3 từ trong tóm tắt: khớp lỏng 1–2 từ chung chung thì bỏ.
  const nodes = g.nodes.map((x) => { const strong = 3 * hits(q, x.name) + 3 * hits(q, x.file) + 2 * hits(q, x.tags), weak = hits(q, x.text); return { x, s: strong + weak, ok: strong >= 2 || weak >= 3 }; })
    .filter((r) => r.ok && r.s >= 3).sort((a, b) => b.s - a.s || (a.x.n.type === "file") - (b.x.n.type === "file"));
  // Workflow thứ hai chỉ lấy khi gần ngang workflow đầu (tránh kéo theo workflow khớp lỏng).
  const ranked = g.flows.map((x) => ({ x, s: 3 * hits(q, x.name) + hits(q, x.text) })).filter((r) => r.s >= 3).sort((a, b) => b.s - a.s);
  const flows = ranked.filter((r, i) => i === 0 || r.s >= 0.75 * ranked[0].s).slice(0, MAX_FLOWS);
  // Không lặp file: ưu tiên hàm/route (có dòng cụ thể), mỗi file tối đa 3 mục.
  const perFile = new Map(), picked = [];
  for (const { x } of nodes) {
    const f = x.n.filePath, c = perFile.get(f) || 0;
    if (c >= 3) continue;
    perFile.set(f, c + 1);
    picked.push(x.n);
    if (picked.length >= MAX_NODES) break;
  }
  if (!picked.length && !flows.length) return null;
  return { commit: g.commit, flows: flows.map((r) => r.x), nodes: picked };
}

const at = (n) => n.filePath + (Array.isArray(n.lineRange) ? `:${n.lineRange[0]}-${n.lineRange[1]}` : "");
// Số file mã đã đổi từ commit vẽ đồ thị tới bản đang làm (cả file chưa commit); bỏ qua chính đồ thị và trang bản đồ.
function drift(root, commit) {
  if (!commit) return 0;
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 8000, stdio: ["ignore", "pipe", "ignore"] });
  try { return new Set(git(["diff", "--name-only", commit, "--", ".", ":(exclude).ua", ":(exclude)docs/BAN-DO-HE-THONG.md"]).split(/\r?\n/).filter(Boolean)).size; } catch { return 0; }
}

// Đoạn thêm vào prompt. Rỗng khi repo chưa có đồ thị hoặc không có gì khớp.
function note(root, text) {
  const r = relevant(root, text);
  if (!r) return "";
  const n = drift(root, r.commit);
  const stale = n ? ` (đồ thị vẽ ở commit ${r.commit.slice(0, 7)}, từ đó ${n} file mã đã đổi: dòng có thể lệch)` : "";
  const lines = [`\n\nMỤC LỤC TỪ BẢN ĐỒ HỆ THỐNG (.ua)${stale}: các chỗ có vẻ liên quan tới việc này. Đọc các chỗ này trước thay vì dò cả repo; tóm tắt chỉ là gợi ý, mở mã kiểm trước khi kết luận. Cần chỗ khác thì vẫn tự tìm.`];
  for (const f of r.flows) {
    lines.push(`Workflow "${f.f.name}": ` + f.steps.map((s, i) => `${i + 1}) ${s.name} [${at(s)}]`).join(" → "));
  }
  for (const n of r.nodes) lines.push(`- ${at(n)} ${n.type === "file" ? "" : "(" + n.type + " " + n.name + ") "}— ${brief(n.summary)}`);
  let s = lines.join("\n");
  if (s.length > MAX_CHARS) s = s.slice(0, s.lastIndexOf("\n", MAX_CHARS)) + "\n- …(cắt bớt)";
  return s;
}

module.exports = { relevant, note, words, fold };
