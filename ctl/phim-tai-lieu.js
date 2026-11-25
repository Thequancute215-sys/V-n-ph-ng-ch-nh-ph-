"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { renameRetry } = require("../lib/ghi-file");

const MAX_BYTES = 16 * 1024 * 1024;
const UPLOAD_LIMIT = Math.ceil(MAX_BYTES / 3) * 4 + 4096;
const EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".md", ".csv", ".json", ".zip", ".glb", ".png", ".jpg", ".jpeg", ".webp", ".mp4"]);
const REL = "media/tu-lieu/";
const NAME = /^([a-f0-9]{64})-([\p{L}\p{M}\p{N}_.() -]{1,128})$/u;
const err = (code, message) => Object.assign(new Error(message), { code });

function writeFile(target, contents, mode) {
  const temp = path.join(path.dirname(target), ".dang-luu-" + randomUUID());
  let fd;
  try {
    fd = fs.openSync(temp, "wx", mode);
    try { fs.writeFileSync(fd, contents); } finally { fs.closeSync(fd); }
    renameRetry(temp, target);
  } finally {
    if (fd !== undefined) fs.rmSync(temp, { force: true });
  }
}

function directory(root, create = false, subfolder = "tu-lieu") {
  let dir = fs.realpathSync(root);
  for (const part of ["media", subfolder]) {
    dir = path.join(dir, part);
    if (create) {
      try { fs.mkdirSync(dir); } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    let stat;
    try { stat = fs.lstatSync(dir); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw err("PATH_ESCAPE", "Thư mục tài liệu phải nằm trực tiếp trong dự án phim.");
  }
  return dir;
}

function verifyGlb(bytes) {
  const invalid = () => err("BAD_REQUEST", "Cần tệp GLB 2.0 có hình học và tài nguyên nằm trong cùng tệp (không dùng mesh nén Draco hoặc Meshopt).");
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length
      || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(12) > bytes.length - 20) throw invalid();
  let gltf;
  try { gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12))); }
  catch { throw invalid(); }
  if (!Array.isArray(gltf?.meshes) || !gltf.meshes.length || !Array.isArray(gltf.scenes) || !gltf.scenes.length) throw invalid();
  for (const group of [gltf.buffers, gltf.images]) {
    if (group !== undefined && (!Array.isArray(group) || group.some((item) => !item || Object.hasOwn(item, "uri")))) throw invalid();
  }
  if (gltf.extensionsRequired !== undefined && (!Array.isArray(gltf.extensionsRequired) || gltf.extensionsRequired.some((x) => ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"].includes(x)))) throw invalid();
}

function describe(name, size) {
  const [, sha256, ten] = NAME.exec(name);
  return { id: name, ten, path: REL + name, bytes: size, sha256, moHinh: path.extname(ten).toLowerCase() === ".glb" };
}

function list(root) {
  const dir = directory(root);
  if (!dir) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && NAME.test(entry.name))
    .map((entry) => describe(entry.name, fs.statSync(path.join(dir, entry.name)).size))
    .sort((a, b) => a.ten.localeCompare(b.ten, "vi"));
}

function save(root, { name, base64 }) {
  if (typeof name !== "string" || /[\\/:]/.test(name) || typeof base64 !== "string" || base64.length > UPLOAD_LIMIT) throw err("BAD_REQUEST", "Tệp đính kèm không hợp lệ.");
  const ten = name.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}_.() -]/gu, "-").trim();
  const ext = path.extname(ten).toLowerCase();
  if (ten.length > 128 || !EXTENSIONS.has(ext)) throw err("BAD_REQUEST", "Định dạng tệp không được hỗ trợ.");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString("base64") !== base64) throw err("BAD_REQUEST", "Tệp rỗng, vượt 16 MiB hoặc không đọc được.");
  if (ext === ".glb") verifyGlb(bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const id = sha + "-" + ten;
  const dir = directory(root, true);
  const file = path.join(dir, id);
  const items = list(root);
  const existed = items.find((item) => item.id === id);
  if (existed) return existed;
  if (items.length >= 30) throw err("BAD_REQUEST", "Mỗi dự án phim nhận tối đa 30 tệp.");
  writeFile(file, bytes, 0o600);
  return describe(id, bytes.length);
}

function file(root, id) {
  const dir = directory(root);
  if (!dir || typeof id !== "string" || !NAME.test(id)) throw err("NOT_FOUND", "Không tìm thấy tệp đính kèm.");
  const real = path.join(dir, id);
  let stat;
  try { stat = fs.lstatSync(real); }
  catch (error) { if (error.code === "ENOENT") throw err("NOT_FOUND", "Không tìm thấy tệp đính kèm."); throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw err("PATH_ESCAPE", "Đường dẫn tài liệu không hợp lệ.");
  const item = describe(id, stat.size);
  if (item.moHinh) verifyGlb(fs.readFileSync(real));
  return { real, item };
}

function approve(root, id) {
  const { real, item } = file(root, id);
  if (!item.moHinh || createHash("sha256").update(fs.readFileSync(real)).digest("hex") !== item.sha256) throw err("CHANGED", "Mô hình đã thay đổi. Đính kèm lại rồi duyệt bản mới.");
  const target = path.join(fs.realpathSync(root), "phim.json");
  if (!fs.lstatSync(target).isFile()) throw err("PATH_ESCAPE", "Hồ sơ phim phải nằm trực tiếp trong dự án.");
  const phim = JSON.parse(fs.readFileSync(target, "utf8").replace(/^\uFEFF/, ""));
  phim.mo_hinh_duyet = { id, sha256: item.sha256, luc: new Date().toISOString() };
  writeFile(target, JSON.stringify(phim, null, 2) + "\n", 0o644);
  return phim.mo_hinh_duyet;
}

function importTake(root, phim, canh, id) {
  const { real, item } = file(root, id);
  if (path.extname(item.ten).toLowerCase() !== ".mp4") throw err("BAD_REQUEST", "Nhập cảnh dưới dạng MP4.");
  const c = phim.canh.find((candidate) => candidate.ma === canh);
  if (!c || !/^C\d{2,3}$/.test(c.ma)) throw err("NOT_FOUND", "Không tìm thấy cảnh để nhập clip.");
  const takes = c.take || [];
  const name = c.ma + "-nhap-" + item.sha256 + ".mp4";
  const rel = "media/quay/" + name;
  if (takes.includes(rel)) return rel;
  if (takes.length >= (c.so_take_toi_da ?? 2)) throw err("TOI_DA_TAKE", "Cảnh đã đủ số take được phép.");
  const target = path.join(directory(root, true, "quay"), name);
  const bytes = fs.readFileSync(real);
  if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw err("CHANGED", "Clip đã thay đổi. Đính kèm lại.");
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.size !== bytes.length || !fs.readFileSync(target).equals(bytes))) throw err("CHANGED", "Đã có clip khác ở vị trí này.");
  if (!stat) writeFile(target, bytes, 0o600);
  c.take = [...takes, rel];
  c.trang_thai = "da_quay";
  const profile = path.join(fs.realpathSync(root), "phim.json");
  if (!fs.lstatSync(profile).isFile()) throw err("PATH_ESCAPE", "Hồ sơ phim phải nằm trực tiếp trong dự án.");
  writeFile(profile, JSON.stringify(phim, null, 2) + "\n", 0o644);
  return rel;
}

module.exports = { list, save, file, approve, importTake, UPLOAD_LIMIT };
