'use strict';
const test = require('node:test'), assert = require('node:assert');
const CS = require('../card-share.js');
const tok = (u) => u.split(/[?#]c=/)[1];
test('url token decodes to message', () => {
  const r = CS.buildShareUrl({ m: 'HELLO NEW' }, { baseUrl: 'http://x/y' });
  assert.ok(r.url.startsWith('http://x/y?c='));
  assert.strictEqual(CS.decodeConfig('c.' + tok(r.url)).m, 'HELLO NEW');
  assert.strictEqual(r.tooLong, false);
});
test('buildShareUrl always emits ?c=, never an anchor', () => {
  const r = CS.buildShareUrl({ m: 'A' }, { baseUrl: 'http://x/y#old', anchor: true });
  assert.ok(r.url.startsWith('http://x/y?c=') && !r.url.includes('#'));
});
test('fromQuery round-trips ?c= and ignores a #c= link', () => {
  const u = new URL(CS.buildShareUrl({ m: 'HI' }, { baseUrl: 'http://x/y', hide: true }).url);
  const q = CS.fromQuery(u.search);
  assert.strictEqual(q.config.m, 'HI'); assert.strictEqual(q.clean, true);
  const h = new URL('http://x/y#c=' + tok(u.href));
  assert.strictEqual(CS.fromQuery(h.search).config, null);
  assert.strictEqual(CS.parseHash, undefined);
});
test('fromQuery flags', () => {
  const q = CS.fromQuery('?reduced=1&debug=1&clean=1&c=!!');
  assert.deepStrictEqual([q.reduced, q.debug, q.clean, q.config], [true, true, true, null]);
});
test('hide option and validation', () => {
  const r = CS.buildShareUrl({ m: 'A', bg: 'bogus' }, { baseUrl: 'http://x', hide: true });
  const c = CS.decodeConfig('c.' + tok(r.url)); assert.strictEqual(c.hide, true); assert.ok(!('bg' in c));
});
test('over-length flagged', () => {
  const r = CS.buildShareUrl({ m: 'WWWW '.repeat(40) }, { baseUrl: 'http://x/' + 'p'.repeat(2000) });
  assert.strictEqual(r.tooLong, true);
});
test('die background is gone', () => {
  const fs = require('node:fs'), rd = (f) => fs.readFileSync(__dirname + '/../' + f, 'utf8');
  assert.ok(!('bg' in CS.validate({ bg: 'die' })));
  assert.deepStrictEqual(CS.BGS, ['pcb', 'veins', 'magitech']);
  assert.ok(!/value="die"/.test(rd('index.html')));
  assert.ok(!/buildDie|drawDie/.test(rd('circuit-bg.js')));
});
