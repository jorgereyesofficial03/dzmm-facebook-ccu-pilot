/**
 * Facebook multi-channel GitHub dispatcher — v1.5.0-alpha.1
 * Timezone: Asia/Manila
 *
 * Production hours: 4:00 AM through 10:00 PM.
 * Each hourly slot starts checking at +15 and may retry through +20.
 *
 * Script Property required:
 * GITHUB_ACTIONS_TOKEN
 */

const FB_MULTI = {
  TZ: 'Asia/Manila',
  START_HOUR: 4,
  END_HOUR: 22,
  START_MINUTE: 15,
  END_MINUTE: 20,
  MAIN_SHEET: 'LIVE STREAM',
  LOG_SHEET: 'LOG',
  EXTENDED_DATE_CELL: 'B73',
  EXTENDED_HEADER_ROW: 74,
  EXTENDED_FIRST_VALUE_COL: 2,
  REPO: 'jorgereyesofficial03/dzmm-facebook-ccu-pilot',
  WORKFLOW: 'dzmm-facebook-ccu.yml',
  VERSION: 'v1.5.0-alpha.1',
  CHANNELS: [
    { key: 'dzmm', channel: 'DZMM TeleRadyo', extendedRow: 75 },
    { key: 'dzbb', channel: 'DZBB Super Radyo', extendedRow: 76 },
    { key: 'dzrh', channel: 'DZRH', extendedRow: 77 },
    { key: 'dwww', channel: 'DWWW', extendedRow: 78 },
    { key: 'dwxi', channel: 'DWXI', extendedRow: 79 },
    { key: 'dzrv', channel: 'DZRV / Veritas PH', extendedRow: 80 }
  ]
};

function dispatchFacebookWorkflow_(stationKey, slotHour, mode) {
  mode = mode || 'scheduled_window';

  const token =
    PropertiesService.getScriptProperties().getProperty('GITHUB_ACTIONS_TOKEN') || '';

  if (!token) {
    throw new Error('Missing GITHUB_ACTIONS_TOKEN Script Property.');
  }

  const url =
    'https://api.github.com/repos/' + FB_MULTI.REPO +
    '/actions/workflows/' + FB_MULTI.WORKFLOW + '/dispatches';

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
        station_key: String(stationKey),
        mode: mode,
        slot_hour: String(slotHour),
        retry_end_minute: String(FB_MULTI.END_MINUTE)
      }
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 204) {
    throw new Error(
      stationKey + ' GitHub dispatch failed: HTTP ' +
      response.getResponseCode() + ' ' +
      response.getContentText()
    );
  }
}

function facebookAllDispatchScheduler() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, FB_MULTI.TZ, 'H'));
  const minute = Number(Utilities.formatDate(now, FB_MULTI.TZ, 'm'));

  if (hour < FB_MULTI.START_HOUR || hour > FB_MULTI.END_HOUR) return;
  if (minute < FB_MULTI.START_MINUTE || minute > FB_MULTI.END_MINUTE) return;

  const dateKey = Utilities.formatDate(now, FB_MULTI.TZ, 'yyyy-MM-dd');
  cleanupOldFacebookDispatchFlags_(dateKey);
  prepareFacebookExtendedTable_(now);

  const props = PropertiesService.getScriptProperties();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_MULTI.MAIN_SHEET);

  if (!sh) throw new Error('Missing sheet: ' + FB_MULTI.MAIN_SHEET);

  const extendedCol =
    FB_MULTI.EXTENDED_FIRST_VALUE_COL +
    (hour - FB_MULTI.START_HOUR);

  FB_MULTI.CHANNELS.forEach(cfg => {
    const dispatchKey =
      'FB_DISPATCH_' + cfg.key + '_' + dateKey + '_' +
      String(hour).padStart(2, '0');

    if (props.getProperty(dispatchKey) === '1') return;

    const target = sh.getRange(cfg.extendedRow, extendedCol);

    if (target.getValue() !== '') {
      props.setProperty(dispatchKey, '1');
      return;
    }

    try {
      dispatchFacebookWorkflow_(cfg.key, hour, 'scheduled_window');
      props.setProperty(dispatchKey, '1');

      appendFacebookDispatchLog_(
        now,
        hour,
        dateKey,
        cfg.channel,
        'DISPATCHED',
        'GitHub scheduled_window started automatically at +' +
        String(FB_MULTI.START_MINUTE).padStart(2, '0') +
        ' for ' + cfg.key + '.'
      );
    } catch (err) {
      // Keep flag open; the every-minute trigger can retry the GitHub dispatch
      // itself through +20 if the dispatch request fails.
      appendFacebookDispatchLog_(
        now,
        hour,
        dateKey,
        cfg.channel,
        'DISPATCH_ERROR',
        err && err.message ? err.message : String(err)
      );
    }
  });
}

