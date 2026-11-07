const test = require('node:test'), assert = require('node:assert');
const { planLanes3, sampleLanes } = require('../lanes3.js'), { lanesFrame } = require('../lanes-frame.js');
const p = planLanes3(4, 7, { seed: 3, D: 3 });
test('before window: start layout, holes hidden', () => {
  const f = lanesFrame(p, 500, 1000);
  p.start.forEach((id, c) => { if (id !== null) { assert.equal(f[id].x, c % 7); assert.equal(f[id].y, Math.floor(c / 7)); assert.equal(f[id].s, 1); } });
  p.fills.forEach(h => assert.equal(f[h.id].s, 0));
});
test('inside window: matches sampleLanes', () => {
  assert.deepEqual(lanesFrame(p, 2000, 1000), sampleLanes(p, 1));
});
test('after window: solved, all visible', () => {
  lanesFrame(p, 99999, 1000).forEach((q, i) => { assert.equal(q.x, i % 7); assert.equal(q.y, Math.floor(i / 7)); assert.equal(q.s, 1); assert.equal(q.vx + q.vy, 0); });
});
