"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createCtl } = require("../ctl/main");
const { remoteName } = require("../ctl/github");

const repo = { full_name: "owner/project", private: true, description: "Dự án riêng", default_branch: "main" };
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
function makeRepo(root, remote = "https://github.com/owner/project.git") {
  fs.mkdirSync(root, { recursive: true }); git(root, ["init", "-b", "main"]); git(root, ["remote", "add", "origin", remote]);
  fs.writeFileSync(path.join(root, "keep.txt"), "chưa commit — phải giữ nguyên");
}
async function fixture(options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-github-")), projectsDir = path.join(tmp, "Projects"), calls = [];
  const githubOptions = { projectsDir, getCredential: async () => "credential-only-in-memory", fetcher: async (url, opts) => {
    calls.push({ url, authorization: opts.headers.Authorization });
    const p = new URL(url).pathname;
    return { ok: true, status: 200, headers: new Headers(p === "/user/repos" && new URL(url).searchParams.get("page") === "1" ? { link: '<https://api.github.com/user/repos?page=2>; rel="next"' } : {}),
      json: async () => p === "/user" ? { login: "owner", email: "do-not-return@example.test" } : p === "/user/repos" ? [repo] : repo };
  }, ...options };
  const ctl = createCtl({ dir: path.join(tmp, "ctl"), githubOptions });
  await new Promise((ok) => ctl.server.listen(0, "127.0.0.1", ok));
  const base = "http://127.0.0.1:" + ctl.server.address().port;
  const call = async (url, body) => {
    const r = await fetch(base + url, { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + ctl.token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const finish = async (id) => {
    for (let i = 0; i < 100; i++) { const { operation } = (await call("/github/operations/" + id)).data; if (operation.status !== "running") return operation; await new Promise((r) => setTimeout(r, 20)); }
    throw new Error("Mở repo bị treo");
  };
  return { ctl, tmp, projectsDir, calls, call, finish, cleanup: async () => { await ctl.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

test("GitHub: danh sách repo riêng tư phân trang, credential không ra API/log", async () => {
  const f = await fixture();
  try {
    const r = await f.call("/github/repos?page=1");
    assert.equal(r.status, 200); assert.equal(r.data.account.login, "owner"); assert.equal(r.data.repositories[0].private, true); assert.equal(r.data.hasMore, true);
    assert.equal((await f.call("/github/repos?page=2")).data.hasMore, false);
    assert.equal(f.calls.every((c) => c.url.startsWith("https://api.github.com/") && c.authorization === "Bearer credential-only-in-memory"), true);
    assert.equal(JSON.stringify(r.data).includes("credential-only-in-memory"), false); assert.equal(JSON.stringify(r.data).includes("do-not-return"), false);
    assert.equal(JSON.stringify(f.ctl.audit.recent(100)).includes("credential-only-in-memory"), false);
  } finally { await f.cleanup(); }
});

test("GitHub: mở bản sao có sẵn, giữ file chưa commit và lưu dự án sau restart", async () => {
  const f = await fixture();
  try {
    const root = path.join(f.projectsDir, "old-project"); makeRepo(root); f.ctl.ws.add(root);
    const before = git(root, ["status", "--porcelain"]);
    const r = await f.call("/github/open", { fullName: "owner/project" }); assert.equal(r.status, 202);
    // Đăng ký workspace tự sinh agent.md cho repo chưa có giao thức (CEO quyết 02/11/2026), nên hasAgent là true.
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "done"); assert.equal(op.cloned, undefined); assert.equal(op.hasAgent, true);
    assert.equal(op.workspace, fs.realpathSync(root)); assert.equal(git(root, ["status", "--porcelain"]), before);
    assert.equal(fs.readFileSync(path.join(root, "keep.txt"), "utf8"), "chưa commit — phải giữ nguyên");
    const restored = createCtl({ dir: path.join(f.tmp, "ctl") });
    assert.equal(restored.ws.current(), fs.realpathSync(root)); await restored.close();
  } finally { await f.cleanup(); }
});

test("GitHub: nhận repo chưa đăng ký qua origin HTTPS/SSH, không tạo clone thứ hai", async () => {
  const f = await fixture();
  try {
    const root = path.join(f.projectsDir, "already-here"); makeRepo(root, "git@github.com:owner/project.git");
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "done"); assert.equal(op.workspace, fs.realpathSync(root)); assert.equal(op.cloned, undefined);
    assert.equal(remoteName("https://github.com/owner/project.git"), "owner/project"); assert.equal(remoteName("ssh://git@github.com/owner/project.git"), "owner/project");
  } finally { await f.cleanup(); }
});

test("GitHub: đã chuyển thư mục dự án sang ổ khác thì vẫn nhận bản sao ở thư mục Projects cũ, không clone lại", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-github-cu-")), old = path.join(tmp, "Projects-cu");
  const f = await fixture({ alsoLook: [old] });
  try {
    const root = path.join(old, "owner", "project"); makeRepo(root);
    const op = await f.finish((await f.call("/github/open", { fullName: "owner/project" })).data.operation.id);
    assert.equal(op.status, "done"); assert.equal(op.cloned, undefined); assert.equal(op.workspace, fs.realpathSync(root));
    assert.equal(fs.existsSync(path.join(f.projectsDir, "owner", "project")), false, "không tạo bản sao thứ hai ở thư mục mới");
  } finally { await f.cleanup(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("GitHub: chặn tên repo chèn lệnh/thoát đường dẫn trước khi gọi GitHub", async () => {
  const f = await fixture();
  try {
    for (const name of ["../project", "owner/..", "owner/a/b", "https://evil.test/repo", "owner/repo;whoami", "owner/repo\n--upload-pack=evil"]) assert.equal((await f.call("/github/open", { fullName: name })).status, 400, name);
    assert.equal((await f.call("/github/repos?page=-1")).status, 400); assert.equal(f.calls.length, 0);
  } finally { await f.cleanup(); }
});

test("GitHub: thư mục trùng tên giữ nguyên, không xóa hay ghi đè dữ liệu", async () => {
  const f = await fixture();
  try {
    const root = path.join(f.projectsDir, "owner", "project"); fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, "keep"), "giữ");
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "failed"); assert.equal(op.code, "CHANGED");
    assert.equal(fs.readFileSync(path.join(root, "keep"), "utf8"), "giữ"); assert.equal(f.ctl.jobs.list().length, 0);
  } finally { await f.cleanup(); }
});

test("GitHub: junction của thư mục chủ repo không thoát Projects", async (t) => {
  const f = await fixture();
  try {
    const outside = path.join(f.tmp, "outside"); fs.mkdirSync(outside); fs.mkdirSync(f.projectsDir);
    try { fs.symlinkSync(outside, path.join(f.projectsDir, "owner"), "junction"); } catch { return t.skip("Không tạo được junction"); }
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "failed"); assert.equal(op.code, "PATH_ESCAPE"); assert.deepEqual(fs.readdirSync(outside), []);
  } finally { await f.cleanup(); }
});

test("GitHub: auth hết hạn/mất mạng báo đúng lỗi, không mở dự án giả", async () => {
  for (const status of [401, 403, 404, 500]) {
    const f = await fixture({ fetcher: async () => ({ ok: false, status }) });
    try {
      const r = await f.call("/github/repos"); assert.equal(r.status, { 401: 401, 403: 429, 404: 404, 500: 502 }[status]);
      assert.equal(JSON.stringify(r.data).includes("credential-only-in-memory"), false); assert.equal(f.ctl.ws.list().length, 0);
    } finally { await f.cleanup(); }
  }
  const f = await fixture({ fetcher: async () => { throw new Error("network"); } });
  try { assert.equal((await f.call("/github/repos")).status, 502); } finally { await f.cleanup(); }
});

test("GitHub: không mở song song hai repo, shutdown không đăng ký dở dang", async () => {
  let release;
  const pending = new Promise((r) => { release = r; });
  const f = await fixture({ getCredential: () => pending });
  try {
    const first = await f.call("/github/open", { fullName: "owner/project" }); assert.equal(first.status, 202);
    assert.equal((await f.call("/github/open", { fullName: "owner/another" })).status, 409);
    f.ctl.github.close(); release("credential-only-in-memory");
    await new Promise((r) => setTimeout(r, 20)); assert.equal(f.ctl.ws.list().length, 0);
  } finally { await f.cleanup(); }
});

test("GitHub: clone bằng job thật, nhận đúng file rồi chuyển workspace", async () => {
  const f = await fixture();
  const previous = process.env.GIT_CONFIG_GLOBAL;
  try {
    const source = path.join(f.tmp, "source"); makeRepo(source);
    git(source, ["add", "keep.txt"]); git(source, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "test fixture"]);
    const config = path.join(f.tmp, "git-config");
    git(f.tmp, ["config", "--file", config, "url." + source.replace(/\\/g, "/") + ".insteadOf", "https://github.com/owner/project.git"]);
    process.env.GIT_CONFIG_GLOBAL = config;
    const first = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(first.data.operation.id);
    assert.equal(op.status, "done", JSON.stringify(op)); assert.equal(op.cloned, true);
    assert.equal(f.ctl.jobs.get(op.jobId).status, "done");
    assert.equal(fs.readFileSync(path.join(op.workspace, "keep.txt"), "utf8"), "chưa commit — phải giữ nguyên");
    assert.equal(f.ctl.ws.current(), op.workspace);
    const second = await f.call("/github/open", { fullName: "owner/project" });
    assert.equal((await f.finish(second.data.operation.id)).cloned, undefined);
    assert.equal(f.ctl.jobs.list().length, 1, "không clone lại khi đã có repo");
  } finally { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; await f.cleanup(); }
});

test("GitHub: clone thất bại giữ thư mục, không chọn hay đăng ký repo hỏng", async () => {
  const f = await fixture();
  const previous = process.env.GIT_CONFIG_GLOBAL;
  try {
    const config = path.join(f.tmp, "git-config");
    git(f.tmp, ["config", "--file", config, "url." + path.join(f.tmp, "missing").replace(/\\/g, "/") + ".insteadOf", "https://github.com/owner/project.git"]);
    process.env.GIT_CONFIG_GLOBAL = config;
    const r = await f.call("/github/open", { fullName: "owner/project" });
    const op = await f.finish(r.data.operation.id); assert.equal(op.status, "failed"); assert.equal(op.code, "GITHUB_CLONE");
    assert.equal(f.ctl.ws.list().length, 0); assert.equal(fs.existsSync(path.join(f.projectsDir, "owner", "project")), true);
  } finally { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; await f.cleanup(); }
});

test("GitHub: Xem PR đọc danh sách, chi tiết, CI checks, reviews, chặn tham số sai và che khóa trong diff/mô tả", async () => {
  const headSha = "a".repeat(40);
  const fakeSecret = "sk-" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6";
  const f = await fixture({
    fetcher: async (url) => {
      const u = new URL(url), p = u.pathname;
      if (p === "/repos/owner/project") return { ok: true, status: 200, headers: new Headers(), json: async () => repo };
      if (p === "/repos/owner/project/pulls") return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => [{
          number: 75, title: "Hoàn thiện Xưởng phim P4", state: "open", draft: false, merged_at: null,
          created_at: "2026-11-25T00:00:00Z", updated_at: "2026-11-25T00:05:00Z",
          user: { login: "codex-bot" }, head: { ref: "feat/other", sha: headSha }, base: { ref: "main" },
        }],
      };
      if (p === "/repos/owner/project/pulls/75") return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({
          number: 75, title: "Hoàn thiện Xưởng phim P4", body: "Mô tả PR kèm " + fakeSecret,
          state: "open", draft: false, merged_at: null, mergeable: true, mergeable_state: "clean",
          commits: 2, additions: 42, deletions: 5, changed_files: 1, comments: 1, review_comments: 2,
          created_at: "2026-11-25T00:00:00Z", updated_at: "2026-11-25T00:05:00Z",
          user: { login: "codex-bot" }, head: { ref: "feat/other", sha: headSha }, base: { ref: "main", repo },
        }),
      };
      if (p === "/repos/owner/project/pulls/75/files") return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => [{ filename: "ctl/luong-phim.js", status: "modified", additions: 42, deletions: 5, patch: "@@ -1 +1 @@\n+token=" + fakeSecret }],
      };
      if (p === `/repos/owner/project/commits/${headSha}/check-runs`) return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ check_runs: [{ name: "test", status: "completed", conclusion: "success", html_url: "https://github.com/owner/project/runs/1" }] }),
      };
      if (p === "/repos/owner/project/pulls/75/reviews") return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => [{ state: "APPROVED", submitted_at: "2026-11-25T00:06:00Z", body: "Đạt " + fakeSecret, user: { login: "reviewer" } }],
      };
      return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
    },
  });
  try {
    const root = path.join(f.projectsDir, "pr-repo");
    makeRepo(root);
    git(root, ["add", "keep.txt"]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "init"]);
    git(root, ["checkout", "-b", "feat/nhanh-moi"]);
    f.ctl.ws.add(root);
    const q = "?workspace=" + encodeURIComponent(root);

    assert.equal((await f.call("/github/pulls" + q + "&state=invalid")).status, 400);
    assert.equal((await f.call("/github/pulls/0" + q)).status, 400);

    const listRes = await f.call("/github/pulls" + q + "&state=open");
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.kind, "ok");
    assert.equal(listRes.data.pulls.length, 1);
    assert.equal(listRes.data.pulls[0].number, 75);
    assert.match(listRes.data.compareUrl, /^https:\/\/github\.com\/owner\/project\/compare\/main\.\.\.feat%2Fnhanh-moi\?expand=1$/);

    const detailRes = await f.call("/github/pulls/75" + q);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.data.pull.checks[0].conclusion, "success");
    assert.equal(detailRes.data.pull.reviews[0].state, "APPROVED");
    assert.equal(detailRes.data.pull.files[0].filename, "ctl/luong-phim.js");
    const rawDetail = JSON.stringify(detailRes.data);
    assert.equal(rawDetail.includes(fakeSecret), false, "không lộ khóa trong mô tả, review hoặc diff PR");
    assert.equal(rawDetail.includes("credential-only-in-memory"), false);

    // Repo chưa có remote origin trả kind=no-remote sạch, không vỡ 500
    const localOnly = path.join(f.projectsDir, "no-remote");
    fs.mkdirSync(localOnly, { recursive: true }); git(localOnly, ["init", "-b", "main"]);
    f.ctl.ws.add(localOnly);
    const noRem = await f.call("/github/pulls?workspace=" + encodeURIComponent(localOnly));
    assert.equal(noRem.status, 200);
    assert.equal(noRem.data.kind, "no-remote");
    assert.deepEqual(noRem.data.pulls, []);
  } finally { await f.cleanup(); }
});

