# LỆNH BÀN GIAO ĐỘI TRƯỞNG TỐI CAO & CHỈ THỊ DỰ ÁN CHO CLAUDE CODE
> **Người ban hành:** Thế Quân CEO (Chủ Tịch Tối Cao)  
> **Người tiếp nhận:** Claude Code (CLAUDE_AUDITOR & MASTER TEAM CAPTAIN)  
> **Đơn vị bàn giao:** Antigravity (SPEC_ARCHITECT & UIUX_ARCHITECT)  
> **Thời điểm:** 01/11/2026 · Áp dụng giao thức Universal Protocol v2.2 (/bcc)

---

## 1. MỆNH LỆNH CỦA THẾ QUÂN CEO
1. **Trao toàn quyền Đội Trưởng**: Claude Code chính thức tiếp quản vai trò **Đội Trưởng Tối Cao (Master Team Captain)** của toàn bộ văn phòng AI.
2. **Quyền điều khiển máy tính**: Xây dựng một ứng dụng chạy cục bộ (Local Desktop App / OS Daemon) nắm **toàn quyền điều khiển máy tính** của Thế Quân CEO (thực thi lệnh hệ thống, quản lý tiến trình, file hệ thống, chuyển đổi dự án).
3. **Chỉ huy tự động toàn đội**: Mọi AI khác (GPT 6.1 Sol, Codex Sasuke, Antigravity Hinata, Pain Quản Lý và 10 Subagents Vĩ Thú) sẽ **làm việc tự động dưới sự chỉ đạo trực tiếp của Claude**.
4. **Báo cáo trực tiếp**: Claude chịu trách nhiệm điều phối, nghiệm thu, kiểm tra chéo và **báo cáo kết quả trực tiếp một đầu mối lên Thế Quân CEO**.
5. **Kế thừa tinh thần `agent.md`**: Toàn bộ dự án và công việc đều tuân thủ nguyên tắc kỷ luật của `agent.md`: Khóa lượt Mutex, Zero-Leak không rò rỉ secret, và tự học hỏi qua `data/BAI-HOC.md`.

---

## 2. HIỆN TRẠNG HỆ THỐNG ĐÃ CÓ TRÊN MÁY TÍNH
Claude hãy kiểm tra nhanh các thành phần đã được dựng sẵn và đang chạy:

1. **Mã nguồn và máy chủ Văn phòng AI**:
   - Thư mục làm việc: `C:\Users\oanhb\Downloads\Văn phòng AI`
   - Máy chủ máy trạm: `node server.js` đang phục vụ tại cổng `http://localhost:7788` (Native `node:sqlite`, không thư viện npm ngoài, bảo mật 100% nội bộ).
   - Giao diện văn phòng 3D: `public/index.html` (Mặt bằng 3D Three.js 6 Nhẫn giả anime và 10 Vĩ thú, bảng giám sát task, modal phân việc và trung tâm tài khoản AI).
2. **Hệ thống tài khoản AI đã xác thực**:
   - Claude Code: Đã đăng nhập OAuth Pro/Team tại `~/.claude/.credentials.json`.
   - Codex / GPT: Đã đăng nhập ChatGPT mode tại `~/.codex/auth.json`.
   - Gemini 3.8 / Antigravity: Đang chạy trực tiếp trong IDE.
3. **Hệ thống dữ liệu & Giao thức**:
   - `agent.md`: File nguồn sự thật duy nhất. Lượt hiện tại đã được khóa sang:
     ```yaml
     CURRENT_PHASE: Phase 2 - Lập Kế Hoạch & Kiến Trúc Backend (Bàn Giao Claude Captain)
     LAST_UPDATED_BY: SPEC_ARCHITECT
     NEXT_OWNER: CLAUDE_AUDITOR
     ```
   - `data/BAI-HOC.md` & `mau/BAI-HOC.md`: Ngân hàng 10 bài học và cái chặn tự động (lỗi cache, PowerShell, Cel-shader, Zero-leak, SSE timeout...).
   - `docs/CO-CHE-TU-HOC.md`: Cơ chế tự học 4 bước khép kín giữa các dự án.

---

## 3. ĐẶC TẢ YÊU CẦU CHO ỨNG DỤNG LOCAL OS CONTROLLER (F11)
Claude cần lập kế hoạch và chỉ huy đội ngũ thi công ứng dụng với các module cốt lõi sau:

### Module 1: Bộ Điều Khiển Hệ Thống Cục Bộ (Local OS Executive Core)
- **Terminal & Shell Bridge**: Thực thi lệnh an toàn qua PowerShell / Node child_process, bắt log thời gian thực.
- **Process & Daemon Manager**: Khởi động, kiểm tra tình trạng, phát hiện treo và phanh khẩn cấp (Emergency Kill Switch) các task/subagent đang chạy ngầm.
- **Workspace & GitHub Switcher**: Tự động chuyển đổi thư mục dự án, clone repo, quét `agent.md` của từng dự án.

### Module 2: Bộ Chỉ Huy Tự Động Đa AI (Captain Orchestrator Hub)
- **Tự động phân rã nhiệm vụ (Task Decomposition)**: Khi Thế Quân CEO đưa ra yêu cầu lớn, Claude tự động bóc tách thành các gói việc nhỏ:
  - Giao cho **GPT 6.1 Sol (Itachi)**: Thiết kế DB Schema, API Contract, cấu trúc thư mục.
  - Giao cho **Codex / Astra (Sasuke)**: Viết mã nguồn Fullstack Frontend/Backend.
  - Giao cho **Antigravity (Hinata)**: Viết đặc tả sản phẩm, thiết kế UI/UX Design System & Prototype.
  - Giao cho **Pain Thiên Đạo**: Điều phối luồng và cảnh báo tải CPU/RAM.
- **Tự động kiểm tra chéo (Peer-Review & Audit QA)**: Claude kiểm duyệt code, quét lỗ hổng bảo mật, kiểm tra schema trước khi báo cáo CEO.

### Module 3: Cổng Giao Tiếp Trực Tiếp Với Thế Quân CEO (CEO Dashboard & Reporter)
- Kênh tương tác tức thì qua giao diện Web (`localhost:7788`) hoặc CLI.
- Báo cáo cô đọng: *Việc gì đã hoàn thành*, *AI nào đang làm gì*, *Có blocker nào cần CEO quyết định không*.

---

## 4. HÀNH ĐỘNG BẮT ĐẦU NGAY CHO CLAUDE CODE
1. **Đọc và xác nhận `agent.md`**: Kiểm tra Vùng [1], [2], [4] và xác nhận đang giữ khóa `NEXT_OWNER: CLAUDE_AUDITOR`.
2. **Đọc `data/BAI-HOC.md`**: Nắm rõ 10 cái chặn tự động để không gặp lỗi cú pháp hay bảo mật.
3. **Chào Thế Quân CEO và trình bày lộ trình**:
   - Báo cáo nhận quyền Đội Trưởng Tối Cao.
   - Đề xuất kiến trúc cho ứng dụng điều khiển máy tính cục bộ (Local OS Controller) và cơ chế tự động phân việc cho Sol, Codex, Antigravity.
   - Chờ CEO duyệt phương án và chỉ đạo thực thi bước đầu tiên!
