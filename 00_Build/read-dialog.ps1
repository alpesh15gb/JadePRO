Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumWindowsProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
}
"@

function Txt($h) {
  $sb = New-Object System.Text.StringBuilder 2048
  [void][W]::GetWindowText($h, $sb, 2048)
  return $sb.ToString()
}
function Cls($h) {
  $sb = New-Object System.Text.StringBuilder 256
  [void][W]::GetClassName($h, $sb, 256)
  return $sb.ToString()
}

$results = New-Object System.Collections.ArrayList
$cb = [W+EnumWindowsProc]{
  param($h, $p)
  $pid2 = 0
  [void][W]::GetWindowThreadProcessId($h, [ref]$pid2)
  try { $proc = (Get-Process -Id $pid2 -ErrorAction Stop).ProcessName } catch { return $true }
  if ($proc -eq 'tally' -and [W]::IsWindowVisible($h)) {
    $t = Txt $h
    [void]$results.Add("TOP  [$t]  class=$(Cls $h)")
    $ccb = [W+EnumWindowsProc]{
      param($ch, $p2)
      $ct = Txt $ch
      if ($ct.Trim().Length -gt 0) {
        [void]$results.Add("   CHILD class=$(Cls $ch) :: $ct")
      }
      return $true
    }
    [void][W]::EnumChildWindows($h, $ccb, [IntPtr]::Zero)
  }
  return $true
}
[void][W]::EnumWindows($cb, [IntPtr]::Zero)
$results | ForEach-Object { Write-Output $_ }
