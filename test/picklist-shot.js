'use strict';
// Usage: node test/picklist-shot.js   (needs playwright; loads file:// index.html; screenshots go to a temp dir outside the repo)
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SHOTS = [
  { name: 'desktop-1280x800.png', width: 1280, height: 800 },
  { name: 'phone-390x800.png', width: 390, height: 800 }
];

(async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'picklist-shot-'));
  const browser = await chromium.launch();
  const errors = [];
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.route('**/three.min.js', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    // Isolated instance: mount the component in its placeholder only (app.js is not touched by this harness).
    await page.evaluate(() => {
      const root = document.getElementById('motionpicklist');
      window.__pick = window.MotionPicklist.create(root, { onChange: () => {} });
      window.__pick.set(['phase:3s', 'lettersRotate', 'slidingLanes', 'phase:1.5s', 'tightSpacing', 'radialWave;x=-0.5;y=1;v=2']);
    });
    const hint = await page.evaluate(() => !document.querySelector('.mp-hint').hidden);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const target = await page.$('#motionpicklist');
    await target.scrollIntoViewIfNeeded();
    const file = path.join(outDir, shot.name);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file + '  hintShown=' + hint + '  horizontalOverflowPx=' + overflow);
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.error('ERRORS\n' + errors.join('\n')); process.exit(1); }
})();
