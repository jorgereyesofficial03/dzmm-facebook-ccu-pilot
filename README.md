# DZMM Facebook CCU Pilot

Browser-based Facebook **current concurrent viewer (CCU)** monitoring for the DZMM TeleRadyo Facebook Page.

## Release state

- **YouTube v1.2.0** — tested separately in Google Apps Script with `runTestAllNow`.
- **Facebook v1.3.0-alpha.3** — DZMM-only pilot using GitHub Actions + Playwright. No Google Cloud billing required. Manual test mode can probe immediately without waiting for an hourly window.
- Facebook does **not** modify the working YouTube automation until the pilot passes.

## Target

Facebook Page:

`https://www.facebook.com/DZMMTeleradyo.MSPC/`

The worker looks for the **current LIVE video** and reads the visible current-viewer number beside the LIVE / eye indicator.

## Manual test mode

Run the workflow with mode `manual_test` to make one immediate browser probe. This is for validation only.

## Hourly rule

For every scheduled hour from **5:00 AM through 12:00 PM, Asia/Manila**:

1. Start Facebook attempts at **+01 minute**.
2. Retry once per minute through **+15**.
3. The **first valid current-viewer count wins**.
4. Once a valid CCU is captured, stop checking DZMM Facebook for that hour.
5. If no valid count is obtained by +15:
   - send/log the final diagnostic;
   - leave that hour's Facebook cell blank;
   - do not backfill later;
   - resume at the next scheduled hour.

## Authentication rule

The worker may close a removable **"See more on Facebook"** overlay when the public live content remains accessible underneath.

It does **not** bypass a genuine Facebook login requirement. If Facebook blocks access behind authentication, the worker returns `FB_LOGIN_REQUIRED`.

## Components

- `src/facebook-probe.mjs` — Playwright browser worker.
- `.github/workflows/dzmm-facebook-ccu.yml` — manually/API-dispatched GitHub Action.
- `apps-script/facebook-callback.gs` — Google Apps Script web-app callback receiver.
- `apps-script/github-dispatch.gs` — Apps Script helper that starts the GitHub workflow at +01.

## GitHub Actions secrets

Later, add these repository secrets:

- `APPS_SCRIPT_CALLBACK_URL`
- `APPS_SCRIPT_CALLBACK_SECRET`

The callback URL and secret are **not** committed to this public repository.

## Diagnostics

- `OK`
- `FB_NO_LIVE`
- `FB_VIEWER_UNAVAILABLE`
- `FB_LOGIN_REQUIRED`
- `FB_TIMEOUT`
- `FB_ERROR`

Workflow runs also upload a diagnostic screenshot and JSON result as an artifact when available.

## Version history

### v1.3.0-alpha.3 — 2026-09-28
- Added immediate manual test mode.
- Scheduled +01 to +15 behavior remains unchanged.


### v1.3.0-alpha.2 — 2026-09-28
- Switched Facebook pilot from Cloud Run to no-billing GitHub Actions.
- DZMM Facebook only.
- +01 to +15 retry window.
- First valid CCU wins; no late backfill.

### v1.3.0-alpha.1 — 2026-09-28
- Initial Playwright browser-worker design for Cloud Run; not deployed.
