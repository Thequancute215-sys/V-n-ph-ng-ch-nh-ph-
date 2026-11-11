#!/usr/bin/env node
// Cài / kiểm bộ skill mặc định của văn phòng cho Claude, Codex, Antigravity (danh mục: ctl/skill-mac-dinh.json).
//   node tools/cai-skill.js         kiểm: skill nào thiếu, cũ (khác commit đã ghim)
//   node tools/cai-skill.js cai     tải đúng commit đã kiểm rồi chép vào ~/.claude/skills, ~/.codex/skills, ~/.gemini/config/skills
// Không chạy file nào của skill, không cài hook. Thư mục skill anh tự cài (không có .vp-skill.json) thì không ghi đè.
"use strict";
const { createSkill } = require("../ctl/skill");

const VI = { cai: "cài mới", nang: "nâng bản", giu: "giữ (đã đúng bản)", nhan: "nhận thư mục giống hệt", trung: "BỎ QUA: trùng tên với skill không do văn phòng cài" };
const sk = createSkill();
if (process.argv[2] === "cai") {
  const bao = sk.cai({ log: (s) => console.log(s) });
  const dem = {};
  for (const b of bao) dem[b.kq] = (dem[b.kq] || 0) + 1;
  for (const b of bao.filter((x) => x.kq === "trung")) console.log(`  ! ${b.ai}: ${b.ten} (${b.repo}) — ${VI.trung}`);
  console.log("Xong: " + Object.entries(dem).map(([k, n]) => `${n} ${VI[k]}`).join(", "));
  process.exitCode = dem.trung ? 1 : 0;
} else {
  const k = sk.kiem();
  console.log(k.daCai ? "Đã cài lúc " + k.luc : "Máy chưa cài bộ skill của văn phòng: chạy `node tools/cai-skill.js cai`");
  for (const r of k.nguon) console.log(`${r.trangThai === "du" ? "✓" : r.trangThai === "cu" ? "↻" : "✗"} [${r.nhom}] ${r.repo.padEnd(40)} ${r.ai.padEnd(6)} ${r.trangThai}${r.so ? " (" + r.so + " skill)" : ""}`);
  process.exitCode = k.nguon.some((r) => r.trangThai !== "du") ? 1 : 0;
}
