// Xưởng phim · Bước 3: Bàn dựng FFmpeg, máy đo LUFS, nghiệm thu và xuất xưởng (#/phim/ban-dung).
import { moKhuPhim } from "./phim.js";

export async function mo(vung, opts = {}) {
  return moKhuPhim(vung, { ...opts, phan: "ban-dung" });
}
