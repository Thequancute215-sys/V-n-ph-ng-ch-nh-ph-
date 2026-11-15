# Cất / nạp đăng nhập Antigravity CLI trong Windows Credential Manager (CEO duyệt 16/11/2026: hai tài khoản family + Pro).
# Antigravity chỉ có MỘT chỗ lưu đăng nhập ("gemini:antigravity"); văn phòng cất bản sao của từng tài khoản ở
# "van-phong-ao/agy/<id>" rồi chép vào chỗ đó khi cần đổi tài khoản. Token KHÔNG ra khỏi tiến trình này: chỉ in email.
# Lệnh (nối nhiều lệnh trong một lần chạy):
#   email                 in email của đăng nhập đang dùng
#   emailcua <id>         in email của bản đã cất
#   luu <id> <email>      chép đăng nhập đang dùng vào chỗ cất <id>; từ chối nếu email đang dùng khác <email>
#   nap <id>              chép bản đã cất <id> vào chỗ đăng nhập của Antigravity
#   xoa <id>              xoá bản đã cất <id>
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Lenh)
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class VpAgyCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment; public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredReadW(string t, int type, int flags, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWriteW(ref CREDENTIAL c, int flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDeleteW(string t, int type, int flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static byte[] Read(string t) {
    IntPtr p; if (!CredReadW(t, 1, 0, out p)) return null;
    try { var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL)); var b = new byte[c.CredentialBlobSize]; Marshal.Copy(c.CredentialBlob, b, 0, b.Length); return b; }
    finally { CredFree(p); }
  }
  public static void Write(string t, string user, byte[] b) {
    var c = new CREDENTIAL(); c.Type = 1; c.TargetName = t; c.UserName = user; c.Persist = 2; c.CredentialBlobSize = b.Length; c.CredentialBlob = Marshal.AllocHGlobal(b.Length);
    try { Marshal.Copy(b, 0, c.CredentialBlob, b.Length); if (!CredWriteW(ref c, 0)) throw new Exception("CredWrite " + Marshal.GetLastWin32Error()); }
    finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
  public static bool Delete(string t) { return CredDeleteW(t, 1, 0); }
}
'@
$GOC = "gemini:antigravity"
$slot = { param($id) if ($id -notmatch '^[a-z0-9-]{1,40}$') { throw "id không hợp lệ" }; "van-phong-ao/agy/$id" }
$emailOf = { param($b) if (-not $b) { return "-" }; try { $j = [Text.Encoding]::UTF8.GetString($b) | ConvertFrom-Json; if ($j.id_token_email) { [string]$j.id_token_email } else { "?" } } catch { "?" } }
$i = 0
while ($i -lt $Lenh.Count) {
  $op = $Lenh[$i]; $i++
  switch ($op) {
    "email" { "EMAIL " + (& $emailOf ([VpAgyCred]::Read($GOC))) }
    "emailcua" { $id = $Lenh[$i]; $i++; "EMAILCUA $id " + (& $emailOf ([VpAgyCred]::Read((& $slot $id)))) }
    "luu" {
      $id = $Lenh[$i]; $mail = $Lenh[$i + 1]; $i += 2
      $b = [VpAgyCred]::Read($GOC)
      if (-not $b) { "LOI chưa đăng nhập Antigravity"; exit 3 }
      $cur = & $emailOf $b
      if ($cur -ne $mail) { "SAI $id $cur"; exit 4 }
      [VpAgyCred]::Write((& $slot $id), "van-phong-ao", $b); "LUU $id $cur"
    }
    "nap" {
      $id = $Lenh[$i]; $i++
      $b = [VpAgyCred]::Read((& $slot $id))
      if (-not $b) { "LOI chưa cất tài khoản $id"; exit 5 }
      [VpAgyCred]::Write($GOC, "antigravity", $b); "NAP $id " + (& $emailOf $b)
    }
    "xoa" { $id = $Lenh[$i]; $i++; [void][VpAgyCred]::Delete((& $slot $id)); "XOA $id" }
    default { "LOI lệnh không hợp lệ"; exit 2 }
  }
}
