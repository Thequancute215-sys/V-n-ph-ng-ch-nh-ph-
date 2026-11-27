// Chốt file cho lượt chat CEO đã bấm "Đồng ý làm" (CEO yêu cầu 28/11/2026: chặn sửa file lung tung; xoá dữ liệu phải hỏi rõ và giải thích).
// Trước lượt: chụp TOÀN BỘ cây làm việc (kể cả file chưa theo dõi, theo .gitignore) thành một đối tượng tree của git, bằng một index
// tạm riêng: không đụng index, nhánh hay stash của CEO. Chụp thêm dấu (kích thước, giờ sửa) của file bị gitignore (git không lưu
// nội dung chúng) để biết nếu chúng bị xoá hay ghi đè.
// Sau lượt: chụp lại, so hai cây rồi xử lý:
//  - Sửa/thêm file ĐÚNG danh sách sua_file CEO đã duyệt: giữ.
//  - Xoá file ĐÚNG danh sách xoa CEO đã duyệt (có lý do): giữ.
//  - Sửa file NGOÀI danh sách: trả về bản cũ ngay (bản sau lượt vẫn còn trong cây "sau", CEO bấm để lấy lại).
//  - Xoá file NGOÀI danh sách: khôi phục ngay từ cây "trước" (xoá dữ liệu chưa hỏi = không được phép).
//  - Thêm file mới NGOÀI danh sách: KHÔNG tự xoá (xoá cũng phải hỏi); báo CEO, CEO bấm nếu muốn xoá.
//  - File bị gitignore mất/đổi: không khôi phục được (git không lưu), báo đỏ.
// Chạy ĐỒNG BỘ có chủ ý: trong lúc chụp/khôi phục không lượt nào khác chen vào ghi file. Thời gian được giới hạn bằng cách từ chối
// chụp khi có file chưa theo dõi quá lớn (CEO thêm vào .gitignore rồi duyệt lại).
// Dự án không dùng git: không chụp được, báo rõ để CEO quyết.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const MAX_FILE = 200;                       // số file liệt kê tối đa trong một kết quả (kèm tổng số thật)
const MAX_MOT_FILE = 100 * 1024 * 1024;     // file chưa theo dõi lớn hơn thì không chụp
const MAX_TONG = 500 * 1024 * 1024;         // tổng file chưa theo dõi lớn hơn thì không chụp
const MAX_BO_QUA = 5000;                    // số file gitignore ghi dấu tối đa
// Thư mục gitignore nặng (thư viện, bản build): chỉ kiểm còn hay mất, không ghi dấu từng file.
const NANG = /^(node_modules|\.venv|venv|env|dist|build|out|\.next|\.nuxt|\.cache|__pycache__|target|coverage|\.turbo|\.parcel-cache|\.gradle|vendor)\/$/i;
const laWin = process.platform === "win32";
// Không bao giờ được sửa/xoá trong lượt chat dù AI có khai: agent.md (khoá lượt của giao thức) và mọi thứ trong .git.
const camHan = (f) => /^agent\.md$/i.test(f) || f.split("/").some((x) => x.toLowerCase() === ".git");
const loi = (code, message) => Object.assign(new Error(message), { code });

