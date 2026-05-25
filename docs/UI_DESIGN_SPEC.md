# UI Design Specification — Peders fantastiska IPTV spelare

This document describes the **current** user interface of the Flutter IPTV client. Use it when implementing or changing screens so new work stays consistent with the existing design.

**Related docs:** [`AGENTS.md`](../AGENTS.md) (architecture, providers, dev workflow) · **Theme source:** [`lib/core/config/app_theme.dart`](../lib/core/config/app_theme.dart)

---

## 1. Product & platforms

| Item | Value |
|------|--------|
| Display name | `Peders fantastiska IPTV spelare` (`kAppDisplayName` in `lib/core/config/app_info.dart`) |
| Package name | `iptv` (internal only; not shown in UI) |
| Primary target | **Windows desktop** (PoC) |
| Secondary | Android TV (D-pad focus enabled on Android only) |
| Design language | **Material 3**, dark-only, streaming-app patterns (Netflix-inspired player chrome) |

There is **no light theme**. Do not add one unless explicitly requested.

---

## 2. Global shell

```
MaterialApp.router
└── DpadNavigator          ← enabled only on TargetPlatform.android
    └── GoRouter routes
```

- **Desktop (Windows/Linux/macOS):** `DpadNavigator` is **disabled** so mouse interaction is not trapped.
- **Android TV:** `DpadNavigator` is **enabled**; focusable tiles use `DpadFocusable` from package `dpad`.

### Routes (`lib/core/router/app_router.dart`)

| Path | Screen | Notes |
|------|--------|--------|
| `/login` | `LoginScreen` | Default when unauthenticated |
| `/home` | `HomeShell` | Tabbed browse after login |
| `/movie/:id` | `MovieDetailScreen` | Requires `VodItem` in `GoRouter` `extra` |
| `/series/:id` | `SeriesDetailScreen` | Requires `SeriesItem` in `extra` |
| `/player` | `PlayerScreen` | Requires `PlaybackRequest` in `extra` |

Auth redirect: loading/unknown → stay on login; authenticated → redirect away from `/login` to `/home`.

---

## 3. Visual design system

### 3.1 Color palette (`AppTheme.dark`)

| Role | Color | Usage |
|------|--------|--------|
| Seed / primary | `#6C63FF` | Buttons, focus rings, nav indicator |
| Scaffold background | `#0E0E12` | Page background |
| Surface | `#121218` | M3 surface |
| App bar | `#16161D` | Top bars |
| Card / filled inputs | `#1C1C26` | Cards, text fields |
| Player accent | `#E50914` | Seek bar progress, thumb, highlighted subtitle button (Netflix red) |
| Player chrome | White on black gradient | Controls overlay |

Cards: **12px** corner radius. Inputs: filled, **no outline border**, 12px radius.

### 3.2 Typography

Uses default Material 3 text theme (dark). Common roles:

- **Screen titles:** `headlineSmall` (login), `titleMedium` (row headers, section labels)
- **Poster titles:** `bodySmall`, max 2 lines, ellipsis
- **Subtitles / metadata:** `labelSmall` or `bodySmall` with `colorScheme.outline`
- **Player transport title:** 15px, white, centered, w500

### 3.3 Shared state widgets (`lib/core/widgets/common_widgets.dart`)

| Widget | Purpose |
|--------|---------|
| `LoadingState` | Centered `CircularProgressIndicator` + message |
| `ErrorState` | Error icon + message + optional `FilledButton` “Retry” |
| `EmptyState` | Inbox-style icon + message |
| `PosterImage` | `CachedNetworkImage` with placeholder spinner and fallback icon |

Use these instead of inventing new empty/loading/error layouts.

---

## 4. Screen-by-screen layout

### 4.1 Login (`lib/features/auth/login_screen.dart`)

**Layout:** Full-width `Row` (50/50 on wide windows).

| Left | Right |
|------|--------|
| Centered `Card` (max width **480px**), 24px padding | `DebugLogPanel` — full HTTP login trace |

**Card content (top → bottom):**

