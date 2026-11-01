# BIÊN BẢN KIỂM THỬ THỰC TẾ & YÊU CẦU SỬA MÃ ĐỂ THÔNG SUỐT CHU TRÌNH TỰ ĐỘNG
> **Người ban hành:** Thế Quân CEO (Chủ Tịch Tối Cao)  
> **Người tiếp nhận & khắc phục:** Claude Code (CLAUDE_AUDITOR & MASTER TEAM CAPTAIN)  
> **Người kiểm định:** Antigravity (SPEC_ARCHITECT & UIUX_ARCHITECT)  
> **Đối tượng kiểm thử:** Repository Cún Zoom (`C:\Users\oanhb\Downloads\cun-zoom` - `https://github.com/Thequancute215-sys/cun-zoom`)  
> **Ngày lập:** 02/11/2026 · Hệ điều hành: Windows 11

---

## 1. TÓM TẮT THỰC NGHIỆM ĐÃ TIẾN HÀNH
Tôi đã đóng vai một người dùng thực tế:
1. Clone repo `https://github.com/Thequancute215-sys/cun-zoom.git` về máy Windows tại `C:\Users\oanhb\Downloads\cun-zoom`.
2. Khởi động hệ thống Văn phòng AI (`node server.js` cổng 7788) và OS Controller (`ctl/main.js` cổng 7790).
3. Đăng ký workspace `cun-zoom` qua API `POST /ctl/workspaces` và chuyển sang `cun-zoom` làm active workspace.
4. Chạy thử các lệnh nghiệp vụ và kích hoạt chu trình AI.

**Kết luận thực nghiệm:** Chu trình tự động bị đứt gãy ngay từ bước đầu tiên bởi **4 điểm nghẽn kỹ thuật chính xác** dưới đây.

---

## 2. BỐN ĐIỂM NGHẼN KỸ THUẬT & HƯỚNG DẪN CLAUDE SỬA MÃ

---

### ĐIỂM NGHẼN 1: `ctl/policy.js` CHẶN CỨNG LỆNH `python` VỚI MÃ `COMMAND_DENIED` (BLOCKER)

- **Thực nghiệm:** Khi gọi API chạy script kiểm tra của `cun-zoom`:
  ```javascript
  POST /ctl/jobs
  { "workspace": "C:/Users/oanhb/Downloads/cun-zoom", "argv": ["python", "scripts/check_source.py"] }
  ```
- **Kết quả trả về:**
  ```json
  {
    "ok": false,
    "code": "COMMAND_DENIED",
    "error": "python là shell/trình thông dịch: không chạy qua ctl"
  }
  ```
- **Nguyên nhân gốc rễ:**
  Trong file `ctl/policy.js`:
  - **Dòng 11**:
    ```javascript
    const SHELLS = /^(cmd|powershell|pwsh|bash|sh|zsh|fish|wsl|python\d*|py|perl|ruby|cscript|wscript|mshta|rundll32|regsvr32|reg|certutil|bitsadmin)(\.exe)?$/i;
    ```
  - **Dòng 38**:
    ```javascript
    if (SHELLS.test(prog)) return { decision: "deny", reason: prog + " là shell/trình thông dịch: không chạy qua ctl" };
    ```
  - **Hậu quả:** `cun-zoom` là một dự án **100% Python**. Vì `policy.js` xếp `python` và `py` vào danh sách cấm tuyệt đối (`decision: "deny"`), OS Controller **từ chối chạy mọi lệnh Python**, bao gồm chạy script nội bộ, chạy `pytest`, build ứng dụng!
- **Hướng dẫn sửa:**
  1. Gỡ `python\d*|py` ra khỏi regex `SHELLS`.
  2. Bổ sung quy tắc chính sách riêng cho `python` trong hàm `classify(argv)`:
     - Nếu chạy file `.py` nằm trong workspace (ví dụ: `python scripts/check_source.py`, `python -m pytest`): Xếp vào diện **`allow`** (chạy ngay) hoặc **`approve`** (nếu ngoài workspace).
     - Chỉ cấm (`deny`) khi có cờ eval tùy ý: `-c`, `-m pty`, `-i` (interactive shell).

---

### ĐIỂM NGHẼN 2: `ctl/runner.js` KHÓA CHẶT VÌ `cun-zoom` CHƯA CÓ `agent.md` (BLOCKER)

- **Thực nghiệm:** Kiểm tra trạng thái AI của workspace `cun-zoom` qua API:
  ```
  GET /ctl/ai/status?workspace=C:/Users/oanhb/Downloads/cun-zoom
  ```
- **Kết quả trả về:**
  ```json
  {
    "ok": true,
    "workspace": "C:\\Users\\oanhb\\Downloads\\cun-zoom",
    "turn": null,
    "problem": "Workspace chưa có agent.md",
    "aiBusy": false,
    "handoffPending": null,
    "runnable": false
  }
  ```
  Trên giao diện `dieukhien.html`: Nút **"Chạy lượt AI" bị mờ (disabled)** hoàn toàn.
- **Nguyên nhân:**
  Trong `ctl/handoff.js` dòng 17:
  ```javascript
  try { txt = fs.readFileSync(path.join(root, "agent.md"), "utf8"); } catch { throw err("NO_AGENT_MD", "Workspace chưa có agent.md"); }
  ```
  `cun-zoom` là repo bên ngoài, hiện chỉ có file `AGENTS.md` (15 dòng quy tắc của Understand Anything), **hoàn toàn không có file `agent.md` chuẩn Protocol v2.2** (thiếu `CURRENT_PHASE`, `LAST_UPDATED_BY`, `NEXT_OWNER`).
