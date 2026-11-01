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

module.exports = { maskSecrets, cleanEnv };
