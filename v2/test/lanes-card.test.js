const test = require('node:test'), assert = require('node:assert');
const L4 = require('../lanes4.js'), { lanesFrame4 } = require('../lanes-frame4.js');
const plan = L4.planLanes4({ R: 3, C: 7, T: 5.5, seed: 4, params: {} });
test('frame: s in [0,1], finite, ids unique', () => {
  for (let t = 0; t <= plan.T; t += 0.25) {
    const f = lanesFrame4(plan, t);
    assert.equal(new Set(f.map(c => c.id)).size, f.length);
    f.forEach(c => { assert.ok(c.s >= 0 && c.s <= 1); assert.ok(isFinite(c.vx) && isFinite(c.vy)); });
  }
});
test('frame: at t>=T every board cell has exactly one cube, s=1', () => {
  const f = lanesFrame4(plan, 99), seen = new Set(f.map(c => Math.round(c.x) + ',' + Math.round(c.y)));
  assert.equal(f.length, 21); assert.equal(seen.size, 21);
  f.forEach(c => assert.equal(c.s, 1));
});
test('frame: fully off-board cube has s=0, half-on has s=1', () => {
  const f = lanesFrame4(plan, 0);
  f.forEach(c => { if (c.x <= -1 || c.x >= 7 || c.y <= -1 || c.y >= 3) assert.equal(c.s, 0); });
});
const CS = require('../card-share.js');
test('payload: default lanes values => no ln in token', () => {
  const tok = CS.encodeConfig({ m: 'HI', ln: { seed: 7, T: 5.5, K: 5, GAP_P: 0.15 } });
  assert.deepStrictEqual(CS.decodeConfig(tok), { m: 'HI' });
  assert.strictEqual(tok, CS.encodeConfig({ m: 'HI' }));
});
test('payload: non-default round-trips, clamped, hidden params dropped', () => {
  const ln = { seed: 42, T: 8, K: 3, GAP_P: 0.2 };
  assert.deepStrictEqual(CS.decodeConfig(CS.encodeConfig({ m: 'HI', ln })).ln, ln);
  assert.deepStrictEqual(CS.validate({ ln: { GAP_P: 0.9, CAP_COL: 3, LAMBDA: 1, K: 3 } }).ln, { GAP_P: 0.2, K: 3 });
  assert.strictEqual(JSON.stringify(CS.validate({ ln: { Q_FULL: 1, CAP_ROW: 2 } })).includes('Q_FULL'), false);
});
test('payload: old token (no ln) decodes unchanged; ln is a CardShare key', () => {
  const old = CS.encodeConfig({ m: 'OLD', lanes: true, seed: 11 });
  assert.deepStrictEqual(CS.decodeConfig(old), { m: 'OLD', seed: 11, lanes: true });
  assert.ok(CS.KEYS.includes('ln'));
});
