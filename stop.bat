@echo off
setlocal

taskkill /IM iptv.exe /F >nul 2>&1
if errorlevel 1 (
  echo Peders fantastiska IPTV spelare is not running.
  exit /b 0
)

echo Stopped Peders fantastiska IPTV spelare.
exit /b 0
