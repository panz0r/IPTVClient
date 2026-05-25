# Player specification (Seller Lounge)

Use these values when LG Seller Lounge asks for streaming/codec details. Adjust if your test provider uses different formats.

## DRM

| Field | Value |
|-------|-------|
| DRM | None (clear streams) |

If your provider uses encrypted streams, update after integrating webOS DRM Service.

## Streaming protocol

| Field | Value |
|-------|-------|
| Protocol | HLS (HTTP Live Streaming) |
| Container | MPEG-TS (`.ts` fallback) |
| VoD container | MP4 (typical Xtream `movie` URLs) |

## Video codec

| Field | Value |
|-------|-------|
| Codec | H.264 / AVC |

## Audio codec

| Field | Value |
|-------|-------|
| Codec | AAC |

## Test assets for QA

Provide LG testers with:

1. **Test server URL** (base URL only)
2. **Test username / password**
3. One **live channel** name that should play
4. One **movie** title that should play
5. One **series** with at least one episode

Example note for testers:

> Enter the supplied URL in the Server URL field (not `/player_api.php`). Use Connect, then open Live TV and play the channel named “[CHANNEL]”.
