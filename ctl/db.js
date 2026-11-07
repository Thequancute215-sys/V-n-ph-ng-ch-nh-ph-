// Sổ của OS Controller: ~/.van-phong-ao/ctl.db (node:sqlite, WAL). Schema theo Vùng [3] của agent.md.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const home = () => process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('cmd','ai')),
  agent TEXT NOT NULL,
  workspace TEXT,
  argv TEXT NOT NULL,
  pid INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pending_approval','rejected','running','done','failed','killed','timeout')),
  exit_code INTEGER,
  started_at INTEGER,
  ended_at INTEGER,
  timeout_ms INTEGER NOT NULL,
  log_path TEXT
);
-- Bảng giám sát và Kill-All mỗi giây chỉ lấy việc đang chạy / chờ duyệt.
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
-- Lịch sử theo từng AI và giới hạn số việc chạy cùng lúc của mỗi AI.
CREATE INDEX IF NOT EXISTS jobs_agent_started ON jobs(agent, started_at DESC);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  decision TEXT
);
-- Xem theo thời gian và dọn bản ghi quá 90 ngày.
CREATE INDEX IF NOT EXISTS audit_at ON audit(at);
-- Nhật ký kiểm toán chỉ được thêm: cấm sửa, chỉ cho xóa bản ghi quá 90 ngày.
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit chỉ được thêm'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
  WHEN old.at > (CAST(strftime('%s','now') AS INTEGER) - 7776000) * 1000
  BEGIN SELECT RAISE(ABORT, 'chỉ xóa được bản ghi quá 90 ngày'); END;

-- Kết quả bàn giao của mỗi lượt AI, chờ CEO duyệt chuyển lượt.
CREATE TABLE IF NOT EXISTS handoffs (
  job_id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL,
  role TEXT NOT NULL,
  next_owner TEXT,
  payload TEXT,
  problems TEXT NOT NULL,
  decided TEXT CHECK (decided IN ('approved','rejected')),
  decided_at INTEGER
);
-- Bảng "chờ duyệt chuyển lượt" chỉ lấy bàn giao chưa quyết.
CREATE INDEX IF NOT EXISTS handoffs_open ON handoffs(decided);

CREATE TABLE IF NOT EXISTS workspaces (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
`;

// Nâng cấp sổ khi app lên bản mới (nút Cập nhật, không bắt người dùng xoá sổ): đổi schema thì THÊM một bước vào cuối danh sách,
// không sửa hay xoá bước cũ. Mỗi bước (chuỗi SQL hoặc hàm nhận db) chạy đúng một lần trong một giao dịch; số bước đã chạy
// ghi ở PRAGMA user_version. Chỉ thêm bảng/cột/index, không xoá hay đổi tên: bản mới lỗi thì app quay về bản cũ, bản cũ
// vẫn phải mở được sổ đã nâng cấp.
const MIGRATIONS = [];

function migrate(db, steps = MIGRATIONS) {
  const done = db.prepare("PRAGMA user_version").get().user_version;
  for (let i = done; i < steps.length; i++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (typeof steps[i] === "function") steps[i](db); else db.exec(steps[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw Object.assign(new Error(`Nâng cấp sổ ctl.db bước ${i + 1} lỗi: ${e.message}`), { code: "DB_MIGRATION" });
    }
  }
  return db.prepare("PRAGMA user_version").get().user_version;
}

function open(dir = home(), { migrations = MIGRATIONS } = {}) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(dir, "logs"), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, "ctl.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
  db.exec(SCHEMA);
  try { migrate(db, migrations); } catch (e) { db.close(); throw e; }   // không giữ khoá file sổ khi nâng cấp lỗi
  return db;
}

module.exports = { open, home, migrate, MIGRATIONS };
