---
name: xuong-phim
description: Quy trình Xưởng Phim AI của văn phòng (CEO duyệt 20/11/2026) cho cả Claude, Codex và Antigravity — làm phim ngắn AI hoặc video explainer từ một đề bài theo hợp đồng phim.json, 8 công đoạn, 4 cổng CEO duyệt, luật tiêu tiền. Dùng khi được giao việc trong dự án có phim.json, khi CEO nhờ viết kịch bản/phân cảnh, làm giọng đọc, tạo ảnh nhân vật hay khung cảnh, chấm clip, dựng bản xem thử, nghiệm thu video, hoặc khi gọi /xuong-phim hay /videopromax. Thay thế skill videopromax cũ.
---

# Xưởng Phim AI

Văn phòng làm phim ngắn (15 giây – 3 phút, 9:16, 16:9 hoặc 1:1) từ một đề bài. Mọi khoản chi tiền đều qua cổng CEO duyệt.
Skill này là luật làm việc chung cho mọi AI trong xưởng. Bản thiết kế gốc: artifact "Xưởng Phim AI" (20/11/2026).

## Luật không được phá

1. **phim.json là hợp đồng duy nhất.** Mọi phòng đọc và ghi đúng trường của mình (bảng dưới). Không tự đặt file trạng thái riêng.
2. **AI không cầm khoá, không tự tiêu tiền.** Ảnh/video gọi qua "máy quay" của văn phòng (ctl), có sổ chi và trần ngân sách.
   Không gọi thẳng API tạo ảnh/video, không đọc `keys.json`, không in khoá.
3. **Không tự duyệt cổng.** Cổng 1–4 chỉ CEO bấm (bàn dựng trong Thế Quân OS hoặc điện thoại). Thấy cổng chưa duyệt thì dừng ở đó.
4. **Người thật:** chỉ dùng hình người đã đồng ý (`nguoi_that[].dong_y = true`, do CEO đánh dấu). Không mạo danh, không gán lời
   nói cho người thật.
5. **Nhãn AI:** kiểm dòng "Video tạo bằng AI" ở góc trên phải trong 3 giây cuối. Nếu bản dựng báo thiếu phông, bổ sung phông và
   dựng lại trước khi trình duyệt. Nhạc chỉ dùng nguồn miễn phí bản quyền hoặc có quyền thương mại, ghi nguồn vào phim.json.
6. **Không tự đăng.** Xuất xưởng nghĩa là có file trên máy CEO.

## Hai dây chuyền

- **Phim AI**: 8 công đoạn dưới đây, ảnh và clip sinh bằng AI.
- **Explainer** (motion graphics, chia sẻ kiến thức, 3D bằng code): bỏ CĐ-3 → CĐ-5; sau giọng đọc là dựng thẳng bằng
  HyperFrames / Remotion / Three.js, toàn bộ miễn phí. Cảnh loại này có `may_quay: "dung-code"`.

## 8 công đoạn, 4 cổng

| CĐ | Việc | Ai | Tiền |
|---|---|---|---|
| 0 | Đề bài: thể loại, độ dài, tỉ lệ, ngôn ngữ, ngân sách, ảnh tham chiếu, người thật đã đồng ý | CEO | — |
| 1 | Kịch bản + phân cảnh → `phim.json`, `kich-ban.md` | Hinata | token |
| | **Cổng 1 · Duyệt kịch bản** (sửa ở đây rẻ nhất) | CEO | |
| 2 | Giọng đọc → `media/giong/voice.{mp3,json,srt}`, chốt `giay` từng cảnh | máy | miễn phí |
| 3 | Chuẩn bị ảnh tham chiếu đã được phép dùng → `media/tham-chieu/` | CEO hoặc AI được giao riêng | xem dưới |
| 4 | Khung chính mỗi cảnh → `media/khung/`; giao Hinata soát ảnh nếu cần | máy ảnh, Hinata | xem dưới |
| | **Cổng 2 · Chọn khung, duyệt khoản quay** (thấy số tiền sắp chi) | CEO | |
| 5 | Quay từng cảnh → `media/quay/`; CEO chọn khi có nhiều take và cho phép quay lại nếu cần | máy quay, CEO | có |
| 6 | Dựng và đo: ghép take, phụ đề, chữ, nhạc, chuẩn âm → `media/xuat/` | máy (FFmpeg) | miễn phí |
| | **Cổng 3 · Duyệt bản dựng** | CEO | |
| 7 | Đối chiếu số đo, sự đồng ý dùng hình người thật và nguồn nhạc. Người duyệt xem bản xuất để kiểm hình, tiếng và phụ đề | Claude, CEO hoặc AI được giao kiểm riêng | — |
| | **Cổng 4 · Xuất xưởng** | CEO | |

