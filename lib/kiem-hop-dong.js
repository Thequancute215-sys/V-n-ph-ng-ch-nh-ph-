// Bộ kiểm "hợp đồng giao tiếp" Backend ↔ Frontend (CEO duyệt 16/11/2026, bước 1 của quy trình: chốt hợp đồng trước khi code).
// Sol viết hợp đồng dạng máy đọc được ở contract/api.json (OpenAPI 3, viết bằng JSON để kiểm không cần thư viện ngoài)
// cùng lúc ghi Vùng [3] của agent.md. Bộ kiểm này bắt lệch giữa hợp đồng và code thay vì trông vào trí nhớ của AI:
//   1. Hợp đồng đúng chuẩn: openapi 3.x, mỗi thao tác có responses, $ref chỉ trỏ trong file và trỏ tới chỗ có thật,
//      "required" chỉ ghi trường có trong "properties", ví dụ mẫu (example) khớp kiểu dữ liệu của chính nó.
//   2. Backend có đủ đường dẫn và sự kiện của Phase hiện tại (x-phase ≤ CURRENT_PHASE trong agent.md; không ghi = mọi Phase).
//   3. Frontend chỉ gọi đường dẫn có trong hợp đồng (chuỗi bắt đầu bằng x-tien-to-api, vd. "/api"), có đủ tên sự kiện.
//   4. --kiem-mau <Tên> <file.json|->: kiểm một giá trị JSON thật (vd. phản hồi API trong smoke test) có khớp kiểu
//      components.schemas.<Tên> hoặc sự kiện <Tên> không — bắt lệch kiểu dữ liệu Client ↔ Server khi chạy thật.
// Phần mở rộng trong contract/api.json:
//   "x-thu-muc": { "backend": ["server"], "frontend": ["client", "Assets/Scripts"] }   thư mục mã của từng bên
//   "x-tien-to-api": "/api"                                                            tiền tố đường dẫn frontend gọi
//   "x-su-kien": { "phong.cap-nhat": { "huong": "server->client", "schema": {...}, "x-phase": 2 } }   sự kiện mạng
// Kiểm tên đường dẫn/sự kiện bằng cách tìm chuỗi trong mã (mọi ngôn ngữ), nên đây là lưới bắt lệch, không thay test thật.
// File này TỰ CHẠY ĐƯỢC MỘT MÌNH: văn phòng chép nguyên file sang repo dự án thành tools/kiem-hop-dong.js (ctl/bo-kiem.js).
// Chạy: node kiem-hop-dong.js [thư mục repo] [--neu-co] [--file <hợp đồng>] | --kiem-mau <Tên> <file.json|-> [--file …]
"use strict";
const fs = require("fs");
const path = require("path");

const FILE = path.join("contract", "api.json");
const METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];
const TYPES = ["object", "array", "string", "number", "integer", "boolean", "null"];
const HUONG = ["server->client", "client->server", "hai-chieu"];
const BO_QUA = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", "Library", "Temp", "Obj", "obj", "bin", "Binaries", "Intermediate", "DerivedDataCache", "Saved", ".venv", "venv", "__pycache__", "vendor", ".next"]);
const MA_BACKEND = /\.(m?js|cjs|ts|py|go|cs|java|kt|rb|php|rs|ex|exs|scala|cpp|cc|h|hpp)$/i;
const MA_FRONTEND = /\.(m?js|cjs|ts|tsx|jsx|vue|svelte|html|cs|cpp|cc|h|hpp|gd|dart|kt|swift|lua)$/i;
const MAX_FILE = 2 * 1024 * 1024;