1. `Icons.live_tv` 48px, primary color  
2. `kAppDisplayName` — `headlineSmall`, centered  
3. Subtitle: “Connect with your Xtream Codes credentials”  
4. `TextFormField`: Server URL (hint: no `/player_api.php`), Username, Password (visibility toggle)  
5. Error text in `colorScheme.error` if login failed  
6. `FilledButton` “Connect” (spinner when loading)

Form state persists via `loginFormProvider` (survives auth-driven rebuilds).

---

### 4.2 Home shell (`lib/features/home/home_shell.dart`)

**Structure:**

```
Scaffold
├── AppBar: kAppDisplayName + logout IconButton
├── [optional] MaterialBanner — account success summary
├── Body: one of Live | Movies | Series (indexed switch, not IndexedStack)
└── NavigationBar (Material 3): Live TV | Movies | Series
```

Tab icons: `live_tv_outlined`, `movie_outlined`, `video_library_outlined`.

Only the **selected** tab’s widget is built (lazy tab body).

---

### 4.3 Live TV (`lib/features/live/live_screen.dart`)

**Pattern:** `CategoryBrowseLayout` — **classic IPTV layout** (not the Netflix hub).

```
Row
├── Left sidebar (260px): Card + ListView of categories
└── Right: search field + GridView of channels
```

| Element | Spec |
|---------|------|
| Sidebar | `ListTile` per category; selected state; D-pad focus highlight |
| Search | `TextField` with search icon; clear button when non-empty |
| Grid | `maxCrossAxisExtent: 220`, `childAspectRatio: 0.72`, 16px spacing |
| Tile | `ContentTile` — card with poster area + title (and optional subtitle) |

**Search:** First search loads full catalog into memory, then filters locally (`liveContentProvider`).

**Play:** Tap tile → `/player` with `PlaybackKind.live` and URL fallbacks.

---

### 4.4 Movies & Series hubs (`movies_screen.dart`, `series_screen.dart`)

**Pattern:** **Netflix-style vertical hub** — `CustomScrollView` + slivers.

**Not used for Live TV.** Movies and Series share the same structure; differences are data/providers and copy only.

#### Vertical order (browse mode)

1. `HubSearchField` — debounced 300ms, outline border  
2. **`ContinueWatchingSliver`** — tab-specific (`PlaybackKind.vod` vs `series`)  
3. Optional **“Recently added”** row (`recentRow`)  
4. **Genre rows** — one `HubRowSliver` per genre (from API genre or cached `vod_genre`)  
5. If genres exist: section header **“Provider categories”** then provider category rows  
6. If no genres yet (movies): provider rows only + “Loading genres from your library…” text  
7. `EmptyState` if nothing to show  

#### Search mode

When `searchQuery` is non-empty: hub rows hidden; grid of search results (`_SearchResultsSliver`) with `maxCrossAxisExtent: 180`, `childAspectRatio: 0.55`.

#### Hub row anatomy (`HubRowSliver`)

```
ContentRow header (title + optional "See all (N)")
HorizontalPosterRow (height 200, lazy ListView)
  └── PosterCard × N
```

- **See all** → pushes `HubBrowseScreen` (full grid for that row).  
- **Poster tap (movies):** `/movie/:id` with `VodItem`.  
- **Poster tap (series):** `/series/:id` with `SeriesItem`.

#### Recently watched (`ContinueWatchingSliver`)

- Section title: **“Recently watched”** + **“Clear all”** (confirmation dialog).  
- Horizontal row of `PosterCard` with **progress bar** on poster bottom.  
- Per-item **×** removes one entry.  
- **Movies** and **Series** lists are **separate** (filtered by `PlaybackKind`).  
- Hidden when empty or still loading history.

#### Horizontal scrolling (`HorizontalPosterRow`)

- Height **200px**; poster width **130px** (`PosterCard` default).  
- **Mouse:** grab cursor, click-drag to scroll, wheel support (`HubRowScrollBehavior`).  
- **All items** in row are shown (no artificial cap); lazy `ListView.separated`.

