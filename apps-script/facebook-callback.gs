/**
 * Facebook multi-channel callback receiver — v1.6.0-alpha.1
 * Program-start based schedule from 4:00 AM through 10:00 PM PHT.
 * Each slot captures from +15 through +20 after the program start.
 *
 * Script Property required:
 * FB_CALLBACK_SECRET
 */

const FB_CALLBACK = {
  TZ: 'Asia/Manila',
  MAIN_SHEET: 'LIVE STREAM',
  HEADER_ROW: 4
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
      version: 'v1.6.0-alpha.1',
      schedule: 'Program-start based',
      productionHours: '4:00 AM-10:00 PM PHT',
      captureWindow: '+15 to +20 after each configured program start',
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
    if (!cfg) throw new Error('Unknown stationKey: ' + stationKey);

    const slotLabel = String(payload.slotLabel || '').trim();
    const slotKey = String(payload.slotKey || '').trim();
    if (!slotLabel || !slotKey) throw new Error('Missing slotLabel/slotKey');

    const now = new Date();
    const testMode = payload.testMode === true;
    const rawStatus = String(payload.status || 'FB_ERROR');
    const status = (testMode ? 'PILOT TEST ' : '') + rawStatus;
    const ccu = payload.ok ? Number(payload.viewerCount) : '';

    if (payload.ok && !Number.isFinite(ccu)) {
      throw new Error('Invalid viewerCount');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(FB_CALLBACK.MAIN_SHEET);
    const log = ss.getSheetByName('LOG');

    const headerValues = sh.getRange(
      FB_CALLBACK.HEADER_ROW,
      1,
      1,
      sh.getLastColumn()
    ).getDisplayValues()[0];

    const headerIndex = headerValues.findIndex(v => String(v).trim() === slotLabel);
    if (headerIndex < 0) {
      throw new Error('Slot header not found in LIVE STREAM: ' + slotLabel);
    }

    // Header sits on the YouTube column of the pair; Facebook is the next column.
    const fbCol = headerIndex + 2;
    const target = sh.getRange(cfg.row, fbCol);

    if (!testMode && payload.ok && target.getValue() === '') {
      target.setValue(ccu);
    }

    log.appendRow([
      Utilities.formatDate(now, FB_CALLBACK.TZ, 'yyyy-MM-dd HH:mm:ss'),
      slotLabel,
      payload.date || Utilities.formatDate(now, FB_CALLBACK.TZ, 'yyyy-MM-dd'),
      cfg.channel,
      'Facebook',
      '',
      payload.title || '',
      payload.ok ? ccu : '',
      status,
      [
        'Slot: ' + slotKey,
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
        stationKey,
        slotKey,
        slotLabel,
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
