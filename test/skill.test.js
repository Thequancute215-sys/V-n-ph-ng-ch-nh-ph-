"use strict";
// Bộ skill mặc định (ctl/skill.js): cài cùng bộ cho 3 AI, ghim commit, không ghi đè skill của anh, bắt buộc khai skill_da_dung.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSkill, checkSkill, skillsCua, danhMuc } = require("../ctl/skill");
const { checkHandoff } = require("../ctl/handoff");

const C1 = "a".repeat(40), C2 = "b".repeat(40);
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

function fixture(t, commit = C1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-skill-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repos = path.join(root, "repos"), home = path.join(root, "home"), ai = { claude: path.join(root, "claude"), codex: path.join(root, "codex"), agy: path.join(root, "agy") };
  // repo "a/thiet-ke": mỗi AI một biến thể; repo "b/bo": nhiều skill, có một skill bị bỏ qua; repo "c/le": skill ở gốc repo
  put(path.join(repos, "a__thiet-ke", ".claude/skills/thiet-ke/SKILL.md"), "---\nname: thiet-ke\n---\nclaude " + commit);
  put(path.join(repos, "a__thiet-ke", ".agents/skills/thiet-ke/SKILL.md"), "---\nname: thiet-ke\n---\ncodex " + commit);
  put(path.join(repos, "a__thiet-ke", ".gemini/skills/thiet-ke/SKILL.md"), "---\nname: thiet-ke\n---\nagy " + commit);
  put(path.join(repos, "b__bo", "skills/tdd/SKILL.md"), "tdd"); put(path.join(repos, "b__bo", "skills/tdd/scripts/x.sh"), "echo hi");
  put(path.join(repos, "b__bo", "skills/rieng/SKILL.md"), "rieng"); put(path.join(repos, "b__bo", "skills/khong-phai-skill/README.md"), "x");
  put(path.join(repos, "c__le", "SKILL.md"), "le"); put(path.join(repos, "c__le", "references/a.md"), "ref");
  const catalog = path.join(root, "catalog.json");
  fs.writeFileSync(catalog, JSON.stringify({ nguon: [
    { repo: "a/thiet-ke", commit, nhom: "A", duong_dan: { claude: ".claude/skills/thiet-ke", codex: ".agents/skills/thiet-ke", agy: ".gemini/skills/thiet-ke" }, dung_cho: "thiết kế giao diện" },
    { repo: "b/bo", commit, nhom: "A", duong_dan: "skills", nhieu: true, bo_qua: ["rieng"], dung_cho: "quy trình" },
    { repo: "c/le", commit, nhom: "B", duong_dan: ".", ten: "le", dung_cho: "chỉ khi CEO giao" },
  ] }));
  const tai = (n) => path.join(repos, n.repo.replace("/", "__"));
  const sk = createSkill({ home: () => home, thuMuc: () => ai, file: catalog, tai });
  return { sk, ai, home, catalog, repos, tai };
}

test("danh mục thật hợp lệ: commit đủ 40 ký tự, nhóm A/B, không có ruflo/goclaw", () => {
  const d = danhMuc();
  assert.ok(d.nguon.length >= 10);
  assert.ok(!d.nguon.some((n) => /ruflo|goclaw/i.test(n.repo)), "hai repo bị loại không có trong danh mục");
  assert.ok(d.nguon.some((n) => n.nhom === "B"));
});

test("cài cho cả 3 AI: biến thể riêng từng AI, nhiều skill, bỏ qua skill bị loại, ghi dấu commit", (t) => {
  const { sk, ai } = fixture(t);
  assert.equal(sk.daCai(), false);
  assert.equal(sk.note(), "", "chưa cài thì không chèn gì vào prompt");
  const bao = sk.cai();
  assert.ok(bao.every((b) => b.kq === "cai"), JSON.stringify(bao));
  assert.match(fs.readFileSync(path.join(ai.codex, "thiet-ke/SKILL.md"), "utf8"), /codex/);
  assert.match(fs.readFileSync(path.join(ai.agy, "thiet-ke/SKILL.md"), "utf8"), /agy/);
  assert.ok(fs.existsSync(path.join(ai.claude, "tdd/scripts/x.sh")));
  assert.ok(!fs.existsSync(path.join(ai.claude, "rieng")), "skill trong bo_qua không cài");
  assert.ok(!fs.existsSync(path.join(ai.claude, "khong-phai-skill")), "thư mục không có SKILL.md không cài");
  assert.ok(fs.existsSync(path.join(ai.agy, "le/references/a.md")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(ai.claude, "tdd/.vp-skill.json"), "utf8")).commit, C1);
  assert.ok(sk.kiem().nguon.every((r) => r.trangThai === "du"));
  assert.ok(sk.cai().every((b) => b.kq === "giu"), "chạy lại thì giữ nguyên");
  const note = sk.note();
  assert.match(note, /Nhóm A — BẮT BUỘC/); assert.match(note, /thiet-ke: thiết kế giao diện/); assert.match(note, /Nhóm B — CHỈ dùng khi CEO giao đích danh[\s\S]*le: chỉ khi CEO giao/);
  assert.match(note, /skill_da_dung/); assert.match(note, /KHÔNG cài hook/);
});

