'use strict';
// Usage: THREE_JS=... node test/controls-shot.js <tag> <outdir>  -> <outdir>/controls-<tag>-{desktop,phone}.png + overflow check
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [tag, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  let bad = 0;
  for (const [n, w] of [['desktop', 1280], ['phone', 390]]) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
    if (process.env.THREE_JS) await page.route('**/three.min.js', r => r.fulfill({ path: process.env.THREE_JS, contentType: 'application/javascript' }));
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await page.waitForTimeout(1500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (over) { bad = 1; console.error('HSCROLL at ' + w); }
    if (!(await page.locator('#ctrl').isVisible())) { await page.keyboard.press('c'); await page.waitForTimeout(300); }   // card bakes hide:true
    await page.locator('#ctrl').screenshot({ path: path.join(out, `controls-${tag}-${n}.png`) });
    await page.close();
  }
  await browser.close(); process.exit(bad);
})();
