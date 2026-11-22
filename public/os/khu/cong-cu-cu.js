// Khu Công cụ cũ (OS-3): các trang của văn phòng chưa viết lại thành khu gốc, gom vào một chỗ để thanh bên chỉ còn các khu dùng hằng ngày.
// Mỗi công cụ vẫn mở trong OS (nhúng trang cũ), đường dẫn cũ #/<id> vẫn dùng được. Danh sách do app.js truyền vào (mảng CU).
import { esc, icon } from "../ui.js";

const NHOM = [["code", "Xưởng code"], ["phim", "Xưởng phim"], ["doi", "Đội ngũ"], ["he", "Hệ thống"]];

export function mo(vung, { congCuCu }) {
  vung.innerHTML = `<div class="vung">
    <p class="mo" style="max-width:65ch">Các trang dưới đây là bản cũ của văn phòng, vẫn chạy đầy đủ. Khu nào được viết lại thành khu gốc của OS sẽ rời danh sách này và lên thanh bên.</p>
    ${NHOM.map(([k, ten]) => { const ds = congCuCu.filter((c) => c.nhomCu === k); return ds.length ? `<section aria-labelledby="hCu-${k}" class="cot-doc">
      <h2 class="dau" id="hCu-${k}"${k === "code" || k === "phim" ? ` data-xuong="${k}"` : ""}>${esc(ten)}</h2>
      <div class="luoi-the">${ds.map((c) => `<a class="the-cs the-cu" href="#/${esc(c.id)}"${c.xuong ? ` data-xuong="${esc(c.xuong)}"` : ""}>
        <span class="ten">${icon(c.icon)}${esc(c.ten)}</span><span class="viec">${esc(c.moTa)}</span></a>`).join("")}</div></section>` : ""; }).join("")}
  </div>`;
}
