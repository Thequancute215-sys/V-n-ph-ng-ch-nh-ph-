# ĐẶC TẢ KIẾN TRÚC & YÊU CẦU NÂNG CẤP: CHU TRÌNH TỰ ĐỘNG HÓA TOÀN NĂNG ĐA DỰ ÁN
> **Người ban hành:** Thế Quân CEO (Chủ Tịch Tối Cao)  
> **Người tiếp nhận & thi công:** Claude Code (CLAUDE_AUDITOR & MASTER TEAM CAPTAIN)  
> **Kiến trúc sư đặc tả:** Antigravity (SPEC_ARCHITECT & UIUX_ARCHITECT)  
> **Mục tiêu:** Thiết lập **Chu Trình Tự Động Hóa Vĩnh Viễn Cho Mọi Repository (Universal Autonomous Multi-AI Engine)** từ nay về sau. Bất kỳ repository nào (Python, Node.js, C++, Rust, Go...) được nạp vào máy tính đều có thể vận hành tự động dưới sự chỉ đạo của Đội Trưởng Claude.

---

## 1. TẦM NHÌN & CHỈ ĐẠO CỦA THẾ QUÂN CEO

Thế Quân CEO ban hành quyết định nâng cấp toàn diện hệ thống Văn phòng AI:
1. **Không giới hạn ở một repo**: Hệ thống phải hoạt động thông suốt trên **mọi repository** trên máy của CEO mà không yêu cầu cấu hình thủ công phức tạp.
2. **Chu trình tự động hoàn chỉnh (Fully Autonomous Dispatch)**: Khi CEO giao một nhiệm vụ, Đội Trưởng Claude Code có quyền tự động kích hoạt chu trình:
   $$\text{Thế Quân CEO} \xrightarrow{\text{Giao Việc}} \text{Claude (Phân rã)} \xrightarrow{\text{Tự Động}} \text{Sol (Kiến trúc)} \xrightarrow{\text{Tự Động}} \text{Codex (Lập trình)} \xrightarrow{\text{Tự Động}} \text{Claude (Kiểm thử \& Nghiệm thu)}$$
   Hệ thống tự động chuyển giao giữa các AI mà **không bắt buộc CEO phải ngồi canh để bấm nút duyệt từng bước**, ngoại trừ khi gặp lỗi, vượt ngân sách hoặc cần quyết định sống còn.
3. **An toàn & Tự vệ tuyệt đối (Safe Execution Guardrails)**: Tự động hóa nhưng không được phép phá hoại máy tính. Mọi lệnh chạy đều bị giới hạn trong workspace đã đăng ký, có nhật ký kiểm toán bất biến và nút phanh khẩn cấp (Kill-Switch) dừng thật 100%.

---

## 2. CHU TRÌNH TỰ ĐỘNG 5 GIAI ĐOẠN CHO MỌI REPO TỪ NAY VỀ SAU

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                 GIAI ĐOẠN 1: AUTO-WORKSPACE ONBOARDING                  │
  │    Nạp repo bất kỳ -> Tự nhận diện Tech Stack -> Tự sinh agent.md       │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │              GIAI ĐOẠN 2: CONTEXTUAL COMMAND POLICY ENGINE              │
  │    Mở khóa lệnh an toàn theo Stack: Python, Node, C++, Rust, Go...      │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │               GIAI ĐOẠN 3: AUTONOMOUS CHAINING & DISPATCH               │
  │   Vòng lặp tự động đa AI: Claude -> Sol -> Codex -> Claude Test Audit  │
  │   (Tự ngắt mạch Circuit Breaker khi test lỗi hoặc quá 5 lượt)          │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │             GIAI ĐOẠN 4: PROCESS MONITOR & EMERGENCY KILL-SWITCH        │
  │   Theo dõi PID thật, CPU/RAM thời gian thực, 1-click dừng sạch tiến trình│
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │             GIAI ĐOẠN 5: CROSS-PROJECT LEARNING & INHERITANCE           │
  │   Kế thừa sổ bài học BAI-HOC.md; lỗi mới sinh ra "Cái Chặn Tự Động"    │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

