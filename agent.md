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
> Bản nháp do CLAUDE_AUDITOR soạn theo đặc cách ĐC-03 (CEO cho phép xin đặc cách từng lần). Có hiệu lực khi CEO duyệt merge nhánh `claude/va-loi-p2`. Sol phản biện bằng cách ghi đề xuất vào [4.1], không sửa thẳng mục này.
- Phạm vi điều khiển máy: **Kiến trúc A**: lệnh theo danh sách cho phép, lệnh ngoài danh sách phải CEO bấm duyệt từng lệnh; đọc/ghi file chỉ trong workspace đã đăng ký. KHÔNG có shell tự do, KHÔNG truy cập từ Internet, AI KHÔNG tự merge/release.
- Cây thư mục:
  - `server.js` + `lib/`: văn phòng 3D, chỉ đọc nhật ký + sổ `data/` (giữ nguyên). `lib/guard.js` chặn ghi từ trang lạ, `lib/proc.js` dừng cây tiến trình, `lib/keys.js` khóa API ngoài thư mục mã. `lib/mask.js` che khóa trong log + lọc biến môi trường cho tiến trình con.
  - `ctl/`: OS Controller, **tiến trình riêng**, cổng 7790, chỉ nghe 127.0.0.1. `ctl/main.js` (HTTP + SSE), `ctl/jobs.js` (sổ tiến trình, kill), `ctl/policy.js` (danh sách lệnh, giới hạn workspace), `ctl/runner.js` (gọi CLI AI), `ctl/audit.js` (nhật ký kiểm toán), `ctl/monitor.js` (CPU/RAM).
  - `test/*.test.js`: `node --test`, chạy bằng `npm test`; bắt buộc xanh trước mỗi commit.
- Bảo mật `ctl/`: mỗi lần khởi động sinh token 32 byte ngẫu nhiên, ghi vào `~/.van-phong-ao/ctl-token` (quyền 600); mọi yêu cầu cần header `Authorization: Bearer <token>` + `lib/guard.checkWrite`. `server.js` đọc token đó và làm cầu nối cho giao diện; token không bao giờ xuống trình duyệt. Tiến trình con nhận biến môi trường đã lọc (bỏ `*_KEY`, `*_TOKEN`, `*SECRET*`), log đi qua `mask()`.
- Schema DB (`node:sqlite`, file `~/.van-phong-ao/ctl.db`, WAL):
  - `jobs(id TEXT PK, kind TEXT CHECK(kind IN('cmd','ai')), agent TEXT, workspace TEXT, argv TEXT/*JSON*/, pid INTEGER, status TEXT CHECK(status IN('pending_approval','running','done','failed','killed','timeout')), exit_code INTEGER, started_at INTEGER, ended_at INTEGER, timeout_ms INTEGER, log_path TEXT)`
    - `INDEX jobs_status(status)`: bảng giám sát và Kill-All chỉ lấy `running`/`pending_approval` mỗi 1s.
    - `INDEX jobs_agent_started(agent, started_at DESC)`: xem lịch sử theo từng AI, giới hạn chạy cùng lúc theo AI.
  - `audit(id INTEGER PK AUTOINCREMENT, at INTEGER, actor TEXT, action TEXT, target TEXT, detail TEXT /*đã mask*/, decision TEXT)`: chỉ INSERT, không UPDATE/DELETE. `INDEX audit_at(at)`: xem theo thời gian, dọn bản ghi > 90 ngày.
  - `workspaces(path TEXT PK /*đã realpath*/, name TEXT, added_at INTEGER)`: không cần thêm index (ít dòng).
- API Contract `ctl/` (JSON; lỗi luôn `{ok:false, error:string, code:string}`):
  - `GET /health` → `{ok, version, pid, uptimeS}`.
  - `GET /monitor` → `{cpuPct:number, memUsedMb:number, memTotalMb:number, jobs:[{id, agent, pid, cpuPct, memMb, runningS}]}`; SSE `GET /monitor/stream` mỗi 1000ms, cùng dữ liệu.
  - `GET /jobs?status=running` → `{jobs:[Job]}`.
  - `POST /jobs {kind:'cmd', workspace, argv:string[], timeoutMs<=1800000}` → `201 {job}` nếu argv[0] trong danh sách cho phép; `202 {job, status:'pending_approval'}` nếu ngoài danh sách; `403 WORKSPACE_DENIED` nếu workspace chưa đăng ký.
  - `POST /jobs/:id/approve` / `POST /jobs/:id/reject`: chỉ CEO bấm từ giao diện → `200 {job}`; `409 NOT_PENDING`.
  - `POST /jobs/:id/kill`, `POST /kill-all` → `200 {results:[{id,pid,killed,error}]}`; `500 KILL_FAILED` nếu PID còn sống sau 3s.
  - `GET /jobs/:id/log?from=<byte>` → `text/plain` (đã mask), SSE `GET /jobs/:id/log/stream`.
  - `GET /fs/read?workspace&path` → `{content, size, sha256}`, giới hạn 2 MB; `POST /fs/write {workspace, path, content, expectSha256}` → `200 {sha256}`; `409 CHANGED` nếu file đã đổi; `403 PATH_ESCAPE` nếu realpath ra ngoài workspace (chặn `..`, symlink, ổ khác).
  - `GET /workspaces`, `POST /workspaces {path}` (chỉ CEO), `POST /workspaces/switch {path}` → `{active}`.
  - Danh sách lệnh cho phép (mặc định): `git` (trừ `push --force`, `reset --hard`, `clean -fd`), `node`, `npm` (`test`, `run`, `ci`), `npx` theo tên gói được duyệt, `gh` (chỉ đọc). Mọi thứ khác là `pending_approval`.
