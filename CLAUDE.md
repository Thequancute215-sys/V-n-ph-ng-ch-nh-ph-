# Dành cho agent AI

Nếu chủ của bạn gửi link kho này để cài văn phòng ảo: đọc và làm theo **HUONG-DAN-CHO-AGENT.md** (cài, kiểm, điền sổ, báo lại chủ).
Nếu bạn được giao sửa mã văn phòng: máy chủ `server.js` + `lib/` chỉ đọc nhật ký phiên và sổ `data/`; công cụ ghi sổ là `tools/vp.js`; giao diện ở `public/`. Không thêm thư viện ngoài, không gửi dữ liệu ra ngoài. Ngoại lệ duy nhất (CEO duyệt 16/11/2026): `ctl/tra-cuu.js` gửi câu hỏi ngắn và link công khai tới Gemini API khi CEO đã lưu khóa AI Studio; mọi đầu vào phải qua bộ chặn khóa/mã nguồn/địa chỉ nội bộ của nó.

## Bản đồ hệ thống tự cập nhật (CEO duyệt 17/11/2026)
Bản đồ (`.ua/*.json` của plugin Understand Anything + `docs/BAN-DO-HE-THONG.md`) bật `autoUpdate`. Khi hook của plugin báo bản đồ cũ (sau commit/merge, hoặc đầu phiên): **KHÔNG tự phân tích, không chạy /understand hay subagent** (tốn token). Chạy `node tools/cap-nhat-ban-do.js` — nó giao Codex (gpt-6.1-sol, mức medium) cập nhật tăng dần ở nền, có khoá chống chạy chồng; tiến độ ở `.ua/tmp/cap-nhat-ban-do.log`. Việc của Claude chỉ là kiểm kết quả khi Codex xong: `node tools/cap-nhat-ban-do.js --kiem` báo "Bản đồ mới", `node --test test/ban-do.test.js` đạt, chỉ `.ua/` và `docs/BAN-DO-HE-THONG.md` đổi, số workflow/bước nghiệp vụ không tụt bất thường; rồi commit hai thứ đó cùng thay đổi của mình.
