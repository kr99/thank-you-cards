'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { seededRng } = require('./helpers');
const PL = require('../plan-lanes.js');
const plan = (seed, r, c, o) => PL.planLanes(seededRng(seed), r, c, o);
const frac = (rd, rows, cols) => rd.moves.length / (rd.axis === 'row' ? rows : cols);

test('rounds default 6 and alternate axis', () => {
  const p = plan(1, 5, 7);
  assert.strictEqual(p.length, 6);
  p.forEach((rd, k) => assert.strictEqual(rd.axis, k % 2 ? 'col' : 'row'));
  assert.strictEqual(plan(1, 5, 7, { rounds: 3 }).length, 3);
});
test('distinct in-range indices', () => {
  for (let s = 1; s < 30; s++) plan(s, 5, 7).forEach((rd) => {
    const n = rd.axis === 'row' ? 5 : 7, ids = rd.moves.map((m) => m.i);
    assert.strictEqual(new Set(ids).size, ids.length);
    ids.forEach((i) => assert.ok(Number.isInteger(i) && i >= 0 && i < n));
  });
});
test('fraction 50-80% early, 30-50% last', () => {
  for (let s = 1; s < 40; s++) {
    const p = plan(s, 10, 10, { rounds: 6 });
    assert.ok(frac(p[0], 10, 10) >= 0.5 && frac(p[0], 10, 10) <= 0.8, 'early');
    assert.ok(frac(p[5], 10, 10) >= 0.3 && frac(p[5], 10, 10) <= 0.5, 'late');
  }
});
test('d nonzero integer within maxShift (default 8)', () => {
  for (let s = 1; s < 30; s++) plan(s, 5, 7).forEach((rd) => rd.moves.forEach((m) => {
    assert.ok(Number.isInteger(m.d) && m.d !== 0 && Math.abs(m.d) <= 8);
  }));
  plan(3, 5, 7, { maxShift: 2 }).forEach((rd) => rd.moves.forEach((m) => assert.ok(Math.abs(m.d) <= 2)));
});
test('both signs occur', () => {
  const ds = plan(9, 10, 10).flatMap((rd) => rd.moves.map((m) => m.d));
  assert.ok(ds.some((d) => d < 0) && ds.some((d) => d > 0));
});
test('deterministic per seed, differs across seeds', () => {
  assert.deepStrictEqual(plan(7, 4, 7), plan(7, 4, 7));
  assert.notDeepStrictEqual(plan(7, 4, 7), plan(8, 4, 7));
});
test('invert restores grid', () => {
  for (let s = 1; s < 20; s++) {
    const rows = 4, cols = 7, g = [];
    for (let r = 0; r < rows; r++) { g.push([]); for (let c = 0; c < cols; c++) g[r].push(r * cols + c); }
    const p = plan(s, rows, cols), orig = JSON.stringify(g);
    const scr = PL.applyRounds(g, p);
    assert.notStrictEqual(JSON.stringify(scr), orig);
    assert.strictEqual(JSON.stringify(PL.applyRounds(scr, PL.invertRounds(p))), orig);
    assert.strictEqual(JSON.stringify(g), orig, 'input not mutated');
  }
});