#### Poster card (`PosterCard`)

- Aspect ratio **2:3** (portrait poster).  
- `InkWell` + optional `DpadFocusable`.  
- Focus: 2px primary border.  
- Optional `LinearProgressIndicator` for continue-watching (3px, bottom).  
- Icons: `movie_outlined` (movies), `video_library_outlined` (series).

---

### 4.5 Movie detail (`lib/features/movies/movie_detail_screen.dart`)

- `AppBar` with back navigation (implicit via system back / `go_router`).  
- Loads `VodInfo` for plot/metadata.  
- Hero-style layout: backdrop/poster, title, meta, plot, **`FilledButton` Play**.  
- Play respects **resume position** from `watchHistoryProvider`.

---

### 4.6 Series detail (`lib/features/series/series_detail_screen.dart`)

- Series metadata at top.  
- **Seasons** as selectable chips or sections.  
- **Episodes** as `ListTile` rows (title, plot snippet).  
- Episode tap → `/player` with episode stream URL and resume support.

---

### 4.7 Hub browse (`lib/features/browse/hub_browse_screen.dart`)

Full-screen grid for one hub row’s items.

- `AppBar(title: row title)`  
- `GridView`: `maxCrossAxisExtent: 180`, `childAspectRatio: 0.55`, 16px padding  
- Tiles use `HubPosterGridTile` → `PosterCard` without fixed row height.

---

### 4.8 Player (`lib/features/player/player_screen.dart`)

**Fullscreen black** `Scaffold`; video via `media_kit` `Video` widget.

#### Layers (bottom → top)

1. `Video` with custom controls: `iptvVideoControlsBuilder`  
2. `SafeArea` top overlay: back button, optional live **debug log** toggle, URL index label  
3. Buffering: centered white `CircularProgressIndicator`  
4. Error overlay: message + “Show debug log” + “Go back”  
5. Optional bottom **`DebugLogPanel`** (38% screen height) for live/VOD debug

**Back / PopScope:** Always stops playback and saves watch progress before pop.

#### Custom controls (`lib/features/player/iptv_video_controls.dart`)

Netflix-inspired **single overlay** that fades together (4s inactivity, mouse move shows).

**Bottom gradient:** black ~92% → transparent upward.

**When controls visible (top → bottom):**

1. **Optional `PlayerTrackMenu`** (if multiple audio/subtitle tracks)  
   - Two columns: **Audio** | **Subtitles**  
   - Large white headings; checklist selection  
   - **Off** for subtitles when available  
   - Toggled via `subtitles_outlined` icon (highlighted red when open)

2. **Seek bar** (VOD only; hidden for live)  
   - Duration label top-right (`mm:ss` / `hh:mm:ss`)  
   - Track: grey buffer, white buffer fill, **red** progress + thumb  
   - Click or drag to seek  

3. **Transport row**  
   - Left: Play/Pause (32px), ±10s (VOD), Volume/mute  
   - Center: **content title** (ellipsis)  
   - Right: Subtitles (if tracks exist), Speed cycle (0.75×–2×, VOD), Fullscreen  

**Interaction:** Tap video toggles play/pause when controls visible; tap shows controls when hidden. Transport bar absorbs taps (does not toggle play).

**Platform:** Uses `MaterialDesktopVideoControls`-style timing via custom implementation (not the stock overlay + separate track bar).

---

## 5. Component map (reuse checklist)

| Component | File | Use when |
|-----------|------|----------|
| `AppTheme.dark` | `app_theme.dart` | Always via `MaterialApp` |
| `CategoryBrowseLayout` | `category_browse_layout.dart` | Sidebar + grid browse (Live TV) |
| `HubSearchField` | `hub_search_field.dart` | Movies/Series search |
| `HubRowSliver` | `hub_row_sliver.dart` | Genre/provider rows |
| `ContinueWatchingSliver` | `continue_watching_sliver.dart` | Movies or Series hub top |
| `PosterCard` | `poster_card.dart` | Any portrait tile in a row |
| `HorizontalPosterRow` | `horizontal_poster_row.dart` | Scrollable poster strip |
| `ContentRow` | `content_row.dart` | Row title + See all |
| `HubSectionHeader` | `hub_section_header.dart` | “Provider categories” divider label |
| `ContentTile` | `category_browse_layout.dart` | Live TV grid cells |
| `DebugLogPanel` | `debug_log_panel.dart` | Login + player debug |
| `iptvVideoControlsBuilder` | `iptv_video_controls.dart` | Player only |

