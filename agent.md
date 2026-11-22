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
  6. Luật phân việc ngoài lệ (CEO Override): Mặc định GPT 6.1 Sol chỉ làm kiến trúc & hợp đồng Vùng [3], Codex làm code; CHỈ KHI Chủ Dự Án (CEO) trực tiếp ban hành lệnh đặc cách (ghi lệnh đặc cách vào Vùng [4.1]; nút ⚡ "Giao việc một vai" của văn phòng chỉ chạy lượt của vai đang giữ NEXT_OWNER, không cấp quyền này) thì GPT 6.1 Sol mới được phép viết mã nguồn trực tiếp (Bypass Codex).

## [2] ĐẶC TẢ SẢN PHẨM, AI AGENT & THIẾT KẾ FULLSTACK FRONTEND (UI/UX) (Chủ: SPEC_ARCHITECT)
### [2.1] SẢN PHẨM & PHẠM VI MVP
- Vấn đề & Người dùng: Kỹ sư / Chủ dự án (Thế Quân CEO) dùng đồng thời Antigravity, Codex, Claude Code trong VS Code; gặp khó khăn khi chuyển phiên thủ công, thiếu góc nhìn trực quan toàn cảnh và thiếu trạm chỉ huy điều phối lượt.
- Chỉ số thành công: 100% không cần mở tay file agent.md; 1-click phê duyệt chuyển lượt; chuyển đổi giữa các repo GitHub linh hoạt trong < 500ms; phát hiện phiên Antigravity cục bộ qua native node:sqlite trong < 2 giây.
- Phạm vi MVP (F1..F7):
  - F1 (GitHub Repo Switcher): Liệt kê danh sách repo đã tạo trên GitHub, chuyển workspace hoặc clone về máy trong 1 click.
  - F2 (Naruto Shippuden & 10 Vĩ Thú): 6 Nhẫn giả chủ lực theo Vùng [2.3] (Thế Quân CEO Naruto 80px, Pain Thiên Đạo 72px, Antigravity Hinata 72px, Sol Itachi 72px, Codex Sasuke 72px, Claude Sakura 72px) cùng 10 Vĩ Thú Subagents từ Nhất Vĩ Shukaku đến Thập Vĩ Juubi với hiệu ứng hào quang Chakra tỏa sáng bốc khói rực rỡ quanh nhân vật.
  - F3 (Antigravity & Subagents Hierarchy): Module đọc SQLite cục bộ nhận diện phiên cha và vệ tinh (research, generative_ui).
  - F4 (Hội Chẩn Ban Tổng Thể): Phòng họp bàn tròn xuất tài liệu đồng thuận data/HOI-CHAN-TONG-THE.md từ cả 4 AI.
  - F5 (Cơ Chế Đề Xuất Chuyển Lượt Tự Động 1-Click): Pop-up đề xuất khi xong Vùng, Giám đốc bấm duyệt là tự động cập nhật Vùng [4] và commit chore(agent-sync).
  - F6 (Zero-Leak Personal Accounts): Xác thực độc lập qua CLI từng hãng, dùng gói đăng ký của cá nhân, 100% Localhost.
  - F7 (Native Node.js 24 SQLite): Sử dụng DatabaseSync tiêu chuẩn, 0 thư viện ngoài.
  - F8 (CEO Override & Smooth Room Zoom Navigation): Cơ chế phân việc ngoài lề cho phép Giám đốc chỉ định ngoại lệ (ví dụ cấp quyền code trực tiếp cho 6.1 Sol); kèm thanh điều hướng lướt phòng (Glide Focus), slider thu phóng và thao tác cuộn/di chuột êm dịu.
  - F9 (All-Hands Broadcast & Self-Assignment Dispatch): Phát loa toàn thể nhân viên khi CEO có task chưa biết giao ai; các AI tự động rà soát ai đang rảnh và phù hợp nhất, tự check chéo lẫn nhau rồi báo cáo đề xuất người nhận việc lên CEO duyệt 1-click.
  - F10 (Active Tasks Monitor & Emergency Kill Switch): Bảng nhắc nhở thời gian thực danh sách task/subagent đang chạy ngầm kèm thời lượng; cảnh báo task chạy quá lâu và cung cấp nút dừng từng task hoặc dừng tất cả để CEO kiểm soát tài nguyên máy tính.
  - F11 (App trên máy, Phase 7): Bấm biểu tượng "Văn phòng AI" trên Desktop/Start Menu là tự bật văn phòng + OS Controller chạy ngầm và mở cửa sổ app riêng (Edge/Chrome chế độ app); cài được dạng PWA; tùy chọn tự bật khi đăng nhập Windows; văn phòng tắt thì app hiện trang hướng dẫn. Không thư viện ngoài, không lưu đệm dữ liệu.
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
> Bản do CLAUDE_AUDITOR soạn (ĐC-03), cập nhật 02/11/2026 theo toàn quyền CEO (ĐC-11): chuyển sang chu trình tự hành cho mọi repo. Sol phản biện bằng cách ghi đề xuất vào [4.1], không sửa thẳng mục này.
- Phạm vi điều khiển máy: **Kiến trúc B — tự hành có ngắt mạch** (CEO quyết 02/11/2026, thay Kiến trúc A): AI tự chuyển lượt cho nhau, CEO chỉ theo dõi và phanh khi cần. Lệnh theo danh sách cho phép, lệnh ngoài danh sách phải CEO duyệt; đọc/ghi file chỉ trong workspace đã đăng ký. Vẫn KHÔNG có shell tự do, KHÔNG truy cập từ Internet, AI KHÔNG tự push/merge/release.
- Cây thư mục:
  - `server.js` + `lib/`: văn phòng 3D, chỉ đọc nhật ký + sổ `data/` (giữ nguyên). `lib/guard.js` chặn ghi từ trang lạ, `lib/proc.js` dừng cây tiến trình, `lib/keys.js` khóa API ngoài thư mục mã. `lib/mask.js` che khóa trong log + lọc biến môi trường cho tiến trình con.
  - `ctl/`: OS Controller, **tiến trình riêng**, cổng 7790, chỉ nghe 127.0.0.1. `ctl/main.js` (HTTP + SSE), `ctl/jobs.js` (sổ tiến trình, kill), `ctl/policy.js` (danh sách lệnh, giới hạn workspace), `ctl/runner.js` (gọi CLI AI, chu trình tự hành), `ctl/handoff.js` (khóa lượt, JSON bàn giao), `ctl/workspaces.js` + `ctl/agent-template.md` (đăng ký repo, tự sinh agent.md v2.2), `ctl/files.js` (đọc/ghi file), `ctl/audit.js` (nhật ký kiểm toán), `ctl/monitor.js` (CPU/RAM). Cấu hình theo máy: `~/.van-phong-ao/ctl-agents.json` (lệnh CLI từng vai), `ctl-settings.json` (tự hành).
  - `test/*.test.js`: `node --test`, chạy bằng `npm test`; bắt buộc xanh trước mỗi commit.