P4 gọi Hinata viết kịch bản, tạo giọng, tạo hai phương án khung khi chạy được miễn phí, rồi chờ CEO chọn khung và duyệt khoản quay.
Nếu dùng ảnh Gemini có phí, CEO chạy bước ảnh riêng. Luồng quay một take Omni khi đã duyệt hoặc chờ clip từ trạm Flow. Sau đó
FFmpeg dựng và đo, rồi Claude nhận số đo để viết báo cáo. P4 chờ từng cổng. Ảnh tham chiếu, chấm ảnh/clip và Explainer có công
đoạn riêng do CEO giao. Khi cần thêm take, CEO bấm quay lại trong giới hạn ngân sách.

## Ai ghi trường nào trong phim.json

- **Hinata:** `ten`, `ti_le`, `ngon_ngu`, `nhan_vat[]`, `canh[].loi_dan` / `khung_hinh` / `chuyen_dong` /
  `nhan_vat` / `may_quay` / `cau`, `may_anh` (tuỳ chọn). Ghi `ngan_sach_usd` ban đầu theo số CEO đã đặt.
- **Máy:** `canh[].giay`, `khung`, `take`, `trang_thai` (`viet → co_khung → cho_quay → da_quay → da_chon`), `ban_dung`.
  P4 có thể chọn take duy nhất của một cảnh.
- **CEO** (qua giao diện): thay đổi `ngan_sach_usd`, duyệt `nguoi_that[].dong_y`, chọn `khung_chon`, chọn giữa nhiều take
  bằng `take_chon`, duyệt `cong`.

Mã cảnh `C01`, `C02`…; mỗi cảnh 4–15 giây; `cau` là số thứ tự câu lời dẫn của cảnh (để chốt thời lượng theo giọng đọc).

## Viết kịch bản (Hinata, CĐ-1)

Nhịp vàng cho phim 30–60 giây (giữ từ videopromax):
- **Hook (0–3 giây):** hình hoặc câu bắt mắt ngay.
- **Vấn đề / nghịch lý (3–15 giây).**
- **Phần chính (15–45 giây):** câu chuyện hoặc giải thích trực quan.
- **Tóm lại + lời kêu gọi (45–60 giây).**

Mỗi cảnh: lời dẫn ngắn đọc được trong thời lượng cảnh (khoảng 2,5–3 từ/giây tiếng Việt), `khung_hinh` mô tả cụ thể chủ thể, hành
động, bối cảnh, góc máy, ánh sáng; không đưa logo thương hiệu thật, không chữ dài trong hình (chữ ngắn thì ghi đúng chính tả).
Xong thì chạy kiểm tới khi đạt:

```powershell
node $env:XUONG_PHIM_CONG_CU kiem
```

## Giọng đọc (CĐ-2)

Python chung của xưởng và script nằm ở biến môi trường của lượt AI (không ghi cứng đường dẫn):

```powershell
& $env:XUONG_PHIM_PYTHON $env:XUONG_PHIM_TTS --text "Lời dẫn…" --voice vi-nu --output media/giong/voice
node $env:XUONG_PHIM_CONG_CU dong-bo      # chốt giay từng cảnh theo media/giong/voice.json
```

Giọng: `vi-nu`, `vi-nam` (Edge-TTS, cần mạng); tiếng Anh offline Kokoro (`kokoro-heart`, `kokoro-adam`, `kokoro-emma`, model ở
`$env:XUONG_PHIM_MODELS`). Thời lượng thật của cảnh chốt theo giọng đọc, không theo ước đoán.
P4 chọn `vi-nam` cho tiếng Việt và `en-us-authority` cho tiếng Anh khi tự tạo giọng. Nếu tạo giọng thủ công, kiểm có đủ
`voice.mp3` và các mốc thời gian trước khi dựng.

## Máy ảnh và máy quay

- **Máy ảnh mặc định: GPT** (`may_anh: "gpt"`, qua Codex bằng gói ChatGPT của CEO: không khoá API, không tiền theo ảnh, chữ tiếng
  Việt đúng dấu, không logo). `"gemini"` (nano-banana, trả tiền theo ảnh) chỉ khi CEO chọn.