test("không ghi đè skill anh tự cài; thư mục giống hệt thì nhận; danh mục nâng commit thì báo cũ rồi nâng", (t) => {
  const { sk, ai, catalog, repos } = fixture(t);
  put(path.join(ai.claude, "tdd/SKILL.md"), "bản tự viết của anh");
  put(path.join(ai.codex, "tdd/SKILL.md"), "tdd"); put(path.join(ai.codex, "tdd/scripts/x.sh"), "echo hi");
  const bao = sk.cai();
  assert.equal(bao.find((b) => b.ai === "claude" && b.ten === "tdd").kq, "trung");
  assert.equal(fs.readFileSync(path.join(ai.claude, "tdd/SKILL.md"), "utf8"), "bản tự viết của anh", "không ghi đè");
  assert.equal(bao.find((b) => b.ai === "codex" && b.ten === "tdd").kq, "nhan");
  // Danh mục lên commit mới
  const c = JSON.parse(fs.readFileSync(catalog, "utf8")); for (const n of c.nguon) n.commit = C2; fs.writeFileSync(catalog, JSON.stringify(c));
  put(path.join(repos, "a__thiet-ke", ".claude/skills/thiet-ke/SKILL.md"), "claude mới");
  assert.equal(sk.kiem().nguon.find((r) => r.repo === "a/thiet-ke" && r.ai === "claude").trangThai, "cu");
  assert.equal(sk.cai().find((b) => b.ai === "claude" && b.ten === "thiet-ke").kq, "nang");
  assert.equal(fs.readFileSync(path.join(ai.claude, "thiet-ke/SKILL.md"), "utf8"), "claude mới");
});

test("skillsCua báo lỗi khi đường dẫn đã ghim không còn trong repo", (t) => {
  const { tai } = fixture(t);
  assert.throws(() => skillsCua({ repo: "b/bo", commit: C1, nhom: "A", duong_dan: "khong-co", nhieu: true }, tai({ repo: "b/bo" })), { code: "MISSING" });
});

test("bàn giao: máy đã cài skill thì bắt buộc khai skill_da_dung; rỗng phải có lý do", () => {
  const base = { role: "SPEC_ARCHITECT", next_owner: "SOL_ARCHITECT_PLANNER", files: [], claim_fixed: [], giai_thich: [{ van_de: "Đặc tả còn thiếu luồng lỗi", da_lam: "Bổ sung luồng lỗi mất mạng", vi_sao: "Vùng [2.2] bắt buộc nhánh lỗi", phuong_an_khac: [] }] };
  assert.deepEqual(checkHandoff(base, "SPEC_ARCHITECT"), [], "chưa cài skill thì không đòi");
  assert.match(checkHandoff(base, "SPEC_ARCHITECT", { skills: true }).join(), /^skill_da_dung bắt buộc/);
  assert.match(checkSkill({ skill_da_dung: [] }).join(), /skill_ly_do/);
  assert.deepEqual(checkSkill({ skill_da_dung: [], skill_ly_do: "Lượt chỉ sửa chữ trong README, không skill nào khớp" }), []);
  assert.deepEqual(checkHandoff({ ...base, skill_da_dung: ["impeccable", "ui-ux-pro-max"] }, "SPEC_ARCHITECT", { skills: true }), []);
  assert.match(checkSkill({ skill_da_dung: ["rm -rf /"] }).join(), /bắt buộc/);
});
