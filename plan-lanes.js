/* plan-lanes.js: pure sliding-lanes planner. UMD: PlanLanes global / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlanLanes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* planLanes(rng, rows, cols, opts) -> rounds [{axis: 'row'|'col', moves: [{i, d}]}]. rng() in [0,1).
   * Rounds alternate row/col. Lane fraction tapers 50-80% (first) -> 30-50% (last). d: nonzero int, |d| <= maxShift. */
  function planLanes(rng, rows, cols, opts) {
    opts = opts || {};
    var R = opts.rounds == null ? 6 : opts.rounds, maxShift = Math.max(1, opts.maxShift == null ? 8 : opts.maxShift);
    var out = [], k, j;
    for (k = 0; k < R; k++) {
      var axis = k % 2 ? 'col' : 'row', n = axis === 'row' ? rows : cols;
      var t = R > 1 ? k / (R - 1) : 0;
      var lo = 0.5 - 0.2 * t, hi = 0.8 - 0.3 * t;
      var f = lo + rng() * (hi - lo);
      var cnt = Math.min(n, Math.max(1, Math.round(f * n)));
      var ids = []; for (j = 0; j < n; j++) ids.push(j);
      for (j = n - 1; j > 0; j--) { var q = Math.floor(rng() * (j + 1)), x = ids[j]; ids[j] = ids[q]; ids[q] = x; }
      var moves = ids.slice(0, cnt).sort(function (a, b) { return a - b; }).map(function (i) {
        var m = 1 + Math.floor(rng() * maxShift);
        return { i: i, d: rng() < 0.5 ? -m : m };
      });
      out.push({ axis: axis, moves: moves });
    }
    return out;
  }
  /* grid[r][c]; positive d = toward higher index (right/down), torus. Returns a new grid. */
  function applyRounds(grid, rounds) {
    var g = grid.map(function (r) { return r.slice(); });
    rounds.forEach(function (rd) {
      rd.moves.forEach(function (m) {
        var len = rd.axis === 'row' ? g[0].length : g.length, old = [], x;
        for (x = 0; x < len; x++) old.push(rd.axis === 'row' ? g[m.i][x] : g[x][m.i]);
        for (x = 0; x < len; x++) {
          var v = old[(((x - m.d) % len) + len) % len];
          if (rd.axis === 'row') g[m.i][x] = v; else g[x][m.i] = v;
        }
      });
    });
    return g;
  }
  function invertRounds(rounds) {
    return rounds.slice().reverse().map(function (rd) {
      return { axis: rd.axis, moves: rd.moves.slice().reverse().map(function (m) { return { i: m.i, d: -m.d }; }) };
    });
  }
  /* ---- planLanes2: hole-based slides, generated backward from the solved grid ---- */
  function shuffle(rng, arr) {
    for (var j = arr.length - 1; j > 0; j--) {
      var q = Math.floor(rng() * (j + 1)), x = arr[j]; arr[j] = arr[q]; arr[q] = x;
    }
    return arr;
  }
  function lanePos(axis, i, x, rows, cols) { return axis === 'row' ? i * cols + x : x * cols + i; }
  /* Move run [a, a+len) one cell in direction d into the adjacent hole. No checks: callers validate. */
  function slideRun(g, rows, cols, axis, i, a, len, d) {
    var x, vals = [];
    for (x = a; x < a + len; x++) vals.push(g[lanePos(axis, i, x, rows, cols)]);
    for (x = a; x < a + len; x++) g[lanePos(axis, i, x, rows, cols)] = -1;
    vals.forEach(function (v, k) { g[lanePos(axis, i, a + k + d, rows, cols)] = v; });
  }
  /* Random legal reverse slides inside one lane; returns forward-inverse ops in generation order. */
  function genLaneOps(rng, g, rows, cols, axis, i, maxRun, attempts) {
    var L = axis === 'row' ? cols : rows, ops = [], t, a, len, d, cand;
    for (t = 0; t < attempts; t++) {
      cand = [];
      for (a = 0; a < L; a++) {
        for (len = 1; len <= Math.min(maxRun, L - a) && g[lanePos(axis, i, a + len - 1, rows, cols)] >= 0; len++) {
          for (d = -1; d <= 1; d += 2) {
            var tgt = d === 1 ? a + len : a - 1;
            if (tgt >= 0 && tgt < L && g[lanePos(axis, i, tgt, rows, cols)] === -1) cand.push({ a: a, len: len, d: d });
          }
        }
      }
      if (!cand.length) break;
      var pick = cand[Math.floor(rng() * cand.length)];
      slideRun(g, rows, cols, axis, i, pick.a, pick.len, pick.d);
      ops.push({ a: pick.a + pick.d, len: pick.len, d: -pick.d });
    }
    return ops;
  }
  /* opts: {holes: fraction absent during slides, rounds, maxRun}. Returns forward play data (see contract in test/lanes2.test.js). */
  function planLanes2(rng, rows, cols, opts) {
    opts = opts || {};
    var holesFrac = opts.holes == null ? 0.2 : opts.holes;
    var R = opts.rounds == null ? 6 : opts.rounds;
    var maxRun = Math.max(1, opts.maxRun == null ? 3 : opts.maxRun);
    var n = rows * cols, k, j;
    var solved = new Int32Array(n);
    for (k = 0; k < n; k++) solved[k] = k;
    var ids = []; for (k = 0; k < n; k++) ids.push(k);
    var holeCells = shuffle(rng, ids).slice(0, Math.round(holesFrac * n)).sort(function (a, b) { return a - b; });
    var g = Int32Array.from(solved);
    holeCells.forEach(function (c) { g[c] = -1; });
    var back = [];
    for (k = R - 1; k >= 0; k--) {
      var axis = k % 2 ? 'col' : 'row', nL = axis === 'row' ? rows : cols;
      var t = R > 1 ? k / (R - 1) : 0;
      var lo = 0.5 - 0.2 * t, hi = 0.8 - 0.3 * t;
      var cnt = Math.min(nL, Math.max(1, Math.round((lo + rng() * (hi - lo)) * nL)));
      var laneIds = []; for (j = 0; j < nL; j++) laneIds.push(j);
      /* Walk lanes in random order; lanes with no legal slide are skipped and do not count toward cnt. */
      var order = shuffle(rng, laneIds), lanes = [];
      for (j = 0; j < order.length && lanes.length < cnt; j++) {
        var ops = genLaneOps(rng, g, rows, cols, axis, order[j], maxRun, 1 + Math.floor(rng() * 2));
        if (ops.length) lanes.push({ i: order[j], ops: ops });
      }
      lanes.sort(function (a, b) { return a.i - b.i; });
      back.push({ axis: axis, lanes: lanes });
    }
    /* back[] is last-round-first; each lane's ops were generated in reverse time, so reverse them too. */
    var rounds = back.reverse().map(function (rd) {
      return { axis: rd.axis, lanes: rd.lanes.map(function (ln) { return { i: ln.i, ops: ln.ops.slice().reverse() }; }) };
    });
    return { solved: solved, start: Int32Array.from(g), holeCells: holeCells, rounds: rounds };
  }
  /* Pure replay of forward rounds on a copy of start. */
  function applyRounds2(start, rows, cols, rounds) {
    var g = Int32Array.from(start);
    rounds.forEach(function (rd) {
      rd.lanes.forEach(function (ln) {
        ln.ops.forEach(function (op) { slideRun(g, rows, cols, rd.axis, ln.i, op.a, op.len, op.d); });
      });
    });
    return g;
  }
  /* Fill in the holes after the last slide: every surviving cube must sit at its solved cell. */
  function fillHoles(grid, solved) {
    for (var k = 0; k < solved.length; k++) {
      if (grid[k] >= 0 && grid[k] !== solved[k]) throw new Error('fillHoles: cube ' + grid[k] + ' at cell ' + k + ' != solved ' + solved[k]);
    }
    return Int32Array.from(solved);
  }
  return {
    planLanes: planLanes, applyRounds: applyRounds, invertRounds: invertRounds,
    planLanes2: planLanes2, applyRounds2: applyRounds2, fillHoles: fillHoles
  };
});
