# Facebook CCU Multi-Channel Automation

Browser-based Facebook current concurrent viewer (CCU) monitoring for six radio/media Pages.

## Version

**v1.6.0-alpha.1 — program-schedule aware**

## Scheduling

The automation no longer assumes one checkpoint every hour.

It reads the **PROGRAM SCHEDULE** sheet and uses the actual DZMM program **start time** for each day type:

- Weekday
- Saturday
- Sunday

Only program starts from **4:00 AM through 10:00 PM** are recorded.

For every configured program start:

1. Wait 15 minutes after the program begins.
2. Dispatch one GitHub workflow per Facebook station.
3. Retry through +20.
4. First valid current-viewer count wins.
5. If no valid CCU is found by +20, leave that station/slot blank.
6. Duplicate program rows with the same start time use one CCU checkpoint.

This supports non-hourly starts such as 7:30 AM, 12:30 PM, 5:45 PM, 7:15 AM, 8:30 PM, etc.

## Output

Results write directly to the existing **LIVE STREAM – MULTI-CHANNEL CCU AUTOMATION** table.

The callback locates the exact program-start header and writes to its Facebook subcolumn.

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

Apps Script:
- `FB_CALLBACK_SECRET`
- `GITHUB_ACTIONS_TOKEN`
