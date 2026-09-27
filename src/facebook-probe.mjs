import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const PAGE_URL =
  process.env.FB_PAGE_URL ||
  'https://www.facebook.com/DZMMTeleradyo.MSPC/';

const CALLBACK_URL = process.env.APPS_SCRIPT_CALLBACK_URL || '';
const CALLBACK_SECRET = process.env.APPS_SCRIPT_CALLBACK_SECRET || '';

const runMode = process.env.RUN_MODE || 'scheduled_window';
const slotHour = Number(process.env.SLOT_HOUR || 5);
const retryEndMinute = Number(process.env.RETRY_END_MINUTE || 15);
const timeZone = 'Asia/Manila';

function nowPhtParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const get = (type) => parts.find(p => p.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second'))
  };
}

function parseCount(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/,/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  const value = Math.round(Number(m[1]) * mult);
  return Number.isFinite(value) ? value : null;
}

async function dismissPublicOverlay(page) {
  const closeSelectors = [
    'button[aria-label="Close"]',
    '[role="button"][aria-label="Close"]',
    'div[aria-label="Close"][role="button"]'
  ];

  for (const selector of closeSelectors) {
    const loc = page.locator(selector);
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  }
}

async function pageText(page) {
  return await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
}

async function isHardLoginGate(page) {
  const passwordCount = await page.locator('input[type="password"]').count().catch(() => 0);
  const publicVideoCount = await page.locator('video').count().catch(() => 0);
  const videoLinkCount = await page.locator('a[href*="/videos/"]').count().catch(() => 0);
  const txt = (await pageText(page)).toLowerCase();

  return (
    passwordCount > 0 &&
    publicVideoCount === 0 &&
    videoLinkCount === 0 &&
    /log in|login|see more on facebook/.test(txt)
  );
}

function normalizeFbUrl(href) {
  if (!href) return null;
  try {
    const u = new URL(href, 'https://www.facebook.com/');
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

async function findLiveUrl(page) {
  if (/\/videos\/\d+/i.test(page.url())) return normalizeFbUrl(page.url());

  const links = page.locator('a[href*="/videos/"]');
  const count = await links.count().catch(() => 0);

  for (let i = 0; i < Math.min(count, 80); i++) {
    const link = links.nth(i);
    if (!(await link.isVisible().catch(() => false))) continue;

    const href = await link.getAttribute('href').catch(() => null);
    if (!href) continue;

    const context = await link.evaluate((el) => {
      let n = el;
      for (let d = 0; d < 8 && n; d++, n = n.parentElement) {
        const t = (n.innerText || n.textContent || '').trim();
        if (/is live now|(^|\s)LIVE[:\s]/i.test(t)) return t.slice(0, 2500);
      }
      return '';
    }).catch(() => '');

    if (/is live now|(^|\s)LIVE[:\s]/i.test(context)) {
      return normalizeFbUrl(href);
    }
  }

  return null;
}

async function extractViewerCount(page) {
  const aria = await page.locator('[aria-label]').evaluateAll((els) =>
    els.map(el => ({
      label: (el.getAttribute('aria-label') || '').trim(),
      text: (el.innerText || el.textContent || '').trim()
    }))
    .filter(x => /viewer|watching/i.test(x.label))
    .slice(0, 120)
  ).catch(() => []);

  for (const hit of aria) {
    const combined = `${hit.label} ${hit.text}`;
    const patterns = [
      /(\d[\d,.]*|\d+(?:\.\d+)?\s*[KMB])\s*(?:current\s+)?(?:viewers?|watching)/i,
      /(?:viewers?|watching)\D{0,20}(\d[\d,.]*|\d+(?:\.\d+)?\s*[KMB])/i
    ];
    for (const re of patterns) {
      const m = combined.match(re);
      if (m) {
        const value = parseCount(m[1].replace(/\s+/g, ''));
        if (value != null) return { value, method: 'aria-label' };
      }
    }
  }

  const txt = await pageText(page);
  for (const re of [
    /(\d[\d,.]*|\d+(?:\.\d+)?\s*[KMB])\s+(?:current\s+)?(?:viewers?|watching(?:\s+now)?)/i,
    /(?:viewers?|watching(?:\s+now)?)\s*[:\-]?\s*(\d[\d,.]*|\d+(?:\.\d+)?\s*[KMB])/i
  ]) {
    const m = txt.match(re);
    if (m) {
      const value = parseCount(m[1].replace(/\s+/g, ''));
      if (value != null) return { value, method: 'visible-text' };
    }
  }

  const video = page.locator('video').first();
  const vbox = await video.boundingBox().catch(() => null);

  if (vbox) {
    const candidates = await page.locator('body *').evaluateAll((els, vb) => {
      const out = [];
      for (const el of els) {
        const text = (el.innerText || '').trim();
        if (!/^\d+(?:[.,]\d+)?\s*[KMB]?$/i.test(text)) continue;

        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;

        const topLeft =
          r.left >= vb.x - 10 &&
          r.left <= vb.x + vb.width * 0.45 &&
          r.top >= vb.y - 10 &&
          r.top <= vb.y + vb.height * 0.25;

        if (!topLeft) continue;

        let context = '';
        let n = el;
        for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
          context += ' ' + ((n.innerText || n.textContent || '').trim());
        }

        out.push({ text, context: context.slice(0, 600) });
      }
      return out.slice(0, 80);
    }, vbox).catch(() => []);

    const ordered = [
      ...candidates.filter(c => /\bLIVE\b/i.test(c.context)),
      ...candidates.filter(c => !/\bLIVE\b/i.test(c.context))
    ];

    for (const c of ordered) {
      const value = parseCount(c.text.replace(/\s+/g, ''));
      if (value != null && value >= 0 && value < 10000000) {
        return { value, method: 'player-top-left' };
      }
    }
  }

  return null;
}

async function extractTitle(page) {
  const txt = await pageText(page);
  const live = txt.match(/LIVE:\s*[^\n]{5,220}/i);
  if (live) return live[0].trim();

  const headings = await page.locator('[role="heading"], h1, h2, h3')
    .allTextContents()
    .catch(() => []);
  return headings.map(x => x.trim()).find(x => x.length > 5) || '';
}

async function callback(payload) {
  if (!CALLBACK_URL || !CALLBACK_SECRET) return;

  const r = await fetch(CALLBACK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      secret: CALLBACK_SECRET,
      ...payload
    })
  });

  if (!r.ok) {
    throw new Error(`Callback failed: HTTP ${r.status} ${await r.text()}`);
  }
}

