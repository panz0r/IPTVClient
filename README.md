# IPTV Player

A cross-platform Flutter IPTV client (Windows desktop first, Android TV later) that connects to **Xtream Codes** providers and plays **Live TV**, **Movies**, and **Series**.

## Features

- Xtream Codes login (server URL, username, password)
- Secure credential storage with auto-connect on launch
- Live TV browsing by category with HLS playback
- Movies (VOD) browsing and playback
- Series browsing with season/episode lists
- Full-screen video player powered by [media_kit](https://pub.dev/packages/media_kit)
- Android TV-ready manifest and D-pad focus navigation hooks

## Prerequisites

- [Flutter SDK](https://docs.flutter.dev/get-started/install) with Windows desktop support
- Visual Studio 2022 with "Desktop development with C++" workload (for Windows builds)
- Android Studio / SDK (optional, for Android TV builds)

Verify your setup:

```bash
flutter doctor
```

## Getting started

```bash
flutter pub get
flutter run -d windows
```

## Dev iteration (Windows)

**Batch files** (double-click or run from a terminal in this folder):

```bat
start.bat        REM launch (builds first only if the exe is missing)
start.bat build  REM rebuild, then launch
stop.bat         REM stop a running instance
```

After code changes, kill any running app, rebuild, and relaunch:

```powershell
Get-Process -Name iptv -ErrorAction SilentlyContinue | Stop-Process -Force
flutter build windows --debug
Start-Process "build\windows\x64\runner\Debug\iptv.exe"
```

For Android TV (when SDK is installed):

```bash
flutter run -d android
```

## Usage

1. Launch the app
2. Enter your provider's **Server URL**, **Username**, and **Password**
3. Browse **Live TV**, **Movies**, or **Series**
4. Select content to play
5. Use the back button or arrow in the player to return

Credentials are stored locally on your device using secure storage. **Never commit credentials** or share them in issue reports.

## Project structure

```text
lib/
├── core/          # Theme, router, shared widgets
├── data/          # Xtream repository, credential storage
├── features/      # Login, browse screens, player
└── providers/     # Riverpod state management
```

## Security note

This app is a generic IPTV player. You supply your own provider credentials. The developers do not host or provide IPTV content.

## License

Private hobby project.