- Bảo mật `ctl/`: mỗi lần khởi động sinh token 32 byte ngẫu nhiên, ghi vào `~/.van-phong-ao/ctl-token` (quyền 600); mọi yêu cầu cần header `Authorization: Bearer <token>` + `lib/guard.checkWrite`. `server.js` đọc token đó và làm cầu nối cho giao diện; token không bao giờ xuống trình duyệt. Tiến trình con nhận biến môi trường đã lọc (bỏ `*_KEY`, `*_TOKEN`, `*SECRET*`), log đi qua `mask()`.
- Schema DB (`node:sqlite`, file `~/.van-phong-ao/ctl.db`, WAL):
  - `jobs(id TEXT PK, kind TEXT CHECK(kind IN('cmd','ai')), agent TEXT, workspace TEXT, argv TEXT/*JSON*/, pid INTEGER, status TEXT CHECK(status IN('pending_approval','rejected','running','done','failed','killed','timeout')), exit_code INTEGER, started_at INTEGER, ended_at INTEGER, timeout_ms INTEGER, log_path TEXT)`
    - `INDEX jobs_status(status)`: bảng giám sát và Kill-All chỉ lấy `running`/`pending_approval` mỗi 1s.
    - `INDEX jobs_agent_started(agent, started_at DESC)`: xem lịch sử theo từng AI, giới hạn chạy cùng lúc theo AI.
  - `audit(id INTEGER PK AUTOINCREMENT, at INTEGER, actor TEXT, action TEXT, target TEXT, detail TEXT /*đã mask*/, decision TEXT)`: chỉ INSERT, không UPDATE/DELETE. `INDEX audit_at(at)`: xem theo thời gian, dọn bản ghi > 90 ngày.
  - `handoffs(job_id TEXT PK, workspace, role, next_owner, payload /*JSON bàn giao*/, problems /*JSON lỗi schema*/, decided CHECK IN('approved','rejected'), decided_at)`. `INDEX handoffs_open(decided)`: bảng "chờ duyệt chuyển lượt" chỉ lấy bản chưa quyết.
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
  - `GET /workspaces`, `POST /workspaces {path}` (chỉ CEO) → `201 {workspace:{path,name,active,agentMd:{created,stack}}}` (repo chưa có agent.md thì tạo từ mẫu v2.2, lượt đầu CLAUDE_AUDITOR, không ghi đè bản có sẵn), `POST /workspaces/remove {path}`, `POST /workspaces/switch {path}` → `{active}`. `GET /fs/list?workspace&path` → `{path, items:[{name, dir, link, size}]}`.
  - Lượt AI: `GET /ai/status?workspace` → `{turn:{phase,lastUpdatedBy,nextOwner}, aiBusy, runnable, handoffPending}`; `POST /ai/run {workspace, role, task}` → `201 {job}`; `409 NOT_YOUR_TURN | AI_BUSY | HANDOFF_PENDING`, `422 NO_CLI`. `GET /handoffs`; `POST /handoffs/:jobId/approve` → `{handoff, commit}`, `422 INVALID_HANDOFF`, `409 TURN_CHANGED | DECIDED`; `POST /handoffs/:jobId/reject`. `POST /handoffs/:jobId/answer {option}` → `{handoff:{…, option, next, decision}}` (CEO trả lời câu hỏi của Claude khi chạy tay), `422 NO_QUESTION`, `400 BAD_OPTION`; duyệt thẳng bàn giao có câu hỏi → `409 NEEDS_ANSWER`.
  - Luồng tự động (`ctl/autopilot.js`): `GET /autopilot`, `GET /autopilot/:id`, `POST /autopilot {workspace, task≤3000, maxSteps 1..12 (mặc định 10), timeoutMs≤120 phút}` → `201 {run}`, `409 AI_BUSY`; `POST /autopilot/:id/stop`, `/approve`, `/reject` (duyệt/từ chối báo cáo cuối của Claude), `/answer {option}` (trả lời câu hỏi của Claude, luồng chạy tiếp) → `{run}`, `409 NOT_PENDING`. Trạng thái luồng: running → reporting → awaiting_approval | awaiting_answer | attention | approved | acknowledged | rejected | stopped; lưu ở `~/.van-phong-ao/autopilot/*.json`, ctl khởi động lại thì luồng dở → attention (không tự chạy lại).
  - GitHub (`ctl/github.js`): `GET /github/repos?page`, `POST /github/open {fullName}` → `202 {operation}`, `GET /github/operations/:id` (clone có timeout, Kill-All dừng được; credential chỉ trong bộ nhớ ctl qua Git Credential Manager). Hạn mức AI (`ctl/quotas.js`): `GET /quotas`, `POST /quotas/refresh` → `202`.
  - `GET /audit?limit`. Cầu nối giao diện: `server.js` chuyển `/ctl/*` → ctl, chỉ khi trình duyệt ở chính máy (403 `REMOTE_DENIED`), ctl tắt → 503 `CTL_OFFLINE`.
  - Danh sách lệnh cho phép (mặc định, `ctl/policy.js`): `git status/diff/log/show/fetch/add/commit/stash/switch/branch…` và `pull --ff-only` (mọi `push`, `reset --hard`, `clean`, `checkout --`, `-C`, `--git-dir`, `--output` → chờ duyệt), `npm test/ci/run <script>`, `node --test`, `node`/`python <script trong workspace>`, `python -m pytest|unittest`, `pytest`, `cargo`/`go test|build|check|vet|fmt`, `gh … list/view/status`. Shell (cmd, PowerShell, bash…), `python` không đối số, `python -c/-i` → `403 COMMAND_DENIED`. Script ngoài workspace, module/cờ lạ, `node -e` → `pending_approval`. Chạy không qua shell; `.cmd` (npm, CLI cài bằng npm) được đổi thành `node <file.js>`; python bản Microsoft Store (App Execution Alias) chạy thẳng.
