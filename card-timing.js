/* card-timing.js - pure turn/blur/activity + cube-flip timing for glass-card.html.
 * UMD: browser global CardTiming, or module.exports in node. No DOM, no globals, no RNG of its own.
 * Moved verbatim from glass-card.html updateCells(); see refs/testing-timing.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardTiming = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function easeIO(x) { x = Math.max(0, Math.min(1, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  /* c: {u, shown, pending, blurPeak, act}  st: sim cell {locked, blurHint}  p: progress (unused here, kept for API)
   * K: {turnUp, turnDown, turnDownLocked, actUp, actDown}  flags: {letters}
   * Returns a NEW object; mutates nothing. swap=true on the tick where the glyph changed. */
  function stepCell(c, st, p, dt, K, flags) {
    var u = c.u, shown = c.shown, pending = c.pending, blurPeak = c.blurPeak, act = c.act, swap = false;
    // turn cycle: pending change => turn out (u->1), swap at the peak, then un-turn (u->0)
    if (pending) { u = Math.min(1, u + dt * K.turnUp); }
    else u = Math.max(0, u - dt * (st.locked ? K.turnDownLocked : K.turnDown));
    if (pending && u >= .97) {
      shown = st; pending = false; swap = true;
      blurPeak = Math.max(.5, st.blurHint || 0) * (st.locked ? .7 : 1);
    }
    var blur = blurPeak * u * u * (3 - 2 * u) * (st.locked && !pending ? 1 : 1);
    var wantAct = (st.locked && !pending && u < .02) ? 0 : 1;
    if (wantAct) act = Math.min(1, act + dt * K.actUp); else act = Math.max(0, act - dt * K.actDown);
    var settled = wantAct === 0 && act === 0;
    return { u: u, shown: shown, pending: pending, blurPeak: blurPeak, blur: blur, act: act, settled: settled, swap: swap };
  }

  /* c: {cax,cay,dx,dy,fl,nextFlip,act}  st: {locked}  t: run time  rng: () -> [0,1)
   * flags: {cubes, link}  lvx,lvy: letter tilt vector (dy*amp, dx*amp)
   * Returns NEW {cx,cy,cax,cay,fl,nextFlip}; consumes rng only when a flip starts or ends. */
  function stepFlip(c, st, t, rng, flags, lvx, lvy) {
    var o = { cx: 0, cy: 0, cax: c.cax, cay: c.cay, fl: c.fl, nextFlip: c.nextFlip };
    if (flags.cubes && flags.link) {
      o.cx = o.cax + lvx; o.cy = o.cay + lvy;
    } else if (flags.cubes || o.fl) {
      if (flags.cubes && !o.fl && !st.locked && c.act > .3 && t > o.nextFlip) {
        var ax = rng() < .5 ? 0 : 1, k = rng() < .3 ? 2 : 1, sg = -(ax ? Math.sign(c.dx) : Math.sign(c.dy)) || 1;
        o.fl = { t0: t, dur: .55 + rng() * .5, ax: ax, d: sg * k * Math.PI / 2, a0: ax ? o.cay : o.cax };
      }
      if (o.fl) {
        var e = easeIO((t - o.fl.t0) / o.fl.dur), a = o.fl.a0 + o.fl.d * e;
        if (o.fl.ax) { o.cy = a; o.cx = o.cax; } else { o.cx = a; o.cy = o.cay; }
        if (e >= 1) { if (o.fl.ax) o.cay = a; else o.cax = a; o.fl = null; o.nextFlip = t + .05 + rng() * .5; }
      } else { o.cx = o.cax; o.cy = o.cay; }
    } else { o.cx = o.cax; o.cy = o.cay; }
    return o;
  }

  /* Page frame-loop policy. ROOT CAUSE of "never settles" (see refs/testing-page-flow.md): the page used
   * dt = min(.05, realDt) for BOTH animation and the sim tick accumulator, so on a slow-rendering machine
   * (<~3 fps) simulated time advanced only 50 ms per frame no matter how much wall time passed. Now the
   * frame dt may be large (tab restore, slow GPU) and is consumed in slices <= maxSlice. */
  var LOOP = { maxFrameDt: 2, maxSlice: 0.05, maxTicksPerFrame: 40 };

  /* Split dt into steps <= maxStep (sum preserved). */
  function slices(dt, maxStep) {
    var out = [], n = Math.max(1, Math.ceil(dt / maxStep - 1e-9)), i;
    for (i = 0; i < n; i++) out.push(dt / n);
    return out;
  }

  /* Tick accumulator. Returns {acc, ticks}; ticks capped at maxTicks (excess carried only up to one tick). */
  function advanceTicks(acc, dtMs, tickMs, maxTicks) {
    acc += dtMs;
    var ticks = Math.min(maxTicks, Math.floor(acc / tickMs));
    acc -= ticks * tickMs;
    if (acc >= tickMs) acc = tickMs - 1e-6;
    return { acc: acc, ticks: ticks };
  }


  /* ---------------------------------------------------------------- timeline (pure, DOM-free; refs/testing-timeline.md)
   * Phases, in order: resolving -> locked -> cubesFading -> sliding -> secondary -> done.
   * Everything is a pure function of t (ms on the page's own play clock), so a huge frame dt (the 2 s clamp) can jump
   * several phases in one frame but can never skip backwards, repeat or leave a phase half-run.
   * o: {t, lockedAt (ms the sim had every cell locked, null/undefined until then), settledAt (ms every cell reached
   *     act 0, optional), cubesFadeMs, lockedHoldMs, slideMs, secondaryDelayMs, secondaryMs, tight, mode ('off'|'fade'|'decode'),
   *     hasSecondary (false = behave as mode off), reduced}
   * Returns {phase, slideT (0..1 linear, 0 unless tight), secondaryT (0..1), bevel (1 -> 0 while the cubes fade), cubesT (0..1)}. */
  var PHASES = ['resolving', 'locked', 'cubesFading', 'sliding', 'secondary', 'done'];
  var TL = { lockedHoldMs: 100, cubesFadeMs: 700, slideMs: 1000, secondaryDelayMs: 150, secondaryMs: 1200 };
  function fin(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }
  function c01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function timeline(o) {
    o = o || {};
    var tight = !!o.tight, mode = (o.mode === 'fade' || o.mode === 'decode') ? o.mode : 'off';
    if (o.hasSecondary === false) mode = 'off';
    var hold = Math.max(0, fin(o.lockedHoldMs, TL.lockedHoldMs)), fadeMs = Math.max(0, fin(o.cubesFadeMs, TL.cubesFadeMs));
    var slideMs = Math.max(0, fin(o.slideMs, TL.slideMs)), dly = Math.max(0, fin(o.secondaryDelayMs, TL.secondaryDelayMs));
    var secMs = Math.max(0, fin(o.secondaryMs, TL.secondaryMs));
    if (o.reduced) return { phase: 'done', slideT: tight ? 1 : 0, secondaryT: mode !== 'off' ? 1 : 0, bevel: 0, cubesT: 1 };
    var r = { phase: 'resolving', slideT: 0, secondaryT: 0, bevel: 1, cubesT: 0 };
    var t = fin(o.t, 0), lk = o.lockedAt;
    if (typeof lk !== 'number' || !isFinite(lk) || t < lk) return r;
    /* secondaryEarly: the secondary message starts right when the primary resolves (lockedAt + delay), in parallel with the cube fade and slide,
       instead of after them. Still a pure function of t, so big frame jumps cannot skip it. */
    var early = !!o.secondaryEarly && mode !== 'off';
    if (early) r.secondaryT = secMs > 0 ? c01((t - (lk + dly)) / secMs) : (t >= lk + dly ? 1 : 0);
    var fs = lk + hold, fe = Math.max(fs + fadeMs, fin(o.settledAt, 0));
    if (t < fs) { r.phase = 'locked'; return r; }
    if (t < fe) { r.phase = 'cubesFading'; r.cubesT = c01((t - fs) / (fe - fs)); r.bevel = 1 - r.cubesT * r.cubesT * (3 - 2 * r.cubesT); return r; }
    r.cubesT = 1; r.bevel = 0;
    var se = fe + (tight ? slideMs : 0);
    if (tight && t < se) { r.phase = 'sliding'; r.slideT = c01((t - fe) / slideMs); return r; }
    r.slideT = tight ? 1 : 0;
    if (mode === 'off') { r.phase = 'done'; return r; }
    if (early) { r.phase = r.secondaryT >= 1 ? 'done' : 'secondary'; return r; }
    r.secondaryT = secMs > 0 ? c01((t - (se + dly)) / secMs) : (t >= se + dly ? 1 : 0);
    r.phase = r.secondaryT >= 1 ? 'done' : 'secondary';
    return r;
  }
  function phaseIndex(p) { return PHASES.indexOf(p); }
  /* Total ms from lockedAt to done (settledAt ignored). */
  function totalMs(o) {
    o = o || {}; var mode = (o.mode === 'fade' || o.mode === 'decode') && o.hasSecondary !== false;
    return fin(o.lockedHoldMs, TL.lockedHoldMs) + fin(o.cubesFadeMs, TL.cubesFadeMs) + (o.tight ? fin(o.slideMs, TL.slideMs) : 0) +
      (mode ? fin(o.secondaryDelayMs, TL.secondaryDelayMs) + fin(o.secondaryMs, TL.secondaryMs) : 0);
  }

  function getT() { if (typeof module === 'object' && module.exports) return require('./card-text.js'); return (typeof globalThis !== 'undefined' ? globalThis : {}).CardText; }

  /* tightLayout: where each grid cell's glyph goes under proportional spacing. Units: cell units (1 = one grid cell).
   * o: {lines:[[g..]..] (as laid out in the grid by GlyphEngine.layoutText), cols, rows, advanceFn(g, styleKey) -> cell units at scale 1,
   *     styleKey, gap, tracking, lineHeight=1.2, fontUnits=.682 (em in cell units), maxScale=1.2, minScale=.5, pad=.4, T (CardText, optional)}
   * -> {n, from[], to[], has[], s}: from = grid cell center x (0 = grid center), to = typographic center x (per line centered),
   *    has[i] = cell holds a line glyph (spaces included; they just have no ink). Cells without text keep to = from. */
  function tightLayout(o) {
    var T = o.T || getT(), cols = o.cols | 0, rows = o.rows | 0, n = cols * rows, lines = o.lines || [], adv = o.advanceFn || function () { return .6; };
    var from = [], to = [], has = [], i, gx;
    for (i = 0; i < n; i++) { gx = i % cols; from.push(gx - (cols - 1) / 2); to.push(gx - (cols - 1) / 2); has.push(false); }
    var s = T.fitScale(lines, adv, { w: Math.max(.5, cols - fin(o.pad, .4)), h: Math.max(1, lines.length) },
      { styleKey: o.styleKey, gap: o.gap, tracking: o.tracking, lineHeight: o.lineHeight, fontPx: fin(o.fontUnits, .682), maxScale: fin(o.maxScale, 1.2), minScale: fin(o.minScale, .5) });
    if (!(s > 0) || !isFinite(s)) s = 1;
    var y0 = Math.floor((rows - lines.length) / 2);
    lines.forEach(function (gs, li) {
      var advs = gs.map(function (g) { return Math.max(0, fin(adv(g, o.styleKey), 0)) * s; });
      var lay = T.layoutLine(advs, { gap: fin(o.gap, 0) * s, tracking: fin(o.tracking, 0) * s, align: 'center' });
      var x0 = Math.floor((cols - gs.length) / 2);
      for (var k = 0; k < gs.length; k++) {
        var gxk = x0 + k, y = y0 + li;
        if (gxk < 0 || gxk >= cols || y < 0 || y >= rows) continue;
        var idx = y * cols + gxk;
        to[idx] = lay.x[k] + advs[k] / 2; has[idx] = true;
      }
    });
    return { n: n, from: from, to: to, has: has, s: s };
  }
  /* slideOffsets(layout, slideT, easeName='easeInOutCubic') -> {dx[], sc[]}: per cell index, x offset from the grid position and
   * uniform glyph/cube scale (1 -> layout.s on text cells). slideT<=0 is exactly the grid (dx 0, sc 1); slideT>=1 exactly the end state. */
  function slideOffsets(L, slideT, easeName) {
    var T = getT(), pos = T.slide(L.from, L.to, slideT, easeName), e = T.ease(easeName || 'easeInOutCubic', slideT), dx = [], sc = [], i;
    for (i = 0; i < L.n; i++) { dx.push(pos[i] - L.from[i]); sc.push(L.has[i] ? 1 + (L.s - 1) * e : 1); }
    return { dx: dx, sc: sc };
  }

  /* ---------------------------------------------------------------- background controls (pure; refs/testing-bgcontrols.md)
   * stamp(prev, phase, target, nowMs): ms when phase first reached `target` (kept once set); null until then. Replay passes prev=null.
   * ramp(resolvedAtMs, nowMs, rampMs): 0 (null/before) -> 1, smoothstep, monotone, clamped, safe for any dt jump.
   * bgTimeScale: speed (0.05..2) * (1 -> crawlK (0.001..1) along ramp). bgBlurPx: blurPx (0..6) * ramp, 0 when off. blurLod: mip bias for a bg widthPx wide. */
  function stamp(prev, phase, target, nowMs) {
    if (typeof prev === 'number' && isFinite(prev)) return prev;
    return phaseIndex(target) >= 0 && phaseIndex(phase) >= phaseIndex(target) ? fin(nowMs, 0) : null;
  }
  function ramp(resolvedAtMs, nowMs, rampMs) {
    if (typeof resolvedAtMs !== 'number' || !isFinite(resolvedAtMs)) return 0;
    var d = Math.max(0, fin(rampMs, 2000)), n = fin(nowMs, 0), x = d > 0 ? c01((n - resolvedAtMs) / d) : (n >= resolvedAtMs ? 1 : 0);
    return x * x * (3 - 2 * x);
  }
  function clampN(x, lo, hi, d) { x = fin(x, d); return x < lo ? lo : x > hi ? hi : x; }
  function bgTimeScale(o) {
    o = o || {}; var sp = clampN(o.speed, 0.05, 2, 0.6);
    if (!o.crawlOn) return sp;
    return sp * (1 + (clampN(o.crawlK, 0.001, 1, 0.01) - 1) * ramp(o.resolvedAtMs, o.nowMs, o.rampMs));
  }
  function bgBlurPx(o) {
    o = o || {};
    return o.blurOn ? clampN(o.blurPx, 0, 6, 1.5) * ramp(o.resolvedAtMs, o.nowMs, o.rampMs) : 0;
  }
  function blurLod(px, widthPx) { return Math.log2(1 + Math.max(0, fin(px, 0)) * Math.max(1, fin(widthPx, 1024)) / 1024); }

  return { stamp: stamp, ramp: ramp, bgTimeScale: bgTimeScale, bgBlurPx: bgBlurPx, blurLod: blurLod, PHASES: PHASES, TL: TL, timeline: timeline, phaseIndex: phaseIndex, totalMs: totalMs, tightLayout: tightLayout, slideOffsets: slideOffsets, easeIO: easeIO, stepCell: stepCell, stepFlip: stepFlip, LOOP: LOOP, slices: slices, advanceTicks: advanceTicks };
});
