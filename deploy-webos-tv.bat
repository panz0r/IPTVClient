@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Deploy IPTV webOS app to LG TV (build, package, install, launch).
rem Usage: deploy-webos-tv.bat
rem        deploy-webos-tv.bat MyDeviceName

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"

cd /d "%REPO%\webos"

set "WEBOS_SDK=F:\webOS_TV_SDK"
if defined WEBOS_TV_SDK set "WEBOS_SDK=%WEBOS_TV_SDK%"

set "DEVICE=TV"
if not "%~1"=="" set "DEVICE=%~1"

set "APP_ID=com.iptv.player"
set "ESBUILD=%REPO%\webos\tools\esbuild.exe"

echo ========================================
echo  Deploy webOS app to LG TV
echo  Device: %DEVICE%
echo ========================================
echo.

call :EnsureEsbuild
if errorlevel 1 goto :Fail

call :EnsureCli
if errorlevel 1 goto :Fail

echo [1/4] Building JavaScript bundle...
if not exist "js" mkdir "js"
"%ESBUILD%" src\main.ts --bundle --outfile=js\app.bundle.js --format=iife --target=chrome79 --sourcemap
if errorlevel 1 (
  echo Build failed.
  goto :Fail
)

echo.
echo [2/4] Packaging .ipk...
call ares-package .
if errorlevel 1 (
  echo Packaging failed.
  goto :Fail
)

set "IPK="
for /f "delims=" %%F in ('dir /b /o-d com.iptv.player_*.ipk 2^>nul') do (
  set "IPK=%%F"
  goto :GotIpk
)
echo No .ipk file found after packaging.
goto :Fail

:GotIpk
echo Created !IPK!
echo.

echo [3/4] Installing on TV (!DEVICE!)...
call ares-install --device !DEVICE! !IPK!
set "INSTALL_ERR=!ERRORLEVEL!"
if !INSTALL_ERR! neq 0 (
  echo.
  echo INSTALL FAILED ^(exit !INSTALL_ERR!^).
  echo Ensure Dev Mode + Key Server are ON on the TV.
  goto :Fail
)

echo.
echo [4/4] Launching !APP_ID!...
call ares-launch --device !DEVICE! !APP_ID!
set "LAUNCH_ERR=!ERRORLEVEL!"
if !LAUNCH_ERR! neq 0 (
  echo Launch failed ^(exit !LAUNCH_ERR!^).
  goto :Fail
)

echo.
echo Done. App installed and launched on !DEVICE!.
echo Debug: ares-inspect --device !DEVICE! --app !APP_ID! --open
exit /b 0

:EnsureEsbuild
if exist "%ESBUILD%" exit /b 0
echo Fetching esbuild...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\webos\scripts\fetch-esbuild.ps1"
if not exist "%ESBUILD%" (
  echo esbuild.exe missing.
  exit /b 1
)
exit /b 0

:EnsureCli
set "MODERN_CLI=%REPO%\tools\webos-cli"
set "MODERN_NODE=%REPO%\tools\node"

if exist "%MODERN_CLI%\ares-package.cmd" (
  if exist "%MODERN_NODE%\node.exe" (
    set "PATH=%MODERN_CLI%;%MODERN_NODE%;%PATH%"
  ) else (
    set "PATH=%MODERN_CLI%;%PATH%"
  )
  for /f "tokens=*" %%V in ('call ares-package --version 2^>nul') do echo Using CLI: %%V
  exit /b 0
)

echo Modern CLI not found. Installing @webos-tools/cli ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\webos\scripts\ensure-webos-cli.ps1"
if errorlevel 1 goto :CliManualFail

set "PATH=%MODERN_CLI%;%MODERN_NODE%;%PATH%"
for /f "tokens=*" %%V in ('call ares-package --version 2^>nul') do echo Using CLI: %%V
exit /b 0

:CliManualFail
echo.
echo Could not install modern CLI.
echo Download webOS_TV_CLI_win_1.12.4-j27.zip from:
echo https://webostv.developer.lge.com/develop/tools/webos-tv-cli-installation
echo Replace F:\webOS_TV_SDK\CLI with the unzipped CLI folder.
exit /b 1

:Fail
echo.
pause
exit /b 1
