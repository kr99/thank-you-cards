'use strict';
const test = require('node:test'), assert = require('node:assert');
const CS = require('../card-share.js');
const tok = (u) => u.split(/[?#]c=/)[1];
test('url token decodes to message', () => {
  const r = CS.buildShareUrl({ m: 'HELLO NEW' }, { baseUrl: 'http://x/y', anchor: false });
  assert.ok(r.url.startsWith('http://x/y?c='));
  assert.strictEqual(CS.decodeConfig('c.' + tok(r.url)).m, 'HELLO NEW');
  assert.strictEqual(r.tooLong, false);
});
test('anchor uses #c=', () => {
  const r = CS.buildShareUrl({ m: 'A' }, { baseUrl: 'http://x/y', anchor: true });
  assert.ok(r.url.startsWith('http://x/y#c='));
});
test('hide option and validation', () => {
  const r = CS.buildShareUrl({ m: 'A', bg: 'bogus' }, { baseUrl: 'http://x', hide: true });
  const c = CS.decodeConfig('c.' + tok(r.url)); assert.strictEqual(c.hide, true); assert.ok(!('bg' in c));
});
test('over-length flagged', () => {
  const r = CS.buildShareUrl({ m: 'WWWW '.repeat(40) }, { baseUrl: 'http://x/' + 'p'.repeat(2000) });
  assert.strictEqual(r.tooLong, true);
});
