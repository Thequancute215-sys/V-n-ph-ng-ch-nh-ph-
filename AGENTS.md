# Dành cho agent AI

Nếu chủ của bạn gửi link kho này để cài văn phòng ảo: đọc và làm theo **HUONG-DAN-CHO-AGENT.md** (cài, kiểm, điền sổ, báo lại chủ).
Nếu bạn được giao sửa mã văn phòng: máy chủ `server.js` + `lib/` chỉ đọc nhật ký phiên và sổ `data/` (chỉ ghi vài file trạng thái của chính nó: `data/.task-seen.json`, `data/.noiquy-seen.json`, `~/.van-phong-ao/keys.json`, `~/.van-phong-ao/dieu-khien-xa.*`); công cụ ghi sổ là `tools/vp.js`; giao diện ở `public/`. Không thêm thư viện ngoài, không gửi dữ liệu ra ngoài.
