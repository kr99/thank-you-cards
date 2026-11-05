'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { planLanes3, sampleLanes } = require('../lanes3.js');

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cellOf = (cols, ax, i, p) => (ax === 'row' ? i * cols + p : p * cols + i);
const laneLen = (p, ax) => (ax === 'row' ? p.cols : p.rows);
const P = (seed, D, speed) => planLanes3(5, 19, { seed: seed || 7, D: D || 3, speed: speed === undefined ? 0.5 : speed });

function expectedR(D, speed) {
  const sd = lerp(0.9, 0.35, speed), stg = 0.3 * sd, gap = 0.2 * sd, u = sd + stg + gap;
  const fill = clamp(0.15 * D, 0.3, 0.8);
  return clamp(Math.round((D - fill + gap) / u), 1, 10);
}
/* apply one op to state (mutates copy) and return it; asserts nothing */
function applyOp(plan, S, op) {
  const out = S.slice();
  op.moves.forEach(m => { out[cellOf(plan.cols, op.axis, op.index, m.from)] = null; });
  op.moves.forEach(m => { out[cellOf(plan.cols, op.axis, op.index, m.to)] = m.id; });
  return out;
}
const laneIds = (plan, S, op) => {
  const r = [];
  for (let p = 0; p < laneLen(plan, op.axis); p++) { const v = S[cellOf(plan.cols, op.axis, op.index, p)]; if (v !== null) r.push(v); }
  return r;
};

test('1 deterministic per seed', () => {
  assert.deepStrictEqual(P(3), P(3));
  assert.notDeepStrictEqual(P(1), P(2));
});

test('2 replay solves; 8 no double occupancy, ids conserved; 3 lane order kept', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const plan = P(seed);
    let S = plan.start.slice();
    const count = S.filter(v => v !== null).length;
    plan.rounds.forEach(r => r.ops.forEach(op => {
      const before = laneIds(plan, S, op);
      op.moves.forEach(m => assert.strictEqual(S[cellOf(plan.cols, op.axis, op.index, m.from)], m.id));
      const mid = S.slice();
      op.moves.forEach(m => { mid[cellOf(plan.cols, op.axis, op.index, m.from)] = null; });
      op.moves.forEach(m => assert.strictEqual(mid[cellOf(plan.cols, op.axis, op.index, m.to)], null, 'double occupied'));
      S = applyOp(plan, S, op);
      assert.deepStrictEqual(laneIds(plan, S, op), before);
    }));
    assert.strictEqual(S.filter(v => v !== null).length, count);
    plan.fills.forEach(f => { assert.strictEqual(S[f.cell], null); S[f.cell] = f.id; });
    S.forEach((v, c) => assert.strictEqual(v, c));
  }
});

test('4 moves stay in lane and bounded', () => {
  const plan = P(5);
  plan.rounds.forEach(r => r.ops.forEach(op => {
    const N = laneLen(plan, op.axis);
    op.moves.forEach(m => {
      assert.ok(m.from >= 0 && m.from < N && m.to >= 0 && m.to < N && m.from !== m.to);
      assert.ok(Math.abs(m.to - m.from) <= Math.ceil(0.5 * N));
    });
  }));
});

test('5 round axis shared, lanes unique, ops nonempty; 6 alternate', () => {
  const plan = P(9, 5);
  plan.rounds.forEach((r, i) => {
    const seen = new Set();
    r.ops.forEach(op => {
      assert.strictEqual(op.axis, r.axis);
      assert.ok(!seen.has(op.index)); seen.add(op.index);
      assert.ok(op.moves.length >= 1);
    });
    if (i) assert.notStrictEqual(r.axis, plan.rounds[i - 1].axis);
  });
});

test('7 lane count in taper band', () => {
  const plan = P(4, 5, 1);
  plan.rounds.forEach(r => assert.ok(r.ops.length >= 1 && r.ops.length <= Math.max(1, Math.round(0.8 * (r.axis === 'row' ? 5 : 19)))));
  const last = plan.rounds[plan.rounds.length - 1];
  assert.ok(last.ops.length <= Math.max(1, Math.round(0.5 * (last.axis === 'row' ? 5 : 19))));
});

test('9 fills are exactly the hole cells, empty before fill', () => {
  const plan = P(2);
  let S = plan.start.slice();
  plan.rounds.forEach(r => r.ops.forEach(op => { S = applyOp(plan, S, op); }));
  const holes = S.map((v, c) => (v === null ? c : -1)).filter(c => c >= 0).sort((a, b) => a - b);
  assert.deepStrictEqual(plan.fills.map(f => f.cell).sort((a, b) => a - b), holes);
  plan.fills.forEach(f => assert.strictEqual(f.id, f.cell));
});

test('10 duration fit and R; 11 no round overlap', () => {
  [1.5, 2, 3, 5, 10].forEach(D => [0, 0.5, 1].forEach(speed => {
    const plan = P(11, D, speed);
    const fill = clamp(0.15 * D, 0.3, 0.8);
    let maxEnd = 0, lastEnd = -1;
    plan.rounds.forEach(r => {
      r.ops.forEach(op => assert.ok(op.start >= lastEnd - 1e-9));
      lastEnd = Math.max(...r.ops.map(op => op.start + op.dur));
      maxEnd = Math.max(maxEnd, lastEnd);
    });
    const fillEnd = Math.max(...plan.fills.map(f => f.start + f.dur));
    assert.ok(Math.max(maxEnd, fillEnd) <= D + 1e-9);
    assert.ok(D - fillEnd <= 0.5 * fill + 1e-9);
    assert.strictEqual(plan.rounds.length, expectedR(D, speed));
  }));
});

test('12 sampleLanes: no overlap, ends solved', () => {
  const plan = P(6, 3);
  const fillIds = new Set(plan.fills.map(f => f.id));
  for (let i = 0; i <= 50; i++) {
    const s = sampleLanes(plan, (plan.D * i) / 50);
    for (let id = 0; id < s.length; id++) for (let j = id + 1; j < s.length; j++) {
      if (fillIds.has(id) || fillIds.has(j)) continue;
      const a = s[id], b = s[j];
      if (Math.abs(a.y - b.y) < 1e-9) assert.ok(Math.abs(a.x - b.x) >= 1 - 1e-9);
      if (Math.abs(a.x - b.x) < 1e-9) assert.ok(Math.abs(a.y - b.y) >= 1 - 1e-9);
    }
  }
  const e = sampleLanes(plan, plan.D);
  e.forEach((c, id) => {
    assert.ok(Math.abs(c.x - (id % 19)) < 1e-9 && Math.abs(c.y - Math.floor(id / 19)) < 1e-9);
    assert.strictEqual(c.s, 1);
  });
});

test('13 tiny grids', () => {
  const one = planLanes3(1, 1, { seed: 1, D: 2 });
  assert.strictEqual(one.rounds.length, 0);
  assert.strictEqual(one.fills.length, 1);
  const line = planLanes3(1, 9, { seed: 1, D: 2, holes: 0.05 });
  line.rounds.forEach(r => assert.strictEqual(r.axis, 'row'));
  assert.doesNotThrow(() => planLanes3(3, 7, { seed: 1, D: 2, holes: 0.05 }));
});
