"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { open } = require("../ctl/db");
const { createWorkspaces } = require("../ctl/workspaces");

const protocol = (owner = "CODEX_ASTRA_DEV", blockers = "") => `# Sổ dự án
## [1] Công nghệ
- Node.js 24
## [2] Đặc tả
### [2.1] Tính năng
- Xem việc thật
- NEXT_OWNER: WRONG_EXAMPLE
- [ ] OPEN FAKE-H01 [HIGH] Ví dụ ngoài Vùng [5]
## [3] Kiến trúc
- API JSON
## [4] Khóa lượt
- CURRENT_PHASE: Phase 7 - Vận hành
- NEXT_OWNER (MUTEX LOCK): ${owner}
- LAST_UPDATED_BY: CLAUDE_AUDITOR
### [4.1] Nhật ký
- Đã viết giao diện
- CLAIM_FIXED: P7-H01 -> public/index.html
### [4.2] Lưu trữ
- Không phải nhật ký hiện tại
## [5] Chốt chặn
- AUDIT_STATUS: CONDITIONAL PASS
${blockers}
## [6] Ngoài giao thức
- [ ] OPEN FAKE-H02 [HIGH] Không thuộc Vùng [5]
`;

function fixture(t, content) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-tiendo-"));
  const root = path.join(tmp, "repo"); fs.mkdirSync(root);
  if (content !== null) fs.writeFileSync(path.join(root, "agent.md"), content, "utf8");
  const db = open(path.join(tmp, "ctl"));
  // Đăng ký trực tiếp để kiểm đúng trường hợp repo chưa có agent.md, không tự sinh mẫu.
  db.prepare("INSERT INTO workspaces(path,name,added_at) VALUES(?,?,?)").run(fs.realpathSync(root), "repo", Date.now());
  const ws = createWorkspaces(db, { log() {} });
  t.after(() => {
    db.close();
    assert.ok(path.resolve(tmp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { ws, root };
}

test("tiến độ overview: đọc đúng vùng, Phase, vai, audit và nhật ký thật", (t) => {
  const { ws, root } = fixture(t, protocol());
  const { progress: p, progressReason } = ws.overview(root);
  assert.equal(progressReason, null);
  assert.equal(p.phase, "Phase 7 - Vận hành");
  assert.equal(p.nextOwner, "CODEX_ASTRA_DEV");
  assert.equal(p.lastUpdatedBy, "CLAUDE_AUDITOR");
  assert.equal(p.auditStatus, "CONDITIONAL PASS");
  assert.deepEqual(p.log41, ["- Đã viết giao diện", "- CLAIM_FIXED: P7-H01 -> public/index.html"]);
  assert.deepEqual(p.openBlockers, []);
  assert.deepEqual(p.emptySections, []);
  assert.match(p.nextStep, /viết code.*CLAIM_FIXED.*0 blocker OPEN/);
});

test("tiến độ overview: chỉ lấy blocker OPEN ở Vùng [5], che secret", (t) => {
  const { ws, root } = fixture(t, protocol("CLAUDE_AUDITOR", "  - [ ] OPEN P7-H01 [HIGH - public/index.html]: Lỗi token=private-value\n- [ ] OPEN P7-M02 [MEDIUM]: Chờ kiểm\n- [x] RESOLVED P7-C01 [CRITICAL]: Đã sửa"));
  const o = ws.overview(root), p = o.progress;
  assert.deepEqual(p.openBlockers.map((b) => [b.id, b.level]), [["P7-H01", "HIGH"], ["P7-M02", "MEDIUM"]]);
  assert.match(p.openBlockers[0].text, /token=‹ẩn›/);
  assert.doesNotMatch(JSON.stringify(o), /private-value/);
  assert.match(p.nextStep, /Vùng \[5\].*2 blocker OPEN.*chưa được tăng Phase/);
});

test("tiến độ overview: tìm tiêu đề mục còn nội dung mẫu, không nhầm tham chiếu vùng", (t) => {
  const text = protocol("SOL_ARCHITECT_PLANNER").replace("- Node.js 24", "- Frontend: [Chờ chốt: công nghệ]")
    .replace("- Xem việc thật", "- [Tên tính năng]\n- [Chưa cập nhật]")
    .replace("- API JSON", "- API JSON khớp Vùng [2]");
  const { ws, root } = fixture(t, text), p = ws.overview(root).progress;
  assert.deepEqual(p.emptySections, ["[1] Công nghệ", "[2.1] Tính năng"]);
  assert.match(p.nextStep, /Vùng \[1\].*Vùng \[3\]/);
});

test("tiến độ overview: không có agent.md thì null kèm lý do, không tạo file", (t) => {
  const { ws, root } = fixture(t, null), o = ws.overview(root);
  assert.equal(o.progress, null);
  assert.match(o.progressReason, /chưa có agent.md/);
  assert.equal(fs.existsSync(path.join(root, "agent.md")), false);
});

test("tiến độ overview: giữ tối đa 25 dòng log mới nhất và không suy đoán vai lạ", (t) => {
  const text = protocol("UNKNOWN_ROLE").replace("- Đã viết giao diện\n- CLAIM_FIXED: P7-H01 -> public/index.html", Array.from({ length: 30 }, (_, i) => "- Dòng " + i).join("\n"));
  const { ws, root } = fixture(t, text), p = ws.overview(root).progress;
  assert.equal(p.log41.length, 25); assert.equal(p.log41[0], "- Dòng 5"); assert.equal(p.log41.at(-1), "- Dòng 29");
  assert.match(p.nextStep, /Chưa xác định được vai/);
});

test("tiến độ overview: nextStep chỉ dẫn đúng SPEC và Sol cố vấn", (t) => {
  const { ws, root } = fixture(t, protocol("SPEC_ARCHITECT"));
  assert.match(ws.overview(root).progress.nextStep, /Vùng \[2\]/);
  fs.writeFileSync(path.join(root, "agent.md"), protocol("SOL_ARCHITECT_ADVISOR"), "utf8");
  assert.match(ws.overview(root).progress.nextStep, /nhận xét ở Vùng \[4.1\]/);
});

test("tiến độ dùng chung: thoát HTML từ cả tiến độ, commit, luồng và bàn giao", () => {
  const vm = require("node:vm"), context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/progress-view.js"), "utf8"), context);
  const payload = '<img src=x onerror="alert(1)">';
  const html = context.RepoProgress.html({ workspace: "repo", progress: { phase: payload, openBlockers: [{ text: payload }], log41: [payload], emptySections: [payload] }, repo: { commits: [{ subject: payload }] } },
    [{ workspace: "repo", task: payload, status: "running", steps: [] }], [{ workspace: "repo", role: payload }]);
  assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img/);
  for (const title of ["Đang dừng ở đâu", "Đã làm gì", "Còn cần gì"]) assert.ok(html.includes(title));
});
