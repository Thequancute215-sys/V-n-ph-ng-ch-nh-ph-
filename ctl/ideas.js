// Ý tưởng của CEO: bước đầu của chu trình (/bcc) là SPEC_ARCHITECT (Hinata) đặc tả ý tưởng vào Vùng [2] của agent.md.
// Lưu trong thư mục ctl (không ghi vào repo). Giao ý tưởng = bật luồng tự động bắt đầu từ lượt Hinata; sổ đang tới lượt
// người khác thì phải có CEO xác nhận ghi đè (FORCE_OVERRIDE) mới chuyển lượt.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { readTurn, setTurn } = require("./handoff");
const { maskSecrets } = require("../lib/mask");

const err = (code, message) => Object.assign(new Error(message), { code });
const LIVE = new Set(["running", "reporting", "awaiting_approval", "awaiting_answer", "attention", "waiting_quota"]);
const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

function createIdeas({ dir, ws, runner, autopilot, audit }) {
  const file = path.join(dir, "ideas.json");
  let ideas = [];
  try { ideas = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const save = () => { fs.writeFileSync(file + ".tmp", JSON.stringify(ideas), { mode: 0o600 }); fs.renameSync(file + ".tmp", file); };

  // Trạng thái lấy từ luồng tự động thật của ý tưởng, không tự đặt.
  function view(i) {
    let run = null;
    if (i.runId) { try { const r = autopilot.get(i.runId); run = { id: r.id, status: r.status, steps: r.steps.length, roles: r.steps.map((s) => s.role).join(" → ") }; } catch {} }
    return { ...i, run };
  }

  function list(workspace) {
    const root = ws.find(workspace).path;
    return ideas.filter((i) => same(i.workspace, root)).sort((a, b) => b.createdAt - a.createdAt).map(view);
  }

  function add({ workspace, title, detail }) {
    const root = ws.find(workspace).path;
    title = String(title || "").trim(); detail = String(detail || "").trim();
    if (!title || title.length > 200) throw err("BAD_REQUEST", "Tên ý tưởng dài 1–200 ký tự.");
    if (detail.length > 2400) throw err("BAD_REQUEST", "Mô tả ý tưởng tối đa 2400 ký tự.");
    const idea = { id: "idea-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex"), workspace: root, title: maskSecrets(title), detail: maskSecrets(detail), createdAt: Date.now(), runId: null, startedAt: null, forcedFrom: null };
    ideas.push(idea); save();
    audit.log("ceo", "idea.add", idea.id, { workspace: root, title: idea.title });
    return view(idea);
  }

  // Ghi đè lượt chỉ commit agent.md khi file đang được git theo dõi (repo công khai giữ agent.md trên máy thì không commit).
  function commitTurn(root, message) {
    const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    try {
      git(["ls-files", "--error-unmatch", "--", "agent.md"]);
      if (!git(["status", "--porcelain", "--", "agent.md"])) return null;
      git(["-c", "user.name=" + (safeGit(git, "user.name") || "Van phong AI"), "-c", "user.email=" + (safeGit(git, "user.email") || "van-phong-ai@localhost"), "commit", "-m", message, "--", "agent.md"]);
      return git(["rev-parse", "--short", "HEAD"]);
    } catch { return null; }
  }
  const safeGit = (git, key) => { try { return git(["config", "--get", key]); } catch { return ""; } };

  function start(id, { force = false } = {}) {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) throw err("NOT_FOUND", "Không có ý tưởng " + id);
    const current = view(idea).run;
    if (current && LIVE.has(current.status)) throw err("AI_BUSY", "Ý tưởng này đang được đội làm.");
    const status = runner.status(idea.workspace);
    if (!status.turn) throw err("BAD_AGENT_MD", status.problem || "Chưa đọc được agent.md của dự án.");
    // Kiểm dự án rảnh TRƯỚC khi đổi lượt, để không chuyển lượt rồi mới phát hiện không chạy được.
    if (autopilot.busy(idea.workspace) || status.aiBusy || status.handoffPending) throw err("AI_BUSY", "Dự án đang có việc hoặc bàn giao chờ duyệt. Xử lý xong rồi giao ý tưởng.");
    const owner = readTurn(idea.workspace).nextOwner;
    if (owner !== "SPEC_ARCHITECT") {
      if (!force) throw err("NEEDS_SPEC_TURN", `Sổ agent.md đang tới lượt ${owner}. Bước đầu của ý tưởng là Hinata (SPEC_ARCHITECT) đặc tả. Anh xác nhận ghi đè chuyển lượt cho Hinata thì văn phòng mới bắt đầu.`);
      setTurn(idea.workspace, "CEO", "SPEC_ARCHITECT");
      const commit = commitTurn(idea.workspace, `chore(agent-sync): CEO -> NEXT: SPEC_ARCHITECT — FORCE_OVERRIDE ý tưởng mới: ${idea.title.slice(0, 60)}`);
      idea.forcedFrom = owner;
      audit.log("ceo", "idea.force_turn", idea.id, { from: owner, commit }, "approved");
    }
    const task = `Ý TƯỞNG MỚI CỦA CEO: ${idea.title}\n${idea.detail}\n\n` +
      "Bước 1 của chu trình (/bcc): SPEC_ARCHITECT đặc tả ý tưởng vào Vùng [2] của agent.md: vấn đề và phạm vi MVP (bắt buộc / ngoài phạm vi), luồng người dùng đầu-cuối, luồng AI Agent, Design System và 5 trạng thái giao diện, trường hợp biên. " +
      "Sau đó chu trình đi tiếp theo giao thức: Sol lập kế hoạch Vùng [1] và [3], Claude duyệt kiến trúc, Astra viết code, Claude nghiệm thu.";
    const run = autopilot.start({ workspace: idea.workspace, task });
    idea.runId = run.id; idea.startedAt = Date.now(); save();
    audit.log("ceo", "idea.start", idea.id, { run: run.id }, "approved");
    return view(idea);
  }

  return { list, add, start };
}

module.exports = { createIdeas };
