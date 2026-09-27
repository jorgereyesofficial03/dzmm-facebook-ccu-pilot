/**
 * GitHub Actions dispatcher — v1.3.0-alpha.2
 *
 * Script Properties required:
 * GITHUB_ACTIONS_TOKEN
 *
 * Fine-grained token:
 * Repository: jorgereyesofficial03/dzmm-facebook-ccu-pilot
 * Repository permission: Actions = Read and write
 */

function dispatchDzmmFacebookWorkflow_(slotHour) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_ACTIONS_TOKEN') || '';

  if (!token) {
    throw new Error('Missing GITHUB_ACTIONS_TOKEN Script Property.');
  }

  const url =
    'https://api.github.com/repos/jorgereyesofficial03/dzmm-facebook-ccu-pilot/' +
    'actions/workflows/dzmm-facebook-ccu.yml/dispatches';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    contentType: 'application/json',
    payload: JSON.stringify({
      ref: 'main',
      inputs: {
        slot_hour: String(slotHour),
        retry_end_minute: '15'
      }
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 204) {
    throw new Error(
      'GitHub dispatch failed: HTTP ' +
      response.getResponseCode() + ' ' +
      response.getContentText()
    );
  }
}

/**
 * Manual test helper.
 * Use only while the current PHT hour is one of 5..12.
 */
function testDispatchDzmmFacebookNow() {
  const hour = Number(Utilities.formatDate(new Date(), 'Asia/Manila', 'H'));

  if (hour < 5 || hour > 12) {
    throw new Error('Current PHT hour is outside 5:00 AM–12:00 PM.');
  }

  dispatchDzmmFacebookWorkflow_(hour);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'DZMM Facebook GitHub Action dispatched for ' +
    (hour === 12 ? '12:00 PM' : hour + ':00 AM') + '.',
    'Facebook CCU Pilot',
    10
  );
}