function git(root, args, env = {}) {
  return execFileSync("git", ["--literal-pathspecs", "-c", "core.hooksPath=" + (laWin ? "NUL" : "/dev/null"), "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", ...args],
    { cwd: root, encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
}
const thuc = (p) => { let r; try { r = fs.realpathSync.native(p); } catch { r = path.resolve(p); } return laWin ? r.toLowerCase() : r; };
// Thư mục dự án chính là gốc repo git (so qua realpath, không phân biệt hoa/thường trên Windows: junction, ổ d:/D:).
const laGit = (root) => { try { return git(root, ["rev-parse", "--is-inside-work-tree"]).trim() === "true" && thuc(git(root, ["rev-parse", "--show-toplevel"]).trim()) === thuc(root); } catch { return false; } };

// Đường dẫn tương đối an toàn trong repo (dấu /, không .., không tuyệt đối, không .git, không agent.md). Sai thì trả null.
// Thư mục: kết thúc bằng "/" hoặc "/**". Không nhận ký tự đại diện nào khác.
function chuanDuong(p) {
  if (typeof p !== "string") return null;
  const s = p.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  if (!s || s.length > 400 || /^[a-z]:/i.test(s) || s.startsWith("/")) return null;
  const than = s.replace(/\/\*\*$/, "/");
  const doan = than.replace(/\/$/, "").split("/");
  if (doan.some((x) => x === "" || x === "." || x === "..") || /[\u0000-\u001f*?"<>|]/.test(than) || camHan(than.replace(/\/$/, ""))) return null;
  return s;
}
// Khớp danh sách được phép: đúng file, hoặc thư mục kết thúc bằng "/" hay "/**" (Windows: không phân biệt hoa/thường).
function khop(file, ds) {
  const f = laWin ? file.toLowerCase() : file;
  return ds.some((p) => {
    const t = (laWin ? p.toLowerCase() : p).replace(/\/\*\*$/, "/");
    return t.endsWith("/") ? f.startsWith(t) : f === t;
  });
}

// Dấu của file/thư mục gitignore: [đường dẫn, kích thước, giờ sửa]; thư mục nặng chỉ ghi [đường dẫn, -1, 0].
function dauBoQua(root) {
  const ra = [];
  const them = (rel) => { if (ra.length >= MAX_BO_QUA) return; try { const st = fs.lstatSync(path.join(root, rel)); ra.push([rel, st.size, Math.round(st.mtimeMs)]); } catch {} };
  const di = (relDir) => {
    let ds; try { ds = fs.readdirSync(path.join(root, relDir), { withFileTypes: true }); } catch { return; }
    for (const d of ds) {
      if (ra.length >= MAX_BO_QUA) return;
      const rel = relDir + d.name + (d.isDirectory() ? "/" : "");
      if (d.isDirectory()) { if (NANG.test(d.name + "/")) ra.push([rel, -1, 0]); else di(rel); } else them(rel);
    }
  };
  const ds = git(root, ["ls-files", "-z", "-o", "-i", "--exclude-standard", "--directory"]).split("\0").filter(Boolean);
  for (const p of ds) if (!p.endsWith("/")) them(p);                        // file lẻ (.env, config.json…) trước
  for (const p of ds) if (p.endsWith("/") && NANG.test(p.split("/").slice(-2)[0] + "/")) ra.push([p, -1, 0]);
  for (const p of ds) { if (ra.length >= MAX_BO_QUA) break; if (p.endsWith("/") && !NANG.test(p.split("/").slice(-2)[0] + "/")) di(p); }
  return ra;
}

// File chưa theo dõi quá lớn: chụp sẽ chậm và phình .git → từ chối, báo CEO thêm vào .gitignore.
function kiemDungLuong(root) {
  let tong = 0;
  for (const f of git(root, ["ls-files", "-z", "-o", "--exclude-standard"]).split("\0").filter(Boolean)) {
    let n = 0; try { n = fs.lstatSync(path.join(root, f)).size; } catch {}
    if (n > MAX_MOT_FILE) throw loi("NOT_READY", `File chưa theo dõi quá lớn: ${f} (${Math.round(n / 1048576)} MB). Thêm vào .gitignore rồi bấm Đồng ý lại.`);
    tong += n;
    if (tong > MAX_TONG) throw loi("NOT_READY", "Tổng file chưa theo dõi quá lớn (> 500 MB): thêm các thư mục media/build vào .gitignore rồi bấm Đồng ý lại.");
  }
}

function chupCay(root) {
  const tam = path.join(os.tmpdir(), "vp-chot-" + crypto.randomBytes(6).toString("hex"));
  try {
    const env = { GIT_INDEX_FILE: tam };
    try { git(root, ["read-tree", "HEAD"], env); } catch { /* repo chưa có commit: index rỗng */ }
    git(root, ["add", "-A", "--", "."], env);
    return git(root, ["write-tree"], env).trim();
  } finally { try { fs.rmSync(tam, { force: true }); } catch {} }
}

function chup(root) {
  if (!laGit(root)) return null;
  kiemDungLuong(root);
  return { tree: chupCay(root), boQua: dauBoQua(root), coSubmodule: fs.existsSync(path.join(root, ".gitmodules")) };
}

function soSanh(root, a, b) {
  const out = git(root, ["diff-tree", "-r", "--no-renames", "--name-status", "-z", a, b]).split("\0").filter(Boolean);
  const ds = [];
  for (let i = 0; i + 1 < out.length; i += 2) ds.push({ loai: out[i][0], file: out[i + 1] });
  return ds;
}

// Trả file về bản trong cây tree (không đụng index). Lô lỗi (vd. một file bị thay bằng thư mục, file đang bị khoá) thì làm
// lại TỪNG file để các file khác vẫn được khôi phục; trả danh sách file không khôi phục được.
function traVe(root, tree, tatCa) {
  const hong = [];
  // Chỗ của file đang bị một thư mục chiếm (hoặc một thư mục cha đã bị thay bằng file): git restore sẽ XOÁ thứ đang chiếm chỗ
  // (kể cả file mới bên trong) mà không hỏi → không khôi phục đè, báo CEO xử lý tay.
  const files = tatCa.filter((f) => {
    const doan = f.split("/");
    for (let i = 1; i <= doan.length; i++) {
      let st = null; try { st = fs.lstatSync(path.join(root, ...doan.slice(0, i))); } catch { return true; }   // chưa có: khôi phục bình thường
      const cuoi = i === doan.length;
      if (cuoi ? st.isDirectory() : !st.isDirectory()) { hong.push({ file: f, loi: cuoi ? "chỗ này đang là thư mục" : "thư mục cha đã bị thay bằng file" }); return false; }
    }
    return true;
  });
  for (let i = 0; i < files.length; i += 50) {
    const lo = files.slice(i, i + 50);
    try { git(root, ["restore", "--source=" + tree, "--worktree", "--", ...lo]); }
    catch {
      for (const f of lo) {
        try { git(root, ["restore", "--source=" + tree, "--worktree", "--", f]); }
        catch (e) { hong.push({ file: f, loi: String(e.stderr || e.message).trim().split("\n").pop().slice(0, 200) }); }
      }
    }
  }
  return hong;
}

// Xử lý sau lượt duyệt. duyet = { suaFile: [...], xoa: [{ duongDan, lyDo }] }. Trả kết quả để hiện cho CEO.
function kiemSau(root, truoc, duyet) {
  if (!truoc) return { khongGit: true };
  const sauTree = chupCay(root);
  const thayDoi = soSanh(root, truoc.tree, sauTree);
  const choSua = (duyet.suaFile || []).map(chuanDuong).filter(Boolean);
  const choXoa = (duyet.xoa || []).map((x) => chuanDuong(x.duongDan)).filter(Boolean);
  const duoc = (file, ds) => !camHan(file) && khop(file, ds);
  const kq = { truoc: truoc.tree, sau: sauTree, dungPhamVi: [], xoaDuocDuyet: [], daTraVe: [], daKhoiPhuc: [], fileMoiNgoai: [], boQuaMat: [], boQuaDoi: [], loiKhoiPhuc: [],
    coSubmodule: !!truoc.coSubmodule };
  for (const { loai, file } of thayDoi) {
    if (loai === "D") (duoc(file, choXoa) ? kq.xoaDuocDuyet : kq.daKhoiPhuc).push(file);
    else if (duoc(file, choSua)) kq.dungPhamVi.push(file);
    else if (loai === "A") kq.fileMoiNgoai.push(file);
    else kq.daTraVe.push(file);
  }
  kq.loiKhoiPhuc = traVe(root, truoc.tree, [...kq.daKhoiPhuc, ...kq.daTraVe]);
  const ket = new Set(kq.loiKhoiPhuc.map((h) => h.file));
  kq.daKhoiPhuc = kq.daKhoiPhuc.filter((f) => !ket.has(f));
  kq.daTraVe = kq.daTraVe.filter((f) => !ket.has(f));
  // File gitignore (git không lưu nội dung): mất hoặc đổi kích thước/giờ sửa mà không nằm trong phạm vi được duyệt → báo đỏ.
  for (const [p, size, mtime] of truoc.boQua || []) {
    const ten = p.replace(/\/$/, "");
    if (khop(ten, choXoa) || khop(p, choXoa)) continue;                       // được duyệt xoá
    let st = null; try { st = fs.lstatSync(path.join(root, p)); } catch {}
    if (!st) kq.boQuaMat.push(p);                                               // mất mà không được duyệt xoá (kể cả khi được duyệt sửa)
    else if (size >= 0 && !p.endsWith("/") && !khop(ten, choSua) && (st.size !== size || Math.round(st.mtimeMs) !== mtime)) kq.boQuaDoi.push(p);
  }
  kq.tong = {};
  for (const k of ["dungPhamVi", "xoaDuocDuyet", "daTraVe", "daKhoiPhuc", "fileMoiNgoai", "boQuaMat", "boQuaDoi", "loiKhoiPhuc"]) {
    kq.tong[k] = kq[k].length;
    kq[k] = kq[k].slice(0, MAX_FILE);
  }
  return kq;
}

// Mã blob của file trong cây tree (null nếu không có) và của file đang nằm trên đĩa.
function blobTrong(root, tree, file) { try { const o = git(root, ["ls-tree", "-z", tree, "--", file]).split("\0")[0]; return o ? o.split(/\s+/)[2] : null; } catch { return undefined; } }
function blobDia(root, file) { try { return git(root, ["hash-object", "--", file]).trim(); } catch { return null; } }

// CEO bấm sau lượt: "dung-ban-ai" = lấy lại bản sau lượt cho các file đã bị trả về; "xoa-file-moi" = xoá file mới ngoài phạm vi.
// Chỉ làm với file VẪN Y NHƯ lúc kiểm (không ghi đè/xoá thứ CEO hay lượt khác sửa sau đó); file đã đổi thì bỏ qua và báo.
// Không bao giờ áp lại agent.md / .git; không xoá thư mục (chỉ file thường và symlink, không đi theo symlink).
function apDung(root, kq, hanhDong) {
  if (!kq || kq.khongGit || kq.loi || !kq.truoc || !kq.sau) throw loi("BAD_REQUEST", "Không có ảnh chụp file hợp lệ cho lượt này");
  if (hanhDong === "dung-ban-ai") {
    if (!kq.daTraVe.length) throw loi("BAD_REQUEST", "Không có file nào đã bị trả về");
    const lam = [], boQua = [];
    for (const f of kq.daTraVe) (!camHan(f) && blobDia(root, f) === blobTrong(root, kq.truoc, f) ? lam : boQua).push(f);
    const hong = lam.length ? traVe(root, kq.sau, lam) : [];
    return { daLam: lam.filter((f) => !hong.some((h) => h.file === f)), boQua: [...boQua, ...hong.map((h) => h.file)] };
  }
  if (hanhDong === "xoa-file-moi") {
    const lam = [], boQua = [];
    for (const f of kq.fileMoiNgoai) {
      // Tên thô từ git (không trim/chuẩn hoá: " server.js" khác "server.js"), phải nằm trong repo.
      const dich = path.join(root, f);
      if (typeof f !== "string" || !f || f.includes("\0") || camHan(f) || f.split("/").some((x) => x === "" || x === "." || x === "..") ||
        path.relative(root, dich).startsWith("..") || path.isAbsolute(path.relative(root, dich))) { boQua.push(String(f)); continue; }
      let st = null; try { st = fs.lstatSync(dich); } catch {}
      if (!st) continue;                                                      // đã không còn
      const sau = blobTrong(root, kq.sau, f);
      if (st.isDirectory() || blobTrong(root, kq.truoc, f) !== null || !sau || blobDia(root, f) !== sau) { boQua.push(f); continue; }
      try { fs.unlinkSync(dich); lam.push(f); } catch { boQua.push(f); }
    }
    return { daLam: lam, boQua };
  }
  throw loi("BAD_REQUEST", "Hành động không hợp lệ");
}

module.exports = { chup, kiemSau, apDung, chuanDuong, khop, laGit, camHan };
