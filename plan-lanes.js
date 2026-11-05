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
  return { planLanes: planLanes, applyRounds: applyRounds, invertRounds: invertRounds };
});
