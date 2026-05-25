# Self-checklist notes

LG provides an Excel **Self Check-List** from Seller Lounge. Download the current template from your seller account and mark each item **PASS**, **FAIL**, or **N/A**.

## Items this app addresses

| Area | Status | Notes |
|------|--------|-------|
| App launches from launcher | PASS | `appinfo.json` main → `index.html` |
| Back key behavior | PASS | Back closes player/series before exit |
| Network required | PASS | Xtream API + streams over HTTP(S) |
| 1920×1080 UI | PASS | CSS safe margins, `resolution` in manifest |
| Remote navigation | PASS | D-pad focus + Enter; Magic Remote click on tiles |
| No unexpected exit | PASS | Back stack in `appState.handleBack()` |
| Video playback | PASS | HTML5 video + HLS native; URL failover |
| Login / logout | PASS | Credentials in localStorage |

## Common FAIL causes to avoid

- Wrong icon dimensions or transparency rules
- Missing test account in Test Info section
- UX Scenario PPT missing Back-key flow
- Player spec left blank or mismatched with actual streams

Fill the official Excel file at submission time; do not upload this markdown file as a substitute.
