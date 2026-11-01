// Cài Văn phòng AI thành app trên Windows: `npm run cai-app`.
//   (không cờ)          lối tắt "Văn phòng AI" trên Desktop và Start Menu, bấm là chạy `scripts/mo-app.js`
//   --tu-khoi-dong      thêm lối tắt vào thư mục Startup: bật ngầm văn phòng mỗi khi đăng nhập Windows (mo-app.js --nen)
//   --go                gỡ mọi lối tắt đã tạo
// Lối tắt tạo bằng WScript.Shell của Windows qua PowerShell. Mọi đường dẫn truyền qua biến môi trường, không ghép vào
// chuỗi lệnh, nên đường dẫn có dấu nháy hay dấu cách cũng không thành lệnh.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const app = require("../lib/app");

const root = path.join(__dirname, "..");
const NAME = "Văn phòng AI";

const PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$shell = New-Object -ComObject WScript.Shell
$dirs = @{ desktop = [Environment]::GetFolderPath('Desktop'); menu = [Environment]::GetFolderPath('Programs'); startup = [Environment]::GetFolderPath('Startup') }
foreach ($where in $env:VP_WHERE.Split(',')) {
  $lnk = Join-Path $dirs[$where] ($env:VP_NAME + '.lnk')
  if ($env:VP_MODE -eq 'remove') { if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk; Write-Output ('removed ' + $lnk) }; continue }
  # WScript có thể làm mất ký tự ngoài bảng mã hệ thống khi Save: lưu tên ASCII rồi đổi bằng API Unicode.
  $temp = Join-Path $dirs[$where] ('vp-' + [Guid]::NewGuid().ToString('N') + '.lnk')
  $s = $shell.CreateShortcut($temp)
  $s.TargetPath = $env:VP_NODE
  $s.Arguments = '"' + $env:VP_SCRIPT + '"' + $(if ($where -eq 'startup') { ' --nen' } else { '' })
  $s.WorkingDirectory = $env:VP_ROOT
  $s.IconLocation = $env:VP_ICON + ',0'
  $s.WindowStyle = 7
  $s.Description = 'Văn phòng 3D của đội AI và bảng điều khiển máy'
  $s.Save()
  Move-Item -LiteralPath $temp -Destination $lnk -Force
  Write-Output ('created ' + $lnk)
}
`;

// Tham số cho PowerShell (tách riêng để test được trên mọi hệ điều hành).
function plan(argv, opts = {}) {
  const remove = argv.includes("--go");
  const where = remove ? ["desktop", "menu", "startup"] : ["desktop", "menu", ...(argv.includes("--tu-khoi-dong") ? ["startup"] : [])];
  return {
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS],
    env: {
      VP_MODE: remove ? "remove" : "create", VP_WHERE: where.join(","), VP_NAME: NAME,
      VP_NODE: opts.node || process.execPath, VP_SCRIPT: path.join(opts.root || root, "scripts", "mo-app.js"),
      VP_ROOT: opts.root || root, VP_ICON: opts.icon || path.join(app.HOME(), "van-phong-ai.ico"),
    },
  };
}

if (require.main === module) {
  if (process.platform !== "win32") {
    console.error("`npm run cai-app` chỉ dành cho Windows. Trên máy khác: chạy `npm run app`, hoặc bấm nút \"Cài app\" trong văn phòng (Edge/Chrome).");
    process.exit(1);
  }
  const p = plan(process.argv);
  if (p.env.VP_MODE === "create") {
    fs.mkdirSync(path.dirname(p.env.VP_ICON), { recursive: true });
    fs.writeFileSync(p.env.VP_ICON, app.pngToIco(fs.readFileSync(path.join(root, "public", "icon-maskable-512.png"))));
  }
  try {
    const out = execFileSync("powershell.exe", p.args, { env: { ...process.env, ...p.env }, encoding: "utf8", windowsHide: true, timeout: 30000 });
    for (const line of out.trim().split(/\r?\n/).filter(Boolean)) console.log(line.replace(/^created /, "Đã tạo ").replace(/^removed /, "Đã gỡ "));
    if (p.env.VP_MODE === "create") console.log(`Xong. Bấm "${NAME}" trên Desktop hoặc Start Menu để mở. Tắt: npm run tat-app.`);
  } catch (e) {
    console.error("Không tạo được lối tắt: " + String(e.stderr || e.message).split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  }
}

module.exports = { plan };