test("GitHub: pullDetail báo lỗi từng phần khi check-runs 403 / reviews 500 / files 500, tách biệt với PR rỗng thật; pulls phân trang 1->2->1 và dò PR ngoài trang đầu", async () => {
  const headPartial = "c".repeat(40);
  const headEmpty = "d".repeat(40);
  const pr80 = {
    number: 80, title: "PR lỗi phần con", body: "Có 1 file đổi", state: "open", draft: false, merged_at: null,
    mergeable: true, mergeable_state: "clean", commits: 1, additions: 12, deletions: 3, changed_files: 1, comments: 0, review_comments: 0,
    created_at: "2026-11-25T01:00:00Z", updated_at: "2026-11-25T01:05:00Z",
    user: { login: "dev1" }, head: { ref: "feat/partial", sha: headPartial }, base: { ref: "main", repo },
  };
  const pr40 = {
    number: 40, title: "Sửa thanh toán ở trang 2", body: "", state: "open", draft: false, merged_at: null,
    mergeable: true, mergeable_state: "clean", commits: 1, additions: 0, deletions: 0, changed_files: 0, comments: 0, review_comments: 0,
    created_at: "2026-11-24T01:00:00Z", updated_at: "2026-11-24T01:05:00Z",
    user: { login: "dev2" }, head: { ref: "fix/pay-p2", sha: headEmpty }, base: { ref: "main", repo },
  };
  const pr12 = {
    number: 12, title: "PR rất cũ ngoài trang đầu", body: "Trang xa", state: "open", draft: false, merged_at: null,
    mergeable: true, mergeable_state: "clean", commits: 1, additions: 2, deletions: 1, changed_files: 1, comments: 0, review_comments: 0,
    created_at: "2026-11-01T01:00:00Z", updated_at: "2026-11-01T01:05:00Z",
    user: { login: "dev3" }, head: { ref: "fix/deep", sha: headEmpty }, base: { ref: "main", repo },
  };

  const f = await fixture({
    fetcher: async (url) => {
      const u = new URL(url), p = u.pathname, pg = u.searchParams.get("page") || "1";
      if (p === "/repos/owner/project") return { ok: true, status: 200, headers: new Headers(), json: async () => repo };
      if (p === "/repos/owner/project/pulls") {
        if (pg === "1") {
          return {
            ok: true, status: 200,
            headers: new Headers({ link: '<https://api.github.com/repos/owner/project/pulls?page=2>; rel="next"' }),
            json: async () => [pr80],
          };
        }
        if (pg === "2") {
          return { ok: true, status: 200, headers: new Headers(), json: async () => [pr40] };
        }
        return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
      }
      // PR #80: check-runs 403, reviews 500, files 500 dù changed_files = 1
      if (p === "/repos/owner/project/pulls/80") return { ok: true, status: 200, headers: new Headers(), json: async () => pr80 };
      if (p === `/repos/owner/project/commits/${headPartial}/check-runs`) return { ok: false, status: 403, headers: new Headers(), json: async () => ({ message: "Resource not accessible by integration" }) };
      if (p === "/repos/owner/project/pulls/80/reviews") return { ok: false, status: 500, headers: new Headers(), json: async () => ({ message: "Server Error" }) };
      if (p === "/repos/owner/project/pulls/80/files") return { ok: false, status: 500, headers: new Headers(), json: async () => ({ message: "Server Error" }) };

      // PR #40: rỗng thật (HTTP 200 với mảng rỗng, changed_files = 0)
      if (p === "/repos/owner/project/pulls/40") return { ok: true, status: 200, headers: new Headers(), json: async () => pr40 };
      if (p === `/repos/owner/project/commits/${headEmpty}/check-runs`) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ check_runs: [] }) };
      if (p === "/repos/owner/project/pulls/40/reviews") return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
      if (p === "/repos/owner/project/pulls/40/files") return { ok: true, status: 200, headers: new Headers(), json: async () => [] };

      // PR #12: chỉ tìm thấy khi tra trực tiếp /pulls/12
      if (p === "/repos/owner/project/pulls/12") return { ok: true, status: 200, headers: new Headers(), json: async () => pr12 };
      return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
    },
  });

  try {
    const root = path.join(f.projectsDir, "pr-paging-repo");
    makeRepo(root);
    git(root, ["add", "keep.txt"]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "init"]);
    f.ctl.ws.add(root);
    const q = "?workspace=" + encodeURIComponent(root);

    // 1. Phân trang: trang 1 -> trang 2 -> quay lại trang 1
    const p1 = await f.call("/github/pulls" + q + "&state=open&page=1");
    assert.equal(p1.status, 200);
    assert.equal(p1.data.page, 1);
    assert.equal(p1.data.hasMore, true);
    assert.deepEqual(p1.data.pulls.map((x) => x.number), [80]);

    const p2 = await f.call("/github/pulls" + q + "&state=open&page=2");
    assert.equal(p2.status, 200);
    assert.equal(p2.data.page, 2);
    assert.equal(p2.data.hasMore, false);
    assert.deepEqual(p2.data.pulls.map((x) => x.number), [40]);

    const p1Back = await f.call("/github/pulls" + q + "&state=open&page=1");
    assert.equal(p1Back.status, 200);
    assert.equal(p1Back.data.page, 1);
    assert.equal(p1Back.data.hasMore, true);
    assert.deepEqual(p1Back.data.pulls.map((x) => x.number), [80]);

    // 2. Tìm kiếm qua nhiều trang (q) tìm đúng PR ở trang 2 và PR #12 ngoài các trang đầu
    const searchP2 = await f.call("/github/pulls" + q + "&state=open&q=" + encodeURIComponent("thanh toán"));
    assert.equal(searchP2.status, 200);
    assert.equal(searchP2.data.searchedPages, 2);
    assert.deepEqual(searchP2.data.pulls.map((x) => x.number), [40]);

    const searchDeep = await f.call("/github/pulls" + q + "&state=open&q=" + encodeURIComponent("#12"));
    assert.equal(searchDeep.status, 200);
    assert.deepEqual(searchDeep.data.pulls.map((x) => x.number), [12]);

    // 3. Lỗi phần con (403/500) phải trả rõ checksError / reviewsError / filesError, giữ nguyên changedFiles = 1
    const detErr = await f.call("/github/pulls/80" + q);
    assert.equal(detErr.status, 200);
    assert.equal(detErr.data.pull.changedFiles, 1);
    assert.match(detErr.data.pull.checksError, /HTTP 403/);
    assert.match(detErr.data.pull.reviewsError, /HTTP 500/);
    assert.match(detErr.data.pull.filesError, /HTTP 500/);

    // 4. Dữ liệu rỗng thật phải có *Error === null
    const detEmpty = await f.call("/github/pulls/40" + q);
    assert.equal(detEmpty.status, 200);
    assert.equal(detEmpty.data.pull.changedFiles, 0);
    assert.equal(detEmpty.data.pull.checksError, null);
    assert.equal(detEmpty.data.pull.reviewsError, null);
    assert.equal(detEmpty.data.pull.filesError, null);
  } finally { await f.cleanup(); }
});
