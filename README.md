# Văn phòng ảo 3D cho đội AI

Biến các phiên **Claude Code** và **Codex** trên máy bạn thành một công ty AI 3D sống động, kèm đủ bộ sổ điều phối như một đội thật: việc ưu tiên, gói việc, hòm thư, lượt DEV, sổ "Cần anh", nội quy, đội ngũ, bài học, đánh giá nhân sự và tiền AI.

Mỗi phiên là một nhân viên robot có bàn riêng:
- đang làm thì gõ phím, xong việc thì báo cáo;
- phiên này nhắn phiên kia thì robot đi sang bàn người nhận;
- bạn giao việc thì cả nhóm ra phòng họp;
- ai đang giữ môi trường DEV thì đứng giữa Phòng DEV, ai đang chờ thì xếp hàng.

> **Văn phòng chỉ đọc, chạy tại máy bạn.** Văn phòng (`npm start`) chỉ đọc nhật ký mà Claude Code và Codex vốn tự ghi (`~/.claude`, `~/.codex`) và sổ của đội trong thư mục `data/`. Nó không gửi dữ liệu đi đâu và không cần khóa API. Mọi chuỗi giống khóa đều được che trước khi hiện. Kho không dùng thư viện ngoài nào, nên không cần `npm install`.
>
> **Điều khiển máy là phần riêng, phải tự bật.** OS Controller (`npm run ctl`) chạy lệnh, dừng tiến trình, đọc/ghi file và chạy lượt AI, nhưng chỉ trong thư mục dự án bạn đã đăng ký và chỉ từ trình duyệt trên chính máy này. Xem mục [Điều khiển máy](#điều-khiển-máy-os-controller).

---

## Cách nhanh nhất: gửi link này cho agent của bạn

Mở Claude Code hoặc Codex **trong thư mục dự án của bạn** và gõ:

> Cài văn phòng ảo cho dự án này theo hướng dẫn ở https://github.com/vinaichatbot-rgb/van-phong-ao-3d (đọc file HUONG-DAN-CHO-AGENT.md)

Agent sẽ tự làm các bước sau. Những bước có thay đổi bên ngoài thì nó sẽ hỏi bạn trước:

1. Kiểm tra Node.js.
2. Tải mã về.
3. Cài đặt.
4. Chạy và tự kiểm.
5. Hỏi bạn rồi mới dán luật đội vào `AGENTS.md` / `CLAUDE.md`, để mọi phiên AI tự dùng hòm thư, lượt DEV và sổ "Cần anh".
6. Điền sổ cho đúng đội thật.
7. Báo lại link cho bạn.

## Cài tay

Cần **Node.js 18+** (https://nodejs.org), cùng với **Claude Code** hoặc **Codex** đã dùng trên máy.

```bash
git clone https://github.com/vinaichatbot-rgb/van-phong-ao-3d.git
cd van-phong-ao-3d
npm run setup
npm start
```

Mở **http://localhost:7788**.

`npm run setup` hỏi 5 câu:
1. Theo dõi dự án nào: máy tự liệt kê các thư mục đã dùng AI trong 14 ngày, bạn gõ số thứ tự.
2. Tên văn phòng.
3. Bạn muốn được gọi là gì.
4. Có xem trên điện thoại không: trả lời có thì máy tạo khóa xem.
5. Có dán luật đội vào `AGENTS.md` / `CLAUDE.md` không.

Xong, máy ghi `config.json` và tạo sổ `data/` từ khung mẫu `mau/`.

## Dùng như app trên máy

```bash
npm run cai-app                 # Windows: tạo lối tắt "Văn phòng AI" trên Desktop và Start Menu
npm run cai-app -- --tu-khoi-dong   # thêm: tự bật ngầm mỗi khi đăng nhập Windows
npm run app                     # mở app (tự bật văn phòng + OS Controller chạy ngầm nếu chưa chạy)
npm run tat-app                 # tắt văn phòng đã bật bằng app
npm run cai-app -- --go         # gỡ mọi lối tắt
```

- Bấm **Văn phòng AI** trên Desktop: một cửa sổ nhỏ thu gọn hiện vài giây trên thanh tác vụ trong lúc bật, văn phòng + OS Controller chạy ngầm không cửa sổ (log ở `~/.van-phong-ao/logs/app.log`), rồi mở cửa sổ app riêng bằng Edge/Chrome (không thanh địa chỉ). Không có Edge/Chrome thì mở bằng trình duyệt mặc định.
- Hoặc trong văn phòng bấm **⬇ Cài app** (Edge/Chrome): có biểu tượng trên thanh tác vụ, lối tắt nhanh tới Điều khiển máy, Bảng điều hành, Hồ sơ nhân vật.
- Mở app khi văn phòng đang tắt: hiện trang hướng dẫn, tự mở lại khi văn phòng bật. App không lưu đệm dữ liệu văn phòng.
- Không cần cài thêm gì: không Electron, không thư viện ngoài.

### Cập nhật app (không xoá đi tải lại)

Trên thanh chức năng bấm **Cập nhật** (có bản mới thì nút ghi "Cập nhật: có vX.Y.Z"), xem thay đổi rồi bấm **Cập nhật lên vX.Y.Z**. App tự làm:
1. tắt văn phòng;
2. lấy bản mới (chỉ kiểu fast-forward bằng git);
3. bật lại và kiểm bảng điều khiển trả lời đúng phiên bản mới;
4. bản mới không lên được thì tự quay về bản cũ và bật lại.

Tiến độ ở `~/.van-phong-ao/cap-nhat.json`, log ở `~/.van-phong-ao/logs/cap-nhat.log`. Văn phòng tự hỏi GitHub có bản mới 1 phút sau khi bật rồi mỗi 6 giờ; trang Cập nhật có nút kiểm ngay.

- **Dữ liệu giữ nguyên:** sổ `data/`, `config.json`, `~/.van-phong-ao` nằm ngoài git. Sổ `ctl.db` tự nâng cấp khi bản mới mở (`MIGRATIONS` trong `ctl/db.js`: chỉ thêm bước, chỉ thêm bảng/cột, để bản cũ vẫn mở được khi phải quay lại). Khóa mới trong `config.json` luôn có giá trị mặc định ở `lib/config.js`.
- **Từ chối, không ghi đè:** máy có file của app đang sửa, có commit riêng, đang có lượt AI hay việc được giao đang chạy, hoặc văn phòng không bật bằng app (`npm run app`).
- **Chỉ nhận bản đã phát hành:** merge vào main không tự tới máy người dùng. Máy của đội phát triển muốn chạy bản mới nhất của main thì đặt `"updateChannel": "main"` trong `config.json`.

### Phát hành bản mới (chỉ CEO)

1. Đội AI nâng `version` trong `package.json` (ví dụ `1.1.0`) qua PR; CEO merge.
2. CEO tạo tag `v1.1.0` trên main: GitHub → Releases → Draft a new release → tag `v1.1.0`, ghi chú phát hành ở phần mô tả.
3. Workflow **Kiểm bản phát hành** kiểm tag đúng mẫu, khớp `package.json`, nằm trên main và test xanh. Báo đỏ thì xoá tag, sửa, tag lại.
4. Máy người dùng thấy nút "Cập nhật: có v1.1.0" trong vòng 6 giờ (hoặc ngay khi bấm Kiểm tra bản mới).

## Các màn hình

### Giao việc tự động, Claude báo cáo

Mở `prototype.html#board` → chọn dự án đã đăng ký → nhập việc → **Giao cho cả đội**. Bộ điều phối gọi Antigravity CLI (`agy`) cho Hinata (đặc tả) và Kakashi (frontend), Codex cho Sol/Astra và Claude Code để kiểm duyệt. Các CLI dùng tài khoản đã đăng nhập và gọi dịch vụ AI tương ứng.

| Phòng | Vai trong `agent.md` | AI | Việc |
|---|---|---|---|
| Hinata · Đặc tả & Design System | `SPEC_ARCHITECT` | Antigravity | Vùng [2]: đặc tả, luồng người dùng, Design Tokens, Component Tree, 5 trạng thái |
| Itachi · Kiến trúc | `SOL_ARCHITECT_PLANNER` / `_ADVISOR` | Codex (Sol) | Vùng [1], [3]: công nghệ, CSDL, API, chia Phase tách phần Backend và Frontend |
| Sasuke · Lập trình | `CODEX_ASTRA_DEV` | Codex (Astra) | Backend, API, CSDL, AI Agent, hạ tầng |
| Kakashi · Frontend & UI/UX | `FRONTEND_UIUX_DEV` | Antigravity | Code giao diện theo Vùng [2.4]: component, 5 trạng thái, responsive, bàn phím, tương phản |
| Sakura · Kiểm duyệt | `CLAUDE_AUDITOR` | Claude | Vùng [5]: duyệt, blocker; lỗi giao diện trả Kakashi, lỗi backend trả Astra |

Thứ tự thường gặp của một Phase: Hinata → Sol → Claude duyệt kiến trúc → Astra (backend) → Kakashi (giao diện) → Sol đối chiếu → Claude nghiệm thu. Phase chỉ có giao diện thì Claude giao thẳng Kakashi. Kakashi mượn đường dẫn `agy` đã khai cho Hinata trong `ctl-agents.json`, nên không cần cấu hình thêm.

Các bàn giao nội bộ được xử lý tự động trong phạm vi việc bạn vừa giao. Báo cáo cuối của Claude dừng chờ bạn duyệt; duyệt báo cáo không tự push, merge hay phát hành. Mặc định giới hạn 10 lượt và 90 phút. Có nút dừng từng luồng và phanh khẩn cấp. Khi Controller khởi động lại, việc dang dở cần được kiểm tra trước khi giao lại.

Luồng và báo cáo lưu ở `~/.van-phong-ao/autopilot/`, cùng nhật ký kiểm toán của Controller. Nếu CLI thiếu quyền, trả bàn giao sai hoặc hết hạn mức, app hiển thị lỗi và giữ công việc ở trạng thái chưa hoàn tất. **Đã xem lỗi** chỉ đóng thông báo, không xác nhận công việc thành công.

CLI và đường dẫn của từng vai được cấu hình ngoài repo trong `~/.van-phong-ao/ctl-agents.json`. Codex dùng `--approve-for-me` để duyệt các yêu cầu vượt sandbox qua cơ chế automatic review; Antigravity dùng quyền theo từng lệnh. Tài liệu chính thức: [Codex chạy tự động](https://learn.chatgpt.com/docs/non-interactive-mode), [Antigravity headless](https://antigravity.google/docs/cli/headless/), [Claude CLI](https://code.claude.com/docs/en/cli-reference).

Có thể đặt `"appStartPath": "/prototype.html#board"` trong `config.json` để biểu tượng Desktop mở thẳng màn giao việc và báo cáo.

| Màn | Có gì |
|---|---|
| **Văn phòng 3D** | 8 phòng: Giám đốc, Quản lý, Điều phối, Kiểm tra & duyệt, Studio Claude, Phòng DEV, Khu Codex, Phòng họp. Robot đi lại, tin bay giữa bàn, họp tự động. Trên cùng có ô **Cần anh** và **Tiền AI hôm nay**, kèm 3 màn hình lớn trên tường |
| **Bảng điều hành** (màn giữa) | Đang làm / chờ / bị chặn / rảnh. Phòng DEV: ai giữ, bao lâu, dịch vụ khỏe không. Việc ưu tiên, lịch DEV hôm nay, hàng chờ, luồng tin, băng chữ chạy, dải "Cần anh làm", nhịp làm việc 3 giờ |
| **Công việc & tiến độ** (màn trái) | Việc đang áp dụng theo thứ tự, nhật ký quyết định, tiến độ từng gói (mục "Đang dở"), DEV và việc chờ anh |
| **Nội quy & đội ngũ** (màn phải) | Nội quy (mục mới đổi gắn nhãn MỚI), đội ngũ (chấm xanh khi phiên đang có mặt), cấp bậc, sổ tay gồm bài học, việc để sau, từ điển, SPEC |
| **Tổng quan** | Việc gì, để làm gì, ai làm, tới đâu, nghẽn ở đâu (hạn quá thì đỏ). Từng bot đang làm gì, ai "rảnh mà còn việc", ai "im quá 2 giờ" |
| **Hòm thư** | Mỗi vai: số tin chưa xong, chờ quá 1 giờ, đọc lại từ 3 lần mà chưa xong, chưa đọc, tin cũ nhất |
| **Đánh giá nhân sự** | Token theo giờ và ngày, quỹ Codex tuần, xếp loại A/B/C/D theo việc xong, lỗi lệnh, lượt DEV, giờ làm, độ tiết kiệm |
| **Tin nhắn** | Toàn bộ tin 24 giờ, lọc theo người |
| **Sơ đồ 2D** | Bản nhẹ cho điện thoại yếu: mặt bằng, người, tin bay, cảnh báo, dòng thời gian |
| **App trên máy** | Lối tắt Desktop / Start Menu, cửa sổ riêng, tự bật ngầm khi đăng nhập Windows (xem mục "Dùng như app trên máy") |
| **Điều khiển máy** | CPU/RAM trực tiếp, phanh khẩn cấp, workspace, chạy lệnh (chờ duyệt nếu ngoài danh sách), lượt AI theo `agent.md` + duyệt chuyển lượt, sửa file, nhật ký kiểm toán. Chỉ mở được trên chính máy này |
| **Nhắn tin cho agent** | Bấm vào một người trên văn phòng hoặc bảng điều hành, gõ tin. Tin vào hòm thư của người đó; từ xa phải nhập **PIN 6 số**, mã chỉ hiện trên chính máy bạn |

## Điều khiển máy (OS Controller)

```bash
npm run all        # bật cả văn phòng (7788) và OS Controller (7790); Ctrl+C tắt cả hai
npm run ctl        # chỉ bật OS Controller
npm test           # bộ test (chạy trước khi dùng trên máy mới)
```

Mở `http://localhost:7788/dieukhien.html` (hoặc nút **⌘ Điều khiển máy** trên văn phòng 3D).

| Phần | Làm gì | Giới hạn an toàn |
|---|---|---|
| Phanh khẩn cấp | Dừng mọi việc và lượt AI do ctl chạy, kể cả tiến trình con (Windows `taskkill /T /F`) | Nút "Dừng tất cả" trên văn phòng 3D cũng gọi cái này. Tắt ctl thì nó tự dừng mọi việc trước khi thoát |
| Workspace | Đăng ký thư mục dự án, chuyển qua lại | Không đăng ký được cả ổ đĩa, thư mục người dùng, thư mục ẩn (`.ssh`, `.claude`…) |
| Chạy lệnh | `git status`, `npm test`, `git commit`… chạy ngay | Lệnh khác (`git push`, `npm install`, `git reset --hard`, chương trình lạ) **chờ bạn duyệt**. Shell (cmd, PowerShell, bash, python) bị từ chối. Không qua shell nên không chèn lệnh được |
| File | Duyệt thư mục, mở, sửa, lưu | Chỉ trong workspace (chặn `..`, symlink ra ngoài, `.git`). Lưu thì kiểm tra file chưa bị ai sửa từ lúc mở |
| Lượt AI | Chạy AI đang giữ `NEXT_OWNER` trong `agent.md` (Claude: `claude -p`, Sol/Astra: `codex exec`) | Chỉ vai đang giữ lượt, 1 lượt mỗi workspace, có giới hạn thời gian, biến môi trường chứa khóa bị lọc. AI không gọi AI: xong lượt bạn bấm **Duyệt chuyển lượt** thì mới ghi `agent.md` và commit `chore(agent-sync)` (không push) |
| Nhật ký kiểm toán | Mọi lần chạy, duyệt, từ chối, dừng, ghi file | Không sửa hay xóa được (trigger SQLite), tự dọn bản ghi quá 90 ngày |

Dữ liệu của ctl nằm ở `~/.van-phong-ao/` (`ctl.db`, `logs/`, `ctl-token`). Lệnh CLI của từng vai AI đổi được ở `~/.van-phong-ao/ctl-agents.json`, ví dụ `{ "CODEX_ASTRA_DEV": ["codex", "exec", "-m", "<model>", "{prompt}"] }`.

> **Lưu ý thật:** lệnh trong danh sách cho phép như `npm test` vẫn chạy script của chính dự án. Ranh giới của Controller là workspace đã đăng ký, quyền của từng CLI, nhật ký và phanh khẩn cấp. Antigravity có CLI chạy nền `agy`; cài và đăng nhập trước khi giao lượt SPEC tự động.

## Theo dõi hạn mức từng AI

Trong Tổng quan, bấm **Hạn mức AI** hoặc tab **Hạn mức & tài khoản** để xem phần trăm còn lại/đã dùng, hạn mức 5 giờ và 7 ngày, giờ đặt lại theo múi giờ trên máy và lần cập nhật thành công. Cảnh báo hiện trên thanh đầu và màn Điều hành từ 80% đã dùng; thanh chuyển đỏ từ 95%. Các hạn mức thuộc tài khoản, dùng chung giữa các dự án; Sol/Astra dùng chung Codex. Nhóm Claude/GPT bên trong Antigravity là hạn mức Antigravity, tách khỏi Claude Code và Codex.

Nguồn đọc chỉ dùng chức năng trạng thái của CLI đang đăng nhập: Codex `app-server` qua `account/rateLimits/read`; Claude `-p /usage --output-format json --safe-mode`; Antigravity `-p /usage --output-format json`. Đã kiểm trên Codex 0.163.0, Claude 2.1.309 và agy 1.4.12: các lệnh này không gọi mô hình, không mua thêm lượt, không dùng lượt đặt lại hạn mức, không đổi tài khoản. Bộ theo dõi không đọc hoặc chép credential; dữ liệu trả về chỉ gồm hạn mức đã chuẩn hóa, không có nội dung phiên, mã tài khoản hoặc chi tiết plugin.

Khi app đang mở, số liệu tự cập nhật tối đa mỗi 2 phút; nút Cập nhật cũng tuân theo khoảng chờ này. Lỗi một hãng không làm mất số liệu hãng khác; hãng lỗi chờ ít nhất 5 phút rồi thử lại. Bản đọc cũ được ghi rõ, không tự coi là 0% sử dụng hoặc tự cho rằng hạn mức đã phục hồi khi qua giờ reset. CLI thiếu, chưa đăng nhập hoặc thay đổi định dạng sẽ hiện chưa đọc được số liệu. Các tiến trình đọc có timeout 25 giây và được dừng khi tắt app. API cục bộ `GET /ctl/quotas` và `POST /ctl/quotas/refresh` qua cùng cơ chế token/localhost của Controller.

Tham khảo: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude Code /usage](https://code.claude.com/docs/en/interactive-mode), [Antigravity /usage](https://antigravity.google/docs/cli/commands/usage/).

### Hai tài khoản Antigravity (family + Pro)

Antigravity CLI chỉ có **một** chỗ lưu đăng nhập trên máy (Windows Credential Manager `gemini:antigravity`). Đổi thư mục dữ liệu hay HOME vẫn cùng tài khoản, nên văn phòng cất bản sao đăng nhập của từng tài khoản (`van-phong-ao/agy/<id>`) và chép vào chỗ đó khi đổi (`ctl/agy-tai-khoan.js`, `ctl/agy-dang-nhap.ps1`). Token không đi qua Node và không ghi vào file sổ: script PowerShell tự chép và chỉ trả email.

1. Đang đăng nhập tài khoản thứ nhất: mở **Hạn mức**, ở thẻ Antigravity đặt tên (vd. "Family") rồi bấm **Cất**.
2. Mở `agy` trong terminal, gõ `/logout`, đăng nhập tài khoản thứ hai, rồi đặt tên (vd. "Pro") và bấm **Cất**.

Sau đó:
- **Xem song song:** thẻ Antigravity hiện % Gemini còn lại của từng tài khoản. Tài khoản đang dùng đọc theo chu kỳ 2 phút. Tài khoản đang nghỉ đọc 30 phút/lần: đổi sang khoảng 10 giây, đọc `/usage`, rồi đổi về. Cửa sổ đã qua mốc mở lại thì coi như đầy.
- **Tự chuyển** (mặc định bật, ngưỡng 10%): trước lượt Hinata/Kakashi, tài khoản đang dùng còn ≤ ngưỡng thì đổi sang tài khoản kia nếu tài khoản đó còn trên ngưỡng. Cả hai cùng dưới ngưỡng thì giữ nguyên, không đổi qua đổi lại. Lý do đổi ghi vào nhật ký lượt.
- **Đổi tay:** bấm **Dùng tài khoản này**.
- **An toàn:** chỉ đổi khi không có tiến trình `agy.exe` nào chạy, vì đổi giữa chừng thì tiến trình đang chạy có thể ghi đè đăng nhập. Trước khi nạp tài khoản mới, văn phòng cất lại token đang dùng vào đúng chỗ của nó, và sau khi nạp thì kiểm lại email. Ứng dụng Antigravity trên máy có thể dùng chung chỗ lưu đăng nhập này (cần kiểm chứng): đang dùng app mà thấy đổi tài khoản thì đó là lý do.

### Chọn model ngoài chế độ tự động

Ở mục **Hạn mức**, mỗi phòng có hai ô:
- **Model:** danh sách thật đọc từ `agy models` và Codex `model/list` (nhớ 6 giờ; nút **Đọc lại danh sách model**). Claude dùng bí danh opus/sonnet/haiku hoặc mã đầy đủ. Muốn dùng model chưa có trong danh sách thì chọn **Khác…** rồi gõ tên.
- **Mức suy nghĩ:** low…max; một số model Codex có thêm ultra.

Để cả hai trống là tự động. Codex: model chọn cho phòng Itachi/Sasuke thay model mặc định của vai.

## Tiết kiệm token: điều phối model và mục lục từ bản đồ

**Điều phối model & mức suy nghĩ** (`ctl/dieu-phoi.js`, xem và chỉnh ở mục **Hạn mức** của bàn làm việc). Mỗi lượt AI được chấm độ khó:
- **nhẹ:** báo cáo, sửa chữ, màu, tên;
- **vừa:** việc thường;
- **nặng:** lập kiến trúc, bảo mật, hiệu năng, còn blocker CRITICAL, hoặc lượt trước bị trả lại.

Rồi chọn cờ thật của CLI:

| | nhẹ | vừa | nặng |
|---|---|---|---|
| Claude (`--model`, `--effort`) | sonnet · low | sonnet · high | opus · high |
| Codex (`model_reasoning_effort`, model giữ theo vai) | low | medium | xhigh |
| Antigravity (`--model`) | gemini-3.8-flash-low | gemini-3.8-flash-medium | gemini-3.8-flash-high |

- **Hạn mức:** AI còn ≤15% thì hạ một bậc, ≤5% thì về mức nhẹ nhất.
- **Ưu tiên:** mức do đội trưởng Claude đặt cho lượt Codex kế tiếp (`"effort"` trong bàn giao) thắng điều phối tự động.
- **CEO cố định:** cố định được model/mức cho từng phòng, hoặc tắt hẳn chế độ tự động (lưu ở `~/.van-phong-ao/dieu-phoi.json`). Lệnh tự cấu hình trong `ctl-agents.json` đã có `--model`/`-m`/`--effort` thì được giữ nguyên.
- **Ghi lại:** mỗi lượt ghi model, mức và lý do vào nhật ký kiểm toán (`ai.run`) và vào bước của luồng, để sau này đo hiệu suất từng kết hợp.

**Mục lục từ bản đồ** (`ctl/muc-luc.js`). Repo nào có đồ thị Understand Anything (`.ua/knowledge-graph.json`, `.ua/domain-graph.json`) thì trước mỗi lượt, văn phòng tra đồ thị theo việc CEO giao và các blocker OPEN. Nó lấy workflow liên quan (từng bước kèm file:dòng) và tối đa 14 hàm/file, đưa vào prompt (khoảng 1.000 token). Nhờ vậy AI đọc đúng chỗ thay vì dò cả repo. Tóm tắt chỉ là gợi ý: AI phải mở mã kiểm trước khi kết luận. Mã đã đổi sau commit vẽ đồ thị thì prompt ghi rõ số file đã đổi. Repo chưa có đồ thị thì bỏ qua.

**Tra cứu miễn phí bằng Gemini** (`ctl/tra-cuu.js`, `ctl/tra-cuu-mcp.js`, CEO duyệt 16/11/2026). Mở **Tài khoản AI**, dán khóa AI Studio miễn phí (tạo ở aistudio.google.com/apikey). Từ lượt sau, Claude và Codex có thêm MCP `tra-cuu` với hai công cụ:
- `tim_kiem`: tìm bằng Google, trả lời ngắn kèm nguồn;
- `doc_tai_lieu`: đọc một trang công khai và trả lời câu hỏi về nó.

Việc đơn giản (tra lỗi, cách dùng thư viện, changelog) giao cho Gemini thay vì để Claude/Codex tự đọc dài. Khóa nằm trong `keys.json`, chỉ máy chủ MCP đọc và gửi qua header; AI không thấy khóa. Đây là chỗ duy nhất văn phòng gửi nội dung ra ngoài, nên đầu vào bị chặn chặt:
- câu hỏi tối đa 1.500 ký tự và 30 dòng;
- chặn chuỗi giống khóa, token hoặc mật khẩu;
- chỉ đọc link http(s) công khai: không localhost, IP nội bộ, `*.ts.net`, hay link có tài khoản/mật khẩu;
- tối đa 200 lần/ngày cho cả văn phòng;
- model `gemini-flash-latest` hết hạn mức thì chuyển sang `gemini-flash-lite-latest`.

Tắt bằng `~/.van-phong-ao/tra-cuu.json` với nội dung `{"bat": false}`. Antigravity không cần công cụ này (vốn là Gemini, có tìm kiếm Google).

Đo thực tế 11/11/2026: một lượt Codex chỉ trả lời "ok" đã tốn khoảng 23.000 token, gần như toàn bộ là phần khởi động (lời dặn hệ thống + mô tả công cụ MCP). Vì vậy kết nối MCP theo phòng, mục lục và mức suy nghĩ đúng việc là ba chỗ tiết kiệm chính.

## Bộ skill mặc định của đội

Cả đội (Claude, Codex, Antigravity) dùng chung một bộ skill, ghim đúng commit đã được đội trưởng đọc và kiểm an toàn: `ctl/skill-mac-dinh.json`.

```bash
node tools/cai-skill.js        # kiểm: skill nào thiếu, cũ
node tools/cai-skill.js cai    # tải đúng commit đã ghim, chép vào ~/.claude/skills, ~/.codex/skills, ~/.gemini/config/skills
```

- **Nhóm A (bắt buộc):** impeccable, hallmark, ui-ux-pro-max (7 skill), agent-skills của Addy Osmani (25), skills của Matt Pocock (27), chrome-devtools (7), security-audit của Cloudflare, archify, prompt-master, karpathy-guidelines. Mỗi lượt AI tự dùng skill khớp việc của mình.
- **Nhóm B (chỉ khi CEO giao đích danh):** clone-website, bộ strix (kiểm thử xâm nhập app của mình), reverse-engineer-anything.
- **Không cài:** ruflo, goclaw (nền tảng riêng, trùng văn phòng). Chỉ tham khảo: spec-kit, loop-engineering, GhidraMCP.
- Khi máy đã cài, lời giao việc có danh sách skill và dòng bàn giao bắt buộc có `"skill_da_dung"` (rỗng thì kèm `"skill_ly_do"`); thiếu thì lượt đó bị trả lại.
- Cài chỉ chép thư mục skill, không chạy file nào, không cài hook; skill anh tự cài (không có `.vp-skill.json`) không bị ghi đè. Muốn nâng bản: đội trưởng đọc diff giữa hai commit rồi mới sửa danh mục.

## Chọn repo GitHub trong app

Ở trang Tổng quan (`prototype.html`), bấm **Chọn repo GitHub**, tìm repo rồi bấm **Mở repo**. Danh sách lấy trực tiếp từ tài khoản GitHub đã đăng nhập trong Git Credential Manager trên máy, gồm cả repo riêng tư và repo được cộng tác; có tải thêm khi danh sách dài. Không cần nhập token vào văn phòng.

Văn phòng nhận diện bản sao đã đăng ký hoặc nằm ngay dưới `~/Projects` qua remote `origin` (HTTPS/SSH). Bản sao có sẵn được giữ nguyên nhánh và các thay đổi chưa commit. Repo chưa có được clone vào `~/Projects/<chủ-repo>/<tên-repo>` rồi đăng ký và chọn làm dự án; lựa chọn được khôi phục khi bật lại app. Nếu thư mục đích có dữ liệu khác, văn phòng báo lỗi và giữ nguyên dữ liệu. Tác vụ clone có nhật ký, giới hạn 10 phút và dừng được bằng bảng điều khiển máy/Kill-All.

Chọn repo chỉ tải mã về máy, không push, merge hoặc phát hành. Repo chưa có `agent.md` vẫn mở được, nhưng nút giao việc tự động tạm khóa và giao diện báo cần thiết lập sổ đội AI. Văn phòng không tự ghi đè hướng dẫn hoặc tự khởi tạo giao thức trong repo vừa chọn. Nếu đăng nhập hết hạn, đăng nhập lại qua Git Credential Manager rồi tải lại danh sách.

## Sổ điều phối `data/` và công cụ `vp`

Sổ của đội nằm trong `data/`. Thư mục này đã có trong `.gitignore`, mỗi máy một bộ riêng. Agent ghi sổ bằng `node tools/vp.js …`, gõ `node tools/vp.js giup` để xem đủ lệnh:

| Sổ | Lệnh |
|---|---|
| Hòm thư `hop-thu/<vai>.jsonl` | `vp gui --toi "<vai>" "[VIỆC] …"` · `vp tiep --toi "<vai mình>"` (cuối mỗi lượt) · `vp xong <mã>` · `vp ds` |
| Lượt DEV `DEV.lock`, `DEV-LUOT.jsonl` | `vp luot cho \| lay \| nha \| huy \| xem` |
| Cần anh `CAN-ANH.md` | `vp cananh hoi \| xong \| ds` |
| Việc ưu tiên `UU-TIEN.json` | `vp viec ds \| them \| sua \| dung \| xoa` |
| Gói việc `goi/<gói>/viec.json` + `tien-do.md` | `vp goi tao \| muc \| dat \| sua \| ghichu` · `vp tiendo <gói> "…"` |
| Bài học `BAI-HOC.md` | `vp baihoc --the "<thẻ>" "…" --chan "…"` |
| Nội quy, đội ngũ, cấp bậc, việc để sau, từ điển, quyết định, SPEC | sửa tay các file `.md` trong `data/` (khung mẫu ở `mau/`) |

Luật đội để dán vào dự án nằm ở `data/DOAN-CHEN-VAO-AGENTS.md`, đã điền sẵn đường dẫn. Nó dặn mọi phiên AI 4 việc:
- đọc hòm thư cuối mỗi lượt;
- hỏi chủ qua sổ "Cần anh";
- lấy và nhả lượt DEV;
- ghi "Đang dở" trước khi nghỉ.

## Bộ kiểm chu trình agent.md

Máy tự kiểm những luật đo được của giao thức `agent.md`, không trông vào AI tự nhớ:
- đủ các vùng và các dòng `CURRENT_PHASE`, `LAST_UPDATED_BY`, `NEXT_OWNER`, `AUDIT_STATUS`; vai hợp lệ;
- Vùng [4.1] tối đa 25 dòng, [4.2] tối đa 5 dòng;
- blocker ghi đúng `[ ] OPEN <ID>` / `[x] RESOLVED`; không tăng Phase khi còn `[ ] OPEN`;
- mỗi vai chỉ sửa vùng của mình ([2] Hinata, [1] và [3] Sol, [5] Claude; Astra và Kakashi chỉ ghi [4.1]/[4.2]), đúng lượt `NEXT_OWNER`; Claude không tự sửa Phase;
- không có chuỗi trông như khóa API.

Kiểm ở hai nơi:
- **Văn phòng**, sau mỗi lượt AI: lỗi do lượt đó gây ra thì bàn giao bị trả lại đúng vai đó một lần; lần hai vẫn sai thì dừng, báo CEO. Lỗi vốn có sẵn trong agent.md cũ của repo không chặn lượt.
- **GitHub Actions** (`.github/workflows/kiem-tra.yml`), mỗi PR: kiểm agent.md hiện tại, từng commit sửa agent.md trong PR (phải là commit riêng, message `chore(agent-sync): VAI -> NEXT: VAI_TIẾP`), rồi chạy `npm test`. Làm theo FORCE_OVERRIDE thì ghi chữ `FORCE_OVERRIDE` vào message, lỗi về quyền chỉ còn là cảnh báo.

Chạy tay: `node tools/kiem-agent.js` (agent.md ở thư mục đang đứng), `node tools/kiem-agent.js --tu origin/main` (thêm các commit từ chỗ rẽ khỏi main). Bộ kiểm lấy vai từ message commit hoặc từ lượt văn phòng đang chạy, nên nó bắt sơ suất chứ không phải lớp bảo mật.

### Áp cho mọi dự án của đội

- **Mẫu agent.md** (`ctl/agent-template.md`, văn phòng dùng khi nạp repo mới) có thêm hai luật ở Vùng [1]:
  - **[1].6 Clean code có máy kiểm:** mỗi PR qua CI gồm bộ kiểm agent.md, lint và test.
  - **[1].7 Cập nhật không cài lại:** chỉ bản Chủ Dự Án phát hành (tag `vX.Y.Z`) mới tới người dùng; dữ liệu giữ nguyên; migration chỉ thêm; lỗi thì quay về bản cũ.
- Vùng [3] của mẫu có mục để Sol chốt CI và cách cập nhật theo loại app (web, app Node trên máy, Electron/Tauri, điện thoại). Phase 1 phải dựng sẵn CI và khung phát hành.
- **Cài bộ kiểm vào repo dự án:** Văn phòng → **Dự án đang ở đâu** → **Cài bộ kiểm vào repo**. Văn phòng làm các bước sau:
  1. tách nhánh `vp/bo-kiem-chu-trinh-…` từ nhánh chính, trong một worktree tạm (thư mục và nhánh đang làm không bị đụng);
  2. thêm `tools/kiem-agent.js` (bản chép của `lib/kiem-agent.js`, tự chạy được) và `.github/workflows/kiem-chu-trinh.yml`;
  3. đẩy nhánh lên GitHub và mở trang tạo PR để anh merge.

  Workflow kiểm agent.md (repo công khai giữ agent.md trên máy thì bỏ qua), rồi lint/test:
  - Node: `npm run lint`, `npm test`;
  - Python: `ruff`, `pytest`.

  Chưa có script lint/test thì chỉ cảnh báo, có mà hỏng thì đỏ. Bộ kiểm của văn phòng đổi thì mục này báo "bản cũ", bấm **Cài lại bộ kiểm**.

## Xem trên điện thoại

- **Cùng Wi-Fi:** đặt `"host": "0.0.0.0"` và `accessKey` trong `config.json`, rồi mở `http://<IP máy>:7788`.
- **Qua Internet:** cài cloudflared (Windows: `winget install --id Cloudflare.cloudflared`; macOS: `brew install cloudflared`). Chạy `powershell -ExecutionPolicy Bypass -File scripts\xem-tren-dien-thoai.ps1` hoặc `sh scripts/xem-tren-dien-thoai.sh`, mở link `trycloudflare.com` rồi nhập khóa xem một lần. Script sẽ không chạy nếu chưa có khóa xem.

### Điều khiển từ điện thoại

Giao việc, duyệt báo cáo, trả lời câu hỏi của Claude, duyệt hoặc từ chối bàn giao và phanh khẩn cấp ngay trên điện thoại (trang `/dieu-khien.html`). Văn phòng chạy AI toàn quyền trên máy, nên điện thoại phải qua đủ ba lớp:

1. **Khóa xem** (`accessKey`) như khi xem: chưa đặt khóa thì không nhận lệnh từ xa nào, kể cả ghép.
2. **Ghép máy:** trên máy tính bấm **Điện thoại** ở thanh công cụ → **Tạo mã ghép** (6 số, sống 5 phút, dùng một lần; sai 5 lần khóa 15 phút). Điện thoại nhập mã thì nhận khóa thiết bị riêng (cookie `HttpOnly`, `SameSite=Strict`); máy chủ chỉ lưu bản băm. Tối đa 5 máy; mất máy thì **Thu hồi** trên máy tính hoặc **Huỷ ghép** trên chính điện thoại.
3. **Danh sách lệnh** (`lib/dieu-khien-xa.js`): chỉ mở xem tình hình, giao việc, duyệt/trả lại, trả lời, chạy lại khi chờ hạn mức, phanh khẩn cấp. Không mở chạy lệnh tùy ý, đọc/ghi file, duyệt rà soát, xuất bản, đẩy nhánh, sửa kết nối hay cấu hình: các việc đó chỉ làm trên máy tính.

Mọi lệnh từ điện thoại (và lệnh bị chặn) ghi vào `~/.van-phong-ao/dieu-khien-xa.log` kèm tên máy và IP; xem ở trang **Điện thoại** trên máy tính. **iPhone/Android với địa chỉ cố định (Tailscale):** cài Tailscale trên máy tính (`winget install --id Tailscale.Tailscale -e`) và trên điện thoại, đăng nhập cùng tài khoản, rồi chạy `powershell -ExecutionPolicy Bypass -File scripts\dien-thoai-tailscale.ps1`. Script mở `https://<tên-máy>.<mạng>.ts.net` chỉ trong mạng riêng của anh (không ra Internet), địa chỉ không đổi giữa các lần bật. Trên iPhone mở link đó bằng Safari → Chia sẻ → **Thêm vào MH chính**, rồi mở app từ biểu tượng và nhập khóa xem + mã ghép **trong app** (iOS tách dữ liệu đăng nhập của app màn hình chính với Safari). Yêu cầu qua Tailscale luôn bị coi là từ xa, dù nối vào từ 127.0.0.1.

Muốn thêm một lớp đăng nhập bằng email trước cả khóa xem: dùng Cloudflare Tunnel có tên miền riêng kèm Cloudflare Access thay cho link `trycloudflare.com`.

## Cấu hình `config.json`

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `title`, `subtitle`, `ownerName` | Văn phòng AI, …, Giám đốc | Tên hiện trên văn phòng |
| `projects` | `[]` | Thư mục dự án cần theo dõi (tính cả thư mục con, worktree). Để trống là mọi dự án |
| `port`, `host` | 7788, 127.0.0.1 | `0.0.0.0` để máy khác trong mạng xem được |
| `accessKey` | `""` | Khóa xem: nhập một lần mới vào được |
| `keepHours` | 24 | Phiên im quá số giờ này thì rời văn phòng |
| `staff`, `hide` | `[]` | Đặt tên, chức danh, phòng (`manager`, `coord`, `g1`, `claude`, `codex`) cho phiên; giấu phiên |
| `dataDir` | `data` | Nơi để sổ điều phối |
| `rulesFile` | `""` | File nội quy riêng; để trống thì dùng `data/NOI-QUY.md`, không có thì `AGENTS.md` / `CLAUDE.md` của dự án |
| `aiCapUsd` | 100 | Trần tiền AI mỗi ngày (vượt 80% thì ô chuyển đỏ) |
| `prices` | Claude 3/0,3/15 · Codex 1,25/0,125/10 | Giá API (USD cho 1 triệu token: vào / đọc đệm / ra) để **ước tính** tiền. Dùng gói thuê bao tháng thì đây chỉ là số để so sánh |
| `dockerFilter`, `dockerStrip`, `dockerRetired` | `""`, `""`, `[]` | Hiện container Docker trong Phòng DEV, ví dụ `"name=myapp-dev"` |
| `updateChannel` | `"phat-hanh"` | Nút Cập nhật nhận bản nào: `"phat-hanh"` chỉ bản CEO đã phát hành (tag `vX.Y.Z`); `"main"` bản mới nhất của main (máy đội phát triển) |

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| `Chưa có config.json` | Chạy `npm run setup` trước. |
| Văn phòng trống | Mở phiên AI **trong đúng thư mục dự án** đã chọn; kiểm `projects` (dùng dấu `/`). |
| `EADDRINUSE` | Cổng 7788 đang bận: đổi `port`. |
| Màn 3D đen | Trình duyệt chặn WebGL hoặc máy không tải được three.js. Thử Chrome/Edge mới, hoặc dùng Sơ đồ 2D. |
| Bấm lối tắt mà không thấy cửa sổ | Xem `~/.van-phong-ao/logs/app.log`; thường do thiếu `config.json` (chạy `npm run setup`) hoặc cổng 7788 đang bận. |
| `OS Controller chưa chạy` trên màn Điều khiển | Chạy `npm run ctl` (hoặc `npm run all` thay cho `npm start`). |
| `Bảng điều khiển máy chỉ dùng được trên chính máy này` | Đúng thiết kế: không điều khiển máy qua điện thoại / máy khác. Mở bằng `http://localhost:7788` trên chính máy. |
| Lượt AI báo `Không tìm thấy chương trình claude/codex/agy` hoặc lỗi cờ CLI | Cài CLI chính thức và đăng nhập (`claude auth login`, `codex login`, chạy `agy` để đăng nhập), hoặc sửa lệnh trong `~/.van-phong-ao/ctl-agents.json`. |
| Hòm thư không ai đọc | Phiên AI chưa có luật đội: dán `data/DOAN-CHEN-VAO-AGENTS.md` vào `AGENTS.md` / `CLAUDE.md`, và đặt tên phiên trùng tên vai. |

## Cấu trúc mã

```
server.js              máy chủ: tìm phiên, đọc nhật ký + sổ, đẩy trạng thái mỗi giây
lib/                   perf (token, điểm, tiền) · docs (sổ sách) · hopthu · tongquan · chat (PIN) · mailbox · config
                       guard (chặn CSRF/DNS rebinding) · proc (dừng cây tiến trình) · keys · mask · ctlbridge (cầu nối tới ctl) · app (mở app, lối tắt)
ctl/                   OS Controller: main (HTTP) · jobs · policy · workspaces · files · runner (lượt AI) · autopilot (giao việc tự động) · handoff · monitor · audit · db (tự nâng cấp sổ) · cap-nhat (nút Cập nhật) · dieu-phoi (chọn model/mức) · muc-luc (mục lục từ bản đồ)
test/                  node --test (npm test)
tools/vp.js            công cụ ghi sổ cho agent
tools/kiem-agent.js    bộ kiểm chu trình agent.md (lib/kiem-agent.js), CI chạy trên mỗi PR
setup.js               cài đặt (hỏi–đáp hoặc --yes cho agent)
mau/                   khung mẫu sổ điều phối + đoạn luật đội cho AGENTS.md / CLAUDE.md
public/                giao diện: index (3D), board, congviec, noiquy, tongquan, hopthu, hieusuat, tinnhan, 2d, dieukhien
scripts/               mở đường hầm xem trên điện thoại · chay-tat-ca.js (npm run all) · mo-app / tat-app / cai-app (app trên máy) · cap-nhat.js (bộ cập nhật, lib/cap-nhat.js)
HUONG-DAN-CHO-AGENT.md hướng dẫn để agent tự cài từ link này
docs/BAN-DO-HE-THONG.md bản đồ workflow → kiến trúc → mã (sinh bằng tools/ve-ban-do.js từ đồ thị Understand Anything trong .ua/)
```

Bản đồ toàn hệ thống (7 miền nghiệp vụ, 40 workflow, từng bước trỏ tới file:dòng): [docs/BAN-DO-HE-THONG.md](docs/BAN-DO-HE-THONG.md). Mã đổi nhiều thì vẽ lại đồ thị bằng `/understand` và `/understand-domain` (plugin Understand Anything), rồi chạy `node tools/ve-ban-do.js`.

Giấy phép MIT.
