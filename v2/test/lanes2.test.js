'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { seededRng } = require('./helpers');
const PL = require('../plan-lanes.js');

const plan = (seed, r, c, o) => PL.planLanes2(seededRng(seed), r, c, o);
const laneLen = (axis, rows, cols) => (axis === 'row' ? cols : rows);
const cellIdx = (axis, i, x, rows, cols) => (axis === 'row' ? i * cols + x : x * cols + i);

// Independent legality model: the test owns the rules, not the planner.
// Returns null if op legal on g (mutates g), else a reason string.
function applyOpChecked(g, rows, cols, axis, i, op) {
  const L = laneLen(axis, rows, cols);
  const { a, len, d } = op;
  if (!(len >= 1 && a >= 0 && a + len <= L)) return 'run out of lane';
  if (!(d === 1 || d === -1)) return 'bad direction';
  for (let x = a; x < a + len; x++) if (g[cellIdx(axis, i, x, rows, cols)] < 0) return 'run holds hole';
  const t = d === 1 ? a + len : a - 1;
  if (t < 0 || t >= L) return 'target off lane (wrap or edge)';
  if (g[cellIdx(axis, i, t, rows, cols)] !== -1) return 'target not hole';
  const vals = [];
  for (let x = a; x < a + len; x++) vals.push(g[cellIdx(axis, i, x, rows, cols)]);
  for (let x = a; x < a + len; x++) g[cellIdx(axis, i, x, rows, cols)] = -1;
  vals.forEach((v, k) => { g[cellIdx(axis, i, a + k + d, rows, cols)] = v; });
  return null;
}

// Replays every op, asserting legality, id multiset and hole count at each step.
function replayChecked(out, rows, cols) {
  const g = Array.from(out.start);
  const ids0 = g.filter(v => v >= 0).sort((p, q) => p - q);
  const holes0 = g.filter(v => v < 0).length;
  out.rounds.forEach(rd => rd.lanes.forEach(ln => ln.ops.forEach(op => {
    const why = applyOpChecked(g, rows, cols, rd.axis, ln.i, op);
    assert.strictEqual(why, null, `illegal op ${JSON.stringify({ rd: rd.axis, i: ln.i, op })}: ${why}`);
    assert.deepStrictEqual(g.filter(v => v >= 0).sort((p, q) => p - q), ids0, 'id multiset changed');
    assert.strictEqual(g.filter(v => v < 0).length, holes0, 'hole count changed during slides');
  })));
  return g;
}

test('planLanes2 is deterministic for a seed', () => {
  const a = plan(7, 4, 7), b = plan(7, 4, 7);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(plan(8, 4, 7), a);
});

test('solved is identity ids and holeCells are distinct in-range cells', () => {
  const out = plan(3, 4, 7);
  assert.strictEqual(out.solved.length, 28);
  out.solved.forEach((v, k) => assert.strictEqual(v, k));
  assert.strictEqual(new Set(out.holeCells).size, out.holeCells.length);
  assert.strictEqual(out.holeCells.length, Math.round(0.2 * 28));
  out.holeCells.forEach(c => assert.ok(c >= 0 && c < 28));
});

test('start has holeCells.length holes; cube ids are exactly the non-hole solved ids, once each', () => {
  const out = plan(4, 4, 7);
  const holeSet = new Set(out.holeCells);
  const holesAtStart = Array.from(out.start).filter(v => v === -1).length;
  assert.strictEqual(holesAtStart, out.holeCells.length);
  const ids = Array.from(out.start).filter(v => v >= 0).sort((p, q) => p - q);
  const expected = out.solved.filter(v => !holeSet.has(v));
  assert.deepStrictEqual(ids, Array.from(expected));
});

test('every op is legal at its time: contiguous run, target hole, no passing, len <= maxRun', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const out = plan(seed, 4, 7, { maxRun: 3 });
    out.rounds.forEach(rd => rd.lanes.forEach(ln => ln.ops.forEach(op => assert.ok(op.len <= 3))));
    replayChecked(out, 4, 7);
  }
});

test('id multiset constant and no duplicates across all slides', () => {
  const out = plan(9, 5, 8);
  const g = replayChecked(out, 5, 8);
  const ids = g.filter(v => v >= 0);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('applyRounds(start) equals solved minus holeCells', () => {
  const out = plan(11, 4, 7);
  const expected = Array.from(out.solved);
  out.holeCells.forEach(c => { expected[c] = -1; });
  assert.deepStrictEqual(Array.from(PL.applyRounds2(out.start, 4, 7, out.rounds)), expected);
  assert.ok(PL.applyRounds2(out.start, 4, 7, out.rounds) instanceof Int32Array);
});

test('fillHoles(grid, solved) returns solved after slides', () => {
  const out = plan(12, 4, 7);
  const grid = PL.applyRounds2(out.start, 4, 7, out.rounds);
  assert.deepStrictEqual(PL.fillHoles(grid, out.solved), out.solved);
});

test('fillHoles rejects a grid whose cubes disagree with solved', () => {
  const out = plan(13, 4, 7);
  const grid = Int32Array.from(out.solved);
  grid[0] = -1; // hole where a non-hole cell may not be
  grid[1] = 0;  // duplicate id at a cell that is a cube in solved
  assert.throws(() => PL.fillHoles(grid, out.solved));
});

test('axes alternate row/col in forward play order', () => {
  const out = plan(14, 4, 7, { rounds: 6 });
  assert.strictEqual(out.rounds.length, 6);
  out.rounds.forEach((rd, k) => assert.strictEqual(rd.axis, k % 2 ? 'col' : 'row'));
});

test('lane fraction tapers: early rounds touch more lanes than late rounds', () => {
  const rows = 10, cols = 10, seeds = 40;
  let early = 0, late = 0;
  for (let s = 1; s <= seeds; s++) {
    const out = plan(s, rows, cols, { rounds: 6 });
    const frac = rd => rd.lanes.length / laneLen(rd.axis, rows, cols);
    early += frac(out.rounds[0]);
    late += frac(out.rounds[5]);
  }
  early /= seeds; late /= seeds;
  assert.ok(early > late, `early ${early} not > late ${late}`);
  assert.ok(early >= 0.4 && early <= 0.85, `early fraction ${early}`);
  assert.ok(late >= 0.2 && late <= 0.55, `late fraction ${late}`);
});

test('default opts at card grid sizes produce non-empty rounds', () => {
  for (const [r, c] of [[3, 7], [4, 7], [5, 12]]) {
    for (let s = 1; s <= 5; s++) {
      const out = plan(s, r, c);
      assert.strictEqual(out.rounds.length, 6);
      out.rounds.forEach(rd => assert.ok(rd.lanes.length > 0, `empty round ${r}x${c} seed ${s}`));
      assert.ok(out.rounds.reduce((n, rd) => n + rd.lanes.reduce((m, ln) => m + ln.ops.length, 0), 0) > 0);
    }
  }
});

test('holes:0 yields no holes and no ops change ids', () => {
  const out = plan(15, 4, 7, { holes: 0 });
  assert.deepStrictEqual(Array.from(out.holeCells), []);
  assert.ok(Array.from(out.start).every(v => v >= 0));
  replayChecked(out, 4, 7);
});
