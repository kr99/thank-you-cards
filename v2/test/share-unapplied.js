'use strict';
// Usage: [THREE_JS=/path/three.min.js] node test/share-unapplied.js
// Type a new message WITHOUT Replay, click copy link, decode #linkout: it must contain the new text.
const { chromium } = require('playwright');
const path = require('path');
const CS = require('../card-share.js');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.THREE_JS) await page.route('**/three.min.js', r => r.fulfill({ path: process.env.THREE_JS, contentType: 'application/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const m = document.getElementById('msg'); m.value = 'UNAPPLIED EDIT'; m.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => document.getElementById('copyqlink').click());
  const url = await page.textContent('#linkout');
  const cfg = CS.decodeConfig('c.' + url.split(/[?#]c=/)[1]);
  await browser.close();
  if (errors.length || !cfg || cfg.m !== 'UNAPPLIED EDIT') { console.error('FAIL', errors, cfg); process.exit(1); }
  console.log('SHARE-UNAPPLIED OK');
})();
