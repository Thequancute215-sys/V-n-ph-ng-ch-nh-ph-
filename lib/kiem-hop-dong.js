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
// ctx.huong: "request" thì trường readOnly không bắt buộc (máy chủ tự sinh, vd. id), "response" thì trường writeOnly không bắt buộc.
const coRieng = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function kiemGiaTri(doc, schema, v, duong = "$", sau = 0, ctx = {}) {
  if (!schema || typeof schema !== "object" || sau > 40) return [];
  const de = (s, x, d) => kiemGiaTri(doc, s, x, d, sau + 1, ctx);
  if (schema.$ref) {
    const s = resolveRef(doc, schema.$ref);
    return s ? de(s, v, duong) : [duong + ": $ref không tìm thấy " + schema.$ref];
  }
  const loi = [];
  if (Array.isArray(schema.allOf)) for (const s of schema.allOf) loi.push(...de(s, v, duong));
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((s) => !de(s, v, duong).length)) loi.push(duong + ": không khớp phương án nào của anyOf");
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((s) => !de(s, v, duong).length).length !== 1) loi.push(duong + ": phải khớp đúng một phương án của oneOf");
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
    if (schema.items) v.forEach((x, i) => loi.push(...de(schema.items, x, `${duong}[${i}]`)));
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const boQua = (r) => {   // trường chỉ-đọc trong yêu cầu / chỉ-ghi trong phản hồi thì không bắt buộc
      if (!coRieng(props, r)) return false;
      const ps = props[r] && props[r].$ref ? resolveRef(doc, props[r].$ref) || {} : props[r] || {};
      return (ctx.huong === "request" && (ps.readOnly === true || props[r].readOnly === true)) || (ctx.huong === "response" && (ps.writeOnly === true || props[r].writeOnly === true));
    };
    for (const r of Array.isArray(schema.required) ? schema.required : []) if (!coRieng(v, r) && !boQua(r)) loi.push(`${duong}: thiếu trường bắt buộc "${r}"`);
    for (const [k, x] of Object.entries(v)) {
      if (coRieng(props, k)) loi.push(...de(props[k], x, `${duong}.${k}`));
      else if (schema.additionalProperties === false) loi.push(`${duong}: có trường "${k}" không có trong hợp đồng`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") loi.push(...de(schema.additionalProperties, x, `${duong}.${k}`));
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
function noiDung(doc, content, noi, loi, huong) {
  if (!content || typeof content !== "object") return;
  for (const [mime, m] of Object.entries(content)) {
    if (!m || typeof m !== "object") continue;
    if (m.schema) duyetSchema(doc, m.schema, `${noi} ${mime}`, loi);
    if (m.schema && m.example !== undefined) for (const l of kiemGiaTri(doc, m.schema, m.example, "$", 0, { huong })) loi.push(`${noi} ${mime}: example không khớp kiểu (${l})`);
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
        noiDung(doc, r && r.content, `${noi} → ${code}`, loi, "response");
      }
      if (op.requestBody) noiDung(doc, op.requestBody.content, `${noi} (yêu cầu)`, loi, "request");
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
  else if (tm) for (const k of ["backend", "frontend"]) if (tm[k] !== undefined && (!Array.isArray(tm[k]) || tm[k].some((d) => typeof d !== "string" || !d.trim()))) loi.push(`x-thu-muc.${k} phải là mảng đường dẫn (chuỗi khác rỗng)`);
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
  const goc = path.resolve(root);
  for (const d of dirs) {
    if (typeof d !== "string" || !d.trim()) continue;
    const abs = path.resolve(root, d);
    if (abs === goc || abs.startsWith(goc + path.sep)) { try { if (fs.statSync(abs).isFile()) { if (duoi.test(abs)) out.push({ file: path.relative(root, abs).replace(/\\/g, "/"), text: fs.readFileSync(abs, "utf8") }); continue; } } catch { continue; } walk(abs, 0); }
  }
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const THAM_SO = "(?::\\w+\\??|\\{[^}/]+\\}|<[^>/]+>|\\[[^\\]/]+\\])";   // :id  {id}  <int:id>  [id]
const doanRe = (p) => p.split("/").filter(Boolean).map((seg) => (/^\{[^}]+\}$/.test(seg) ? THAM_SO : esc(seg))).join("/");
const boGach = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
// Đường dẫn trong mã backend là một chuỗi trong nháy: "/api/users/{id}" khớp '/api/users/:id', "/api/users/{id}", 'api/users/<int:id>/'
// (gạch đầu/cuối tuỳ ý) nhưng KHÔNG khớp '/api/users/:id/extra' khi hợp đồng chỉ có '/api/users/{id}'.
function regexBackend(p) {
  const than = doanRe(p);
  return new RegExp("[\"'`]/?" + than + "/?[\"'`]");
}
// Next.js / Nuxt / SvelteKit: đường dẫn nằm ở tên file (app/api/bai/[id]/route.ts, pages/api/bai.ts).
const regexFile = (p) => new RegExp("(^|/)" + doanRe(p) + "(?:/(?:route|page|index|\\+server))?\\.[a-z]+$", "i");
const phaseCua = (x) => (x && Number.isFinite(Number(x["x-phase"])) ? Number(x["x-phase"]) : 0);
function phaseHienTai(root) {
  try { const m = /CURRENT_PHASE:\s*Phase\s*(\d+)/i.exec(fs.readFileSync(path.join(root, "agent.md"), "utf8")); return m ? Number(m[1]) : null; } catch { return null; }
}
// Tiền tố chung của mọi đường dẫn: servers[0].url (dạng /api hoặc https://host/api) — chuẩn OpenAPI; paths ghi không kèm tiền tố.
function tienToServer(doc) {
  const u = doc.servers && doc.servers[0] && typeof doc.servers[0].url === "string" ? doc.servers[0].url : "";
  let p = "";
  if (u.startsWith("/")) p = u; else { try { p = new URL(u).pathname; } catch {} }
  p = boGach(p.split("?")[0]);
  return p === "/" ? "" : p;
}
const dayDu = (goc, p) => boGach(goc && p !== goc && !p.startsWith(goc + "/") ? goc + (p === "/" ? "" : p) : p);
const PT = { get: /\bget\b|httpget|getmapping/i, post: /\bpost\b|httppost|postmapping/i, put: /\bput\b|httpput|putmapping/i, patch: /\bpatch\b|httppatch|patchmapping/i, delete: /\bdelete\b|\bdel\b|httpdelete|deletemapping|\bdestroy\b/i };

// Backend có đường dẫn p chưa: (1) chuỗi đầy đủ; (2) đường dẫn ghép từ tiền tố + phần đuôi (Express app.use('/api', r) + r.get('/bai'),
// FastAPI APIRouter(prefix='/api/bai') + @get('/{id}'), NestJS @Controller('bai') + @Get(':id')…): tiền tố xuất hiện thành chuỗi riêng
// và phần đuôi xuất hiện thành chuỗi riêng trong mã backend; (3) tên file theo đường dẫn. Trả { co, file, viTri }.
function timBackend(be, p) {
  const re = regexBackend(p);
  for (const f of be) { const m = re.exec(f.text); if (m) return { co: true, file: f, viTri: m.index }; }
  const rf = regexFile(p);
  for (const f of be) if (rf.test(f.file)) return { co: true, file: f, viTri: 0 };
  const segs = p.split("/").filter(Boolean);
  for (let k = 1; k < segs.length + 1; k++) {
    const tien = "/" + segs.slice(0, k).join("/"), duoi = "/" + segs.slice(k).join("/");
    if (/\{[^}]+\}/.test(tien)) break;   // tiền tố không chứa tham số
    const reTien = new RegExp("[\"'`]/?" + esc(tien.slice(1)) + "/?[\"'`]");
    if (!be.some((f) => reTien.test(f.text))) continue;
    const reDuoi = duoi === "/" ? /["'`]\/?["'`]/ : regexBackend(duoi);
    for (const f of be) { const m = reDuoi.exec(f.text); if (m) return { co: true, file: f, viTri: m.index }; }
  }
  return { co: false };
}
function kiemLech(doc, root, { phase = phaseHienTai(root) } = {}) {
  const loi = [], canhBao = [];
  if (doc["x-kiem-ma"] === false) return { loi, canhBao: ["x-kiem-ma: false — bỏ qua kiểm mã backend/frontend (chỉ kiểm cấu trúc hợp đồng)"] };
  const tm = doc["x-thu-muc"] || {};
  const be = Array.isArray(tm.backend) && tm.backend.length ? docMa(root, tm.backend, MA_BACKEND) : null;
  const fe = Array.isArray(tm.frontend) && tm.frontend.length ? docMa(root, tm.frontend, MA_FRONTEND) : null;
  // Không đọc được Phase (repo công khai: agent.md chỉ ở máy, CI không có): chỉ kiểm mục không ghi x-phase, kèm cảnh báo.
  if (phase === null) canhBao.push("Không đọc được CURRENT_PHASE (agent.md): chỉ kiểm đường dẫn/sự kiện không ghi x-phase; chạy với --phase <số> để kiểm đủ");
  const toiPhase = (x) => (phase === null ? !(x && x["x-phase"] !== undefined) : phaseCua(x) <= phase);
  const goc = tienToServer(doc);
  const paths = doc.paths || {};
  if (be) {
    if (!be.length) canhBao.push("Thư mục backend (" + tm.backend.join(", ") + ") chưa có mã");
    else for (const [p0, item] of Object.entries(paths)) {
      if (!toiPhase(item) || (item && item["x-kiem-backend"] === false)) continue;
      const p = dayDu(goc, boGach(p0));
      const r = timBackend(be, p);
      if (!r.co) { loi.push(`Backend chưa có đường dẫn ${p} của hợp đồng (tìm trong ${tm.backend.join(", ")}; framework ghép route kiểu khác thì ghi "x-kiem-backend": false cho đường dẫn này)`); continue; }
      // Phương thức: tìm từ khoá quanh chỗ khai đường dẫn (±300 ký tự). Chỉ cảnh báo vì nhiều framework khai phương thức ở chỗ khác.
      const quanh = r.file.text.slice(Math.max(0, r.viTri - 300), r.viTri + 300);
      for (const m of Object.keys(item || {}).filter((k) => PT[k])) if (!PT[m].test(quanh)) canhBao.push(`Backend có ${p} nhưng chưa thấy phương thức ${m.toUpperCase()} gần chỗ khai (${r.file.file})`);
    }
  }
  const tienTo = typeof doc["x-tien-to-api"] === "string" && doc["x-tien-to-api"].startsWith("/") ? boGach(doc["x-tien-to-api"]) : goc || null;
  if (fe && tienTo) {
    const mau = Object.keys(paths).map((p0) => { const p = dayDu(goc, boGach(p0)); return { p, re: new RegExp("^" + (p === "/" ? "" : "/" + p.split("/").filter(Boolean).map((seg) => (/^\{[^}]+\}$/.test(seg) ? "[^/]+" : esc(seg))).join("/")) + "/?$") }; });
    const daBao = new Set();
    // Chuỗi gọi API: "<tiền tố>/…", có thể đứng sau ${BASE} hay https://host; phần ? # bỏ đi.
    const chuoi = new RegExp("[\"'`](?:\\$\\{[^}]*\\}|https?://[^/\"'`\\s]+)?(" + esc(tienTo) + "(?:/[^\"'`\\s?#]*)?)(?:[?#][^\"'`]*)?([\"'`])\\s*(\\+)?", "g");
    for (const f of fe) {
      for (const m of f.text.matchAll(chuoi)) {
        const tho = m[1];
        // Phần động trong chuỗi (${id}, {0}) coi như một đoạn bất kỳ
        const p = boGach(tho.replace(/\$\{[^}]*\}/g, "x").replace(/\{\d+\}/g, "x")) || "/";
        if (p === tienTo || mau.some((x) => x.re.test(p))) continue;
        // Ghép chuỗi ("/api/bai/" + id, hoặc chuỗi kết thúc bằng / rồi nối tiếp): coi là tiền tố, khớp khi có đường dẫn dài hơn bắt đầu bằng nó.
        if ((tho.endsWith("/") || m[3]) && mau.some((x) => new RegExp("^" + p.split("/").map((seg) => (seg === "x" ? "[^/]+" : esc(seg))).join("/") + "/").test(x.p.replace(/\{[^}]+\}/g, "x")))) continue;
        const k = f.file + " " + p;
        if (!daBao.has(k)) { daBao.add(k); loi.push(`Frontend gọi ${p} (${f.file}) nhưng hợp đồng không có đường dẫn này`); }
      }
    }
  } else if (fe && Object.keys(paths).length) canhBao.push("Chưa có x-tien-to-api (vd. \"/api\") hay servers[0].url: chưa kiểm được frontend có gọi đường dẫn ngoài hợp đồng không");
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
  const root = path.resolve(args.find((a, i) => !a.startsWith("--") && !["--file", "--kiem-mau", "--phase"].includes(args[i - 1]) && !(iMau >= 0 && i === iMau + 2)) || ".");
  if (iMau >= 0) {
    const ten = args[iMau + 1], src = args[iMau + 2];
    if (!ten || !src) { error("Dùng: --kiem-mau <Tên schema hoặc sự kiện> <file.json | ->"); return 2; }
    let doc, v;
    try { doc = JSON.parse(fs.readFileSync(path.resolve(file), "utf8").replace(/^﻿/, "")); } catch (e) { error("Không đọc được hợp đồng " + file + ": " + e.message); return 2; }
    try { v = JSON.parse(String(src === "-" ? stdin() : fs.readFileSync(path.resolve(src), "utf8")).replace(/^﻿/, "")); } catch (e) { error("Không đọc được giá trị JSON: " + e.message); return 2; }
    const loi = kiemMau(doc, ten, v);
    log((loi.length ? "✗ " : "✓ ") + ten + (loi.length ? ": lệch hợp đồng" : ": khớp hợp đồng"));
    for (const l of loi.slice(0, 50)) log("   - " + l);
    return loi.length ? 1 : 0;
  }
  const ph = lay("--phase");
  const r = kiemRepo(root, { file, ...(ph !== undefined && Number.isFinite(Number(ph)) ? { phase: Number(ph) } : {}) });
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
