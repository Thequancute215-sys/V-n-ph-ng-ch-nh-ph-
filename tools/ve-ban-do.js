#!/usr/bin/env node
// Sinh docs/BAN-DO-HE-THONG.md (bản đồ workflow → kiến trúc → mã) từ đồ thị của Understand Anything trong .ua/:
//   .ua/domain-graph.json     miền nghiệp vụ → workflow → từng bước (trỏ tới file:dòng)
//   .ua/knowledge-graph.json  node file/hàm/route, quan hệ, 10 lớp kiến trúc, lộ trình đọc mã
// Chạy: node tools/ve-ban-do.js  (sau khi vẽ lại đồ thị bằng /understand và /understand-domain).
// Mục "Workflow trung tâm" và "Điểm cần anh rà" viết tay ở dưới (đã đối chiếu mã); phần còn lại sinh từ đồ thị. Không thư viện ngoài.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "docs", "BAN-DO-HE-THONG.md"));   // tham số: ghi ra chỗ khác (test)

// Chữ trong nhãn mermaid: bỏ ký tự làm vỡ cú pháp.
const lbl = (s) => String(s || "").replace(/"/g, "'").replace(/[<>]/g, "").replace(/[[\]{}|]/g, " ").replace(/\s+/g, " ").trim();
const mid = (id) => String(id).replace(/[^A-Za-z0-9_]/g, "_");
// Câu đầu của tóm tắt, cắt gọn.
const brief = (s, max = 170) => { const t = String(s || "").replace(/\s+/g, " ").trim(); const first = (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim(); return first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first; };
const link = (file, range) => {
  if (!file) return "";
  const r = Array.isArray(range) && range.length === 2 ? `#L${range[0]}-L${range[1]}` : "";
  return `[\`${file}${range ? ":" + range[0] : ""}\`](../${file.split("/").map(encodeURIComponent).join("/")}${r})`;
};

function main() {
  const kg = read(".ua/knowledge-graph.json");
  const dg = read(".ua/domain-graph.json");
  const byId = new Map(kg.nodes.map((n) => [n.id, n]));
  const dById = new Map(dg.nodes.map((n) => [n.id, n]));
  const domains = dg.nodes.filter((n) => n.type === "domain");
  const flowsOf = (d) => dg.edges.filter((e) => e.type === "contains_flow" && e.source === d.id).map((e) => dById.get(e.target)).filter(Boolean);
  const stepsOf = (f) => dg.edges.filter((e) => e.type === "flow_step" && e.source === f.id).sort((a, b) => a.weight - b.weight).map((e) => dById.get(e.target)).filter(Boolean);
  const flows = dg.nodes.filter((n) => n.type === "flow"), steps = dg.nodes.filter((n) => n.type === "step");
  const count = (arr, k) => arr.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
  const nt = count(kg.nodes, "type"), et = count(kg.edges, "type");
  const out = [];
  const w = (s = "") => out.push(s);

  w("# Bản đồ hệ thống Văn phòng AI — từ workflow tới mã nguồn");
  w();
  w(`> Sinh tự động bằng \`node tools/ve-ban-do.js\` từ \`.ua/domain-graph.json\` (workflow nghiệp vụ) và \`.ua/knowledge-graph.json\` (bản đồ hệ thống) do Understand Anything vẽ tại commit \`${String(kg.project.gitCommitHash || "").slice(0, 7)}\`. Mã đổi nhiều thì vẽ lại đồ thị (\`/understand\`, \`/understand-domain\`) rồi chạy lại lệnh trên; đừng sửa tay trang này.`);
  w();
  w("**Bản tương tác** (bấm vào từng node, xem quan hệ, đi theo lộ trình): trong repo chạy `/understand-dashboard` của plugin Understand Anything (Claude Code), hoặc lệnh `npx` trong README của dự án Understand Anything. Lệnh đó tải và chạy mã của bên thứ ba: chỉ chạy khi anh tin nguồn; đọc các sơ đồ dưới đây trên GitHub thì không cần.");
  w();
  w(`Quy mô: ${domains.length} miền nghiệp vụ, ${flows.length} workflow, ${steps.length} bước · ${kg.nodes.length} node (${nt.file || 0} file, ${nt.function || 0} hàm, ${nt.endpoint || 0} route API, ${(nt.document || 0) + (nt.config || 0) + (nt.pipeline || 0)} tài liệu/cấu hình/CI) · ${kg.edges.length} quan hệ (${et.calls || 0} lời gọi, ${et.imports || 0} import, ${et.tested_by || 0} liên kết test) · ${kg.layers.length} lớp kiến trúc · lộ trình ${kg.tour.length} bước.`);
  w();
  w("Mục lục: [1. Miền nghiệp vụ](#1-các-miền-nghiệp-vụ) · [2. Workflow trung tâm](#2-workflow-trung-tâm-ceo-giao-việc--đội-ai--ceo-duyệt) · [3. Từng workflow](#3-từng-workflow-từng-bước-trỏ-tới-mã) · [4. Lớp kiến trúc](#4-bản-đồ-hệ-thống-các-lớp-kiến-trúc) · [5. Lộ trình đọc mã](#5-lộ-trình-đọc-mã) · [6. Điểm cần anh rà](#6-điểm-phát-hiện-khi-vẽ--cần-anh-rà)");
  w();

  // 1. Miền nghiệp vụ
  w(`## 1. Các miền nghiệp vụ`);
  w();
  w(`${domains.length} miền, nối với nhau như sau (chữ trên mũi tên: miền này dùng gì của miền kia).`);
  w();
  // Mũi tên chỉ ghi số cho gọn; nội dung từng mũi tên liệt kê bên dưới sơ đồ.
  const cross = dg.edges.filter((x) => x.type === "cross_domain");
  w("```mermaid");
  w("flowchart TD");
  for (const d of domains) w(`  ${mid(d.id)}["<b>${lbl(d.name)}</b><br/>${flowsOf(d).length} workflow"]`);
  cross.forEach((e, i) => w(`  ${mid(e.source)} -->|${i + 1}| ${mid(e.target)}`));
  w("```");
  w();
  cross.forEach((e, i) => w(`${i + 1}. **${(dById.get(e.source) || {}).name}** → **${(dById.get(e.target) || {}).name}**: ${brief(e.description, 220)}`));
  w();
  for (const d of domains) w(`- **${d.name}** — ${brief(d.summary, 260)}`);
  w();

  // 2. Workflow trung tâm (viết tay, đã đối chiếu ctl/autopilot.js, ctl/runner.js, lib/kiem-agent.js)
  w(CENTRAL);
  w();

  // 3. Từng workflow
  w(`## 3. Từng workflow, từng bước trỏ tới mã`);
  w();
  for (const d of domains) {
    const fl = flowsOf(d);
    w(`### ${d.name}`);
    w();
    w(brief(d.summary, 400));
    w();
    const rules = d.domainMeta && d.domainMeta.businessRules;
    if (rules && rules.length) { w("**Luật nghiệp vụ:**"); for (const r of rules) w(`- ${r}`); w(); }
    // Workflow xếp chồng theo chiều dọc, mỗi workflow là một hàng ngang các bước (không quá rộng trên GitHub).
    w("```mermaid");
    w("flowchart TD");
    for (const f of fl) {
      w(`  subgraph ${mid(f.id)}["${lbl(f.name)}"]`);
      w("    direction LR");
      const st = stepsOf(f);
      st.forEach((s, i) => w(`    ${mid(s.id)}["${i + 1}. ${lbl(s.name)}"]`));
      for (let i = 1; i < st.length; i++) w(`    ${mid(st[i - 1].id)} --> ${mid(st[i].id)}`);
      w("  end");
    }
    for (let i = 1; i < fl.length; i++) w(`  ${mid(fl[i - 1].id)} ~~~ ${mid(fl[i].id)}`);   // liên kết ẩn: xếp các workflow chồng dọc
    w("```");
    w();
    for (const f of fl) {
      const meta = f.domainMeta || {};
      w(`#### ${f.name}`);
      w();
      w(`${brief(f.summary, 300)}${meta.entryPoint ? ` — *Kích hoạt:* \`${String(meta.entryPoint).replace(/`/g, "'")}\`${meta.entryType ? ` (${meta.entryType})` : ""}.` : ""}`);
      w();
      stepsOf(f).forEach((s, i) => w(`${i + 1}. **${s.name}** — ${brief(s.summary, 260)} ${link(s.filePath, s.lineRange)}`.trimEnd()));
      w();
    }
  }

  // 4. Lớp kiến trúc
  const layerOf = new Map();
  kg.layers.forEach((l) => l.nodeIds.forEach((id) => layerOf.set(id, l.id)));
  // Hàm/route thuộc lớp của file chứa nó.
  const fileOf = (n) => n && (n.filePath ? "file:" + n.filePath : null);
  const layerFor = (id) => layerOf.get(id) || layerOf.get(fileOf(byId.get(id))) || null;
  const pair = new Map();
  for (const e of kg.edges) {
    if (["tested_by", "documents", "contains", "exports"].includes(e.type)) continue;
    const a = layerFor(e.source), b = layerFor(e.target);
    if (!a || !b || a === b) continue;
    const [x, y] = kg.layers.findIndex((l) => l.id === a) < kg.layers.findIndex((l) => l.id === b) ? [a, b] : [b, a];
    pair.set(x + "|" + y, (pair.get(x + "|" + y) || 0) + 1);
  }
  w(`## 4. Bản đồ hệ thống: ${kg.layers.length} lớp kiến trúc`);
  w();
  w("```mermaid");
  w("flowchart TD");
  for (const l of kg.layers) w(`  ${mid(l.id)}["<b>${lbl(l.name)}</b><br/>${l.nodeIds.length} node"]`);
  for (const [k, n] of [...pair].sort()) { const [a, b] = k.split("|"); w(`  ${mid(a)} ---|${n}| ${mid(b)}`); }
  w("```");
  w();
  w("Số trên đường nối = số quan hệ giữa hai lớp (lời gọi, import, phụ thuộc, cấu hình, kích hoạt…), không tính `tested_by`, `documents`, `contains`. Hai tiến trình chạy trên máy CEO: **Văn phòng :7788** (`server.js`) và **OS Controller :7790** (`ctl/main.js`); trình duyệt chỉ nói chuyện với :7788, đường `/ctl/*` được `lib/ctlbridge.js` chuyển sang :7790 kèm token và chỉ khi yêu cầu đến từ chính máy.");
  w();
  for (const l of kg.layers) {
    w(`### ${l.name}`);
    w();
    w(brief(l.description, 400));
    w();
    const items = l.nodeIds.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => (a.type === "endpoint") - (b.type === "endpoint") || String(a.filePath || a.name).localeCompare(String(b.filePath || b.name)));
    for (const n of items) {
      if (n.type === "endpoint") { w(`- Route \`${n.name}\` (${n.filePath ? link(n.filePath, n.lineRange) : ""}) — ${brief(n.summary)}`); continue; }
      const fns = kg.edges.filter((e) => e.type === "contains" && e.source === n.id).map((e) => byId.get(e.target)).filter((x) => x && x.type === "function");
      w(`- ${link(n.filePath || n.id.replace(/^\w+:/, ""))} — ${brief(n.summary)}${fns.length ? ` *Hàm chính:* ${fns.slice(0, 8).map((f) => "`" + f.name + "`").join(", ")}${fns.length > 8 ? ` (+${fns.length - 8})` : ""}.` : ""}`);
    }
    w();
  }

  // 5. Lộ trình
  w(`## 5. Lộ trình đọc mã`);
  w();
  for (const t of kg.tour) {
    const files = t.nodeIds.map((id) => byId.get(id)).filter(Boolean).map((n) => "`" + (n.type === "endpoint" ? n.name : n.filePath || n.name) + "`");
    w(`${t.order}. **${t.title}** — ${t.description.replace(/\s+/g, " ").trim()} (${files.join(", ")})`);
  }
  w();
  w(FINDINGS);
  fs.writeFileSync(OUT, out.join("\n") + "\n");
  console.log(`Đã ghi ${path.relative(ROOT, OUT)}: ${domains.length} miền, ${flows.length} workflow, ${steps.length} bước, ${kg.layers.length} lớp.`);
}

const CENTRAL = `## 2. Workflow trung tâm: CEO giao việc → đội AI → CEO duyệt

Vòng lặp \`ctl/autopilot.js\` + \`ctl/runner.js\`. Mỗi ô tròn là một trạng thái thật của luồng (\`run.status\`). Mặc định 10 lượt nội bộ, 90 phút (tối đa 12 lượt, 120 phút).

\`\`\`mermaid
flowchart TD
  A["CEO giao việc<br/>POST /ctl/autopilot"] --> B{"Kiểm đầu vào<br/>1–12 lượt, ≤120 phút, repo sạch,<br/>agent.md có NEXT_OWNER"}
  B -->|"AI chạy toàn quyền"| S{"Rà file .md + thư viện<br/>ctl/ra-soat.js"}
  S -->|"có điểm lạ"| SA(["awaiting_scan<br/>CEO đọc rồi duyệt"]) --> C
  S -->|"sạch"| C["Tạo nhánh ai/việc-mã<br/>ctl/nhanh.js"]
  B -->|"không toàn quyền"| C
  C --> L(["running<br/>chạy lượt của vai giữ NEXT_OWNER<br/>Hinata → Sol → Claude → Astra → Sol → Claude"])
  L --> R["runner: claude -p / codex exec / agy -p<br/>job có timeout, MCP theo phòng (mcp-phong)"]
  R --> H{"Kiểm bàn giao JSON<br/>handoff.checkHandoff +<br/>bộ kiểm agent.md (lib/kiem-agent.js)"}
  H -->|"thiếu giải thích / sai luật agent.md<br/>(lần 1: trả lại đúng vai)"| L
  H -->|"AI hết hạn mức"| Q(["waiting_quota<br/>chờ giờ mở lại hoặc làm qua ChatGPT web"]) --> L
  H -->|"Claude hỏi CEO (ask_ceo)"| AQ(["awaiting_answer<br/>CEO chọn phương án"]) --> L
  H -->|"hợp lệ, chưa xong"| AU["Tự duyệt bàn giao nội bộ<br/>ghi NEXT_OWNER + commit chore(agent-sync)"] --> L
  H -->|"sai lần 2, lộ khóa, xung đột git, quá lượt/thời gian,<br/>Codex sửa quá 2 lần mà Claude vẫn trả về"| X(["reporting<br/>Claude viết báo cáo lỗi"])
  H -->|"Claude kết luận xong"| X
  X --> AP(["awaiting_approval / attention<br/>báo cáo + diff từng lượt"])
  AP -->|"CEO duyệt"| OK(["approved"]) --> P["Đẩy nhánh (không --force)<br/>mở trang tạo PR"] --> M["CEO merge trên GitHub<br/>CI: bộ kiểm agent.md + npm test"]
  AP -->|"CEO từ chối"| Z(["rejected"])
  M --> T["CEO phát hành: tag vX.Y.Z<br/>CI kiểm tag khớp package.json"] --> U["Máy người dùng: nút Cập nhật<br/>fast-forward, lỗi thì quay lại"]
\`\`\``;

const FINDINGS = `## 6. Điểm phát hiện khi vẽ — đã xử lý (17/11/2026)

Bốn điểm lần vẽ trước nêu đã được CEO giao sửa; test \`test/van-phong-sach.test.js\` giữ cho chúng không quay lại.

1. **Đường nhắn tin PIN cũ đã bỏ.** \`public/chat-ui.js\` (không trang nào nạp) và \`lib/chat.js\` (\`/chat/status\`, \`/chat/send\`, mã PIN ở \`~/.van-phong-ao/pin.txt\`) đã xoá, cùng phần che PIN trong \`server.js\`. Hỏi một AI trong đội đi qua \`/ctl/chat\` (\`ctl/chat.js\`), trên chính máy này hoặc điện thoại đã ghép (\`/dkx\`); để lại việc trong hòm thư của một vai thì dùng \`vp gui\`. README và hướng dẫn cho agent đã sửa theo.
2. **"Văn phòng chỉ đọc" nay ghi rõ ngoại lệ.** Máy chủ chỉ ghi vài file trạng thái của chính nó: \`data/.task-seen.json\`, \`data/.noiquy-seen.json\`, \`~/.van-phong-ao/keys.json\` (khi CEO lưu khóa) và \`~/.van-phong-ao/dieu-khien-xa.json\` + \`.log\` (điện thoại đã ghép). Đã ghi vào README, HUONG-DAN-CHO-AGENT.md, CLAUDE.md/AGENTS.md và chú thích đầu \`server.js\`.
3. **"Phát loa" giả đã thay bằng luồng thật.** Bỏ \`/api/broadcast\` (gợi ý theo từ khóa), \`/api/accept-broadcast\` (việc ghi trong bộ nhớ, không AI nào chạy) và mục \`pending\` luôn rỗng của \`lib/hopthu.js\`. Nút 📢 "Giao việc cả đội" mở mục **Giao việc cho cả đội** của bàn làm việc (\`POST /ctl/autopilot\`). "Task đang chạy" và phanh chỉ còn việc thật của OS Controller; ctl tắt thì phanh báo rõ là không dừng được.
4. **\`test/tat-ctl.test.js\` đã sửa chữ hỏng mã hoá** (12 dòng: chú thích, tên test, thông báo lỗi).
5. **4 trang chuyển hướng** (\`2d.html\`, \`board.html\`, \`congviec.html\`, \`tongquan.html\`) giữ lại cho dấu trang cũ — đúng chủ đích, chỉ ghi nhận.

Đồ thị \`.ua/\` được vá đúng phần này (bỏ node của mã đã xoá, viết lại workflow "Giao việc cả đội", neo lại số dòng theo nội dung). Các tính năng thêm vào sau lần vẽ (điều khiển từ điện thoại, skill, Chrome DevTools…) chưa có trên bản đồ: chạy lại \`/understand\` và \`/understand-domain\` để vẽ đủ.`;

main();
