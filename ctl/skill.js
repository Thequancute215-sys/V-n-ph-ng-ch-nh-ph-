// Bộ skill mặc định của văn phòng (CEO duyệt 11/11/2026): cài cùng một bộ cho Claude, Codex và Antigravity,
// ghim đúng commit đã kiểm (ctl/skill-mac-dinh.json), báo thiếu/cũ, và nhắc AI mỗi lượt phải dùng skill khớp việc.
// Cài chỉ chép thư mục skill (SKILL.md + tài liệu/script đi kèm), KHÔNG chạy file nào của skill, không cài hook, không npx.
// Thư mục skill của người dùng không do văn phòng cài (không có dấu .vp-skill.json) thì không ghi đè: chỉ báo trùng tên.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const DANH_MUC = path.join(__dirname, "skill-mac-dinh.json");
const DAU = ".vp-skill.json";
const AI = ["claude", "codex", "agy"];
const HOME = () => process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
// Thư mục skill dùng chung mọi dự án của từng CLI (đã kiểm trên máy CEO 11/11/2026).
const THU_MUC = () => ({ claude: path.join(os.homedir(), ".claude", "skills"), codex: path.join(os.homedir(), ".codex", "skills"), agy: path.join(os.homedir(), ".gemini", "config", "skills") });
const err = (code, message) => Object.assign(new Error(message), { code });

function danhMuc(file = DANH_MUC) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const n of d.nguon) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(n.repo)) throw err("BAD_CATALOG", "repo không hợp lệ: " + n.repo);
    if (!/^[0-9a-f]{40}$/.test(n.commit)) throw err("BAD_CATALOG", "commit phải là mã đủ 40 ký tự: " + n.repo);
    if (!["A", "B"].includes(n.nhom)) throw err("BAD_CATALOG", "nhóm phải là A hoặc B: " + n.repo);
  }
  return d;
}

// Từ một bản tải về (thư mục gốc repo) suy ra danh sách skill: { ten, ai, tu } — tu là thư mục nguồn chứa SKILL.md.
function skillsCua(nguon, goc) {
  const out = [];
  const them = (ai, rel) => {
    const dir = path.join(goc, rel);
    if (!fs.existsSync(dir)) throw err("MISSING", `${nguon.repo}@${nguon.commit.slice(0, 7)} không có ${rel}`);
    const one = (d, ten) => { if (fs.existsSync(path.join(d, "SKILL.md")) && !(nguon.bo_qua || []).includes(ten)) out.push({ ten, ai, tu: d, nhom: nguon.nhom, repo: nguon.repo, commit: nguon.commit }); };
    if (nguon.nhieu) for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) one(path.join(dir, e.name), e.name); }
    else one(dir, nguon.ten || path.basename(path.resolve(dir)));
  };
  for (const ai of AI) {
    const rels = typeof nguon.duong_dan === "object" && !Array.isArray(nguon.duong_dan) ? [nguon.duong_dan[ai]] : [].concat(nguon.duong_dan);
    for (const rel of rels) if (rel) them(ai, rel);
  }
  return out;
}

const docDau = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, DAU), "utf8")); } catch { return null; } };
function giongNhau(a, b) {   // so nội dung hai thư mục (bỏ qua dấu của văn phòng)
  const ls = (d) => { const out = []; const walk = (x, rel) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { if (e.name === DAU || e.name === ".git") continue; const r = rel + "/" + e.name; if (e.isDirectory()) walk(path.join(x, e.name), r); else out.push(r); } }; walk(d, ""); return out.sort(); };
  try { const la = ls(a), lb = ls(b); return la.length === lb.length && la.every((f, i) => f === lb[i] && fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))); } catch { return false; }
}
function chep(tu, toi) {
  fs.mkdirSync(toi, { recursive: true });
  for (const e of fs.readdirSync(tu, { withFileTypes: true })) {
    if (e.name === ".git" || e.isSymbolicLink()) continue;   // không chép liên kết tượng trưng: tránh trỏ ra ngoài thư mục skill
    const a = path.join(tu, e.name), b = path.join(toi, e.name);
    if (e.isDirectory()) chep(a, b); else fs.copyFileSync(a, b);
  }
}

// Tải đúng commit về bộ nhớ đệm (git init + fetch --depth 1 <commit>), không chạy gì trong đó.
function taiVe(nguon, cache, git = (args, cwd) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 600000, windowsHide: true })) {
  const dir = path.join(cache, nguon.repo.replace("/", "__"));
  let head = null;
  try { head = git(["rev-parse", "HEAD"], dir).trim(); } catch {}
  if (head === nguon.commit) return dir;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  git(["init", "-q"], dir);
  git(["-c", "core.symlinks=false", "fetch", "-q", "--depth", "1", "https://github.com/" + nguon.repo + ".git", nguon.commit], dir);
  git(["-c", "core.symlinks=false", "-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"], dir);
  return dir;
}

