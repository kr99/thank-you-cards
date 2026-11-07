/* lanes4.js: pure sliding-lanes planner v2 (see plans/lanes-algorithm-spec-v2.md). UMD: Lanes4 global / module.exports.
 * Decisions where the spec was ambiguous (simplest rule picked):
 *  - Work in "front space" p' (p' = p if dir>0 else L-1-p) so one code path serves both directions.
 *  - Surplus remaining A cubes (more than |B|): the back-most exit past the BACK edge (ends -m..-1), not the
 *    front: front exit would cross the paired cubes. Order stays preserved.
 *  - Entering cubes start contiguous right behind the back edge (-m..-1): never on board, never cross A cubes,
 *    and their gaps open while travelling on screen (arriving pre-spread made gaps pop in). Limit: a gap inside
 *    the entering stream still opens partly off-board, so it is not perfectly time-symmetric with closing.
 *  - Pairing: remaining A cubes pair with the front-most B slots. Cubes never
 *    move backward. Last step uses gapless B so the grid packs at T.
 *  - Defaults changed 2026-11-07: CAP_COL 1.9, Q_FULL 0 (hidden), GAP_P clamped to <= 0.20 in planLanes4.
 *  - Cubes carry a stable `id` (survivors keep it across steps; entering cubes get new ids).
 *  - sampleLanes4 clip rule: cell (x,y) spans [x,x+1); returned iff it overlaps the board: -1 < x < C, -1 < y < R.
 *    The renderer must clip to the board so edge cubes are partially drawn (no pop at the edge).
 *  - plan = {R,C,T,K,D,A0:bool[R*C],steps:[{axis,lanes:[{index,L,s}],cubes:[{fx,fy,tx,ty}]}]}.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lanes4 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LANES4_DEFAULTS = {
    K: 5, T: 5.5, GAP_P: 0.15, LAMBDA: 0.5, CAP_ROW: 1, CAP_COL: 1.9,
    W_LO: 0.5, W_HI: 2, Q_FULL: 0
  };
  var GAP_MAX = 0.2;
  var LANES4_UI = [
    { key: 'T', label: 'Total time (s)', help: 'Length of the whole shuffle, ending at the letter lock', min: 2, max: 20, step: 0.5, default: LANES4_DEFAULTS.T },
    { key: 'K', label: 'Number of shifts (rows, cols, rows...)', help: 'Shifts alternate rows then columns; more shifts = shorter, faster slides', min: 1, max: 12, step: 1, default: LANES4_DEFAULTS.K },
    { key: 'GAP_P', label: 'Gap chance per cell', help: 'Chance any cell is empty in a start/end layout (0.15 = 15%)', min: 0, max: GAP_MAX, step: 0.01, default: LANES4_DEFAULTS.GAP_P }
  ];

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

  function rollShift(rng, L, Lref, cap, p) {
    var u1 = rng(), u2 = rng(), u3 = rng(), u4 = rng(), u5 = rng();
    var S = Math.pow(L, 1 - p.LAMBDA) * Math.pow(Lref, p.LAMBDA);
    var w = p.W_LO * Math.pow(p.W_HI / p.W_LO, u1);
    var M = Math.min(cap * L, S * w);
    var s = Math.round(M * u2 * (2 * u3 - 1));
    if (u4 < p.Q_FULL) s = (u5 < 0.5 ? -1 : 1) * L;
    return s;
  }

  /* A: sorted occupied positions of one lane. Returns [{f,t}] in lane coords (off-board allowed). */
  function planLane(rng, A, L, s, last, p) {
    var dir = s >= 0 ? 1 : -1, dist = Math.abs(s);
    var fr = function (q) { return dir > 0 ? q : L - 1 - q; };
    var to = fr; // involution
    var a = A.map(fr).sort(function (x, y) { return x - y; });
    var b = [];
    for (var i = 0; i < L; i++) if (last || rng() >= p.GAP_P) b.push(i);
    var rem = a.filter(function (q) { return q + dist < L; });
    var out = a.filter(function (q) { return q + dist >= L; }).map(function (q) { return [q, q + dist]; });
    var r = rem.length, nb = b.length;
    if (r > nb) {
      var m = r - nb;
      for (var i2 = 0; i2 < m; i2++) out.push([rem[i2], -m + i2]);
      rem = rem.slice(m); r = nb;
    }
    var front = b.slice(nb - r), enter = b.slice(0, nb - r), me = enter.length;
    rem.forEach(function (q, j) { out.push([q, front[j]]); });
    enter.forEach(function (e, j) { out.push([-(me - j), e, true]); });
    return out.map(function (c) { return { f: to(c[0]), t: to(c[1]), enter: !!c[2] }; });
  }

  function planLanes4(o) {
    var p = Object.assign({}, LANES4_DEFAULTS, o.params);
    p.GAP_P = Math.min(GAP_MAX, Math.max(0, p.GAP_P));
    var R = o.R, C = o.C, K = p.K, T = o.T === undefined ? p.T : o.T, rng = mulberry32(o.seed || 0);
    var Lref = Math.sqrt(R * C);
    var occ = [], A0 = [], idAt = {}, nextId = 0;
    for (var y = 0; y < R; y++) for (var x = 0; x < C; x++) {
      var on = rng() >= p.GAP_P;
      A0.push(on); if (on) { occ.push([x, y]); idAt[x + ',' + y] = nextId++; }
    }
    var steps = [];
    for (var k = 0; k < K; k++) {
      var row = k % 2 === 0, L = row ? C : R, n = row ? R : C;
      var cap = row ? p.CAP_ROW : p.CAP_COL, last = k === K - 1;
      var step = { axis: row ? 'row' : 'col', lanes: [], cubes: [] }, next = [], nextAt = {};
      for (var i = 0; i < n; i++) {
        var A = occ.filter(function (c) { return (row ? c[1] : c[0]) === i; })
          .map(function (c) { return row ? c[0] : c[1]; });
        var s = rollShift(rng, L, Lref, cap, p);
        step.lanes.push({ index: i, L: L, s: s });
        planLane(rng, A, L, s, last, p).forEach(function (c) {
          var q = row ? { fx: c.f, fy: i, tx: c.t, ty: i, enter: c.enter } : { fx: i, fy: c.f, tx: i, ty: c.t, enter: c.enter };
          q.id = c.enter ? nextId++ : idAt[q.fx + ',' + q.fy];
          step.cubes.push(q);
          if (c.t >= 0 && c.t < L) { next.push(row ? [c.t, i] : [i, c.t]); nextAt[q.tx + ',' + q.ty] = q.id; }
        });
      }
      steps.push(step); occ = next; idAt = nextAt;
    }
    return { R: R, C: C, T: T, K: K, D: T / K, A0: A0, steps: steps };
  }

  var ease = function (u) { return (1 - Math.cos(Math.PI * u)) / 2; };

  function sampleLanes4(plan, t) {
    var k = Math.min(plan.K - 1, Math.max(0, Math.floor(t / plan.D)));
    var u = ease(Math.min(1, Math.max(0, (t - k * plan.D) / plan.D)));
    var stopped = t >= plan.T, out = [];
    plan.steps[k].cubes.forEach(function (c) {
      var x = c.fx + (c.tx - c.fx) * u, y = c.fy + (c.ty - c.fy) * u;
      if (x > -1 && x < plan.C && y > -1 && y < plan.R) out.push({ x: x, y: y, stopped: stopped, id: c.id });
    });
    return out;
  }

  function stageBounds(plan) {
    var b = [];
    for (var k = 0; k <= plan.K; k++) b.push(k === plan.K ? plan.T : k * plan.D);
    return b;
  }

  return { stageBounds: stageBounds, LANES4_UI: LANES4_UI, planLanes4: planLanes4, sampleLanes4: sampleLanes4, LANES4_DEFAULTS: LANES4_DEFAULTS, mulberry32: mulberry32 };
});
