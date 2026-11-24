// Nhãn và cách đọc chung cho luồng tự chạy, bàn giao, lượt AI (OS-3): Tổng quan, Việc và lịch chạy, Luồng và bàn giao,
// Giao việc và ngăn trượt cùng dùng, để một trạng thái chỉ có một cách gọi tên trong cả OS.
import { VAI } from "./ui.js";

export const TT_LUONG = { running: "đang chạy", reporting: "đang viết báo cáo", awaiting_answer: "chờ anh trả lời", awaiting_approval: "chờ anh duyệt báo cáo",
  attention: "cần anh xem", waiting_quota: "chờ hạn mức", awaiting_scan: "chờ anh duyệt rà soát", stopped: "đã dừng", approved: "anh đã duyệt",
  acknowledged: "đã ghi nhận", rejected: "anh đã từ chối", done: "xong", failed: "lỗi" };
export const LUONG_CHAY = new Set(["running", "reporting"]);
export const LUONG_CAN_ANH = new Set(["awaiting_answer", "awaiting_approval", "attention", "awaiting_scan"]);
export const LUONG_CHO = new Set(["waiting_quota"]);
// Luồng còn sống (ctl chưa cho giao việc mới vào dự án đó).
export const LUONG_SONG = new Set([...LUONG_CHAY, ...LUONG_CAN_ANH, ...LUONG_CHO]);
export const TT_LENH = { running: "đang chạy", pending_approval: "chờ anh duyệt", queued: "đang chờ", done: "xong", failed: "lỗi", killed: "đã dừng", timeout: "quá giờ", rejected: "anh đã từ chối" };

export const tenDuAn = (p) => String(p || "").split(/[\\/]/).pop();
export const tenVai = (r) => (VAI.find((x) => x.role === r) || {}).ten || r || "AI";
const PHU = { CLAUDE_REPORTER: "Pain viết báo cáo", CLAUDE_CHAT: "Hỏi Claude", CODEX_CHAT: "Hỏi Codex", AGY_CHAT: "Hỏi Antigravity",
  CLAUDE_WEB_PROMPT: "Claude soạn prompt web", CODEX_WEB_PROMPT: "Codex soạn prompt web", AGY_WEB_PROMPT: "Antigravity soạn prompt web" };
// Tên việc của một lượt (job): "Lượt của Sasuke (Astra)" thay cho mã vai.
export const tenLenh = (j) => { const v = VAI.find((x) => x.role === j.agent); return v ? "Lượt của " + v.ten : PHU[j.agent] || (j.agent === "ceo" ? "Lệnh anh chạy" : j.agent ? j.agent : "Lệnh " + (j.kind || "")); };
// Câu hỏi của luồng (ctl ghi { question, options }); bản cũ đọc nhầm .text nên Tổng quan hiện tên việc thay câu hỏi.
export const cauHoi = (r) => (r && r.question && (r.question.question || r.question.text)) || "";
export const soLuot = (r) => (r.steps || []).filter((s) => !s.quota).length;
// Lớp chữ cho nhãn trạng thái luồng.
export const lopLuong = (s) => LUONG_CAN_ANH.has(s) || LUONG_CHO.has(s) ? "canh-bao" : LUONG_CHAY.has(s) ? "song" : s === "failed" ? "hong" : "";

// Chuẩn hoá trường giai_thich của bàn giao (ctl có thể trả mảng object { van_de, da_lam, vi_sao, phuong_an_khac } hoặc chuỗi).
export function danhSachGiaiThich(g) {
  if (!g || typeof g === "string") return [];
  const raw = Array.isArray(g) ? g : typeof g === "object" ? [g] : [];
  return raw.map((x) => {
    if (typeof x === "string") return { van_de: "", da_lam: x.trim(), vi_sao: "", phuong_an_khac: [] };
    if (!x || typeof x !== "object") return null;
    const pa = Array.isArray(x.phuong_an_khac) ? x.phuong_an_khac.filter((a) => a && typeof a === "object" && (a.cach || a.vi_sao_khong)).map((a) => ({ cach: String(a.cach || "").trim(), vi_sao_khong: String(a.vi_sao_khong || "").trim() })) : [];
    return { van_de: String(x.van_de || "").trim(), da_lam: String(x.da_lam || "").trim(), vi_sao: String(x.vi_sao || "").trim(), phuong_an_khac: pa };
  }).filter((x) => x && (x.van_de || x.da_lam || x.vi_sao || x.phuong_an_khac.length));
}

export function tomTatGiaiThich(g) {
  if (!g) return "";
  if (typeof g === "string") return g.trim();
  const ds = danhSachGiaiThich(g);
  if (!ds.length) return "";
  const dau = ds[0];
  const chinh = dau.da_lam || dau.van_de || dau.vi_sao || (dau.phuong_an_khac[0] ? dau.phuong_an_khac[0].cach : "");
  return ds.length > 1 ? `${chinh} (+${ds.length - 1} mục)` : chinh;
}