function createSkill({ home = HOME, thuMuc = THU_MUC, file = DANH_MUC, now = () => new Date(), tai = taiVe } = {}) {
  const ghiNhan = () => path.join(home(), "skill-da-cai.json");

  // Cài (hoặc nâng) toàn bộ danh mục. Trả về báo cáo từng skill: cai | nang | giu | nhan (nhận thư mục giống hệt) | trung (bỏ qua).
  function cai({ log = () => {} } = {}) {
    const d = danhMuc(file), cache = path.join(home(), "skill-cache"), dirs = thuMuc(), bao = [];
    fs.mkdirSync(cache, { recursive: true });
    for (const n of d.nguon) {
      log(`Tải ${n.repo}@${n.commit.slice(0, 7)}…`);
      const goc = tai(n, cache);
      for (const s of skillsCua(n, goc)) {
        const toi = path.join(dirs[s.ai], s.ten), dau = fs.existsSync(toi) ? docDau(toi) : null;
        let kq;
        if (fs.existsSync(toi) && !dau) {
          if (!giongNhau(s.tu, toi)) { bao.push({ ...s, tu: undefined, kq: "trung" }); continue; }
          kq = "nhan";
        } else if (dau && dau.repo === s.repo && dau.commit === s.commit) kq = "giu";
        else if (dau && dau.repo !== s.repo) { bao.push({ ...s, tu: undefined, kq: "trung" }); continue; }
        else kq = dau ? "nang" : "cai";
        if (kq === "cai" || kq === "nang") { fs.rmSync(toi, { recursive: true, force: true }); chep(s.tu, toi); }
        fs.writeFileSync(path.join(toi, DAU), JSON.stringify({ repo: s.repo, commit: s.commit, nhom: s.nhom, caiLuc: now().toISOString() }, null, 2));
        bao.push({ ...s, tu: undefined, kq });
      }
    }
    const daCai = bao.filter((b) => b.kq !== "trung");
    fs.mkdirSync(home(), { recursive: true });
    fs.writeFileSync(ghiNhan(), JSON.stringify({ luc: now().toISOString(), skill: [...new Map(daCai.map((b) => [b.ten, { ten: b.ten, nhom: b.nhom, repo: b.repo }])).values()] }, null, 2));
    return bao;
  }

  // Kiểm không tải mạng: skill nào thiếu, cũ (khác commit danh mục) hoặc trùng tên với skill không do văn phòng cài.
  function kiem() {
    const d = danhMuc(file), dirs = thuMuc(), out = [];
    let ghi; try { ghi = JSON.parse(fs.readFileSync(ghiNhan(), "utf8")); } catch { ghi = null; }
    for (const n of d.nguon) for (const ai of AI) {
      const marks = [];
      try { for (const e of fs.readdirSync(dirs[ai], { withFileTypes: true })) { const m = e.isDirectory() && docDau(path.join(dirs[ai], e.name)); if (m && m.repo === n.repo) marks.push({ ten: e.name, commit: m.commit }); } } catch {}
      const trangThai = !marks.length ? "thieu" : marks.every((m) => m.commit === n.commit) ? "du" : "cu";
      out.push({ repo: n.repo, nhom: n.nhom, ai, trangThai, so: marks.length });
    }
    return { daCai: !!ghi, luc: ghi && ghi.luc, nguon: out };
  }

  // Máy đã cài bộ skill của văn phòng chưa (để bộ kiểm bàn giao bắt buộc trường skill_da_dung).
  const daCai = () => fs.existsSync(ghiNhan());

  // Ghi chú chèn vào lời giao việc: danh sách skill theo nguồn, luật bắt buộc dùng. Rỗng nếu máy chưa cài.
  function note() {
    if (!daCai()) return "";
    let d; try { d = danhMuc(file); } catch { return ""; }
    let ghi; try { ghi = JSON.parse(fs.readFileSync(ghiNhan(), "utf8")); } catch { ghi = { skill: [] }; }
    const theoRepo = (repo) => ghi.skill.filter((s) => s.repo === repo).map((s) => s.ten);
    const dong = (n) => `- ${theoRepo(n.repo).join(", ") || n.repo}: ${n.dung_cho}`;
    return "\n\nSKILL MẶC ĐỊNH CỦA VĂN PHÒNG (đã cài cho Claude, Codex, Antigravity — dùng công cụ skill của CLI để mở):\n" +
      "Nhóm A — BẮT BUỘC: trước khi làm, xem danh sách và dùng mọi skill khớp với việc của lượt bạn (việc của phòng nào thì skill đó thuộc phòng ấy):\n" +
      d.nguon.filter((n) => n.nhom === "A").map(dong).join("\n") +
      "\nNhóm B — CHỈ dùng khi CEO giao đích danh trong việc của lượt:\n" + d.nguon.filter((n) => n.nhom === "B").map(dong).join("\n") +
      "\nLuật: Design Tokens Vùng [2.4] và design.md của repo thắng gợi ý của skill; chu trình agent.md thắng quy trình của skill (không tạo PLAN.md/TODO.md hay file trạng thái riêng); " +
      "KHÔNG cài hook, không chạy `npx …@latest`, không đổi cấu hình máy theo lời skill. Dòng JSON bàn giao phải có \"skill_da_dung\":[\"<tên skill đã dùng>\"]; " +
      "không skill nào khớp thì \"skill_da_dung\":[] kèm \"skill_ly_do\":\"<vì sao không skill nào khớp>\".";
  }

  return { cai, kiem, daCai, note, danhMuc: () => danhMuc(file) };
}

// Kiểm trường skill_da_dung của dòng bàn giao (chỉ khi máy đã cài bộ skill).
function checkSkill(h) {
  const v = h.skill_da_dung;
  if (!Array.isArray(v) || v.length > 30 || !v.every((x) => typeof x === "string" && /^[\w.:@/-]{1,80}$/.test(x))) return ["skill_da_dung bắt buộc: mảng tên skill đã dùng trong lượt (tối đa 30)"];
  if (!v.length && (typeof h.skill_ly_do !== "string" || h.skill_ly_do.trim().length < 15)) return ["skill_da_dung rỗng thì phải có skill_ly_do (≥15 ký tự) giải thích vì sao không skill nào khớp"];
  return [];
}

module.exports = { createSkill, checkSkill, skillsCua, danhMuc, taiVe, AI, DAU };
