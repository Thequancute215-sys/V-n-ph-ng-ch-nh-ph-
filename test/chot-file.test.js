"use strict";
// Chốt file cho lượt chat CEO duyệt (CEO yêu cầu 28/11/2026): chặn sửa file lung tung, xoá dữ liệu phải hỏi rõ.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chup, kiemSau, apDung, chuanDuong, khop } = require("../ctl/chot-file");

test("đường dẫn khai trong xin_lam: chỉ nhận đường dẫn tương đối trong repo", () => {
  assert.equal(chuanDuong("src\\a.js"), "src/a.js");
  assert.equal(chuanDuong("./src/"), "src/");
  assert.equal(chuanDuong("src/**"), "src/**");
  for (const xau of ["../ngoai.txt", "a/../../b", "/etc/passwd", "C:/Windows/x", "c:\\x", "", "a\u0000b", "x".repeat(401), ".", "a/./b", "a//b", "src/*", "*.js",
    "agent.md", "AGENT.MD", ".git/config", "sub/.git/hooks/x", ".GIT/", {}, null, 5]) assert.equal(chuanDuong(xau), null, JSON.stringify(xau));
  assert.equal(chuanDuong("app/users/[id]/page.tsx"), "app/users/[id]/page.tsx");
  assert.equal(chuanDuong("docs/agent.md"), "docs/agent.md", "chỉ chặn agent.md ở gốc");
  assert.ok(khop("src/a.js", ["src/"]) && khop("src/b/c.js", ["src/**"]) && khop("ok.txt", ["ok.txt"]));
  assert.ok(!khop("srcx/a.js", ["src/"]) && !khop("ok.txt.bak", ["ok.txt"]));
});

test("ảnh chụp không đụng index/nhánh của CEO; file đã stage và bản sửa dở của CEO giữ nguyên", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chot-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "t"); git("config", "user.email", "t@l");
  fs.writeFileSync(path.join(repo, "a.txt"), "1\n"); git("add", "."); git("commit", "-qm", "i");
  fs.writeFileSync(path.join(repo, "a.txt"), "2\n"); git("add", "a.txt");          // CEO đã stage
  fs.writeFileSync(path.join(repo, "b.txt"), "dở\n");                              // CEO sửa dở, chưa theo dõi
  const truocStatus = git("status", "--porcelain"), truocIndex = git("diff", "--cached");
  const anh = chup(repo);
  fs.writeFileSync(path.join(repo, "c.txt"), "ai\n");
  const k = kiemSau(repo, anh, { suaFile: ["c.txt"], xoa: [] });
  assert.deepEqual(k.dungPhamVi, ["c.txt"]);
  assert.equal(git("diff", "--cached"), truocIndex, "index CEO không đổi");
  assert.equal(git("status", "--porcelain"), truocStatus + "\n?? c.txt");
  assert.throws(() => apDung(repo, { khongGit: true }, "dung-ban-ai"), /Không có ảnh chụp/);
  const khongGit = fs.mkdtempSync(path.join(os.tmpdir(), "vp-khong-git-"));
  t.after(() => fs.rmSync(khongGit, { recursive: true, force: true }));
  assert.equal(chup(khongGit), null, "không phải repo git");
});

test("agent.md luôn bị trả về dù AI khai trong sua_file; tên file có ký tự đại diện (*) không làm trả về nhầm file khác", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chot-2-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "t"); git("config", "user.email", "t@l");
  fs.writeFileSync(path.join(repo, "agent.md"), "NEXT_OWNER: A\n"); fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src", "a.js"), "1\n"); git("add", "."); git("commit", "-qm", "i");
  const anh = chup(repo);
  fs.writeFileSync(path.join(repo, "agent.md"), "NEXT_OWNER: B\n");
  fs.writeFileSync(path.join(repo, "src", "a.js"), "2\n");
  if (process.platform !== "win32") fs.writeFileSync(path.join(repo, "src", "*"), "sao\n");
  const k = kiemSau(repo, anh, { suaFile: ["agent.md", "src/a.js"], xoa: [] });
  assert.deepEqual(k.daTraVe, ["agent.md"]);
  assert.equal(fs.readFileSync(path.join(repo, "agent.md"), "utf8"), "NEXT_OWNER: A\n");
  assert.equal(fs.readFileSync(path.join(repo, "src", "a.js"), "utf8"), "2\n", "file đúng phạm vi không bị trả về nhầm");
});

