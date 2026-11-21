// Khu Bộ não chung (OS-2, học "second brain là thư mục markdown, mỗi lần học là một commit hoàn tác được" của Javis OS — phòng sạch).
// Dữ liệu ở ~/.van-phong-ao/bo-nao (repo git riêng, ctl/bo-nao.js): tri-nho/, wiki/, nguon/, cong-su/.
// Đọc → sửa → lưu kèm lý do (một commit, có mã) → lịch sử → xem bản cũ / hoàn tác. Lưu gửi kèm mã nội dung lúc mở (goc):
// có ai sửa trong lúc đó thì ctl trả CONFLICT, không ghi đè. Nội dung giống khoá bị ctl từ chối (SECRET).
import { esc, luc, dangTai, rong, loi } from "../ui.js";

const TEN_THU_MUC = { "tri-nho": "Trí nhớ", wiki: "Wiki", nguon: "Nguồn", "cong-su": "Cộng sự" };

export async function mo(vung, { ctl, bao }) {
  vung.innerHTML = `<div class="vung">
    <div class="nao-khung">
      <aside class="khoi" aria-labelledby="hCay">
        <div class="dau-hang"><h2 class="dau" id="hCay">Bộ não</h2><button type="button" class="nut nho" id="nutMoi">File mới</button></div>
        <div id="cay">${dangTai(5)}</div>
      </aside>
      <section class="khoi" aria-labelledby="hFile" style="min-height:420px">
        <div class="dau-hang"><h2 class="dau" id="hFile">Chọn một file</h2><span class="mo" id="maFile"></span></div>
        <div id="thanFile">${rong("Bộ não chung của văn phòng", "Trí nhớ, wiki, nguồn và mô tả công việc của từng cộng sự. Mỗi lần lưu là một bản ghi có mã, hoàn tác được.")}</div>
      </section>
    </div>
    <section class="khoi" aria-labelledby="hLs"><div class="dau-hang"><h2 class="dau" id="hLs">Lịch sử</h2><span class="mo" id="lsCua">cả bộ não</span></div><div id="ls">${dangTai(3)}</div></section>
  </div>`;
  const $ = (id) => vung.querySelector("#" + id);
  let ds = [], dang = null, conSong = true;   // dang = { p, noiDung, ma, sua: bool }

  async function taiCay() {
    try { const d = await ctl("/bo-nao"); if (!conSong) return; ds = (d.cay || d.files || d.ds || []).filter((x) => !x.thuMuc && /\.md$/i.test(x.p || x.path || "")); veCay(); }
    catch (e) { if (conSong) $("cay").innerHTML = loi(e.code === "NO_GIT" ? "Máy chưa có git: Bộ não cần git để lưu lịch sử." : "Chưa đọc được Bộ não: " + e.message); }
  }
  const duongDan = (x) => x.p || x.path;
  function veCay() {
    if (!ds.length) { $("cay").innerHTML = rong("Bộ não trống", "Bấm File mới để ghi trí nhớ đầu tiên."); return; }
    const theoThuMuc = {};
    for (const x of ds) { const tm = duongDan(x).split("/")[0]; (theoThuMuc[tm] = theoThuMuc[tm] || []).push(x); }
    $("cay").innerHTML = `<nav class="cay" aria-label="File trong bộ não">${Object.keys(theoThuMuc).sort().map((tm) =>
      `<div class="thu-muc">${esc(TEN_THU_MUC[tm] || tm)}</div>` + theoThuMuc[tm].sort((a, b) => duongDan(a).localeCompare(duongDan(b), "vi")).map((x) =>
        `<button type="button" data-p="${esc(duongDan(x))}"${dang && dang.p === duongDan(x) ? ' aria-current="true"' : ""} title="${esc(duongDan(x))}">${esc(duongDan(x).split("/").slice(1).join("/"))}</button>`).join("")).join("")}</nav>`;
  }

  async function moFile(p) {
    if (dang && dang.sua && dang.p !== p && !confirm("File đang sửa chưa lưu. Bỏ thay đổi?")) return;
    dang = { p, noiDung: "", ma: null, sua: false }; veCay();
    $("hFile").textContent = p; $("maFile").textContent = ""; $("thanFile").innerHTML = dangTai(6);
    try {
      const d = await ctl("/bo-nao/doc?p=" + encodeURIComponent(p));
      if (!conSong || !dang || dang.p !== p) return;
      dang.noiDung = d.noiDung || ""; dang.ma = d.ma || null; veFile(); taiLs(p);
    } catch (e) { if (dang && dang.p === p) $("thanFile").innerHTML = loi(e.message); }
  }
  function veFile() {
    const md = window.MD ? window.MD.render(dang.noiDung) : `<pre class="van-ban">${esc(dang.noiDung)}</pre>`;
    $("maFile").textContent = dang.ma ? "mã nội dung " + dang.ma.slice(0, 7) : "file mới";
    $("thanFile").innerHTML = dang.sua
      ? `<label class="visually-hidden" for="oSua">Nội dung ${esc(dang.p)}</label><textarea class="o o-sua" id="oSua" spellcheck="false">${esc(dang.noiDung)}</textarea>
         <div class="hang"><input class="o" id="lyDo" placeholder="Lý do sửa (ghi vào lịch sử)" style="flex:1;min-width:200px" maxlength="160">
         <button type="button" class="nut-chinh" id="nutLuu">Lưu</button><button type="button" class="nut" id="nutHuy">Huỷ</button>
         ${dang.ma && !/README\.md$/i.test(dang.p) ? '<button type="button" class="nut nguy" id="nutXoa">Xoá file</button>' : ""}</div>`
      : `<div class="md-xem">${md || '<p class="mo">File trống.</p>'}</div><div class="hang"><button type="button" class="nut" id="nutSua">Sửa</button></div>`;
    if (dang.sua) vung.querySelector("#oSua").focus();
  }

  async function luu() {
    const nut = $("nutLuu"), noiDung = vung.querySelector("#oSua").value, lyDo = $("lyDo").value.trim();
    nut.setAttribute("aria-busy", "true"); nut.disabled = true;
    try {
      const d = await ctl("/bo-nao/ghi", { p: dang.p, noiDung, goc: dang.ma, lyDo: lyDo || undefined });
      dang.noiDung = noiDung; dang.ma = d.ma || dang.ma; dang.sua = false;
      bao(d.commit ? "Đã lưu, bản ghi " + d.commit + "." : "Không có gì thay đổi.");
      veFile(); taiCay(); taiLs(dang.p);
    } catch (e) {
      nut.removeAttribute("aria-busy"); nut.disabled = false;
      bao(e.code === "CONFLICT" ? "File vừa được sửa ở nơi khác. Mở lại file để xem bản mới rồi sửa tiếp." : e.code === "SECRET" ? "Nội dung có chuỗi giống khoá bí mật: không lưu vào Bộ não." : e.message, true);
    }
  }
  async function xoa() {
    if (!confirm("Xoá " + dang.p + "? Vẫn hoàn tác được trong Lịch sử.")) return;
    try { const d = await ctl("/bo-nao/xoa", { p: dang.p, goc: dang.ma, lyDo: "xoá " + dang.p }); bao("Đã xoá, bản ghi " + (d.commit || "") + "."); dang = null;
      $("hFile").textContent = "Chọn một file"; $("maFile").textContent = ""; $("thanFile").innerHTML = rong("Đã xoá file", "Hoàn tác ở Lịch sử nếu xoá nhầm."); taiCay(); taiLs(); }
    catch (e) { bao(e.message, true); }
  }
  function fileMoi() {
    const p = prompt("Đường dẫn file mới (trong tri-nho/, wiki/, nguon/ hoặc cong-su/), ví dụ: tri-nho/khach-hang.md");
    if (!p) return;
    const sach = p.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!/\.md$/i.test(sach) || !/^(tri-nho|wiki|nguon|cong-su)\//.test(sach)) { bao("File phải là .md và nằm trong tri-nho/, wiki/, nguon/ hoặc cong-su/.", true); return; }
    dang = { p: sach, noiDung: "# " + sach.split("/").pop().replace(/\.md$/i, "") + "\n\n", ma: null, sua: true };
    $("hFile").textContent = sach; veCay(); veFile();
  }

  async function taiLs(p) {
    $("lsCua").textContent = p ? p : "cả bộ não";
    $("ls").innerHTML = dangTai(3);
    try {
      const d = await ctl("/bo-nao/lich-su" + (p ? "?p=" + encodeURIComponent(p) : ""));
      if (!conSong) return;
      const ls = d.lichSu || [];
      $("ls").innerHTML = ls.length ? ls.map((c) => `<div class="dong"><div><div class="tieu">${esc(c.thongDiep)}</div><div class="chi-tiet"><code>${esc(c.commit)}</code> · ${esc(luc(c.luc))}${c.file && c.file.length ? " · " + esc(c.file.slice(0, 4).join(", ")) : ""}</div></div>
        <div class="hang">${p ? `<button type="button" class="nut nho" data-xem="${esc(c.commit)}">Xem bản này</button>` : ""}<button type="button" class="nut nho" data-hoan-tac="${esc(c.commit)}">Hoàn tác</button></div></div>`).join("")
        : rong("Chưa có lịch sử", "Lần lưu đầu tiên sẽ hiện ở đây.");
    } catch (e) { if (conSong) $("ls").innerHTML = loi(e.message, false); }
  }
  async function xemBan(commit) {
    try { const d = await ctl("/bo-nao/ban?p=" + encodeURIComponent(dang.p) + "&commit=" + encodeURIComponent(commit));
      const md = window.MD ? window.MD.render(d.noiDung || "") : `<pre class="van-ban">${esc(d.noiDung || "")}</pre>`;
      $("thanFile").innerHTML = `<p class="canh-bao">Đang xem bản ${esc(commit)} (chỉ đọc).</p><div class="md-xem">${md}</div><div class="hang"><button type="button" class="nut" id="nutVeBanMoi">Về bản hiện tại</button></div>`; }
    catch (e) { bao(e.message, true); }
  }
  async function hoanTac(commit) {
    if (!confirm("Hoàn tác bản ghi " + commit + "? Bộ não tạo một bản ghi mới đảo ngược thay đổi đó (vẫn hoàn tác ngược lại được).")) return;
    try { const d = await ctl("/bo-nao/hoan-tac", { commit }); bao("Đã hoàn tác, bản ghi mới " + (d.commit || "") + "."); taiCay(); if (dang && dang.p && !dang.sua) moFile(dang.p); else taiLs(); }
    catch (e) { bao(e.code === "CONFLICT" ? "Không hoàn tác được vì đã có thay đổi sau đó chạm cùng chỗ. Sửa tay rồi lưu." : e.message, true); }
  }

  vung.addEventListener("click", (e) => {
    const t = e.target;
    const f = t.closest(".cay button[data-p]"); if (f) return moFile(f.dataset.p);
    if (t.closest("#nutMoi")) return fileMoi();
    if (t.closest("#nutSua")) { dang.sua = true; return veFile(); }
    if (t.closest("#nutHuy")) { if (!dang.ma) { dang = null; $("hFile").textContent = "Chọn một file"; $("thanFile").innerHTML = ""; veCay(); return; } dang.sua = false; return veFile(); }
    if (t.closest("#nutLuu")) return luu();
    if (t.closest("#nutXoa")) return xoa();
    if (t.closest("#nutVeBanMoi")) return veFile();
    const x = t.closest("[data-xem]"); if (x) return xemBan(x.dataset.xem);
    const h = t.closest("[data-hoan-tac]"); if (h) return hoanTac(h.dataset.hoanTac);
    if (t.closest("[data-thu-lai]")) return taiCay();
  });
  vung.addEventListener("input", (e) => { if (e.target.id === "oSua" && dang) dang.sua = true; });

  await taiCay();
  // Mở thẳng một file khi đến từ khu khác (#/doi/bo-nao?p=cong-su/X.md).
  const p = new URLSearchParams(location.hash.split("?")[1] || "").get("p");
  if (p) moFile(p); else taiLs();
  return () => { conSong = false; };
}
