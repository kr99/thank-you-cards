'use strict';
const test = require('node:test'), assert = require('node:assert');
const CS = require('../card-share.js');
test('normalizeHex accepts #rgb/#rrggbb (with or without #), lowercases, expands', () => {
  assert.strictEqual(CS.normalizeHex('#ABC'), '#aabbcc');
  assert.strictEqual(CS.normalizeHex('12ef9A'), '#12ef9a');
  assert.strictEqual(CS.normalizeHex(' #2b6cff '), '#2b6cff');
});
test('normalizeHex rejects junk', () => {
  for (const v of ['', 'red', '#12', '#1234', '#gggggg', '#12345678', null, 5, {}]) assert.strictEqual(CS.normalizeHex(v), null);
});
test('token key pc keeps only valid hex for a/b/v, normalized', () => {
  const c = CS.validate({ pc: { a: '#ABC', b: 'nope', v: '#112233', x: '#fff' } });
  assert.deepStrictEqual(c.pc, { a: '#aabbcc', v: '#112233' });
  assert.ok(!('pc' in CS.validate({ pc: { a: 'x' } })));
  assert.ok(!('pc' in CS.validate({ pc: 'x' })));
});
test('pc round-trips through ?c=', () => {
  const u = new URL(CS.buildShareUrl({ pc: { a: '#ff00aa' } }, { baseUrl: 'http://x/' }).url);
  assert.strictEqual(CS.fromQuery(u.search).config.pc.a, '#ff00aa');
});
