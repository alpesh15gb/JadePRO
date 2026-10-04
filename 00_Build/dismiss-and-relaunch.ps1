Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W2 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
}
"@

function Get-ProcessName([IntPtr]$h) {
  $p = 0
  [void][W2]::GetWindowThreadProcessId($h, [ref]$p)
  try { return (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch { return $null }
}
function Get-Title([IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 1024
  [void][W2]::GetWindowText($h, $sb, 1024)
  return $sb.ToString()
}

$WM_CLOSE = 0x0010

# --- 1. find and dismiss any modal dialog owned by tally ---
$dialogs = New-Object System.Collections.ArrayList
$cb = [W2+EnumWindowsProc]{
  param($h, $p)
  if ((Get-ProcessName $h) -eq 'tally' -and [W2]::IsWindowVisible($h)) {
    $t = Get-Title $h
    if ($t -eq 'Error' -or $t -eq 'TallyPrime') { [void]$dialogs.Add(@{H=$h; T=$t}) }
  }
  return $true
}
[void][W2]::EnumWindows($cb, [IntPtr]::Zero)
foreach ($d in $dialogs) {
  if ($d.T -eq 'Error') {
    Write-Output "Dismissing dialog '$($d.T)' (hwnd=$($d.H))"
    [void][W2]::PostMessage($d.H, $WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
  } else {
    Write-Output "Main window present: '$($d.T)'"
  }
}

Start-Sleep -Seconds 3

# --- 2. is tally gone? if not, leave it (do not force-kill) ---
$still = Get-Process tally -ErrorAction SilentlyContinue
if ($still) {
  Write-Output "tally.exe still running (PID $($still.Id)), title='$($still.MainWindowTitle)' - not killing."
} else {
  Write-Output "tally.exe exited."
}

# --- 3. relaunch ---
$exe = 'C:\Program Files\TallyPrime\tally.exe'
if (-not (Test-Path $exe)) { Write-Output "EXE NOT FOUND: $exe"; exit 1 }
if (-not (Get-Process tally -ErrorAction SilentlyContinue)) {
  Write-Output "Launching $exe"
  Start-Process $exe
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 3
    $pr = Get-Process tally -ErrorAction SilentlyContinue
    if ($pr) {
      $l = netstat -ano | Select-String ':9000' | Select-String 'LISTENING'
      Write-Output "tally.exe up (PID $($pr.Id)) title='$($pr.MainWindowTitle)' listening9000=$([bool]$l)"
      if ($pr.MainWindowTitle -ne '' -and $l) { break }
    } else {
      Write-Output "waiting for tally.exe ... ($((($i+1)*3))s)"
    }
  }
}
