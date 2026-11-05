'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { waveAt, waveDone, parallaxOffsets } = require('../effects-math.js');

const WAVE = { x: 0, y: 0, v: 1, width: 1.2, lambda: 2 };

test('wave is zero before the front arrives', () => {
  // Arrange: cell at dist 10, front radius at t=5 is 5
  // Act
  const v = waveAt(10, 0, { ...WAVE }, 5);
  // Assert
  assert.equal(v, 0);
});

test('wave peaks at the front and is zero ahead of it', () => {
  // Arrange: front radius r = 2*5 = 10
  const opts = { ...WAVE, v: 2 };
  // Act
  const row = [];
  for (let c = 0; c <= 30; c++) row.push(waveAt(c, 0, opts, 5));
  const peak = row.indexOf(Math.max(...row));
  // Assert
  assert.equal(peak, 10);
  assert.equal(waveAt(11, 0, opts, 5), 0);
});

test('origin off-board (negative coords) still produces a wave', () => {
  const opts = { x: -5, y: -5, v: 1, width: 1.2, lambda: 2 };
  const d = Math.hypot(5, 5);
  assert.equal(waveAt(0, 0, opts, 0), 0);
  assert.ok(waveAt(0, 0, opts, d) > 0.99);
});

test('arrival time is monotone in distance from origin', () => {
  const firstArrival = (dist) => {
    for (let t = 0; t < 30; t += 0.01) {
      if (waveAt(dist, 0, WAVE, t) > 0.01) return t;
    }
    return Infinity;
  };
  let prev = -Infinity;
  for (let d = 1; d <= 8; d++) {
    const t = firstArrival(d);
    assert.ok(t >= prev, `dist ${d} arrived at ${t} before ${prev}`);
    prev = t;
  }
});

test('wave decays to zero long after passing', () => {
  assert.ok(waveAt(5, 0, WAVE, 100) < 1e-6);
});

test('waveDone flips once front passes farthest corner', () => {
  // Farthest corner of 4 rows x 6 cols from (0,0) is (5,3), dist sqrt(34) ~ 5.83
  const area = { rows: 4, cols: 6, x: 0, y: 0, v: 1, width: 1.2 };
  assert.equal(waveDone(area.rows, area.cols, area, 10), false);
  assert.equal(waveDone(area.rows, area.cols, area, 11), true);
});

test('wave is negligible for every cell once waveDone is true', () => {
  const rows = 4;
  const cols = 6;
  assert.equal(waveDone(rows, cols, WAVE, 11), true);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      assert.ok(waveAt(c, r, WAVE, 11) < 1e-6);
    }
  }
});

test('parallax offsets are exactly zero at u=0 and u=1', () => {
  for (const u of [0, 1]) {
    for (const o of parallaxOffsets(3, 4, 2.5, u, 42)) {
      assert.ok(o.dx === 0 && o.dy === 0 && o.dz === 0);
    }
  }
});

test('parallax offsets are all zero when amp is 0', () => {
  for (const o of parallaxOffsets(3, 4, 0, 0.5, 42)) {
    assert.ok(o.dx === 0 && o.dy === 0 && o.dz === 0);
  }
});

test('parallax returns rows*cols entries and moves mid-animation', () => {
  const out = parallaxOffsets(3, 4, 1, 0.5, 7);
  assert.equal(out.length, 12);
  assert.ok(out.some((o) => o.dz !== 0));
});

test('parallax magnitude scales linearly with amp', () => {
  const a = parallaxOffsets(3, 4, 1, 0.3, 9);
  const b = parallaxOffsets(3, 4, 2, 0.3, 9);
  a.forEach((o, i) => {
    assert.ok(Math.abs(b[i].dx - 2 * o.dx) < 1e-12);
    assert.ok(Math.abs(b[i].dz - 2 * o.dz) < 1e-12);
  });
});

test('parallax is deterministic per seed and differs across seeds', () => {
  const s1a = parallaxOffsets(3, 4, 1, 0.5, 1);
  const s1b = parallaxOffsets(3, 4, 1, 0.5, 1);
  const s2 = parallaxOffsets(3, 4, 1, 0.5, 2);
  assert.deepEqual(s1a, s1b);
  assert.notDeepEqual(s1a, s2);
});

test('parallax dx takes opposite signs for near and far layers', () => {
  const out = parallaxOffsets(10, 10, 1, 0.5, 3);
  assert.ok(out.some((o) => o.dx > 0));
  assert.ok(out.some((o) => o.dx < 0));
});
