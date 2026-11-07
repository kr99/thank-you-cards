'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MP = require('../motion-phases.js');

const USER = 'phase:3s,lettersRotate,slidingLanes,phase:1.5s,lightSweep,phase:1s,tightSpacing,revealMsg2';

test('parse then format round-trips the user example exactly', () => {
  // Arrange / Act
  const tags = MP.parseMotionPhases(USER);
  // Assert
  assert.equal(MP.formatMotionPhases(tags), USER);
  assert.equal(tags.length, 8);
});

test('bare seconds are accepted and emitted with s suffix', () => {
  assert.equal(MP.formatMotionPhases(MP.normalize(['phase:3', 'lettersRotate'])), 'phase:3s,lettersRotate');
});

test('params use semicolons and keep negative numbers', () => {
  const out = MP.normalize(['radialWave;x=-0.5;y=1;v=2', 'parallaxShift;amp=0.5']);
  assert.deepEqual(out, ['radialWave;x=-0.5;y=1;v=2', 'parallaxShift;amp=0.5']);
});

test('param values clamp to documented ranges', () => {
  const out = MP.normalize(['parallaxShift;amp=7', 'radialWave;x=-99;y=99;v=0', 'radialWave;v=50']);
  assert.deepEqual(out, ['parallaxShift;amp=1', 'radialWave;x=-10;y=10;v=0.1', 'radialWave;v=4']);
});

test('unknown effects, unknown params and non-numeric params drop the whole tag', () => {
  assert.deepEqual(MP.normalize(['nope', 'lettersRotate', 'radialWave;x=abc;y=1']), ['lettersRotate']);
  assert.deepEqual(MP.normalize(['parallaxShift;zz=3']), []);
  assert.deepEqual(MP.normalize(['lettersRotate;amp=1']), []);
});

test('phase duration outside 0.5..10 is dropped', () => {
  assert.deepEqual(MP.normalize(['phase:0.2s', 'phase:11s', 'phase:0.5s', 'lettersRotate']), ['phase:0.5s', 'lettersRotate']);
});

test('max 6 phases: extra phase tags are dropped', () => {
  const tags = ['phase:1s', 'phase:1s', 'phase:1s', 'phase:1s', 'phase:1s', 'phase:1s', 'phase:1s', 'lightSweep'];
  const out = MP.normalize(tags);
  assert.equal(out.filter((t) => t.indexOf('phase:') === 0).length, 6);
});

test('max 16 tags total', () => {
  const out = MP.normalize(new Array(30).fill('lightSweep'));
  assert.equal(out.length, 16);
});

test('effects before any phase tag live in an implicit 3s first phase', () => {
  const list = MP.phasesToTimeline(['lettersRotate', 'phase:2s', 'lightSweep']);
  assert.deepEqual(list[0], { effect: 'lettersRotate', params: {}, phase: 1, t0: 0, t1: 3, revertAt: null });
  assert.deepEqual(list[1], { effect: 'lightSweep', params: {}, phase: 2, t0: 3, t1: 5, revertAt: null });
  assert.equal(MP.totalDuration(['lettersRotate', 'phase:2s', 'lightSweep']), 5);
});

test('phasesToTimeline: effects span their phase window', () => {
  const list = MP.phasesToTimeline(MP.parseMotionPhases(USER));
  const sweep = list.find((e) => e.effect === 'lightSweep');
  assert.deepEqual([sweep.phase, sweep.t0, sweep.t1], [2, 3, 4.5]);
  assert.equal(MP.totalDuration(MP.parseMotionPhases(USER)), 5.5);
});

test('tightSpacing reverts at its phase end unless in the final phase', () => {
  const list = MP.phasesToTimeline(MP.parseMotionPhases(USER));
  // tightSpacing sits in phase 3 which is the final phase: persists
  const tight = list.find((e) => e.effect === 'tightSpacing');
  assert.equal(tight.revertAt, null);

  const early = MP.phasesToTimeline(['phase:2s', 'tightSpacing', 'phase:1s', 'lightSweep']);
  const t = early.find((e) => e.effect === 'tightSpacing');
  assert.equal(t.revertAt, 2);
});

test('validate drops tags that are not phase or effect strings', () => {
  assert.deepEqual(MP.normalize(['<script>', '', 'phase:', 'lightSweep']), ['lightSweep']);
});

test('parse ignores empty segments and whitespace', () => {
  assert.deepEqual(MP.parseMotionPhases(' lightSweep , ,phase:1s '), ['lightSweep', 'phase:1s']);
});
