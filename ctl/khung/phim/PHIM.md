# Hồ sơ phim — hướng dẫn cho đội AI

Dự án này là một phim của **Xưởng phim AI** trong Văn phòng AI. `phim.json` là hợp đồng duy nhất giữa các phòng; `kich-ban.md` là bản đọc cho người.

## Ai ghi trường nào

| Phòng | Ghi |
|---|---|
| Hinata (biên kịch, đạo diễn) | `ten`, `ti_le`, `ngon_ngu`, `giong`, `nhan_vat`, `canh[].loi_dan / khung_hinh / nhan_vat / may_quay / cau` |
| Máy (giọng đọc, máy quay, trạm Flow) | `canh[].giay`, `khung`, `take`, `trang_thai`; sổ chi `media/so-chi.json` |
| CEO (qua giao diện) | `ngan_sach_usd`, `nguoi_that[].dong_y`, `khung_chon`, `take_chon` |

Không tự đổi trường của phòng khác. Thiếu hay mâu thuẫn thì ghi vào phần giải thích của lượt.

## Một cảnh

```json
{ "ma": "C01", "cau": [1, 2], "loi_dan": "…", "khung_hinh": "…", "nhan_vat": ["co-giao"],
  "may_quay": "flow", "so_phuong_an_khung": 3, "so_take_toi_da": 2, "trang_thai": "viet" }
```

- `khung_hinh`: mô tả khung hình mở đầu (dùng cho cả ảnh khung và prompt video). `chuyen_dong` (tuỳ chọn): máy quay/nhân vật chuyển động thế nào.
- Một cảnh quay AI dài tối đa 15 giây; dài hơn thì chia cảnh.
- `ma`: C01, C02… theo thứ tự chiếu.
- `cau`: số thứ tự câu lời dẫn mà cảnh này đọc (câu 1 là dòng đầu ở mục Lời dẫn).
- `may_quay`: mặc định `flow` (Google Flow, dùng credit gói Google AI, không tốn tiền API); `omni-flash` (Gemini API, trả theo giây: chỉ khi cần tự động hoàn toàn hoặc hết credit); `kling-3` (chưa nối); `dung-code` (Remotion/HyperFrames, không quay AI).
- `trang_thai`: `viet` → `co_khung` → `cho_quay` → `da_quay` → `da_chon`.
- Người thật: khai ở `nguoi_that` với `dong_y: false`. Chỉ CEO đổi thành `true` khi người đó đã đồng ý cho dùng hình.

## Giọng theo nhân vật

```json
"nhan_vat": [{ "ma": "lan", "ten": "Lan", "giong": { "mo_ta": "nữ khoảng 20 tuổi, giọng trong trẻo" } },
             { "ma": "minh", "ten": "Minh", "giong": { "mo_ta": "nam khoảng 30 tuổi, giọng trầm" } }],
"nguoi_dan": { "giong": { "mo_ta": "nam trung niên, giọng ấm, đọc chậm" } },
"canh": [{ "ma": "C01", "cau": [1], "loi_dan": "Một chiều thu, hai người gặp nhau ở quán cà phê." },
         { "ma": "C02", "cau": [2], "nguoi_noi": "lan", "loi_dan": "Anh đến muộn quá." },
         { "ma": "C03", "cau": [3], "nguoi_noi": "minh", "loi_dan": "Xin lỗi em, đường tắc lắm." }]
```

- Hinata viết `giong.mo_ta` (giới, tuổi, chất giọng) và `nguoi_noi` của từng cảnh. Không ghi `nguoi_noi` thì người dẫn đọc.
- Mỗi cảnh một người nói; đối thoại tách thành các cảnh ngắn nối nhau. Phim có `nguoi_noi` đọc theo cảnh: `cau` của cảnh thứ i là `[i]`.
- `giong.may` / `giong.ma` do CEO chọn trên trang Xưởng phim: `edge` (miễn phí, máy chỉnh cao độ và tốc độ theo mô tả) hoặc `elevenlabs` (thiết kế giọng từ mô tả, trả theo ký tự). Chưa chọn thì máy tự dùng giọng Edge theo mô tả.

## Lệnh

Trong lượt AI, văn phòng cấp sẵn các biến:

```powershell
# Đọc lời dẫn ra giọng + phụ đề có mốc từng câu
& $env:XUONG_PHIM_PYTHON $env:XUONG_PHIM_TTS --file media/giong/loi-dan.txt --voice vi-nu --output media/giong/voice
# Chốt thời lượng từng cảnh theo giọng đọc
node $env:XUONG_PHIM_CONG_CU dong-bo
# Kiểm hồ sơ trước khi bàn giao (thoát 1 nếu có lỗi)
node $env:XUONG_PHIM_CONG_CU kiem
```

Bộ kiểm chặn: tổng thời lượng cảnh lệch giọng đọc quá 0,5 giây; cảnh dùng người thật chưa đồng ý; chi phí tối đa vượt ngân sách. Có lỗi thì sửa, không lách.

AI không tự quay: tạo khung, quay video (Gemini) và các nhịp Google Flow đều do CEO bấm trên trang **Xưởng phim** của văn phòng, có hiện tiền trước khi chi.

`media/` (giọng, ảnh, clip, bản xuất) không vào git.
