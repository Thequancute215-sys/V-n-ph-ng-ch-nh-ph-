# AGENT.MD (v2.2) — NGUỒN SỰ THẬT DUY NHẤT & SỔ BÀN GIAO THEO LƯỢT
> LUẬT TỐI CAO CHO MỌI AI (chi tiết: ~/.ai/agent-protocol.md):
> 1. Chỉ AI có vai trò trùng NEXT_OWNER ở Vùng [4] mới được sửa và commit file này.
> 2. Vùng [4.1] chỉ giữ log Phase hiện tại (tối đa 25 dòng); Phase đã xong nén thành 1 dòng ở Vùng [4.2] (tối đa 5 dòng).
> 3. Chỉ CLAUDE_AUDITOR được đánh dấu [x] RESOLVED ở Vùng [5]. Cấm tăng CURRENT_PHASE khi Vùng [5] còn [ ] OPEN.
> 4. Không ghi secret, token, API key vào file này. Repo công khai: không commit file này.
> 5. Đồng bộ bằng `git pull --ff-only`; chỉ push khi Chủ Dự Án đồng ý.

## [1] HIẾN PHÁP DỰ ÁN & LUẬT CHUNG
- Tên dự án: Văn Phòng Quản Lý AI Trực Quan (Chibi Edition - BCC v2.2)
- Tech Stack:
  - Frontend: Vanilla HTML5 / Three.js 3D (WebGL) + 2D Canvas, Tailwind CSS CDN, Lucide Icons, Quicksand & Plus Jakarta Sans
  - Backend & Local Engine: Node.js (v24.20.0 native `node:sqlite`), HTTP / SSE Server (`server.js`), không npm dependencies bên ngoài
  - Tích hợp AI Engine: Antigravity (Gemini 3.8 / SQLite logs), Codex (OpenAI sessions), Claude Code (Anthropic logs), Subagents Hierarchy
  - Giao thức điều phối: Universal Protocol v2.2 (/bcc) & Sổ điều phối `data/` (`CAN-ANH.md`, `DEV.lock`, `hop-thu/*.jsonl`, `HOI-CHAN-TONG-THE.md`)
