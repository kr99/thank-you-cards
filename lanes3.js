/* lanes3.js: pure sliding-lanes planner (see plans/lanes-algorithm-spec.md). UMD: Lanes3 global / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lanes3 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var ease = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  var dease = function (u) { return u < 0.5 ? 12 * u * u : 3 * Math.pow(2 - 2 * u, 2); };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Fisher-Yates partial: first k of a shuffled copy of arr */
  function pick(rng, arr, k) {
    var a = arr.slice();
    for (var i = 0; i < k; i++) {
      var j = i + Math.floor(rng() * (a.length - i)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, k);
  }

  /* Plan: backward from solved state, then forward timing. opts.isInk accepted, unused (v1: uniform holes). */
  function planLanes3(rows, cols, o) {
    o = o || {};
    var rng = mulberry32(o.seed || 0);
    var n = rows * cols;
    var D = clamp(o.D === undefined ? 3 : o.D, 1.5, 10);
    var speed = clamp(o.speed === undefined ? 0.5 : o.speed, 0, 1);
    var holes = o.holes === undefined ? 0.15 : o.holes;
    var maxFrac = o.maxShiftFrac === undefined ? 0.5 : o.maxShiftFrac;
    var tries = o.tries === undefined ? 20 : o.tries;

    var sd = lerp(0.9, 0.35, speed), stg = 0.3 * sd, gap = 0.2 * sd, u = sd + stg + gap;
    var fill = clamp(0.15 * D, 0.3, 0.8), A = D - fill;
    var R = clamp(Math.round((A + gap) / u), 1, 10);

    var all = [];
    for (var c = 0; c < n; c++) all.push(c);
    var holeCells = pick(rng, all, clamp(Math.max(1, Math.round(holes * n)), 0, n));
    var S = all.slice();
    holeCells.forEach(function (h) { S[h] = null; });

    var axis0 = rng() < 0.5 ? 'row' : 'col';
    var other = function (a) { return a === 'row' ? 'col' : 'row'; };
    var count = function (a) { return a === 'row' ? rows : cols; };
    var len = function (a) { return a === 'row' ? cols : rows; };
    var cell = function (a, i, p) { return a === 'row' ? i * cols + p : p * cols + i; };
    var elig = function (a) {
      var out = [];
      for (var i = 0; i < count(a); i++) {
        var q = 0, N = len(a);
        for (var p = 0; p < N; p++) if (S[cell(a, i, p)] !== null) q++;
        if (q > 0 && q < N) out.push(i);
      }
      return out;
    };

    var built = [];
    for (var r = R - 1; r >= 0; r--) {
      var ax = r % 2 === 0 ? axis0 : other(axis0);
      var el = elig(ax);
      if (!el.length) { ax = other(ax); el = elig(ax); if (!el.length) break; }
      var f = lerp(0.5 + rng() * 0.3, 0.3 + rng() * 0.2, r / (R - 1 || 1));
      var m = clamp(Math.round(f * el.length), 1, el.length);
      var ops = pick(rng, el, el.length).slice(0, m).map(function (i) { return laneBack(ax, i); });
      built.push({ axis: ax, ops: ops });
    }

    function laneBack(ax, i) {
      var N = len(ax), pos = [], ids = [];
      for (var p = 0; p < N; p++) { var v = S[cell(ax, i, p)]; if (v !== null) { pos.push(p); ids.push(v); } }
      var q = ids.length, maxS = Math.ceil(maxFrac * N), np = null;
      var slots = []; for (var s = 0; s < N; s++) slots.push(s);
      for (var t = 0; t < tries && !np; t++) {
        var cand = pick(rng, slots, q).sort(function (a, b) { return a - b; });
        var changed = false, ok = true;
        for (var k = 0; k < q; k++) { if (cand[k] !== pos[k]) changed = true; if (Math.abs(cand[k] - pos[k]) > maxS) ok = false; }
        if (changed && ok) np = cand;
      }
      if (!np) { /* fallback: step one cube by 1 into an adjacent hole */
        np = pos.slice();
        for (var k2 = 0; k2 < q; k2++) {
          var d = [-1, 1].filter(function (dd) { var x = pos[k2] + dd; return x >= 0 && x < N && S[cell(ax, i, x)] === null; })[0];
          if (d) { np[k2] = pos[k2] + d; break; }
        }
      }
      var moves = [];
      for (var p2 = 0; p2 < N; p2++) S[cell(ax, i, p2)] = null;
      ids.forEach(function (id, k3) {
        S[cell(ax, i, np[k3])] = id;
        if (np[k3] !== pos[k3]) moves.push({ id: id, from: np[k3], to: pos[k3] });
      });
      return { axis: ax, index: i, start: 0, dur: 0, moves: moves };
    }

    var rounds = built.reverse();
    var Rn = rounds.length;
    var k = Rn ? A / (Rn * u - gap) : 1;
    rounds.forEach(function (rd, ri) {
      rd.ops.forEach(function (op) { op.start = ri * u * k + rng() * stg * k; op.dur = sd * k; });
    });
    var fills = holeCells.map(function (h) {
      return { id: h, cell: h, start: A + rng() * 0.5 * fill, dur: 0.5 * fill };
    });
    return { rows: rows, cols: cols, D: D, start: S, rounds: rounds, fills: fills };
  }

  /* Per CubeId {x,y,vx,vy,s}; s 0 = hidden. */
  function sampleLanes(p, t) {
    var n = p.rows * p.cols, out = new Array(n);
    for (var c = 0; c < n; c++) out[c] = { x: c % p.cols, y: Math.floor(c / p.cols), vx: 0, vy: 0, s: 1 };
    p.start.forEach(function (id, cellIdx) {
      if (id !== null) { out[id].x = cellIdx % p.cols; out[id].y = Math.floor(cellIdx / p.cols); }
    });
    p.rounds.forEach(function (rd) {
      rd.ops.forEach(function (op) {
        if (t <= op.start) return;
        var done = t >= op.start + op.dur, uu = done ? 1 : (t - op.start) / op.dur;
        op.moves.forEach(function (mv) {
          var pos = mv.from + (mv.to - mv.from) * ease(uu);
          var v = done ? 0 : (mv.to - mv.from) * dease(uu) / op.dur;
          var cc = out[mv.id];
          if (op.axis === 'row') { cc.x = pos; cc.y = op.index; cc.vx = v; cc.vy = 0; }
          else { cc.y = pos; cc.x = op.index; cc.vy = v; cc.vx = 0; }
        });
      });
    });
    p.fills.forEach(function (fl) {
      out[fl.id].s = t >= fl.start + fl.dur - 1e-9 ? 1 : t <= fl.start ? 0 : ease((t - fl.start) / fl.dur);
    });
    return out;
  }

  return { planLanes3: planLanes3, sampleLanes: sampleLanes };
});
