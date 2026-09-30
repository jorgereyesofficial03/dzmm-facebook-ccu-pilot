/**
 * Facebook multi-channel callback receiver — v1.5.0-alpha.2
 *
 * Writes directly to the existing LIVE STREAM multi-channel table.
 * Production window: 4:00 AM through 10:00 PM PHT.
 * Capture attempt starts at +15 and ends at +20.
 *
 * Script Property required:
 * FB_CALLBACK_SECRET
 */

const FB_CALLBACK = {
  TZ: 'Asia/Manila',
  START_HOUR: 4,
  END_HOUR: 22,
  MAIN_SHEET: 'LIVE STREAM',
  TABLE_START_HOUR: 4
};

const FB_CALLBACK_CHANNELS = {
  dzmm: { channel: 'DZMM TeleRadyo', row: 6 },
  dzbb: { channel: 'DZBB Super Radyo', row: 7 },
  dzrh: { channel: 'DZRH', row: 9 },
  dwww: { channel: 'DWWW', row: 10 },
  dwxi: { channel: 'DWXI', row: 11 },
  dzrv: { channel: 'DZRV / Veritas PH', row: 12 }
};

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      service: 'Facebook Multi-Channel CCU Callback',
      version: 'v1.5.0-alpha.2',
      productionHours: '4:00 AM-10:00 PM PHT',
      captureWindow: '+15 to +20',
      output: 'LIVE STREAM main multi-channel table',
      method: 'POST required for callbacks'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected =
      PropertiesService.getScriptProperties().getProperty('FB_CALLBACK_SECRET') || '';

    if (!expected || payload.secret !== expected) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, status: 'UNAUTHORIZED' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const stationKey = String(payload.stationKey || '').toLowerCase();
    const cfg = FB_CALLBACK_CHANNELS[stationKey];

    if (!cfg) {
      throw new Error('Unknown stationKey: ' + stationKey);
    }

    const now = new Date();
    const testMode = payload.testMode === true;
    const rawStatus = String(payload.status || 'FB_ERROR');
    const status = (testMode ? 'PILOT TEST ' : '') + rawStatus;
    const slotHour = Number(payload.slotHour);
    const ccu = payload.ok ? Number(payload.viewerCount) : '';

    if (
      !Number.isInteger(slotHour) ||
      slotHour < FB_CALLBACK.START_HOUR ||
      slotHour > FB_CALLBACK.END_HOUR
    ) {
      throw new Error('Invalid slotHour: ' + payload.slotHour);
    }

    if (payload.ok && !Number.isFinite(ccu)) {
      throw new Error('Invalid viewerCount');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(FB_CALLBACK.MAIN_SHEET);
    const log = ss.getSheetByName('LOG');

    // Main table layout:
    // 4AM = B/C, 5AM = D/E, ... 10PM = AL/AM.
    // YouTube is the first column of each pair; Facebook is the second.
    const fbCol = 3 + ((slotHour - FB_CALLBACK.TABLE_START_HOUR) * 2);
    const target = sh.getRange(cfg.row, fbCol);

    // Manual tests log only. Production: first successful CCU wins.
    if (!testMode && payload.ok && target.getValue() === '') {
      target.setValue(ccu);
    }

    log.appendRow([
      Utilities.formatDate(now, FB_CALLBACK.TZ, 'yyyy-MM-dd HH:mm:ss'),
      formatFacebookCallbackSlot_(slotHour),
      payload.date || Utilities.formatDate(now, FB_CALLBACK.TZ, 'yyyy-MM-dd'),
      cfg.channel,
      'Facebook',
      '',
      payload.title || '',
      payload.ok ? ccu : '',
      status,
      [
        payload.liveUrl ? 'Live: ' + payload.liveUrl : '',
        payload.extractionMethod ? 'Method: ' + payload.extractionMethod : '',
        payload.lastStatus ? 'Last status: ' + payload.lastStatus : '',
        testMode ? 'Manual multi-channel pilot test; production Facebook cell unchanged.' : '',
        payload.error || ''
      ].filter(Boolean).join(' | ')
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        stationKey: stationKey,
        row: cfg.row,
        productionWritten: !testMode && payload.ok
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        status: 'CALLBACK_ERROR',
        error: err && err.message ? err.message : String(err)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function formatFacebookCallbackSlot_(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  let h = hour % 12;
  if (h === 0) h = 12;
  return h + ':00 ' + suffix;
}
