# IPTV Player — LG webOS TV

webOS TV web application (HTML/TypeScript), packaged as `.ipk` for sideload and LG Content Store.

Mirrors the Flutter app in [`../lib/`](../lib/) for Xtream Codes login, browse, and playback.

## Prerequisites

1. **webOS TV SDK** — [Installation guide](https://webostv.developer.lge.com/develop/tools/sdk-installation)
2. **Node.js 18+** — build TypeScript bundle
3. **LG TV** with **Developer Mode** enabled ([dev mode app](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app))

After SDK install, these CLI tools should be on `PATH`:

- `ares-setup-device`
- `ares-package`
- `ares-install`
- `ares-launch`
- `ares-inspect`

## First-time TV setup

1. On the TV: install **Developer Mode** from the LG Content Store, enable it, note the TV IP.
2. On your PC:

```powershell
ares-setup-device
# Add device name "tv", host = TV IP, port 9922, username "prisoner", password from dev mode app
ares-setup-device --list
```

## Build and deploy

From the repo root, double-click or run:

```bat
deploy-webos-tv.bat
```

Uses device name `TV` by default (`deploy-webos-tv.bat OtherName` to override).

## Build and deploy (manual)

Requires **Node.js** for the TypeScript bundle, or use the bundled `tools/esbuild.exe` helper:

```powershell
cd webos
# If npm is not installed:
powershell -File scripts/fetch-esbuild.ps1
node scripts/build.mjs   # or: npm install && npm run build

npm run package
# or: .\scripts\install-tv.ps1 -Device tv
```

Manual steps:

```powershell
ares-package .
ares-install --device tv com.iptv.player_1.0.0_all.ipk
ares-launch --device tv com.iptv.player
```

Inspect / debug:

```powershell
ares-inspect --device tv --app com.iptv.player --open
```

## Project layout

| Path | Purpose |
|------|---------|
| `appinfo.json` | webOS app manifest |
| `index.html` | Entry + shell |
| `src/` | TypeScript source |
| `js/app.bundle.js` | Built bundle (after `npm run build`) |
| `css/app.css` | TV styles |
| `docs/store/` | Content Store submission templates |

## Notes

- Test playback on a **physical TV**; the emulator lacks full media pipeline behavior.
- Credentials are stored in `localStorage` (not hardware-backed).
- For LG Seller Lounge submission assets, see [`docs/store/`](docs/store/).
