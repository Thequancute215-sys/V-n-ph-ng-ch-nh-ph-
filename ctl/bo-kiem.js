// Cài "bộ kiểm chu trình" vào repo dự án (CEO duyệt 08/11/2026: các dự án và app sau này đều phải qua chu trình, clean code):
//   tools/kiem-agent.js                     = bản chép nguyên lib/kiem-agent.js (file đó tự chạy được, không cần văn phòng)
//   .github/workflows/kiem-chu-trinh.yml    = ctl/khung/kiem-chu-trinh.yml (kiểm agent.md + lint/test theo công nghệ của repo)
// Cài trên nhánh mới tách từ nhánh chính, trong một worktree tạm, nên không đụng thư mục và nhánh anh/AI đang làm.
// CEO bấm nút thì commit, đẩy nhánh lên GitHub (không --force) và trả link tạo PR; merge là việc của CEO trên GitHub.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const nhanh = require("./nhanh");
const { writeAtomic } = require("../lib/ghi-file");
const { maskSecrets } = require("../lib/mask");

const err = (code, message) => Object.assign(new Error(message), { code });
const FILES = {
  "tools/kiem-agent.js": path.join(__dirname, "..", "lib", "kiem-agent.js"),
  "tools/kiem-hop-dong.js": path.join(__dirname, "..", "lib", "kiem-hop-dong.js"),   // hợp đồng giao tiếp (16/11/2026)
  ".github/workflows/kiem-chu-trinh.yml": path.join(__dirname, "khung", "kiem-chu-trinh.yml"),
};
const norm = (s) => String(s).replace(/\r\n/g, "\n");
const wanted = () => Object.fromEntries(Object.entries(FILES).map(([to, from]) => [to, norm(fs.readFileSync(from, "utf8"))]));
const stamp = (d = new Date()) => d.toISOString().replace(/[-:T]/g, "").slice(0, 14);   // yyyymmddhhmmss (UTC)

