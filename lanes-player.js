/* lanes-player.js: pure playback state machine for the sliding-rows window. No DOM, no timers; caller drives tick(dtMs). UMD: LanesPlayer. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LanesPlayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function createPlayer(o) {
    var dur = o.duration, bounds = (o.stageBounds || []).slice();
    var loop = !!o.loop, hold = o.loopHold == null ? 2 : o.loopHold;
    var t = 0, playing = false, phase = 'run', holdLeft = 0;
    function restart() { t = 0; phase = 'run'; }
    function atEnd() {
      t = dur;
      if (!loop) { playing = false; phase = 'done'; }
      else if (hold <= 0) restart();
      else { phase = 'hold'; holdLeft = hold; }
    }
    return {
      tick: function (dtMs) {
        if (!playing) return;
        if (phase === 'hold') { holdLeft -= dtMs / 1000; if (holdLeft <= 0) restart(); return; }
        t += dtMs / 1000;
        if (t >= dur) atEnd();
      },
      play: function () { if (phase === 'done') restart(); playing = true; },
      pause: function () { playing = false; },
      toggle: function () { if (playing) this.pause(); else this.play(); },
      seek: function (s) {
        t = Math.min(Math.max(+s || 0, 0), dur);
        if (t < dur) phase = 'run';
        else if (phase === 'run') { phase = loop ? 'hold' : 'done'; holdLeft = hold; if (!loop) playing = false; }
      },
      setLoop: function (b) { loop = !!b; },
      setLoopHold: function (s) { hold = Math.max(0, +s || 0); },
      getState: function () { return { t: t, playing: playing, loop: loop, phase: phase, progress: dur > 0 ? t / dur : 0, duration: dur, stageBounds: bounds }; }
    };
  }
  return { createPlayer: createPlayer };
});