- Luồng AI Agent (`ctl/runner.js`): mỗi lượt là 1 job `kind:'ai'`, tối đa 1 job AI cùng lúc mỗi workspace (khớp Mutex `NEXT_OWNER`).
  - Claude (CLAUDE_AUDITOR): `claude -p <prompt> --output-format json --max-turns 30`; prompt chính: "Đọc ./agent.md, thẩm định diff từ LAST_AUDITED_COMMIT theo /tester, chỉ ghi Vùng [5]". Timeout 20 phút.
  - Codex Astra (CODEX_ASTRA_DEV) và Sol (SOL_*): `codex exec --json <prompt>` (vai Sol/Astra khác nhau ở prompt + vùng được ghi). Timeout 30 phút.
  - Antigravity (Hinata) **không có CLI chạy nền (cần kiểm chứng)**: giữ cách hiện tại, gửi việc vào hòm thư `data/hop-thu/`, Antigravity tự đọc bằng `vp tiep`. Pain Thiên Đạo = `ctl/monitor.js`, không phải AI.
  - Đầu ra bắt buộc: AI kết thúc bằng 1 dòng JSON `{"role", "next_owner", "files":[], "claim_fixed":[]}`; runner kiểm tra bằng hàm kiểm schema tự viết (không thư viện ngoài). Sai schema → job `failed`, không tự chuyển lượt.
  - Retry: tối đa 1 lần khi CLI thoát vì lỗi mạng/giới hạn tốc độ (chờ 60s); lỗi khác dừng và báo CEO. Không có vòng lặp AI gọi AI tự động: mỗi lần chuyển lượt đều chờ CEO bấm "Duyệt chuyển lượt".
  - Ước tính chi phí mỗi lượt: 30–150 nghìn token, 3–20 phút (cần đo thật ở Phase 5). Chạy bằng gói thuê bao cá nhân (OAuth sẵn có), không dùng API key nếu không cần.
- Lộ trình Phase (mỗi Phase có điều kiện nghiệm thu đo được):
  - [x] Phase 1: Đặc tả Sản phẩm & Thiết kế UI/UX (Antigravity).
  - [ ] Phase 2: Vá lỗi nền tảng + chốt kiến trúc. Nghiệm thu: `npm test` xanh; POST từ Origin lạ / text/plain / Host lạ → 403; không còn dữ liệu giả, email cứng.
  - [ ] Phase 3: `ctl/` lõi: sổ tiến trình, Kill-Switch, giám sát CPU/RAM, nhật ký kiểm toán. Nghiệm thu: dừng cây 3 tiến trình < 2s trên Windows; job quá timeout tự `timeout`; thiếu token → 401.
  - [ ] Phase 4: Workspace + đọc/ghi file + lệnh theo danh sách cho phép + duyệt từng lệnh. Nghiệm thu: test `..\..\Windows`, symlink ra ngoài, `git push --force` đều bị chặn hoặc chờ duyệt.
  - [ ] Phase 5: Runner AI + nút chuyển lượt trên giao diện 3D. Nghiệm thu: 1 vòng thật Sol → Astra → Claude trên một repo thử, log đã mask, đo token/độ trễ thật ghi vào [4.1].
  - [ ] Phase 6: Thẩm định bảo mật tổng (Claude) & đưa vào dùng hằng ngày.

## [4] KHÓA LƯỢT & NHẬT KÝ
- CURRENT_PHASE: Phase 2 - Vá lỗi nền tảng & Chốt kiến trúc OS Controller
- LAST_UPDATED_BY: CLAUDE_AUDITOR
- NEXT_OWNER (MUTEX LOCK): SOL_ARCHITECT_ADVISOR