### GIAI ĐOẠN 1: TỰ ĐỘNG NẠP WORKSPACE & KHỞI TẠO GIAO THỨC (AUTO-ONBOARDING)
- **Vấn đề đã phát hiện:** Khi nạp repo `cun-zoom`, hệ thống bị treo cứng vì `cun-zoom` chỉ có `AGENTS.md`, hoàn toàn không có `agent.md` chuẩn v2.2.
- **Giải pháp vĩnh viễn cho mọi repo:**
  Khi người dùng đăng ký một workspace mới qua `POST /ctl/workspaces { path }`:
  1. **Nhận diện Tech Stack tự động**:
     - Có `package.json` $\rightarrow$ Node.js / TypeScript.
     - Có `requirements.txt` / `pyproject.toml` $\rightarrow$ Python.
     - Có `Cargo.toml` $\rightarrow$ Rust.
     - Có `go.mod` $\rightarrow$ Go.
     - Có `CMakeLists.txt` / `Makefile` $\rightarrow$ C/C++.
  2. **Tự khởi tạo `agent.md` nếu chưa có**:
     - Nếu trong thư mục chưa có `agent.md`, tự động sao chép mẫu từ `mau/agent-template.md` (hoặc khởi tạo khung 5 vùng chuẩn), điền tên dự án và công nghệ tương ứng.
     - Đặt `CURRENT_PHASE: Phase 1 - Khảo Sát & Lập Kế Hoạch`.
     - Đặt `NEXT_OWNER: CLAUDE_AUDITOR` để Claude tiếp quản ngay tức khắc.
     - Tự động thêm `agent.md` vào `.git/info/exclude` nếu là repo công khai để tránh làm bẩn git của người dùng.
  3. **Hỗ trợ Fallback sang `AGENTS.md`**:
     - Trong `ctl/handoff.js`: Nếu file `agent.md` chưa có nhưng có `AGENTS.md` chứa cấu trúc khóa lượt, runner vẫn đọc được lượt thay vì văng lỗi `NO_AGENT_MD`.

---

### GIAI ĐOẠN 2: CHÍNH SÁCH CHẠY LỆNH LINH HOẠT THEO CÔNG NGHỆ (CONTEXTUAL POLICY)
- **Vấn đề đã phát hiện:** `ctl/policy.js` cấm cứng `python` trong regex `SHELLS` với lý do "trình thông dịch". Điều này khiến mọi dự án Python (như `cun-zoom`) bị liệt hoàn toàn, không thể chạy test hay kiểm tra mã nguồn.
- **Giải pháp vĩnh viễn:**
  Thiết kế lại hàm `classify(argv)` trong `ctl/policy.js` theo nguyên tắc: **Cho phép chạy script nội bộ trong workspace, chỉ chặn shell tương tác tự do.**

| Lệnh & Tham Số | Quyết Định (`decision`) | Lý Do & Ngưỡng Bảo Vệ |
| :--- | :---: | :--- |
| `python scripts/<tệp>.py` | **`allow`** | Chạy script nội bộ trong workspace |
| `python -m pytest [args]` | **`allow`** | Chạy kiểm thử tự động của dự án Python |
| `pytest [args]` | **`allow`** | Bộ công cụ test Python chuẩn |
| `python -c "<mã>"` | **`deny`** | Cấm chạy chuỗi eval inline tùy ý |
| `python` (không tham số) | **`deny`** | Cấm mở interactive REPL shell |
| `npm test`, `npm run <script>` | **`allow`** | Kiểm thử & script nội bộ Node.js |
| `node --test`, `node <tệp>.js` | **`allow`** | Thực thi tệp JavaScript nội bộ |
| `cargo test`, `cargo build` | **`allow`** | Biên dịch & kiểm thử dự án Rust |
| `go test ./...`, `go build` | **`allow`** | Biên dịch & kiểm thử dự án Go |
| `git status, diff, log, commit` | **`allow`** | Các thao tác Git an toàn cục bộ |
| `git push --force`, `clean -fd` | **`approve` / `deny`** | Ngăn chặn hành động phá hủy dữ liệu |