- **Máy quay** (`canh[].may_quay`): `flow` (Google Flow, credit gói Google, CEO duyệt từng nhịp ở trạm Flow — mặc định),
  `omni-flash` (Gemini Omni 1.2 Flash, ~$0,07/giây 720p), `kling-3` (chưa nối), `dung-code` (Explainer, không quay).
- Dùng ảnh tham chiếu đã chuẩn bị khi quay cần giữ mặt nhất quán. Cùng yêu cầu thì máy dùng lại kết quả cũ, không trả tiền hai lần.

## Chấm ảnh và clip (Hinata)

Loại: tay/ngón lỗi, chữ sai, sai mặt so với tham chiếu, vật thể biến dạng, logo/watermark lạ, sai tỉ lệ khung. Xếp hạng phần còn
lại, ghi lý do ngắn. CEO chọn khung và quyết định giữa nhiều take.

## Dựng và hậu kỳ (CĐ-6)

Bàn dựng của văn phòng (FFmpeg) ghép take đã chọn theo phim.json, lấy chữ và mốc phụ đề từ `media/giong/voice.json` hoặc lời dẫn
theo cảnh khi thiếu tệp này. Bàn dựng chuẩn âm −14 LUFS, hạ nhạc nền khi có lời và xuất theo tỉ lệ đã chọn. `voice.srt` dùng để
trao đổi phụ đề.

Nếu CEO muốn xem hoặc chỉnh bằng CapCut, dùng một bản sao nháp với các take đã chọn và mốc phụ đề từ `voice.json`. Khi cần đổi
người kiểm, giao đường dẫn bản sao và yêu cầu đối chiếu take, điểm cắt, câu phụ đề, mốc thời gian. Người có MCP cục bộ có thể đọc
timeline và chữ phụ đề. Việc xem hình và nghe tiếng thực hiện trên bản xuất hoặc ứng dụng dựng.

Chuyển các chỉnh sửa đã thống nhất về Xưởng Phim trước khi dựng lại. Với điểm cắt, lưu clip thành take mới trong `media/quay/`,
thêm đường dẫn vào `canh[].take` rồi để CEO chọn. Nếu đổi thời lượng, chốt lại `canh[].giay` theo giọng đọc trước khi dựng. Với
phụ đề, cập nhật `voice.json` và `voice.srt` cùng nhau sau khi chốt giọng, rồi kiểm và dựng lại. Nếu yêu cầu tạo lại giọng, đối
chiếu và áp dụng lại phụ đề sau lượt TTS. CEO duyệt lại Cổng 3 và Cổng 4 cho bản mới.

Explainer cần hiệu ứng riêng: Codex/Astra viết khuôn HyperFrames hoặc Remotion trong `dung/`, đọc phim.json làm dữ liệu, render nền.
Trộn âm tay khi cần:

```powershell
& $env:XUONG_PHIM_FFMPEG -y -i voice.mp3 -i nhac.mp3 -filter_complex "[1:a]volume=0.25[n];[0:a][n]amix=inputs=2:duration=first[a]" -map "[a]" am-thanh.mp3
```

## Nghiệm thu (CĐ-7)

Lượt Claude tự chạy đối chiếu số đo, thông tin đồng ý dùng hình người thật và nguồn nhạc. Báo cáo nằm ở
`media/xuat/nghiem-thu.md`. Ghi mục nào thiếu bằng chứng hoặc cần xem bản xuất.

- [ ] Đối chiếu độ dài với giọng đọc (lệch ≤ 0,5 giây), độ phân giải, tỉ lệ, khung đen và âm lượng mục tiêu −14 LUFS.
- [ ] Xem và nghe bản xuất để kiểm chính tả, nhịp phụ đề, độ rõ của lời so với nhạc và nhãn "Video tạo bằng AI".
- [ ] Kiểm sự đồng ý của người thật và nguồn nhạc trước khi trình CEO duyệt Cổng 4.

## Cấu trúc dự án phim

```
ten-phim/
├── agent.md      mẫu phim
├── PHIM.md       hướng dẫn dự án do Văn phòng tạo
├── phim.json     hợp đồng
├── kich-ban.md   bản đọc cho người
├── dung/         khuôn Remotion/HyperFrames (Explainer)
└── media/        không vào git: giong/, tham-chieu/, khung/, quay/, xuat/, bo-dem/, so-chi.json
```
