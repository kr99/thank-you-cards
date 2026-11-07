'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');

test('default config is a placeholder, not a personal message', () => {
  const win = {};
  vm.runInNewContext(rd('config.js'), { window: win });
  const c = win.CARD_CONFIG;
  assert.match(c.m, /placeholder|YOUR MESSAGE/i);
  assert.match(c.m2, /placeholder|YOUR MESSAGE/i);
});
test('no personal name in defaults', () => {
  for (const f of ['config.js', 'app.js', 'index.html']) assert.ok(!/Kimber/.test(rd(f)), f);
});
