# Facebook CCU Multi-Channel Automation

Browser-based Facebook **current concurrent viewer (CCU)** monitoring for six radio/media Pages.

## Version

**v1.5.0-alpha.2**

The Facebook automation now writes directly into the existing **LIVE STREAM — MULTI-CHANNEL CCU AUTOMATION** table.

## Production capture rule

For every hourly slot from **4:00 AM through 10:00 PM, Asia/Manila**:

1. Apps Script waits until **+15** after the hour.
2. It dispatches one GitHub workflow per station.
3. Each workflow retries through **+20**.
4. First valid current-viewer count wins for that station/hour.
5. No valid count by +20 = leave the cell blank.
6. No late backfill; the next hourly slot starts fresh.

Examples:

- 4:00 AM slot → 4:15-4:20 AM
- 4:00 PM slot → 4:15-4:20 PM
- 10:00 PM slot → 10:15-10:20 PM

## Main Google Sheet layout

The existing LIVE STREAM table covers **4:00 AM-10:00 PM**.

Each hour has two subcolumns:

- YouTube
- Facebook

Regular YouTube automation remains scheduled for **5:00 AM-12:00 PM**. Facebook is scheduled for **4:00 AM-10:00 PM**.

## Facebook stations

- DZMM TeleRadyo
- DZBB Super Radyo
- DZRH
- DWWW
- DWXI
- DZRV / Veritas PH

DZBB GMA News remains YouTube-only.

## Secrets

GitHub Actions:

- `APPS_SCRIPT_CALLBACK_URL`
- `APPS_SCRIPT_CALLBACK_SECRET`

Apps Script Script Properties:

- `FB_CALLBACK_SECRET`
- `GITHUB_ACTIONS_TOKEN`
