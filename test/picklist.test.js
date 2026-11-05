'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../motion-picklist.js');

test('movePure swaps with neighbour and returns a new array', () => {
  // Arrange
  const tags = ['phase:3s', 'lettersRotate', 'phase:2s'];
  // Act
  const up = PL.movePure(tags, 1, -1);
  const down = PL.movePure(tags, 1, 1);
  // Assert
  assert.deepEqual(up, ['lettersRotate', 'phase:3s', 'phase:2s']);
  assert.deepEqual(down, ['phase:3s', 'phase:2s', 'lettersRotate']);
  assert.deepEqual(tags, ['phase:3s', 'lettersRotate', 'phase:2s']);
});

test('movePure is a no-op at the edges and out of range', () => {
  const tags = ['phase:3s', 'lightSweep'];
  assert.deepEqual(PL.movePure(tags, 0, -1), tags);
  assert.deepEqual(PL.movePure(tags, 1, 1), tags);
  assert.deepEqual(PL.movePure(tags, 5, 1), tags);
});

test('removePure drops one index without mutating input', () => {
  const tags = ['phase:3s', 'lightSweep', 'tightSpacing'];
  assert.deepEqual(PL.removePure(tags, 1), ['phase:3s', 'tightSpacing']);
  assert.equal(tags.length, 3);
});

test('rowModel parses phase and effect tags, null for invalid', () => {
  assert.deepEqual(PL.rowModel('phase:1.5s'), { kind: 'phase', dur: 1.5 });
  assert.deepEqual(PL.rowModel('radialWave;x=-0.5;v=2'), { kind: 'effect', name: 'radialWave', params: { x: -0.5, v: 2 } });
  assert.equal(PL.rowModel('nope'), null);
  assert.equal(PL.rowModel('phase:abc'), null);
});

test('buildTag clamps out-of-range values through MotionPhases', () => {
  assert.equal(PL.buildTag({ kind: 'phase', dur: 99 }), '');
  assert.equal(PL.buildTag({ kind: 'phase', dur: 2 }), 'phase:2s');
  assert.equal(PL.buildTag({ kind: 'effect', name: 'parallaxShift', params: { amp: 7 } }), 'parallaxShift;amp=1');
});

test('tightReverts true only when tightSpacing is outside the final phase', () => {
  assert.equal(PL.tightReverts(['phase:2s', 'tightSpacing', 'phase:1s', 'lightSweep']), true);
  assert.equal(PL.tightReverts(['phase:2s', 'lightSweep', 'phase:1s', 'tightSpacing']), false);
  assert.equal(PL.tightReverts(['tightSpacing']), false);
});

test('importText returns tags on valid input, error on empty or invalid', () => {
  assert.deepEqual(PL.importText('phase:3s,lettersRotate').tags, ['phase:3s', 'lettersRotate']);
  assert.match(PL.importText('').error, /Empty/);
  assert.match(PL.importText('phase:3s,bogus').error, /invalid/);
  assert.match(PL.importText('phase:0.1s').error, /invalid/);
});
