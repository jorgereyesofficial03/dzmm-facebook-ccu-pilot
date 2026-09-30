# Facebook CCU Multi-Channel Automation

Browser-based Facebook **current concurrent viewer (CCU)** monitoring for six radio/media Pages.

## Version

**v1.5.0-alpha.1**

YouTube automation remains separate.

## Facebook stations

- DZMM TeleRadyo
- DZBB Super Radyo
- DZRH
- DWWW
- DWXI
- DZRV / Veritas PH

For Facebook, the rule is **ANY current LIVE** on the configured Page.

## Production capture rule

For every hourly slot from **4:00 AM through 10:00 PM, Asia/Manila**:

1. The Apps Script scheduler waits until **+15 minutes** after the hour.
2. At +15 it dispatches one GitHub workflow per station.
3. Each workflow retries until a valid current-viewer count is found or the clock reaches **+20**.
4. The first successful viewer count wins for that station/hour.
5. If no valid count is available by +20, that station/hour remains blank.
6. No late backfill; the next hourly slot starts fresh.

Example:

- 4:00 AM slot → first check around 4:15 AM → retry through 4:20 AM.
- 4:00 PM slot → first check around 4:15 PM → retry through 4:20 PM.
- 10:00 PM slot → first check around 10:15 PM → retry through 10:20 PM.

## Google Sheet output

The primary Facebook extended table is on the **LIVE STREAM** sheet and covers **4:00 AM-10:00 PM**.

The existing combined YouTube/Facebook table for **5:00 AM-12:00 PM** is retained as a legacy mirror for Facebook, so the current daily report remains compatible.

## Manual test

Use Apps Script:

`testFacebookAllDispatchNow()`

Manual tests write diagnostics to LOG but do not write production Facebook cells.

## Secrets

GitHub Actions secrets:

- `APPS_SCRIPT_CALLBACK_URL`
- `APPS_SCRIPT_CALLBACK_SECRET`

Apps Script Script Properties:

- `FB_CALLBACK_SECRET`
- `GITHUB_ACTIONS_TOKEN`
