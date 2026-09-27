# Facebook CCU Multi-Channel Automation

Browser-based Facebook **current concurrent viewer (CCU)** monitoring for the radio stations in the CCU Google Sheet.

## Version

**v1.4.0-alpha.2 — Multi-channel test build**

YouTube automation remains separate.

## Facebook stations

- DZMM TeleRadyo — https://www.facebook.com/DZMMTeleradyo.MSPC/
- DZBB Super Radyo — https://www.facebook.com/dzbb594/
- DZRH — https://www.facebook.com/dzrhnews/
- DWWW — https://www.facebook.com/DWWW774/
- DWXI — https://www.facebook.com/dwxi1314khz/
- DZRV / Veritas PH — https://www.facebook.com/DZRV846/

For Facebook, the rule is **ANY current LIVE** on the configured Page.

## Production capture rule

For each scheduled hour from **5:00 AM through 12:00 PM, Asia/Manila**:

1. Apps Script dispatches one GitHub workflow per station from **+01**.
2. Each workflow retries its own Page until a valid current-viewer count is found.
3. First successful viewer count wins for that station/hour.
4. Last attempt boundary is **+15**.
5. If no valid count is available by +15, the Facebook cell remains blank for that hour.
6. No late backfill; next scheduled hour starts fresh.

## Manual test

Use Apps Script function:

`testFacebookAllDispatchNow()`

It launches six `manual_test` workflows. Manual tests write diagnostics to LOG but do not write production Facebook CCU cells.

## Callback row mapping

- DZMM → row 6
- DZBB → row 7
- DZRH → row 9
- DWWW → row 10
- DWXI → row 11
- DZRV / Veritas PH → row 12

## Authentication rule

The worker may close a removable **"See more on Facebook"** overlay if public content remains accessible. It does not bypass a genuine login requirement.

## Multi-channel test checkpoint — 2026-09-28

Passed current-live detection + viewer extraction:
- DZMM TeleRadyo
- DZBB Super Radyo
- DZRH
- DWWW
- DZRV / Veritas PH

DWXI initially selected an old video because Facebook's navigation word "Live" was too broad a discovery signal. v1.4.0-alpha.2 tightens discovery to require either "is live now" or a "LIVE:" title/context before a /videos/ link is accepted.

## Diagnostics

- `OK`
- `FB_NO_LIVE`
- `FB_VIEWER_UNAVAILABLE`
- `FB_LOGIN_REQUIRED`
- `FB_TIMEOUT`
- `FB_ERROR`

## Secrets

GitHub Actions secrets:

- `APPS_SCRIPT_CALLBACK_URL`
- `APPS_SCRIPT_CALLBACK_SECRET`

Apps Script Script Properties:

- `FB_CALLBACK_SECRET`
- `GITHUB_ACTIONS_TOKEN`
