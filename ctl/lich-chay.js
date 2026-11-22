// Hẹn giờ giao việc qua luồng hiện có hoặc hỏi qua chat chỉ đọc.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { writeAtomic } = require("../lib/ghi-file");
const { maskSecrets } = require("../lib/mask");
const { PEOPLE } = require("./chat");
const { remaining } = require("./dieu-phoi");

const PHUT = 60_000;
const PHONG = { CLAUDE: "pain", CODEX: "sasuke", AGY: "hinata" };
const AI_CUA_PHONG = { claude: "claude", astra: "codex", sol: "codex", antigravity: "agy" };
const NHA_CUNG_CAP = { claude: "claude", codex: "codex", agy: "antigravity" };
const err = (code, message) => Object.assign(new Error(message), { code });
const phongHoi = (vai) => Object.hasOwn(PHONG, vai) ? PHONG[vai] : vai;
const xau = (x) => typeof x === "string" ? x.trim() : "";
const boQua = (ghiChu) => ({ kq: "bo-qua", ghiChu });

function kiemNhip(nhip) {
  if (nhip?.kieu === "moi-phut") {
    if (Number.isSafeInteger(nhip.phut) && nhip.phut >= 30) return { kieu: nhip.kieu, phut: nhip.phut };
    throw err("BAD_REQUEST", "Nhịp theo phút phải là số nguyên từ 30 trở lên.");
  }
  if (typeof nhip?.gio === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(nhip.gio)) {
    if (nhip.kieu === "hang-ngay") return { kieu: nhip.kieu, gio: nhip.gio };
    if (nhip.kieu === "hang-tuan" && Number.isInteger(nhip.thu) && nhip.thu >= 1 && nhip.thu <= 7) {
      return { kieu: nhip.kieu, thu: nhip.thu, gio: nhip.gio };
    }
  }
  throw err("BAD_REQUEST", "Nhịp, giờ hoặc thứ trong tuần không hợp lệ.");
}

function tinhLanToi(lich, tu) {
  const nhip = kiemNhip(lich?.nhip);
  const moc = new Date(tu);
  if (!Number.isFinite(+moc)) throw err("BAD_REQUEST", "Mốc tính lịch không hợp lệ.");
  let toi;
  if (nhip.kieu === "moi-phut") {
    toi = new Date(+moc + nhip.phut * PHUT);
  } else {
    const [gio, phut] = nhip.gio.split(":").map(Number);
    const theoTuan = nhip.kieu === "hang-tuan";
    const soNgay = theoTuan ? (nhip.thu - (moc.getDay() || 7) + 7) % 7 : 0;
    const vaoNgay = (them) => {
      const ngay = new Date(moc);
      ngay.setDate(moc.getDate() + them);
      ngay.setHours(gio, phut, 0, 0);
      return ngay;
    };
    toi = vaoNgay(soNgay);
    if (toi <= moc) toi = vaoNgay(soNgay + (theoTuan ? 7 : 1));
  }
  if (!Number.isFinite(+toi)) throw err("BAD_REQUEST", "Lần chạy tiếp theo nằm ngoài phạm vi ngày giờ.");
  return toi.toISOString();
}

function henGio(fn, ms) {
  const timer = setInterval(fn, ms);
  timer.unref();
  return () => clearInterval(timer);
}

