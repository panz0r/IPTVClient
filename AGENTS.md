# IPTV Player — Agent Handoff Context

This document gives future agents enough context to continue work on `w:\hobby\iptv` without re-discovering architecture, conventions, and past decisions.

## Project summary

**Cross-platform Flutter IPTV client** (Windows desktop PoC first, Android TV later) that connects to **Xtream Codes** providers and plays **Live TV**, **Movies**, and **Series**.

Users enter server URL + username + password. The app talks to `player_api.php`, browses content by category, searches within each tab, and plays streams via `media_kit`.

This is a **generic player** — users supply their own provider credentials. Do not commit credentials or `.env` files.

## Current status (PoC)

### Implemented
- Xtream login with verbose connection log (full HTTP request/response on login screen)
- Account status parsing: expired, banned, disabled, invalid credentials, max connections
- Secure credential storage + auto-connect on launch
- Home tabs: Live TV, Movies, Series
- Category sidebar + content grid per tab
- Per-tab search (loads full catalog on first search, filters locally)
- Full-screen player (`media_kit`)
- Series detail → seasons/episodes → playback
- Android TV prep: leanback manifest, `DpadNavigator`, focusable tiles
- Windows batch scripts: `start.bat`, `start.bat build`, `stop.bat`
- Tests for account status, URL normalizer, content search, login widget

### Not implemented (deferred)
- EPG / TV guide
- Favorites, continue watching, multi-profile
- Subtitle/audio track selection
- M3U playlist import
- Release builds / installer packaging
- Android TV UI polish (10-foot layout, landscape-first)

## Tech stack

| Layer | Package / tool |
|-------|----------------|
| Framework | Flutter 3.x (Windows + Android platforms enabled) |
| Xtream API | `xtream_code_client` v2 |
| Playback | `media_kit`, `media_kit_video`, `media_kit_libs_video` |
| State | `flutter_riverpod` v3 (`NotifierProvider`) |
| Routing | `go_router` |
| Credentials | `flutter_secure_storage` |
| Images | `cached_network_image` |
| HTTP (login debug) | `http` via custom `IptvHttpClient` |
| TV focus | `dpad` |

## Architecture

```
UI (features/) → Riverpod (providers/) → Data (data/)
                                      → XtreamRepository → xtream_code_client
                                      → media_kit Player
```

Keep UI, state, and data separate so Android TV is mostly a layout pass later.

### Key providers
- `authProvider` — login/logout, repository lifecycle, debug log on failure
- `loginFormProvider` — persists form fields across login screen rebuilds
- `liveContentProvider` / `moviesContentProvider` / `seriesContentProvider` — category browse + search
- `xtreamRepositoryProvider` — active authenticated repository (from auth state)

**Important:** call `invalidateContentProviders(ref)` on login success and logout (`content_providers.dart`) so browse state resets cleanly.

### Routes (`lib/core/router/app_router.dart`)
- `/login` — login + verbose connection log panel
- `/home` — tabbed browse shell
- `/series/:id` — series detail (pass `SeriesItem` via `extra`)
- `/player` — playback (pass `PlaybackRequest` via `extra`)

## Directory map

```
lib/
├── main.dart              # MediaKit.ensureInitialized(), ProviderScope
├── app.dart               # DpadNavigator + MaterialApp.router
├── core/
│   ├── config/app_theme.dart
│   ├── router/app_router.dart
│   └── widgets/           # CategoryBrowseLayout, DebugLogPanel, common widgets
├── data/
│   ├── models/            # XtreamCredentials, PlaybackRequest, AccountStatus, ...
│   ├── repositories/xtream_repository.dart
│   └── services/          # credentials, URL normalizer, HTTP client, account parser, search
├── features/
│   ├── auth/login_screen.dart
│   ├── home/home_shell.dart
│   ├── live|movies|series/
│   └── player/player_screen.dart
└── providers/             # auth, login form, content
```

## Xtream / provider quirks (read before changing auth or URLs)

1. **Server URL field** = base URL only, e.g. `http://host:8080` — NOT `/player_api.php`.
   - `ServerUrlNormalizer` strips `player_api.php`, `get.php`, etc.
