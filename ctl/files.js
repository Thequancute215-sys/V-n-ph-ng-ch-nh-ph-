// Đọc/ghi file trong workspace. Ghi phải kèm sha256 của bản đang đọc (expectSha256) để không đè thay đổi của AI khác
// hoặc của Giám đốc trong lúc đang sửa (409 CHANGED). File mới: expectSha256 = null.
"use strict";
const { renameRetry } = require("../lib/ghi-file");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const err = (code, msg) => Object.assign(new Error(msg), { code });

function createFiles(ws, audit) {
  function list(workspace, rel = ".") {
    const r = ws.resolve(workspace, rel);
    if (!fs.statSync(r.real).isDirectory()) throw err("NOT_DIR", r.rel + " không phải thư mục");
    const items = fs.readdirSync(r.real, { withFileTypes: true })
      .filter((d) => d.name !== ".git")
      .slice(0, 2000)
      .map((d) => {
        let size = null;
        if (d.isFile()) try { size = fs.statSync(path.join(r.real, d.name)).size; } catch {}
        return { name: d.name, dir: d.isDirectory(), link: d.isSymbolicLink(), size };
      })
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
    return { path: r.rel || ".", items };
  }

  function read(workspace, rel) {
    const r = ws.resolve(workspace, rel);
    const st = fs.statSync(r.real);
    if (!st.isFile()) throw err("NOT_FILE", r.rel + " không phải file");
    if (st.size > ws.MAX_READ) throw err("TOO_LARGE", "File lớn hơn 2 MB");
    const buf = fs.readFileSync(r.real);
    return { path: r.rel, size: st.size, sha256: sha(buf), content: buf.toString("utf8") };
  }

  function write(workspace, rel, content, expectSha256, actor = "ceo") {
    if (typeof content !== "string") throw err("BAD_REQUEST", "content phải là chuỗi");
    const data = Buffer.from(content, "utf8");
    if (data.length > ws.MAX_READ) throw err("TOO_LARGE", "Nội dung lớn hơn 2 MB");
    const r = ws.resolve(workspace, rel, { forWrite: true });
    let cur = null;
    try { cur = sha(fs.readFileSync(r.real)); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (cur !== (expectSha256 || null)) throw err("CHANGED", cur ? "File đã đổi từ lúc đọc (hoặc thiếu expectSha256)" : "File chưa có: expectSha256 phải là null");
    const tmp = r.real + ".ctl-" + crypto.randomBytes(4).toString("hex");
    fs.writeFileSync(tmp, data);
    renameRetry(tmp, r.real);
    const next = sha(data);
    audit.log(actor, "file.write", r.root + " :: " + r.rel, { from: cur, to: next, bytes: data.length });
    return { path: r.rel, sha256: next };
  }

  return { list, read, write };
}

module.exports = { createFiles };