async function writeResult(result) {
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile('artifacts/result.json', JSON.stringify(result, null, 2));
}

async function oneAttempt(browser, attemptNo) {
  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: timeZone,
    viewport: { width: 1440, height: 1000 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(7000);

  try {
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await dismissPublicOverlay(page);

    if (await isHardLoginGate(page)) {
      return { ok: false, status: 'FB_LOGIN_REQUIRED', attemptNo };
    }

    const liveUrl = await findLiveUrl(page);
    if (!liveUrl) {
      return { ok: false, status: 'FB_NO_LIVE', attemptNo };
    }

    if (normalizeFbUrl(page.url()) !== liveUrl) {
      await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      await dismissPublicOverlay(page);
    }

    if (await isHardLoginGate(page)) {
      return { ok: false, status: 'FB_LOGIN_REQUIRED', liveUrl, attemptNo };
    }

    const viewer = await extractViewerCount(page);
    const title = await extractTitle(page);

    if (!viewer) {
      await page.screenshot({ path: 'artifacts/last-attempt.png', fullPage: true }).catch(() => {});
      return {
        ok: false,
        status: 'FB_VIEWER_UNAVAILABLE',
        liveUrl,
        title,
        attemptNo
      };
    }

    return {
      ok: true,
      status: 'OK',
      viewerCount: viewer.value,
      extractionMethod: viewer.method,
      liveUrl,
      title,
      attemptNo
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  await fs.mkdir('artifacts', { recursive: true });

  const browser = await chromium.launch({ headless: true });

  let last = { ok: false, status: 'FB_ERROR', error: 'No attempts executed' };

  try {
    if (runMode === 'manual_test') {
      const pht = nowPhtParts();

      try {
        last = await oneAttempt(browser, 1);
      } catch (err) {
        last = {
          ok: false,
          status: 'FB_ERROR',
          error: err?.message || String(err),
          attemptNo: 1
        };
      }

      const payload = {
        channel: 'DZMM TeleRadyo',
        platform: 'Facebook',
        date: pht.date,
        slotHour,
        testMode: true,
        observedAtPht: pht,
        ...last
      };

      console.log(JSON.stringify(payload, null, 2));
      await writeResult(payload);
      await callback(payload);
      return;
    }

    let attemptNo = 0;

    while (true) {
      const pht = nowPhtParts();

      if (pht.hour !== slotHour || pht.minute > retryEndMinute) {
        last = {
          ...last,
          ok: false,
          status: 'FB_TIMEOUT',
          slotHour,
          observedAtPht: pht
        };
        break;
      }

      attemptNo += 1;
      console.log(`Attempt ${attemptNo} at PHT ${pht.hour}:${String(pht.minute).padStart(2, '0')}`);

      try {
        last = await oneAttempt(browser, attemptNo);
      } catch (err) {
        last = {
          ok: false,
          status: 'FB_ERROR',
          error: err?.message || String(err),
          attemptNo
        };
      }

      const payload = {
        channel: 'DZMM TeleRadyo',
        platform: 'Facebook',
        date: pht.date,
        slotHour,
        ...last
      };

      console.log(JSON.stringify(payload, null, 2));

      if (last.ok) {
        await writeResult(payload);
        await callback(payload);
        return;
      }

      if (pht.minute >= retryEndMinute) {
        const finalPayload = {
          ...payload,
          ok: false,
          status: 'FB_TIMEOUT',
          lastStatus: last.status
        };
        await writeResult(finalPayload);
        await callback(finalPayload);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 60000));
    }

    await writeResult(last);
    await callback(last);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(async (err) => {
  const result = {
    ok: false,
    status: 'FB_ERROR',
    error: err?.stack || err?.message || String(err)
  };
  console.error(result);
  await writeResult(result).catch(() => {});
  process.exitCode = 1;
});
