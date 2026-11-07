/*!
 * circuit-bg.js - procedural sci-fi / magitech circuitry backgrounds (2D canvas, no deps).
 * Variants: 'pcb' | 'veins' | 'die' | 'magitech' (octilinear root-like bundles that peel off lanes and taper, pad/via/rune tips, hidden back-layer links between ICs, multi-hop click waves).
 * Original code (written from scratch, MIT). Techniques are standard and inspired by public write-ups only;
 * no third-party code copied. Sources (concepts only):
 *   - shadcn.io "React Circuit Background" (idea: static edge graph + pulses along edges; no code)
 *   - oldrev/mini-router, Public Domain (idea: 45-degree chamfered routing; no code)
 *   - glow sprite + layered-stroke comet trail: common additive-blend canvas technique (written here)
 *   - Elder Futhark / Ogham shapes: hand-defined polylines (alphabets are public domain); kanji = Unicode text.
 *
 *   const bg = CircuitBG.create({width:1024,height:1024,variant:'magitech',seed:7,palette:'tron'});
 *   document.body.appendChild(bg.canvas);   // or use bg.canvas as a three.js CanvasTexture
 *   bg.update(timeSeconds);                 // per frame
 *   bg.hoverAt(u,v); bg.pulseAt(u,v); bg.getICs(); bg.setPalette('aurora'); bg.setVariant('die'); bg.setSeed(42);
 *   bg.setSpeed(m) (0..4, accumulated sim time); bg.setRunes(b); bg.setPulseVariance(b); bg.getSeed(); bg.getLinks(); bg.getSimTime();
 * DOM-free logic lives in CircuitBG.pure (see tests/circuit.test.js). The file can be require()d in node.
 */
