// Xưởng phim · Bước 2: Phân cảnh, tạo/chọn khung hình và quay/chọn take từng cảnh (#/phim/canh).
import { moKhuPhim } from "./phim.js";

export async function mo(vung, opts = {}) {
  return moKhuPhim(vung, { ...opts, phan: "canh" });
}