**Avoid** using `continue_watching_row.dart` in new code — prefer `ContinueWatchingSliver` in scroll views.

**Legacy / unused in main flows:** `streaming_hub_layout.dart` — do not extend unless consolidating.

---

## 6. Interaction & UX rules

### 6.1 Navigation

- **Movies/Series:** Hub → detail → player.  
- **Live:** Grid → player (no detail page).  
- **Logout:** App bar on home; clears credentials and invalidates content providers.

### 6.2 Search

| Tab | Behavior |
|-----|----------|
| Live | Load all items on first search; filter by channel name |
| Movies | Filter by title + genre (genres from background `vod_genre` cache) |
| Series | Filter by title, cast, genre fields on `SeriesItem` |

Empty search query restores normal hub/browse layout.

### 6.3 Images

- Remote posters: `cached_network_image`.  
- Missing URL: tinted surface + large outline icon (36px).

### 6.4 Focus & TV

- Wrap actionable posters/tiles in `DpadFocusable` where already established.  
- Primary border on focus (2px).  
- Do not enable `DpadNavigator` on desktop.

### 6.5 Dialogs

- Material `AlertDialog` for destructive actions (clear recently watched).  
- Cancel = `TextButton`, confirm = `FilledButton`.

---

## 7. Layout constants (quick reference)

| Constant | Value |
|----------|--------|
| Login card max width | 480px |
| Category sidebar width | 260px |
| Hub row height | 200px |
| Poster card width | 130px |
| Poster aspect ratio | 2:3 |
| Hub grid cell (search/browse) | max 180px, aspect 0.55 |
| Live grid cell | max 220px, aspect 0.72 |
| Hub search debounce | 300ms |
| Player controls auto-hide | 4s |
| Player seek accent | `#E50914` |

---

## 8. What not to change without explicit request

- Login debug log shows **plaintext credentials** (intentional for debugging).  
- Single dark theme only.  
- Live TV stays on **category + grid** layout (not hub rows).  
- Genre labels from provider (e.g. `Sci-Fi & Fantasy`) are **not** split on `&` — only on `,` `|` `/`.  
- Windows: no hot reload in dev workflow — full rebuild (see `AGENTS.md`).

---

## 9. File index (UI only)

```
lib/
├── app.dart                          # DpadNavigator, theme, window-close cleanup
├── core/
│   ├── config/
│   │   ├── app_info.dart             # kAppDisplayName
│   │   └── app_theme.dart            # AppTheme.dark
│   ├── router/app_router.dart
│   └── widgets/
│       ├── category_browse_layout.dart
│       ├── common_widgets.dart
│       ├── continue_watching_sliver.dart
│       ├── content_row.dart
│       ├── debug_log_panel.dart
│       ├── horizontal_poster_row.dart
│       ├── hub_row_sliver.dart
│       ├── hub_search_field.dart
│       ├── hub_section_header.dart
│       ├── hub_row_scroll_behavior.dart
│       └── poster_card.dart
└── features/
    ├── auth/login_screen.dart
    ├── browse/hub_browse_screen.dart
    ├── home/home_shell.dart
    ├── live/live_screen.dart
    ├── movies/movies_screen.dart, movie_detail_screen.dart
    ├── player/
    │   ├── player_screen.dart
    │   ├── iptv_video_controls.dart
    │   └── player_track_menu.dart
    └── series/series_screen.dart, series_detail_screen.dart
```

---

*Last updated to match the codebase as of the Netflix-style hub, custom player controls, and per-tab recently watched.*
