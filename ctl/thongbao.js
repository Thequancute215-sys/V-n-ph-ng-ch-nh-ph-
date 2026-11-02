// Thông báo trên máy khi luồng cần CEO (Claude hỏi, báo cáo chờ duyệt, lỗi, hết hạn mức): thông báo góc màn hình của Windows,
// gửi tại chỗ qua PowerShell, không qua dịch vụ ngoài. Máy khác Windows hoặc VP_NO_TOAST=1 thì chỉ ghi nhật ký kiểm toán.
// Tiêu đề và nội dung truyền qua biến môi trường, không ghép vào câu lệnh, nên ký tự lạ trong tên việc không thành lệnh.
"use strict";
const { execFile } = require("child_process");
const { maskSecrets } = require("../lib/mask");

// AppUserModelID của Windows PowerShell: có sẵn trên mọi máy Windows 10/11 nên thông báo hiện được mà không cần cài app.
const PS = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$t = $xml.GetElementsByTagName('text')
$t.Item(0).AppendChild($xml.CreateTextNode($env:VP_TITLE)) > $null
$t.Item(1).AppendChild($xml.CreateTextNode($env:VP_BODY)) > $null
$n = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($n)
`;

function createNotifier({ enabled = process.platform === "win32" && process.env.VP_NO_TOAST !== "1", audit, run = execFile } = {}) {
  return function notify(title, body) {
    title = maskSecrets(title).slice(0, 120); body = maskSecrets(body).slice(0, 300);
    if (audit) audit.log("ctl", "notify", null, { title, body, toast: enabled });
    if (!enabled) return false;
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS],
      { env: { ...process.env, VP_TITLE: title, VP_BODY: body }, windowsHide: true, timeout: 20000 },
      (e) => { if (e && audit) audit.log("ctl", "notify.error", null, String(e.message).slice(0, 300)); });
    return true;
  };
}

module.exports = { createNotifier, PS };
