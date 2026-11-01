# AGENT.MD (v2.2) — NGUỒN SỰ THẬT DUY NHẤT & SỔ BÀN GIAO THEO LƯỢT
> LUẬT TỐI CAO CHO MỌI AI (chi tiết: ~/.ai/agent-protocol.md):
> 1. Chỉ AI có vai trò trùng NEXT_OWNER ở Vùng [4] mới được sửa và commit file này.
> 2. Vùng [4.1] chỉ giữ log Phase hiện tại (tối đa 25 dòng); Phase đã xong nén thành 1 dòng ở Vùng [4.2] (tối đa 5 dòng).
> 3. Chỉ CLAUDE_AUDITOR được đánh dấu [x] RESOLVED ở Vùng [5]. Cấm tăng CURRENT_PHASE khi Vùng [5] còn [ ] OPEN.
> 4. Không ghi secret, token, API key vào file này. Repo công khai: không commit file này.
> 5. Đồng bộ bằng `git pull --ff-only`; chỉ push khi Chủ Dự Án đồng ý.

## [1] HIẾN PHÁP DỰ ÁN & LUẬT CHUNG
- Tên dự án: {{TEN_DU_AN}}
- Công nghệ nhận diện khi nạp repo (ctl): {{CONG_NGHE}}
- Tech Stack:
  - Frontend: [Chờ chốt: ví dụ Next.js / React, Tailwind CSS, shadcn/ui, Lucide Icons]
  - Backend & AI Agent: [Chờ chốt: ví dụ FastAPI / Node.js, LangGraph / SDK]
  - Database & Hạ tầng: [Chờ chốt: ví dụ PostgreSQL / Supabase, Redis / SQLite]