### [4.1] NHẬT KÝ PHASE HIỆN TẠI (tối đa 25 dòng)
- Đặc cách CEO (01/11/2026): ĐC-01 Claude nhận lượt ghi agent.md; ĐC-02 Claude sửa code thay Astra cho P2-C03/C04/C05; ĐC-03 Claude soạn nháp Vùng [3].
- File đã sửa (nhánh claude/va-loi-p2): server.js, public/index.html, lib/guard.js, lib/proc.js, lib/keys.js, test/*.test.js, package.json (thêm `npm test`).
- CLAIM_FIXED: P2-C03, P2-C04, P2-C05, P2-C06 -> nhánh claude/va-loi-p2 (chờ Sol đọc chéo vì người sửa cũng là người nghiệm thu).
- Đặc cách ĐC-04 (01/11/2026): Claude dựng ctl/ Phase 3 trên nhánh claude/ctl-phase3 (tách từ claude/va-loi-p2): ctl/main.js, db.js, jobs.js, audit.js, monitor.js, lib/mask.js, test/ctl.test.js; `npm run ctl`. 25/25 test đạt trên Linux, CHƯA chạy trên Windows.
- Giới hạn Phase 3 đã biết: giám sát từng việc chỉ tính tiến trình gốc; Windows hỏi PowerShell mỗi 5s; chưa nối vào giao diện 3D (để Phase 5); chưa có route chạy lệnh (để Phase 4).
- Việc cho SOL_ARCHITECT_ADVISOR: (1) đọc chéo diff 2 nhánh claude/va-loi-p2 và claude/ctl-phase3; (2) phản biện Vùng [3] bản nháp; ghi ý kiến tại đây rồi đặt NEXT_OWNER: CLAUDE_AUDITOR.

### [4.2] LƯU TRỮ PHASE ĐÃ XONG (tối đa 5 dòng, 1 dòng/Phase)
- Phase 1: Hoàn tất đặc tả Vùng [2] và Interactive Prototype Chibi Edition (SPEC_ARCHITECT).

## [5] CHỐT CHẶN CLAUDE: KIỂM DUYỆT & BLOCKER (Chỉ CLAUDE_AUDITOR)
- AUDIT_STATUS: REJECT (chờ đọc chéo các bản sửa)
- REVIEW_ROUND: 1/3
- LAST_AUDITED_COMMIT: 21e4322
- Phản biện kiến trúc & chống over-engineering: "Toàn quyền điều khiển máy + AI tự chỉ huy nhau" bị thay bằng Kiến trúc A (Vùng [3]): một prompt injection qua README/issue/log không được phép thành lệnh xóa file hay đẩy secret ra ngoài. Không multi-agent tự động: mọi lần chuyển lượt có CEO bấm duyệt.
- Blocker đang mở (chỉ CLAUDE_AUDITOR đổi [ ] OPEN thành [x] RESOLVED):
  - [ ] OPEN P2-C01 [CRITICAL - quy trình]: SPEC_ARCHITECT commit server.js/public/agent.md 5 lần (219b2ef..21e4322) khi NEXT_OWNER là SOL; bản agent.md trên máy Windows ghi NEXT_OWNER khác GitHub → từ nay mọi chuyển lượt phải có commit chore(agent-sync) đã push; SPEC chỉ ghi Vùng [2].
  - [ ] OPEN P2-C03 [CRITICAL - server.js /api/kill-task]: Kill-Switch chỉ đổi trạng thái trong RAM, không dừng tiến trình nào → dùng lib/proc.killTree theo PID, kiểm tra lại PID đã mất. (Claude đã sửa, chờ đọc chéo)
  - [ ] OPEN P2-C04 [CRITICAL - server.js /api/broadcast + activeTasks]: lời "ĐÃ DUYỆT CHÉO" của Claude/Sol/Codex viết cứng, 3 task giả "running" lúc khởi động → bỏ hết; chưa hỏi AI thật thì peerReview rỗng và ghi rõ "gợi ý theo từ khóa". (Claude đã sửa, chờ đọc chéo)
  - [ ] OPEN P2-C05 [CRITICAL - server.js mọi route POST]: CSRF/DNS rebinding: trang lạ ghi được khóa API vào config.json và gửi tin vào hòm thư AI qua /chat/send → lib/guard.checkWrite cho mọi POST; khóa lưu ~/.van-phong-ao/keys.json (600), báo lỗi khi ghi hỏng. (Claude đã sửa, chờ đọc chéo)
  - [ ] OPEN P2-C06 [CRITICAL - server.js getAccountsStatus]: email cá nhân viết cứng trong mã và Gemini luôn báo "đã kết nối" → bỏ email, connected = null. Email vẫn nằm trong lịch sử git (cần CEO quyết có viết lại lịch sử không). (Claude đã sửa, chờ đọc chéo)
  - [ ] OPEN P2-H02 [HIGH - Vùng [2.3] ↔ server.js ↔ public/]: tên nhân vật lệch nhau (Claude = Sakura/Gaara, Sol = Itachi/Shikamaru) → SPEC_ARCHITECT thống nhất 1 bảng trong Vùng [2.3], Astra sửa mã theo.
  - [ ] OPEN P2-H07 [HIGH - data/BAI-HOC.md]: cái chặn TASK-ACCUMULATION, IMPORTMAP-MODULE, SECURITY-ZERO-LEAK ghi sai/không tồn tại → sửa theo bản đề xuất của Claude, thêm FAKE-GUARDRAIL và LOCALHOST-CSRF.
  - [ ] OPEN P2-M08 [MEDIUM - public/index.html]: tiêu đề task, tên người nhận chèn bằng innerHTML không thoát ký tự → thoát HTML (sau khi đã chặn CSRF thì chỉ còn tự gây hại, nên để mức MEDIUM).
