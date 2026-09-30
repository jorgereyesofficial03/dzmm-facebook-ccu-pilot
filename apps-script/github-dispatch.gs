/**
 * Facebook multi-channel GitHub dispatcher — v1.6.0-alpha.1
 * Timezone: Asia/Manila
 *
 * Schedule source: PROGRAM SCHEDULE sheet.
 * Weekday/Saturday/Sunday program START times are used as CCU checkpoints.
 * Only starts from 4:00 AM through 10:00 PM are monitored.
 * Each slot dispatches at +15 and retries through +20.
 *
 * Script Property required:
 * GITHUB_ACTIONS_TOKEN
 */

const FB_MULTI = {
  TZ: 'Asia/Manila',
  SCHEDULE_SHEET: 'PROGRAM SCHEDULE',
  MAIN_SHEET: 'LIVE STREAM',
  LOG_SHEET: 'LOG',
  START_OFFSET: 15,
  END_OFFSET: 20,
  MIN_START: 4 * 60,
  MAX_START: 22 * 60,
  REPO: 'jorgereyesofficial03/dzmm-facebook-ccu-pilot',
  WORKFLOW: 'dzmm-facebook-ccu.yml',
  VERSION: 'v1.6.0-alpha.1',
  CHANNELS: [
    { key: 'dzmm', channel: 'DZMM TeleRadyo', row: 6 },
    { key: 'dzbb', channel: 'DZBB Super Radyo', row: 7 },
    { key: 'dzrh', channel: 'DZRH', row: 9 },
    { key: 'dwww', channel: 'DWWW', row: 10 },
    { key: 'dwxi', channel: 'DWXI', row: 11 },
    { key: 'dzrv', channel: 'DZRV / Veritas PH', row: 12 }
  ]
};

function dispatchFacebookWorkflow_(stationKey, slot, mode) {
  mode = mode || 'scheduled_window';

  const token =
    PropertiesService.getScriptProperties().getProperty('GITHUB_ACTIONS_TOKEN') || '';
  if (!token) throw new Error('Missing GITHUB_ACTIONS_TOKEN Script Property.');

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
        slot_key: slot.key,
        slot_label: slot.label,
        slot_date: slot.dateKey,
        window_end_minute_of_day: String(slot.windowEnd)
      }
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 204) {
    throw new Error(
      stationKey + ' GitHub dispatch failed: HTTP ' +
      response.getResponseCode() + ' ' + response.getContentText()
    );
  }
}

