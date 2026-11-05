// Xuất bản bản Docker của dự án (CEO chọn 04/11/2026): chỉ CEO bấm, không AI nào gọi được.
// Bước 1 "Kiểm tra & build" (chạy trên máy, không ra ngoài): repo sạch → có Dockerfile → Docker đang chạy → test → docker build.
// Bước 2 "Xuất bản": CEO xác nhận đúng tên image vừa build thì mới docker push lên đích CEO đã khai.
// Đăng nhập kho image (docker login) là việc CEO tự làm; văn phòng không giữ mật khẩu hay token của kho.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const nhanh = require("./nhanh");
const { maskSecrets } = require("../lib/mask");

const MIN = 60 * 1000;
const KEEP = 20;
// Tên image không kèm tag: [máy chủ[:cổng]/]tên/tên… chữ thường (ghcr.io/owner/app, docker.io/user/app, user/app).
const IMAGE = /^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*(?::\d{1,5})?\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
const err = (code, message) => Object.assign(new Error(message), { code });

// Lệnh test của dự án: npm test (khi package.json có script test thật) hoặc pytest; không có thì bỏ qua và ghi rõ.
function testCommand(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const t = pkg.scripts && pkg.scripts.test;
    if (t && !/no test specified/.test(t)) return ["npm", "test"];
  } catch {}
  const has = (f) => fs.existsSync(path.join(root, f));
  if (has("pytest.ini") || has("conftest.py") || has("tests") && fs.readdirSync(path.join(root, "tests")).some((f) => /^test_.*\.py$|_test\.py$/.test(f))) return ["python", "-m", "pytest", "-q"];
  return null;
}

// Mọi file đã sửa hoặc mới tạo mà chưa commit (trừ file .gitignore bỏ qua và agent.md ở gốc).
function uncommitted(root) {
  const out = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, windowsHide: true });
  return out.split("\0").filter(Boolean).map((l) => l.slice(3)).filter((f) => f && f !== "agent.md");
}