test("nút sau lượt chỉ làm với file còn y như lúc kiểm: file đã đổi sau đó thì bỏ qua, không ghi đè/xoá nhầm", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chot-3-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "t"); git("config", "user.email", "t@l");
  for (const n of ["a.txt", "b.txt"]) fs.writeFileSync(path.join(repo, n), "goc\n");
  git("add", "."); git("commit", "-qm", "i");
  const anh = chup(repo);
  for (const n of ["a.txt", "b.txt"]) fs.writeFileSync(path.join(repo, n), "ai sua\n");
  for (const n of ["moi1.txt", "moi2.txt"]) fs.writeFileSync(path.join(repo, n), "ai tao\n");
  const k = kiemSau(repo, anh, { suaFile: [], xoa: [] });
  assert.deepEqual(k.daTraVe, ["a.txt", "b.txt"]);
  fs.writeFileSync(path.join(repo, "b.txt"), "CEO sua sau\n");   // CEO sửa sau khi kiểm
  fs.writeFileSync(path.join(repo, "moi2.txt"), "CEO sua sau\n");
  const r1 = apDung(repo, k, "dung-ban-ai");
  assert.deepEqual([r1.daLam, r1.boQua], [["a.txt"], ["b.txt"]]);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "ai sua\n");
  assert.equal(fs.readFileSync(path.join(repo, "b.txt"), "utf8"), "CEO sua sau\n");
  const r2 = apDung(repo, k, "xoa-file-moi");
  assert.deepEqual([r2.daLam, r2.boQua], [["moi1.txt"], ["moi2.txt"]]);
  assert.ok(!fs.existsSync(path.join(repo, "moi1.txt")) && fs.existsSync(path.join(repo, "moi2.txt")));
});

function taoRepo(t, ten) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), ten));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "t"); git("config", "user.email", "t@l");
  return { repo, git, ghi: (f, c) => { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), c); } };
}

test("một file bị thay bằng thư mục không làm hỏng cả lô: các file khác vẫn được khôi phục, file kẹt được báo riêng", (t) => {
  const { repo, git, ghi } = taoRepo(t, "vp-chot-4-");
  for (const f of ["a.txt", "b.txt", "c.txt"]) ghi(f, f + "\n");
  git("add", "."); git("commit", "-qm", "i");
  const anh = chup(repo);
  fs.rmSync(path.join(repo, "a.txt")); ghi("a.txt/x", "chiem cho\n");          // file → thư mục không rỗng
  fs.rmSync(path.join(repo, "b.txt")); ghi("c.txt", "hong\n");
  const k = kiemSau(repo, anh, { suaFile: [], xoa: [] });
  assert.equal(fs.readFileSync(path.join(repo, "b.txt"), "utf8"), "b.txt\n", "b.txt vẫn được khôi phục");
  assert.equal(fs.readFileSync(path.join(repo, "c.txt"), "utf8"), "c.txt\n", "c.txt vẫn được trả về");
  assert.deepEqual(k.loiKhoiPhuc.map((h) => h.file), ["a.txt"]);
  assert.deepEqual(k.fileMoiNgoai, ["a.txt/x"]);
  // Xoá file mới: thư mục không bị xoá, file thường thì xoá.
  const r = apDung(repo, k, "xoa-file-moi");
  assert.deepEqual(r.daLam, ["a.txt/x"]);
});

test("tên file kiểu Next.js ([id]), tiếng Việt, khai cả thư mục; repo chưa có commit", (t) => {
  const { repo, ghi } = taoRepo(t, "vp-chot-5-");
  ghi("app/users/[id]/page.tsx", "1\n"); ghi("app/users/i/page.tsx", "goc\n"); ghi("tài liệu/ghi chú.md", "a\n");
  const anh = chup(repo);                                                         // chưa có commit nào
  ghi("app/users/[id]/page.tsx", "2\n"); ghi("app/users/i/page.tsx", "ai sua\n"); ghi("tài liệu/ghi chú.md", "b\n");
  const k = kiemSau(repo, anh, { suaFile: ["tài liệu/"], xoa: [] });
  assert.deepEqual(k.dungPhamVi, ["tài liệu/ghi chú.md"]);
  assert.deepEqual(k.daTraVe.sort(), ["app/users/[id]/page.tsx", "app/users/i/page.tsx"]);
  assert.equal(fs.readFileSync(path.join(repo, "app/users/[id]/page.tsx"), "utf8"), "1\n");
  assert.equal(fs.readFileSync(path.join(repo, "app/users/i/page.tsx"), "utf8"), "goc\n");
  assert.equal(fs.readFileSync(path.join(repo, "tài liệu/ghi chú.md"), "utf8"), "b\n");
});