- Luồng AI Agent (`ctl/runner.js`): mỗi lượt là 1 job `kind:'ai'`, tối đa 1 job AI cùng lúc mỗi workspace (khớp Mutex `NEXT_OWNER`).
  - Claude (CLAUDE_AUDITOR): `claude -p <prompt> --output-format json --max-turns 30`; prompt chính: "Đọc ./agent.md, thẩm định diff từ LAST_AUDITED_COMMIT theo /tester, chỉ ghi Vùng [5]". Timeout 20 phút.
  - Codex Astra (CODEX_ASTRA_DEV) và Sol (SOL_*): `codex exec --json <prompt>` (vai Sol/Astra khác nhau ở prompt + vùng được ghi). Timeout 30 phút.
  - Antigravity (SPEC_ARCHITECT): `agy --print <prompt> --output-format json --mode accept-edits --sandbox` (đã kiểm 02/11/2026: headless tự chặn lệnh terminal, chỉ mở git chỉ đọc). Timeout 20 phút. Máy CEO: agy.exe nằm trong thư mục ảo của gói Codex nên đặt đường dẫn tuyệt đối ở `ctl-agents.json`. Pain Thiên Đạo = `ctl/monitor.js`, không phải AI.
  - Đầu ra bắt buộc: AI kết thúc bằng 1 dòng JSON `{"role", "next_owner", "files":[], "claim_fixed":[], "done"?:boolean}`; runner kiểm tra bằng hàm kiểm schema tự viết (không thư viện ngoài). Sai schema → không chuyển lượt, chờ CEO.
  - Retry: tối đa 1 lần khi CLI thoát vì lỗi mạng/giới hạn tốc độ (chờ 60s); lỗi khác dừng và báo CEO.
  - Chu trình tự động hoàn toàn — **một bộ máy duy nhất `ctl/autopilot.js`** (CEO giao việc ở trang "Claude báo cáo & tự động", `prototype.html#board`; áp dụng mọi repo đã đăng ký): bàn giao hợp lệ → ctl tự duyệt (ghi agent.md + commit `chore(agent-sync)`) → chạy vai theo NEXT_OWNER; Claude bàn giao ra khỏi Codex hoặc báo `"done":true` → báo cáo cuối chờ CEO duyệt. **Ngắt mạch** (dừng, CLAUDE_REPORTER tóm tắt cho CEO): lượt lỗi/timeout/bị Phanh khẩn cấp; bàn giao sai; hết `maxSteps` lượt hoặc thời gian; Claude trả về Codex quá 2 lần; xung đột git; log có chuỗi hình dạng khóa API. Chạy tay từng lượt trên trang Điều khiển vẫn dùng được.
  - Quyền đội trưởng (CEO giao 02/11/2026): CLAUDE_AUDITOR kiểm soát tổng mọi repo, được phản biện Antigravity/Sol/Codex. Muốn bắt sửa hoặc đổi hướng thì bàn giao kèm `"ask_ceo":{question, options:[{id, label, next_owner?, task?}] (2–4)}` (chỉ CLAUDE_AUDITOR); luồng chuyển `awaiting_answer`, câu hỏi + nút phương án hiện ở phần theo dõi (bảng tự động và trang Điều khiển); CEO chọn → lượt sang `next_owner` của phương án, quyết định được ghi vào luồng và kèm trong lệnh các lượt sau, commit `chore(agent-sync): … — CEO chọn X`, lượt và thời gian tính lại từ lúc CEO quyết.
  - Ước tính chi phí mỗi lượt: 30–150 nghìn token, 3–20 phút (cần đo thật ở Phase 5). Chạy bằng gói thuê bao cá nhân (OAuth sẵn có), không dùng API key nếu không cần.