---

### GIAI ĐOẠN 3: VÒNG LẶP TỰ ĐỘNG HÓA ĐA AI (AUTONOMOUS DISPATCH & CHAINING)
- **Vấn đề đã phát hiện:** `ctl/runner.js` cố tình chặn vòng lặp AI tự gọi AI. Sau mỗi bước, hệ thống đứng yên bắt CEO bấm tay duyệt chuyển lượt.
- **Giải pháp vĩnh viễn:**
  Bổ sung cờ cấu hình **`autoDispatch: true`** (Chế độ Đội Trưởng Tự Hành):
  1. Khi Thế Quân CEO bật **"Chế độ Tự Hành"** trên giao diện `dieukhien.html` và bấm giao việc:
  2. **Bước 1 (Claude Captain)**: Phân rã bài toán, giao kiến trúc cho Sol $\rightarrow$ Đặt `next_owner: "SOL_ARCHITECT_PLANNER"`.
  3. **Tự động chuyển tiếp (Auto-Handoff)**:
     - Runner kiểm tra dòng JSON bàn giao hợp lệ (`checkHandoff` rỗng lỗi).
     - Tự động thực thi `setTurn()`, commit Git `chore(agent-sync): CLAUDE -> NEXT: SOL`.
     - Tự động kích hoạt ngay lệnh chạy `codex exec` cho **Sol** mà không cần CEO bấm!
  4. **Bước 2 (Sol)**: Thiết kế DB/API Contract xong $\rightarrow$ Đặt `next_owner: "CODEX_ASTRA_DEV"`.
     - Runner tự động duyệt, tự động kích hoạt **Codex** viết mã nguồn.
  5. **Bước 3 (Codex)**: Viết code xong, chạy `npm test` hoặc `pytest` $\rightarrow$ Đặt `next_owner: "CLAUDE_AUDITOR"`.
     - Runner tự động duyệt, kích hoạt **Claude** thẩm định code và test.
  6. **Bước 4 (Claude Nghiệm Thu)**:
     - Nếu mọi thứ hoàn hảo: Đổi trạng thái sang `RESOLVED`, dừng vòng lặp và gửi báo cáo tổng kết hoàn thành lên Thế Quân CEO.
  7. **HỆ THỐNG PHANH NGẮT MẠCH TỰ ĐỘNG (CIRCUIT BREAKERS)**:
     Vòng lặp tự động **ngay lập tức dừng lại và báo động cho CEO** khi:
     - 🛑 **Test thất bại**: Đã cho Codex sửa thử 2 lần mà `npm test` hoặc `pytest` vẫn đỏ.
     - 🛑 **Quá số lượt an toàn**: Vòng lặp chạy quá **5 lượt AI liên tiếp** (tránh tốn chi phí token và vòng lặp vô tận).
     - 🛑 **Xung đột Git**: Phát hiện file bị merge conflict.
     - 🛑 **Phát hiện rò rỉ secret**: Lệnh hoặc log in ra chuỗi có dạng API key.

---