- Luật viết code bắt buộc:
  1. Cấm code giả lập (// TODO, pass, dữ liệu giả thay cho logic thật).
  2. Frontend phải tuân thủ nghiêm ngặt Design Tokens và xử lý đủ 5 trạng thái (Empty, Skeleton, Error, Ready, Streaming).
  3. Mọi lệnh gọi LLM/API có Timeout, Retry/Fallback và kiểm tra Schema (Pydantic/Zod).
  4. Không hardcode secret/API key; quản lý qua .env và .env.example.
  5. Không đổi tên trường API/Database khi chưa cập nhật Vùng [3].

## [2] ĐẶC TẢ SẢN PHẨM, AI AGENT & THIẾT KẾ FULLSTACK FRONTEND (UI/UX) (Chủ: SPEC_ARCHITECT)
### [2.1] SẢN PHẨM & PHẠM VI MVP
- Vấn đề cốt lõi & Người dùng mục tiêu: [Chưa cập nhật]
- Chỉ số thành công đo được: [Chưa cập nhật]
- MVP Must-Have (F1..Fn):
  - F1: [Tên tính năng] - Khi ... thì ...
- Out-of-Scope (Dứt khoát không làm ở MVP): [Chưa cập nhật]

### [2.2] LUỒNG NGƯỜI DÙNG ĐẦU-CUỐI (E2E USER FLOW)
- Luồng chính (Happy path): [Bước 1 -> Bước 2 -> ...]
- Nhánh lỗi & xử lý: [Mất mạng, nhập sai, LLM chậm/timeout]

### [2.3] LUỒNG AI AGENT (NẾU CÓ)
- Vai trò & Mục tiêu Agent: [Chưa cập nhật]
- Tools & External APIs: [Tool name, Input, Output]
- Memory & Context: [Session / Long-term, TTL]
- Guardrails & An toàn: [Chống prompt injection, PII]
- Schema JSON đầu ra & Fallback: [Chưa cập nhật]

### [2.4] THIẾT KẾ FULLSTACK FRONTEND & UI/UX DESIGN SYSTEM
- Design Tokens & Theme:
  - Bảng màu: Primary, Neutral, Background, Surface, Muted, Border (Hỗ trợ Dark/Light mode)
  - Typography Scale & Spacing (Tailwind CSS standard)
  - Icon Set & Visual tone: [ví dụ: Lucide React, phong cách tối giản, hiện đại]
- Danh mục màn hình & Information Architecture (IA):
  - Screen 1: [Layout tổng quan, Navbar, Main Content, Sidebar/Drawer, Footer]
- Component Hierarchy & State Matrix (5 trạng thái bắt buộc):
  - Cây component: Layout -> Page -> Feature Components -> Base UI Atoms
  - 5 trạng thái cho mỗi view chính: (1) Empty, (2) Loading/Skeleton, (3) Error, (4) Success/Ready, (5) Streaming/Progress
- Data Fetching & Client State Management:
  - Client state (Zustand/Context): [State cần lưu ở client]
  - Server Cache & Synchronization (TanStack React Query/SWR): [Cache keys, Revalidation]
  - Streaming protocol (SSE / WebSocket): [Cơ chế stream kết quả từ AI Agent]
- Interactive Artifact Prototype: [File HTML/Mockup tương tác nếu có trong artifacts]

### [2.5] TRƯỜNG HỢP BIÊN, ACCESSIBILITY (A11Y) & YÊU CẦU PHI CHỨC NĂNG
- Độ trễ mục tiêu (p95 UI interaction < 100ms, streaming FTTT < 1.5s)
- Accessibility & Responsive: Chuẩn WCAG AA tương phản, bàn phím điều hướng, responsive Breakpoints (Mobile 375px, Tablet 768px, Desktop 1280px)
- Edge cases giao diện: Text tràn dòng, ảnh lỗi, gián đoạn kết nối socket/stream

## [3] KIẾN TRÚC, HỢP ĐỒNG & LỘ TRÌNH (Chủ: SOL_ARCHITECT_PLANNER)
- Cây thư mục (Tách rõ Frontend theo Component Tree Vùng [2] và Backend): [Chưa cập nhật]
- Schema DB & Index: [Chưa cập nhật]
- API Contract & Giao thức streaming (khớp chuẩn state matrix Vùng [2]): [Chưa cập nhật]
- Lộ trình Phase:
  - [ ] Phase 1: Cấu hình lõi, Design System Setup & Schema DB
  - [ ] Phase 2: Backend lõi & AI Agent Engine
  - [ ] Phase 3: Tầng API, Streaming SSE & Frontend Component Shell
  - [ ] Phase 4: Frontend UI/UX Integration & State Handling (5 trạng thái)
  - [ ] Phase 5: Docker, Bảo mật, Polish UI/UX & Sẵn sàng Production

## [4] KHÓA LƯỢT & NHẬT KÝ
- CURRENT_PHASE: Phase 1 - Khảo sát & Lập kế hoạch
- LAST_UPDATED_BY: CTL_ONBOARDING
- NEXT_OWNER (MUTEX LOCK): CLAUDE_AUDITOR

### [4.1] NHẬT KÝ PHASE HIỆN TẠI (tối đa 25 dòng)
- File đã sửa: [Chưa có]
- CLAIM_FIXED (chờ Claude nghiệm thu): [Không có]
- Ghi chú test & cố vấn (SOL_ARCHITECT_ADVISOR): [Chưa có]

### [4.2] LƯU TRỮ PHASE ĐÃ XONG (tối đa 5 dòng, 1 dòng/Phase)
- (Chưa có Phase nào hoàn tất)

## [5] CHỐT CHẶN CLAUDE: KIỂM DUYỆT & BLOCKER (Chỉ CLAUDE_AUDITOR)
- AUDIT_STATUS: PENDING (chỉ CLAUDE_AUDITOR đổi sang PASS / CONDITIONAL PASS / REJECT)
- REVIEW_ROUND: 0/3
- LAST_AUDITED_COMMIT: (chưa có)
- Phản biện kiến trúc & chống over-engineering: [Chưa có]
- Blocker đang mở (chỉ CLAUDE_AUDITOR đổi [ ] OPEN thành [x] RESOLVED):
  - (Hiện không có Blocker)