// ---------- Kiểm giá trị theo schema (phần JSON Schema mà OpenAPI 3.0/3.1 hay dùng) ----------
function resolveRef(doc, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined;
  return ref.slice(2).split("/").reduce((o, k) => (o && typeof o === "object" ? o[k.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined), doc);
}
const kieu = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
function khopKieu(v, t) {
  const k = kieu(v);
  return t === k || (t === "number" && k === "integer");
}
// Trả mảng lỗi (rỗng = khớp). duong: vị trí trong giá trị, để báo "$.items[2].id: phải là integer".
function kiemGiaTri(doc, schema, v, duong = "$", sau = 0) {
  if (!schema || typeof schema !== "object" || sau > 40) return [];
  if (schema.$ref) {
    const s = resolveRef(doc, schema.$ref);
    return s ? kiemGiaTri(doc, s, v, duong, sau + 1) : [duong + ": $ref không tìm thấy " + schema.$ref];
  }
  const loi = [];
  if (Array.isArray(schema.allOf)) for (const s of schema.allOf) loi.push(...kiemGiaTri(doc, s, v, duong, sau + 1));
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((s) => !kiemGiaTri(doc, s, v, duong, sau + 1).length)) loi.push(duong + ": không khớp phương án nào của anyOf");
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((s) => !kiemGiaTri(doc, s, v, duong, sau + 1).length).length !== 1) loi.push(duong + ": phải khớp đúng một phương án của oneOf");
  if (v === null && schema.nullable === true) return loi;
  if (schema.type !== undefined) {
    const ts = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!ts.some((t) => khopKieu(v, t))) { loi.push(`${duong}: phải là ${ts.join(" | ")}, đang là ${kieu(v)}`); return loi; }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) loi.push(duong + ": không nằm trong enum " + JSON.stringify(schema.enum).slice(0, 120));
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(v)) loi.push(duong + ": phải bằng " + JSON.stringify(schema.const));
  if (typeof v === "string") {
    if (Number.isInteger(schema.minLength) && v.length < schema.minLength) loi.push(`${duong}: ngắn hơn ${schema.minLength} ký tự`);
    if (Number.isInteger(schema.maxLength) && v.length > schema.maxLength) loi.push(`${duong}: dài hơn ${schema.maxLength} ký tự`);
    if (typeof schema.pattern === "string") { try { if (!new RegExp(schema.pattern, "u").test(v)) loi.push(`${duong}: không khớp mẫu ${schema.pattern}`); } catch {} }
  }
  if (typeof v === "number") {
    if (typeof schema.minimum === "number" && v < schema.minimum) loi.push(`${duong}: nhỏ hơn ${schema.minimum}`);
    if (typeof schema.maximum === "number" && v > schema.maximum) loi.push(`${duong}: lớn hơn ${schema.maximum}`);
  }
  if (Array.isArray(v)) {
    if (Number.isInteger(schema.minItems) && v.length < schema.minItems) loi.push(`${duong}: ít hơn ${schema.minItems} phần tử`);
    if (Number.isInteger(schema.maxItems) && v.length > schema.maxItems) loi.push(`${duong}: nhiều hơn ${schema.maxItems} phần tử`);
    if (schema.items) v.forEach((x, i) => loi.push(...kiemGiaTri(doc, schema.items, x, `${duong}[${i}]`, sau + 1)));
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const r of Array.isArray(schema.required) ? schema.required : []) if (!(r in v)) loi.push(`${duong}: thiếu trường bắt buộc "${r}"`);
    for (const [k, x] of Object.entries(v)) {
      if (props[k]) loi.push(...kiemGiaTri(doc, props[k], x, `${duong}.${k}`, sau + 1));
      else if (schema.additionalProperties === false) loi.push(`${duong}: có trường "${k}" không có trong hợp đồng`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") loi.push(...kiemGiaTri(doc, schema.additionalProperties, x, `${duong}.${k}`, sau + 1));
    }
  }
  return loi;
}

