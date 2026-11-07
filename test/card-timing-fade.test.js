'use strict';
const test = require('node:test');
const assert = require('node:assert');
const CT = require('../card-timing.js');

const base = { lockedAt: 1000, lockedHoldMs: 100, cubesFadeMs: 700, slideMs: 1000, tight: true };
const at = (t, extra) => CT.timeline(Object.assign({}, base, extra, { t }));
const ts = []; for (let t = 0; t <= 4000; t += 10) ts.push(t);

test('before lock both bevels are 1', () => {
  for (const t of [0, 500, 999]) { const r = at(t); assert.strictEqual(r.blankBevel, 1); assert.strictEqual(r.messageBevel, 1); }
});
test('blank fades first and is done before message starts', () => {
  const rs = ts.map(t => ({ t, r: at(t) }));
  const blankDone = rs.find(x => x.r.blankBevel === 0).t;
  const msgStart = rs.find(x => x.r.messageBevel < 1).t;
  assert.ok(rs.some(x => x.r.blankBevel < 1 && x.r.blankBevel > 0), 'blank fade is gradual');
  assert.ok(msgStart > blankDone, 'message starts after blank done (gap)');
  assert.ok(rs.filter(x => x.t < msgStart).every(x => x.r.messageBevel === 1));
});
test('both 0 at the end of the fade phase, monotone non-increasing, in 0..1', () => {
  let pb = 1, pm = 1;
  for (const t of ts) {
    const r = at(t);
    assert.ok(r.blankBevel <= pb && r.messageBevel <= pm, 't=' + t);
    assert.ok(r.blankBevel >= 0 && r.messageBevel >= 0);
    pb = r.blankBevel; pm = r.messageBevel;
  }
  const e = at(1000 + 100 + 700); assert.strictEqual(e.blankBevel, 0); assert.strictEqual(e.messageBevel, 0);
});
test('existing phases/legacy bevel unchanged (fade 100..800ms after lock, slide after)', () => {
  assert.strictEqual(at(1050).phase, 'locked');
  assert.strictEqual(at(1500).phase, 'cubesFading');
  assert.strictEqual(at(1500).bevel, 1 - 0.5 * 0.5 * (3 - 2 * 0.5) * 0 - (() => { const x = 400 / 700; return x * x * (3 - 2 * x); })());
  assert.strictEqual(at(1801).phase, 'sliding');
  assert.strictEqual(at(1100).bevel, 1);
});
test('settledAt late stretches message fade, not the phase timing contract', () => {
  const r = at(1100 + 800, { settledAt: 2100 }); // fe = 2100
  assert.strictEqual(r.phase, 'cubesFading'); assert.ok(r.messageBevel > 0);
});
test('configurable durations', () => {
  const r = at(1100 + 100, { blankFadeMs: 100, fadeGapMs: 0 });
  assert.strictEqual(r.blankBevel, 0);
});
test('reduced motion jumps to final', () => {
  const r = CT.timeline({ reduced: true, t: 0 });
  assert.strictEqual(r.blankBevel, 0); assert.strictEqual(r.messageBevel, 0); assert.strictEqual(r.bevel, 0);
});
test('done phase: both 0', () => {
  const r = at(9999); assert.strictEqual(r.phase, 'done'); assert.strictEqual(r.blankBevel, 0); assert.strictEqual(r.messageBevel, 0);
});
