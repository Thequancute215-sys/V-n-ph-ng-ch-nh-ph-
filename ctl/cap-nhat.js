// Nút "Cập nhật" của app (trang public/cap-nhat.html): xem có bản phát hành mới không, rồi giao cho bộ cập nhật chạy riêng
// (scripts/cap-nhat.js) tắt văn phòng, lên bản mới, bật lại, lỗi thì quay về bản cũ. Logic git ở lib/cap-nhat.js.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const u = require("../lib/cap-nhat");
const { loadConfig } = require("../lib/config");
const app = require("../lib/app");

const err = (code, message) => Object.assign(new Error(message), { code });
const NOT_READY = {
  "khong-phai-git": "Thư mục văn phòng không phải bản sao git.",
  "chua-phat-hanh": "Chưa có bản phát hành nào trên GitHub.",
  "moi-nhat": "Văn phòng đang ở bản mới nhất.",
  lech: "Bản trên máy có commit riêng, không cập nhật tự động.",
};

// root: thư mục app. appManaged(): văn phòng có đang chạy bằng app (npm run app) không — chỉ khi đó mới tắt/bật lại được.
// spawnUpdater(args): chạy scripts/cap-nhat.js (tiêm vào để test không tắt app thật).
function createUpdater({ root, audit, jobs, autopilot, appManaged = defaultManaged, spawnUpdater = defaultSpawn, channel = () => (loadConfig(root) || {}).updateChannel }) {
  // Lần hỏi GitHub gần nhất, lưu ra file để sau khi văn phòng khởi động lại (vd. vừa cập nhật) vẫn biết đã kiểm lúc nào.
  const fetchedFile = path.join(u.HOME(), "cap-nhat-kiem.json");
  let fetched = null, fetching = null;
  try { fetched = JSON.parse(fs.readFileSync(fetchedFile, "utf8")); } catch {}

  function status() {
    const s = u.check(root, { channel: channel() });
    if (fetched) { s.fetchedAt = fetched.at; s.fetchError = fetched.error; }
    s.last = u.readState();
    s.busy = u.busy(s.last);
    return s;
  }

  // Tải bản mới từ GitHub (một lần tại một thời điểm), rồi trả tình trạng.
  async function refresh() {
    fetching = fetching || u.fetchAsync(root, channel()).then((r) => {
      fetched = r;
      try { fs.mkdirSync(u.HOME(), { recursive: true }); fs.writeFileSync(fetchedFile, JSON.stringify(r)); } catch {}
    }).finally(() => { fetching = null; });
    await fetching;
    return status();
  }

  function start(name, actor = "ceo") {
    const s = status();
    if (s.busy) throw err("UPDATE_BUSY", "Đang có một lần cập nhật chạy dở.");
    if (!s.canUpdate) throw err("NOT_READY", s.reasons[0] || NOT_READY[s.state] || "Chưa cập nhật được.");
    if (name !== s.target.name) throw err("CHANGED", `Bản mới nhất giờ là ${s.target.name}, không phải ${name}: kiểm lại.`);
    const busyJobs = jobs.list("running");
    if (busyJobs.length) throw err("AI_BUSY", `Đang có ${busyJobs.length} việc chạy (${busyJobs.slice(0, 3).map((j) => j.agent).join(", ")}): chờ xong hoặc dừng rồi mới cập nhật, vì cập nhật phải tắt văn phòng.`);
    const runs = autopilot.list().filter((r) => ["running", "reporting"].includes(r.status));
    if (runs.length) throw err("AI_BUSY", `Đội AI đang làm ${runs.length} việc được giao: chờ xong rồi mới cập nhật.`);
    if (!appManaged()) throw err("NOT_APP", "Văn phòng không chạy bằng app (npm run app) nên không tự tắt và bật lại được. Tắt văn phòng, chạy git pull --ff-only, rồi bật lại.");
    const state = u.writeState({ status: "bat-dau", from: s.head, to: s.target.sha, name: s.target.name, message: null, log: u.LOG_FILE() });
    audit.log(actor, "app.update", s.target.name, { from: s.head.slice(0, 12), to: s.target.sha.slice(0, 12), channel: s.channel });
    try { spawnUpdater(["--tach", "--tu", s.head, "--den", s.target.sha, "--ten", s.target.name]); }
    catch (e) { u.writeState({ ...state, status: "loi", message: "Không chạy được bộ cập nhật: " + e.message }); throw err("UPDATE_FAILED", "Không chạy được bộ cập nhật: " + e.message); }
    return { ...status(), last: state, busy: true };
  }

  return { status, refresh, start };
}

function defaultManaged() {
  let pid = null;
  try { pid = Number(fs.readFileSync(app.PID_FILE(), "utf8").trim()) || null; } catch {}
  return !!pid && app.isAppProcess(pid);
}

function defaultSpawn(args) {
  const root = path.join(__dirname, "..");
  const c = spawn(process.execPath, [path.join(root, "scripts", "cap-nhat.js"), ...args], { cwd: root, detached: true, windowsHide: true, stdio: "ignore" });
  c.unref();
}

module.exports = { createUpdater };
