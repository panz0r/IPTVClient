@echo off
setlocal

taskkill /IM iptv.exe /F >nul 2>&1
if errorlevel 1 (
  echo IPTV Player is not running.
  exit /b 0
)

echo Stopped IPTV Player.
exit /b 0
