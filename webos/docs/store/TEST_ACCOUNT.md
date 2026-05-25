# Test account template (Seller Lounge → Test Info)

Copy into LG Seller Lounge when submitting for QA.

```
Service type: Xtream Codes IPTV (user-provided credentials)

Server URL: [YOUR_TEST_SERVER_BASE_URL]
  Example: http://example.com:8080
  Note: Enter base URL only — do NOT include /player_api.php

Username: [TEST_USERNAME]
Password: [TEST_PASSWORD]

Suggested test flow:
1. Launch app → Login screen
2. Enter credentials above → Connect
3. Live TV → pick any category → play first channel
4. Movies → search or scroll → play a title
5. Series → open a series → play an episode
6. Press Back on remote to return from player

Test streams:
- Live: [CHANNEL_NAME]
- Movie: [MOVIE_TITLE]
- Series: [SERIES_NAME] / S01E01

Additional notes:
- App stores credentials locally on the TV (localStorage).
- No bundled playlists; user must supply their own provider.
```
