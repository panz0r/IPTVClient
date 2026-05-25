# UX scenario (outline for Seller Lounge PPT)

Copy each slide title and bullets into LG’s UX Scenario PowerPoint template.

## Slide 1 — Launch

- User opens **Peders fantastiska IPTV spelare** from the LG app launcher.
- If saved credentials exist, app auto-connects; otherwise login screen is shown.

## Slide 2 — Login

- User enters **Server URL** (base URL only, e.g. `http://host:8080`).
- User enters **username** and **password**.
- User selects **Connect**.
- Connection log panel shows HTTP request/response for troubleshooting.
- On failure: error message stays on screen; user can edit fields and retry.

## Slide 3 — Home / Live TV

- Top tabs: **Live TV**, **Movies**, **Series**.
- Live TV: category list (left), channel grid (right).
- User moves focus with **arrow keys**; OK/Enter opens a channel.
- Search field filters channels across the full lineup.

## Slide 4 — Playback

- Full-screen video with title overlay.
- Back button returns to browse (does not exit app).
- If first stream URL fails, app tries fallback URLs automatically.
- Optional debug log toggle on player screen.

## Slide 5 — Movies

- Search movies by title.
- **Continue watching** row when resume data exists.
- Select movie → playback with resume support.

## Slide 6 — Series

- Search series by title.
- Open series → season/episode list.
- Select episode → playback.

## Slide 7 — Logout

- **Log out** clears saved credentials and returns to login.

## Remote controls tested

- Standard remote: arrows, OK, Back
- Magic Remote: pointer click on tiles (optional), Back