function createPublisher({ jobs, ws, audit, dir, notify = () => {} }) {
  const file = path.join(dir, "xuat-ban.json");
  let store = { targets: {}, runs: [] };
  try { store = { targets: {}, runs: [], ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch {}
  // Lượt đang chạy khi app tắt: tiến trình con đã bị dừng theo app.
  for (const r of store.runs) if (["running", "pushing"].includes(r.status)) { r.status = "failed"; r.problem = "App khởi động lại khi đang chạy, bấm Kiểm tra & build lại."; }
  const save = () => { fs.writeFileSync(file + ".tmp", JSON.stringify(store, null, 1), { mode: 0o600 }); fs.renameSync(file + ".tmp", file); };
  const rootOf = (workspace) => ws.find(workspace).path;
  const busy = (root) => store.runs.some((r) => r.workspace === root && ["running", "pushing"].includes(r.status));

  function status(workspace) {
    const root = rootOf(workspace);
    return { workspace: root, image: store.targets[root] || null, dockerfile: fs.existsSync(path.join(root, "Dockerfile")), runs: store.runs.filter((r) => r.workspace === root).slice(-5).reverse() };
  }

  function setTarget(workspace, image) {
    const root = rootOf(workspace);
    image = String(image || "").trim().toLowerCase();
    if (image && !IMAGE.test(image)) throw err("BAD_REQUEST", "Tên image không hợp lệ (ví dụ ghcr.io/ten-ban/ten-app hoặc ten-ban/ten-app, không kèm :tag)");
    if (image) store.targets[root] = image; else delete store.targets[root];
    save();
    audit.log("ceo", "publish.target", root, { image: image || null });
    return status(root);
  }

  // Chạy một lệnh qua sổ tiến trình (có log, timeout, Kill-Switch) và chờ xong.
  function exec(root, name, argv, timeoutMs) {
    return new Promise((resolve) => {
      try { jobs.start({ kind: "cmd", agent: "PUBLISH", workspace: root, argv, timeoutMs, onExit: (j) => resolve(j) }); }
      catch (e) { resolve({ status: "failed", error: e.message }); }
    });
  }
  const tail = (job) => maskSecrets((job.id ? jobs.rawLog(job.id) : job.error || "").trim().slice(-800));

  function prepare(workspace) {
    const root = rootOf(workspace);
    if (busy(root)) throw err("PUBLISH_BUSY", "Dự án đang có một lượt kiểm tra/xuất bản chạy");
    const run = { id: "xb-" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex"), workspace: root, status: "running", createdAt: new Date().toISOString(), steps: [], tag: null, sha: null };
    store.runs.push(run); store.runs.splice(0, Math.max(0, store.runs.length - KEEP)); save();
    audit.log("ceo", "publish.prepare", root, { id: run.id });
    const step = (name) => { const s = { name, status: "running" }; run.steps.push(s); save(); return s; };
    const fail = (s, note) => { s.status = "failed"; s.note = note; run.status = "failed"; run.problem = s.name + ": " + note; save(); notify("Xuất bản: chưa đạt", run.problem.slice(0, 200)); };
    (async () => {
      let s = step("Repo sạch, đã commit");
      try { if (!nhanh.preflight(root).repo) return fail(s, "Thư mục chưa phải repo git"); }
      catch (e) { return fail(s, e.message); }
      // Chặt hơn luồng làm việc: file mới chưa commit cũng chặn, vì docker build lấy cả thư mục làm việc nên image sẽ
      // chứa thứ không có trong commit mang tên tag. Chỉ bỏ qua agent.md (repo công khai giữ sổ trên máy).
      const loose = uncommitted(root);
      if (loose.length) return fail(s, `Có ${loose.length} file chưa commit (${loose.slice(0, 5).join(", ")}${loose.length > 5 ? "…" : ""}). Commit hoặc thêm vào .gitignore rồi build lại.`);
      run.sha = nhanh.head(root); run.branch = nhanh.branchOf(root);
      Object.assign(s, { status: "done", note: (run.branch || "?") + " @ " + run.sha.slice(0, 7) });
      s = step("Có Dockerfile ở gốc repo");
      if (!fs.existsSync(path.join(root, "Dockerfile"))) return fail(s, "Chưa có Dockerfile. Giao Astra viết Dockerfile ở Phase Docker/Production trước.");
      s.status = "done";
      s = step("Docker đang chạy");
      let j = await exec(root, s.name, ["docker", "version", "--format", "{{.Server.Version}}"], 60 * 1000);
      if (j.status !== "done") return fail(s, "Chưa có Docker hoặc Docker Desktop chưa bật. " + tail(j));
      s.status = "done"; s.note = "Docker " + tail(j).split(/\r?\n/).pop();
      s = step("Kiểm thử");
      const test = testCommand(root);
      if (!test) { s.status = "skipped"; s.note = "Không tìm thấy bộ test (npm test / pytest): chưa kiểm chứng bằng test"; save(); }
      else {
        j = await exec(root, s.name, test, 20 * MIN);
        if (j.status !== "done") return fail(s, test.join(" ") + " không qua. " + tail(j));
        s.status = "done"; s.note = test.join(" ");
      }
      run.tag = (store.targets[root] || "vanphong/" + nhanh.slug(path.basename(root))) + ":" + run.sha.slice(0, 7);
      s = step("Build image " + run.tag);
      j = await exec(root, s.name, ["docker", "build", "--pull", "-t", run.tag, "."], 30 * MIN);
      if (j.status !== "done") return fail(s, "docker build lỗi. " + tail(j));
      s.status = "done";
      run.status = "ready"; save();
      notify("Xuất bản: sẵn sàng chờ anh duyệt", run.tag);
    })().catch((e) => { run.status = "failed"; run.problem = e.message; save(); });
    return run;
  }

  function push(id, confirm) {
    const run = store.runs.find((r) => r.id === id);
    if (!run) throw err("NOT_FOUND", "Không có lượt xuất bản " + id);
    if (run.status !== "ready") throw err("NOT_READY", "Lượt này chưa sẵn sàng (" + run.status + ")");
    const image = store.targets[run.workspace];
    if (!image) throw err("NO_TARGET", "Chưa khai đích xuất bản (tên image trên kho). Khai đích rồi bấm Kiểm tra & build lại.");
    if (!run.tag.startsWith(image + ":")) throw err("CHANGED", "Đích xuất bản đã đổi sau khi build. Bấm Kiểm tra & build lại.");
    if (String(confirm || "") !== run.tag) throw err("BAD_REQUEST", "Xác nhận không khớp tên image " + run.tag);
    if (nhanh.head(run.workspace) !== run.sha) throw err("CHANGED", "Repo đã có commit mới sau khi build. Bấm Kiểm tra & build lại.");
    if (busy(run.workspace)) throw err("PUBLISH_BUSY", "Dự án đang có một lượt kiểm tra/xuất bản chạy");
    run.status = "pushing"; save();
    audit.log("ceo", "publish.push", run.workspace, { id, tag: run.tag });
    (async () => {
      const j = await exec(run.workspace, "push", ["docker", "push", run.tag], 30 * MIN);
      if (j.status === "done") { run.status = "published"; run.publishedAt = new Date().toISOString(); delete run.problem; notify("Đã xuất bản", run.tag); }
      else {
        // Đẩy lỗi thì image vẫn còn trên máy: trở lại "ready" để CEO sửa (thường là docker login) rồi bấm lại.
        const log = tail(j);
        run.status = "ready";
        run.problem = (/denied|unauthorized|authentication required/i.test(log) ? "Kho image từ chối: anh chạy `docker login <kho>` trên máy rồi bấm Xuất bản lại. " : "docker push lỗi. ") + log;
        notify("Xuất bản lỗi", run.problem.slice(0, 200));
      }
      save();
    })().catch((e) => { run.status = "ready"; run.problem = e.message; save(); });
    return run;
  }

  return { status, setTarget, prepare, push };
}

module.exports = { createPublisher, testCommand, IMAGE };
