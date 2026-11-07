const test = require('node:test'), assert = require('node:assert');
const { createPlayer } = require('../lanes-player.js');
const mk = (o) => createPlayer(Object.assign({ duration: 4, stageBounds: [0, 2, 4] }, o));
test('paused: tick does not advance; play then tick(500) => 0.5', () => {
  const p = mk(); p.tick(500); assert.equal(p.getState().t, 0);
  p.play(); p.tick(500); assert.equal(p.getState().t, 0.5);
});
test('end, loop off => done, t=duration, not playing', () => {
  const p = mk(); p.play(); p.tick(9000);
  const s = p.getState(); assert.equal(s.phase, 'done'); assert.equal(s.t, 4); assert.equal(s.playing, false);
});
test('end, loop on => hold loopHold s at duration, then restart', () => {
  const p = mk({ loop: true, loopHold: 2 }); p.play(); p.tick(4000);
  assert.equal(p.getState().phase, 'hold'); p.tick(1500);
  assert.deepEqual([p.getState().phase, p.getState().t], ['hold', 4]);
  p.tick(600); assert.deepEqual([p.getState().phase, p.getState().t], ['run', 0]);
  assert.equal(p.getState().playing, true);
});
test('loopHold=0 loops immediately', () => {
  const p = mk({ loop: true, loopHold: 0 }); p.play(); p.tick(4000);
  assert.deepEqual([p.getState().phase, p.getState().t], ['run', 0]);
});
test('seek clamps; seek during hold ok', () => {
  const p = mk({ loop: true }); p.seek(-3); assert.equal(p.getState().t, 0); p.seek(99); assert.equal(p.getState().t, 4);
  p.play(); p.tick(10); p.seek(4); assert.equal(p.getState().phase, 'hold'); p.seek(1);
  assert.deepEqual([p.getState().phase, p.getState().t], ['run', 1]);
});
test('setLoop at runtime, toggle, pause, setLoopHold', () => {
  const p = mk(); p.setLoop(true); p.setLoopHold(0); p.play(); p.tick(4000); assert.equal(p.getState().t, 0);
  p.setLoop(false); p.tick(4000); assert.equal(p.getState().phase, 'done');
  p.toggle(); assert.equal(p.getState().playing, true); assert.equal(p.getState().t, 0); p.toggle(); assert.equal(p.getState().playing, false);
});
test('progress and stageBounds echoed', () => {
  const p = mk(); p.seek(1); assert.equal(p.getState().progress, 0.25); assert.deepEqual(p.getState().stageBounds, [0, 2, 4]);
});
