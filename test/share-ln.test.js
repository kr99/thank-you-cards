const test = require('node:test'), assert = require('node:assert');
const CS = require('../card-share.js');
const rt = (ln) => CS.decodeConfig(CS.encodeConfig({ m: 'HI', ln })).ln;

test('ln extras: round-trip R, C, loop, hold', () => {
  const ln = { seed: 42, R: 4, C: 12, loop: true, hold: 3 };
  assert.deepStrictEqual(rt(ln), ln);
});
test('ln extras: clamped to panel ranges', () => {
  assert.deepStrictEqual(CS.validate({ ln: { R: 99, C: 1, hold: 50 } }).ln, { R: 8, C: 3, hold: 10 });
  assert.deepStrictEqual(CS.validate({ ln: { R: -5, C: 400, hold: -1 } }).ln, { R: 1, C: 30, hold: 0 });
});
test('ln extras: defaults omitted (loop false, hold 2)', () => {
  assert.strictEqual(CS.validate({ ln: { loop: false, hold: 2 } }).ln, undefined);
  assert.deepStrictEqual(CS.validate({ ln: { seed: 9, loop: false, hold: 2 } }).ln, { seed: 9 });
});
test('ln extras: old token with only seed/T/K/GAP_P decodes identically', () => {
  const ln = { seed: 42, T: 8, K: 3, GAP_P: 0.2 };
  assert.deepStrictEqual(rt(ln), ln);
});
test('ln extras: malformed values ignored, not thrown', () => {
  const bad = { R: 'x', C: null, loop: 'yes', hold: {}, seed: 5 };
  assert.deepStrictEqual(CS.validate({ ln: bad }).ln, { seed: 5 });
  assert.doesNotThrow(() => CS.validate({ ln: { R: NaN, C: Infinity, loop: [], hold: undefined } }));
  assert.strictEqual(CS.validate({ ln: { R: NaN, C: Infinity, loop: [], hold: undefined } }).ln, undefined);
});
test('ln extras: hidden shift-size params never serialize', () => {
  const s = JSON.stringify(CS.validate({ ln: { R: 3, CAP_COL: 2, Q_FULL: 1, LAMBDA: 1, loop: true } }));
  assert.ok(!/CAP_COL|Q_FULL|LAMBDA/.test(s));
});
