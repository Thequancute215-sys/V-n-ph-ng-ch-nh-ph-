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

- Bấm **Văn phòng AI** trên Desktop: văn phòng bật ngầm (không cửa sổ đen, log ở `~/.van-phong-ao/logs/app.log`), rồi mở cửa sổ app riêng bằng Edge/Chrome (không thanh địa chỉ). Không có Edge/Chrome thì mở bằng trình duyệt mặc định.
- Hoặc trong văn phòng bấm **⬇ Cài app** (Edge/Chrome): có biểu tượng trên thanh tác vụ, lối tắt nhanh tới Điều khiển máy, Bảng điều hành, Hồ sơ nhân vật.
- Mở app khi văn phòng đang tắt: hiện trang hướng dẫn, tự mở lại khi văn phòng bật. App không lưu đệm dữ liệu văn phòng.
- Không cần cài thêm gì: không Electron, không thư viện ngoài.

## Các màn hình

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

> **Lưu ý thật:** lệnh trong danh sách cho phép như `npm test` vẫn chạy script của chính dự án. Ranh giới an toàn là: chỉ trong workspace + bạn duyệt mọi thứ khác + nhật ký + phanh khẩn cấp, không phải hộp cát. Antigravity chưa có CLI chạy nền nên vẫn giao việc qua Hòm thư.

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

## Xem trên điện thoại

- **Cùng Wi-Fi:** đặt `"host": "0.0.0.0"` và `accessKey` trong `config.json`, rồi mở `http://<IP máy>:7788`.
- **Qua Internet:** cài cloudflared (Windows: `winget install --id Cloudflare.cloudflared`; macOS: `brew install cloudflared`). Chạy `powershell -ExecutionPolicy Bypass -File scripts\xem-tren-dien-thoai.ps1` hoặc `sh scripts/xem-tren-dien-thoai.sh`, mở link `trycloudflare.com` rồi nhập khóa xem một lần. Script sẽ không chạy nếu chưa có khóa xem.

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
| Lượt AI báo `Không tìm thấy chương trình claude/codex` hoặc lỗi cờ CLI | Cài CLI và đăng nhập (`claude login`, `codex login`), hoặc sửa lệnh trong `~/.van-phong-ao/ctl-agents.json`. |
| Hòm thư không ai đọc | Phiên AI chưa có luật đội: dán `data/DOAN-CHEN-VAO-AGENTS.md` vào `AGENTS.md` / `CLAUDE.md`, và đặt tên phiên trùng tên vai. |

## Cấu trúc mã

```
server.js              máy chủ: tìm phiên, đọc nhật ký + sổ, đẩy trạng thái mỗi giây
lib/                   perf (token, điểm, tiền) · docs (sổ sách) · hopthu · tongquan · chat (PIN) · mailbox · config
                       guard (chặn CSRF/DNS rebinding) · proc (dừng cây tiến trình) · keys · mask · ctlbridge (cầu nối tới ctl) · app (mở app, lối tắt)
ctl/                   OS Controller: main (HTTP) · jobs · policy · workspaces · files · runner (lượt AI) · handoff · monitor · audit · db
test/                  node --test (npm test)
tools/vp.js            công cụ ghi sổ cho agent
setup.js               cài đặt (hỏi–đáp hoặc --yes cho agent)
mau/                   khung mẫu sổ điều phối + đoạn luật đội cho AGENTS.md / CLAUDE.md
public/                giao diện: index (3D), board, congviec, noiquy, tongquan, hopthu, hieusuat, tinnhan, 2d, dieukhien
scripts/               mở đường hầm xem trên điện thoại · chay-tat-ca.js (npm run all) · mo-app / tat-app / cai-app (app trên máy)
HUONG-DAN-CHO-AGENT.md hướng dẫn để agent tự cài từ link này
```

Giấy phép MIT.