### GIAI ĐOẠN 4: SỬA LỖI ĐẶC THÙ NỘI TẠI CỦA REPO `CUN-ZOOM` (CRLF BUG)
- **Vị trí lỗi:** `cun-zoom/scripts/workflow_map.py` (dòng 20 & 116).
- **Hiện tượng:** Lệnh kiểm tra quy trình `python scripts/workflow_map.py check` văng mã lỗi 1 trên Windows vì `native/bot.cpp` bị lệch mã băm SHA-256 do Git tự đổi sang `\r\n`.
- **Bản vá dứt điểm:**
  Cập nhật mảng `TEXT_SUFFIXES` trong `cun-zoom/scripts/workflow_map.py`:
  ```python
  # CŨ:
  TEXT_SUFFIXES = {'.py', '.mjs', '.js', '.html', '.css', '.md', '.json', '.yml', '.yaml', '.txt', '.svg'}

  # MỚI (Bổ sung phần mở rộng mã nguồn C/C++):
  TEXT_SUFFIXES = {'.py', '.mjs', '.js', '.html', '.css', '.md', '.json', '.yml', '.yaml', '.txt', '.svg', '.cpp', '.h', '.hpp', '.c', '.cc', '.cxx'}
  ```
  Sau khi sửa dòng này, lệnh `python scripts/workflow_map.py check` sẽ chuyển sang màu xanh trên mọi máy Windows!

---

## 3. MÃ NGUỒN CỤ THỂ HƯỚNG DẪN CLAUDE NÂNG CẤP HỆ THỐNG

Dưới đây là chi tiết các khối mã nguồn Claude cần cập nhật vào repository `Văn phòng AI`:

### File 1: `ctl/policy.js` — Mở khóa lệnh Python & Test đa công nghệ
```javascript
// Sửa regex SHELLS (gỡ bỏ python và py):
const SHELLS = /^(cmd|powershell|pwsh|bash|sh|zsh|fish|wsl|perl|ruby|cscript|wscript|mshta|rundll32|regsvr32|reg|certutil|bitsadmin)(\.exe)?$/i;

// Bổ sung phân loại cho Python trong hàm classify(argv):
if (prog === "python" || prog === "py" || /^python\d+$/.test(prog)) {
  if (!a.length) return { decision: "deny", reason: "python không có đối số (shell tương tác): không chạy qua ctl" };
  if (a.includes("-c") || a.includes("-i")) return { decision: "deny", reason: "python -c / -i (chạy mã eval tự do) bị chặn" };
  if (a[0] === "-m" && a[1] === "pytest") return { decision: "allow", reason: "python -m pytest (kiểm thử)" };
  if (a[0] === "-m" && a[1] === "unittest") return { decision: "allow", reason: "python -m unittest (kiểm thử)" };
  if (a[0] && a[0].endsWith(".py")) return { decision: "allow", reason: "chạy script python nội bộ: " + a[0] };
  return { decision: "approve", reason: "lệnh python ngoài danh sách cần duyệt" };
}

if (prog === "pytest") {
  return { decision: "allow", reason: "pytest (kiểm thử tự động)" };
}
```

---