// ---------- Kiểm cấu trúc hợp đồng ----------
function duyetSchema(doc, schema, noi, loi, sau = 0) {
  if (!schema || typeof schema !== "object" || sau > 40) return;
  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/")) loi.push(`${noi}: $ref chỉ được trỏ trong chính file (#/…), đang là ${schema.$ref}`);
    else if (resolveRef(doc, schema.$ref) === undefined) loi.push(`${noi}: $ref không tìm thấy ${schema.$ref}`);
    return;
  }
  const ts = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  for (const t of ts) if (!TYPES.includes(t)) loi.push(`${noi}: type "${t}" không hợp lệ`);
  if (ts.includes("array") && !schema.items) loi.push(`${noi}: kiểu array phải có items`);
  if (Array.isArray(schema.required) && schema.properties && typeof schema.properties === "object") {
    for (const r of schema.required) if (!(r in schema.properties)) loi.push(`${noi}: required "${r}" không có trong properties`);
  }
  if (schema.properties && typeof schema.properties === "object") for (const [k, s] of Object.entries(schema.properties)) duyetSchema(doc, s, `${noi}.${k}`, loi, sau + 1);
  if (schema.items) duyetSchema(doc, schema.items, `${noi}[]`, loi, sau + 1);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") duyetSchema(doc, schema.additionalProperties, `${noi}{}`, loi, sau + 1);
  for (const k of ["allOf", "anyOf", "oneOf"]) if (Array.isArray(schema[k])) schema[k].forEach((s, i) => duyetSchema(doc, s, `${noi}.${k}[${i}]`, loi, sau + 1));
  if (schema.example !== undefined) for (const l of kiemGiaTri(doc, schema, schema.example)) loi.push(`${noi}: example không khớp kiểu (${l})`);
}
function noiDung(doc, content, noi, loi) {
  if (!content || typeof content !== "object") return;
  for (const [mime, m] of Object.entries(content)) {
    if (!m || typeof m !== "object") continue;
    if (m.schema) duyetSchema(doc, m.schema, `${noi} ${mime}`, loi);
    if (m.schema && m.example !== undefined) for (const l of kiemGiaTri(doc, m.schema, m.example)) loi.push(`${noi} ${mime}: example không khớp kiểu (${l})`);
  }
}
// Kiểm cấu trúc. Trả { loi: [...], canhBao: [...] }.
function kiemCauTruc(doc) {
  const loi = [], canhBao = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { loi: ["Hợp đồng phải là một object JSON"], canhBao };
  if (typeof doc.openapi !== "string" || !/^3\./.test(doc.openapi)) loi.push('Thiếu "openapi": "3.x"');
  if (!doc.info || typeof doc.info.title !== "string" || !doc.info.title.trim()) loi.push("Thiếu info.title");
  if (!doc.info || typeof doc.info.version !== "string") loi.push("Thiếu info.version (đổi hợp đồng thì tăng phiên bản)");
  const paths = doc.paths && typeof doc.paths === "object" ? doc.paths : {};
  const suKien = doc["x-su-kien"] && typeof doc["x-su-kien"] === "object" ? doc["x-su-kien"] : {};
  if (!Object.keys(paths).length && !Object.keys(suKien).length) loi.push("Hợp đồng chưa có đường dẫn (paths) hay sự kiện (x-su-kien) nào");
  const opIds = new Set();
  for (const [p, item] of Object.entries(paths)) {
    if (!p.startsWith("/")) loi.push(`Đường dẫn "${p}" phải bắt đầu bằng /`);
    if (!item || typeof item !== "object") { loi.push(`${p}: phải là object`); continue; }
    const ops = Object.keys(item).filter((k) => METHODS.includes(k));
    if (!ops.length) loi.push(`${p}: chưa có phương thức nào (get/post/…)`);
    for (const m of ops) {
      const op = item[m], noi = `${m.toUpperCase()} ${p}`;
      if (!op || typeof op !== "object") { loi.push(`${noi}: phải là object`); continue; }
      if (op.operationId !== undefined) { if (opIds.has(op.operationId)) loi.push(`${noi}: operationId "${op.operationId}" bị trùng`); opIds.add(op.operationId); }
      else canhBao.push(`${noi}: nên có operationId (tên hàm hai bên dùng chung)`);
      if (!op.responses || typeof op.responses !== "object" || !Object.keys(op.responses).length) loi.push(`${noi}: thiếu responses (mã trả về và dữ liệu)`);
      for (const [code, r] of Object.entries(op.responses || {})) {
        if (r && r.$ref) { if (resolveRef(doc, r.$ref) === undefined) loi.push(`${noi} ${code}: $ref không tìm thấy ${r.$ref}`); continue; }
        noiDung(doc, r && r.content, `${noi} → ${code}`, loi);
      }
      if (op.requestBody) noiDung(doc, op.requestBody.content, `${noi} (yêu cầu)`, loi);
      for (const par of Array.isArray(op.parameters) ? op.parameters : []) if (par && par.schema) duyetSchema(doc, par.schema, `${noi} tham số ${par.name}`, loi);
      const can = (p.match(/\{([^}]+)\}/g) || []).map((x) => x.slice(1, -1));
      const co = [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(op.parameters) ? op.parameters : [])].filter((x) => x && x.in === "path").map((x) => x.name);
      for (const c of can) if (!co.includes(c)) loi.push(`${noi}: tham số đường dẫn {${c}} chưa khai trong parameters`);
    }
  }
  for (const [ten, s] of Object.entries(suKien)) {
    if (!s || typeof s !== "object") { loi.push(`Sự kiện "${ten}": phải là object`); continue; }
    if (!HUONG.includes(s.huong)) loi.push(`Sự kiện "${ten}": huong phải là ${HUONG.join(" | ")}`);
    if (!s.schema) loi.push(`Sự kiện "${ten}": thiếu schema dữ liệu gửi kèm`);
    else duyetSchema(doc, s.schema, `Sự kiện "${ten}"`, loi);
  }
  const schemas = (doc.components && doc.components.schemas) || {};
  for (const [ten, s] of Object.entries(schemas)) duyetSchema(doc, s, `components.schemas.${ten}`, loi);
  const tm = doc["x-thu-muc"];
  if (tm !== undefined && (!tm || typeof tm !== "object" || !["backend", "frontend"].some((k) => Array.isArray(tm[k])))) loi.push('x-thu-muc phải dạng { "backend": ["…"], "frontend": ["…"] }');
  if (tm === undefined) canhBao.push('Chưa có x-thu-muc: chưa kiểm được backend/frontend có khớp hợp đồng không');
  return { loi, canhBao };
}