- Lộ trình Phase (mỗi Phase có điều kiện nghiệm thu đo được):
  - [x] Phase 1: Đặc tả Sản phẩm & Thiết kế UI/UX (Antigravity).
  - [x] Phase 2 (Claude đã làm, PR #1): Vá lỗi nền tảng + chốt kiến trúc. Nghiệm thu: `npm test` xanh; POST từ Origin lạ / text/plain / Host lạ → 403; không còn dữ liệu giả, email cứng.
  - [x] Phase 3 (Claude đã làm, PR #2): `ctl/` lõi: sổ tiến trình, Kill-Switch, giám sát CPU/RAM, nhật ký kiểm toán. Nghiệm thu: dừng cây 3 tiến trình < 2s trên Windows; job quá timeout tự `timeout`; thiếu token → 401.
  - [x] Phase 4 (Claude đã làm, PR #3): Workspace + đọc/ghi file + lệnh theo danh sách cho phép + duyệt từng lệnh. Nghiệm thu: test `..\..\Windows`, symlink ra ngoài, `git push --force` đều bị chặn hoặc chờ duyệt.
  - [x] Phase 5 (Claude đã làm, PR #3; đã chạy thật trên Windows: f91a6cf): Runner AI + nút chuyển lượt trên giao diện 3D. Nghiệm thu: 1 vòng thật Sol → Astra → Claude trên một repo thử, log đã mask, đo token/độ trễ thật ghi vào [4.1].
  - [x] Phase 6 (Claude đã soát trên Linux + Windows, PR #3): Thẩm định bảo mật tổng & đưa vào dùng hằng ngày.
  - [ ] Phase 7: Vận hành hằng ngày. F11 app trên máy: `public/manifest.webmanifest` + `sw.js` (chỉ giữ `offline.html`) + `app.js` (đăng ký SW, nút Cài app); `lib/app.js` + `scripts/mo-app.js` (bật ngầm, PID ở `~/.van-phong-ao/app.pid`, mở `--app=`), `tat-app.js`, `cai-app.js` (lối tắt qua WScript.Shell, đường dẫn truyền bằng biến môi trường). Nghiệm thu: Chromium báo 0 lỗi cài đặt (cả khi bật khóa xem); bật/tắt không để tiến trình mồ côi; văn phòng tắt hiện trang hướng dẫn rồi tự mở lại. Việc mới đi theo vòng Spec [2] → Sol [3] → Astra → Claude nghiệm thu, chạy tự hành qua OS Controller; CEO giao việc, theo dõi, trả lời câu hỏi của Claude, phanh khi cần.

## [4] KHÓA LƯỢT & NHẬT KÝ
- CURRENT_PHASE: Phase 7 - Vận hành hằng ngày
- LAST_UPDATED_BY: CLAUDE_AUDITOR
- NEXT_OWNER (MUTEX LOCK): SPEC_ARCHITECT

### [4.1] NHẬT KÝ PHASE HIỆN TẠI (tối đa 25 dòng)
- (Nén) ĐC-06/ĐC-07 (01/11/2026): Claude đóng Phase 2–6, sửa P2-M09 (đội hình nhân vật) và P7-M01 (characters.html màn hẹp) thay Astra/Spec, đã RESOLVED ở [5] (PR #4, #5).
- Đặc cách ĐC-08 (CEO, 02/11/2026): Claude sửa Thần La Thiên Chinh của Pain thành vòng sóng, bỏ đĩa xám phủ bệ (PR #6). ĐC-09: bỏ 2 quả cầu Song Sư Quyền ở tay Hinata trên characters.html + văn phòng 3D (PR #7).
- Chu trình tự hành (CEO quyết 02/11/2026, PR #9): autoDispatch có ngắt mạch, tự sinh agent.md khi nạp repo, mở khóa Python/pytest/cargo/go; 63 test Windows. Bản đặc tả YEU-CAU-SUA-LOI-CLAUDE.md có 3 chỗ sai đã sửa khi làm (không ngắt mạch thật, mẫu agent.md ghi sai LAST_UPDATED_BY, cun-zoom thêm .cpp vào TEXT_SUFFIXES làm lệch CI Linux).
- Đặc cách ĐC-11 (CEO, 02/11/2026: "toàn quyền, chu trình tự động hoàn toàn"): Claude cập nhật Vùng [3] sang Kiến trúc B, cho SPEC_ARCHITECT chạy nền qua agy, sửa đường dẫn agy trong ctl-agents.json máy CEO, đặt git identity toàn cục, sửa CRLF cun-zoom trên máy (.git/info/attributes, không đổi repo; check xanh 82 file).
- CEO giao (02/11/2026): Claude kiểm soát tổng mọi repo dự án, phản biện AI khác, bắt sửa sau khi hỏi CEO qua phần theo dõi chu trình → thêm ask_ceo + POST /handoffs/:id/answer + nút phương án trên dieukhien.html; 65 test Windows.
- Đặc cách ĐC-10 (CEO, 02/11/2026; commit message ghi nhầm ĐC-09, trùng số với PR #7 Hinata: "làm luôn đi, nghiệm thu bình thường, phát triển thành app"): Claude làm thay SPEC (F11 ở [2.1]) và ASTRA (code) trên nhánh claude/app-cai-dat. Chọn PWA + bộ khởi chạy thay Electron vì CLAUDE.md cấm thư viện ngoài.
- CLAIM: F11 -> claude/app-cai-dat (npm test 63/63 Linux; Chromium: 0 lỗi cài đặt có/không khóa xem, 14 trang 0 lỗi console, bật/tắt sạch, trang hướng dẫn tự mở lại). CHƯA chạy trên Windows: lối tắt .lnk, cửa sổ Edge --app, tự khởi động.
- CLAIM_FIXED: P7-H02, P7-M03, P7-M04 -> claude/app-cai-dat (lib/app.isAppProcess + officeHost, scripts/tat-app.js, scripts/mo-app.js, README; test fail khi bỏ bản sửa P7-H02; npm test 66/66).

- FORCE_OVERRIDE (CEO, 02/11/2026): cho CODEX_ASTRA_DEV sửa lỗi và tiếp tục kiểm thử Windows của F11; cài tại worktree VanPhongAI-app, giữ nguyên main.
- CLAIM_FIXED: WIN-APP-01, WIN-APP-02 -> codex/windows-app-verification (lib/app.js: đường dẫn Linux độc lập hệ điều hành chạy test; scripts/cai-app.js: lưu lối tắt tạm tên ASCII rồi đổi tên Unicode; test/app.test.js: PATH Linux nhiều thư mục).
- Kiểm Windows thật: npm test 66/66; Desktop + Start Menu mở Edge --app; lối tắt Startup --nen bật văn phòng và ctl, không mở cửa sổ; tat-app dừng đúng cha/con, xóa app.pid, giữ nguyên văn phòng cũ trên 7788; PID cũ thuộc tiến trình khác không bị dừng (test). Bản app dùng 7789 vì 7788 đã bận; ctl 7790 health 200. Chưa đăng xuất/khởi động lại Windows; đã kiểm lối tắt Startup và không có mục StartupApproved vô hiệu hóa.

- CEO cho phép tiếp tục FORCE_OVERRIDE (02/11/2026): sửa giao diện từ ảnh lỗi prototype.html; pull rõ origin/claude/app-cai-dat thành công, đặt tracking cho nhánh local để lần sau pull được.
- CLAIM_FIXED: UI-OVERVIEW -> 76da487 (public/prototype.html, prototype.css, prototype.js, index.html): bỏ repo/Phase/trạng thái và chuyển lượt giả; đọc workspace, lượt, Vùng [5], bàn giao, việc, nhật ký và tài khoản thật qua API hiện có; thanh đầu tự xuống hàng, 5 không gian dùng được, không hỏi GitHub token. Đã chọn repo văn phòng thật trong Controller, giữ workspace thử.
- Kiểm UI: Edge thật tại 1920/1440/1280/1024/768/390px không tràn ngang/chồng thanh đầu, 0 lỗi JavaScript; đổi dự án rồi trả về repo chính, highlight đúng lượt, bàn giao rỗng, Gemini chưa xác minh, mất/kết nối lại ctl, bàn giao giả lập HTTP 409 không báo thành công giả. npm test 66/66; đã tải lại cửa sổ app Windows của CEO. Chưa push; NEXT_OWNER giữ CLAUDE_AUDITOR để thẩm định.

- Chỉ thị CEO (02/11/2026): "Cài hết cli của codex kèm antigravity với claude ... văn phòng chạy tự động ... chỉ ... nghe claude báo cáo và duyệt". Theo ủy quyền phiên này, luồng nhận việc có thể tự duyệt bàn giao nội bộ; báo cáo cuối Claude vẫn chờ CEO, không push/merge/release. Chênh lệch với yêu cầu duyệt từng lượt ở [3] được ghi tại đây để Sol/Claude cập nhật theo đúng vai; Astra không sửa [3], [5].
- File/luồng đã đổi -> 6478b62: ctl/autopilot.js + main.js (API luồng, trạng thái ngoài repo, giới hạn lượt/thời gian, dừng, duyệt báo cáo); runner.js (agy cho SPEC, Codex automatic review, Claude reporter chỉ đọc); prototype.html/css/js và dieukhien.html (giao việc + báo cáo); mo-app.js (trang mở app), README và test/autopilot.test.js. CLI và cấu hình cục bộ ngoài repo: Codex 0.163.0, Claude 2.1.309, agy 1.4.12; cả ba gọi mô hình thành công, giữ đăng nhập hiện có.
- Đã xác minh: npm test 73/73; Edge 6 độ rộng 390–1920px, 0 lỗi JS, giao việc/duyệt báo cáo/nhận lỗi qua test UI. CLI thật trong repo thử riêng: Antigravity ghi đặc tả và bàn giao Sol; Codex sửa sum.js và test xanh qua automatic review. Chưa nghiệm thu trọn vòng CLI thật: Claude Pro báo usage_limit_reached, đặt lại 02:50 Asia/Bangkok. Luồng dừng attention, không tự báo hoàn tất. Chưa push; NEXT_OWNER giữ CLAUDE_AUDITOR.

- Chỉ thị CEO (02/11/2026): kết nối trực tiếp GitHub để chọn repo làm việc; tiếp tục phát triển app trong phiên FORCE_OVERRIDE đã cấp. File/luồng -> e5fc5e3: ctl/github.js, ctl/main.js (Git Credential Manager phía máy chủ, API danh sách/mở repo + job clone có timeout/Kill-All); prototype.html/css/js (tìm/chọn repo, trạng thái tải/lỗi/rỗng); README và test/github.test.js. Không sửa [3], [5], không lưu credential vào repo/trình duyệt.
- Kiểm GitHub: npm test 83/83; tài khoản Git hiện có khớp connector GitHub, liệt kê 10 repo (7 riêng tư); clone thật Auto-Browser trong thư mục thử riêng, mở lại không clone trùng; bản sao có sẵn giữ nhánh/file chưa commit, dự án đã chọn lưu qua restart. Edge thật 390–1920px không tràn ngang, 0 lỗi JS, thử tìm kiếm/rỗng/auth hết hạn; cửa sổ app đã mở danh sách repo thật cho CEO. Repo thiếu agent.md được báo rõ và khóa giao việc tự động, không tự khởi tạo hay ghi đè hướng dẫn. Chưa push; NEXT_OWNER giữ CLAUDE_AUDITOR.

- Chỉ thị CEO (02/11/2026): bổ sung theo dõi hạn mức từng AI. File/luồng -> ba60392: ctl/quotas.js + main.js (API cache bất đồng bộ, độc lập từng hãng, timeout/dừng cây tiến trình đọc); prototype.html/css/js (hạn mức còn/đã dùng, reset, cảnh báo 80%/95%, số liệu cũ/thiếu); README và test/quotas.test.js. Nguồn thật: Codex app-server account/rateLimits/read; Claude và agy /usage JSON, xác minh num_turns=0, không gọi mô hình, không đọc/chép credential trong bộ theo dõi.
- Kiểm hạn mức: npm test 91/91; CLI thật trả 2 cửa sổ Codex, 2 Claude, 4 Antigravity; reset Claude đổi múi giờ đúng (02:49 Asia/Bangkok trong bản đọc), không gộp Claude/GPT bên Antigravity vào gói Claude/Codex. Edge 390–1920px không tràn ngang, 0 lỗi JS, thử dữ liệu cũ/thiếu/reset đã qua không suy đoán phục hồi; theo dõi không gửi yêu cầu AI. App Windows đã tải lại và mở tab hạn mức. Không mua thêm lượt/không dùng reset credit, không push; NEXT_OWNER giữ CLAUDE_AUDITOR.
- CEO quyết (02/11/2026: "Claude gộp hết"): CLAUDE_AUDITOR gộp PR #8 + nhánh Codex (codex/windows-app-verification, 10 commit) + nhánh Claude (agy, ask_ceo) trên claude/gop-tat-ca. Hai bộ máy tự hành chồng nhau → giữ ctl/autopilot.js (Codex: lưu đĩa, báo cáo cuối, giới hạn thời gian) làm bộ máy duy nhất, chuyển vào đó các ngắt mạch của Claude (lộ khóa, xung đột git, Codex sửa quá 2 lần, done) và awaiting_answer/ask_ceo; bỏ autoDispatch cấp runner + /settings. Ghi chú dòng trên "repo thiếu agent.md… không tự khởi tạo" không còn đúng: nạp repo nay tự sinh agent.md (PR #9). npm test 100/100 Windows.
- FORCE_OVERRIDE (CEO, 21/11/2026): CLAUDE_AUDITOR và CODEX_ASTRA_DEV (Codex, tài khoản GPT Business 2) làm Thế Quân OS phần OS-1 trên nhánh claude/the-quan-os: Codex viết sổ tin nhắn lâu dài (lib/so-tin-nhan.js, server.js, CLAUDE.md/AGENTS.md), Claude viết giao diện public/os* và duyệt bài Codex trước khi commit. NEXT_OWNER giữ SPEC_ARCHITECT. Ghi nhận hồi tố (CEO xác nhận cùng lệnh): xưởng phim P0–P3 (PR #63–#68) do Claude làm theo lệnh trực tiếp của CEO khi lượt đang thuộc SPEC_ARCHITECT, chưa ghi FORCE_OVERRIDE lúc đó.
- FORCE_OVERRIDE (CEO, 21/11/2026, chọn "Claude dẫn, gọi Codex/Anti từng phần"): OS-2 trên nhánh claude/os-2-hai-xuong — máy tính chỉ OS, điện thoại chỉ 3D; Xưởng code/Xưởng phim tách riêng; học 4 mảng của Javis OS (phòng sạch, replica-recon ở D:\VanPhongAI\os-2\replica). Codex gpt-6.2-sol high tài khoản 1: ctl/bo-nao.js, ctl/lich-chay.js, main.js; tài khoản 2: ctl/quyen.js, runner.js (3 mức quyền theo vai); Claude: public/os*, duyệt, nối API. Skill replica (Jakeschincariol/replica-skill@77c9436) vào nhóm B. NEXT_OWNER giữ SPEC_ARCHITECT.
- FORCE_OVERRIDE (CEO, 22/11/2026): CLAUDE_AUDITOR làm OS-3 trên nhánh claude/os-3-tai-cho (chồng lên OS-2 #71) — "xem ở đâu, xử lý ngay ở đó": khu gốc Giao việc cho đội + Luồng và bàn giao, ngăn trượt tại chỗ (duyệt/trả lại bàn giao, trả lời Claude, nhật ký lượt đang chạy), thanh bên 11 mục + Công cụ cũ. Chỉ public/os*, test/os.test.js; không đổi ctl. NEXT_OWNER giữ SPEC_ARCHITECT.

### [4.2] LƯU TRỮ PHASE ĐÃ XONG (tối đa 5 dòng, 1 dòng/Phase)
- Phase 1: Hoàn tất đặc tả Vùng [2] và Interactive Prototype Chibi Edition (SPEC_ARCHITECT).
- Phase 2–6: OS Controller (ctl/) + vá bảo mật P2 (CSRF, Kill-Switch thật, dữ liệu giả), PASS vòng 2/3, PR #1–#3, 55 test Linux + Windows (CLAUDE_AUDITOR, đặc cách ĐC-01..05).

## [5] CHỐT CHẶN CLAUDE: KIỂM DUYỆT & BLOCKER (Chỉ CLAUDE_AUDITOR)
- AUDIT_STATUS: PASS (F11 app trên máy + chu trình tự hành; không còn blocker)
- REVIEW_ROUND: 2/3 (phạm vi F11; P2-M09 và P7-M01 mỗi phạm vi 1 vòng)
- LAST_AUDITED_COMMIT: c00a001
- Phản biện kiến trúc & chống over-engineering: CEO quyết chuyển từ Kiến trúc A (CEO duyệt từng lượt) sang Kiến trúc B tự hành (02/11/2026). Rủi ro còn lại đã nêu với CEO: một prompt injection trong README/issue/log có thể kéo chuỗi tối đa `maxSteps` lượt mà không ai xem từng bước. Giới hạn đang giữ: không shell tự do, AI không push/merge/release, mỗi luồng ≤ 12 lượt và ≤ 120 phút, báo cáo cuối luôn chờ CEO duyệt, dừng khi log có chuỗi giống khóa hoặc bàn giao sai, Phanh khẩn cấp dừng cả cây tiến trình, mọi bước có nhật ký kiểm toán.
- Nghiệm thu da30252 (ĐC-06, Claude làm thay rồi tự nghiệm thu, đã báo CEO): nén log đúng luật ([4.1] 3 dòng, [4.2] 2 dòng); tăng Phase hợp lệ (chỉ còn mục MEDIUM). P2-M09: Chromium thật bấm đủ 6 nhẫn giả + 10 vĩ thú × 6 nút trên characters.html, 0 lỗi console; văn phòng 3D 6 nhân vật đúng Vùng [2.3]; nhánh mặt bị xóa trong index.html là mã chết (khóa antigravity/sol/claude đã khớp nhánh hinata/itachi/sakura phía trên); npm test 55/55.
- Blocker (chỉ CLAUDE_AUDITOR đổi [ ] OPEN thành [x] RESOLVED):
  - [x] RESOLVED P2-C01, C03, C04, C05, C06, H02, H07, M08 (chi tiết đã nén: xem commit e4bf8cb và [4.2] Phase 2–6).
  - [x] RESOLVED P2-M09 [MEDIUM - đội hình nhân vật]: characters.html, index.html, agent.md [2.1] F2, docs/SPEC-VUNG-2.md theo Vùng [2.3]; link cũ chuyển sang nhân vật mới (da30252).
  - [x] RESOLVED P7-M01 [MEDIUM - public/characters.html]: bố cục vỡ ở màn hình hẹp (d7847ed, ĐC-07, Claude làm thay rồi tự nghiệm thu). Đã kiểm bằng Chromium: đầu trang 1 hàng từ 1024px, 2 hàng ở 768/390px; không tràn ngang ở 390–1440px; khung 3D khớp khung chứa; 16 nhân vật × 6 nút không lỗi console ở 390 và 1440px; npm test 55/55. Ghi chú: nhãn "Xoay 360°" ẩn dưới 1536px (đè nhãn Meshy ở 1280px).
  - [x] RESOLVED P7-H02 [HIGH - scripts/tat-app.js]: giết nhầm khi PID trong app.pid đã bị dùng lại → chỉ dừng khi dòng lệnh là scripts/chay-tat-ca.js (lib/app.isAppProcess), không thì xóa app.pid. Test fail khi bỏ bản sửa (c00a001). Windows: PowerShell đọc không được thì từ chối dừng (an toàn), chưa chạy thật trên Windows.
  - [x] RESOLVED P7-M03 [MEDIUM - README]: câu chữ đúng với cửa sổ thu nhỏ của bộ khởi chạy (c00a001).
  - [x] RESOLVED P7-M04 [MEDIUM - scripts/mo-app.js]: gọi văn phòng theo host trong config (lib/app.officeHost), đã chạy thật với host 0.0.0.0 (c00a001).