test("file bị gitignore: xoá sạch bên trong thư mục, ghi đè .env đều bị báo; thư mục nặng chỉ kiểm còn/mất", (t) => {
  const { repo, git, ghi } = taoRepo(t, "vp-chot-6-");
  ghi(".gitignore", "data/\n.env\nnode_modules/\n"); ghi("data/prod.db", "du lieu\n"); ghi(".env", "KEY=abc\n"); ghi("node_modules/x/i.js", "1");
  git("add", "."); git("commit", "-qm", "i");
  const anh = chup(repo);
  assert.ok(anh.boQua.some(([p]) => p === "data/prod.db") && anh.boQua.some(([p, s]) => p === "node_modules/" && s === -1));
  fs.rmSync(path.join(repo, "data/prod.db"));                                    // thư mục data/ vẫn còn, rỗng
  fs.writeFileSync(path.join(repo, ".env"), "");
  const k = kiemSau(repo, anh, { suaFile: [], xoa: [] });
  assert.deepEqual(k.boQuaMat, ["data/prod.db"]);
  assert.deepEqual(k.boQuaDoi, [".env"]);
  // Được duyệt xoá/sửa thì không báo.
  const anh2 = chup(repo);
  fs.rmSync(path.join(repo, "node_modules"), { recursive: true });
  assert.deepEqual(kiemSau(repo, anh2, { suaFile: [], xoa: [{ duongDan: "node_modules/", lyDo: "cài lại" }] }).boQuaMat, []);
});

test("file chưa theo dõi quá lớn: không chụp (tránh treo máy chủ, phình .git), báo cần thêm vào .gitignore", (t) => {
  const { repo, ghi } = taoRepo(t, "vp-chot-7-");
  ghi("a.txt", "1");
  const fd = fs.openSync(path.join(repo, "phim.mp4"), "w"); fs.ftruncateSync(fd, 101 * 1024 * 1024); fs.closeSync(fd);
  assert.throws(() => chup(repo), (e) => e.code === "NOT_READY" && /phim\.mp4/.test(e.message) && /\.gitignore/.test(e.message));
});

test("kết quả lỗi / không git: nút sau lượt báo lỗi rõ, không vỡ 500", () => {
  for (const kq of [{ loi: "x" }, { khongGit: true }, null]) assert.throws(() => apDung(".", kq, "dung-ban-ai"), (e) => e.code === "BAD_REQUEST");
});

test("xoá file mới tên ' server.js' (dấu cách đầu) KHÔNG xoá nhầm server.js có sẵn; chỉ xoá file không có trong ảnh chụp trước", (t) => {
  const { repo, git, ghi } = taoRepo(t, "vp-chot-8-");
  ghi("server.js", "quan trong\n"); git("add", "."); git("commit", "-qm", "i");
  const anh = chup(repo);
  ghi(" server.js", "quan trong\n");                                            // cùng nội dung → cùng blob
  const k = kiemSau(repo, anh, { suaFile: [], xoa: [] });
  assert.deepEqual(k.fileMoiNgoai, [" server.js"]);
  const r = apDung(repo, k, "xoa-file-moi");
  assert.ok(fs.existsSync(path.join(repo, "server.js")), "server.js của sếp còn nguyên");
  assert.ok(!fs.existsSync(path.join(repo, " server.js")));
  assert.deepEqual(r.daLam, [" server.js"]);
});

test("được duyệt SỬA thư mục gitignore không có nghĩa được XOÁ dữ liệu trong đó", (t) => {
  const { repo, git, ghi } = taoRepo(t, "vp-chot-9-");
  ghi(".gitignore", "data/\n"); ghi("data/prod.db", "du lieu\n"); git("add", "."); git("commit", "-qm", "i");
  const anh = chup(repo);
  fs.rmSync(path.join(repo, "data/prod.db"));
  ghi("data/moi.db", "x");
  const k = kiemSau(repo, anh, { suaFile: ["data/"], xoa: [] });
  assert.deepEqual(k.boQuaMat, ["data/prod.db"]);
  assert.deepEqual(k.boQuaDoi, []);
});

test("file kẹt không bị ghi là 'đã khôi phục'; [id] bị trả về còn i (đúng phạm vi) giữ nguyên", (t) => {
  const { repo, git, ghi } = taoRepo(t, "vp-chot-10-");
  ghi("a.txt", "a\n"); ghi("app/[id]/p.tsx", "1\n"); ghi("app/i/p.tsx", "1\n"); git("add", "."); git("commit", "-qm", "i");
  const anh = chup(repo);
  fs.rmSync(path.join(repo, "a.txt")); ghi("a.txt/x", "chiem\n");
  ghi("app/[id]/p.tsx", "2\n"); ghi("app/i/p.tsx", "2\n");
  const k = kiemSau(repo, anh, { suaFile: ["app/i/p.tsx"], xoa: [] });
  assert.deepEqual(k.daKhoiPhuc, []);
  assert.deepEqual(k.loiKhoiPhuc.map((h) => h.file), ["a.txt"]);
  assert.deepEqual(k.daTraVe, ["app/[id]/p.tsx"]);
  assert.equal(fs.readFileSync(path.join(repo, "app/[id]/p.tsx"), "utf8"), "1\n");
  assert.equal(fs.readFileSync(path.join(repo, "app/i/p.tsx"), "utf8"), "2\n");
});
