# Mở văn phòng cho điện thoại qua Tailscale: mạng riêng chỉ gồm máy của anh, địa chỉ HTTPS cố định (không đổi như trycloudflare),
# không mở cổng nào ra Internet. Điện thoại cài app Tailscale, đăng nhập cùng tài khoản là vào được.
# Chạy:  powershell -ExecutionPolicy Bypass -File scripts\dien-thoai-tailscale.ps1          (bật)
#        powershell -ExecutionPolicy Bypass -File scripts\dien-thoai-tailscale.ps1 -Tat     (tắt)
param([switch]$Tat)
$ErrorActionPreference = "Stop"
$cfg = Get-Content (Join-Path $PSScriptRoot "..\config.json") -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
if (-not $cfg) { Write-Host "Chưa có config.json. Chạy: npm run setup"; exit 1 }
$ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $ts -and (Test-Path "C:\Program Files\Tailscale\tailscale.exe")) { $ts = "C:\Program Files\Tailscale\tailscale.exe" }
if (-not $ts) { Write-Host "Chưa có Tailscale. Cài bằng: winget install --id Tailscale.Tailscale -e  rồi đăng nhập."; exit 1 }
if ($Tat) { & $ts serve --https=443 off; Write-Host "Đã tắt đường vào văn phòng qua Tailscale."; exit 0 }
if (-not $cfg.accessKey) {
  Write-Host "(!) config.json chưa có accessKey: điện thoại sẽ không điều khiển được. Đặt khóa xem trước (npm run setup)." -ForegroundColor Yellow
  exit 1
}
$st = & $ts status --json | ConvertFrom-Json
if ($st.BackendState -ne "Running") { Write-Host "Tailscale chưa đăng nhập hoặc đang tắt: mở app Tailscale trên máy và đăng nhập."; exit 1 }
$port = if ($cfg.port) { $cfg.port } else { 7788 }
# --bg: chạy nền, tự bật lại khi máy khởi động. Lần đầu Tailscale có thể đưa link để bật HTTPS cho mạng riêng: mở link đó, bấm Enable.
& $ts serve --bg --https=443 "http://127.0.0.1:$port"
$name = ($st.Self.DNSName).TrimEnd(".")
Write-Host ""
Write-Host "Điện thoại (đã cài Tailscale, cùng tài khoản) mở:  https://$name/dieu-khien.html" -ForegroundColor Green
Write-Host "Nhập khóa xem, rồi mã ghép tạo ở trang Điện thoại trên máy tính. iPhone: Safari > Chia sẻ > Thêm vào MH chính."
