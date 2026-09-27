/**
 * Facebook multi-channel callback receiver — v1.4.0-alpha.1
 *
 * Script Property required:
 * FB_CALLBACK_SECRET
 */

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
      version: 'v1.4.0-alpha.1',
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

    if (!Number.isInteger(slotHour) || slotHour < 5 || slotHour > 12) {
      throw new Error('Invalid slotHour: ' + payload.slotHour);
    }

    if (payload.ok && !Number.isFinite(ccu)) {
      throw new Error('Invalid viewerCount');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('LIVE STREAM');
    const log = ss.getSheetByName('LOG');

    // Facebook columns: C,E,G,I,K,M,O,Q for 5AM..12PM.
    const fbCol = 3 + ((slotHour - 5) * 2);
    const target = sh.getRange(cfg.row, fbCol);

    // Manual tests log only. Production: first successful CCU wins.
    if (!testMode && payload.ok && target.getValue() === '') {
      target.setValue(ccu);
    }

    log.appendRow([
      Utilities.formatDate(now, 'Asia/Manila', 'yyyy-MM-dd HH:mm:ss'),
      slotHour === 12 ? '12:00 PM' : slotHour + ':00 AM',
      payload.date || Utilities.formatDate(now, 'Asia/Manila', 'yyyy-MM-dd'),
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
