# YÊU CẦU SỬA LỖI & THÔNG SUỐT CHU TRÌNH TỰ ĐỘNG
> **Người ban hành:** Thế Quân CEO (Chủ Tịch Tối Cao)  
> **Người tiếp nhận & xử lý:** Claude Code (CLAUDE_AUDITOR & MASTER TEAM CAPTAIN)  
> **Người kiểm thử & lập tài liệu:** Antigravity (SPEC_ARCHITECT & UIUX_ARCHITECT)  
> **Mục tiêu:** Khắc phục triệt để các điểm nghẽn kỹ thuật giữa **Văn phòng AI** và repo **Cún Zoom** (`https://github.com/Thequancute215-sys/cun-zoom`) để chu trình tự động vận hành trơn tru trên Windows.

---

## 1. TỔNG QUAN TÌNH TRẠNG KIỂM THỬ THỰC TẾ
Văn phòng AI và OS Controller vừa được người dùng thử nghiệm trực tiếp với repo `cun-zoom` (`C:\Users\oanhb\Downloads\cun-zoom`). Quá trình chạy thử cho thấy chu trình tự động đang bị tắc nghẽn ở **4 nhóm vấn đề kỹ thuật cốt lõi**. 

Claude hãy đọc kỹ các phân tích chi tiết và thực hiện các bản vá mã nguồn theo hướng dẫn dưới đây.

---

## 2. DANH SÁCH CHI TIẾT CÁC LỖI & HƯỚNG DẪN SỬA MÃ (ACTION ITEMS)

### MỤC 1: SỬA LỖI BĂM SHA-256 DO CRLF TRÊN WINDOWS (`cun-zoom`)
- **Tệp bị lỗi:** `cun-zoom/scripts/workflow_map.py` (hoặc bản sao chép tương ứng)
- **Hiện tượng:** Chạy `python scripts/workflow_map.py check` bị văng lỗi:
  ```
  Workflow map is stale; review with Understand Anything and refresh: native/bot.cpp
  Command exited with code 1.
  ```
- **Nguyên nhân gốc rễ:**
  - Tại **dòng 20**: Mảng `TEXT_SUFFIXES` thiếu các phần mở rộng file C/C++:
    ```python
    # CŨ (THIẾU):
    TEXT_SUFFIXES = {'.py', '.mjs', '.js', '.html', '.css', '.md', '.json', '.yml', '.yaml', '.txt', '.svg'}
    ```
  - Tại **dòng 116**: Kiểm tra `if Path(relative).suffix in TEXT_SUFFIXES...: raw = raw.replace(b'\r\n', b'\n')`.
  - Vì thiếu `.cpp`, `.h`, `.hpp`, file `native/bot.cpp` trên Windows bị giữ nguyên `\r\n` (CRLF) khi Git checkout, làm sai lệch mã băm SHA-256 so với snapshot gốc trên Linux (dùng `\n`).
- **Hướng dẫn sửa:**
  Bổ sung `.cpp`, `.h`, `.hpp`, `.c` vào `TEXT_SUFFIXES`:
  ```python
  # MỚI (ĐÃ SỬA):
  TEXT_SUFFIXES = {'.py', '.mjs', '.js', '.html', '.css', '.md', '.json', '.yml', '.yaml', '.txt', '.svg', '.cpp', '.h', '.hpp', '.c'}
  ```

---

### MỤC 2: SỬA LỖI BẤT ĐỒNG BỘ KHI CHẠY `npm test` TRÊN WINDOWS (`ctl/`)
- **Tệp bị lỗi:** `test/ctl.test.js` (dòng 129–136) và `ctl/jobs.js` (dòng 28, 66)
- **Hiện tượng:** Chạy `npm test` bị báo đỏ với lỗi:
  ```
  Error: Test "giới hạn số việc chạy cùng lúc" generated asynchronous activity after the test ended.
  This activity created the error "Error: statement has been finalized"
  ```
- **Nguyên nhân:**
  Trên Windows, lệnh `taskkill` trong `lib/proc.js` dừng tiến trình con bất đồng bộ. Khi test kết thúc, hook `test.after(() => ctl.close())` đã đóng database SQLite (`db.close()`). Lúc này tiến trình con mới thực sự thoát và kích hoạt sự kiện `child.on('exit')` trong `ctl/jobs.js`, cố thực thi `q.finish.run()` trên kết nối DB đã đóng.
- **Hướng dẫn sửa:**
  1. Trong `ctl/jobs.js`, tại hàm xử lý `child.on('exit')` và `child.on('error')`, bọc lệnh cập nhật trong khối kiểm tra hoặc `try/catch` an toàn:
     ```javascript
     child.on("exit", (code) => {
       const why = stopping.get(id); stopping.delete(id);
       try {
         if (db.open && q.finish.run(why || (code === 0 ? "done" : "failed"), code, Date.now(), id).changes) {
           audit.log(agent, why ? "job." + why : "job.exit", id, { code, timeoutMs: why === "timeout" ? timeoutMs : undefined });
         }
       } catch (err) {
         // Tránh crash nếu DB đã đóng trong quá trình shutdown/test cleanup
       }
       clearTimeout(timers.get(id)); timers.delete(id);
     });
     ```
  2. Trong `test/ctl.test.js`, tại test `giới hạn số việc chạy cùng lúc`, thêm một khoảng chờ ngắn sau `killAll`:
     ```javascript
     test("giới hạn số việc chạy cùng lúc", async () => {
       const { MAX_RUNNING } = require("../ctl/jobs");
       const started = [];
       try {
         for (let i = 0; i < MAX_RUNNING; i++) started.push(ctl.jobs.start({ agent: "test", argv: [NODE, "-e", "setInterval(()=>{},1e3)"] }));
         assert.throws(() => ctl.jobs.start({ agent: "test", argv: [NODE, "-v"] }), /đang chạy/);
       } finally { 
         await ctl.jobs.killAll("test");
         await new Promise((r) => setTimeout(r, 200)); // Chờ process Windows thoát hẳn
       }
     });
     ```