(function (global) {
  'use strict';

  // ---------- utils ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  function nextPow2(n) { var p = 1; while (p < n) p <<= 1; return p; }
  function hash(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // ---------- palettes (data). All COOL: blue / cyan / ice-white / lavender. No yellow, orange, red, warm pink. ----------
  // keys: bg navy background, a electric-blue base, b cyan/aqua, c ice-white pulse core, hot soft cool highlight, v violet/lavender accent
  var PALETTES = {
    tron:    { bg: '#050b1f', a: '#2b6cff', b: '#19e3ff', c: '#eaf8ff', hot: '#7fd6ff', v: '#9b8cff' },
    deepsea: { bg: '#030e1c', a: '#0f86e0', b: '#12d9c6', c: '#e2fdff', hot: '#5fe0ff', v: '#6b7bff' },
    aurora:  { bg: '#070a22', a: '#4a7dff', b: '#2ee8e0', c: '#f0f4ff', hot: '#b4a6ff', v: '#c18bff' }
  };
  var DEFAULTS = { pcb: PALETTES.tron, veins: PALETTES.tron, die: PALETTES.tron, magitech: PALETTES.tron };

  function resolvePalette(p) {
    var base = PALETTES.tron, out = {}, k;
    if (typeof p === 'string') {
      if (!PALETTES[p]) throw new Error('CircuitBG: unknown palette ' + p);
      base = PALETTES[p]; p = null;
    } else if (p && p.base) {
      if (!PALETTES[p.base]) throw new Error('CircuitBG: unknown palette ' + p.base);
      base = PALETTES[p.base];
    }
    for (k in base) out[k] = base[k];
    if (p) for (k in p) if (k !== 'base' && p[k]) out[k] = p[k];
    return out;
  }
  function parseColor(s) { // '#rgb' | '#rrggbb' | 'rgb(a)(r,g,b[,a])' -> [r,g,b] or null
    if (typeof s !== 'string') return null;
    s = s.trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) return hex(s);
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function hsvOf(rgb) { // hue 0..360, sat 0..1 (HSV), val 0..1
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) {
      if (mx === r) h = 60 * (((g - b) / d + 6) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return { h: h, s: mx === 0 ? 0 : d / mx, v: mx };
  }
  var COOL_MIN = 170, COOL_MAX = 290, NEUTRAL_SAT = 0.18;
  function paletteIsCool(p) { // -> {ok, bad:[{key,color,hue}]}
    var bad = [], k;
    for (k in p) {
      var rgb = parseColor(p[k]);
      if (!rgb) { bad.push({ key: k, color: p[k], hue: null }); continue; }
      var o = hsvOf(rgb);
      if (o.s < NEUTRAL_SAT || o.v < 0.04) continue; // near-white / grey / black = neutral
      if (o.h < COOL_MIN || o.h > COOL_MAX) bad.push({ key: k, color: p[k], hue: Math.round(o.h) });
    }
    return { ok: bad.length === 0, bad: bad };
  }

  // ---------- glyph pools (vector strokes: flat [x0,y0,x1,y1,...] polylines in -1..1) ----------
  var RUNES = { // Elder Futhark (12 of 24)
    fehu:      [[-.4, -1, -.4, 1], [-.4, .1, .5, -.5], [-.4, -.5, .5, -1]],
    uruz:      [[-.5, 1, -.5, -1, .5, -.4, .5, 1]],
    thurisaz:  [[-.4, -1, -.4, 1], [-.4, .5, .5, 0, -.4, -.5]],
    ansuz:     [[-.4, -1, -.4, 1], [-.4, -1, .5, -.3], [-.4, -.1, .5, .6]],
    raido:     [[-.4, -1, -.4, 1], [-.4, -1, .5, -.4, -.4, .1, .5, 1]],
    kenaz:     [[.5, -.8, -.5, 0, .5, .8]],
    gebo:      [[-.6, -1, .6, 1], [.6, -1, -.6, 1]],
    wunjo:     [[-.4, -1, -.4, 1], [-.4, -1, .5, -.5, -.4, 0]],
    hagalaz:   [[-.5, -1, -.5, 1], [.5, -1, .5, 1], [-.5, -.4, .5, .4]],
    naudiz:    [[0, -1, 0, 1], [-.5, -.3, .5, .3]],
    isa:       [[0, -1, 0, 1]],
    sowilo:    [[.5, -1, -.4, -.35, .4, .35, -.5, 1]]
  };
  function oghamStrokes(n, side) { // vertical stem + n notches (side +1 right, -1 left, 0 = crossing diagonal)
    var st = [[0, -1, 0, 1]], i;
    if (side === 0) { st.push([-.55, -.35, .55, .35]); return st; }
    for (i = 0; i < n; i++) { var y = n === 1 ? 0 : -.6 + i * (1.2 / (n - 1)); st.push([0, y, side * .6, y]); }
    return st;
  }
  var OGHAM = { // 6 Ogham letters
    beith: oghamStrokes(1, 1), luis: oghamStrokes(2, 1), fearn: oghamStrokes(3, 1),
    huath: oghamStrokes(1, -1), duir: oghamStrokes(2, -1), muin: oghamStrokes(1, 0)
  };
  var KANJI = { '魔': 'magic', '力': 'power', '光': 'light', '星': 'star', '夢': 'dream', '命': 'life', '神': 'god', '龍': 'dragon' };
  var GLYPH_STROKES = {}, GLYPH_POOLS = { runes: Object.keys(RUNES), ogham: Object.keys(OGHAM), kanji: Object.keys(KANJI) };
  GLYPH_POOLS.runes.forEach(function (k) { GLYPH_STROKES['rune:' + k] = RUNES[k]; });
  GLYPH_POOLS.ogham.forEach(function (k) { GLYPH_STROKES['ogham:' + k] = OGHAM[k]; });
  function fallbackRuneKey(ch) { var i = GLYPH_POOLS.kanji.indexOf(ch); return 'rune:' + GLYPH_POOLS.runes[(i < 0 ? 0 : i) % GLYPH_POOLS.runes.length]; }
  function pickGlyph(rng) { // -> 'rune:fehu' | 'ogham:beith' | 'kanji:魔'
    var r = rng(), pool, kind;
    if (r < 0.4) { pool = GLYPH_POOLS.runes; kind = 'rune'; } else if (r < 0.7) { pool = GLYPH_POOLS.ogham; kind = 'ogham'; } else { pool = GLYPH_POOLS.kanji; kind = 'kanji'; }
    return kind + ':' + pool[Math.floor(rng() * pool.length) % pool.length];
  }

  // ---------- glow sprite (pre-rendered radial gradient; no per-frame blur filters) ----------
  var spriteCache = {};
  function sprite(rgb) {
    var k = rgb.map(Math.round).join(',');
    if (spriteCache[k]) return spriteCache[k];
    var c = mk(64, 64), g = c.getContext('2d');
    var r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(mix(rgb, [255, 255, 255], 0.75), 1));
    r.addColorStop(0.18, rgba(mix(rgb, [255, 255, 255], 0.3), 0.75));
    r.addColorStop(0.5, rgba(rgb, 0.22));
    r.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return (spriteCache[k] = c);
  }

  // ---------- pure polyline geometry ----------
  function polyCum(pts) {
    var cum = [0], L = 0, i;
    for (i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
    return cum;
  }
  function cumOf(tr) { return tr.cum || (tr.cum = polyCum(tr.pts)); }
  function traceLength(tr) { var c = cumOf(tr); return c[c.length - 1]; }
  function makePath(pts, col, w) {
    var cum = polyCum(pts);
    return { pts: pts, cum: cum, len: cum[cum.length - 1], col: col, w: w || 2 };
  }
  function findSeg(cum, s) { // largest i with cum[i] <= s
    var lo = 0, hi = cum.length - 1;
    while (lo < hi) { var m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  function pointAt(path, s, out) {
    var cum = cumOf(path), pts = path.pts;
    if (s < 0) s = 0;
    var i = findSeg(cum, s);
    if (i >= pts.length - 1) { out[0] = pts[pts.length - 1][0]; out[1] = pts[pts.length - 1][1]; return out; }
    var t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
    out[0] = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
    out[1] = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    return out;
  }
  var _p = [0, 0];
  function strokeRange(ctx, path, a, b) {
    var i = findSeg(path.cum, a), pts = path.pts;
    pointAt(path, a, _p);
    ctx.beginPath(); ctx.moveTo(_p[0], _p[1]);
    for (i = i + 1; i < pts.length && path.cum[i] < b; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    pointAt(path, b, _p); ctx.lineTo(_p[0], _p[1]);
    ctx.stroke();
  }
  var EASE_K = 0.55;
  function ease(x) { return x <= 0 ? 0 : x >= 1 ? 1 : (1 - EASE_K) * x + EASE_K * x * x * (3 - 2 * x); } // monotone, ease-in-out blend
  // Comet state at time t for a trace. Head travels the eased path; after arrival head stays on the end while the tail catches up.
  function pulsePosition(tr, t, speed, tailLen) {
    var L = traceLength(tr), tl = Math.max(tailLen, 1e-6), d = Math.max(0, t * speed), arrived = d >= L, head, tail, fade;
    if (arrived) { head = L; tail = Math.min(L, Math.max(0, L - tl) + (d - L)); fade = Math.max(0, 1 - (d - L) / tl); }
    else { head = L * ease(d / L); tail = Math.max(0, head - tl); fade = 1; }
    var p = pointAt(tr, head, [0, 0]);
    return { head: head, tail: tail, x: p[0], y: p[1], alive: d < L + tl, arrived: arrived, fade: fade };
  }
  // 0..1 brightness boost when s is near a real corner (turn > ~20 deg) or an endpoint (pad/via/IC pin)
  function cornerBoost(tr, s, radius) {
    var cum = cumOf(tr), pts = tr.pts, n = pts.length, i = findSeg(cum, s), best = 0, k;
    for (k = i; k <= i + 1 && k < n; k++) {
      var d = Math.abs(cum[k] - s);
      if (d >= radius) continue;
      var sharp = k === 0 || k === n - 1;
      if (!sharp) {
        var ax = pts[k][0] - pts[k - 1][0], ay = pts[k][1] - pts[k - 1][1], bx = pts[k + 1][0] - pts[k][0], by = pts[k + 1][1] - pts[k][1];
        var la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
        sharp = (ax * bx + ay * by) / (la * lb) < 0.94;
      }
      if (sharp) best = Math.max(best, 1 - d / radius);
    }
    return best;
  }
  function orient(tr, fromIc) { // trace oriented so that it starts at the IC (reversed copy when the IC is at its b end)
    if (tr.a.ic === fromIc) return tr;
    var pts = tr.pts.slice().reverse(), c = polyCum(pts);
    return { id: tr.id, pts: pts, cum: c, len: c[c.length - 1], col: tr.col, w: tr.w, a: tr.b, b: tr.a, next: [], rev: true };
  }
  function icTraceIds(traces, icId) {
    var out = [];
    for (var i = 0; i < traces.length; i++) if (traces[i].a.ic === icId || traces[i].b.ic === icId) out.push(traces[i].id);
    return out;
  }
  // ics: [{id,u,v,w,h}] normalized, u,v = centre. radius 0 -> strictly inside the rect (+pad); radius>0 -> nearest within radius.
  function hitTest(ics, u, v, radius) {
    var best = -1, bd = Infinity, lim = radius > 0 ? radius : 0.008, i;
    for (i = 0; i < ics.length; i++) {
      var c = ics[i], dx = Math.max(Math.abs(u - c.u) - c.w / 2, 0), dy = Math.max(Math.abs(v - c.v) - c.h / 2, 0), d = Math.hypot(dx, dy);
      if (d <= lim && d < bd) { bd = d; best = c.id; }
    }
    return best;
  }
  function throttleOk(map, id, now, gapMs) {
    if (map[id] !== undefined && now - map[id] < gapMs) return false;
    map[id] = now; return true;
  }

  // ---------- comet pulses (head glow sprite + 3 stroke layers of fading tail, additive) ----------
  function pulseStyle(rgb, sc, size) {
    return { c1: rgba(rgb, 0.16), c2: rgba(mix(rgb, [255, 255, 255], 0.35), 0.4), c3: rgba(mix(rgb, [255, 255, 255], 0.75), 0.92), rgb: rgb, spr: null, size: size * sc, sc: sc };
  }
  function makePulse(path, rng, rgb, sc, o) {
    o = o || {};
    var trail = (o.trail || 40) * sc;
    var cycle = path.len + trail + (o.gap || 120) * sc * (0.5 + rng());
    var p = pulseStyle(rgb, sc, o.size || 9);
    p.path = path; p.speed = (o.speed || 90) * sc * (0.6 + rng() * 0.9); p.trail = trail; p.cycle = cycle; p.phase = rng();
    return p;
  }
  function drawComet(ctx, tr, pp, p, wMul, zMul) {
    var a = pp.tail, b = pp.head, d = b - a, w = tr.w * wMul;
    ctx.globalAlpha = pp.fade;
    if (d > 0.5) {
      ctx.strokeStyle = p.c1; ctx.lineWidth = w * 2.2; strokeRange(ctx, tr, a, b);
      ctx.strokeStyle = p.c2; ctx.lineWidth = w * 1.1; strokeRange(ctx, tr, a + d * 0.45, b);
      ctx.strokeStyle = p.c3; ctx.lineWidth = w * 0.9; strokeRange(ctx, tr, a + d * 0.8, b);
    }
    var z = p.size * zMul * (1 + 0.9 * cornerBoost(tr, b, 10 * p.sc));
    ctx.drawImage(p.spr || (p.spr = sprite(p.rgb)), pp.x - z, pp.y - z, z * 2, z * 2);
    ctx.globalAlpha = 1;
  }
  function drawPulses(ctx, pulses, t, sc) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < pulses.length; i++) {
      var p = pulses[i], d = (t * p.speed + p.phase * p.cycle) % p.cycle, pp = pulsePosition(p.path, d, 1, p.trail);
      if (pp.alive) drawComet(ctx, p.path, pp, p, 1, 1);
    }
  }

  // ---------- glyphs (rune-like) ----------
  function glyph(g, kind, x, y, r) {
    g.beginPath();
    switch (kind % 7) {
      case 0: g.arc(x, y, r, 0, 6.2832); g.moveTo(x + r * 0.25, y); g.arc(x, y, r * 0.25, 0, 6.2832); break;
      case 1: g.moveTo(x, y - r); g.lineTo(x + r * 0.87, y + r * 0.5); g.lineTo(x - r * 0.87, y + r * 0.5); g.closePath();
              g.moveTo(x, y - r * 0.1); g.lineTo(x, y + r * 0.5); break;
      case 2: g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
              g.moveTo(x - r * 0.5, y); g.lineTo(x + r * 0.5, y); break;
      case 3: g.arc(x, y, r, 0, 6.2832); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); break;
      case 4: for (var i = 0; i < 6; i++) { var an = i * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(an) * r, y + Math.sin(an) * r); }
              g.closePath(); g.moveTo(x - r * 0.4, y); g.lineTo(x + r * 0.4, y); break;
      case 5: g.arc(x, y, r, 0, 6.2832); g.moveTo(x + r * 0.6, y); g.arc(x, y, r * 0.6, 0, 6.2832);
              for (var k = 0; k < 8; k++) { var q = k * Math.PI / 4; g.moveTo(x + Math.cos(q) * r, y + Math.sin(q) * r); g.lineTo(x + Math.cos(q) * r * 1.35, y + Math.sin(q) * r * 1.35); } break;
      default: g.moveTo(x, y + r); g.lineTo(x, y - r); g.moveTo(x, y - r * 0.1); g.lineTo(x - r * 0.8, y - r * 0.9);
               g.moveTo(x, y - r * 0.1); g.lineTo(x + r * 0.8, y - r * 0.9); g.moveTo(x - r * 0.6, y + r * 0.4); g.lineTo(x + r * 0.6, y + r * 0.4);
    }
    g.stroke();
  }

  // =====================================================================
  // PCB
  // =====================================================================
  var DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];

  function buildPCB(S) {
    var W = S.W, H = S.H, rng = S.rng, sc = S.sc, dens = S.density;
    var g = Math.max(6, Math.round(8 * sc)); // routing pitch
    var cw = Math.ceil(W / g), ch = Math.ceil(H / g);
    var occ = new Uint8Array(cw * ch);
    function inb(cx, cy) { return cx >= 1 && cy >= 1 && cx < cw - 1 && cy < ch - 1; }
    function free(cx, cy) { return inb(cx, cy) && !occ[cy * cw + cx]; }
    function mark(cx, cy, v) { if (cx >= 0 && cy >= 0 && cx < cw && cy < ch) occ[cy * cw + cx] = v; }
    function rr(a, b) { return a + Math.floor(rng() * (b - a + 1)); }

    var chips = [], paths = [], pads = [], vias = [], smd = [], blink = [];
    var nChips = Math.round(7 * dens);
    for (var i = 0, tries = 0; i < nChips && tries < 200; tries++) {
      var wc = rr(7, 14), hc = rr(6, 12), cx = rr(6, cw - wc - 6), cy = rr(6, ch - hc - 6), ok = true, x, y;
      for (y = cy - 3; y < cy + hc + 3 && ok; y++) for (x = cx - 3; x < cx + wc + 3; x++) if (!free(x, y)) { ok = false; break; }
      if (!ok) continue;
      for (y = cy; y < cy + hc; y++) for (x = cx; x < cx + wc; x++) mark(x, y, 1);
      chips.push({ id: chips.length, cx: cx, cy: cy, w: wc, h: hc, ph: rng(), per: 2 + rng() * 4 });
      i++;
    }

    // walk with n parallel lanes (translation copies). returns base polyline in cell coords
    function walk(sx, sy, dir, ox, oy, n, maxCells) {
      var pts = [[sx, sy]], marked = [], cx = sx, cy = sy, total = 0, l;
      function laneFree(px, py) { for (l = 0; l < n; l++) if (!free(px + ox * l, py + oy * l)) return false; return true; }
      for (var it = 0; it < 14 && total < maxCells; it++) {
        var run = rr(3, 11), adv = 0;
        for (; adv < run; adv++) {
          var nx = cx + DX[dir], ny = cy + DY[dir];
          if (!laneFree(nx, ny)) break;
          // diagonal corner-cut guard: avoid squeezing between occupied cells
          cx = nx; cy = ny;
          for (l = 0; l < n; l++) { mark(cx + ox * l, cy + oy * l, 1); marked.push((cy + oy * l) * cw + cx + ox * l); }
        }
        total += adv;
        if (adv > 0) pts.push([cx, cy]);
        if (adv < run && adv === 0 && it > 0) { /* blocked: try turning */ }
        var turn = rng() < 0.5 ? 1 : 7;
        if (rng() < 0.08) turn = rng() < 0.5 ? 2 : 6;
        var nd = (dir + turn) & 7, tx = cx + DX[nd], ty = cy + DY[nd];
        if (!laneFree(tx, ty)) { nd = (dir + (turn === 1 ? 7 : 1)) & 7; tx = cx + DX[nd]; ty = cy + DY[nd]; if (!laneFree(tx, ty)) break; }
        dir = nd;
      }
      if (total < 4) { for (var m = 0; m < marked.length; m++) occ[marked[m]] = 0; return null; }
      return pts;
    }
    function addLanes(base, ox, oy, n, col, w, icId) {
      for (var l = 0; l < n; l++) {
        var pts = base.map(function (p) { return [(p[0] + ox * l + 0.5) * g, (p[1] + oy * l + 0.5) * g]; });
        var tp = makePath(pts, col, w), isIc = icId >= 0;
        tp.id = paths.length; tp.next = [];
        paths.push(tp);
        var a = pts[0], b = pts[pts.length - 1];
        tp.a = { type: isIc ? 'ic' : 'pad', ic: isIc ? icId : -1, x: a[0], y: a[1] };
        pads.push({ x: a[0], y: a[1], col: col, r: 3.3 * sc });
        if (rng() < 0.5) { pads.push({ x: b[0], y: b[1], col: col, r: 3.3 * sc }); tp.b = { type: 'pad', ic: -1, x: b[0], y: b[1] }; }
        else { vias.push({ x: b[0], y: b[1], col: col }); tp.b = { type: 'via', ic: -1, x: b[0], y: b[1] }; }
      }
    }

    // buses from chip sides
    for (i = 0; i < chips.length; i++) {
      var c = chips[i], nb = rr(2, 3);
      for (var bi = 0; bi < nb; bi++) {
        var side = rr(0, 3), n = rr(3, 9), col = rng() < 0.7 ? 0 : 1, sx, sy, dir, ox, oy, len;
        if (side === 0) { len = c.w; sx = c.cx + rr(0, Math.max(0, len - n)); sy = c.cy - 1; dir = 6; ox = 1; oy = 0; }
        else if (side === 1) { len = c.w; sx = c.cx + rr(0, Math.max(0, len - n)); sy = c.cy + c.h; dir = 2; ox = 1; oy = 0; }
        else if (side === 2) { len = c.h; sx = c.cx - 1; sy = c.cy + rr(0, Math.max(0, c.h - n)); dir = 4; ox = 0; oy = 1; }
        else { len = c.h; sx = c.cx + c.w; sy = c.cy + rr(0, Math.max(0, c.h - n)); dir = 0; ox = 0; oy = 1; }
        n = Math.min(n, len);
        var base = walk(sx, sy, dir, ox, oy, n, rr(30, 90));
        if (base) addLanes(base, ox, oy, n, col, 1.7 * sc, c.id);
      }
    }
    // singles + small buses scattered
    var nSingles = Math.round(120 * dens);
    for (i = 0; i < nSingles; i++) {
      var n2 = rng() < 0.2 ? rr(2, 4) : 1, d0 = rr(0, 7);
      var ox2 = DX[(d0 + 2) & 7] , oy2 = DY[(d0 + 2) & 7];
      if (d0 & 1) { ox2 = DX[(d0 + 1) & 7]; oy2 = DY[(d0 + 1) & 7]; if (ox2 && oy2) { ox2 = 0; } }
      var sx2 = rr(2, cw - 3), sy2 = rr(2, ch - 3);
      if (!free(sx2, sy2)) continue;
      mark(sx2, sy2, 1);
      var b2 = walk(sx2, sy2, d0, ox2, oy2, n2, rr(14, 70));
      if (b2) addLanes(b2, ox2, oy2, n2, rng() < 0.28 ? 1 : 0, (n2 > 1 ? 1.7 : 2.3) * sc);
      else mark(sx2, sy2, 0);
    }
    // SMD parts
    var nSmd = Math.round(60 * dens);
    for (i = 0; i < nSmd; i++) {
      var hor = rng() < 0.5, px = rr(3, cw - 6), py = rr(3, ch - 6), w2 = hor ? 3 : 1, h2 = hor ? 1 : 3, okk = true, qx, qy;
      for (qy = py; qy < py + h2 + 1 && okk; qy++) for (qx = px; qx < px + w2 + 1; qx++) if (!free(qx, qy)) { okk = false; break; }
      if (!okk) continue;
      for (qy = py; qy < py + h2 + 1; qy++) for (qx = px; qx < px + w2 + 1; qx++) mark(qx, qy, 1);
      smd.push({ x: px * g, y: py * g, w: (hor ? 3 : 1.4) * g, h: (hor ? 1.4 : 3) * g, hor: hor });
    }
    // blinkers: some pads blink like LEDs
    for (i = 0; i < pads.length; i++) if (rng() < 0.12) blink.push({ pad: pads[i], per: 0.8 + rng() * 3, ph: rng() });

    // pulses
    var pulses = [], cols = [mix(hex(S.pal.a), [255, 255, 255], 0.35), mix(hex(S.pal.b), [255, 255, 255], 0.3)];
    for (i = 0; i < paths.length; i++) {
      if (rng() < 0.55) pulses.push(makePulse(paths[i], rng, cols[paths[i].col], sc, { speed: 110, trail: 46, gap: 160, size: 9 }));
      if (rng() < 0.15) pulses.push(makePulse(paths[i], rng, hex(S.pal.c), sc, { speed: 200, trail: 24, gap: 400, size: 7 }));
    }
    return {
      g: g, chips: chips, paths: paths, pads: pads, vias: vias, smd: smd, blink: blink, pulses: pulses, traces: paths,
      ics: chips.map(function (c) { return { id: c.id, x: c.cx * g, y: c.cy * g, w: c.w * g, h: c.h * g, pin: g }; }),
      netPads: pads.map(function (p) { return { x: p.x, y: p.y, kind: 'pad' }; }).concat(vias.map(function (p) { return { x: p.x, y: p.y, kind: 'via' }; }))
    };
  }

  function drawPCBStatic(S, M, ctx) {
    var sc = S.sc, g = M.g, pal = S.pal, A = hex(pal.a), B = hex(pal.b), cols = [A, B], i, k;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, S.W, S.H);
    // faint substrate dot grid
    ctx.fillStyle = rgba(A, 0.08);
    for (var y = g; y < S.H; y += g * 4) for (var x = g; x < S.W; x += g * 4) ctx.fillRect(x, y, 1, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var pass = 0; pass < 3; pass++) {
      for (i = 0; i < M.paths.length; i++) {
        var p = M.paths[i], c = cols[p.col];
        if (pass === 0) { ctx.strokeStyle = rgba(c, 0.10); ctx.lineWidth = p.w * 3.4; }
        else if (pass === 1) { ctx.strokeStyle = rgba(mix(c, [0, 0, 0], 0.35), 0.95); ctx.lineWidth = p.w; }
        else { ctx.strokeStyle = rgba(mix(c, [255, 255, 255], 0.45), 0.5); ctx.lineWidth = Math.max(0.6, p.w * 0.32); }
        ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
        for (k = 1; k < p.pts.length; k++) ctx.lineTo(p.pts[k][0], p.pts[k][1]);
        ctx.stroke();
      }
    }
    // pads
    for (i = 0; i < M.pads.length; i++) {
      var d = M.pads[i], c2 = cols[d.col];
      ctx.fillStyle = rgba(mix(c2, [0, 0, 0], 0.2), 1); ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = rgba(mix(c2, [255, 255, 255], 0.5), 0.9); ctx.lineWidth = 0.9 * sc; ctx.stroke();
      ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.38, 0, 6.2832); ctx.fill();
    }
    // vias
    for (i = 0; i < M.vias.length; i++) {
      var v = M.vias[i], c3 = cols[v.col];
      ctx.strokeStyle = rgba(mix(c3, [255, 255, 255], 0.35), 0.9); ctx.lineWidth = 1.4 * sc;
      ctx.beginPath(); ctx.arc(v.x, v.y, 3.6 * sc, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = rgba(c3, 0.55); ctx.beginPath(); ctx.arc(v.x, v.y, 1.5 * sc, 0, 6.2832); ctx.fill();
    }
    // SMD
    for (i = 0; i < M.smd.length; i++) {
      var s = M.smd[i];
      ctx.fillStyle = 'rgba(8,14,16,1)'; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = rgba(B, 0.85);
      if (s.hor) { ctx.fillRect(s.x, s.y, s.w * 0.28, s.h); ctx.fillRect(s.x + s.w * 0.72, s.y, s.w * 0.28, s.h); }
      else { ctx.fillRect(s.x, s.y, s.w, s.h * 0.28); ctx.fillRect(s.x, s.y + s.h * 0.72, s.w, s.h * 0.28); }
      ctx.strokeStyle = rgba(B, 0.4); ctx.lineWidth = 0.8; ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
    }
    // chips
    for (i = 0; i < M.chips.length; i++) {
      var ch = M.chips[i], x0 = ch.cx * g, y0 = ch.cy * g, w = ch.w * g, h = ch.h * g;
      ctx.fillStyle = rgba(mix(A, [0, 0, 0], 0.88), 1); ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = rgba(A, 0.85); ctx.lineWidth = 1.4 * sc; ctx.strokeRect(x0, y0, w, h);
      ctx.strokeStyle = rgba(A, 0.35); ctx.lineWidth = 0.8; ctx.strokeRect(x0 + g * 1.2, y0 + g * 1.2, w - g * 2.4, h - g * 2.4);
      // die inner fine grid
      ctx.beginPath();
      for (var gx = x0 + g * 2; gx < x0 + w - g * 2; gx += g * 0.5) { ctx.moveTo(gx, y0 + g * 2); ctx.lineTo(gx, y0 + h - g * 2); }
      for (var gy = y0 + g * 2; gy < y0 + h - g * 2; gy += g) { ctx.moveTo(x0 + g * 2, gy); ctx.lineTo(x0 + w - g * 2, gy); }
      ctx.strokeStyle = rgba(A, 0.2); ctx.lineWidth = 0.6; ctx.stroke();
      // pins
      ctx.fillStyle = rgba(mix(A, [255, 255, 255], 0.4), 0.85);
      var pw = g * 0.55, pl = g * 0.9;
      for (k = 0; k < ch.w; k++) { ctx.fillRect(x0 + k * g + (g - pw) / 2, y0 - pl * 0.6, pw, pl * 0.6); ctx.fillRect(x0 + k * g + (g - pw) / 2, y0 + h, pw, pl * 0.6); }
      for (k = 0; k < ch.h; k++) { ctx.fillRect(x0 - pl * 0.6, y0 + k * g + (g - pw) / 2, pl * 0.6, pw); ctx.fillRect(x0 + w, y0 + k * g + (g - pw) / 2, pl * 0.6, pw); }
      ctx.fillStyle = rgba(B, 0.9); ctx.beginPath(); ctx.arc(x0 + g * 0.8, y0 + g * 0.8, g * 0.3, 0, 6.2832); ctx.fill();
    }
  }

  function drawPCBAnim(S, M, ctx, t) {
    var sc = S.sc, i, g = M.g, A = hex(S.pal.a);
    drawPulses(ctx, M.pulses, t, sc);
    // chip activity glow
    ctx.lineWidth = 1.6 * sc;
    for (i = 0; i < M.chips.length; i++) {
      var c = M.chips[i], u = Math.pow(Math.max(0, Math.sin(6.2832 * (t / c.per + c.ph))), 4);
      if (u < 0.02) continue;
      ctx.strokeStyle = rgba(S.cA, u * 0.7); ctx.strokeRect(c.cx * g, c.cy * g, c.w * g, c.h * g);
      ctx.fillStyle = rgba(S.cA, u * 0.12); ctx.fillRect(c.cx * g, c.cy * g, c.w * g, c.h * g);
    }
    for (i = 0; i < M.blink.length; i++) {
      var b = M.blink[i], on = ((t / b.per + b.ph) % 1) < 0.35;
      if (on) { var z = b.pad.r * 3.2; ctx.drawImage(S.sprB, b.pad.x - z, b.pad.y - z, z * 2, z * 2); }
    }
  }

  // =====================================================================
  // VEINS
  // =====================================================================
  function buildVeins(S) {
    var W = S.W, H = S.H, rng = S.rng, sc = S.sc, dens = S.density, step = 5 * sc;
    var cell = 7 * sc, cw = Math.ceil(W / cell), chh = Math.ceil(H / cell), occ = new Uint8Array(cw * chh);
    var branches = [], nodes = [], ics = [];
    function crowd(x, y) { var cx = (x / cell) | 0, cy = (y / cell) | 0; if (cx < 0 || cy < 0 || cx >= cw || cy >= chh) return 9; return occ[cy * cw + cx]; }
    function put(x, y) { var cx = (x / cell) | 0, cy = (y / cell) | 0; if (cx >= 0 && cy >= 0 && cx < cw && cy < chh && occ[cy * cw + cx] < 255) occ[cy * cw + cx]++; }
    function grow(x, y, ang, w, depth, life, col, icId) {
      var pts = [[x, y]], curl = (rng() - 0.5) * 0.06, k;
      for (k = 0; k < life; k++) {
        ang += (rng() - 0.5) * 0.4 + curl;
        x += Math.cos(ang) * step; y += Math.sin(ang) * step;
        if (crowd(x, y) > 2) break;
        put(x, y); pts.push([x, y]);
        if (depth < 4 && k > 6 && rng() < 0.03 * (1.2 - depth * 0.15)) {
          var side = rng() < 0.5 ? -1 : 1;
          nodes.push({ x: x, y: y, kind: (rng() * 7) | 0, r: (3 + rng() * 2) * sc, col: col, branch: true });
          grow(x, y, ang + side * (0.5 + rng() * 0.7), w * 0.72, depth + 1, life * 0.62, rng() < 0.2 ? (col + 1) % 3 : col, -1);
        }
      }
      if (pts.length > 4) {
        var tp = makePath(pts, col, w), te = pts[pts.length - 1];
        tp.id = branches.length; tp.next = [];
        tp.a = { type: icId >= 0 ? 'ic' : 'pad', ic: icId >= 0 ? icId : -1, x: pts[0][0], y: pts[0][1] };
        tp.b = { type: 'pad', ic: -1, x: te[0], y: te[1] };
        branches.push({ path: tp, w: w, col: col });
        var e = pts[pts.length - 1];
        if (e[0] > 8 && e[1] > 8 && e[0] < W - 8 && e[1] < H - 8) nodes.push({ x: e[0], y: e[1], kind: (rng() * 7) | 0, r: (4 + rng() * 4) * sc, col: col, branch: false });
      }
    }
    var seeds = Math.max(2, Math.round(7 * dens));
    for (var s = 0; s < seeds; s++) {
      var sx = W * (0.08 + rng() * 0.84), sy = H * (0.08 + rng() * 0.84), arms = 4 + ((rng() * 3) | 0), a0 = rng() * 6.28;
      nodes.push({ x: sx, y: sy, kind: (rng() * 7) | 0, r: 9 * sc, col: (rng() * 3) | 0, branch: false, big: true });
      ics.push({ id: s, x: sx - 20 * sc, y: sy - 20 * sc, w: 40 * sc, h: 40 * sc, pin: 0 });
      for (var a = 0; a < arms; a++) grow(sx, sy, a0 + a * 6.2832 / arms + (rng() - 0.5) * 0.4, (2.2 + rng()) * sc, 0, 60 + rng() * 70, (rng() * 3) | 0, s);
    }
    var pal = [hex(S.pal.a), hex(S.pal.b), hex(S.pal.v)], pulses = [], i;
    for (i = 0; i < branches.length; i++) {
      var br = branches[i];
      if (rng() < 0.5) pulses.push(makePulse(br.path, rng, pal[br.col], sc, { speed: 70, trail: 55, gap: 150, size: 10 }));
    }
    for (i = 0; i < nodes.length; i++) { nodes[i].per = (nodes[i].branch ? 6 : 3) + rng() * 6; nodes[i].ph = rng(); }
    var animNodes = nodes.filter(function (n) { return n.big || (!n.branch && rng() < 0.45) || rng() < 0.08; });
    // dust speckle
    var dust = [], nd = Math.round(900 * dens);
    for (i = 0; i < nd; i++) dust.push([rng() * W, rng() * H, rng() * 1.3 + 0.4, (rng() * 3) | 0]);
    return { branches: branches, nodes: nodes, animNodes: animNodes, pulses: pulses, dust: dust, pal: pal, ics: ics, traces: branches.map(function (b) { return b.path; }) };
  }

  function drawVeinsStatic(S, M, ctx) {
    var sc = S.sc, i, k, pal = M.pal;
    ctx.fillStyle = S.pal.bg; ctx.fillRect(0, 0, S.W, S.H);
    var rg = ctx.createRadialGradient(S.W / 2, S.H / 2, 0, S.W / 2, S.H / 2, S.W * 0.75);
    rg.addColorStop(0, rgba(pal[0], 0.10)); rg.addColorStop(1, rgba(pal[0], 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, S.W, S.H);
    for (i = 0; i < M.dust.length; i++) { var d = M.dust[i]; ctx.fillStyle = rgba(pal[d[3]], 0.35); ctx.fillRect(d[0], d[1], d[2], d[2]); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var pass = 0; pass < 3; pass++) {
      for (i = 0; i < M.branches.length; i++) {
        var b = M.branches[i], c = pal[b.col], pts = b.path.pts;
        if (pass === 0) { ctx.strokeStyle = rgba(c, 0.10); ctx.lineWidth = b.w * 5; }
        else if (pass === 1) { ctx.strokeStyle = rgba(c, 0.55); ctx.lineWidth = b.w * 1.8; }
        else { ctx.strokeStyle = rgba(mix(c, [255, 255, 255], 0.6), 0.85); ctx.lineWidth = Math.max(0.7, b.w * 0.5); }
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
      }
    }
    // tick marks along thick veins
    ctx.lineWidth = 0.8 * sc;
    for (i = 0; i < M.branches.length; i++) {
      var br = M.branches[i], p = br.path.pts; ctx.strokeStyle = rgba(pal[br.col], 0.5); ctx.beginPath();
      for (k = 4; k < p.length - 1; k += 6) {
        var dx = p[k + 1][0] - p[k - 1][0], dy = p[k + 1][1] - p[k - 1][1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, tl = br.w * 2.6;
        ctx.moveTo(p[k][0] + nx * br.w, p[k][1] + ny * br.w); ctx.lineTo(p[k][0] + nx * tl, p[k][1] + ny * tl);
      }
      ctx.stroke();
    }
    // rune nodes
    for (i = 0; i < M.nodes.length; i++) {
      var n = M.nodes[i], cc = pal[n.col];
      ctx.fillStyle = rgba(S.bgRGB, 0.9); ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 1.5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = rgba(cc, 0.9); ctx.lineWidth = 1.2 * sc;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 1.5, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = rgba(mix(cc, [255, 255, 255], 0.5), 1); ctx.lineWidth = 1.1 * sc;
      if (!n.big) glyph(ctx, n.kind, n.x, n.y, n.r);
      if (n.big) { ctx.strokeStyle = rgba(cc, 0.5); ctx.lineWidth = 0.8 * sc; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.6, 0, 6.2832); ctx.stroke();
        for (k = 0; k < 24; k++) { var an = k * 6.2832 / 24; ctx.moveTo(n.x + Math.cos(an) * n.r * 2.6, n.y + Math.sin(an) * n.r * 2.6); ctx.lineTo(n.x + Math.cos(an) * n.r * 3, n.y + Math.sin(an) * n.r * 3); }
        ctx.stroke(); }
    }
  }

  function drawVeinsAnim(S, M, ctx, t) {
    var sc = S.sc, i;
    drawPulses(ctx, M.pulses, t, sc);
    ctx.lineWidth = 1.4 * sc;
    for (i = 0; i < M.animNodes.length; i++) {
      var n = M.animNodes[i], u = (t / n.per + n.ph) % 1, col = M.pal[n.col], spr = S.sprites[n.col];
      var flash = Math.exp(-u * 9);
      if (u > 0.4 && flash < 0.03) continue;
      var zf = n.r * (3 + flash * 4);
      ctx.globalAlpha = 0.15 + flash * 0.85;
      ctx.drawImage(spr, n.x - zf, n.y - zf, zf * 2, zf * 2);
      if (u < 0.4) {
        var e = u / 0.4, R = n.r * 2 + (n.big ? 150 : 80) * sc * (1 - (1 - e) * (1 - e)), al = (1 - e) * (1 - e);
        if (n.big) { var R2 = Math.min(R, 60 * sc); ctx.globalAlpha = al * 0.25; ctx.drawImage(spr, n.x - R2, n.y - R2, R2 * 2, R2 * 2); }
        ctx.globalAlpha = al * 0.8; ctx.strokeStyle = rgba(col, 1);
        ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, 6.2832); ctx.stroke();
        if (R > 30 * sc) { ctx.globalAlpha = al * 0.4; ctx.beginPath(); ctx.arc(n.x, n.y, R * 0.7, 0, 6.2832); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  // =====================================================================
  // DIE
  // =====================================================================
  function buildDie(S) {
    var W = S.W, H = S.H, rng = S.rng, sc = S.sc, dens = S.density;
    var margin = 46 * sc, gap = 12 * sc, minB = 70 * sc / Math.sqrt(dens);
    var blocks = [], chans = [];
    function split(x, y, w, h, depth) {
      var canH = w > minB * 2 + gap, canV = h > minB * 2 + gap;
      if ((!canH && !canV) || (depth > 1 && rng() < 0.12)) { blocks.push({ x: x, y: y, w: w, h: h }); return; }
      var horiz = canH && canV ? w > h * (0.8 + rng() * 0.4) : canH, r = 0.35 + rng() * 0.3;
      if (horiz) {
        var w1 = (w - gap) * r;
        chans.push({ x: x + w1, y: y, w: gap, h: h, v: true });
        split(x, y, w1, h, depth + 1); split(x + w1 + gap, y, w - w1 - gap, h, depth + 1);
      } else {
        var h1 = (h - gap) * r;
        chans.push({ x: x, y: y + h1, w: w, h: gap, v: false });
        split(x, y, w, h1, depth + 1); split(x, y + h1 + gap, w, h - h1 - gap, depth + 1);
      }
    }
    split(margin, margin, W - margin * 2, H - margin * 2, 0);
    var types = ['sram', 'logic', 'logic', 'data', 'analog'], i, k;
    for (i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      b.type = types[(rng() * types.length) | 0]; b.col = (rng() * 3) | 0;
      b.per = 3 + rng() * 7; b.ph = rng(); b.per2 = 1 + rng() * 2; b.sweep = 0.1 + rng() * 0.25;
      b.hot = []; var nh = rng() < 0.6 ? 1 + ((rng() * 2) | 0) : 0;
      for (k = 0; k < nh; k++) b.hot.push({ x: b.x + b.w * (0.15 + rng() * 0.7), y: b.y + b.h * (0.15 + rng() * 0.7), r: (14 + rng() * 22) * sc, per: 1.5 + rng() * 3, ph: rng() });
    }
    var ics = blocks.map(function (b, bi) { b.id = bi; return { id: bi, x: b.x, y: b.y, w: b.w, h: b.h, pin: gap }; }), dpads = [];
    function endOf(pt) {
      var id = -1, q;
      for (q = 0; q < ics.length; q++) { var c = ics[q]; if (pt[0] >= c.x - gap && pt[0] <= c.x + c.w + gap && pt[1] >= c.y - gap && pt[1] <= c.y + c.h + gap) { id = q; break; } }
      dpads.push({ x: pt[0], y: pt[1], kind: 'via' });
      return { type: 'pad', ic: id, x: pt[0], y: pt[1] };
    }
    // bus pulses in channels
    var paths = [], pulses = [], lanes = 4, pal = [hex(S.pal.a), hex(S.pal.b), hex(S.pal.hot)];
    for (i = 0; i < chans.length; i++) {
      var c = chans[i];
      for (k = 0; k < lanes; k++) {
        var off = (k + 1) / (lanes + 1), p;
        if (c.v) p = [[c.x + c.w * off, c.y - gap * 0.5], [c.x + c.w * off, c.y + c.h + gap * 0.5]];
        else p = [[c.x - gap * 0.5, c.y + c.h * off], [c.x + c.w + gap * 0.5, c.y + c.h * off]];
        var path = makePath(p, 0, 1.2 * sc); path.id = paths.length; path.next = []; path.a = endOf(p[0]); path.b = endOf(p[1]); paths.push(path);
        if (rng() < 0.75) pulses.push(makePulse(path, rng, pal[rng() < 0.15 ? 2 : (rng() < 0.5 ? 0 : 1)], sc, { speed: 140, trail: 30, gap: 80, size: 6 }));
      }
    }
    return { blocks: blocks, chans: chans, pulses: pulses, gap: gap, margin: margin, lanes: lanes, ics: ics, traces: paths, netPads: dpads };
  }

  function drawDieStatic(S, M, ctx) {
    var sc = S.sc, rng = S.rng2, pal = [hex(S.pal.a), hex(S.pal.b), hex(S.pal.v)], A = pal[0], i, k, j;
    ctx.fillStyle = S.pal.bg; ctx.fillRect(0, 0, S.W, S.H);
    // die outline + seal ring
    ctx.strokeStyle = rgba(A, 0.8); ctx.lineWidth = 2 * sc; ctx.strokeRect(M.margin * 0.45, M.margin * 0.45, S.W - M.margin * 0.9, S.H - M.margin * 0.9);
    ctx.strokeStyle = rgba(A, 0.35); ctx.lineWidth = 1; ctx.strokeRect(M.margin * 0.62, M.margin * 0.62, S.W - M.margin * 1.24, S.H - M.margin * 1.24);
    // IO pads
    var pp = 14 * sc, ps = 7 * sc;
    ctx.fillStyle = rgba(pal[1], 0.7);
    for (k = M.margin; k < S.W - M.margin; k += pp) { ctx.fillRect(k, M.margin * 0.1, ps, ps * 1.3); ctx.fillRect(k, S.H - M.margin * 0.1 - ps * 1.3, ps, ps * 1.3); }
    for (k = M.margin; k < S.H - M.margin; k += pp) { ctx.fillRect(M.margin * 0.1, k, ps * 1.3, ps); ctx.fillRect(S.W - M.margin * 0.1 - ps * 1.3, k, ps * 1.3, ps); }
    // channels: parallel bus lines
    ctx.lineWidth = 1 * sc;
    for (i = 0; i < M.chans.length; i++) {
      var c = M.chans[i];
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = rgba(pal[1], 0.55); ctx.beginPath();
      for (k = 0; k < M.lanes; k++) {
        var off = (k + 1) / (M.lanes + 1);
        if (c.v) { ctx.moveTo(c.x + c.w * off, c.y - M.gap * 0.5); ctx.lineTo(c.x + c.w * off, c.y + c.h + M.gap * 0.5); }
        else { ctx.moveTo(c.x - M.gap * 0.5, c.y + c.h * off); ctx.lineTo(c.x + c.w + M.gap * 0.5, c.y + c.h * off); }
      }
      ctx.stroke();
    }
    // blocks
    for (i = 0; i < M.blocks.length; i++) {
      var b = M.blocks[i], bc = pal[b.col === 2 ? 2 : b.col];
      ctx.fillStyle = rgba(mix(bc, [0, 0, 0], 0.9), 1); ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      if (b.type === 'sram') {
        var cs = 3 * sc; ctx.beginPath();
        for (k = b.x; k < b.x + b.w; k += cs) { ctx.moveTo(k + 0.5, b.y); ctx.lineTo(k + 0.5, b.y + b.h); }
        ctx.strokeStyle = rgba(bc, 0.30); ctx.lineWidth = 1; ctx.stroke(); ctx.beginPath();
        for (k = b.y; k < b.y + b.h; k += cs * 2) { ctx.moveTo(b.x, k + 0.5); ctx.lineTo(b.x + b.w, k + 0.5); }
        ctx.strokeStyle = rgba(bc, 0.22); ctx.stroke();
        ctx.fillStyle = rgba(mix(bc, [255, 255, 255], 0.5), 0.5);
        for (k = 0; k < b.w * b.h / (cs * cs * 14); k++) ctx.fillRect(b.x + ((rng() * b.w / cs) | 0) * cs, b.y + ((rng() * b.h / (cs * 2)) | 0) * cs * 2, 1.5, 1.5);
        ctx.strokeStyle = rgba(pal[1], 0.5); ctx.lineWidth = 2 * sc;
        ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h * 0.5); ctx.lineTo(b.x + b.w, b.y + b.h * 0.5); ctx.stroke();
      } else if (b.type === 'logic') {
        var rh = 5 * sc;
        for (k = b.y + 1; k < b.y + b.h - rh; k += rh) {
          var x = b.x + 1;
          while (x < b.x + b.w - 2) {
            var cwid = (2 + ((rng() * 7) | 0)) * sc;
            if (rng() < 0.82) { ctx.fillStyle = rgba(mix(bc, pal[1], rng()), 0.25 + rng() * 0.5); ctx.fillRect(x, k, Math.min(cwid, b.x + b.w - x) - 1, rh - 1.5); }
            x += cwid;
          }
        }
      } else if (b.type === 'data') {
        var sx = 4 * sc; ctx.beginPath();
        for (k = b.x; k < b.x + b.w; k += sx) { ctx.moveTo(k, b.y); ctx.lineTo(k, b.y + b.h); }
        ctx.strokeStyle = rgba(bc, 0.35); ctx.lineWidth = 1.2 * sc; ctx.stroke(); ctx.beginPath();
        for (k = b.y + 6 * sc; k < b.y + b.h; k += 18 * sc) { ctx.moveTo(b.x, k); ctx.lineTo(b.x + b.w, k); }
        ctx.strokeStyle = rgba(pal[1], 0.5); ctx.stroke();
        ctx.fillStyle = rgba(pal[1], 0.7);
        for (k = b.y + 6 * sc; k < b.y + b.h; k += 18 * sc) for (j = b.x; j < b.x + b.w; j += sx * 4) ctx.fillRect(j - 1, k - 1, 3, 3);
      } else { // analog: concentric / spiral rings
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2, m = Math.min(b.w, b.h) / 2;
        ctx.strokeStyle = rgba(bc, 0.55); ctx.lineWidth = 1.2 * sc;
        for (k = 4 * sc; k < m; k += 5 * sc) ctx.strokeRect(cx - k, cy - k, k * 2, k * 2);
        ctx.strokeStyle = rgba(pal[1], 0.4); ctx.beginPath(); ctx.moveTo(b.x, cy); ctx.lineTo(b.x + b.w, cy); ctx.moveTo(cx, b.y); ctx.lineTo(cx, b.y + b.h); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = rgba(bc, 0.8); ctx.lineWidth = 1.3 * sc; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    }
    // via dots where bus lines end
    ctx.fillStyle = rgba(pal[1], 0.8);
    for (i = 0; i < M.netPads.length; i++) { ctx.beginPath(); ctx.arc(M.netPads[i].x, M.netPads[i].y, 1.5 * sc, 0, 6.2832); ctx.fill(); }
  }

  function drawDieAnim(S, M, ctx, t) {
    var sc = S.sc, i, k, pal = [hex(S.pal.a), hex(S.pal.b), hex(S.pal.v)], tick = Math.floor(t * 7);
    for (i = 0; i < M.blocks.length; i++) {
      var b = M.blocks[i], s1 = Math.sin(6.2832 * (t / b.per + b.ph)), s2 = Math.sin(6.2832 * (t / b.per2 + b.ph * 3));
      var I = Math.pow(Math.max(0, s1), 2) * (0.6 + 0.4 * s2);
      if (I > 0.02) { ctx.fillStyle = rgba(pal[b.col], I * 0.32); ctx.fillRect(b.x, b.y, b.w, b.h); }
      if (b.type === 'sram') {
        var y = ((t * b.sweep + b.ph) % 1) * b.h;
        ctx.fillStyle = rgba(pal[1], 0.28 + I * 0.4); ctx.fillRect(b.x, b.y + y, b.w, 2.5 * sc);
      } else if (b.type === 'logic') {
        var rh = 5 * sc, rows = Math.max(1, ((b.h - 2) / rh) | 0);
        for (k = 0; k < 2; k++) {
          var r = (hash(tick * 31 + i * 7 + k * 101) * rows) | 0;
          ctx.fillStyle = rgba(pal[1], 0.12 + I * 0.25); ctx.fillRect(b.x, b.y + 1 + r * rh, b.w, rh - 1);
        }
      } else if (b.type === 'data') {
        var xx = ((t * 0.35 + b.ph) % 1) * b.w;
        ctx.fillStyle = rgba(pal[1], 0.22 + I * 0.3); ctx.fillRect(b.x + xx, b.y, 3 * sc, b.h);
      }
      for (k = 0; k < b.hot.length; k++) {
        var h = b.hot[k], u = Math.pow(Math.max(0, Math.sin(6.2832 * (t / h.per + h.ph))), 3) * (0.35 + I);
        if (u > 0.03) { var z = h.r * (0.8 + u * 0.8); ctx.globalAlpha = Math.min(1, u); ctx.drawImage(S.sprHot, h.x - z, h.y - z, z * 2, z * 2); }
      }
      ctx.globalAlpha = 1;
    }
    drawPulses(ctx, M.pulses, t, sc);
  }

  // =====================================================================
  // MAGITECH v3: octilinear root bundles on a lattice + hidden back-layer links (design: refs/magitech-design.md)
  // =====================================================================
  // design: defaults tuned with tools/preview.py (doc defaults gave a sparse PCB-like bus look: few splits, density < 0.02)
  var MP = {
    pitch: 6, icCount: 11, icMinSep: 0.17, icKeep: 2, trunksMin: 2, trunksMax: 4, trunkLanesMin: 3, trunkLanesMax: 5, laneSpacing: 2,
    trunkW: 3.4, minW: 0.6, taper: 0.7, runMin: 3, runMax: 7, turn90: 0.08, splitBase: 0.2, peel90: 0.15, trunkLife: 150, lifeDecay: 0.85,
    maxDepth: 6, fillRoots: 30, hidNear: 2, hidLong: 3, hidDegMax: 4, hidTipRate: 0.25, hidDelayBase: 0.25, hidDelayPerW: 0.6,
    ambient: 110, waveSpeed: 3, maxHops: 3, hopDecay: 0.6, Emin: 0.12, waveMax: 220, cellBudget: 60000, minBeforeSplit: 3
  };
  var MDENS = { sparse: { icCount: 0.7, splitBase: 0.7, trunkLife: 0.8, ambient: 0.6 }, lush: { icCount: 1.2, splitBase: 1.35, trunkLife: 1.2, fillRoots: 2, ambient: 1.4 } };
  function magiParams(density, over) { // density 0.5 sparse .. 1 normal .. 1.5 lush (linear between presets)
    var d = Math.max(0.5, Math.min(1.5, density)), tab = d <= 1 ? MDENS.sparse : MDENS.lush, t = d <= 1 ? (1 - d) / 0.5 : (d - 1) / 0.5, P = {}, k;
    for (k in MP) P[k] = MP[k];
    for (k in tab) P[k] = MP[k] * (1 + (tab[k] - 1) * t);
    if (over) for (k in over) P[k] = over[k];
    return P;
  }
  function clampN(x, a, b) { return x < a ? a : x > b ? b : x; }
  function unionFind(n) { var p = []; for (var i = 0; i < n; i++) p.push(i); function f(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; } return { find: f, join: function (a, b) { p[f(a)] = f(b); } }; }

  function buildMagitech(S) {
    var W = S.W, H = S.H, sc = S.sc, P = magiParams(S.density, S.over), seed = S.seed | 0;
    var t0 = nowMs();
    var rng = mulberry32(seed * 3 + 11), rngH = mulberry32(seed * 13 + 5);
    var g = P.pitch * sc, cw = Math.floor(W / g), ch = Math.floor(H / g), i, j, k;
    var occ = new Uint8Array(cw * ch), own = new Int32Array(cw * ch).fill(-1), walked = 0;
    function rr(a, b) { return a + Math.floor(rng() * (b - a + 1)); }
    function px(c) { return (c + 0.5) * g; }
    function idx(x, y) { return y * cw + x; }
    // ---- 3.1 IC placement ----
    var ics = [], nIC = Math.max(2, Math.round(P.icCount)), sep = P.icMinSep * W, pass, tries, KP = P.icKeep;
    for (pass = 0; pass < 4 && ics.length < Math.ceil(nIC * 0.7); pass++, sep *= 0.85) {
      ics.length = 0; occ.fill(0); own.fill(-1);
      for (tries = 0; tries < 400 && ics.length < nIC; tries++) {
        var wc = rr(5, 10), hc = rr(5, 10);
        if (wc > 2 * hc) wc = 2 * hc; if (hc > 2 * wc) hc = 2 * wc;
        var x0 = rr(KP + 3, cw - wc - KP - 3), y0 = rr(KP + 3, ch - hc - KP - 3), mx = (x0 + wc / 2) * g, my = (y0 + hc / 2) * g, ok = true, x, y;
        for (i = 0; i < ics.length && ok; i++) if (Math.hypot(ics[i].mx - mx, ics[i].my - my) < sep) ok = false;
        for (y = y0 - KP; y < y0 + hc + KP && ok; y++) for (x = x0 - KP; x < x0 + wc + KP; x++) if (occ[idx(x, y)]) { ok = false; break; }
        if (!ok) continue;
        var id = ics.length;
        for (y = y0 - KP; y < y0 + hc + KP; y++) for (x = x0 - KP; x < x0 + wc + KP; x++) {
          var inside = x >= x0 && x < x0 + wc && y >= y0 && y < y0 + hc;
          occ[idx(x, y)] = inside ? 1 : 2; own[idx(x, y)] = -2 - id;
        }
        ics.push({ id: id, x: x0 * g, y: y0 * g, w: wc * g, h: hc * g, pin: 1.5 * g, x0: x0, y0: y0, wc: wc, hc: hc, mx: mx, my: my, rootBundleIds: [] });
      }
    }
    // ---- 3.2 attractor field (coarse, cell = 8 lattice cells) ----
    var ac = Math.ceil(cw / 8), ah = Math.ceil(ch / 8), A = new Float32Array(ac * ah).fill(1), CONE = [];
    for (k = 0; k < 8; k++) {
      var cone = [];
      for (var oy = -5; oy <= 5; oy++) for (var ox = -5; ox <= 5; ox++) {
        var dd = Math.hypot(ox, oy); if (dd < 1 || dd > 5) continue;
        if ((ox * DX[k] + oy * DY[k]) / (dd * Math.hypot(DX[k], DY[k])) >= 0.7071) cone.push([ox, oy, 1 / dd]);
      }
      CONE.push(cone);
    }
    function steer(d, cx, cy) {
      var a = (cx / 8) | 0, b = (cy / 8) | 0, s = 0, c = CONE[(d + 8) % 8], q;
      for (q = 0; q < c.length; q++) { var u = a + c[q][0], v = b + c[q][1]; if (u >= 0 && v >= 0 && u < ac && v < ah) s += A[v * ac + u] * c[q][2]; }
      return s;
    }
    function visit(cx, cy) { var q = ((cy / 8) | 0) * ac + ((cx / 8) | 0); A[q] = Math.max(0, A[q] - 0.25); }
    // ---- 3.3-3.6 bundles ----
    var traces = [], joints = [], bundles = [], queue = [], mlog = [], minWp = P.minW * sc;
    function cellOK(x, y, b) {
      if (x < 2 || y < 2 || x >= cw - 2 || y >= ch - 2) return false;
      var q = idx(x, y), v = occ[q];
      if (v === 2) { if (b.depth || own[q] !== -2 - b.ic) return false; } else if (v) return false;
      if ((occ[q - 1] === 3 && own[q - 1] !== b.fam) || (occ[q + 1] === 3 && own[q + 1] !== b.fam) || (occ[q - cw] === 3 && own[q - cw] !== b.fam) || (occ[q + cw] === 3 && own[q + cw] !== b.fam)) return false;
      return true;
    }
    function unmark() { for (var q = mlog.length - 1; q >= 0; q -= 3) { occ[mlog[q - 2]] = mlog[q - 1]; own[mlog[q - 2]] = mlog[q] ; } mlog.length = 0; }
    function mark(q, b) { mlog.push(q, occ[q], own[q]); occ[q] = 3; own[q] = b.fam; }
    // lane segment cells p -> k (direction d); tentative marks; false when blocked
    function raster(b, p, K, d) {
      var ux = DX[d], uy = DY[d], n = ux ? (K[0] - p[0]) / ux : (K[1] - p[1]) / uy;
      if (n < 0 || n !== Math.floor(n) || K[0] - p[0] !== n * ux || K[1] - p[1] !== n * uy) return false;
      for (var t = 1; t <= n; t++) {
        var x = p[0] + ux * t, y = p[1] + uy * t;
        if (!cellOK(x, y, b)) return false;
        if (ux && uy && (occ[idx(x, y - uy)] === 3 || occ[idx(x - ux, y)] === 3)) return false; // diagonal corner-cut
        mark(idx(x, y), b);
      }
      return true;
    }
    function corner(b, o, cx2, cy2, nd) { // lane corner when run dir d turns to nd (lane offset o, centre corner c')
      var d = b.dir, ax = cx2 - DY[d] * o, ay = cy2 + DX[d] * o;
      if (nd === d) return [ax, ay];
      var bx = cx2 - DY[nd] * o, by = cy2 + DX[nd] * o, ux = DX[d], uy = DY[d], vx = DX[nd], vy = DY[nd], cr = ux * vy - uy * vx;
      if (!cr) return null;
      var s = Math.round(((bx - ax) * vy - (by - ay) * vx) / cr);
      return [ax + s * ux, ay + s * uy];
    }
    function attempt(b, L, nds) { // one run of L steps, lane i then turns to nds[i]; commit on success
      var d = b.dir, cx2 = b.cx + DX[d] * L, cy2 = b.cy + DY[d] * L, Ks = [], i, lane;
      if (cx2 < 4 || cy2 < 4 || cx2 > cw - 5 || cy2 > ch - 5) return null;
      mlog.length = 0;
      for (i = 0; i < b.lanes.length; i++) {
        lane = b.lanes[i];
        var K = corner(b, lane.o, cx2, cy2, nds[i]);
        if (!K || !raster(b, lane.pend, K, d)) { unmark(); return null; }
        Ks.push(K);
      }
      mlog.length = 0;
      for (i = 0; i < b.lanes.length; i++) { b.lanes[i].pts.push(Ks[i]); b.lanes[i].pend = Ks[i]; }
      for (i = 1; i <= L; i++) visit(b.cx + DX[d] * i, b.cy + DY[d] * i);
      b.cx = cx2; b.cy = cy2; b.steps += L; walked += L * b.lanes.length;
      return Ks;
    }
    function mergePts(cells) {
      var out = [], i;
      for (i = 0; i < cells.length; i++) {
        var p = [px(cells[i][0]), px(cells[i][1])], n = out.length;
        if (n && out[n - 1][0] === p[0] && out[n - 1][1] === p[1]) continue;
        if (n > 1) {
          var a = out[n - 2], c = out[n - 1];
          if ((c[0] - a[0]) * (p[1] - c[1]) - (c[1] - a[1]) * (p[0] - c[0]) === 0 && (c[0] - a[0]) * (p[0] - c[0]) + (c[1] - a[1]) * (p[1] - c[1]) > 0) out[n - 1] = p; else out.push(p);
        } else out.push(p);
      }
      return out;
    }
    function closeLane(b, lane, end) { // trace from lane.a to `end`, continuing the lane chain
      var tr = makePath(mergePts(lane.pts), b.depth < 2 ? 0 : 1, lane.w);
      tr.id = traces.length; tr.next = []; tr.a = lane.a; tr.b = end; tr.bundle = b.id; tr.lane = lane.li; tr.depth = b.depth; tr.wDepth = lane.w; tr.eFac = lane.eFac; tr.tree = b.ic;
      traces.push(tr);
      if (lane.prev >= 0) traces[lane.prev].next.push(tr.id);
      lane.prev = tr.id;
      return tr;
    }
    function cutLane(b, lane, w, eFac) {
      var p = lane.pend, tr = closeLane(b, lane, { type: 'pad', ic: -1, x: px(p[0]), y: px(p[1]), kind: 'joint' });
      lane.a = { type: 'pad', ic: -1, x: px(p[0]), y: px(p[1]), kind: 'joint' }; lane.pts = [p]; lane.w = w; lane.eFac = eFac;
      return tr.id;
    }
    function tipEnd(b, p) {
      var r = rng(), twig = b.lanes.length === 1 && b.depth >= 2, kind = b.depth <= 1 ? 'via' : (twig && r < 0.35) ? 'node' : r < 0.7 ? 'pad' : 'via';
      for (var y = -1; y <= 1; y++) for (var x = -1; x <= 1; x++) { var q = idx(p[0] + x, p[1] + y); if (!occ[q]) { occ[q] = 5; own[q] = b.fam; } }
      return { type: kind === 'via' ? 'via' : 'pad', ic: -1, x: px(p[0]), y: px(p[1]), kind: kind };
    }
    function finish(b) {
      var dead = true, i;
      for (i = 0; i < b.lanes.length; i++) if (b.lanes[i].pts.length > 1 || b.lanes[i].prev >= 0) dead = false;
      if (dead) return -1;
      for (i = 0; i < b.lanes.length; i++) {
        var lane = b.lanes[i], e = tipEnd(b, lane.pend);
        if (lane.pts.length < 2) { var pt = traces[lane.prev]; pt.b = e; pt.tip = true; } else { closeLane(b, lane, e).tip = true; }
      }
      return 0;
    }
    function newBundle(parent, lanes, d, w, life, depth) {
      var b = { id: bundles.length, parent: parent ? parent.id : -1, ic: parent ? parent.ic : -1, fam: parent ? parent.fam : bundles.length, depth: depth, lc0: lanes.length, w0: w, lanes: lanes, dir: d, dir0: d,
        cx: parent ? parent.cx : 0, cy: parent ? parent.cy : 0, width: w, life: life, steps: 0, twig: false, forked: false, spacing: P.laneSpacing };
      if (lanes.length === 1) { b.cx = lanes[0].pend[0]; b.cy = lanes[0].pend[1]; lanes[0].o = 0; if (depth >= 2) { b.twig = true; b.life = rr(6, 18); } }
      bundles.push(b); return b;
    }
    function hd(b, nd) { return Math.abs(((nd - b.dir0 + 12) % 8) - 4); }
    function advance(b) {
      var n = b.lanes.length, d = b.dir, maxO = 0, i, Ks;
      for (i = 0; i < n; i++) maxO = Math.max(maxO, Math.abs(b.lanes[i].o));
      if (b.life <= 0 || walked > P.cellBudget) return finish(b);
      var Lmin = Math.max(P.runMin, 2 * maxO + 1), L = Lmin + Math.floor(rng() * (Math.max(P.runMax, Lmin) - Lmin + 1)), nds = [];
      b.life -= L;
      var sb = P.splitBase * (1 + 0.4 * b.depth), want = b.steps >= P.minBeforeSplit && b.depth < P.maxDepth && rng() < 1 - Math.pow(1 - sb, L);
      if (want && n >= 2) { // peel k lanes on one side into a child bundle
        var k = n >= 4 ? rr(1, n - 2) : 1, side = rng() < 0.5 ? -1 : 1, c90 = rng() < P.peel90;
        var cnd = (d + side * (c90 ? 2 : 1) + 8) % 8, pnd = (c90 || rng() < 0.5) ? d : (d - side + 8) % 8;
        if (hd(b, cnd) <= 2 && hd(b, pnd) <= 2) {
          var first = side > 0 ? n - k : 0;
          for (i = 0; i < n; i++) nds.push(i >= first && i < first + k ? cnd : pnd);
          if ((Ks = attempt(b, L, nds))) {
            var cl = b.lanes.slice(first, first + k), rest = b.lanes.slice(0, first).concat(b.lanes.slice(first + k)), tin = [];
            var wp = Math.min(b.width, Math.max(minWp, b.width * Math.cbrt((n - k) / n))), wc = Math.min(b.width, Math.max(minWp, b.width * Math.cbrt(k / n) * P.taper));
            for (i = 0; i < n; i++) { var inC = i >= first && i < first + k; tin.push(cutLane(b, b.lanes[i], inC ? wc : wp, Math.sqrt((inC ? k : n - k) / n))); }
            joints.push({ id: joints.length, x: px(b.cx), y: px(b.cy), kind: 'split', bundle: b.id, traceIn: tin, tracesOut: [] });
            var cb = newBundle(b, cl, cnd, wc, b.life * P.lifeDecay, b.depth + 1);
            queue.push(cb);
            b.lanes = rest; b.dir = pnd; b.width = wp;
            if (rest.length === 1) { b.cx = rest[0].pend[0]; b.cy = rest[0].pend[1]; rest[0].o = 0; }
            return 1;
          }
        }
      }
      if (want && n === 1 && b.twig && !b.forked && rng() < 0.6) { // twig fork into two single lanes
        if ((Ks = attempt(b, L, [d]))) {
          var lane = b.lanes[0], w2 = Math.min(b.width, Math.max(minWp, b.width * 0.8)), eF = Math.SQRT1_2, p = lane.pend, lane2;
          var tid = cutLane(b, lane, w2, eF);
          lane2 = { o: 0, li: lane.li, a: lane.a, pts: [p], pend: p, w: w2, eFac: eF, prev: tid };
          joints.push({ id: joints.length, x: px(p[0]), y: px(p[1]), kind: 'split', bundle: b.id, traceIn: [tid], tracesOut: [] });
          b.forked = true;
          var c1 = newBundle(b, [lane], (d + 1) % 8, w2, b.life, b.depth + 1), c2 = newBundle(b, [lane2], (d + 7) % 8, w2, b.life, b.depth + 1);
          c1.life = c2.life = rr(6, 18); queue.push(c1, c2);
          return 0;
        }
      }
      var cands = [[d, 0.6], [(d + 7) % 8, 1], [(d + 1) % 8, 1], [(d + 6) % 8, P.turn90], [(d + 2) % 8, P.turn90]], order = [], tot = 0, c;
      cands = cands.filter(function (q) { return hd(b, q[0]) <= 2; });
      for (i = 0; i < cands.length; i++) { cands[i][1] *= 0.3 + steer(cands[i][0], b.cx + DX[d] * L, b.cy + DY[d] * L); tot += cands[i][1]; }
      var r = rng() * tot;
      for (i = 0; i < cands.length; i++) { r -= cands[i][1]; if (r <= 0) break; }
      if (i < cands.length) order.push(cands[i][0]);
      cands.sort(function (a, z) { return z[1] - a[1] || a[0] - z[0]; });
      for (i = 0; i < cands.length; i++) if (order.indexOf(cands[i][0]) < 0) order.push(cands[i][0]);
      for (c = 0; c < order.length; c++) {
        for (i = 0; i < n; i++) nds[i] = order[c];
        var Ls = [L, Lmin];
        for (var li = 0; li < 2; li++) if ((Ks = attempt(b, Ls[li], nds))) { b.dir = order[c]; if (n === 1) { b.cx = b.lanes[0].pend[0]; b.cy = b.lanes[0].pend[1]; } return 1; }
      }
      for (i = 0; i < n; i++) nds[i] = d;
      attempt(b, maxO + 1, nds);
      return finish(b);
    }
    function runQueue() { var qi = 0, b; while (qi < queue.length) { b = queue[qi++]; if (advance(b) === 1) queue.push(b); } queue.length = 0; }
    function laneOf(li, o, cell, ic, p) { return { li: li, o: o, a: ic >= 0 ? { type: 'ic', ic: ic, x: px(cell[0]), y: px(cell[1]) } : { type: 'via', ic: -1, x: px(cell[0]), y: px(cell[1]), kind: 'stray' }, pts: [cell], pend: cell, w: p, eFac: 1, prev: -1 }; }
    function seedTrunks(ic) {
      var sides = [[0, -1, 6], [0, 1, 2], [-1, 0, 4], [1, 0, 0]], kk = rr(P.trunksMin, P.trunksMax), order = [], tot, s, r, got = 0, q;
      var ccx = ic.x0 + (ic.wc >> 1), ccy = ic.y0 + (ic.hc >> 1), ws = sides.map(function (sd) { return 0.3 + steer(sd[2], ccx, ccy); });
      while (order.length < 4) {
        tot = 0; for (s = 0; s < 4; s++) if (order.indexOf(s) < 0) tot += ws[s];
        r = rng() * tot;
        for (s = 0; s < 4; s++) if (order.indexOf(s) < 0) { r -= ws[s]; if (r <= 0) break; }
        order.push(s < 4 ? s : [0, 1, 2, 3].filter(function (z) { return order.indexOf(z) < 0; })[0]);
      }
      for (q = 0; q < 4 && got < kk; q++) {
        var sd = sides[order[q]], dir = sd[2], horiz = sd[0] === 0, nsc = horiz ? ic.wc : ic.hc, n = Math.min(rr(P.trunkLanesMin, P.trunkLanesMax), (nsc + 1) >> 1);
        var c0 = (horiz ? ic.x0 : ic.y0) + ((nsc - 1) >> 1), sx0 = horiz ? c0 : sd[0] < 0 ? ic.x0 - 1 : ic.x0 + ic.wc, sy0 = horiz ? (sd[1] < 0 ? ic.y0 - 1 : ic.y0 + ic.hc) : c0;
        var fake = { depth: 0, ic: ic.id, fam: bundles.length }, lanes = [], ok = true, cells = [], l;
        mlog.length = 0;
        for (l = 0; l < n && ok; l++) {
          var o = 2 * l - (n - 1), cell = [sx0 - DY[dir] * o, sy0 + DX[dir] * o];
          if (!cellOK(cell[0], cell[1], fake)) ok = false; else { mark(idx(cell[0], cell[1]), fake); lanes.push(laneOf(l, o, cell, ic.id, P.trunkW * sc)); }
        }
        if (!ok || lanes.length < 2) { unmark(); continue; }
        var saved = mlog.slice(); mlog.length = 0;
        var b = newBundle(null, lanes, dir, P.trunkW * sc, P.trunkLife, 0); b.ic = ic.id; b.cx = sx0; b.cy = sy0; b.fam = b.id;
        for (l = 0; l < lanes.length; l++) own[idx(lanes[l].pend[0], lanes[l].pend[1])] = b.fam;
        if (lanes.length === 1) { b.cx = lanes[0].pend[0]; b.cy = lanes[0].pend[1]; }
        var res = advance(b);
        if (res < 0) { mlog = saved; unmark(); bundles.pop(); continue; } // honey: drop the dead bundle record (no traces, no children)
        if (res === 1) queue.push(b);
        ic.rootBundleIds.push(b.id); got++;
      }
    }
    for (i = 0; i < ics.length; i++) seedTrunks(ics[i]);
    runQueue();
    // fill pass: stray roots in remaining voids (connected underneath by a hidden link, see 3.7)
    var strays = [], voids = [];
    for (i = 0; i < A.length; i++) if (A[i] > 0.8 && (i % ac) > 0 && (i % ac) < ac - 1 && ((i / ac) | 0) > 0 && ((i / ac) | 0) < ah - 1) voids.push(i);
    for (k = 0; k < P.fillRoots && voids.length; k++) {
      var vq = voids.splice(Math.floor(rng() * voids.length), 1)[0], vx = (vq % ac) * 8 + 4, vy = ((vq / ac) | 0) * 8 + 4, fk = { depth: 3, ic: -1, fam: -7 }, sc0 = null, dx, dy;
      for (dy = -3; dy <= 3 && !sc0; dy++) for (dx = -3; dx <= 3; dx++) if (cellOK(vx + dx, vy + dy, fk) && cellOK(vx + dx + 1, vy + dy, fk)) { sc0 = [vx + dx, vy + dy]; break; }
      if (!sc0) continue;
      var bd = 99, dir = rr(0, 7), dd;
      for (dd = 0; dd < 8; dd++) for (j = 2; j < 30; j++) { var rx = sc0[0] + DX[dd] * j, ry = sc0[1] + DY[dd] * j; if (rx < 0 || ry < 0 || rx >= cw || ry >= ch) break; if (occ[idx(rx, ry)] === 3 && j < bd) { bd = j; dir = dd; break; } }
      var ln = laneOf(0, 0, sc0, -1, 1.4 * minWp), a0 = ln.a, sb2 = newBundle(null, [ln], dir, 1.4 * minWp, 30, 3);
      sb2.fam = sb2.id; occ[idx(sc0[0], sc0[1])] = 3; own[idx(sc0[0], sc0[1])] = sb2.fam; sb2.twig = true; sb2.life = 30;
      var rs = advance(sb2);
      if (rs < 0) { occ[idx(sc0[0], sc0[1])] = 0; own[idx(sc0[0], sc0[1])] = -1; continue; }
      if (rs === 1) queue.push(sb2);
      strays.push({ a: a0 }); // lane.a mutates at every split: keep the root endpoint
      runQueue();
    }
    for (i = 0; i < joints.length; i++) { var jt = joints[i], out = []; jt.traceIn.forEach(function (t) { traces[t].next.forEach(function (n2) { if (out.indexOf(n2) < 0) out.push(n2); }); }); jt.tracesOut = out; }
    // pads / vias / nodes (tip kinds override joint kind at a shared point)
    var padMap = {}, pads = [];
    traces.forEach(function (t) { [t.a, t.b].forEach(function (e) {
      if (e.type === 'ic') return;
      var key = e.x + ',' + e.y, pd = padMap[key];
      if (!pd) { pd = padMap[key] = { x: e.x, y: e.y, kind: e.kind }; pads.push(pd); } else if (e.kind !== 'joint') pd.kind = e.kind;
    }); });
    // ---- 3.7 hidden (back-layer) links ----
    var hidden = [], deg = ics.map(function () { return 0; }), uf = unionFind(ics.length), tipUsed = {}, linked = {};
    function ghost(ic, tx, ty) { // rim point of an IC facing (tx,ty), pushed one cell out
      var dx = tx - ic.mx, dy = ty - ic.my, hw = ic.w / 2 + g, hh = ic.h / 2 + g, s = Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
      return { x: ic.mx + dx * s, y: ic.my + dy * s };
    }
    function addHidden(kind, a, b) {
      var len = Math.hypot(a.x - b.x, a.y - b.y);
      hidden.push({ id: hidden.length, kind: kind, a: a, b: b, len: len, delay: P.hidDelayBase + len / W * P.hidDelayPerW });
      if (a.ic >= 0 && b.ic >= 0) uf.join(a.ic, b.ic);
      return hidden[hidden.length - 1];
    }
    function icEnd(ic, other) { var p = ghost(ic, other.x, other.y); pads.push({ x: p.x, y: p.y, kind: 'ghost' }); return { x: p.x, y: p.y, ic: ic.id }; }
    function icIcLink(i1, i2) {
      deg[i1]++; deg[i2]++; linked[i1 + ',' + i2] = linked[i2 + ',' + i1] = true;
      addHidden('ic-ic', icEnd(ics[i1], ics[i2]), icEnd(ics[i2], ics[i1]));
    }
    var pairs = [];
    for (i = 0; i < ics.length; i++) for (j = i + 1; j < ics.length; j++) pairs.push([i, j, Math.hypot(ics[i].mx - ics[j].mx, ics[i].my - ics[j].my)]);
    pairs.sort(function (a, z) { return a[2] - z[2] || a[0] - z[0] || a[1] - z[1]; });
    var cnt = ics.map(function () { return 0; });
    pairs.forEach(function (pr) { // each IC's hidNear nearest partners
      var a = pr[0], z = pr[1];
      if ((cnt[a] < P.hidNear || cnt[z] < P.hidNear) && deg[a] < P.hidDegMax && deg[z] < P.hidDegMax && !linked[a + ',' + z]) { cnt[a]++; cnt[z]++; icIcLink(a, z); }
    });
    var longs = pairs.filter(function (pr) { return pr[2] > 0.45 * W && !linked[pr[0] + ',' + pr[1]]; });
    for (k = 0; k < P.hidLong && longs.length; k++) {
      var lp = longs.splice(Math.floor(rngH() * longs.length), 1)[0];
      if (deg[lp[0]] < P.hidDegMax && deg[lp[1]] < P.hidDegMax) icIcLink(lp[0], lp[1]);
    }
    var tips = traces.filter(function (t) { return t.tip && t.b.type === 'via' && t.depth <= 2 && t.tree >= 0; });
    tips.forEach(function (t) { // tip vias of shallow twigs link to a foreign tree's tip, else to a foreign IC's rim
      if (!(rngH() < P.hidTipRate) || tipUsed[t.id]) return;
      var best = null, bd = 0.25 * W, ot;
      tips.forEach(function (o) { var dd = Math.hypot(o.b.x - t.b.x, o.b.y - t.b.y); if (o.tree !== t.tree && !tipUsed[o.id] && dd < bd) { bd = dd; best = o; } });
      var ea = { x: t.b.x, y: t.b.y, ic: t.tree, trace: t.id, end: 'b' };
      if (best) { tipUsed[best.id] = tipUsed[t.id] = true; addHidden('twig-twig', ea, { x: best.b.x, y: best.b.y, ic: best.tree, trace: best.id, end: 'b' }); return; }
      var bi = -1; bd = 1e9;
      ics.forEach(function (ic) { var dd = Math.hypot(ic.mx - t.b.x, ic.my - t.b.y); if (ic.id !== t.tree && dd < bd) { bd = dd; bi = ic.id; } });
      if (bi >= 0) { tipUsed[t.id] = true; addHidden('twig-ic', ea, icEnd(ics[bi], t.b)); }
    });
    strays.forEach(function (ln) { // stray roots are connected underneath to the nearest IC rim
      var a = ln.a, bi = 0, bd = 1e9;
      ics.forEach(function (ic) { var dd = Math.hypot(ic.mx - a.x, ic.my - a.y); if (dd < bd) { bd = dd; bi = ic.id; } });
      var tid = -1; for (var q = 0; q < traces.length; q++) if (traces[q].a === a) { tid = q; break; }
      addHidden('twig-ic', { x: a.x, y: a.y, ic: -1, trace: tid, end: 'a' }, icEnd(ics[bi], a));
    });
    for (;;) { // connect remaining IC components with the shortest hidden edge
      var bestP = null;
      pairs.forEach(function (pr) { if (uf.find(pr[0]) !== uf.find(pr[1]) && (!bestP || (deg[pr[0]] < P.hidDegMax && deg[pr[1]] < P.hidDegMax && bestP.cap === false) || (bestP.cap === (deg[pr[0]] < P.hidDegMax && deg[pr[1]] < P.hidDegMax) && pr[2] < bestP.pr[2]))) bestP = { pr: pr, cap: deg[pr[0]] < P.hidDegMax && deg[pr[1]] < P.hidDegMax }; });
      if (!bestP) break;
      icIcLink(bestP.pr[0], bestP.pr[1]);
    }
    var adj = {};
    ics.forEach(function (ic) { adj[ic.id] = []; });
    hidden.forEach(function (h) { if (h.a.ic >= 0 && h.b.ic >= 0 && h.a.ic !== h.b.ic) { adj[h.a.ic].push({ ic: h.b.ic, via: 'hidden', hops: 1, link: h.id }); adj[h.b.ic].push({ ic: h.a.ic, via: 'hidden', hops: 1, link: h.id }); } });
    var M = { ics: ics, traces: traces, netPads: pads, pads: pads, bundles: bundles.map(function (b) { return { id: b.id, parent: b.parent, ic: b.ic, depth: b.depth, laneCount: b.lc0, dir0: b.dir0, spacing: b.spacing, width: b.w0 }; }), joints: joints, hidden: hidden, adj: adj, walked: walked, buildMs: nowMs() - t0, P: P, sc: sc };
    return M;
  }

  // ---- magitech simulation: DOM-free pure functions (variance, clock, ambient emitters, click waves) ----
  function edgeFactor(seed, id, V) { return V ? 0.8 + 0.45 * hash((seed * 7919 + id * 104729) | 0) : 1; } // fixed per trace
  function sampleVariance(rng, V, sc) { // always consumes 6 draws, so the flag never shifts the stream
    var u1 = rng(), u2 = rng(), u3 = rng(), u4 = rng(), u5 = rng(), u6 = rng();
    var gs = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(6.2832 * u2), v = { speed: 90 * sc, tail: 40 * sc, gap: 1.4, size: 9, phase: u6 };
    if (V) {
      v.speed = clampN(90 * sc * Math.exp(0.35 * gs), 45 * sc, 200 * sc); v.tail = 40 * sc * (0.5 + 1.3 * u3);
      v.gap = clampN(0.3 - 1.4 * Math.log(1 - u4), 0.3, 5); v.size = 9 * (0.8 + 0.5 * u5);
    }
    return v;
  }
  function newClock() { return { simT: 0, last: null }; }
  function advanceSim(c, wall, mul) { // frame step capped at 0.1 s; sim time accumulates dt * speed so speed changes never jump
    if (c.last === null) c.last = wall;
    var dt = clampN(wall - c.last, 0, 0.1); c.last = wall; c.simT += dt * mul;
    return c.simT;
  }
  function chainPath(net, ids, rev) {
    var pts = [], i, w = 0;
    ids.forEach(function (id) { var t = net.traces[id]; w += t.w; for (i = 0; i < t.pts.length; i++) if (!pts.length || pts[pts.length - 1][0] !== t.pts[i][0] || pts[pts.length - 1][1] !== t.pts[i][1]) pts.push(t.pts[i]); });
    if (rev) pts.reverse();
    return makePath(pts, 0, w / ids.length);
  }
  function emitNext(e, cur) { // schedule of the pulse after `cur` (null -> first one); depends only on emitter-local data
    var k = cur ? cur.k + 1 : 0, p = e.ring[k % 64], spd = p.speed * e.ef, end = cur ? cur.s0 + (e.path.len + cur.tail) / cur.speed : 0;
    return { k: k, s0: cur ? end + p.gap : p.phase * (e.path.len / spd + p.gap), speed: spd, tail: p.tail, size: p.size };
  }
  function makeEmitters(net, seed, V) {
    var roots = net.traces.filter(function (t) { return t.a.type === 'ic' && t.depth === 0; }), n = Math.round(net.P.ambient), em = [], e, k;
    for (e = 0; e < n && roots.length; e++) {
      var r = mulberry32((seed * 17 + 9 + e * 104729) | 0), t = roots[Math.floor(r() * roots.length)], chain = [t.id], ef = 0;
      while (t.next.length) { t = net.traces[t.next[Math.floor(r() * t.next.length)]]; chain.push(t.id); }
      var out = r() < 0.6, ring = [];
      for (k = 0; k < 64; k++) ring.push(sampleVariance(r, V, net.sc));
      chain.forEach(function (id) { ef += edgeFactor(seed, id, V); });
      var em1 = { id: e, chain: chain, out: out, ring: ring, ef: ef / chain.length, path: chainPath(net, chain, !out), cur: null };
      em1.next = emitNext(em1, null); em.push(em1);
    }
    return { em: em };
  }
  function stepEmitters(st, simT) { // -> pulses that started since the last call: [{e,k,s0}] (independent of the step size)
    var started = [];
    st.em.forEach(function (e) { while (e.next.s0 <= simT) { e.cur = e.next; started.push({ e: e.id, k: e.cur.k, s0: e.cur.s0 }); e.next = emitNext(e, e.cur); } });
    return started;
  }
  function capLive(list, cap) { // drop lowest-energy entries until at most `cap` are alive at any moment
    for (;;) {
      var ev = [], live = {}, n = 0, peak = null;
      list.forEach(function (e, i) { ev.push([e.startT, 1, i], [e.startT + ((e.len + (e.tail || 0)) / e.speed), -1, i]); });
      ev.sort(function (a, z) { return a[0] - z[0] || a[1] - z[1] || a[2] - z[2]; });
      for (var q = 0; q < ev.length; q++) {
        if (ev[q][1] > 0) { live[ev[q][2]] = 1; if (++n > cap) { peak = Object.keys(live).map(Number); break; } } else { delete live[ev[q][2]]; n--; }
      }
      if (!peak) return list;
      var low = peak[0]; peak.forEach(function (i) { if (list[i].energy < list[low].energy || (list[i].energy === list[low].energy && i > low)) low = i; });
      list.splice(low, 1);
    }
  }
  // click wave schedule from one IC: [{edgeId,startT,len,speed,energy,hop,tail,size,kind:'trace'|'hidden'[,ax,ay,bx,by]}] sorted by startT
  function waveFrom(net, icId, rngSeed, V) {
    var rng = mulberry32(rngSeed), P = net.P, sc = net.sc, out = [], reached = {}, seen = {}, tipLinks = {};
    net.hidden.forEach(function (h) { [h.a, h.b].forEach(function (x) { if (x.trace !== undefined && x.end === 'b') (tipLinks[x.trace] = tipLinks[x.trace] || []).push(h); }); });
    function hop(h, from, to, E, t, hp, next) {
      var d = h.delay * (V ? 0.8 + 0.5 * rng() : (rng(), 1));
      out.push({ kind: 'hidden', edgeId: h.id, startT: t, len: h.len, speed: h.len / d, energy: E, hop: hp, tail: 0, size: 0, ax: from.x, ay: from.y, bx: to.x, by: to.y });
      next(t + d);
    }
    function walk(tr, E, t, hp) {
      if (seen[tr.id]) return; seen[tr.id] = true;
      var v = sampleVariance(rng, V, sc), spd = v.speed * P.waveSpeed * edgeFactor(net.seed, tr.id, V), end = t + tr.len / spd;
      out.push({ kind: 'trace', edgeId: tr.id, startT: t, len: tr.len, speed: spd, energy: E, hop: hp, tail: v.tail, size: v.size });
      var jit = tr.next.map(function () { return V ? 0.06 * rng() : (rng(), 0); });
      if (E < P.Emin) return;
      tr.next.forEach(function (c, i) { walk(net.traces[c], E * net.traces[c].eFac, end + jit[i], hp); });
      if (!tr.next.length && hp < P.maxHops) (tipLinks[tr.id] || []).forEach(function (h) {
        var other = h.a.trace === tr.id ? h.b : h.a, self = h.a.trace === tr.id ? h.a : h.b;
        if (other.ic >= 0 && !reached[other.ic]) { reached[other.ic] = true; hop(h, self, other, E * P.hopDecay, end, hp + 1, function (t2) { launch(other.ic, E * P.hopDecay, hp + 1, t2); }); }
      });
    }
    function launch(ic, E, hp, t) {
      net.traces.forEach(function (tr) { if (tr.a.ic === ic && tr.depth === 0) walk(tr, E, t, hp); });
      if (hp >= P.maxHops || E < P.Emin) return;
      net.hidden.forEach(function (h) {
        if (h.kind === 'ic-ic' && (h.a.ic === ic || h.b.ic === ic)) {
          var from = h.a.ic === ic ? h.a : h.b, to = h.a.ic === ic ? h.b : h.a;
          if (!reached[to.ic]) { reached[to.ic] = true; hop(h, from, to, E * P.hopDecay, t, hp + 1, function (t2) { launch(to.ic, E * P.hopDecay, hp + 1, t2); }); }
        } else if (h.a.ic < 0 && h.b.ic === ic && h.a.trace >= 0) hop(h, h.b, h.a, E * P.hopDecay, t, hp + 1, function (t2) { walk(net.traces[h.a.trace], E * P.hopDecay, t2, hp + 1); });
      });
    }
    reached[icId] = true; launch(icId, 1, 0, 0);
    out.sort(function (a, z) { return a.startT - z.startT; });
    return capLive(out, P.waveMax);
  }
  function icReach(net, maxHops) { // ic -> {other ic: hops} by BFS over hidden adjacency
    var res = {};
    net.ics.forEach(function (ic) {
      var dist = {}, q = [ic.id], qi = 0; dist[ic.id] = 0;
      while (qi < q.length) { var u = q[qi++]; if (dist[u] >= maxHops) continue; net.adj[u].forEach(function (e) { if (dist[e.ic] === undefined) { dist[e.ic] = dist[u] + 1; q.push(e.ic); } }); }
      delete dist[ic.id]; res[ic.id] = dist;
    });
    return res;
  }

  // ---- magitech drawing ----
  function strokeBuckets(ctx, M, keyOf, fn) { // one stroke call per (quantized width, class) bucket
    var bk = {}, i, k;
    for (i = 0; i < M.traces.length; i++) { var t = M.traces[i]; k = keyOf(t); (bk[k] = bk[k] || []).push(t); }
    Object.keys(bk).forEach(function (key) {
      var list = bk[key]; fn(list[0], key);
      ctx.beginPath();
      list.forEach(function (t) { ctx.moveTo(t.pts[0][0], t.pts[0][1]); for (var q = 1; q < t.pts.length; q++) ctx.lineTo(t.pts[q][0], t.pts[q][1]); });
      ctx.stroke();
    });
  }
  function drawMagiStatic(S, M, ctx) {
    var pal = S.pal, A = hex(pal.a), B = hex(pal.b), C = hex(pal.c), sc = S.sc, g = M.P.pitch * sc, W = S.W, H = S.H, i, x, y;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba(A, 0.06);
    for (y = g * 2; y < H; y += g * 4) for (x = g * 2; x < W; x += g * 4) ctx.fillRect(x, y, 1, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'miter'; ctx.miterLimit = 2; ctx.globalCompositeOperation = 'lighter';
    var wq = function (t) { return Math.round(t.w / 0.25) * 0.25; };
    strokeBuckets(ctx, M, wq, function (t, k) { ctx.strokeStyle = rgba(A, 0.05); ctx.lineWidth = +k * 4; });
    strokeBuckets(ctx, M, wq, function (t, k) { ctx.strokeStyle = rgba(B, 0.12); ctx.lineWidth = +k * 2; });
    var maxD = 1; M.traces.forEach(function (t) { if (t.depth > maxD) maxD = t.depth; });
    strokeBuckets(ctx, M, function (t) { return wq(t) + '|' + t.depth; }, function (t, k) { ctx.strokeStyle = rgba(mix(A, B, t.depth / maxD), 0.85); ctx.lineWidth = +k.split('|')[0]; });
    strokeBuckets(ctx, M, function (t) { return t.depth < 2 ? wq(t) : 'x'; }, function (t, k) { ctx.strokeStyle = rgba(C, k === 'x' ? 0 : 0.25); ctx.lineWidth = k === 'x' ? 0 : +k * 0.35; });
    ctx.globalCompositeOperation = 'source-over';
    M.pads.forEach(function (p) {
      var s = 1.2 * sc;
      if (p.kind === 'joint') { ctx.fillStyle = rgba(mix(A, B, 0.5), 0.9); ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2); return; }
      if (p.kind === 'ghost') { ctx.strokeStyle = rgba(B, 0.12); ctx.lineWidth = sc; ctx.setLineDash([2 * sc, 2 * sc]); ctx.beginPath(); ctx.arc(p.x, p.y, 3 * sc, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); return; }
      ctx.fillStyle = rgba(S.bgRGB, 0.9); ctx.strokeStyle = rgba(mix(B, [255, 255, 255], 0.4), 0.9); ctx.lineWidth = sc;
      if (p.kind === 'node') {
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 3 * sc); ctx.lineTo(p.x + 3 * sc, p.y); ctx.lineTo(p.x, p.y + 3 * sc); ctx.lineTo(p.x - 3 * sc, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (S.runes) { ctx.strokeStyle = rgba(mix(B, [255, 255, 255], 0.6), 0.9); glyph(ctx, (hash((p.x * 31 + p.y) | 0) * 7) | 0, p.x, p.y, 1.6 * sc); }
      } else if (p.kind === 'pad') { ctx.fillStyle = rgba(mix(B, [255, 255, 255], 0.5), 0.9); ctx.fillRect(p.x - 1.5 * sc, p.y - 1.5 * sc, 3 * sc, 3 * sc); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * sc, 0, 6.2832); ctx.fill(); ctx.stroke(); }
    });
    M.ics.forEach(function (ic) {
      ctx.fillStyle = rgba(mix(S.bgRGB, A, 0.15), 1); ctx.fillRect(ic.x, ic.y, ic.w, ic.h);
      ctx.strokeStyle = rgba(A, 0.9); ctx.lineWidth = 1.2 * sc; ctx.strokeRect(ic.x, ic.y, ic.w, ic.h);
      ctx.strokeStyle = rgba(A, 0.3); ctx.strokeRect(ic.x + 3 * sc, ic.y + 3 * sc, ic.w - 6 * sc, ic.h - 6 * sc);
    });
  }
  function drawMagiAnim(S, M, ctx, t) { // t = wall time (unused): everything animated reads S.sim
    var sim = S.sim, i, e, st = S.em, A = hex(S.pal.b), sc = S.sc;
    stepEmitters(st, sim);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (i = 0; i < st.em.length; i++) {
      e = st.em[i]; if (!e.cur) continue;
      var pp = pulsePosition(e.path, sim - e.cur.s0, e.cur.speed, e.cur.tail);
      if (!pp.alive) continue;
      var sty = e.sty || (e.sty = pulseStyle(mix(i % 5 ? A : hex(S.pal.v), [255, 255, 255], 0.3), sc, e.cur.size));
      sty.size = e.cur.size * sc; drawComet(ctx, e.path, pp, sty, 1, 1);
    }
    var live = 0;
    for (i = S.waves.length - 1; i >= 0; i--) {
      var w = S.waves[i], rel = sim - w.t0, q;
      while (w.lo < w.sched.length && rel > w.sched[w.lo].startT + (w.sched[w.lo].len + w.sched[w.lo].tail) / w.sched[w.lo].speed + 0.3) w.lo++;
      if (w.lo >= w.sched.length) { S.waves.splice(i, 1); continue; }
      for (q = w.lo; q < w.sched.length && w.sched[q].startT <= rel; q++) {
        var en = w.sched[q], age = rel - en.startT;
        if (en.kind === 'hidden') {
          var arr = en.len / en.speed, fa = 1 - age / 0.25, fb = 1 - (age - arr) / 0.25, z = 22 * sc;
          if (fa > 0) { ctx.globalAlpha = 0.6 * en.energy * fa; ctx.drawImage(S.sprB, en.ax - z, en.ay - z, z * 2, z * 2); }
          if (fb > 0 && fb < 1) { ctx.globalAlpha = 0.6 * en.energy * fb; ctx.drawImage(S.sprB, en.bx - z, en.by - z, z * 2, z * 2); }
          ctx.globalAlpha = 1; continue;
        }
        var tr = M.traces[en.edgeId], p2 = pulsePosition(tr, age, en.speed, en.tail);
        if (!p2.alive) continue;
        live++;
        w.sty = w.sty || pulseStyle(mix(hex(S.pal.b), [255, 255, 255], 0.35), sc, 14);
        w.sty.size = en.size * sc * 1.5; drawComet(ctx, tr, p2, w.sty, 1 + 0.6 * en.energy, 1, en.energy);
      }
    }
    S.live = live;
  }

  // =====================================================================
  // factory
  // =====================================================================
  var VARIANTS = {
    pcb:      { build: buildPCB,      stat: drawPCBStatic,   anim: drawPCBAnim },
    veins:    { build: buildVeins,    stat: drawVeinsStatic, anim: drawVeinsAnim },
    die:      { build: buildDie,      stat: drawDieStatic,   anim: drawDieAnim },
    magitech: { build: buildMagitech, stat: drawMagiStatic,  anim: drawMagiAnim }
  };

  // ---- DOM-free netlist (everything the page/interaction needs, testable in node) ----
  function makeState(seed, W, H, variant, density, palette, over) {
    var pal = resolvePalette(palette);
    return {
      W: W, H: H, seed: seed | 0, over: over, sc: Math.min(W, H) / 1024, density: density, pal: pal, variant: variant,
      rng: mulberry32((seed | 0) * 7919 + variant.length * 104729),
      rng2: mulberry32((seed | 0) * 2654435 + 17),
      rngG: mulberry32((seed | 0) * 40503 + 977), // glyph choice uses its own stream: layouts of older variants are unchanged
      bgRGB: hex(pal.bg), shots: [], rings: [], hv: [], hover: -1, t: 0, dt: 0
    };
  }
  function finalize(M, S) {
    var i, ics = M.ics;
    for (i = 0; i < ics.length; i++) { ics[i].glyph = pickGlyph(S.rngG); ics[i].traceIds = icTraceIds(M.traces, ics[i].id); }
    if (!M.netPads) {
      M.netPads = [];
      M.traces.forEach(function (t) { [t.a, t.b].forEach(function (e) { if (e.type !== 'ic') M.netPads.push({ x: e.x, y: e.y, kind: 'node' }); }); });
    }
    return M;
  }
  function buildNetlist(seed, w, h, variant, density, over) { // over: optional magitech parameter overrides (tests, preview)
    var V = VARIANTS[variant];
    if (!V) throw new Error('CircuitBG: unknown variant ' + variant);
    var S = makeState(seed, w, h, variant, density == null ? 1 : density, 'tron', over);
    var M = finalize(V.build(S), S);
    var net = { variant: variant, w: w, h: h, ics: M.ics, traces: M.traces, pads: M.netPads };
    if (variant === 'magitech') {
      net.sc = S.sc; net.seed = S.seed; net.bundles = M.bundles; net.joints = M.joints; net.hidden = M.hidden; net.adj = M.adj; net.P = M.P;
      Object.defineProperty(net, 'buildMs', { value: M.buildMs, enumerable: false });
      Object.defineProperty(net, 'walked', { value: M.walked, enumerable: false });
    }
    return net;
  }

  // ---- canvas-side glyph sprites (vector strokes; kanji via fillText only when a CJK font is really present) ----
  var KFONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo","Noto Sans CJK JP",sans-serif';
  var kanjiState = null, glyphCache = {};
  function kanjiOK() {
    if (kanjiState !== null) return kanjiState;
    try {
      var g = mk(8, 8).getContext('2d'); g.font = '700 40px ' + KFONT;
      var w1 = g.measureText('魔').width, w2 = g.measureText('￿').width; // tofu has the same width as the missing-glyph box
      kanjiState = w1 > 0 && Math.abs(w1 - w2) > 0.01;
    } catch (e) { kanjiState = false; }
    return kanjiState;
  }
  function glyphSprite(glyph, rgb) {
    var key = glyph + '|' + rgb.map(Math.round).join(',');
    if (glyphCache[key]) return glyphCache[key];
    var N = 96, c = mk(N, N), g = c.getContext('2d'), kind = glyph.split(':')[0], name = glyph.slice(kind.length + 1), s = 24;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = rgba(rgb, 1); g.shadowBlur = 12; // one-time pre-render only
    if (kind === 'kanji' && kanjiOK()) {
      g.font = '700 54px ' + KFONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = rgba(rgb, 0.95); g.fillText(name, N / 2, N / 2 + 2);
      g.shadowBlur = 0; g.fillStyle = rgba(mix(rgb, [255, 255, 255], 0.7), 0.5); g.fillText(name, N / 2, N / 2 + 2);
    } else {
      var strokes = GLYPH_STROKES[kind === 'kanji' ? fallbackRuneKey(name) : glyph] || [], pass, a, k;
      for (pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? rgba(mix(rgb, [255, 255, 255], 0.7), 1) : rgba(rgb, 0.95); g.lineWidth = pass ? 1.8 : 5;
        if (pass) g.shadowBlur = 0;
        for (a = 0; a < strokes.length; a++) {
          var st = strokes[a]; g.beginPath(); g.moveTo(N / 2 + st[0] * s, N / 2 + st[1] * s);
          for (k = 2; k < st.length; k += 2) g.lineTo(N / 2 + st[k] * s, N / 2 + st[k + 1] * s);
          g.stroke();
        }
      }
    }
    return (glyphCache[key] = c);
  }

  function create(opts) {
    opts = opts || {};
    var W = opts.width || 1024, H = opts.height || 1024;
    if (opts.pow2) { W = nextPow2(W); H = nextPow2(H); }
    var self = {
      canvas: mk(W, H), width: W, height: H, variant: opts.variant || 'pcb', seed: opts.seed == null ? 1 : opts.seed,
      density: opts.density == null ? 1 : opts.density, palette: opts.palette || {}, lastUpdateMs: 0
    };
    var ctx = self.canvas.getContext('2d', { alpha: false });
    var stat = mk(W, H), S = null, M = null, V = null, icsN = [], lastShot = {}, onFonts = null, clickN = 0;
    self.speed = 1; self.runes = true; self.variance = true;

    function icMinDim(ic) { return Math.min(ic.w, ic.h); }
    function rebuild() {
      V = VARIANTS[self.variant];
      if (!V) throw new Error('CircuitBG: unknown variant ' + self.variant);
      S = makeState(self.seed, W, H, self.variant, self.density, self.palette);
      S.cA = hex(S.pal.a); S.sprB = sprite(hex(S.pal.b)); S.sprHot = sprite(hex(S.pal.hot));
      S.sprites = [sprite(hex(S.pal.a)), sprite(hex(S.pal.b)), sprite(hex(S.pal.v))];
      S.revCache = {}; S.glyphSpr = []; lastShot = {}; clickN = 0;
      S.runes = self.runes; S.V = self.variance; S.clock = newClock(); S.sim = 0; S.waves = [];
      M = finalize(V.build(S), S);
      if (self.variant === 'magitech') S.em = makeEmitters(M, S.seed, S.V);
      restat();
      icsN = M.ics.map(function (ic) { return { id: ic.id, u: (ic.x + ic.w / 2) / W, v: (ic.y + ic.h / 2) / H, w: ic.w / W, h: ic.h / H, glyph: ic.glyph, traceIds: ic.traceIds.slice() }; });
    }
    function restat() { // static layer only (layout untouched): used by rebuild and the runes toggle
      var sg = stat.getContext('2d');
      V.stat(S, M, sg);
      // dark plate behind each glyph so it reads over fine grids
      if (S.runes) M.ics.forEach(function (ic) {
        if (icMinDim(ic) < 26 * S.sc) return;
        var r = Math.min(icMinDim(ic) * 0.5, 70 * S.sc) * 0.8;
        sg.fillStyle = rgba(S.bgRGB, 0.72); sg.beginPath(); sg.arc(ic.x + ic.w / 2, ic.y + ic.h / 2, r, 0, 6.2832); sg.fill();
        sg.strokeStyle = rgba(S.cA, 0.4); sg.lineWidth = 0.9 * S.sc; sg.stroke();
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(stat, 0, 0);
    }

    // ---- interaction ----
    function launch(icId) {
      var ic = M.ics[icId], sc = S.sc, i, tr, st = pulseStyle(mix(hex(S.pal.b), [255, 255, 255], 0.35), sc, 14);
      for (i = 0; i < ic.traceIds.length; i++) {
        tr = M.traces[ic.traceIds[i]];
        var key = tr.id + ':' + icId, o = S.revCache[key] || (S.revCache[key] = orient(tr, icId));
        if (S.shots.length < 160) S.shots.push({ tr: o, t0: S.sim, speed: 420 * sc, tail: 90 * sc, depth: 0, chained: false, style: st });
      }
      S.rings.push({ x: ic.x + ic.w / 2, y: ic.y + ic.h / 2, t0: S.sim });
    }
    function launchWave(icId) { // magitech: multi-hop wave (schedule is a pure function of seed, ic and click order)
      var ic = M.ics[icId];
      S.waves.push({ t0: S.sim, lo: 0, sched: waveFrom(M, icId, (S.seed * 7919 + icId * 104729 + (++clickN) * 1299709) | 0, S.V) });
      S.rings.push({ x: ic.x + ic.w / 2, y: ic.y + ic.h / 2, t0: S.sim });
    }
    function drawShots(t) {
      var i, sh, pp, sc = S.sc;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (i = S.shots.length - 1; i >= 0; i--) {
        sh = S.shots[i]; pp = pulsePosition(sh.tr, t - sh.t0, sh.speed, sh.tail);
        if (pp.arrived && !sh.chained) { // veins fed by this trace's far end light up too
          sh.chained = true;
          if (sh.depth < 2 && !sh.tr.rev && sh.tr.next && S.shots.length < 160) {
            for (var k = 0; k < sh.tr.next.length; k++) S.shots.push({ tr: M.traces[sh.tr.next[k]], t0: t, speed: sh.speed * 0.8, tail: sh.tail, depth: sh.depth + 1, chained: false, style: sh.style });
          }
        }
        if (!pp.alive) { S.shots[i] = S.shots[S.shots.length - 1]; S.shots.pop(); continue; }
        drawComet(ctx, sh.tr, pp, sh.style, 1.7, 1.5);
      }
      for (i = S.rings.length - 1; i >= 0; i--) {
        var r = S.rings[i], e = (t - r.t0) / 1.1;
        if (e >= 1) { S.rings[i] = S.rings[S.rings.length - 1]; S.rings.pop(); continue; }
        var R = (12 + 110 * (1 - (1 - e) * (1 - e))) * sc, al = (1 - e) * (1 - e), z = (46 * (1 - e) + 12) * sc;
        ctx.globalAlpha = al * 0.9; ctx.strokeStyle = rgba(S.cA, 1); ctx.lineWidth = 2 * sc;
        ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = al; ctx.drawImage(S.sprB, r.x - z, r.y - z, z * 2, z * 2);
      }
      ctx.globalAlpha = 1;
    }
    function drawICs(t) {
      var sc = S.sc, ics = M.ics, i, k = Math.min(1, S.dt * 9);
      for (i = 0; i < ics.length; i++) {
        var ic = ics[i], cx = ic.x + ic.w / 2, cy = ic.y + ic.h / 2, hv = S.hv[i] || 0;
        hv += ((S.hover === i ? 1 : 0) - hv) * k; S.hv[i] = hv;
        if ((!S.runes || icMinDim(ic) < 26 * sc) && hv < 0.02) continue;
        if (S.runes && icMinDim(ic) >= 26 * sc) {
          var gs = Math.min(icMinDim(ic) * 0.5, 70 * sc), spr = S.glyphSpr[i] || (S.glyphSpr[i] = glyphSprite(ic.glyph, hash(i + 3) < 0.25 ? hex(S.pal.v) : hex(S.pal.b)));
          var br = 0.5 + 0.5 * Math.sin(6.2832 * (t / (4 + (i % 3)) + hash(i + 11))), fl = 1 + 0.06 * Math.sin(t * 4 + i * 7);
          ctx.globalAlpha = Math.min(1, (0.3 + 0.22 * br) * fl + hv * 0.55);
          ctx.drawImage(spr, cx - gs, cy - gs, gs * 2, gs * 2);
        }
        if (hv > 0.02) {
          ctx.globalAlpha = hv * 0.9; ctx.strokeStyle = rgba(mix(S.cA, [255, 255, 255], 0.5), 1); ctx.lineWidth = 2 * sc; ctx.strokeRect(ic.x, ic.y, ic.w, ic.h);
          ctx.globalAlpha = hv * 0.25; ctx.lineWidth = 7 * sc; ctx.strokeStyle = rgba(hex(S.pal.b), 1); ctx.strokeRect(ic.x, ic.y, ic.w, ic.h);
        }
      }
      ctx.globalAlpha = 1;
    }

    self.update = function (t) {
      var t0 = nowMs();
      S.dt = Math.max(0, Math.min(0.1, t - S.t)); S.t = t;
      var tt = advanceSim(S.clock, t, self.speed); S.sim = tt; // all animation reads accumulated sim time, never wall time
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.drawImage(stat, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      V.anim(S, M, ctx, tt);
      drawShots(tt);
      drawICs(tt);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      self.lastUpdateMs = nowMs() - t0;
      return self;
    };
    self.setVariant = function (v) { self.variant = v; rebuild(); return self; };
    self.setSeed = function (s) { self.seed = s; rebuild(); return self; };
    self.getSeed = function () { return self.seed; };
    self.setSpeed = function (m) { self.speed = clampN(+m || 0, 0, 4); return self; }; // takes effect next update; sim time stays continuous
    self.getSimTime = function () { return S.sim; };
    self.setRunes = function (b) { self.runes = !!b; S.runes = self.runes; S.glyphSpr = []; restat(); return self; };
    self.setPulseVariance = function (b) { self.variance = !!b; S.V = self.variance; if (S.em) S.em = makeEmitters(M, S.seed, S.V); return self; };
    self.getLinks = function () { return (M.hidden || []).map(function (h) { return { id: h.id, a: h.a.ic, b: h.b.ic, hidden: true, kind: h.kind }; }); };
    self.setDensity = function (d) { self.density = d; rebuild(); return self; };
    self.setPalette = function (p) { resolvePalette(p); self.palette = p || {}; rebuild(); return self; }; // name ('tron'|'deepsea'|'aurora') or partial object
    self.getICs = function () { return icsN.map(function (c) { return { id: c.id, u: c.u, v: c.v, w: c.w, h: c.h, glyph: c.glyph, traceIds: c.traceIds.slice() }; }); };
    self.hoverAt = function (u, v) { S.hover = hitTest(icsN, u, v, 0); return S.hover; };
    self.pulseAt = function (u, v) {
      var id = hitTest(icsN, u, v, 0.12);
      if (id < 0) return { hit: false, icId: -1 };
      if (!throttleOk(lastShot, id, nowMs(), 250)) return { hit: true, icId: id, throttled: true };
      if (self.variant === 'magitech') launchWave(id); else launch(id);
      return { hit: true, icId: id };
    };
    self.getStats = function () { return { pulses: M.pulses ? M.pulses.length : 0, nodes: M.nodes ? M.nodes.length : 0, branches: M.branches ? M.branches.length : 0, ics: M.ics.length, traces: M.traces.length, comets: S.shots.length + S.waves.reduce(function (n, w) { return n + w.sched.length; }, 0) }; };
    self.dispose = function () {
      if (onFonts && typeof document !== 'undefined' && document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', onFonts);
      stat.width = stat.height = 1; self.canvas.width = self.canvas.height = 1; S = M = V = null; self.update = function () { return self; };
    };
    if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
      onFonts = function () { kanjiState = null; glyphCache = {}; if (S) S.glyphSpr = []; }; // font arrived late: re-render glyph sprites next frame
      document.fonts.addEventListener('loadingdone', onFonts);
    }

    rebuild();
    return self;
  }

  global.CircuitBG = {
    create: create, variants: Object.keys(VARIANTS), defaults: DEFAULTS, palettes: PALETTES, version: '2.0.0',
    glyphPools: GLYPH_POOLS,
    _resetCaches: function () { kanjiState = null; glyphCache = {}; spriteCache = {}; }, // tests / font reload
    pure: {
      mulberry32: mulberry32, buildNetlist: buildNetlist, traceLength: traceLength, pointOnPolyline: function (tr, s) { return pointAt(tr, s, [0, 0]); },
      pulsePosition: pulsePosition, ease: ease, cornerBoost: cornerBoost, orient: orient, icTraceIds: icTraceIds, hitTest: hitTest, throttleOk: throttleOk,
      paletteIsCool: paletteIsCool, parseColor: parseColor, hsvOf: hsvOf, resolvePalette: resolvePalette, PALETTES: PALETTES,
      sampleVariance: sampleVariance, makeEmitters: makeEmitters, stepEmitters: stepEmitters, waveFrom: waveFrom, advanceSim: advanceSim, newClock: newClock,
      icReach: icReach, edgeFactor: edgeFactor, capLive: capLive, magiParams: magiParams,
      GLYPH_POOLS: GLYPH_POOLS, GLYPH_STROKES: GLYPH_STROKES, pickGlyph: pickGlyph, fallbackRuneKey: fallbackRuneKey
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.CircuitBG;
})(typeof window !== 'undefined' ? window : this);
