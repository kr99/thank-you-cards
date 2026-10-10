/*!
 * slide-lanes.js - renderer-agnostic 2D infinite sliding-lanes engine ("2D Rubik's on a torus").
 *
 * Sources / licenses
 *  - Engine, scheduler, RNG wiring: written from scratch for this project.
 *  - mulberry32 PRNG: public-domain algorithm (Tommy Ettinger), re-typed.
 *  - Easing formulas: standard Penner-family curves, re-typed from the formulas listed at
 *    https://easings.net (site code MIT, (c) Andrey Sitnik & Ivan Solovev) and
 *    https://github.com/ai/easings.net/blob/master/src/easings/easingsFunctions.ts (MIT).
 *    outBack uses Penner's constant 1.70158. linearBrake, inSlam, outElasticSmall are custom.
 *    (No code was copied verbatim; formulas only. Not network-verified in this sandbox.)
 *
 * Model (see /home/claude/refs/slide-lanes.md):
 *  - grid[r][c] = logical cell id (initially r*cols+c). Row/col lanes rotate on a torus.
 *  - A move = {axis:'row'|'col', index, dist(int != 0)}. Visual offset animates; the logical
 *    rotation COMMITS at the move's end time.
 *  - Row and col rotations do not commute; same-axis rotations always commute.
 *    => moves have a sequence number; non-commuting (perpendicular) moves must COMMIT in seq order.
 *  - Display of cell at grid (c,r): dx = rowOffset[r] + corrX, dy = colOffset[c] + corrY.
 *    Corrections keep positions continuous when a commit changes which column/row a cell sits in.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- easing table
  var C1 = 1.70158;
  var Easings = {
    linear: function (u) { return u; },
    inOutSine: function (u) { return -(Math.cos(Math.PI * u) - 1) / 2; },
    inOutCubic: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    inOutQuart: function (u) { return u < 0.5 ? 8 * u * u * u * u : 1 - Math.pow(-2 * u + 2, 4) / 2; },
    outCubic: function (u) { return 1 - Math.pow(1 - u, 3); },
    outQuint: function (u) { return 1 - Math.pow(1 - u, 5); },
    outExpo: function (u) { return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u); },
    outBack: function (u) { var v = u - 1; return 1 + (C1 + 1) * v * v * v + C1 * v * v; },
    outBackSoft: function (u) { var c = 0.9, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; },
    // small damped wobble: ~19% first overshoot, ~4% undershoot, settles. exact 1 at u=1.
    outElasticSmall: function (u) { return u >= 1 ? 1 : 1 - Math.exp(-5.5 * u) * Math.cos(3 * Math.PI * u); },
    // constant speed for 60%, then linear deceleration to a stop (normalised to end at 1)
    linearBrake: function (u) {
      var u0 = 0.6, L = 1 - u0, v = 1 / (u0 + L / 2);
      if (u <= u0) return v * u;
      var w = u - u0; return v * (u0 + w - w * w / (2 * L));
    },
    // accelerate the whole way, then stop dead ("slam")
    inSlam: function (u) { return u * u * u * u; }
  };
  // default pick weights (mix)
  var DEFAULT_CURVES = {
    inOutCubic: 3, outExpo: 3, outBack: 2.5, outElasticSmall: 1.2,
    linearBrake: 1.5, inSlam: 1.2, outQuint: 1, inOutSine: 0.8
  };

  // ---------------------------------------------------------------- rng
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var DEFAULTS = {
    maxConcurrent: 6,     // moves in flight (incl. waiting out their start delay)
    minDur: 0.55, maxDur: 1.5,   // seconds, before distance scaling
    delayMax: 0.35,       // random start delay 0..delayMax s
    maxDist: 3,           // max |cells| per move
    timeScale: 1,         // global speed multiplier
    speedRef: 7,          // cells/s that maps to speed = 1
    correctionTau: 0.16,  // s, decay of commit-continuity corrections
    glassAttack: 0.07, glassRelease: 0.28,
    commitGap: 0.03,      // s, perpendicular moves finish at least this much after predecessors
    curves: null          // {name: weight}; null = DEFAULT_CURVES
  };

  function mod(a, n) { return ((a % n) + n) % n; }

  function SlideLanes(opts) {
    opts = opts || {};
    this.cols = opts.cols | 0; this.rows = opts.rows | 0;
    if (this.cols < 2 || this.rows < 2) throw new Error('SlideLanes: need cols>=2 and rows>=2');
    this.seed = opts.seed == null ? 1 : opts.seed;
    this.rng = mulberry32(this.seed >>> 0);
    this.cfg = {};
    var k, cfg = opts.cfg || {};
    for (k in DEFAULTS) this.cfg[k] = DEFAULTS[k];
    for (k in cfg) this.cfg[k] = cfg[k];
    this.time = 0;
    this.handlers = {};
    var n = this.cols * this.rows, r, c;
    this.grid = new Int32Array(n); this.corrX = new Float32Array(n); this.corrY = new Float32Array(n);
    for (r = 0; r < this.rows; r++) for (c = 0; c < this.cols; c++) this.grid[r * this.cols + c] = r * this.cols + c;
    this.rowL = []; this.colL = [];
    for (r = 0; r < this.rows; r++) this.rowL.push({ off: 0, vel: 0, speed: 0, glass: 0, env: 0, move: null });
    for (c = 0; c < this.cols; c++) this.colL.push({ off: 0, vel: 0, speed: 0, glass: 0, env: 0, move: null });
    this.log = [];        // scramble moves that started or committed, in seq order (basis of solve)
    this.queue = [];      // planned, not yet started
    this.active = [];     // started (delaying or moving), not yet committed
    this.seq = 0;
    this.mode = 'idle';   // 'idle' | 'scrambling' | 'solving'
    this.commitCount = 0;
    if (opts.cfg && opts.cfg.onSolved) this.on('solved', opts.cfg.onSolved);
  }

  SlideLanes.Easings = Easings;
  SlideLanes.mulberry32 = mulberry32;
  SlideLanes.DEFAULTS = DEFAULTS;
  var P = SlideLanes.prototype;

  P.on = function (name, fn) {
    (this.handlers[name] = this.handlers[name] || []).push(fn);
    var self = this;
    return function () { var a = self.handlers[name]; a.splice(a.indexOf(fn), 1); };
  };
  P._emit = function (name, a, b) {
    var h = this.handlers[name]; if (!h) return;
    for (var i = 0; i < h.length; i++) h[i].call(this, a, b);
  };

  P._laneLen = function (axis) { return axis === 'row' ? this.cols : this.rows; };
  P._lane = function (axis, i) { return axis === 'row' ? this.rowL[i] : this.colL[i]; };

  P._randDist = function (axis) {
    var max = Math.min(this.cfg.maxDist, this._laneLen(axis) - 1), rng = this.rng;
    // bias to small: P(1)~45%
    var m = 1 + Math.floor(Math.pow(rng(), 1.6) * max);
    return rng() < 0.5 ? -m : m;
  };
  P._pickCurve = function () {
    var w = this.cfg.curves || DEFAULT_CURVES, tot = 0, k;
    for (k in w) tot += w[k];
    var x = this.rng() * tot;
    for (k in w) { x -= w[k]; if (x <= 0) return k; }
    return 'inOutCubic';
  };
  function newMove(self, axis, index, dist) {
    return { seq: self.seq++, axis: axis, index: index, dist: dist,
             t0: 0, dur: 1, curve: 'inOutCubic', ease: Easings.inOutCubic, end: 0, state: 'queued' };
  }

  // ------------------------------------------------------------ public: scramble / solve
  /** Queue n random moves. Returns false if currently solving. */
  P.scramble = function (n) {
    if (this.mode === 'solving') return false;
    n = n == null ? 20 : n;
    for (var i = 0; i < n; i++) {
      var axis = this.rng() < 0.5 ? 'row' : 'col';
      var index = Math.floor(this.rng() * (axis === 'row' ? this.rows : this.cols));
      this.queue.push(newMove(this, axis, index, this._randDist(axis)));
    }
    this.mode = 'scrambling';
    return true;
  };

  /** Cancel unstarted scramble moves, then queue inverse of everything that started, newest first. */
  P.solve = function () {
    if (this.mode === 'solving') return false;
    this.queue.length = 0;                      // unstarted moves never happened
    var inv = [];
    for (var i = this.log.length - 1; i >= 0; i--) {
      var m = this.log[i];
      inv.push(newMove(this, m.axis, m.index, -m.dist));
    }
    this.log = [];                              // consumed (these moves are now being undone)
    this._solveLeft = inv.length;
    this.queue = inv;
    this.mode = 'solving';
    if (!inv.length && !this.active.length) this._finishMode();
    return true;
  };

  P.setConfig = function (o) { for (var k in o) this.cfg[k] = o[k]; };

  /** Instantly reset to the solved state, dropping all motion. */
  P.snapSolved = function () {
    var n = this.cols * this.rows, i;
    for (i = 0; i < n; i++) { this.grid[i] = i; this.corrX[i] = 0; this.corrY[i] = 0; }
    var all = this.rowL.concat(this.colL);
    for (i = 0; i < all.length; i++) { var L = all[i]; L.off = L.vel = L.speed = L.glass = L.env = 0; L.move = null; }
    this.queue.length = 0; this.active.length = 0; this.log = []; this.mode = 'idle';
  };

  // ------------------------------------------------------------ scheduler
  P._perp = function (a, b) { return a.axis !== b.axis; };

  P._tryStart = function () {
    var cfg = this.cfg, q = this.queue, i, j;
    for (i = 0; i < q.length && this.active.length < cfg.maxConcurrent; i++) {
      var m = q[i];
      // blocked by an earlier unstarted perpendicular move? (same-axis moves commute, may be skipped)
      var blocked = false;
      for (j = 0; j < i; j++) if (q[j].axis !== m.axis) { blocked = true; break; }
      if (blocked) break;                       // everything after i is blocked by the same earlier move
      if (this._lane(m.axis, m.index).move) continue;   // lane busy: try later same-axis moves
      this._start(m);
      q.splice(i, 1); i--;
    }
  };

  P._start = function (m) {
    var cfg = this.cfg, rng = this.rng, a;
    m.curve = this._pickCurve(); m.ease = Easings[m.curve];
    var base = cfg.minDur + (cfg.maxDur - cfg.minDur) * rng();
    m.dur = base * (0.7 + 0.3 * Math.abs(m.dist));
    m.t0 = this.time + rng() * cfg.delayMax;
    m.end = m.t0 + m.dur;
    // commit-order rule: finish after every earlier-seq perpendicular active move
    for (a = 0; a < this.active.length; a++) {
      var o = this.active[a];
      if (o.axis !== m.axis && o.seq < m.seq && m.end < o.end + cfg.commitGap) m.end = o.end + cfg.commitGap;
    }
    m.dur = m.end - m.t0;
    m.state = 'active';
    this._lane(m.axis, m.index).move = m;
    this.active.push(m);
    if (this.mode === 'scrambling') this.log.push(m);     // log in seq order (starts follow seq for perpendiculars)
    this._emit('moveStart', m);
  };

  P._commit = function (m) {
    var L = this._lane(m.axis, m.index), cols = this.cols, rows = this.rows, g = this.grid,
        cx = this.corrX, cy = this.corrY, i, a, b, t;
    var d = m.dist, n = this._laneLen(m.axis);
    var tmp = new Array(n), tx = new Array(n), ty = new Array(n);
    if (m.axis === 'row') {
      var r = m.index;
      for (i = 0; i < cols; i++) {
        a = r * cols + i; b = mod(i + d, cols); t = b;
        tmp[t] = g[a]; tx[t] = cx[a];
        ty[t] = cy[a] + this.colL[i].off - this.colL[b].off;   // continuity of y vs column offsets
      }
      for (i = 0; i < cols; i++) { a = r * cols + i; g[a] = tmp[i]; cx[a] = tx[i]; cy[a] = ty[i]; }
    } else {
      var c = m.index;
      for (i = 0; i < rows; i++) {
        a = i * cols + c; b = mod(i + d, rows); t = b;
        tmp[t] = g[a]; ty[t] = cy[a];
        tx[t] = cx[a] + this.rowL[i].off - this.rowL[b].off;
      }
      for (i = 0; i < rows; i++) { a = i * cols + c; g[a] = tmp[i]; cy[a] = ty[i]; cx[a] = tx[i]; }
    }
    L.off = 0; L.move = null; m.state = 'done';
    this.active.splice(this.active.indexOf(m), 1);
    this.commitCount++;
    if (this.mode === 'solving') this._solveLeft--;
    this._emit('moveCommit', m);
  };

  P._finishMode = function () {
    var was = this.mode;
    this.mode = 'idle';
    if (was === 'solving') {
      this.log = [];
      this._emit('solved', this.verify());
    }
    this._emit('idle', was);
  };

  P.update = function (dt) {
    if (!(dt > 0)) return;
    dt *= this.cfg.timeScale;
    while (dt > 1e-9) { var s = Math.min(dt, 1 / 60); this._step(s); dt -= s; }
  };

  P._step = function (dt) {
    var cfg = this.cfg, i, a, m, L, h = 1e-3;
    this.time += dt;
    this._tryStart();
    // advance offsets
    for (a = 0; a < this.active.length; a++) {
      m = this.active[a]; L = this._lane(m.axis, m.index);
      var u = (this.time - m.t0) / m.dur;
      if (u <= 0) { L.off = 0; L.vel = 0; continue; }
      if (u > 1) u = 1;
      L.off = m.dist * m.ease(u);
      var u1 = Math.min(1, u + h), u0 = Math.max(0, u - h);
      L.vel = m.dist * (m.ease(u1) - m.ease(u0)) / ((u1 - u0) * m.dur);
      if (u >= 1) { L.off = m.dist; L.vel = 0; }
    }
    // commit finished moves in seq order, honoring perpendicular order (hold if predecessor unfinished)
    var done = this.active.filter(function (x) { return this.time >= x.end; }, this)
                          .sort(function (x, y) { return x.seq - y.seq; });
    for (i = 0; i < done.length; i++) {
      m = done[i];
      var ok = true;
      for (a = 0; a < this.active.length; a++) {
        var o = this.active[a];
        if (o !== m && o.axis !== m.axis && o.seq < m.seq) { ok = false; break; }
      }
      if (ok) this._commit(m);
    }
    // lane glass envelope + speed
    var lanes = this.rowL.concat(this.colL);
    for (i = 0; i < lanes.length; i++) {
      L = lanes[i];
      var moving = L.move && this.time >= L.move.t0;
      var sp = Math.min(1, Math.abs(L.vel) / cfg.speedRef);
      L.speed += (sp - L.speed) * (1 - Math.exp(-dt / 0.05));
      var tau = moving ? cfg.glassAttack : cfg.glassRelease;
      L.env += ((moving ? 1 : 0) - L.env) * (1 - Math.exp(-dt / tau));
      if (!moving && L.env < 0.002) L.env = 0;
      if (!moving && L.speed < 0.002) L.speed = 0;
      L.glass = L.env * (0.35 + 0.65 * L.speed);
    }
    // decay continuity corrections
    var f = Math.exp(-dt / cfg.correctionTau), n = this.grid.length, nz = false;
    for (i = 0; i < n; i++) {
      var x = this.corrX[i], y = this.corrY[i];
      if (x !== 0 || y !== 0) {
        x *= f; y *= f;
        if (Math.abs(x) < 0.002) x = 0;
        if (Math.abs(y) < 0.002) y = 0;
        this.corrX[i] = x; this.corrY[i] = y;
      }
    }
    // more work can start in the same frame a slot frees
    this._tryStart();
    if (this.mode !== 'idle' && !this.queue.length && !this.active.length) this._finishMode();
  };

  // ------------------------------------------------------------ state getters
  /**
   * Cell shown at grid slot (col,row). Render at (col+dx, row+dy), wrapped mod cols/rows
   * (draw a second copy when it straddles the edge).
   */
  P.getCellState = function (col, row, out) {
    var i = row * this.cols + col, R = this.rowL[row], C = this.colL[col];
    out = out || {};
    out.id = this.grid[i];
    out.dx = R.off + this.corrX[i];
    out.dy = C.off + this.corrY[i];
    out.rowSpeed = R.speed; out.colSpeed = C.speed;
    out.rowGlass = R.glass; out.colGlass = C.glass;
    out.laneSpeed = Math.max(R.speed, C.speed);
    var cm = Math.min(1, (Math.abs(this.corrX[i]) + Math.abs(this.corrY[i])) * 1.5);
    out.glass = Math.max(R.glass, C.glass, cm * 0.5);
    return out;
  };

  /** {rows:[{offset,vel,speed,glass,active}], cols:[...]} (fresh arrays unless `out` passed) */
  P.getLaneState = function (out) {
    out = out || { rows: [], cols: [] };
    var fill = function (src, dst) {
      for (var i = 0; i < src.length; i++) {
        var d = dst[i] || (dst[i] = {}), L = src[i];
        d.offset = L.off; d.vel = L.vel; d.speed = L.speed; d.glass = L.glass; d.active = !!L.move;
      }
    };
    fill(this.rowL, out.rows); fill(this.colL, out.cols);
    return out;
  };

  P.isIdle = function () {
    if (this.queue.length || this.active.length) return false;
    var n = this.grid.length, i, L;
    for (i = 0; i < n; i++) if (this.corrX[i] !== 0 || this.corrY[i] !== 0) return false;
    for (i = 0; i < this.rows; i++) { L = this.rowL[i]; if (L.env !== 0 || L.speed !== 0 || L.glass !== 0) return false; }
    for (i = 0; i < this.cols; i++) { L = this.colL[i]; if (L.env !== 0 || L.speed !== 0 || L.glass !== 0) return false; }
    return true;
  };
  P.isBusy = function () { return !this.isIdle(); };

  // ------------------------------------------------------------ verification
  /** Sequentially replay a move list on an identity grid; returns Int32Array. */
  P.replay = function (moves) {
    var cols = this.cols, rows = this.rows, g = new Int32Array(cols * rows), i, k, tmp;
    for (i = 0; i < g.length; i++) g[i] = i;
    for (k = 0; k < moves.length; k++) {
      var m = moves[k], d = m.dist;
      if (m.axis === 'row') {
        tmp = []; for (i = 0; i < cols; i++) tmp[mod(i + d, cols)] = g[m.index * cols + i];
        for (i = 0; i < cols; i++) g[m.index * cols + i] = tmp[i];
      } else {
        tmp = []; for (i = 0; i < rows; i++) tmp[mod(i + d, rows)] = g[i * cols + m.index];
        for (i = 0; i < rows; i++) g[i * cols + m.index] = tmp[i];
      }
    }
    return g;
  };

  /** Is the logical grid the identity (message readable)? Ignores in-flight visuals. */
  P.isSolvedGrid = function () {
    for (var i = 0; i < this.grid.length; i++) if (this.grid[i] !== i) return false;
    return true;
  };

  /**
   * Full check: grid is a permutation; if idle also exact identity, zero offsets/corrections,
   * no pending moves. If `expectMoves` given and idle, grid must equal sequential replay of it.
   */
  P.verify = function (expectMoves) {
    var n = this.grid.length, seen = new Uint8Array(n), i;
    for (i = 0; i < n; i++) {
      var v = this.grid[i];
      if (v < 0 || v >= n || seen[v]) return { ok: false, reason: 'grid is not a permutation' };
      seen[v] = 1;
    }
    if (expectMoves && this.isIdle()) {
      var g = this.replay(expectMoves);
      for (i = 0; i < n; i++) if (g[i] !== this.grid[i]) return { ok: false, reason: 'grid != sequential replay at ' + i };
    }
    if (this.mode === 'idle' && this.isIdle() && this.log.length === 0) {
      if (!this.isSolvedGrid()) return { ok: false, reason: 'idle with empty log but not solved' };
      for (i = 0; i < this.rowL.length; i++) if (this.rowL[i].off !== 0) return { ok: false, reason: 'row offset nonzero' };
      for (i = 0; i < this.colL.length; i++) if (this.colL[i].off !== 0) return { ok: false, reason: 'col offset nonzero' };
    }
    return { ok: true, solved: this.isSolvedGrid() };
  };

  /** Moves recorded for solve(), in seq order (scramble moves that started or committed). */
  P.getLog = function () { return this.log.slice(); };

  root.SlideLanes = SlideLanes;
  if (typeof module !== 'undefined' && module.exports) module.exports = SlideLanes;
})(typeof window !== 'undefined' ? window : globalThis);
