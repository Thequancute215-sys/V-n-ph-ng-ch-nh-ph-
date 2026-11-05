// Che chuỗi giống khóa/token trước khi ghi nhật ký hoặc trả về trình duyệt (dùng cho ctl/).
// Cùng bộ quy tắc với mask() trong server.js nhưng giữ nguyên xuống dòng để đọc được log.
"use strict";

function maskSecrets(s) {
  if (!s) return "";
  return String(s)
    .replace(/[A-Za-z]:[\\/][^\s|;,]*secrets?[^\s|;,]*/gi, "‹thư mục khóa›")
    .replace(/((?:api[_-]?)?key|token|secret|password|passwd|pwd|bearer)(\s*[:=]\s*|\s+)("[^"]*"|'[^']*'|[^\s"',;]+)/gi, "$1$2‹ẩn›")
    .replace(/\b(sk|pk|rk|ghp|gho|github_pat|xox[abp]|AKIA|AIza)[-_A-Za-z0-9]{12,}/g, "‹khóa›")
    .replace(/\b(?=[A-Za-z0-9_\-+/=]*[A-Z])(?=[A-Za-z0-9_\-+/=]*[a-z])(?=[A-Za-z0-9_\-+/=]*\d)[A-Za-z0-9_\-+/=]{40,}/g, "…");
}

// Biến môi trường cho tiến trình con: bỏ mọi biến trông như khóa để AI/lệnh không đọc được.
function cleanEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!/(_KEY|_TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i.test(k)) out[k] = v;
  return out;
}

// Có chuỗi đúng hình dạng khóa thật không (tiền tố + dấu nối của từng hãng). Chặt hơn maskSecrets, vì dùng để DỪNG
// chu trình tự hành: maskSecrets che cả từ thường như "skills_directory" (bắt đầu bằng "sk"), dùng làm phanh sẽ dừng oan.
const KEY_SHAPE = /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})/;
const looksLikeKey = (s) => KEY_SHAPE.test(String(s || ""));

// Che nhẹ cho văn bản người đọc (câu trả lời chat, prompt CEO sẽ chép): chỉ che chuỗi đúng hình dạng khóa và dạng
// "token=…", "password: …". maskSecrets che cả từ đứng sau chữ "token"/"key" thường nên làm hỏng câu chữ.
function maskText(s) {
  if (!s) return "";
  return String(s)
    .replace(new RegExp(KEY_SHAPE.source, "g"), "‹khóa›")
    .replace(/\b((?:api[_-]?)?key|token|secret|password|passwd|bearer)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s"',;)]+)/gi, "$1$2‹ẩn›")
    // Chuỗi dài lẫn hoa/thường/số giống khóa; không tính "/" để đường dẫn file vẫn đọc được.
    .replace(/\b(?=[A-Za-z0-9_\-+=]*[A-Z])(?=[A-Za-z0-9_\-+=]*[a-z])(?=[A-Za-z0-9_\-+=]*\d)[A-Za-z0-9_\-+=]{40,}/g, "…");
}

module.exports = { maskSecrets, maskText, cleanEnv, looksLikeKey };