function setupFacebookAllAutomation() {
  removeFacebookAllAutomation();

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'facebookDzmmDispatchScheduler') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  prepareFacebookExtendedTable_(new Date());

  ScriptApp.newTrigger('facebookAllDispatchScheduler')
    .timeBased()
    .everyMinutes(1)
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Facebook multi-channel automation installed for 6 stations, 4:00 AM-10:00 PM. ' +
    'Each hourly slot starts at +15 and retries through +20.',
    'Facebook CCU ' + FB_MULTI.VERSION,
    10
  );
}

function removeFacebookAllAutomation() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'facebookAllDispatchScheduler') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function testFacebookAllDispatchNow() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, FB_MULTI.TZ, 'H'));

  if (hour < FB_MULTI.START_HOUR || hour > FB_MULTI.END_HOUR) {
    throw new Error('Current PHT hour is outside 4:00 AM-10:00 PM.');
  }

  let dispatched = 0;
  let failed = 0;
  const failures = [];

  FB_MULTI.CHANNELS.forEach(cfg => {
    try {
      dispatchFacebookWorkflow_(cfg.key, hour, 'manual_test');
      dispatched++;
    } catch (err) {
      failed++;
      failures.push(cfg.key + ': ' + (err && err.message ? err.message : String(err)));
    }
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Facebook manual tests dispatched: ' + dispatched +
    '; dispatch failures: ' + failed + '. Check GitHub Actions + LOG.',
    'Facebook CCU Multi-Channel Test',
    10
  );

  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
}

function resetFacebookAllDispatchThisHour() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, FB_MULTI.TZ, 'H'));
  const dateKey = Utilities.formatDate(now, FB_MULTI.TZ, 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();

  FB_MULTI.CHANNELS.forEach(cfg => {
    props.deleteProperty(
      'FB_DISPATCH_' + cfg.key + '_' + dateKey + '_' +
      String(hour).padStart(2, '0')
    );
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'All Facebook dispatch flags reopened for ' + formatFacebookSlot_(hour) + '.',
    'Facebook CCU',
    8
  );
}

function prepareFacebookExtendedTable_(now) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_MULTI.MAIN_SHEET);
  if (!sh) throw new Error('Missing sheet: ' + FB_MULTI.MAIN_SHEET);

  syncFacebookExtendedHeaders_();

  const dateDisplay = Utilities.formatDate(now, FB_MULTI.TZ, 'dd-MMM-yyyy');
  const dateCell = sh.getRange(FB_MULTI.EXTENDED_DATE_CELL);
  const current = String(dateCell.getDisplayValue()).trim();

  if (current !== dateDisplay) {
    dateCell.setValue(dateDisplay);

    const width = FB_MULTI.END_HOUR - FB_MULTI.START_HOUR + 1;
    sh.getRange(
      FB_MULTI.CHANNELS[0].extendedRow,
      FB_MULTI.EXTENDED_FIRST_VALUE_COL,
      FB_MULTI.CHANNELS.length,
      width
    ).clearContent();
  }
}

function syncFacebookExtendedHeaders_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_MULTI.MAIN_SHEET);
  if (!sh) return;

  const values = [];
  for (let hour = FB_MULTI.START_HOUR; hour <= FB_MULTI.END_HOUR; hour++) {
    values.push(formatFacebookSlot_(hour));
  }

  sh.getRange(
    FB_MULTI.EXTENDED_HEADER_ROW,
    FB_MULTI.EXTENDED_FIRST_VALUE_COL,
    1,
    values.length
  ).setValues([values]);
}

function cleanupOldFacebookDispatchFlags_(dateKey) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();

  Object.keys(all).forEach(key => {
    if (
      key.indexOf('FB_DISPATCH_') === 0 &&
      key.indexOf('_'+ dateKey + '_') === -1
    ) {
      props.deleteProperty(key);
    }

    if (
      key.indexOf('FB_DZMM_DISPATCH_') === 0 &&
      key.indexOf('FB_DZMM_DISPATCH_' + dateKey + '_') !== 0
    ) {
      props.deleteProperty(key);
    }
  });
}

function appendFacebookDispatchLog_(now, hour, dateKey, channel, status, notes) {
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_MULTI.LOG_SHEET);
  if (!log) return;

  log.appendRow([
    Utilities.formatDate(now, FB_MULTI.TZ, 'yyyy-MM-dd HH:mm:ss'),
    formatFacebookSlot_(hour),
    dateKey,
    channel,
    'Facebook',
    '',
    '',
    '',
    status,
    notes
  ]);
}

function formatFacebookSlot_(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  let h = hour % 12;
  if (h === 0) h = 12;
  return h + ':00 ' + suffix;
}
