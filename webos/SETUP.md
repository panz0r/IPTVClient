# webOS SDK setup (Phase 0)

Step-by-step setup for sideloading this app on an LG TV. Complete this once per development PC.

## 1. Install webOS TV SDK

1. Download the SDK from [webOS TV SDK installation](https://webostv.developer.lge.com/develop/tools/sdk-installation)
2. Run the installer on Windows
3. Add CLI tools to `PATH` (installer option or manual):

   Typical path:

   ```
   C:\webOS_TV_SDK\CLI\bin
   ```

4. Verify:

   ```powershell
   ares-setup-device --version
   ares-package --version
   ```

## 2. Enable Developer Mode on the TV

1. Install **Developer Mode** from LG Content Store on the TV
2. Sign in with LG developer account in the app
3. Turn **Dev Mode** ON; note:
   - TV IP address
   - Passphrase (used as `password` for CLI)
   - `username` is usually `prisoner`
   - Port is usually `9922`

## 3. Register the TV

```powershell
ares-setup-device
```

Suggested values:

| Prompt | Value |
|--------|-------|
| name | `tv` |
| host | TV IP (e.g. `192.168.1.50`) |
| port | `9922` |
| username | `prisoner` |
| password | passphrase from Dev Mode app |

List devices:

```powershell
ares-setup-device --list
```

## 4. Build and sideload this app

```powershell
cd webos
npm install
npm run build
npm run install:tv
```

Or step by step:

```powershell
npm run package
ares-install --device tv com.iptv.player_1.0.0_all.ipk
ares-launch --device tv com.iptv.player
```

## 5. Debug

```powershell
ares-inspect --device tv --app com.iptv.player --open
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ares-package` not found | Add SDK CLI `bin` to PATH |
| Connection refused | TV and PC on same LAN; Dev Mode still on |
| Install failed | Bump `version` in `appinfo.json` |
| Video black screen | Test on physical TV; check stream URL in player debug log |
| CORS / fetch errors | Xtream server must allow TV browser; check Cloudflare |

## Hello-world verification

After SDK install, you can confirm tooling with the SDK sample apps before this project. A successful `ares-launch` of `com.iptv.player` with the login screen confirms Phase 0 for this repo.
