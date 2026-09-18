@echo off
REM Double-click this to start the app in development mode.
REM %~dp0 is the folder this file lives in, so it works no matter
REM where you launch it from - including a shortcut on the Desktop.

cd /d "%~dp0"

echo Starting Gamer Social...
echo Close this window or press Ctrl+C to stop the app.
echo.

call npm run tauri dev

REM Keeps the window open if something goes wrong, so you can read
REM the error instead of watching it vanish.
echo.
echo App stopped. Press any key to close.
pause >nul
