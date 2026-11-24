# Biên bản bảo trì và kiểm thử UI Văn phòng AI

Ngày 24/11/2026. Nhánh `fix/bao-tri-van-phong-ai-20261124`. Đọc đối chứng ở `b5e8534` và bản vá UI ở `ee717f6`. Bản vá gồm bảy file giao diện và một cập nhật test tĩnh cho chữ ký hàm mở khu. [Diff bốn lỗi UI](https://github.com/Thequancute215-sys/V-n-ph-ng-ch-nh-ph-/compare/b5e853473bc07af0718487c7b13a4764aee40ddb...ee717f6ccf34bc7b90d837b4ead3957e00a6868e)

## Việc đã làm và bàn giao

| Mốc | Nội dung |
| --- | --- |
| `4994941` | Đợt bảo trì ban đầu của Codex và Anty. Bộ test trên commit này đạt 442/442. |
| `497fa7d`, `b5e8534` | Sửa hồi quy lưu chi phí và tải video Flow, race Tin nhắn khi chuyển dự án, độ sâu quét manifest và luồng chạy tiếp sau khi quét. Bộ test trên `b5e8534` đạt 457/457, gồm ca FFmpeg thực thi. |
| `ee717f6` | Anty sửa tràn ngang điện thoại và trạng thái nút Dựng. Codex sửa khởi tạo cảnh 3D khi CDN lỗi và dọn vòng đời khu OS. Subagent kiểm độc lập cả bốn ca trên đúng diff đã đẩy. |

Diff `b5e8534..ee717f6` có SHA-256 `9d395f96b7c3f503e8f85c517c728212b0a30a270b9694f8a1d5218f4756e9b9` khi xuất bằng `git diff --binary`. Ở lượt chạy cuối, bộ test Node đạt **457/457**, 0 lỗi, 0 bỏ qua. Subagent chạy riêng **18/18** test OS và hồi quy UI. `node tools/kiem-agent.js` và `git diff --check` đều đạt. Các phép đo trình duyệt dùng Chrome thật với hồ sơ riêng, API thử trên loopback và không gọi các dịch vụ AI thật.

## Hai lượt review độc lập trước khi sửa

Hai lượt dùng cùng danh sách U00–U10 ở `b5e8534`. Desktop 1440×900. Điện thoại 375×812 ở lượt đầu có khác UA và tên thiết bị. Những ca chặn mạng ngoài chỉ thể hiện hành vi trong điều kiện đó.

| Ca | Codex | Anty |
| --- | --- | --- |
| U00 · Bộ Node cho UI | 75/75, 0 lỗi, 0 bỏ qua. | 75/75 trên cùng 7 file test, 0 lỗi, 0 bỏ qua. |
| U01 · Điểm vào desktop | Trang gốc chuyển sang OS. Mở đúng 11/11 khu. | Xác nhận 11/11 khu, 0 ngoại lệ JavaScript ở các route gốc. |
| U02 · Công cụ cũ | 11/11 iframe đúng trang, 0 iframe OS lồng. Kiểm link về trang cha và mở riêng. | Cùng kết quả iframe, mở thêm 11 trang độc lập. Thấy hai link quay về văn phòng còn hiện và nút Nhân vật mở Anime Studio trong iframe. |
| U03 · Kết nối | 3 trường khóa trên máy, 0 từ xa. Kiểm thêm quyền HTTP với fixture. | 3/0 trường tương ứng. Gửi rỗng hiện thông báo và 0 POST lưu. |
| U04 · Tin nhắn | Phản hồi muộn từ A không ghi đè B. POST ở A kết thúc vẫn giữ nháp B. | Xác nhận hai ca Chrome. Mini-DOM phủ thêm đổi phòng, đổi chế độ và phản hồi lỗi muộn. |
| U05 · Chờ quét | 3 trạng thái trên Giao việc. Hai nút gửi đúng workspace, ngăn trượt hiện nút khi đủ điều kiện. | 4 trạng thái trên Giao việc và ngăn trượt. Thêm ca fingerprint đã duyệt và xác nhận 0 POST tự gửi khi mở. |
| U06 · Dự án | Mở form Phim AI, nhận tên gợi ý thử, hủy xác nhận CI và xuất bản. | Xác nhận form và dữ liệu mẫu. Hủy 4 hộp thoại tạo dự án, CI, build và xuất bản. |
| U07 · Xưởng phim | CTA đúng. Bàn dựng còn cho bấm khi thiếu FFmpeg. | CTA và cảnh báo đúng ở trạng thái rỗng, thiếu FFmpeg và lỗi tải. Lượt đầu chưa bấm nút Dựng. |
| U08 · Điểm vào điện thoại | 3 shortcut đúng, form ghép và tab mở đúng. Chưa kiểm mất CDN trong lượt đầu. | Xác nhận shortcut, ghép/chưa ghép, 2 manifest. Chặn CDN làm mất menu và bàn làm việc ở trang gốc. |
| U09 · Kích thước và bàn phím | Esc đóng ngăn và trả focus. Ca điện thoại đã ghép ban đầu đo 375/375. | Esc và focus đúng. Ca đã ghép đo 422/375 trên cả bốn tab. |
| U10 · Rà mã và vòng đời | 52 file HTML/JS/CSS/manifest, 127 tham chiếu tài nguyên HTML. Tái hiện Giao việc gửi đọc trạng thái sau khi rời khu. | 56 file nếu tính cả tài nguyên. Ghi nhận thêm các điểm ở trang cũ và các ca vòng đời cần kiểm riêng. |

Hai lượt cùng thấy trang Nhân vật báo `tailwind is not defined` khi chặn CDN. Log đầu của Codex thiếu dữ liệu fixture cho Cập nhật và đã chạy lại với schema đúng. Fixture của Anty thiếu payload audit ở Điều khiển máy. Các lỗi fixture này được loại khỏi kết luận về ứng dụng.

## Số đo gốc của điện thoại đã ghép

Ở lượt đối chiếu, Codex và Anty dùng cùng Chrome **158.0.8127.88**, Android giả lập **375×812**, DPR **1**, cùng UA và fixture. Subagent dùng lại các điều kiện đó khi kiểm hai phiên bản. Dữ liệu có một workspace thử, không có luồng, bàn giao, việc chạy hay nhà cung cấp hạn mức. Sự kiện `beforeinstallprompt` hiện nút **Cài app** và `appinstalled` đưa nút về trạng thái ẩn. Mỗi dòng ghi trạng thái nhìn thấy khi đo.

```text
Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36
```

Fixture nguồn có SHA-256 `266ffad710f874760e86e878109b6788f6158c1ce67f251fb532d879d9ddfdb7`. Tên `Pixel 7 Fixture` được bổ sung làm đối chứng cho lượt Anty đầu. Đây là tên hiển thị của thiết bị thử, UA vẫn là Android 15 Pixel 9. Fixture bên dưới là dữ liệu trích để đọc lại, với cấu hình bổ sung tên thứ ba nêu trên.

```json
{
  "viewport": {
    "width": 375,
    "height": 812,
    "screenWidth": 375,
    "screenHeight": 812,
    "deviceScaleFactor": 1,
    "mobile": true
  },
  "paired": true,
  "tabs": [
    "tinh-hinh",
    "giao-viec",
    "cho-duyet",
    "han-muc"
  ],
  "api": {
    "/dkx/api/workspaces": {
      "workspaces": [
        {
          "path": "C:/fixture-ui/van-phong",
          "name": "Dự án thử",
          "active": true
        }
      ],
      "active": {
        "path": "C:/fixture-ui/van-phong"
      }
    },
    "/dkx/api/ai/status": {
      "turn": {
        "phase": "Phase 2",
        "nextOwner": "CODEX_ASTRA_DEV"
      }
    },
    "/dkx/api/autopilot": {
      "runs": []
    },
    "/dkx/api/handoffs": {
      "handoffs": []
    },
    "/dkx/api/quotas": {
      "providers": []
    },
    "/dkx/api/jobs": {
      "jobs": []
    }
  }
}
```

Mỗi ô là **cuộn tài liệu / cuộn thân trang / cuộn header / mép phải xa nhất**, đơn vị px. Các giá trị mép phải được trình bày tới hai chữ số thập phân theo log Codex và Anty. Cột subagent giữ số đo bản gốc và bản vá trong cùng phép thử. Số liệu được ghép theo tên thiết bị, trạng thái nút và tab.

| Thiết bị | Cài app | Tab | Codex trước vá | Anty trước vá | Codex sau vá | Subagent trước vá | Subagent sau vá |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Thiết bị thử | Ẩn | Tình hình | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 |
| Thiết bị thử | Ẩn | Giao việc | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 |
| Thiết bị thử | Ẩn | Chờ duyệt | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 |
| Thiết bị thử | Ẩn | Hạn mức | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 | 375 / 375 / 343 / 359 |
| Thiết bị thử | Hiện | Tình hình | 411 / 411 / 395 / 411.05 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 |
| Thiết bị thử | Hiện | Giao việc | 411 / 411 / 395 / 411.05 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 |
| Thiết bị thử | Hiện | Chờ duyệt | 411 / 411 / 395 / 411.05 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 |
| Thiết bị thử | Hiện | Hạn mức | 411 / 411 / 395 / 411.05 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 | 411 / 411 / 395 / 411.05 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Ẩn | Tình hình | 514 / 514 / 498 / 513.8 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Ẩn | Giao việc | 514 / 514 / 498 / 513.8 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Ẩn | Chờ duyệt | 514 / 514 / 498 / 513.8 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Ẩn | Hạn mức | 514 / 514 / 498 / 513.8 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 | 514 / 514 / 498 / 513.8 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Hiện | Tình hình | 569 / 569 / 553 / 569.38 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Hiện | Giao việc | 569 / 569 / 553 / 569.38 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Hiện | Chờ duyệt | 569 / 569 / 553 / 569.38 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 |
| DienThoaiKiemThuAndroid375 | Hiện | Hạn mức | 569 / 569 / 553 / 569.38 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 | 569 / 569 / 553 / 569.38 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Ẩn | Tình hình | 375 / 375 / 350 / 366.25 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Ẩn | Giao việc | 375 / 375 / 350 / 366.25 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Ẩn | Chờ duyệt | 375 / 375 / 350 / 366.25 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Ẩn | Hạn mức | 375 / 375 / 350 / 366.25 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 | 375 / 375 / 350 / 366.25 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Hiện | Tình hình | 422 / 422 / 406 / 421.83 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Hiện | Giao việc | 422 / 422 / 406 / 421.83 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Hiện | Chờ duyệt | 422 / 422 / 406 / 421.83 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 |
| Pixel 7 Fixture | Hiện | Hạn mức | 422 / 422 / 406 / 421.83 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 | 422 / 422 / 406 / 421.83 | 375 / 375 / 343 / 359 |

Codex và Anty có 24/24 dòng đo giống nhau trước khi sửa. Có 16/24 tổ hợp tràn ở bản gốc và 0/24 sau vá. Với `Pixel 7 Fixture`, thay đổi riêng trạng thái nút **Cài app** tái hiện mức 375 → 422 px, mép phải của **Xưởng phim** ở 421,83 px. Với tên dài và nút hiện, mức lớn nhất là 569 px. Nhật ký lượt đầu chỉ ghi chiều rộng, lượt dùng chung fixture ghi thêm trạng thái nút và hình học từng phần tử.

Nguyên nhân là header flex giữ một hàng trong khi các liên kết giữ chữ trên một dòng. Bản vá cho header xuống dòng, giới hạn chiều rộng tên thiết bị và giữ các hành động trong viewport. Sau vá, header rộng 343 px, mép phải xa nhất 359 px. Cả bốn tab đều đo 375 px với ba tên, có và không có nút **Cài app**. [CSS của header](../public/dieu-khien.html#L22) · [Sự kiện PWA](../public/app.js#L9)

## Ba lỗi còn lại và số đo đối chứng

### FFmpeg ở OS và Xưởng phim cũ

Anty xác nhận trên bản gốc thấy dòng cảnh báo thiếu FFmpeg, nút vẫn bật và một POST dựng trên mỗi trang. Sau vá, Anty còn thử thao tác bấm sau khi gỡ thuộc tính `disabled` trong Chrome, trình xử lý vẫn chặn và giữ 0 POST khi thiếu FFmpeg. Lúc có FFmpeg, mỗi nút gửi đúng một POST giả. Cảnh báo tại OS vẫn liên kết tới Kết nối. Ca Chrome chỉ kiểm nút và yêu cầu thử, ca FFmpeg thật nằm trong bộ test Node. [Nút Dựng ở OS](../public/os/khu/phim.js#L75) · [Nút Dựng ở trang cũ](../public/xuong-phim.html#L139)

| Giao diện | FFmpeg | Nút trước vá | POST trước vá | Nút sau vá | POST sau vá |
| --- | --- | --- | --- | --- | --- |
| OS | Thiếu | Bật | 1 | Khóa | 0 |
| OS | Có | Bật | 1 | Bật | 1 |
| Xưởng phim cũ | Thiếu | Bật | 1 | Khóa | 0 |
| Xưởng phim cũ | Có | Bật | 1 | Bật | 1 |

### Mất CDN Three.js

Bản gốc nhập cảnh 3D trong cùng khối khởi tạo với bàn làm việc. Lỗi nạp CDN làm khối này dừng trước bước tạo menu, kiểm trạng thái điện thoại và hiển thị dự phòng. Anty ghi nhận 0 lượt hỏi trạng thái ghép ở ca đó. Sau vá, cảnh 3D tải riêng. Codex mở menu và mục Giao việc cả đội trên fixture đã ghép, nhận yêu cầu qua kênh điện thoại. Subagent mở menu và hộp Việc đang làm. Các số đếm dưới đây là của subagent. [Khởi tạo cảnh 3D](../public/index.html#L677) · [Khởi tạo bàn làm việc](../public/index.html#L720)

| Phiên bản | Lượt tải Three.js bị chặn | Mở menu | Mở bàn làm việc | Thông báo 3D | Khóa nút phòng/zoom |
| --- | --- | --- | --- | --- | --- |
| b5e8534 | 4 | Không | Không | Không | Không |
| ee717f6 | 4 | Có | Có | Có | Có |

### Đổi khu OS khi GET khởi tạo còn chờ

Codex và Anty mở Giao việc khi đã có dự án, giữ lượt đọc khởi tạo rồi sang Dự án trên cùng trang. Bản gốc còn listener, timer 20 giây và gọi lại trạng thái khi đổi trạng thái hiển thị. Anty xác nhận cả hai thứ tự phản hồi. Sau vá, bộ định tuyến báo hủy vòng đời ngay khi đổi khu, đồng thời giữ thời điểm hoàn tất lần đọc đầu cho các nơi đang chờ hàm mở khu. Hàm dọn đến muộn không thay thế hàm dọn của khu mới. Yêu cầu đã gửi tự kết thúc. Các số đếm dưới đây của subagent chỉ tính listener, timer và GET phát sinh từ **Giao việc**. [Bộ định tuyến OS](../public/os/app.js#L174) · [Dọn Giao việc](../public/os/khu/giao-viec.js#L268)

| Phiên bản | GET trả trước | Listener khi còn chờ | Timer khi còn chờ | GET mới khi còn chờ | Listener sau khi trả | Timer sau khi trả | GET mới sau khi trả |
| --- | --- | --- | --- | --- | --- | --- | --- |
| b5e8534 | Dự án | 1 | 0 | 1 | 1 | 1 | 1 |
| b5e8534 | Giao việc | 1 | 0 | 1 | 1 | 1 | 1 |
| ee717f6 | Dự án | 0 | 0 | 0 | 0 | 0 | 0 |
| ee717f6 | Giao việc | 0 | 0 | 0 | 0 | 0 | 0 |

## Ghi chú cho lượt review của Claude

- Tái hiện ở hai lượt đầu, ngoài bốn lỗi của đợt vá này. Codex thấy nhãn **Sắp có** cạnh các chức năng CI/xuất bản đã hiện ở Dự án. Anty thấy liên kết sai ngữ cảnh trong iframe công cụ cũ và lỗi Tailwind khi CDN bị chặn.
- Anty ghi từ đọc mã, chưa tái hiện riêng. Gồm bộ lọc danh sách Tin nhắn có thể bỏ thay đổi khi lần đọc trước còn chờ, Phim và Tổng quan có thể cập nhật sau khi rời khu, hướng dẫn dán khóa ở Xưởng phim cũ chưa đồng bộ, một số trang cũ còn polling hoặc EventSource tới khi bị tháo.
- Phạm vi chưa kiểm gồm điện thoại thật, cảnh WebGL khi CDN hoạt động, khả năng tiếp cận WCAG đầy đủ và thao tác thật với nhà cung cấp AI. Hai lượt đầu dừng trước khi xác nhận tạo repo, cài CI, build và xuất bản. Những ca GET của vòng đời được đo ở Giao việc → Dự án, các khu khác chưa có số đo tương đương.
- Claude có thể bắt đầu từ diff `b5e8534..ee717f6`, kiểm lại bốn ca trên và đề xuất đợt sửa tiếp theo để chủ dự án duyệt. Có thể xem cả lịch sử bảo trì để review những thay đổi trước UI. [Lịch sử nhánh so với main](https://github.com/Thequancute215-sys/V-n-ph-ng-ch-nh-ph-/compare/main...fix/bao-tri-van-phong-ai-20261124)