- **Hướng dẫn sửa:**
  1. Trong `ctl/workspaces.js` (hoặc `ctl/handoff.js`): Khi người dùng đăng ký một workspace mới chưa có `agent.md`, cho phép có cơ chế tự động khởi tạo file `agent.md` từ khuôn mẫu `mau/agent-template.md` (gán sẵn `NEXT_OWNER: CLAUDE_AUDITOR` để Claude tiếp quản ngay).
  2. Khởi tạo một file `agent.md` chuẩn Protocol v2.2 đặt vào thư mục gốc của `cun-zoom`.

---

### ĐIỂM NGHẼN 3: LỖI BĂM SHA-256 DO CRLF TRÊN WINDOWS TRONG `cun-zoom`

- **Thực nghiệm:** Chạy kiểm tra quy trình nội tại của `cun-zoom`:
  ```powershell
  cd "C:\Users\oanhb\Downloads\cun-zoom"
  python scripts/workflow_map.py check
  ```
- **Kết quả:**
  ```
  Workflow map is stale; review with Understand Anything and refresh: native/bot.cpp
  Command exited with code 1.
  ```
- **Nguyên nhân:**
  Trong `cun-zoom/scripts/workflow_map.py`:
  - **Dòng 20**:
    ```python
    TEXT_SUFFIXES = {'.py', '.mjs', '.js', '.html', '.css', '.md', '.json', '.yml', '.yaml', '.txt', '.svg'}
    ```
  - **Dòng 116**: Chỉ chuẩn hóa `\r\n` thành `\n` cho các tệp có đuôi nằm trong `TEXT_SUFFIXES`.
  - Tệp `native/bot.cpp` có đuôi `.cpp` không nằm trong danh sách, nên khi Git checkout trên Windows chuyển thành `CRLF`, mã băm SHA-256 bị lệch so với snapshot Linux (`ee44f16...` thay vì `f51b1fe...`).
- **Hướng dẫn sửa:**
  Thêm `.cpp`, `.h`, `.hpp`, `.c` vào `TEXT_SUFFIXES` trong `cun-zoom/scripts/workflow_map.py`:
  ```python
  TEXT_SUFFIXES = {'.py', '.mjs', '.js', '.html', '.css', '.md', '.json', '.yml', '.yaml', '.txt', '.svg', '.cpp', '.h', '.hpp', '.c'}
  ```

---

### ĐIỂM NGHẼN 4: THIẾU CƠ CHẾ TỰ ĐỘNG CHUYỂN LƯỢT AI-TO-AI (AUTONOMOUS DISPATCH)

- **Chỉ thị của Thế Quân CEO:** *"Mọi người đều sẽ làm việc tự động dưới quyền đội trưởng"*.
- **Rào cản hiện tại trong mã nguồn:**
  Tại file `ctl/runner.js` (dòng 2–3) và `agent.md` (dòng 97):
  ```
  KHÔNG có AI gọi AI tự động: AI xong thì in dòng JSON bàn giao, CEO bấm "Duyệt chuyển lượt" mới ghi agent.md và commit; lượt kế tiếp lại do CEO bấm chạy.
  ```
  Cơ chế này được Claude thiết kế với mục đích an toàn, nhưng nó biến chu trình thành **"bán tự động ngắt quãng"** — sau mỗi lượt Sol thiết kế hoặc Codex code xong, hệ thống đứng chờ CEO bấm duyệt tay, không tự động chạy tiếp.
- **Hướng dẫn khắc phục:**
  Thêm một tùy chọn cờ **`autoHandoff: true`** (Chế độ Đội Trưởng Tự Hành):
  - Khi một AI kết thúc lượt, in dòng JSON bàn giao hợp lệ (`checkHandoff` không có lỗi) và test cục bộ xanh:
  - Nếu `autoHandoff: true` được bật bởi CEO: Runner tự động duyệt bàn giao, ghi `agent.md`, commit `chore(agent-sync)` và tự động khởi động luôn lượt của AI tiếp theo (`next_owner`).
  - Trang bị cơ chế phanh ngắt tự động (Circuit Breaker): Dừng khẩn cấp và báo chuông cho CEO khi:
    1. Gặp lỗi test hoặc mã lỗi khác 0.
    2. Chạy quá 5 lượt AI liên tiếp.
    3. Handoff sai định dạng schema.

---

## 3. THÔNG ĐIỆP BÀN GIAO CHO CLAUDE ĐỘI TRƯỞNG
Toàn bộ mã nguồn kiểm thử và các commit đã được đồng bộ lên nhánh `main`. Claude hãy đọc tài liệu này và thực hiện các bước:
1. Sửa `ctl/policy.js` để mở quyền cho các lệnh Python hợp lệ của `cun-zoom`.
2. Hỗ trợ tự sinh `agent.md` khi nạp workspace mới.
3. Sửa `TEXT_SUFFIXES` trong `cun-zoom/scripts/workflow_map.py`.
4. Cân nhắc bổ sung cơ chế `autoHandoff` có giới hạn an toàn để đáp ứng chỉ đạo vận hành tự động của Thế Quân CEO.
