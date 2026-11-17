// Miễn hợp đồng giao tiếp (contract/api.json) cho một dự án — CHỈ CEO quyết (CEO yêu cầu 16/11/2026: "cứ ngoại lệ thì sẽ hỏi tôi
// và giải thích"). Sol ghi "Không có API" ở Vùng [3] mới chỉ là đề nghị; luồng tự chạy hỏi CEO kèm giải thích, CEO đồng ý thì văn
// phòng ghi vào sổ này (nằm trong thư mục dữ liệu của văn phòng, AI không ghi được), không đồng ý thì Sol phải tạo hợp đồng.
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../lib/ghi-file");

const khoa = (root) => path.resolve(String(root)).toLowerCase();
function createMienHopDong({ dir }) {
  const file = path.join(dir, "mien-hop-dong.json");
  const doc = () => { try { const d = JSON.parse(fs.readFileSync(file, "utf8")); return d && typeof d === "object" ? d : {}; } catch { return {}; } };
  return {
    // CEO đã duyệt miễn cho repo này chưa
    coMien: (root) => !!doc()[khoa(root)],
    xem: (root) => doc()[khoa(root)] || null,
    ghi(root, { lyDo = "", jobId = null } = {}) {
      const d = doc();
      d[khoa(root)] = { luc: new Date().toISOString(), lyDo: String(lyDo).slice(0, 500), jobId };
      writeAtomic(file, JSON.stringify(d, null, 2));
    },
    bo(root) { const d = doc(); delete d[khoa(root)]; writeAtomic(file, JSON.stringify(d, null, 2)); },
  };
}
// Dòng của Vùng [3] mà Sol ghi đề nghị miễn (để đưa nguyên văn vào câu hỏi cho CEO).
function dongDeNghi(agentMd) {
  const m = /^.*không có api.*$/im.exec(String(agentMd || ""));
  return m ? m[0].trim().slice(0, 400) : "";
}
module.exports = { createMienHopDong, dongDeNghi };
