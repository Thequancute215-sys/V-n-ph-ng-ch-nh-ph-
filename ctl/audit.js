// Nhật ký kiểm toán: mọi lần chạy, dừng, từ chối đều được ghi (chi tiết đã che khóa). Chỉ INSERT.
"use strict";
const { maskSecrets } = require("../lib/mask");

function createAudit(db) {
  const ins = db.prepare("INSERT INTO audit (at, actor, action, target, detail, decision) VALUES (?, ?, ?, ?, ?, ?)");
  const recent = db.prepare("SELECT id, at, actor, action, target, detail, decision FROM audit ORDER BY id DESC LIMIT ?");
  const prune = db.prepare("DELETE FROM audit WHERE at < ?");
  return {
    log(actor, action, target = null, detail = null, decision = null) {
      ins.run(Date.now(), String(actor), String(action), target == null ? null : String(target),
        detail == null ? null : maskSecrets(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 4000), decision);
    },
    recent: (n = 100) => recent.all(Math.min(Math.max(1, n | 0), 1000)),
    prune: () => prune.run(Date.now() - 90 * 86400000).changes,
  };
}

module.exports = { createAudit };
