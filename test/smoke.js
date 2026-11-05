'use strict';
// Usage: [THREE_JS=/path/three.min.js] node test/smoke.js   (needs playwright; loads file:// index.html)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // Offline-friendly: serve three.js from THREE_JS (path to three.min.js) instead of the CDN.
  if (process.env.THREE_JS) await page.route('**/three.min.js', r => r.fulfill({ path: process.env.THREE_JS, contentType: 'application/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')];
    return cs.map(c => ({ w: c.width, h: c.height }));
  });
  await browser.close();
  const fails = errors.slice();
  if (!info.length) fails.push('no canvas rendered');
  else if (!info.some(c => c.w > 0 && c.h > 0)) fails.push('canvas has zero size');
  if (fails.length) { console.error('SMOKE FAIL\n' + fails.join('\n')); process.exit(1); }
  console.log('SMOKE OK canvases=' + JSON.stringify(info));
})();
