/**
 * Facebook multi-channel callback receiver — v1.5.0-alpha.1
 *
 * Production window:
 * 4:00 AM through 10:00 PM PHT
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
  EXTENDED_DATE_CELL: 'B73',
  EXTENDED_FIRST_VALUE_COL: 2,
  LEGACY_START_HOUR: 5,
  LEGACY_END_HOUR: 12
};

const FB_CALLBACK_CHANNELS = {
  dzmm: { channel: 'DZMM TeleRadyo', legacyRow: 6, extendedRow: 75 },
  dzbb: { channel: 'DZBB Super Radyo', legacyRow: 7, extendedRow: 76 },
  dzrh: { channel: 'DZRH', legacyRow: 9, extendedRow: 77 },
  dwww: { channel: 'DWWW', legacyRow: 10, extendedRow: 78 },
  dwxi: { channel: 'DWXI', legacyRow: 11, extendedRow: 79 },
  dzrv: { channel: 'DZRV / Veritas PH', legacyRow: 12, extendedRow: 80 }
};

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      service: 'Facebook Multi-Channel CCU Callback',
      version: 'v1.5.0-alpha.1',
      productionHours: '4:00 AM-10:00 PM PHT',
      captureWindow: '+15 to +20',
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

    const extendedCol =
      FB_CALLBACK.EXTENDED_FIRST_VALUE_COL +
      (slotHour - FB_CALLBACK.START_HOUR);

    const extendedTarget = sh.getRange(cfg.extendedRow, extendedCol);

    // Manual tests log only.
    // Production: first successful CCU wins for each station/hour.
    if (!testMode && payload.ok && extendedTarget.getValue() === '') {
      extendedTarget.setValue(ccu);
    }

    // Keep the original 5AM-12PM Facebook cells populated as a legacy mirror
    // so the existing combined YouTube/Facebook table continues to work.
    if (
      !testMode &&
      payload.ok &&
      slotHour >= FB_CALLBACK.LEGACY_START_HOUR &&
      slotHour <= FB_CALLBACK.LEGACY_END_HOUR
    ) {
      const legacyCol = 3 + ((slotHour - FB_CALLBACK.LEGACY_START_HOUR) * 2);
      const legacyTarget = sh.getRange(cfg.legacyRow, legacyCol);

      if (legacyTarget.getValue() === '') {
        legacyTarget.setValue(ccu);
      }
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
        testMode ? 'Manual multi-channel pilot test; production Facebook cells unchanged.' : '',
        payload.error || ''
      ].filter(Boolean).join(' | ')
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        stationKey: stationKey,
        extendedRow: cfg.extendedRow,
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
