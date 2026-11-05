'use strict';
const test = require('node:test');
const assert = require('node:assert');
const CS = require('../card-share.js');

test('CardShare.KEYS lists every value key incl. hide, derived from BOOLS/NUMS', () => {
  for (const k of ['m', 'm2', 's2', 'lay', 'bg', 'pal', 'seed', 'cseed', 'spd', 'crawlK', 'blurPx', 'letters', 'cubes', 'linked', 'lanes', 'sweep', 'hide', 'crawl', 'blur', 'runes', 'cpulse', 'pvar'])
    assert.ok(CS.KEYS.includes(k), k);
  // every key validate() can emit is declared (no hand-copied drift)
  const all = {}; CS.KEYS.forEach(k => { all[k] = true; });
  const probe = CS.validate({ m: 'a', m2: 'b', s2: 'fade', lay: 'grid', bg: 'pcb', pal: 'x', seed: 1, cseed: 2, spd: 1, crawlK: 0.1, blurPx: 1,
    letters: true, cubes: true, linked: true, lanes: true, sweep: true, hide: true, crawl: true, blur: true, runes: true, cpulse: true, pvar: true });
  Object.keys(probe).forEach(k => assert.ok(CS.KEYS.includes(k), 'undeclared ' + k));
  assert.strictEqual(new Set(CS.KEYS).size, CS.KEYS.length);
});

test('stubs export frozen signatures and throw "not implemented"', () => {
  const V = require('../card-values.js'), F = require('../card-fit.js'), P = require('../plan-lanes.js');
  assert.strictEqual(typeof V.getValues, 'function');
  assert.strictEqual(F.fitText.length, 4);
  assert.strictEqual(P.planLanes.length, 4);
  assert.deepStrictEqual(V.getValues({ get: () => undefined }), {});   // implemented by U4
  assert.throws(() => F.fitText('x', 100, () => 0, {}), /not implemented/);
  assert.throws(() => P.planLanes(() => 0.5, 4, 4, {}), /not implemented/);
});

test('helpers: fake measurer is chars*10; rng is seeded', () => {
  const H = require('./helpers.js');
  assert.strictEqual(H.fakeMeasure('abcd'), 40);
  const a = H.seededRng(7), b = H.seededRng(7), c = H.seededRng(8);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, [c(), c(), c()]);
  sa.forEach(x => assert.ok(x >= 0 && x < 1));
});
