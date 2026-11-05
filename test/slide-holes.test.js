'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { seededRng } = require('./helpers');
const PL = require('../plan-lanes.js');
const SL = require('../slide-lanes.js');

const ROWS = 4, COLS = 7;

// Drive the engine at 60 fps until idle; record every committed grid snapshot.
function playToEnd(seed) {
  const plan = PL.planLanes2(seededRng(seed), ROWS, COLS);
  const eng = new SL({ cols: COLS, rows: ROWS, seed });
  const events = [];
  eng.on('solved', v => events.push(v));
  assert.ok(eng.playHoles(plan));
  const holes0 = plan.holeCells.length;
  let roundGrids = [];
  let lastPhase = eng.holePhase;
  for (let f = 0; f < 60 * 120 && !eng.isIdle(); f++) {
    eng.update(1 / 60);
    if (eng.holePhase === 'rounds') {
      const holes = Array.from(eng.grid).filter(v => v === -1).length;
      assert.strictEqual(holes, holes0, 'hole count changed during slides');
    }
    if (lastPhase !== eng.holePhase) { roundGrids.push(eng.holePhase); lastPhase = eng.holePhase; }
  }
  return { plan, eng, events, phases: roundGrids };
}

test('hole playback ends exactly solved and verify() passes', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { plan, eng, events } = playToEnd(seed);
    assert.ok(eng.isIdle(), 'engine did not reach idle');
    assert.deepStrictEqual(Array.from(eng.grid), Array.from(plan.solved));
    assert.deepStrictEqual(eng.verify(), { ok: true, solved: true });
    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], { ok: true, solved: true });
  }
});

test('hole playback passes through fill phase after rounds', () => {
  const { phases } = playToEnd(3);
  assert.ok(phases.includes('fill'), `phases seen: ${phases}`);
});

test('playHoles refuses to start while a legacy solve is running', () => {
  const plan = PL.planLanes2(seededRng(6), ROWS, COLS);
  const eng = new SL({ cols: COLS, rows: ROWS, seed: 6 });
  eng.mode = 'solving';
  assert.strictEqual(eng.playHoles(plan), false);
});

test('getCellState exposes id -1 for holes without throwing', () => {
  const plan = PL.planLanes2(seededRng(8), ROWS, COLS);
  const eng = new SL({ cols: COLS, rows: ROWS, seed: 8 });
  eng.playHoles(plan);
  const ids = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) ids.push(eng.getCellState(c, r).id);
  assert.strictEqual(ids.filter(v => v === -1).length, plan.holeCells.length);
});
