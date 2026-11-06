// Xuất bản dự án (CEO chọn 04/11/2026, đổi cách xuất bản 06/11/2026): chỉ CEO bấm, không AI nào gọi được.
// Bước 1 "Kiểm tra & build" (chạy trên máy, không ra ngoài): repo sạch → có Dockerfile → Docker đang chạy → test → docker build.
// Bước 2 "Xuất bản": không đẩy image từ máy nữa mà để GitHub Actions của chính repo build và đưa lên GHCR + GitHub Releases,
// đúng quy trình repo đã có: đẩy tag vX.Y.Z (repo có workflow "on: push: tags") hoặc chạy tay workflow (workflow_dispatch
// có input publish/version). Một chỗ quản lý (repo GitHub), build trên máy sạch, máy CEO không cần docker login.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const nhanh = require("./nhanh");
const { remoteName } = require("./github");
const { maskSecrets } = require("../lib/mask");

const MIN = 60 * 1000;
const KEEP = 20;
const SEMVER = /^\d+\.\d+\.\d+$/;
const err = (code, message) => Object.assign(new Error(message), { code });
const gitOut = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();

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
  const out = gitOut(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return out.split("\0").filter(Boolean).map((l) => l.slice(3)).filter((f) => f && f !== "agent.md");
}

// Phiên bản ghi trong code (để gợi ý và để kiểm tag khớp): version.py, package.json hoặc pyproject.toml.
function codeVersion(root) {
  const read = (f) => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return ""; } };
  const m = /__version__\s*=\s*["'](\d+\.\d+\.\d+)["']/.exec(read("version.py")) || /"version"\s*:\s*"(\d+\.\d+\.\d+)"/.exec(read("package.json")) || /^version\s*=\s*"(\d+\.\d+\.\d+)"/m.exec(read("pyproject.toml"));
  return m ? m[1] : null;
}

// Đọc workflow của repo (đọc chữ, không cần thư viện YAML) để biết repo xuất bản bằng cách nào.
function releaseMethod(root) {
  const dir = path.join(root, ".github", "workflows");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^[\w.-]+\.ya?ml$/.test(f)).sort(); } catch { return null; }
  const found = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").replace(/\r/g, "").split("\n");
    const indent = (l) => l.length - l.trimStart().length;
    // Khối con của dòng `key:` (các dòng thụt sâu hơn ngay sau nó)
    const block = (from) => { const out = []; for (let i = from + 1; i < lines.length; i++) { if (lines[i].trim() && indent(lines[i]) <= indent(lines[from])) break; out.push(i); } return out; };
    const at = (re, within) => within.find((i) => re.test(lines[i]));
    const on = lines.findIndex((l) => /^on:\s*$/.test(l) || /^"on":\s*$/.test(l));
    if (on < 0) continue;
    const onBlock = block(on);
    const push = at(/^\s+push:\s*$/, onBlock);
    const tags = push !== undefined ? at(/^\s+tags:/, block(push)) : undefined;
    if (tags !== undefined) {
      const inline = /tags:\s*\[([^\]]*)\]/.exec(lines[tags]);
      const pats = inline ? inline[1].split(",") : block(tags).map((i) => lines[i].replace(/^\s*-\s*/, ""));
      const pattern = pats.map((p) => p.trim().replace(/^["']|["']$/g, "")).find((p) => /^v/.test(p));
      if (pattern) { found.push({ mode: "tag", file, pattern }); continue; }
    }
    const wd = at(/^\s+workflow_dispatch:\s*$/, onBlock);
    const inputs = wd !== undefined ? at(/^\s+inputs:\s*$/, block(wd)) : undefined;
    if (inputs !== undefined) {
      const ib = block(inputs), level = Math.min(...ib.filter((i) => lines[i].trim()).map((i) => indent(lines[i])));
      const names = ib.filter((i) => indent(lines[i]) === level && /^\s+[\w-]+:\s*$/.test(lines[i])).map((i) => lines[i].trim().slice(0, -1));
      const publishInput = names.find((n) => /publish|release/i.test(n)), versionInput = names.find((n) => /version/i.test(n));
      if (publishInput || versionInput) found.push({ mode: "dispatch", file, publishInput: publishInput || null, versionInput: versionInput || null });
    }
  }
  return found.find((f) => f.mode === "tag") || found[0] || null;
}