function facebookAllDispatchScheduler() {
  const now = new Date();
  const slot = fbFindActiveProgramSlot_(now);
  if (!slot) return;

  const dateKey = slot.dateKey;
  cleanupOldFacebookDispatchFlags_(dateKey);

  const props = PropertiesService.getScriptProperties();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_MULTI.MAIN_SHEET);
  if (!sh) throw new Error('Missing sheet: ' + FB_MULTI.MAIN_SHEET);

  const fbCol = fbFindPlatformColumn_(sh, slot.label, 'Facebook');
  if (!fbCol) throw new Error('Facebook column not found for slot ' + slot.label);

  FB_MULTI.CHANNELS.forEach(cfg => {
    const dispatchKey =
      'FB_DISPATCH_' + cfg.key + '_' + dateKey + '_' + slot.key;

    if (props.getProperty(dispatchKey) === '1') return;

    const target = sh.getRange(cfg.row, fbCol);
    if (target.getValue() !== '') {
      props.setProperty(dispatchKey, '1');
      return;
    }

    try {
      dispatchFacebookWorkflow_(cfg.key, slot, 'scheduled_window');
      props.setProperty(dispatchKey, '1');

      appendFacebookDispatchLog_(
        now, slot, cfg.channel, 'DISPATCHED',
        'GitHub scheduled_window started for ' + cfg.key +
        ' at +' + FB_MULTI.START_OFFSET + ' after program start.'
      );
    } catch (err) {
      appendFacebookDispatchLog_(
        now, slot, cfg.channel, 'DISPATCH_ERROR',
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

  ScriptApp.newTrigger('facebookAllDispatchScheduler')
    .timeBased()
    .everyMinutes(1)
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Facebook schedule-aware automation installed. ' +
    'Program starts from 4:00 AM-10:00 PM; capture window is +15 to +20.',
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
  const slots = fbLoadTodaySlots_(now);
  if (!slots.length) throw new Error('No configured program slots for today.');

  const current = fbMinuteOfDay_(now);
  let slot = slots.filter(s => s.start <= current).slice(-1)[0] || slots[0];

  let dispatched = 0;
  const failures = [];

  FB_MULTI.CHANNELS.forEach(cfg => {
    try {
      dispatchFacebookWorkflow_(cfg.key, slot, 'manual_test');
      dispatched++;
    } catch (err) {
      failures.push(cfg.key + ': ' + (err && err.message ? err.message : String(err)));
    }
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Facebook manual tests dispatched: ' + dispatched +
    '. Test slot: ' + slot.label + '.',
    'Facebook CCU Multi-Channel Test',
    10
  );

  if (failures.length) throw new Error(failures.join('\n'));
}

function resetFacebookCurrentSlot() {
  const now = new Date();
  const slot = fbFindActiveProgramSlot_(now);
  if (!slot) throw new Error('No active +15..+20 program capture window right now.');

  const props = PropertiesService.getScriptProperties();
  FB_MULTI.CHANNELS.forEach(cfg => {
    props.deleteProperty(
      'FB_DISPATCH_' + cfg.key + '_' + slot.dateKey + '_' + slot.key
    );
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Facebook dispatch flags reopened for ' + slot.label + '.',
    'Facebook CCU',
    8
  );
}

function fbFindActiveProgramSlot_(now) {
  const current = fbMinuteOfDay_(now);
  const slots = fbLoadTodaySlots_(now);

  return slots.find(slot =>
    current >= slot.windowStart &&
    current <= slot.windowEnd
  ) || null;
}

function fbLoadTodaySlots_(now) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FB_MULTI.SCHEDULE_SHEET);
  if (!sh) throw new Error('Missing sheet: ' + FB_MULTI.SCHEDULE_SHEET);

  const dayType = fbDayType_(now);
  const dateKey = Utilities.formatDate(now, FB_MULTI.TZ, 'yyyy-MM-dd');
  const rows = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 6).getValues();

  const map = new Map();

  rows.forEach(r => {
    if (String(r[0]).trim().toUpperCase() !== dayType) return;
    if (r[4] !== true) return;

    const label = String(r[1]).trim();
    const start = fbParseTime_(label);
    if (start === null || start < FB_MULTI.MIN_START || start > FB_MULTI.MAX_START) return;

    const key = fbSlotKey_(start);

    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        start,
        windowStart: start + FB_MULTI.START_OFFSET,
        windowEnd: start + FB_MULTI.END_OFFSET,
        dateKey,
        programs: []
      });
    }
    map.get(key).programs.push(String(r[3] || '').trim());
  });

  return Array.from(map.values()).sort((a, b) => a.start - b.start);
}

function fbFindPlatformColumn_(sh, slotLabel, platform) {
  const headers = sh.getRange(4, 1, 2, sh.getLastColumn()).getDisplayValues();
  for (let c = 1; c < headers[0].length; c++) {
    if (
      String(headers[0][c]).trim() === slotLabel &&
      String(headers[1][c]).trim() === platform
    ) {
      return c + 1;
    }
  }
  return null;
}

function fbDayType_(now) {
  const dow = Number(Utilities.formatDate(now, FB_MULTI.TZ, 'u'));
  if (dow === 6) return 'SATURDAY';
  if (dow === 7) return 'SUNDAY';
  return 'WEEKDAY';
}

function fbMinuteOfDay_(now) {
  const h = Number(Utilities.formatDate(now, FB_MULTI.TZ, 'H'));
  const m = Number(Utilities.formatDate(now, FB_MULTI.TZ, 'm'));
  return h * 60 + m;
}

function fbParseTime_(label) {
  const m = String(label || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function fbSlotKey_(minuteOfDay) {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return String(h).padStart(2, '0') + String(m).padStart(2, '0');
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
  });
}

function appendFacebookDispatchLog_(now, slot, channel, status, notes) {
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FB_MULTI.LOG_SHEET);
  if (!log) return;

  log.appendRow([
    Utilities.formatDate(now, FB_MULTI.TZ, 'yyyy-MM-dd HH:mm:ss'),
    slot.label,
    slot.dateKey,
    channel,
    'Facebook',
    '',
    '',
    '',
    status,
    notes + ' | Slot: ' + slot.key +
    (slot.programs.length ? ' | Program: ' + slot.programs.join(' / ') : '')
  ]);
}
