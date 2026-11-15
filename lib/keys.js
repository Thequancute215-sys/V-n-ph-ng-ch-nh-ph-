// Khóa API mà Giám đốc nhập từ màn "Tài khoản AI". Lưu ở ~/.van-phong-ao/keys.json (ngoài thư mục mã nguồn, quyền 600),
// KHÔNG lưu vào config.json: file đó nằm cạnh mã nguồn, dễ bị nén gửi đi hoặc chép sang máy khác cùng dự án.
// Máy chủ chỉ cần biết "đã có khóa hay chưa", không bao giờ trả khóa về trình duyệt.
"use strict";
const { writeAtomic } = require("./ghi-file");
const fs = require("fs");
const path = require("path");
const os = require("os");

// gemini: khóa AI Studio (hạn mức miễn phí) cho công cụ tra cứu của văn phòng (ctl/tra-cuu.js, CEO duyệt 16/11/2026).
const PROVIDERS = { claude: /^sk-ant-[A-Za-z0-9_\-]{20,}$/, gpt: /^sk-[A-Za-z0-9_\-]{20,}$/, gemini: /^AIza[0-9A-Za-z_\-]{30,}$/ };

function file(home) { return path.join(home || os.homedir(), ".van-phong-ao", "keys.json"); }
function load(home) { try { return JSON.parse(fs.readFileSync(file(home), "utf8")) || {}; } catch { return {}; } }
function has(provider, home) { return !!load(home)[provider]; }

function save(provider, key, home) {
  if (!PROVIDERS[provider]) return { ok: false, error: "Nhà cung cấp không hợp lệ" };
  key = String(key || "").trim();
  if (!PROVIDERS[provider].test(key)) return { ok: false, error: "Khóa không đúng định dạng của " + provider };
  const f = file(home);
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    const all = load(home); all[provider] = key;
    writeAtomic(f, JSON.stringify(all));
    return { ok: true };
  } catch (e) { return { ok: false, error: "Không ghi được " + f + ": " + e.code }; }
}

module.exports = { save, has, file };