function createLichChay({ dir, audit, now = Date.now, autopilot, chat, quota = () => null,
  setTimer = henGio, ws, workspaceBusy = () => false }) {
  const file = path.join(dir, "lich-chay.json");
  const dangGiao = new Map(), lanTruoc = new Map();
  let ds = [];
  let daDung = false;
  try { ds = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  if (!Array.isArray(ds)) throw err("BAD_REQUEST", "Sổ lịch chạy không hợp lệ.");
  const log = (actor, action, id, detail) => audit?.log(actor, "lich_chay." + action, id, detail);

  function luuSo(moi) {
    fs.mkdirSync(dir, { recursive: true });
    writeAtomic(file, JSON.stringify(moi, null, 2) + "\n");
    ds = moi;
  }
  function capNhat(x) {
    const co = ds.some((l) => l.id === x.id);
    luuSo(co ? ds.map((l) => l.id === x.id ? x : l) : [...ds, x]);
  }
  function tim(id) {
    const x = ds.find((l) => l.id === id);
    if (!x) throw err("NOT_FOUND", "Không có lịch chạy này.");
    return x;
  }
  function luu(lich, actor = "ceo") {
    const ten = xau(lich?.ten), moTa = xau(lich?.moTa), duongDan = xau(lich?.workspace);
    const { loai, vai, bat } = lich || {};
    if (!ten || !moTa || !duongDan || !["luong", "hoi"].includes(loai)) {
      throw err("BAD_REQUEST", "Cần tên, mô tả nhiệm vụ, workspace và loại lịch.");
    }
    if ((loai === "luong" && moTa.length > 3000) || (loai === "hoi" && moTa.length > 4000)) {
      throw err("BAD_REQUEST", "Mô tả nhiệm vụ dài quá giới hạn của luồng hoặc chat.");
    }
    if (loai === "hoi" && (typeof vai !== "string" || !Object.hasOwn(PEOPLE, phongHoi(vai)))) {
      throw err("BAD_REQUEST", "Vai hỏi phải là CLAUDE, CODEX, AGY hoặc một phòng chat của văn phòng.");
    }
    if (bat !== undefined && typeof bat !== "boolean") throw err("BAD_REQUEST", "Trạng thái bật phải là boolean.");
    const nhip = kiemNhip(lich.nhip);
    const workspace = ws ? ws.find(duongDan).path : duongDan;
    const cu = lich.id === undefined ? null : tim(lich.id);
    let id = cu?.id;
    if (!id) {
      do { id = "lich-" + randomBytes(4).toString("hex"); } while (ds.some((x) => x.id === id));
    }
    const luc = Number(now());
    const x = { id, ten, moTa, loai, workspace, ...(loai === "hoi" ? { vai } : {}), nhip,
      bat: bat ?? cu?.bat ?? false, tao: cu?.tao ?? new Date(luc).toISOString(),
      lanToi: null, lichSu: cu?.lichSu ?? [] };
    const lanToi = tinhLanToi(x, luc);
    // Sửa tên hoặc mô tả giữ nguyên nhịp đã lên lịch.
    if (x.bat) x.lanToi = cu?.bat && JSON.stringify(cu.nhip) === JSON.stringify(nhip) ? cu.lanToi || lanToi : lanToi;
    capNhat(x);
    log(actor, "luu", id, { workspace, loai, bat: x.bat });
    return structuredClone(x);
  }
  function batTat(id, bat, actor = "ceo") {
    if (typeof bat !== "boolean") throw err("BAD_REQUEST", "Trạng thái bật phải là boolean.");
    const cu = tim(id);
    const x = { ...cu, bat, lanToi: bat ? cu.lanToi || tinhLanToi(cu, now()) : null };
    capNhat(x);
    log(actor, "bat_tat", id, { bat });
    return structuredClone(x);
  }
  function xoa(id, actor = "ceo") {
    tim(id);
    luuSo(ds.filter((x) => x.id !== id));
    lanTruoc.delete(id);
    log(actor, "xoa", id);
    return { id };
  }

  function kiemQuota(x, who, luc) {
    const kinds = x.loai === "luong" ? ["claude", "codex", "agy"] : [AI_CUA_PHONG[PEOPLE[who].ai]];
    let snapshot;
    try { snapshot = quota(); } catch { return { ghiChu: "không đọc được hạn mức" }; }
    const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : [];
    let thieu = false;
    for (const kind of kinds) {
      const provider = providers.find((p) => p?.id === NHA_CUNG_CAP[kind]);
      const buckets = Array.isArray(provider?.buckets)
        ? provider.buckets.filter((b) => Number.isFinite(b?.remainingPercent)) : [];
      const con = provider && (!provider.status || provider.status === "ready")
        ? remaining({ providers: [{ ...provider, buckets }] }, kind, luc) : null;
      if (Number.isFinite(con) && con < 15) return { boQua: `Hạn mức ${NHA_CUNG_CAP[kind]} còn ${con}% (dưới 15%).` };
      if (!Number.isFinite(con)) thieu = true;
    }
    return { ghiChu: thieu ? "không đọc được hạn mức" : "" };
  }

  function ghiKetQua(id, actor, luc, kq, ghiChu, ma = null) {
    const x = ds.find((l) => l.id === id);
    const ketQua = { luc: new Date(luc).toISOString(), kq, ghiChu: maskSecrets(ghiChu).slice(0, 1000), ma };
    if (x) {
      const lichSu = [ketQua, ...x.lichSu].sort((a, b) => b.luc.localeCompare(a.luc)).slice(0, 20);
      capNhat({ ...x, lichSu });
    }
    log(actor, "chay", id, ketQua);
    return { ...ketQua };
  }

  async function giao(x, luc) {
    const { id } = x;
    if (daDung) return boQua("Lịch chạy đang dừng.");
    if (dangGiao.has(id) || lanTruoc.get(id)?.()) return boQua("Lần trước của lịch chưa xong.");
    lanTruoc.delete(id);
    const workspace = ws ? ws.find(x.workspace).path : x.workspace;
    if (autopilot?.busy?.(workspace) || workspaceBusy(workspace) || [...dangGiao.values()].includes(workspace)) {
      return boQua("Workspace đang có luồng hoặc lượt AI.");
    }
    const who = x.loai === "hoi" ? phongHoi(x.vai) : null;
    const muc = kiemQuota(x, who, luc);
    if (muc.boQua) return boQua(muc.boQua);

    dangGiao.set(id, workspace);
    try {
      let ma, kiem;
      let loi = "";
      if (x.loai === "luong") {
        const run = await autopilot.start({ workspace, task: x.moTa }, "lich-chay");
        ma = run.id;
        kiem = () => autopilot.busy?.(workspace);
        // Luồng có thể đã được ghi sổ nhưng lỗi ở bước khởi chạy đầu tiên.
        if (["attention", "reporting"].includes(run.status)) loi = run.problem || "Không khởi chạy được luồng.";
      } else {
        const hoi = await chat.send({ workspace, who, text: x.moTa }, "lich-chay");
        const traLoi = hoi.messages?.findLast((m) => m.from === "ai");
        if (traLoi?.status === "loi") throw new Error(traLoi.text);
        ma = traLoi?.jobId ?? traLoi?.id ?? null;
        kiem = () => chat.get?.(workspace, who)?.messages?.some((m) =>
          (m.jobId ?? m.id) === ma && m.status === "cho");
      }
      if (ma && ds.some((l) => l.id === id)) lanTruoc.set(id, kiem);
      return { kq: loi ? "loi" : "ok", ghiChu: [loi, muc.ghiChu].filter(Boolean).join(" · "), ma };
    } finally { dangGiao.delete(id); }
  }

  async function chayNgay(id, actor = "lich-chay") {
    const x = tim(id);
    const luc = Number(now());
    let ketQua;
    try { ketQua = await giao(x, luc); }
    catch (e) {
      const kq = ["AI_BUSY", "CHAT_BUSY", "HANDOFF_PENDING"].includes(e.code) ? "bo-qua" : "loi";
      ketQua = { kq, ghiChu: e.message || String(e) };
    }
    return ghiKetQua(id, actor, luc, ketQua.kq, ketQua.ghiChu, ketQua.ma);
  }

  async function tick() {
    if (daDung) return;
    const luc = Number(now());
    const quaGio = ds.filter((x) => x.bat && Date.parse(x.lanToi) <= luc);
    if (!quaGio.length) return;
    const denGio = new Set();
    const moi = ds.map((x) => {
      if (!quaGio.includes(x)) return x;
      const den = Date.parse(x.lanToi);
      if (luc - den <= PHUT) denGio.add(x.id);
      return { ...x, lanToi: tinhLanToi(x, denGio.has(x.id) ? den : luc) };
    });
    // Ghi trước khi giao để vòng kiểm tiếp theo không chạy trùng lịch.
    luuSo(moi);
    for (const x of quaGio) if (!denGio.has(x.id)) log("lich-chay", "tinh_lai", x.id);
    await Promise.all([...denGio].map((id) => chayNgay(id)));
  }

  const lucKhoiDong = Number(now());
  const quaGio = ds.filter((x) => x.bat && !(Date.parse(x.lanToi) > lucKhoiDong));
  if (quaGio.length) {
    luuSo(ds.map((x) => quaGio.includes(x) ? { ...x, lanToi: tinhLanToi(x, lucKhoiDong) } : x));
    for (const x of quaGio) log("lich-chay", "tinh_lai", x.id);
  }
  const timer = setTimer(() => tick().catch((e) => log("lich-chay", "loi", null, maskSecrets(e.message))), PHUT);
  function dung() {
    if (daDung) return;
    daDung = true;
    if (typeof timer === "function") timer(); else clearInterval(timer);
  }

  return { list: () => structuredClone(ds), luu, batTat, xoa, chayNgay, tinhLanToi, dung };
}

module.exports = { createLichChay };