function createPublisher({ jobs, ws, audit, dir, notify = () => {}, github = () => null, repoName = null }) {
  const file = path.join(dir, "xuat-ban.json");
  let store = { runs: [] };
  try { store = { runs: [], ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch {}
  // Lượt đang chạy khi app tắt: tiến trình con đã bị dừng theo app.
  for (const r of store.runs) if (["running", "releasing"].includes(r.status)) { r.status = "failed"; r.problem = "App khởi động lại khi đang chạy, bấm Kiểm tra & build lại."; }
  const save = () => { fs.writeFileSync(file + ".tmp", JSON.stringify(store, null, 1), { mode: 0o600 }); fs.renameSync(file + ".tmp", file); };
  const rootOf = (workspace) => ws.find(workspace).path;
  const busy = (root) => store.runs.some((r) => r.workspace === root && ["running", "releasing"].includes(r.status));
  const fullNameOf = (root) => { if (repoName) return repoName(root); try { return remoteName(gitOut(root, ["remote", "get-url", "origin"])); } catch { return null; } };

  function status(workspace) {
    const root = rootOf(workspace);
    return { workspace: root, dockerfile: fs.existsSync(path.join(root, "Dockerfile")), release: releaseMethod(root), version: codeVersion(root), repo: fullNameOf(root),
      runs: store.runs.filter((r) => r.workspace === root).slice(-5).reverse() };
  }

  // Chạy một lệnh qua sổ tiến trình (có log, timeout, Kill-Switch) và chờ xong.
  function exec(root, argv, timeoutMs) {
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
      // chứa thứ không có trong commit được xuất bản. Chỉ bỏ qua agent.md (repo công khai giữ sổ trên máy).
      const loose = uncommitted(root);
      if (loose.length) return fail(s, `Có ${loose.length} file chưa commit (${loose.slice(0, 5).join(", ")}${loose.length > 5 ? "…" : ""}). Commit hoặc thêm vào .gitignore rồi build lại.`);
      run.sha = nhanh.head(root); run.branch = nhanh.branchOf(root);
      Object.assign(s, { status: "done", note: (run.branch || "?") + " @ " + run.sha.slice(0, 7) });
      s = step("Có Dockerfile ở gốc repo");
      if (!fs.existsSync(path.join(root, "Dockerfile"))) return fail(s, "Chưa có Dockerfile. Giao Astra viết Dockerfile ở Phase Docker/Production trước.");
      s.status = "done";
      s = step("Docker đang chạy");
      let j = await exec(root, ["docker", "version", "--format", "{{.Server.Version}}"], 60 * 1000);
      if (j.status !== "done") return fail(s, "Chưa có Docker hoặc Docker Desktop chưa bật. " + tail(j));
      s.status = "done"; s.note = "Docker " + tail(j).split(/\r?\n/).pop();
      s = step("Kiểm thử");
      const test = testCommand(root);
      if (!test) { s.status = "skipped"; s.note = "Không tìm thấy bộ test (npm test / pytest): chưa kiểm chứng bằng test"; save(); }
      else {
        j = await exec(root, test, 20 * MIN);
        if (j.status !== "done") return fail(s, test.join(" ") + " không qua. " + tail(j));
        s.status = "done"; s.note = test.join(" ");
      }
      run.tag = "vanphong/" + nhanh.slug(path.basename(root)) + ":" + run.sha.slice(0, 7);
      s = step("Build thử image " + run.tag);
      j = await exec(root, ["docker", "build", "--pull", "-t", run.tag, "."], 30 * MIN);
      if (j.status !== "done") return fail(s, "docker build lỗi. " + tail(j));
      s.status = "done";
      run.status = "ready"; save();
      notify("Xuất bản: đã kiểm tra & build xong, chờ anh bấm", run.tag);
    })().catch((e) => { run.status = "failed"; run.problem = e.message; save(); });
    return run;
  }

  // Kích GitHub Actions xuất bản đúng commit vừa kiểm. Mọi điều kiện kiểm trước khi gửi gì ra ngoài.
  async function release(id, { version, confirm } = {}) {
    const run = store.runs.find((r) => r.id === id);
    if (!run) throw err("NOT_FOUND", "Không có lượt xuất bản " + id);
    if (run.status !== "ready") throw err("NOT_READY", "Lượt này chưa sẵn sàng (" + run.status + "): bấm Kiểm tra & build trước");
    const root = run.workspace;
    version = String(version || "").trim().replace(/^v/, "");
    if (!SEMVER.test(version)) throw err("BAD_REQUEST", "Phiên bản phải có dạng X.Y.Z, ví dụ 6.2.3");
    const tag = "v" + version;
    if (String(confirm || "") !== tag) throw err("BAD_REQUEST", "Xác nhận không khớp phiên bản " + tag);
    const method = releaseMethod(root);
    if (!method) throw err("NO_RELEASE_WORKFLOW", "Repo chưa có workflow xuất bản (đẩy tag v* hoặc chạy tay có input publish/version). Giao Astra thêm workflow đưa image lên GHCR trước.");
    if (nhanh.head(root) !== run.sha) throw err("CHANGED", "Repo đã có commit mới sau khi kiểm tra. Bấm Kiểm tra & build lại.");
    if (busy(root)) throw err("PUBLISH_BUSY", "Dự án đang có một lượt kiểm tra/xuất bản chạy");
    const inCode = codeVersion(root);
    if (method.mode === "tag" && inCode && inCode !== version) throw err("BAD_REQUEST", `Phiên bản trong code là ${inCode}: workflow ${method.file} sẽ từ chối tag ${tag}. Sửa phiên bản trong code (qua đội AI) hoặc xuất bản ${"v" + inCode}.`);
    // Commit phải nằm trên nhánh chính của GitHub: xuất bản thứ đã được duyệt và merge, không phải bản trên máy.
    let main;
    try { gitOut(root, ["fetch", "--quiet", "origin"]); main = gitOut(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).replace(/^origin\//, ""); }
    catch { main = ["main", "master"].find((b) => { try { gitOut(root, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/" + b]); return true; } catch { return false; } }); }
    if (!main) throw err("NO_REMOTE", "Không đọc được nhánh chính trên GitHub (origin). Kiểm tra mạng và remote.");
    try { gitOut(root, ["merge-base", "--is-ancestor", run.sha, "origin/" + main]); }
    catch { throw err("NOT_ON_MAIN", `Commit ${run.sha.slice(0, 7)} chưa có trên nhánh ${main} của GitHub. Merge PR trước rồi kiểm tra lại.`); }
    const fullName = fullNameOf(root);
    if (method.mode === "tag") {
      if (gitOut(root, ["ls-remote", "--tags", "origin", "refs/tags/" + tag])) throw err("TAG_EXISTS", `Tag ${tag} đã có trên GitHub: phiên bản này đã xuất bản. Chọn phiên bản mới.`);
    } else {
      if (gitOut(root, ["rev-parse", "origin/" + main]) !== run.sha) throw err("CHANGED", `Workflow chạy tay luôn lấy đầu nhánh ${main}, mà đầu nhánh trên GitHub khác bản vừa kiểm. Cập nhật repo trên máy (git pull) rồi kiểm tra lại.`);
      if (!fullName || !github()) throw err("NO_REMOTE", "Không xác định được repo GitHub để chạy workflow.");
    }
    run.status = "releasing"; delete run.problem; save();
    audit.log("ceo", "publish.release", root, { id, mode: method.mode, file: method.file, tag, sha: run.sha });
    try {
      if (method.mode === "tag") {
        gitOut(root, ["tag", "-a", tag, run.sha, "-m", `Xuất bản ${tag} (CEO duyệt qua văn phòng)`]);
        const j = await exec(root, ["git", "-c", "credential.interactive=false", "push", "origin", "refs/tags/" + tag], 5 * MIN);
        if (j.status !== "done") { try { gitOut(root, ["tag", "-d", tag]); } catch {} throw err("GIT_PUSH", "Đẩy tag lên GitHub lỗi. " + tail(j)); }
      } else {
        const inputs = {};
        if (method.publishInput) inputs[method.publishInput] = "true";
        if (method.versionInput) inputs[method.versionInput] = version;
        await github().dispatch(fullName, method.file, main, inputs);
      }
    } catch (e) { run.status = "ready"; run.problem = e.message; save(); throw e; }
    run.status = "released";
    run.release = { mode: method.mode, file: method.file, version, tag, at: new Date().toISOString(), actionsUrl: fullName ? `https://github.com/${fullName}/actions/workflows/${method.file}` : null };
    save();
    notify("Đã gửi xuất bản " + tag, "GitHub Actions đang build và đưa lên GHCR/Releases");
    return run;
  }

  return { status, prepare, release };
}

module.exports = { createPublisher, testCommand, codeVersion, releaseMethod };
