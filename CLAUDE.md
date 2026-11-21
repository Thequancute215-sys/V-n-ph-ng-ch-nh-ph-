# Dành cho agent AI

Nếu chủ của bạn gửi link kho này để cài văn phòng ảo: đọc và làm theo **HUONG-DAN-CHO-AGENT.md** (cài, kiểm, điền sổ, báo lại chủ).
Nếu bạn được giao sửa mã văn phòng: máy chủ `server.js` + `lib/` chỉ đọc nhật ký phiên và sổ `data/` (chỉ ghi vài file trạng thái của chính nó: `data/.task-seen.json`, `data/.noiquy-seen.json`, `data/tin-nhan/*.jsonl` (sổ tin nhắn lâu dài, CEO duyệt 21/11/2026), `~/.van-phong-ao/keys.json`, `~/.van-phong-ao/dieu-khien-xa.*`); công cụ ghi sổ là `tools/vp.js`; giao diện ở `public/`. Không thêm thư viện ngoài, không gửi dữ liệu ra ngoài.

Đường mạng ra ngoài đã có (tất cả nằm trong OS Controller `ctl/`, chỉ chạy khi CEO bấm hoặc đã bật; mã nguồn chỉ đi tới repo GitHub của chính CEO, khóa không gửi cho ai khác ngoài dịch vụ của chính khóa đó):
- `ctl/tra-cuu.js` (CEO duyệt 16/11/2026): gửi câu hỏi ngắn và link công khai tới Gemini API khi CEO đã lưu khóa AI Studio; mọi đầu vào phải qua bộ chặn khóa/mã nguồn/địa chỉ nội bộ của nó.
- `ctl/github.js`: GitHub API bằng đăng nhập Git của máy — liệt kê/mở/clone repo, chạy workflow phát hành, tạo repo mới (tên + mô tả CEO đã duyệt, mặc định riêng tư). `ctl/nhanh.js`, `ctl/bo-kiem.js`, `ctl/xuat-ban.js`: `git push` nhánh/tag lên repo đó (không `--force`).
- `ctl/du-an-moi.js`: đưa ý tưởng CEO gõ cho Claude CLI trên máy để gợi ý tên repo.
- `ctl/skill-duyet.js`, `ctl/skill.js`: `git ls-remote` / `git fetch` đúng commit từ GitHub và `npm view` tra gói, khi CEO dán link hoặc cài bộ skill.
- `ctl/mcp-may.js`: `npm install` đúng phiên bản đã ghim (`--ignore-scripts`) khi CEO bấm cài MCP chạy trên máy.

Thêm đường mạng mới phải được CEO duyệt và ghi vào danh sách này (cả `AGENTS.md` lẫn `CLAUDE.md`, hai file giữ giống hệt nhau).
