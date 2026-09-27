/**
 * Facebook pilot callback receiver — v1.3.0-alpha.2
 *
 * Add this to the SAME Apps Script project as the CCU Sheet only when ready to test.
 *
 * Script Property required:
 * FB_CALLBACK_SECRET
 */

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('FB_CALLBACK_SECRET') || '';

    if (!expected || payload.secret !== expected) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, status: 'UNAUTHORIZED' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const now = new Date();
    const channel = String(payload.channel || 'DZMM TeleRadyo');
    const status = String(payload.status || 'FB_ERROR');
    const slotHour = Number(payload.slotHour);
    const ccu = payload.ok ? Number(payload.viewerCount) : '';

    if (!Number.isInteger(slotHour) || slotHour < 5 || slotHour > 12) {
      throw new Error('Invalid slotHour: ' + payload.slotHour);
    }

    if (payload.ok && !Number.isFinite(ccu)) {
      throw new Error('Invalid viewerCount');
    }

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LIVE STREAM');
    const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LOG');

    // DZMM is row 6. Facebook columns: C,E,G,I,K,M,O,Q for 5AM..12PM.
    const fbCol = 3 + ((slotHour - 5) * 2);
    const target = sh.getRange(6, fbCol);

    // First successful CCU wins. Never overwrite a previously captured value.
    if (payload.ok && target.getValue() === '') {
      target.setValue(ccu);
    }

    log.appendRow([
      Utilities.formatDate(now, 'Asia/Manila', 'yyyy-MM-dd HH:mm:ss'),
      slotHour === 12 ? '12:00 PM' : slotHour + ':00 AM',
      payload.date || Utilities.formatDate(now, 'Asia/Manila', 'yyyy-MM-dd'),
      channel,
      'Facebook',
      '',
      payload.title || '',
      payload.ok ? ccu : '',
      status,
      [
        payload.liveUrl ? 'Live: ' + payload.liveUrl : '',
        payload.extractionMethod ? 'Method: ' + payload.extractionMethod : '',
        payload.lastStatus ? 'Last status: ' + payload.lastStatus : '',
        payload.error || ''
      ].filter(Boolean).join(' | ')
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
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
