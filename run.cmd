@echo off
REM Double-click this to typecheck and then run the app.
REM
REM %~dp0 is the folder this file lives in, so it works from anywhere —
REM a Desktop shortcut, a terminal sitting in C:\Users\MSI, wherever.
REM That is the whole point of it: `npm run build` from the wrong
REM folder just says "could not read package.json", which tells you
REM nothing about what is actually wrong.

cd /d "%~dp0"

REM Tauri closes its own window but does not always take the vite dev
REM server down with it, so a run that ended badly can leave node still
REM holding port 1420. The next start then dies with "Port 1420 is
REM already in use", which reads like a code problem and isn't one.
REM Clear it before doing anything else.
echo.
echo === Freeing port 1420 ===
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = @(Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue); if ($c.Count -eq 0) { Write-Host '  port is free' } else { $c.OwningProcess | Sort-Object -Unique | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p) { Write-Host ('  stopping leftover ' + $p.ProcessName + ' (pid ' + $p.Id + ')'); Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Milliseconds 700 }"

echo.
echo === Checking the code compiles ===
echo.

call npm run build
if errorlevel 1 (
  echo.
  echo Build FAILED. The app was not started.
  echo Fix the errors above, or paste them to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo === Build clean. Starting the app ===
echo Close this window or press Ctrl+C to stop.
echo.

call npm run tauri dev

echo.
echo App stopped. Press any key to close.
pause >nul