// ---------- Kiểm lệch giữa hợp đồng và mã ----------
function docMa(root, dirs, duoi) {
  const out = [];
  const walk = (d, sau) => {
    if (sau > 12) return;
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (BO_QUA.has(it.name) || it.name.startsWith(".")) continue;
      const p = path.join(d, it.name);
      if (it.isDirectory()) walk(p, sau + 1);
      else if (duoi.test(it.name)) { try { const st = fs.statSync(p); if (st.size <= MAX_FILE) out.push({ file: path.relative(root, p).replace(/\\/g, "/"), text: fs.readFileSync(p, "utf8") }); } catch {} }
    }
  };
  for (const d of dirs) { const abs = path.resolve(root, d); if (abs === path.resolve(root) || abs.startsWith(path.resolve(root) + path.sep)) walk(abs, 0); }
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "/api/users/{id}" → khớp "/api/users/:id", "/api/users/{id}", "/api/users/<id>", "/api/users/[id]", "/api/users/<int:id>"
function regexBackend(p) {
  const parts = p.split("/").map((seg) => (/^\{[^}]+\}$/.test(seg) ? "(?::\\w+\\??|\\{[^}/]+\\}|<[^>/]+>|\\[[^\\]/]+\\])" : esc(seg)));
  return new RegExp(parts.join("/") + "(?![\\w-])");
}
const phaseCua = (x) => (x && Number.isFinite(Number(x["x-phase"])) ? Number(x["x-phase"]) : 0);
function phaseHienTai(root) {
  try { const m = /CURRENT_PHASE:\s*Phase\s*(\d+)/i.exec(fs.readFileSync(path.join(root, "agent.md"), "utf8")); return m ? Number(m[1]) : null; } catch { return null; }
}
function kiemLech(doc, root, { phase = phaseHienTai(root) } = {}) {
  const loi = [], canhBao = [];
  const tm = doc["x-thu-muc"] || {};
  const be = Array.isArray(tm.backend) && tm.backend.length ? docMa(root, tm.backend, MA_BACKEND) : null;
  const fe = Array.isArray(tm.frontend) && tm.frontend.length ? docMa(root, tm.frontend, MA_FRONTEND) : null;
  const toiPhase = (x) => phase === null || phaseCua(x) <= phase;
  const paths = doc.paths || {};
  if (be) {
    if (!be.length) canhBao.push("Thư mục backend (" + tm.backend.join(", ") + ") chưa có mã");
    else for (const [p, item] of Object.entries(paths)) {
      if (!toiPhase(item)) continue;
      const re = regexBackend(p);
      if (!be.some((f) => re.test(f.text))) loi.push(`Backend chưa có đường dẫn ${p} của hợp đồng (tìm trong ${tm.backend.join(", ")})`);
    }
  }
  const tienTo = typeof doc["x-tien-to-api"] === "string" && doc["x-tien-to-api"].startsWith("/") ? doc["x-tien-to-api"].replace(/\/+$/, "") : null;
  if (fe && tienTo) {
    const mau = Object.keys(paths).map((p) => new RegExp("^" + p.split("/").map((seg) => (/^\{[^}]+\}$/.test(seg) ? "[^/]+" : esc(seg))).join("/") + "/?$"));
    const daBao = new Set();
    const chuoi = new RegExp("[\"'`](" + esc(tienTo) + "(?:/[^\"'`\\s?#]*)?)(?:[?#][^\"'`]*)?[\"'`]", "g");
    for (const f of fe) {
      for (const m of f.text.matchAll(chuoi)) {
        // Phần động trong chuỗi (${id}, {0}, " + id + ") coi như một đoạn bất kỳ
        const p = m[1].replace(/\$\{[^}]*\}/g, "x").replace(/\{\d+\}/g, "x").replace(/\/+$/, "") || "/";
        if (p === tienTo || mau.some((r) => r.test(p))) continue;
        const k = f.file + " " + p;
        if (!daBao.has(k)) { daBao.add(k); loi.push(`Frontend gọi ${p} (${f.file}) nhưng hợp đồng không có đường dẫn này`); }
      }
    }
  } else if (fe && Object.keys(paths).length) canhBao.push("Chưa có x-tien-to-api (vd. \"/api\"): chưa kiểm được frontend có gọi đường dẫn ngoài hợp đồng không");
  for (const [ten, s] of Object.entries(doc["x-su-kien"] || {})) {
    if (!toiPhase(s)) continue;
    const re = new RegExp("[\"'`]" + esc(ten) + "[\"'`]");
    if (be && be.length && !be.some((f) => re.test(f.text))) loi.push(`Backend chưa có sự kiện "${ten}"`);
    if (fe && fe.length && !fe.some((f) => re.test(f.text))) loi.push(`Frontend chưa có sự kiện "${ten}"`);
  }
  return { loi, canhBao };
}