---

### MỤC 3: MỞ CỔNG CHẠY VIỆC `POST /jobs` VÀ QUẢN LÝ `POST /workspaces` (PHASE 4)
- **Tệp cần bổ sung:** `ctl/main.js` (và cấu hình `ctl/jobs.js`)
- **Hiện tượng:** Hiện tại `ctl/main.js` mới dừng ở Phase 3 (chỉ có `GET /jobs`, `POST /jobs/:id/kill`, `POST /kill-all`). Khi client hoặc AI muốn chạy một lệnh (ví dụ `python`, `git`, `npm test`) thì nhận về `404 NOT_FOUND`.
- **Yêu cầu triển khai theo Vùng [3] của `agent.md`:**
  1. **Triển khai `POST /jobs`**:
     - Body nhận: `{ kind: 'cmd', workspace, argv: string[], timeoutMs }`.
     - Danh sách lệnh cho phép tự động chạy (Allowlist): `git`, `node`, `npm`, `npx`, `python`, `pytest`.
     - Lệnh cấm tuyệt đối / nguy hiểm: `git push --force`, `git reset --hard`, `git clean -fd`, `rm -rf`, `format`, `del /s /q C:\`.
     - Gọi `jobs.start({ kind, agent, workspace, argv, timeoutMs })` và trả về `201 { ok: true, job }`.
  2. **Triển khai `GET /workspaces` và `POST /workspaces`**:
     - Cho phép đăng ký thư mục làm việc hợp lệ (ví dụ: `C:\Users\oanhb\Downloads\cun-zoom`).
     - Kiểm tra đường dẫn tồn tại trên ổ đĩa và ghi vào bảng `workspaces` trong SQLite.

---

### MỤC 4: NỐI DÂY GIỮA `server.js` (CỔNG 7788) VÀ `ctl/` (CỔNG 7790)
- **Tệp cần tích hợp:** `server.js`
- **Hiện tượng:** `server.js` hiện tại độc lập hoàn toàn, không biết cổng 7790 đang chạy và không đọc file token `~/.van-phong-ao/ctl-token`.
- **Yêu cầu tích hợp:**
  1. Trong `server.js`, viết hàm đọc token nội bộ:
     ```javascript
     function getCtlToken() {
       try {
         return fs.readFileSync(path.join(os.homedir(), ".van-phong-ao", "ctl-token"), "utf8").trim();
       } catch {
         return null;
       }
     }
     ```
  2. Tạo route proxy trong `server.js` chuyển tiếp các thao tác từ UI sang `ctl/`:
     - `GET /api/ctl/monitor` $\longrightarrow$ gọi sang `http://127.0.0.1:7790/monitor`.
     - `POST /api/ctl/kill-all` $\longrightarrow$ gọi sang `http://127.0.0.1:7790/kill-all`.
     - `POST /api/ctl/jobs` $\longrightarrow$ gọi sang `http://127.0.0.1:7790/jobs`.
  3. Đảm bảo token `ctl-token` chỉ nằm ở phía Backend của `server.js`, tuyệt đối không gửi xuống trình duyệt client.

---

### MỤC 5: HỖ TRỢ NẠP DỰ ÁN NGOÀI & CHẾ ĐỘ ĐIỀU PHỐI TỰ ĐỘNG
- **Yêu cầu của Thế Quân CEO:** Cho phép nạp repo bất kỳ (như `cun-zoom`) và để đội ngũ AI làm việc tự động dưới quyền Đội trưởng Claude.
- **Giải pháp:**
  1. **Tự khởi tạo cấu hình nếu repo ngoài chưa có `agent.md`**:
     - Khi người dùng chọn theo dõi một thư mục mới chưa có `agent.md`, tự động sinh file `agent.md` và khung `data/` từ mẫu `mau/` để Văn phòng AI nhận diện được nhịp làm việc.
  2. **Chế độ Autonomous Dispatch (Theo sự cho phép của CEO)**:
     - Cho phép Claude Đội Trưởng sau khi duyệt xong một giai đoạn có thể tự động gọi AI tiếp theo (Sol thiết kế $\rightarrow$ Codex viết code $\rightarrow$ Claude kiểm thử) với giới hạn an toàn: tối đa 5 vòng lặp tự động liên tiếp, tự dừng và báo cáo ngay khi gặp lỗi test hoặc blocker.

---

## 3. THÔNG ĐIỆP BÀN GIAO CHO CLAUDE
Claude hãy tiếp nhận file này, chạy `npm test` để xác nhận lỗi số 2, sau đó tiến hành sửa lần lượt các mục từ 1 đến 4, đảm bảo toàn bộ test chuyển sang màu xanh và hệ thống sẵn sàng kết nối với `cun-zoom`!
