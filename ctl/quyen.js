// Mức quyền theo vai, đọc mỗi lượt để đổi cấu hình mà không cần khởi động lại.
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../lib/ghi-file");

const ROLES_LAM_VIEC = Object.freeze(["SPEC_ARCHITECT", "SOL_ARCHITECT_PLANNER", "SOL_ARCHITECT_ADVISOR", "CODEX_ASTRA_DEV",
  "FRONTEND_UIUX_DEV", "CLAUDE_AUDITOR", "CLAUDE_WEB_APPLY", "CODEX_WEB_APPLY"]);
const FULL_ROLES = new Set(ROLES_LAM_VIEC);
const MUC = ["doc", "nhap", "toan"];
const laSo = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const badRequest = (message) => Object.assign(new Error(message), { code: "BAD_REQUEST" });

function createQuyen({ dir, audit }) {
  const file = path.join(dir, "quyen.json");

  function docSo() {
    try {
      const s = JSON.parse(fs.readFileSync(file, "utf8"));
      return laSo(s) ? s : {};
    } catch (e) {
      if (e.code === "ENOENT" || e instanceof SyntaxError) return {};
      throw e;
    }
  }

  function chuanHoa(s) {
    const vai = Object.fromEntries(Object.entries(laSo(s.vai) ? s.vai : {})
      .filter(([role, muc]) => FULL_ROLES.has(role) && MUC.includes(muc)));
    return { toanQuyen: s.toanQuyen !== false, vai };
  }

  const doc = () => chuanHoa(docSo());

  function mucCua(role, s) {
    if (role === "CLAUDE_REPORTER" || /_(CHAT|WEB_PROMPT)$/.test(role)) return "doc";
    if (!FULL_ROLES.has(role)) return "nhap";
    const { vai, toanQuyen } = s ?? doc();
    return vai[role] ?? (toanQuyen ? "toan" : "nhap");
  }

  function dat(body, actor = "ceo") {
    if (!laSo(body)) throw badRequest("Cần gửi role và muc, hoặc toanQuyen");
    const { role, muc, toanQuyen } = body;
    const theoVai = Object.hasOwn(body, "role") || Object.hasOwn(body, "muc");
    if (theoVai) {
      if (!FULL_ROLES.has(role)) throw badRequest("Chỉ được đặt quyền cho vai làm việc");
      if (!MUC.includes(muc)) throw badRequest("Mức quyền phải là doc, nhap hoặc toan");
      if (Object.hasOwn(body, "toanQuyen")) throw badRequest("Chỉ đặt quyền theo vai hoặc công tắc chung trong một lần");
    } else if (typeof toanQuyen !== "boolean") {
      throw badRequest("toanQuyen phải là true hoặc false");
    }
    const s = docSo();
    if (theoVai) s.vai = { ...(laSo(s.vai) ? s.vai : {}), [role]: muc };
    else s.toanQuyen = toanQuyen;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeAtomic(file, JSON.stringify(s, null, 2));
    audit.log(actor, "quyen.dat", theoVai ? role : null, theoVai ? { muc } : { toanQuyen });
    return chuanHoa(s);
  }

  return { doc, mucCua, dat };
}

module.exports = { createQuyen, FULL_ROLES, ROLES_LAM_VIEC };