// Đọc và kiểm hợp đồng của một repo. Không có file: { coHopDong: false }.
function kiemRepo(root, { file = FILE, phase } = {}) {
  const abs = path.resolve(root, file);
  let txt;
  try { txt = fs.readFileSync(abs, "utf8"); } catch { return { coHopDong: false, loi: [], canhBao: [] }; }
  let doc;
  try { doc = JSON.parse(txt.replace(/^﻿/, "")); } catch (e) { return { coHopDong: true, loi: ["contract/api.json không phải JSON hợp lệ: " + e.message], canhBao: [] }; }
  const a = kiemCauTruc(doc);
  const b = a.loi.length ? { loi: [], canhBao: [] } : kiemLech(doc, root, phase === undefined ? {} : { phase });
  return { coHopDong: true, doc, loi: [...a.loi, ...b.loi], canhBao: [...a.canhBao, ...b.canhBao] };
}
// Kiểm một giá trị thật theo tên schema (components.schemas.<ten>) hoặc tên sự kiện (x-su-kien.<ten>).
function kiemMau(doc, ten, giaTri) {
  const s = (doc.components && doc.components.schemas && doc.components.schemas[ten]) || (doc["x-su-kien"] && doc["x-su-kien"][ten] && doc["x-su-kien"][ten].schema);
  if (!s) return ["Hợp đồng không có schema hay sự kiện tên " + ten];
  return kiemGiaTri(doc, s, giaTri);
}

function main(args, { log = console.log, error = console.error, stdin = () => fs.readFileSync(0, "utf8") } = {}) {
  const lay = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const file = lay("--file") || FILE;
  const iMau = args.indexOf("--kiem-mau");
  const root = path.resolve(args.find((a, i) => !a.startsWith("--") && !["--file", "--kiem-mau"].includes(args[i - 1]) && !(iMau >= 0 && i === iMau + 2)) || ".");
  if (iMau >= 0) {
    const ten = args[iMau + 1], src = args[iMau + 2];
    if (!ten || !src) { error("Dùng: --kiem-mau <Tên schema hoặc sự kiện> <file.json | ->"); return 2; }
    let doc, v;
    try { doc = JSON.parse(fs.readFileSync(path.resolve(file), "utf8").replace(/^﻿/, "")); } catch (e) { error("Không đọc được hợp đồng " + file + ": " + e.message); return 2; }
    try { v = JSON.parse(src === "-" ? stdin() : fs.readFileSync(path.resolve(src), "utf8")); } catch (e) { error("Không đọc được giá trị JSON: " + e.message); return 2; }
    const loi = kiemMau(doc, ten, v);
    log((loi.length ? "✗ " : "✓ ") + ten + (loi.length ? ": lệch hợp đồng" : ": khớp hợp đồng"));
    for (const l of loi.slice(0, 50)) log("   - " + l);
    return loi.length ? 1 : 0;
  }
  const r = kiemRepo(root, { file });
  if (!r.coHopDong) {
    if (args.includes("--neu-co")) { log("– Không có " + file.replace(/\\/g, "/") + ": bỏ qua (--neu-co)"); return 0; }
    error("Không có " + file.replace(/\\/g, "/") + " (Sol viết hợp đồng ở đây cùng lúc với Vùng [3])"); return 2;
  }
  log((r.loi.length ? "✗ " : "✓ ") + "Hợp đồng " + file.replace(/\\/g, "/") + (r.loi.length ? "" : ": đạt"));
  for (const l of r.loi) log("   - " + l);
  for (const c of r.canhBao) log("   ! " + c);
  return r.loi.length ? 1 : 0;
}

module.exports = { FILE, kiemCauTruc, kiemLech, kiemRepo, kiemMau, kiemGiaTri, regexBackend, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
