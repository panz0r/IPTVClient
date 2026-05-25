# LG Content Store submission pack

Templates and checklists for publishing **Peders fantastiska IPTV spelare** on the LG Content Store.

## Before you submit

1. Register at [LG Seller Lounge](https://seller.lgappstv.com/)
2. Build a release `.ipk` from [`../../README.md`](../../README.md)
3. Test on **physical TVs** with Magic Remote and standard remote
4. Prepare a **test Xtream account** for LG QA (no real user passwords)

## Required artifacts

| File | Description |
|------|-------------|
| `com.iptv.player_*.ipk` | Packaged app (`npm run package`) |
| Self-checklist | Download Excel from Seller Lounge → Self Check-List |
| `UX_SCENARIO.md` | Convert to PPT per LG template (outline provided) |
| `PLAYER_SPEC.md` | Copy into Seller Lounge player specification fields |
| App icons / backgrounds | See `GRAPHICS.md` for exact resolutions |

## App positioning (IPTV)

- Describe the app as a **generic Xtream Codes client** where users enter **their own** provider credentials.
- Include a short privacy note: credentials stored locally on the TV (`localStorage`).
- Do not bundle provider URLs, playlists, or copyrighted channel logos in store metadata.

## Alpha test (recommended before full submission)

1. Seller Lounge → Alpha test
2. Register TV **wired MAC** address (up to 100 devices)
3. Upload test IPK; max 30-day period
4. Terminate alpha test before final submission if status is "Publish"

## Links

- [Seller user guide](https://seller.lgappstv.com/seller/support/userGuide/RetrieveUserGuide.lge)
- [webOS TV app test guide](https://webostv.developer.lge.com/develop/getting-started/app-test)
