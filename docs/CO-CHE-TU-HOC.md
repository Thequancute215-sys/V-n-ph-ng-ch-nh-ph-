# CƠ CHẾ TỰ HỌC HỎI & NGÂN HÀNG LỖI DỰ ÁN (CONTINUOUS SELF-LEARNING SYSTEM)
> **Nguyên tắc tối cao:** Dự án sau bắt buộc phải kế thừa toàn bộ bài học của dự án trước. Không một lỗi nào được phép lặp lại lần thứ hai.

---

## 1. Mục Tiêu & Bản Chất Cơ Chế
Trong mô hình phát triển phần mềm đa AI (Antigravity, GPT 6.1 Sol, Codex Astra, Claude Captain), nếu không có cơ chế lưu trữ có cấu trúc, các lỗi đã giải quyết sẽ bị quên lãng sau khi context bị nén hoặc khi chuyển sang dự án mới.

Hệ thống thiết lập **Vòng Lặp Tự Học Khép Kín (Closed-Loop Self-Learning)** với 3 trụ cột:
1. **Sổ Bài Học Thực Chiến (`data/BAI-HOC.md`):** Lưu trữ có hệ thống theo 4 trường: `Ngày`, `Thẻ`, `Bài học & Nguyên nhân`, `Cái chặn tự động`.
2. **Kế Thừa Liên Dự Án (`mau/BAI-HOC.md`):** Mẫu chuẩn toàn cục được tự động sao chép sang bất kỳ dự án mới nào khi chạy `npm run setup`.
3. **Cái Chặn Tự Động (Automated Guardrail):** Mỗi bài học bắt buộc phải đi kèm một cơ chế ngăn chặn cơ học (Linter, Unit Test, Header server, Pre-commit hook) thay vì chỉ là lời nhắc nhở văn bản.

---

## 2. Vòng Lặp Tự Học 4 Pha (4-Stage Self-Learning Loop)

```
        ┌────────────────────────────────────────────────────────┐
        │ [Pha 1] PHÁT HIỆN LỖI (Bug Ingestion & Root Cause)      │
        │ - Gặp lỗi mất ≥ 20 phút hoặc Claude bắt Blocker Vùng [5]│
        └──────────────────────────┬─────────────────────────────┘
                                   │
                                   ▼
        ┌────────────────────────────────────────────────────────┐
        │ [Pha 2] THIẾT LẬP CÁI CHẶN (Automated Guardrail)        │
        │ - Biến bài học thành script test / linter / config cứng │
        │ - Ghi vào data/BAI-HOC.md bằng "vp baihoc"              │
        └──────────────────────────┬─────────────────────────────┘
                                   │
                                   ▼
        ┌────────────────────────────────────────────────────────┐
        │ [Pha 3] NẠP ĐÓN ĐẦU (Pre-Flight Context Injection)      │
        │ - Khi AI nhận việc mới: Tự động nạp bài học cùng thẻ    │
        │ - Cảnh báo trước bẫy lỗi trước khi viết code            │
        └──────────────────────────┬─────────────────────────────┘
                                   │
                                   ▼
        ┌────────────────────────────────────────────────────────┐
        │ [Pha 4] KẾ THỪA LIÊN DỰ ÁN (Cross-Project Inheritance) │
        │ - Đồng bộ bài học giá trị vào mau/BAI-HOC.md            │
        │ - Dự án mới khởi tạo tự động kế thừa 100% kinh nghiệm   │
        └────────────────────────────────────────────────────────┘
```

---

## 3. Quy Trình Vận Hành Cụ Thể Giữa Các AI

### 3.1. Antigravity (SPEC & UI/UX Architect):
- **Phạm vi học hỏi:** Design tokens, Shaders 3D, tối ưu hóa Three.js, Canvas Textures, Responsive, A11y.
- **Cơ chế:** Kích hoạt slash command `/learn` khi giải quyết xong bài toán kỹ thuật phức tạp để lưu vào memory vĩnh viễn.

### 3.2. GPT 6.1 Sol (SOL_PLANNER):
- **Phạm vi học hỏi:** Schema SQLite, Hợp đồng API SSE Streaming, bất đồng bộ, phân chia package công việc.
- **Cơ chế:** Trước khi lập kế hoạch Vùng [3], đọc toàn bộ thẻ `BACKEND`, `DATABASE`, `MULTI-AI-ROLE` trong `BAI-HOC.md`.

### 3.3. Codex / Astra (CODEX_DEV):
- **Phạm vi học hỏi:** Cú pháp mã nguồn, xử lý lỗi hệ điều hành (Windows PowerShell vs Linux Bash), module importmap, quản trị tiến trình.
- **Cơ chế:** Viết code bám sát "Cái chặn tự động" đã ghi nhận trong bảng; chạy script kiểm tra lỗi tự động trước khi thông báo hoàn tất.

### 3.4. Claude Captain (CLAUDE_AUDITOR):
- **Phạm vi học hỏi:** Lỗ hổng bảo mật, rò rỉ secret/token, over-engineering, lỗi logic.
- **Cơ chế:** Nếu phát hiện lỗi từng có trong `BAI-HOC.md` mà kỹ sư vẫn tái phạm, lập tức đánh `[ ] OPEN Blocker` tại Vùng [5] và yêu cầu sửa ngay.

---

## 4. Công Cụ Thao Tác Trực Tiếp Của Thế Quân CEO & Đội Ngũ

1. **Thêm bài học mới bằng CLI:**
   ```bash
   node tools/vp.js baihoc --the "<TÊN_THẺ>" "<Nội dung bài học>" --chan "<Cái chặn tự động>"
   ```
2. **Xem sổ bài học trên giao diện Web:**
   - Mở trực tiếp màn hình: `http://localhost:7788/noiquy.html` (chọn tab **Bài học**).
   - Hoặc click nút **`🧠 Sổ Bài Học`** trên thanh điều hướng của Văn Phòng 3D.
3. **Kế thừa sang dự án mới:**
   - Chỉ cần chạy `npm run setup` cho thư mục dự án mới, toàn bộ bài học từ `mau/BAI-HOC.md` sẽ được tự động chuyển giao.