### File 2: `ctl/workspaces.js` — Tự động Onboarding & Sinh `agent.md`
```javascript
// Trong hàm add(p, actor):
function add(p, actor = "ceo") {
  // ... (giữ nguyên logic realpath và kiểm tra bảo mật thư mục) ...
  
  // TỰ ĐỘNG KHỞI TẠO NẾU THƯ MỤC CHƯA CÓ AGENT.MD
  const agentMdPath = path.join(real, "agent.md");
  if (!fs.existsSync(agentMdPath)) {
    const templatePath = path.join(__dirname, "..", "mau", "DOAN-CHEN-VAO-AGENTS.md");
    let initialSpec = `# AGENT.MD (v2.2) — NGUỒN SỰ THẬT DUY NHẤT & SỔ ĐIỀU PHỐI TỰ ĐỘNG\n\n`;
    initialSpec += `## [1] HIẾN PHÁP DỰ ÁN\n- Dự án: ${path.basename(real)}\n- Điều hành: Claude Code (Đội Trưởng Tối Cao)\n\n`;
    initialSpec += `## [2] ĐẶC TẢ & YÊU CẦU\n- Mục tiêu: Tự động hóa phát triển và kiểm thử theo chỉ đạo của Thế Quân CEO.\n\n`;
    initialSpec += `## [3] KIẾN TRÚC & HỢP ĐỒNG\n- Đang khảo sát bởi SOL_ARCHITECT_PLANNER.\n\n`;
    initialSpec += `## [4] KHÓA LƯỢT & NHẬT KÝ\n- CURRENT_PHASE: Phase 1 - Tiếp Quản & Lập Kế Hoạch\n- LAST_UPDATED_BY: SPEC_ARCHITECT\n- NEXT_OWNER: CLAUDE_AUDITOR\n\n`;
    initialSpec += `## [5] CHỐT CHẶN KIỂM DUYỆT\n- AUDIT_STATUS: PENDING\n- Blocker đang mở:\n  - (Chưa có)\n`;
    fs.writeFileSync(agentMdPath, initialSpec, "utf8");
    audit.log(actor, "workspace.init_agent_md", real);
  }

  q.add.run(real, path.basename(real), Date.now());
  audit.log(actor, "workspace.add", real);
  if (!active) active = real;
  return list().find((w) => same(w.path, real));
}
```

---

### File 3: `ctl/runner.js` — Thêm Chế độ Tự Hành (Auto-Dispatch Engine)
```javascript
// Thêm hàm autoNextTurn để tự động kích hoạt lượt kế tiếp:
async function triggerNextTurnIfAutonomous(workspace, handoffResult) {
  const settingsFile = path.join(dir, "ctl-settings.json");
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")); } catch {}

  if (!settings.autoDispatch) return; // Nếu CEO không bật tự hành thì dừng lại chờ duyệt tay

  const nextOwner = handoffResult.next_owner;
  if (!nextOwner || !AGENTS[nextOwner] || !AGENTS[nextOwner].argv) {
    audit.log("runner", "auto_dispatch.stopped", workspace, { reason: "Vai kế tiếp không có CLI: " + nextOwner });
    return;
  }

  // Tự động kích hoạt lượt tiếp theo:
  try {
    audit.log("runner", "auto_dispatch.start", workspace, { nextOwner });
    run({ workspace, role: nextOwner, task: "Tiếp tục thực hiện theo kế hoạch tại agent.md" }, "auto-dispatcher");
  } catch (err) {
    audit.log("runner", "auto_dispatch.failed", workspace, { error: err.message });
  }
}
```

---

## 4. TIÊU CHÍ NGHIỆM THU HOÀN THÀNH (ACCEPTANCE CRITERIA)

Claude hãy dùng bộ tiêu chí sau để tự nghiệm thu mã nguồn trước khi báo cáo CEO:

1. **Test Suite của Văn phòng AI**: Chạy `npm test` đạt **55/55 test xanh**, không có bất kỳ lỗi rò rỉ bất đồng bộ nào.
2. **Kiểm thử với repo `cun-zoom`**:
   - Chạy lệnh kiểm tra `workflow_map.py check` trong `cun-zoom` thông qua OS Controller API:
     ```
     POST /ctl/jobs { "workspace": "C:/Users/oanhb/Downloads/cun-zoom", "argv": ["python", "scripts/workflow_map.py", "check"] }
     ```
     Kết quả: Trả về **`201 Created`** và hoàn thành với mã thoát **0** (thay vì bị cấm `COMMAND_DENIED` như trước).
3. **Kiểm thử nạp repo mới toanh**:
   - Tạo một thư mục rỗng `test-project` và đăng ký vào `POST /ctl/workspaces`.
   - Hệ thống tự động tạo `agent.md`, tự động gán `NEXT_OWNER: CLAUDE_AUDITOR` mà không cần người dùng tự gõ phím.
4. **Báo cáo hoàn tất**: Claude tóm tắt kết quả sửa đổi trực tiếp lên Thế Quân CEO.