function createBoKiem({ dir, audit, now = () => new Date() }) {   // now: tiêm giờ cho test
  const stateFile = path.join(dir, "bo-kiem.json");   // lần cài gần nhất của từng repo: nhánh + link PR
  const readAll = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return {}; } };
  const busy = new Set();

  // da-cai: hai file đúng bản của văn phòng; cu: có nhưng khác (bộ kiểm đã đổi, cần cài lại); chua-cai; khong-phai-git.
  function status(root) {
    if (!nhanh.isRepo(root)) return { state: "khong-phai-git", files: [], last: null };
    // Repo của chính Văn phòng AI (bản nào, ở đâu cũng vậy) là nguồn của bộ kiểm và có CI riêng (.github/workflows/kiem-tra.yml):
    // tools/kiem-agent.js ở đây chỉ gọi lib/kiem-agent.js, nên so file sẽ báo nhầm "bản cũ" và mời cài một PR thừa.
    if (fs.existsSync(path.join(root, "ctl", "bo-kiem.js")) && fs.existsSync(path.join(root, "lib", "kiem-agent.js"))) return { state: "van-phong", files: [], last: null, busy: false };
    const want = wanted();
    const files = Object.keys(want).map((f) => {
      let have = null;
      try { have = norm(fs.readFileSync(path.join(root, f), "utf8")); } catch {}
      return { path: f, state: have === null ? "thieu" : have === want[f] ? "dung" : "khac" };
    });
    const state = files.every((f) => f.state === "dung") ? "da-cai" : files.every((f) => f.state === "thieu") ? "chua-cai" : "cu";
    return { state, files, last: readAll()[root] || null, busy: busy.has(root) };
  }

  function install(root, actor = "ceo") {
    if (busy.has(root)) throw err("TOO_MANY", "Đang cài bộ kiểm cho repo này.");
    const s = status(root);
    if (s.state === "khong-phai-git") throw err("NO_GIT", "Dự án không phải repo git.");
    if (s.state === "van-phong") throw err("NOT_READY", "Đây là repo của chính Văn phòng AI: đã có CI riêng (kiem-tra.yml), không cài bộ kiểm.");
    if (s.state === "da-cai") throw err("NOT_READY", "Repo đã có bộ kiểm bản mới nhất.");
    if (!nhanh.head(root)) throw err("NO_COMMIT", "Repo chưa có commit nào: commit lần đầu rồi mới cài.");
    if (!tryGit(root, ["remote", "get-url", "origin"])) throw err("NO_REMOTE", "Repo không có remote origin trên GitHub: không mở được PR.");
    busy.add(root);
    const tmp = path.join(os.tmpdir(), "vp-bo-kiem-" + crypto.randomBytes(4).toString("hex"));
    try {
      const main = nhanh.defaultBranch(root);
      if (!main) throw err("NOT_ON_MAIN", "Không xác định được nhánh chính (main/master) của repo.");
      tryGit(root, ["fetch", "--quiet", "origin", main], { timeout: 60000 });
      const base = tryGit(root, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/" + main]) ? "origin/" + main : main;
      // Tên theo giờ; bấm hai lần trong cùng một giây (máy nhanh) thì thêm -2, -3… để không đụng nhánh có sẵn.
      const taken = (b) => tryGit(root, ["rev-parse", "--verify", "--quiet", "refs/heads/" + b]) || tryGit(root, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/" + b]);
      const first = "vp/bo-kiem-chu-trinh-" + stamp(now());
      let branch = first;
      for (let n = 2; taken(branch); n++) branch = first + "-" + n;
      try { nhanh.git(root, ["worktree", "add", "--quiet", "-b", branch, tmp, base], { timeout: 60000 }); }
      catch (e) { throw err("GIT_BRANCH", "Không tạo được nhánh " + branch + ": " + clean(e)); }
      let committed = false;
      try {
        for (const [f, text] of Object.entries(wanted())) {
          fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
          fs.writeFileSync(path.join(tmp, f), text);
        }
        nhanh.git(tmp, ["add", "--", ...Object.keys(FILES)]);
        if (!tryGit(tmp, ["diff", "--cached", "--name-only"])) throw err("NOT_READY", `Nhánh ${main} trên GitHub đã có bộ kiểm bản mới nhất: kéo bản mới về (git pull) là xong.`);
        nhanh.git(tmp, ["commit", "--quiet", "-m", "chore(ci): cài bộ kiểm chu trình agent.md (Văn phòng AI)\n\n" +
          "- tools/kiem-agent.js: kiểm luật đo được của agent.md và từng commit sửa agent.md.\n" +
          "- .github/workflows/kiem-chu-trinh.yml: chạy bộ kiểm và lint/test theo công nghệ của repo trên mỗi PR."]);
        committed = true;   // từ đây nhánh có commit của văn phòng: đẩy lỗi thì giữ nhánh để thử lại, không xoá
        const pushed = nhanh.push(tmp, { branch, from: main });
        const last = { branch, base: main, at: new Date().toISOString(), compareUrl: pushed.compareUrl, update: s.state === "cu" };
        writeAtomic(stateFile, JSON.stringify({ ...readAll(), [root]: last }, null, 2));
        audit.log(actor, "bo_kiem.install", root, { branch, update: last.update });
        return { ...status(root), last };
      } finally {
        tryGit(root, ["worktree", "remove", "--force", tmp]);
        // Nhánh vừa tạo mà chưa có commit nào (trùng nhánh chính): bỏ đi cho khỏi rác, không mất gì.
        if (!committed) tryGit(root, ["branch", "-D", branch]);
      }
    } finally {
      busy.delete(root);
    }
  }

  return { status, install };
}

function tryGit(root, args, opts) { try { return nhanh.git(root, args, opts).trim(); } catch { return null; } }
const clean = (e) => maskSecrets(String(e.stderr || e.message)).split(/\r?\n/).filter(Boolean).slice(-2).join(" ").slice(0, 300);

module.exports = { createBoKiem, FILES };