2. **Login debug log shows exact credentials** (user requested verbose debugging). Password is NOT redacted in the log.
3. **Cloudflare** often blocks Dart's default User-Agent → `IptvHttpClient` sends browser-like headers. Same client is passed to `XtreamClient`.
4. **Auth response** is JSON from `GET player_api.php?username=…&password=…` with `user_info` + `server_info`.
   - Check `auth`, `status`, `exp_date`, `message` via `AccountStatusParser`.
5. **Live stream URLs** prefer `.m3u8` via `_client.streamUrl(id, ['m3u8'])`.

## Known pitfalls (bugs we already hit)

1. **Do not `ref.watch()` inside a Riverpod `Notifier.build()`** unless you intend the provider to fully reset — it caused browse data to never stick.
2. **`loadInitial()` must not leave `isLoadingCategories: true` if repository is null** — causes infinite spinner.
3. **`xtream_code_client` exports an `Icon` class** that conflicts with Flutter — use `hide Icon` on that import (see `series_detail_screen.dart`, `category_browse_layout.dart`).
4. **Login screen rebuilds on auth state change** — form values live in `loginFormProvider`, not only in `TextEditingController`.
5. **Search uses `TextField`, not `SearchBar`** — SearchBar fired spurious `onChanged` callbacks.
6. **Content providers load when repository becomes available** — use `ref.listen(xtreamRepositoryProvider)` + `ref.read`, not `ref.watch` in `build()`.

## Dev workflow (Windows)

After code changes the user should test, **kill → rebuild → relaunch**:

```bat
stop.bat
start.bat build
```

Or manually:

```powershell
Get-Process -Name iptv -ErrorAction SilentlyContinue | Stop-Process -Force
flutter build windows --debug
Start-Process "w:\hobby\iptv\build\windows\x64\runner\Debug\iptv.exe"
```

Flutter may live at `%LOCALAPPDATA%\flutter\bin` if not on PATH.

Also documented in [`.cursor/rules/dev-workflow.mdc`](.cursor/rules/dev-workflow.mdc).

### Verify changes

```powershell
flutter analyze
flutter test
```

## Testing

| Test file | Covers |
|-----------|--------|
| `test/account_status_parser_test.dart` | Expired/banned/active account |
| `test/server_url_normalizer_test.dart` | URL cleanup |
| `test/content_search_test.dart` | Search filter |
| `test/widget_test.dart` | Login screen renders (uses fake credentials store) |

No integration tests against real IPTV providers.

## Coding conventions

- Match existing style: minimal diffs, Riverpod notifiers, feature folders
- Dark theme in `AppTheme.dark`
- Use `CategoryBrowseLayout` + `ContentTile` for browse screens
- Use `go_router` `extra` for player and series detail navigation
- Only commit when user asks
- After implementation iterations on Windows: run kill/rebuild/relaunch unless user says otherwise

## Roadmap for next agents

Likely next tasks (priority order):

1. **Playback reliability** — fallback `.ts` if `.m3u8` fails; surface player errors better
2. **Android TV** — D-pad polish, landscape layouts, test on device/emulator
3. **EPG** — `xtream_code_client` supports EPG; not wired up yet
4. **Performance** — large catalogs slow search preload; consider pagination or isolate parsing
5. **Login UX** — optional credential redaction toggle in debug log
6. **Release build** — `flutter build windows --release`, app icon, installer

## Useful commands

```powershell
cd w:\hobby\iptv
flutter pub get
flutter run -d windows
flutter devices
flutter build windows --debug
flutter build windows --release
```

## Files to read first when picking up work

1. [`lib/providers/auth_provider.dart`](lib/providers/auth_provider.dart) — auth + repository lifecycle
2. [`lib/data/repositories/xtream_repository.dart`](lib/data/repositories/xtream_repository.dart) — API + login debug
3. [`lib/providers/content_providers.dart`](lib/providers/content_providers.dart) — browse/search state
4. [`lib/core/widgets/category_browse_layout.dart`](lib/core/widgets/category_browse_layout.dart) — main browse UI
5. [`lib/features/auth/login_screen.dart`](lib/features/auth/login_screen.dart) — login + log panel

## Original plan

High-level PoC plan lives in Cursor plan file `flutter_iptv_poc` (do not edit unless user asks). Most PoC items are done; Android TV polish and EPG remain.