- Luật viết code bắt buộc:
  1. Cấm code giả lập (// TODO, pass, dữ liệu giả thay cho logic thật).
  2. Frontend phải tuân thủ nghiêm ngặt Design Tokens và xử lý đủ 5 trạng thái (Empty, Skeleton, Error, Ready, Streaming).
  3. Mọi lệnh gọi LLM/API có Timeout, Retry/Fallback và kiểm tra Schema (Zod/Pydantic).
  4. Không hardcode secret/API key; 100% Zero-Leak chạy cục bộ tại Localhost, tự động che chuỗi nhạy cảm qua hàm mask().
  5. Không đổi tên trường API/Database khi chưa cập nhật Vùng [3].
  6. Luật phân việc ngoài lệ (CEO Override): Mặc định GPT 6.1 Sol chỉ làm kiến trúc & hợp đồng Vùng [3], Codex làm code; CHỈ KHI Chủ Dự Án (CEO) trực tiếp ban hành lệnh đặc cách (qua nút "Phân việc ngoài lề" hoặc ghi Vùng [4.1]) thì GPT 6.1 Sol mới được phép viết mã nguồn trực tiếp (Bypass Codex).

## [2] ĐẶC TẢ SẢN PHẨM, AI AGENT & THIẾT KẾ FULLSTACK FRONTEND (UI/UX) (Chủ: SPEC_ARCHITECT)
### [2.1] SẢN PHẨM & PHẠM VI MVP
- Vấn đề & Người dùng: Kỹ sư / Chủ dự án (Thế Quân CEO) dùng đồng thời Antigravity, Codex, Claude Code trong VS Code; gặp khó khăn khi chuyển phiên thủ công, thiếu góc nhìn trực quan toàn cảnh và thiếu trạm chỉ huy điều phối lượt.
- Chỉ số thành công: 100% không cần mở tay file agent.md; 1-click phê duyệt chuyển lượt; chuyển đổi giữa các repo GitHub linh hoạt trong < 500ms; phát hiện phiên Antigravity cục bộ qua native node:sqlite trong < 2 giây.
- Phạm vi MVP (F1..F7):
  - F1 (GitHub Repo Switcher): Liệt kê danh sách repo đã tạo trên GitHub, chuyển workspace hoặc clone về máy trong 1 click.
  - F2 (Naruto Shippuden & 10 Vĩ Thú): 5 Nhẫn giả AI chủ lực (Thế Quân CEO Naruto 80px, Antigravity Kakashi 72px, Sol Shikamaru 72px, Codex Sasuke 72px, Claude Gaara 72px) cùng 10 Vĩ Thú Subagents từ Nhất Vĩ Shukaku đến Thập Vĩ Juubi với hiệu ứng hào quang Chakra tỏa sáng bốc khói rực rỡ quanh nhân vật.
  - F3 (Antigravity & Subagents Hierarchy): Module đọc SQLite cục bộ nhận diện phiên cha và vệ tinh (research, generative_ui).
  - F4 (Hội Chẩn Ban Tổng Thể): Phòng họp bàn tròn xuất tài liệu đồng thuận data/HOI-CHAN-TONG-THE.md từ cả 4 AI.
  - F5 (Cơ Chế Đề Xuất Chuyển Lượt Tự Động 1-Click): Pop-up đề xuất khi xong Vùng, Giám đốc bấm duyệt là tự động cập nhật Vùng [4] và commit chore(agent-sync).
  - F6 (Zero-Leak Personal Accounts): Xác thực độc lập qua CLI từng hãng, dùng gói đăng ký của cá nhân, 100% Localhost.
  - F7 (Native Node.js 24 SQLite): Sử dụng DatabaseSync tiêu chuẩn, 0 thư viện ngoài.
  - F8 (CEO Override & Smooth Room Zoom Navigation): Cơ chế phân việc ngoài lề cho phép Giám đốc chỉ định ngoại lệ (ví dụ cấp quyền code trực tiếp cho 6.1 Sol); kèm thanh điều hướng lướt phòng (Glide Focus), slider thu phóng và thao tác cuộn/di chuột êm dịu.
  - F9 (All-Hands Broadcast & Self-Assignment Dispatch): Phát loa toàn thể nhân viên khi CEO có task chưa biết giao ai; các AI tự động rà soát ai đang rảnh và phù hợp nhất, tự check chéo lẫn nhau rồi báo cáo đề xuất người nhận việc lên CEO duyệt 1-click.
  - F10 (Active Tasks Monitor & Emergency Kill Switch): Bảng nhắc nhở thời gian thực danh sách task/subagent đang chạy ngầm kèm thời lượng; cảnh báo task chạy quá lâu và cung cấp nút dừng từng task hoặc dừng tất cả để CEO kiểm soát tài nguyên máy tính.
- Out-of-Scope: Không can thiệp mã nhị phân VS Code, không đẩy dữ liệu ra Internet công cộng.

### [2.2] LUỒNG NGƯỜI DÙNG ĐẦU-CUỐI (E2E USER FLOW)
1. Mở localhost:7788 -> Dropdown hiển thị danh sách GitHub Repo -> Chọn repo làm việc.
2. Hệ thống nạp agent.md, quét nhật ký Antigravity/Codex/Claude -> Hiển thị Mặt bằng Chibi 3D/2D.
3. Phòng AI đang giữ lượt (NEXT_OWNER) phát sáng neon -> AI hoàn thành thì bắn Pop-up Đề xuất Bàn giao.
4. Giám đốc bấm "Duyệt chuyển lượt ngay" -> Tự động commit chore(agent-sync) -> AI tiếp theo nhận lượt.
5. Khi cần hội ý liên AI -> Mở Phòng Họp Ban -> Xuất tài liệu HOI-CHAN-TONG-THE.md.

### [2.3] LUỒNG AI AGENT, HỆ THỐNG NHẪN GIẢ & 10 VĨ THÚ
- Thế Quân CEO: Naruto Uzumaki (Chủ Tịch Tối Cao / Hokage Tiên Nhân / Rasengan 2 lớp). Thú bảo hộ: Cửu Vĩ Kurama.
- Tổng Quản Lý: Pain Thiên Đạo Yahiko (Quản Lý Điều Hành / 16 Hắc Trượng / Rinnegan 4 vòng / Áo Akatsuki).
- GPT 6.1 Sol: Itachi Uchiha (Quân Sư Chiến Lược & SOL_PLANNER / Mangekyo Sharingan / Rãnh lệ 35°). Vệ tinh: Tam Vĩ Isobu & Tứ Vĩ Son Goku.
- Codex / Astra: Sasuke Uchiha (Kỹ Sư Trưởng Code & CODEX_DEV / EMS & Rinnegan 6 Tomoe / Chidori / Kiếm Kusanagi). Vệ tinh: Bát Vĩ Gyuki & Thất Vĩ Chomei.
- Claude Captain: Sakura Haruno (Chốt Chặn Kiểm Duyệt & CLAUDE_AUDITOR / Ấn Bách Hào tím / Y thuật QA / Zero-Leak). Vệ tinh: Lục Vĩ Saiken & Ngũ Vĩ Kokuo.
- Antigravity (Gemini 3.8): Hinata Hyuga (Thư Ký Trợ Lý Giám Đốc & SPEC_ARCHITECT / Bạch Nhãn tím trắng / Song Sư Quyền). Vệ tinh: Nhất Vĩ Shukaku & Nhị Vĩ Matatabi.
- Phòng Họp Ban Hội Chẩn: Thập Vĩ Juubi (Cội nguồn Chakra Ban Hội Chẩn Đa AI).

### [2.4] THIẾT KẾ FULLSTACK FRONTEND & UI/UX DESIGN SYSTEM
- Design Tokens: Background #06080d, Glass Surface rgba(14,18,26,0.82), Accent Gold #ecc970, Violet #a855f7, Blue #3a86ff, Orange #e07a5f, Emerald #10b981, Rose #f43f5e.
- Typography: Quicksand (Tiêu đề Chibi), Plus Jakarta Sans (Giao diện), JetBrains Mono (Mã & logs).
- 5 Không gian: (1) Mặt bằng Chibi & Subagents, (2) Bàn Họp Hội Chẩn, (3) Bảng Điều Hành BCC, (4) Live Transcript, (5) Tài Khoản AI.
- Ma trận 5 trạng thái (Empty, Skeleton, Error, Ready, Streaming) áp dụng đồng bộ cho tất cả các View.
- Prototype: C:\Users\oanhb\.gemini\antigravity\brain\4f51312f-c036-477d-9466-981e45f0dad4\ai-office-prototype.html

### [2.5] TIÊU CHUẨN PHI CHỨC NĂNG (A11Y & SECURITY)
- Phản hồi giao diện < 100ms; đồng bộ SSE 1000ms; che chuỗi token/key/PIN tự động; an toàn dữ liệu 100% nội bộ.

## [3] KIẾN TRÚC, HỢP ĐỒNG & LỘ TRÌNH (Chủ: SOL_ARCHITECT_PLANNER)
- Cây thư mục (Tách rõ Frontend theo Component Tree Vùng [2] và Backend): [Chờ Sol cập nhật]
- Schema DB & Index: [Chờ Sol cập nhật]
- API Contract & Giao thức streaming (khớp chuẩn state matrix Vùng [2]): [Chờ Sol cập nhật]
- Lộ trình Phase:
  - [x] Phase 1: Đặc tả Sản phẩm & Thiết kế UI/UX Chibi (Antigravity đã hoàn tất)
  - [ ] Phase 2: Kiến trúc Backend, Quản lý GitHub Repos & Node:sqlite Engine (Sol)
  - [ ] Phase 3: Triển khai Cổng API, SSE Stream & Tích hợp Mặt bằng Chibi (Codex)
  - [ ] Phase 4: Tích hợp Bàn Họp Hội Chẩn & Cơ chế 1-Click Handover (Codex + Antigravity)
  - [ ] Phase 5: Thẩm định Bảo mật, Zero-Leak Audit & Sẵn sàng Sử dụng (Claude Captain)

## [4] KHÓA LƯỢT & NHẬT KÝ
- CURRENT_PHASE: Phase 2 - Lập Kế Hoạch & Kiến Trúc Backend
- LAST_UPDATED_BY: SPEC_ARCHITECT
- NEXT_OWNER (MUTEX LOCK): SOL_ARCHITECT_PLANNER

### [4.1] NHẬT KÝ PHASE HIỆN TẠI (tối đa 25 dòng)
- File đã tạo: ./agent.md, ai-office-prototype.html, spec-vung-2-ai-office.md.
- Hoàn tất Vùng [2]: Bổ sung tính năng chọn GitHub Repo, Chibi Cute Avatar (AI to, subagent nhỏ), Bàn Họp Hội Chẩn Tổng Thể và Cơ chế Duyệt Chuyển Lượt 1-Click.
- Chuyển giao khóa MUTEX sang SOL_ARCHITECT_PLANNER để thiết kế kiến trúc Backend và API Contracts.
- CLAIM_FIXED: [Chưa có]

### [4.2] LƯU TRỮ PHASE ĐÃ XONG (tối đa 5 dòng, 1 dòng/Phase)
- Phase 1: Hoàn tất đặc tả Vùng [2] và Interactive Prototype Chibi Edition (SPEC_ARCHITECT).

## [5] CHỐT CHẶN CLAUDE: KIỂM DUYỆT & BLOCKER (Chỉ CLAUDE_AUDITOR)
- AUDIT_STATUS: PENDING (chờ CLAUDE_AUDITOR nghiệm thu tổng thể)
- REVIEW_ROUND: 0/3
- LAST_AUDITED_COMMIT: (chưa có)
- Phản biện kiến trúc & chống over-engineering: [Chưa có]
- Blocker đang mở (chỉ CLAUDE_AUDITOR đổi [ ] OPEN thành [x] RESOLVED):
  - (Hiện không có Blocker)
