/**
 * DZMM Facebook GitHub dispatcher — v1.3.0-alpha.5
 * Timezone: Asia/Manila
 *
 * Keeps YouTube v1.2.0 separate.
 *
 * Script Property required:
 * GITHUB_ACTIONS_TOKEN
 *
 * Fine-grained GitHub token:
 * Repository: jorgereyesofficial03/dzmm-facebook-ccu-pilot
 * Repository permission: Actions = Read and write
 */

const FB_DZMM = {
  TZ: 'Asia/Manila',
  START_HOUR: 5,
  END_HOUR: 12,
  START_MINUTE: 1,
  END_MINUTE: 15,
  MAIN_SHEET: 'LIVE STREAM',
  LOG_SHEET: 'LOG',
  DZMM_ROW: 6,
  REPO: 'jorgereyesofficial03/dzmm-facebook-ccu-pilot',
  WORKFLOW: 'dzmm-facebook-ccu.yml',
  VERSION: 'v1.3.0-alpha.5'
};

function dispatchDzmmFacebookWorkflow_(slotHour, mode) {
  mode = mode || 'scheduled_window';
  const token =
    PropertiesService.getScriptProperties().getProperty('GITHUB_ACTIONS_TOKEN') || '';

  if (!token) {
    throw new Error('Missing GITHUB_ACTIONS_TOKEN Script Property.');
  }

  const url =
    'https://api.github.com/repos/' + FB_DZMM.REPO +
    '/actions/workflows/' + FB_DZMM.WORKFLOW + '/dispatches';

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
        mode: mode,
        slot_hour: String(slotHour),
        retry_end_minute: String(FB_DZMM.END_MINUTE)
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

function facebookDzmmDispatchScheduler() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, FB_DZMM.TZ, 'H'));
  const minute = Number(Utilities.formatDate(now, FB_DZMM.TZ, 'm'));

  if (hour < FB_DZMM.START_HOUR || hour > FB_DZMM.END_HOUR) return;
  if (minute < FB_DZMM.START_MINUTE || minute > FB_DZMM.END_MINUTE) return;

  const dateKey = Utilities.formatDate(now, FB_DZMM.TZ, 'yyyy-MM-dd');
  cleanupOldFacebookDispatchFlags_(dateKey);

  const props = PropertiesService.getScriptProperties();
  const dispatchKey =
    'FB_DZMM_DISPATCH_' + dateKey + '_' + String(hour).padStart(2, '0');

  if (props.getProperty(dispatchKey) === '1') return;

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_DZMM.MAIN_SHEET);
  if (!sh) throw new Error('Missing sheet: ' + FB_DZMM.MAIN_SHEET);

  // Facebook columns: C,E,G,I,K,M,O,Q for 5AM..12PM.
  const fbCol = 3 + ((hour - FB_DZMM.START_HOUR) * 2);
  const target = sh.getRange(FB_DZMM.DZMM_ROW, fbCol);

  // If this hour already has a Facebook CCU, lock the dispatch flag and do nothing.
  if (target.getValue() !== '') {
    props.setProperty(dispatchKey, '1');
    return;
  }

  try {
    dispatchDzmmFacebookWorkflow_(hour, 'scheduled_window');
    props.setProperty(dispatchKey, '1');

    appendFacebookDispatchLog_(
      now,
      hour,
      dateKey,
      'DISPATCHED',
      'GitHub scheduled_window started automatically.'
    );
  } catch (err) {
    // Do not set the dispatch flag on failure.
    // The every-minute trigger can retry within +01..+15.
    appendFacebookDispatchLog_(
      now,
      hour,
      dateKey,
      'DISPATCH_ERROR',
      err && err.message ? err.message : String(err)
    );
    throw err;
  }
}

function setupFacebookDzmmAutomation() {
  removeFacebookDzmmAutomation();

  ScriptApp.newTrigger('facebookDzmmDispatchScheduler')
    .timeBased()
    .everyMinutes(1)
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'DZMM Facebook automation installed — first dispatch from +01 through +15, ' +
    'then GitHub retries until first valid CCU or +15.',
    'Facebook CCU ' + FB_DZMM.VERSION,
    10
  );
}

function removeFacebookDzmmAutomation() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'facebookDzmmDispatchScheduler') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function testFacebookDzmmDispatchNow() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, FB_DZMM.TZ, 'H'));

  if (hour < FB_DZMM.START_HOUR || hour > FB_DZMM.END_HOUR) {
    throw new Error('Current PHT hour is outside 5:00 AM–12:00 PM.');
  }

  // Manual test ignores the +01..+15 production window and never writes a
  // production Facebook CCU cell because the callback receives testMode=true.
  dispatchDzmmFacebookWorkflow_(hour, 'manual_test');

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Manual GitHub Facebook test dispatched for ' +
    formatFacebookSlot_(hour) + '. Production Facebook cell will stay unchanged.',
    'Facebook CCU Test',
    10
  );
}

function resetFacebookDzmmDispatchThisHour() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, FB_DZMM.TZ, 'H'));
  const dateKey = Utilities.formatDate(now, FB_DZMM.TZ, 'yyyy-MM-dd');

  PropertiesService.getScriptProperties().deleteProperty(
    'FB_DZMM_DISPATCH_' + dateKey + '_' + String(hour).padStart(2, '0')
  );

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Facebook dispatch flag reopened for ' + formatFacebookSlot_(hour) + '.',
    'Facebook CCU',
    8
  );
}

function cleanupOldFacebookDispatchFlags_(dateKey) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();

  Object.keys(all).forEach(key => {
    if (
      key.indexOf('FB_DZMM_DISPATCH_') === 0 &&
      key.indexOf('FB_DZMM_DISPATCH_' + dateKey + '_') !== 0
    ) {
      props.deleteProperty(key);
    }
  });
}

function appendFacebookDispatchLog_(now, hour, dateKey, status, notes) {
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_DZMM.LOG_SHEET);
  if (!log) return;

  log.appendRow([
    Utilities.formatDate(now, FB_DZMM.TZ, 'yyyy-MM-dd HH:mm:ss'),
    formatFacebookSlot_(hour),
    dateKey,
    'DZMM TeleRadyo',
    'Facebook',
    '',
    '',
    '',
    status,
    notes
  ]);
}

function formatFacebookSlot_(hour) {
  return hour === 12 ? '12:00 PM' : hour + ':00 AM';
}
