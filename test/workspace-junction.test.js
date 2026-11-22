// Dự án chuyển ổ bằng junction (CEO chuyển repo văn phòng sang D: 21/11/2026): sổ vẫn lưu đường dẫn cũ, đường dẫn thật đã khác.
// ctl phải nhận dự án qua cả hai đường dẫn, đọc/ghi file bình thường, và vẫn chặn mọi thứ trước đây đã chặn.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { open } = require("../ctl/db");
const { createWorkspaces } = require("../ctl/workspaces");

// Junction trên Windows (không cần quyền Admin), symlink thư mục trên Linux/macOS.
const link = (target, at) => fs.symlinkSync(target, at, "junction");

function fixture(t) {
  try { const a = fs.mkdtempSync(path.join(os.tmpdir(), "vp-link-")); link(a, a + "-l"); fs.rmSync(a + "-l"); fs.rmSync(a, { recursive: true }); }
  catch { t.skip("máy này không tạo được junction/symlink"); return null; }
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vp-junction-")));
  const home = path.join(tmp, "home"); fs.mkdirSync(home);
  const cu = path.join(tmp, "o-c", "repo"), moi = path.join(tmp, "o-d", "repo");
  fs.mkdirSync(path.join(cu, "src"), { recursive: true });
  fs.writeFileSync(path.join(cu, "agent.md"), "# sổ\n");
  fs.writeFileSync(path.join(cu, "src", "a.txt"), "A");
  const db = open(path.join(tmp, "ctl"));
  const ws = createWorkspaces(db, { log() {} });
  ws.add(cu); // đăng ký lúc còn ở "ổ C"
  // Chuyển như script chuyển ổ: chép sang "ổ D", đổi tên bản cũ, đặt junction ở chỗ cũ.
  fs.mkdirSync(path.dirname(moi), { recursive: true });
  fs.cpSync(cu, moi, { recursive: true });
  fs.renameSync(cu, cu + ".cu");
  link(moi, cu);
  const homedir = os.homedir;
  os.homedir = () => home; // chốt "thư mục người dùng" chỉ nhìn vào home giả của test
  t.after(() => {
    os.homedir = homedir;
    db.close();
    assert.ok(tmp.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { tmp, home, ws, db, cu, moi };
}

test("dự án đã chuyển ổ bằng junction: nhận qua đường cũ lẫn đường mới, trả về dòng đã lưu", (t) => {
  const f = fixture(t); if (!f) return;
  const { ws, cu, moi } = f;
  assert.equal(ws.find(cu).path, cu);
  assert.equal(ws.find(moi).path, cu);
  assert.equal(ws.switchTo(moi).path, cu);
  assert.equal(ws.list().length, 1);
  // Đăng ký lại bằng đường mới không sinh dòng thứ hai.
  ws.add(moi);
  assert.deepEqual(ws.list().map((w) => w.path), [cu]);
});

test("dự án đã chuyển ổ: đọc/ghi file trong dự án được, vẫn chặn đi ra ngoài", (t) => {
  const f = fixture(t); if (!f) return;
  const { tmp, ws, cu, moi } = f;
  const r = ws.resolve(cu, "src/a.txt");
  assert.equal(r.rel, "src/a.txt");
  assert.equal(fs.readFileSync(r.real, "utf8"), "A");
  assert.equal(ws.resolve(moi, "src/a.txt").rel, "src/a.txt");
  const w = ws.resolve(cu, "src/moi.txt", { forWrite: true });
  assert.equal(w.rel, "src/moi.txt");
  assert.equal(path.dirname(w.real), path.join(moi, "src"));
  // Những gì trước đây bị chặn thì vẫn bị chặn.
  assert.throws(() => ws.resolve(cu, "../ngoai.txt"), (e) => e.code === "PATH_ESCAPE");
  assert.throws(() => ws.resolve(cu, ".git/config", { forWrite: true }), (e) => e.code === "PATH_DENIED");
  const ngoai = path.join(tmp, "ngoai"); fs.mkdirSync(ngoai); fs.writeFileSync(path.join(ngoai, "bi-mat.txt"), "x");
  link(ngoai, path.join(moi, "loi-ra"));
  assert.throws(() => ws.resolve(cu, "loi-ra/bi-mat.txt"), (e) => e.code === "PATH_ESCAPE");
  assert.throws(() => ws.resolve(cu, "loi-ra/moi.txt", { forWrite: true }), (e) => e.code === "PATH_ESCAPE");
});

test("thư mục ẩn của người dùng đã chuyển ổ bằng junction vẫn không đăng ký được", (t) => {
  const f = fixture(t); if (!f) return;
  const { tmp, home, ws } = f;
  const dich = path.join(tmp, "o-d", "claude"); fs.mkdirSync(path.join(dich, "projects"), { recursive: true });
  link(dich, path.join(home, ".claude")); // như ~/.claude -> D:\DuLieuTuC\claude
  // Cả thư mục CHỨA đích (như đăng ký D:\DuLieuTuC: đọc được claude\.credentials.json bên trong).
  for (const p of [path.join(home, ".claude"), dich, path.join(dich, "projects"), path.dirname(dich)]) {
    assert.throws(() => ws.add(p), (e) => e.code === "TOO_SENSITIVE", p);
  }
});

test("junction của dự án bị đổi sang thư mục ẩn sau khi đăng ký: từ chối, không mở rộng phạm vi", (t) => {
  const f = fixture(t); if (!f) return;
  const { tmp, home, ws, cu } = f;
  const dich = path.join(tmp, "o-d", "ssh"); fs.mkdirSync(dich);
  link(dich, path.join(home, ".ssh"));
  fs.rmSync(cu); // gỡ junction (không đụng nội dung đích)
  link(dich, cu);
  assert.throws(() => ws.find(cu), (e) => e.code === "WORKSPACE_DENIED" && /TOO_SENSITIVE|cấu hình ẩn/.test(e.message));
  assert.throws(() => ws.resolve(cu, "."), (e) => e.code === "WORKSPACE_DENIED");
});
