@echo off
setlocal EnableExtensions

cd /d "%~dp0"

call :EnsureFlutter
if errorlevel 1 exit /b 1

set "EXE=build\windows\x64\runner\Debug\iptv.exe"

if /I "%~1"=="build" goto :Build
if not exist "%EXE%" goto :Build
goto :Launch

:Build
echo Building Peders fantastiska IPTV spelare...
call flutter pub get
if errorlevel 1 (
  echo Build failed: flutter pub get
  exit /b 1
)
call flutter build windows --debug
if errorlevel 1 (
  echo Build failed: flutter build windows --debug
  exit /b 1
)

:Launch
if not exist "%EXE%" (
  echo Could not find "%EXE%".
  echo Run: start.bat build
  exit /b 1
)

echo Starting Peders fantastiska IPTV spelare...
start "" "%CD%\%EXE%"
exit /b 0

:EnsureFlutter
where flutter >nul 2>&1
if not errorlevel 1 exit /b 0

if exist "%LOCALAPPDATA%\flutter\bin\flutter.bat" (
  set "PATH=%LOCALAPPDATA%\flutter\bin;%PATH%"
  exit /b 0
)

echo Flutter was not found in PATH or at %%LOCALAPPDATA%%\flutter\bin
echo Install Flutter: https://docs.flutter.dev/get-started/install/windows
exit /b 1
