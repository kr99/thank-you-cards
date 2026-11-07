/*!
 * GlyphEngine - glyph/font cascade engine for the thank-you card (renderer-agnostic)
 *
 * Exports (UMD-ish, global `GlyphEngine`, also CommonJS): POOL, FAMILIES, BY_FAMILY, FONTS,
 * DEFAULT_CFG, createRng/mulberry32, sigmoidProgress, nextCellState, staggerStart,
 * cascadeOrder, layoutText, createSim, GlyphAtlas, fontStack, canvasFont, googleFontsUrl.
 * No dependencies, no build step.
 *
 * SOURCES / LICENSES
 *  - Idea only (no code copied): text-scramble effect by Justin Windle (soulwire),
 *    https://codepen.io/soulwire/pen/mEMPrK  (CodePen default license: MIT). The "settle on a
 *    target char after a per-cell random delay" concept comes from there; everything else here
 *    (neighbor-influenced Markov-ish update, sigmoid pull, ripple cascade, atlas) is original.
 *  - mulberry32 PRNG: Tommy Ettinger, public domain,
 *    https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 *  - Fonts named below are all SIL Open Font License 1.1 (Google Fonts / Noto):
 *    https://fonts.google.com/  and  https://fonts.google.com/noto
 *    Glyph coverage was verified against the OFL font files (fontsource npm mirrors,
 *    https://fontsource.org , OFL) with fontTools cmap checks; see refs/glyph-engine.md.
 *  - This file itself: written for this project, use freely.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GlyphEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ RNG */
  function mulberry32(seed) {
    var a = seed >>> 0;
    function rng() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return rng;
  }
  /** rng() -> [0,1), plus rng.int(n), rng.pick(arr), rng.chance(p) helpers. */
  function createRng(seed) {
    var r = mulberry32(seed == null ? 1 : seed);
    r.int = function (n) { return Math.floor(r() * n); };
    r.pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    r.chance = function (p) { return r() < p; };
    return r;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  /* ------------------------------------------------------------ GLYPH POOL */
  // Every character below was checked against the cmaps of the listed Noto fonts (none missing).
  // family -> literal glyph string. Order within a family does not matter.
  var FAMILIES = {
    latin:     'ABCDEFGHIJKLMNOPQRSTUVWXYZ',                 // Noto Sans (+ every font here)
    latinExt:  'ÆÐØÞŁŊƑƎƆɅƐƩßĦŦƛəɸǶȜ', // ÆÐØÞŁŊƑƎƆɅƐƩßĦŦƛəɸǶȜ  Noto Sans / Noto Sans Mono
    greek:     'ΓΔΘΛΞΠΣΦΨΩαβλμπσφψωϛϡ', // ΓΔΘΛΞΠΣΦΨΩαβλμπσφψωϛϡ  Noto Sans / Math
    cyrillic:  'БГДЖИЛПФЦЧШЯЪЫЭЮѲѪ', // БГДЖИЛПФЦЧШЯЪЫЭЮѲѪ  Noto Sans / Noto Sans Mono
    coptic:    'ⲀⲂⲄⲆⲈⲌⲐⲠⲤⲦⲨⳀⳁⲚ', // ⲀⲂⲄⲆⲈⲌⲐⲠⲤⲦⲨⳀⳁⲚ  Noto Sans Coptic
    runes:     'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ', // Elder Futhark U+16A0.. Noto Sans Runic
    math:      '∀∂∃∅∆∇∈∑∏√∞∠∧∨∩∪∫≈≠≡≤≥⊕⊗⊥∴∵⋈⨀', // ∀∂∃∅∆∇∈∑∏√∞∠∧∨∩∪∫≈≠≡≤≥⊕⊗⊥∴∵⋈⨀  Noto Sans Math
    technical: '⌀⌂⌘⌬⌖⌗⍟⎔⏣⌁⍾⎈⏚⌇⎊⌭', // ⌀⌂⌘⌬⌖⌗⍟⎔⏣⌁⍾⎈⏚⌇⎊⌭  Noto Sans Symbols / Symbols 2
    dingbats:  '✦✧✪✱✲✳❖✶✺❂✜✠✢✥❈✤', // ✦✧✪✱✲✳❖✶✺❂✜✠✢✥❈✤  Noto Sans Symbols 2
    braille:   '⠿⠛⡇⣿⢕⠪⣾⢺', // ⠿⠛⡇⣿⢕⠪⣾⢺  Noto Sans Symbols 2
    geometric: '◆◇○●◐◑◩▲▽◈⬡⬢◬⧫' // ◆◇○●◐◑◩▲▽◈⬡⬢◬⧫  Noto Sans Math / Symbols 2
  };

  var POOL = [];
  var BY_FAMILY = {};
  var FAMILY_OF = {};
  var FAMILY_NAMES = Object.keys(FAMILIES);
  FAMILY_NAMES.forEach(function (fam) {
    BY_FAMILY[fam] = [];
    Array.from(FAMILIES[fam]).forEach(function (ch) {
      var cp = ch.codePointAt(0).toString(16).toUpperCase();
      while (cp.length < 4) cp = '0' + cp;
      var e = { ch: ch, cp: 'U+' + cp, family: fam };
      POOL.push(e);
      BY_FAMILY[fam].push(e);
      FAMILY_OF[ch] = fam;
    });
  });
  // Grapheme helpers (engine stays standalone; card-text.js has the full-featured twin).
  var EMOJI_RE = null;
  try { EMOJI_RE = new RegExp('\\p{Emoji_Presentation}|\\p{Regional_Indicator}|\\p{Extended_Pictographic}[\\uFE0F\\u{1F3FB}-\\u{1F3FF}\\u200D]|^[0-9#*]\\uFE0F?\\u20E3$', 'u'); } catch (e) { EMOJI_RE = null; }
  /** true for color-emoji graphemes (emoji presentation, VS16, skin tone, ZWJ, flag, keycap). Plain (c) (R) TM and digits are text. */
  function isEmoji(g) { return !!EMOJI_RE && typeof g === 'string' && g.length > 0 && EMOJI_RE.test(g); }
  var segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  function splitG(s) {
    s = String(s == null ? '' : s);
    if (!segmenter) return Array.from(s);
    var out = [], it = segmenter.segment(s)[Symbol.iterator](), r;
    while (!(r = it.next()).done) out.push(r.value.segment);
    return out;
  }
  // Small emoji set for the optional cfg.pEmoji random-pool rate (default 0 = never in the cascade).
  var EMOJI_POOL = ['😊', '🎉', '❤️', '👍', '⭐', '🙏', '🚀', '🌟'];
  function familyOf(ch) {
    var f = FAMILY_OF[ch];
    if (f) return f;
    if (typeof ch === 'string' && ch) {
      var c = ch.codePointAt(0);
      if (c >= 0x400 && c <= 0x52F) return 'cyrillic';
      if (c >= 0x370 && c <= 0x3FF) return 'greek';
    }
    return 'latin';
  }

  /* ----------------------------------------------------------------- FONTS */
  // covers: glyph families the font really contains (>= ~88% of our pool chars for that family,
  // verified by cmap; the odd missing glyph falls through the fallback stack).
  // weights: only weights that exist on Google Fonts. italic: true italic face exists.
  // w: relative pick weight for the "fresh font" pick. utility: coverage font, not a pretty one.
  var FALLBACKS = {
    mono: 'ui-monospace, "DejaVu Sans Mono", monospace',
    display: 'system-ui, "DejaVu Sans", sans-serif',
    scifi: 'system-ui, "DejaVu Sans", sans-serif',
    serif: 'Georgia, "DejaVu Serif", serif',
    rounded: 'ui-rounded, system-ui, "DejaVu Sans", sans-serif',
    sans: 'system-ui, "DejaVu Sans", sans-serif',
    symbol: '"DejaVu Sans", sans-serif'
  };
  var FONTS = [
    { name: 'Space Mono',        kind: 'mono',    weights: [400, 700],           italic: true,  covers: ['latin'],                                 w: 1 },
    { name: 'JetBrains Mono',    kind: 'mono',    weights: [300, 400, 700, 800], italic: true,  covers: ['latin', 'greek', 'cyrillic'],            w: 1 },
    { name: 'IBM Plex Mono',     kind: 'mono',    weights: [300, 400, 600, 700], italic: true,  covers: ['latin', 'cyrillic'],                     w: 1 },
    { name: 'Orbitron',          kind: 'scifi',   weights: [400, 600, 800, 900], italic: false, covers: ['latin'],                                 w: 1 },
    { name: 'Audiowide',         kind: 'scifi',   weights: [400],                italic: false, covers: ['latin'],                                 w: 1 },
    { name: 'Press Start 2P',    kind: 'display', weights: [400],                italic: false, covers: ['latin', 'greek', 'cyrillic'],            w: 1 },
    { name: 'Rubik Glitch',      kind: 'display', weights: [400],                italic: false, covers: ['latin', 'cyrillic'],                     w: 1 },
    { name: 'Syne',              kind: 'display', weights: [400, 600, 800],      italic: false, covers: ['latin', 'greek'],                        w: 1 },
    { name: 'Playfair Display',  kind: 'serif',   weights: [400, 600, 800, 900], italic: true,  covers: ['latin', 'cyrillic'],                     w: 1 },
    { name: 'Cinzel',            kind: 'serif',   weights: [400, 600, 800, 900], italic: false, covers: ['latin'],                                 w: 1 },
    { name: 'DM Serif Display',  kind: 'serif',   weights: [400],                italic: true,  covers: ['latin'],                                 w: 1 },
    { name: 'Nunito',            kind: 'rounded', weights: [300, 500, 800, 900], italic: true,  covers: ['latin', 'cyrillic'],                     w: 1 },
    { name: 'Fredoka',           kind: 'rounded', weights: [300, 400, 600, 700], italic: false, covers: ['latin'],                                 w: 1 },
    { name: 'Exo 2',             kind: 'scifi',   weights: [300, 500, 700, 900], italic: true,  covers: ['latin', 'cyrillic'],                     w: 1 },
    // coverage ("utility") fonts: ugly-but-complete, so exotic glyph cells pick a font that has them
    { name: 'Noto Sans Mono',    kind: 'mono',    weights: [300, 400, 700, 900], italic: false, covers: ['latin', 'latinExt', 'greek', 'cyrillic'], w: 0.6, utility: true },
    { name: 'Noto Sans',         kind: 'sans',    weights: [300, 400, 700, 900], italic: true,  covers: ['latin', 'latinExt', 'greek', 'cyrillic'], w: 0.6, utility: true },
    { name: 'Noto Sans Runic',   kind: 'symbol',  weights: [400],                italic: false, covers: ['runes'],                        w: 1, utility: true },
    { name: 'Noto Sans Math',    kind: 'symbol',  weights: [400],                italic: false, covers: ['math', 'greek', 'geometric'],   w: 1, utility: true },
    { name: 'Noto Sans Symbols', kind: 'symbol',  weights: [400, 700],           italic: false, covers: ['technical'],                    w: 1, utility: true },
    { name: 'Noto Sans Symbols 2', kind: 'symbol', weights: [400],               italic: false, covers: ['dingbats', 'braille', 'geometric', 'technical'], w: 1, utility: true },
    { name: 'Noto Sans Coptic',  kind: 'symbol',  weights: [400],                italic: false, covers: ['coptic'],                       w: 1, utility: true }
  ];
  var FONT_INDEX = {};
  FONTS.forEach(function (f, i) { f.index = i; FONT_INDEX[f.name] = i; });
  // Per family: font indices that cover it (built once).
  var FONTS_FOR = {};
  FAMILY_NAMES.forEach(function (fam) {
    FONTS_FOR[fam] = FONTS.filter(function (f) { return f.covers.indexOf(fam) >= 0; }).map(function (f) { return f.index; });
  });

  // Appended after the chosen font so any glyph still finds a face (system fonts as last resort).
  var UNIVERSAL_FALLBACK = '"Noto Sans Symbols 2","Noto Sans Symbols","Noto Sans Math","Noto Sans Runic","Noto Sans Coptic","Noto Sans","DejaVu Sans","Segoe UI Symbol","Apple Symbols"';

  function fontStack(fontIndex) {
    var f = FONTS[fontIndex];
    return '"' + f.name + '", ' + UNIVERSAL_FALLBACK + ', ' + FALLBACKS[f.kind];
  }
  /** CSS/canvas font shorthand. state needs fontIndex, weight, italic. */
  function canvasFont(state, px) {
    return (state.italic ? 'italic ' : '') + state.weight + ' ' + px + 'px ' + fontStack(state.fontIndex);
  }
  /** One fonts.googleapis.com/css2 URL that declares every font in FONTS. */
  function googleFontsUrl(opts) {
    opts = opts || {};
    var parts = FONTS.map(function (f) {
      var fam = f.name.replace(/ /g, '+');
      var ws = f.weights.slice().sort(function (a, b) { return a - b; });
      if (f.italic) {
        var t = ws.map(function (w) { return '0,' + w; }).concat(ws.map(function (w) { return '1,' + w; }));
        return 'family=' + fam + ':ital,wght@' + t.join(';');
      }
      if (ws.length === 1 && ws[0] === 400) return 'family=' + fam;
      return 'family=' + fam + ':wght@' + ws.join(';');
    });
    return 'https://fonts.googleapis.com/css2?' + parts.join('&') + '&display=' + (opts.display || 'swap');
  }

  /* ---------------------------------------------------------------- CONFIG */
  var DEFAULT_CFG = {
    // --- glyph channel raw weights (normalised among themselves each step; see refs/glyph-engine.md)
    pEmoji: 0,           // chance per update (x fade) that a non-target roll shows a random emoji; 0 = cascade never shows emoji (keeps old rng sequence)
    pCopyGlyph: 0.30,    // copy a neighbor's glyph
    pSameFamily: 0.20,   // new glyph from the same family as a neighbor's glyph
    pFresh: 0.12,        // fully fresh random glyph (family uniform, then glyph)
    pKeep: 0.10,         // keep the glyph as is
    // --- style channel (independent of glyph -> glyph/font desync = glitch)
    pCopyStyle: 0.30,    // copy a neighbor's font+weight+italic
    pFreshStyle: 0.12,   // new random font/weight/italic
    pItalic: 0.35,       // chance a fresh style is italic (if the font has italics)
    pFauxItalic: 0.08,   // chance italic is kept even if font has no italic face (synthesized slant)
    coverageBias: 0.92,  // chance a font that lacks the glyph family is swapped for one that has it
    // --- progress -> chaos mapping
    sigmoidMid: 0.62,    // progress at which the pull toward the target is 50%
    sigmoidK: 8,         // sigmoid steepness
    targetMax: 0.97,     // max per-step chance to show the target glyph (just before lock)
    targetPow: 1.3,      // shapes the pull: pT = targetMax * s^targetPow
    lateStyleDamp: 0.55, // style change probs shrink by (1 - damp*s): late = fewer font glitches
    finalPull: 0.6,      // chance/step (scaled by s^3) to snap to finalStyle before lock
    finalStyle: { font: 'Playfair Display', weight: 800, italic: false }, // null = keep whatever it has
    pRelapse: 0.04,      // chance of ONE wrong-glyph step right before final lock
    blurDecay: 0.5,      // blurHint multiplier on steps where nothing changed
    // --- timing (ticks)
    duration: 40,        // per-cell ticks from p=0 to p=1
    staggerSpan: 30,     // spread of per-cell start offsets
    staggerMode: 'diagonal', // 'diagonal' | 'ltr' | 'radial' | 'random'
    staggerJitter: 0.25, // 0..1 random share of the start offset
    blankPow: 2,         // extra pull exponent for blank-target cells (later fade-out)
    blankDelay: 0,       // extra start delay (ticks) for cells whose target is blank: they keep churning, then fade out last
    // --- cascade ripple
    wave: { every: 9, speed: 1.15, width: 2.2, base: 0.42, boost: 0.58 }
  };
  function mergeCfg(over) {
    var c = Object.assign({}, DEFAULT_CFG, over || {});
    c.wave = Object.assign({}, DEFAULT_CFG.wave, (over && over.wave) || {});
    return c;
  }

  /* --------------------------------------------------------- state helpers */
  function sigmoidProgress(p, mid, k) {
    var f = function (x) { return 1 / (1 + Math.exp(-k * (x - mid))); };
    var a = f(0), b = f(1);
    return clamp((f(clamp(p, 0, 1)) - a) / (b - a), 0, 1);
  }
  function nearestWeight(weights, w) {
    var best = weights[0], d = 1e9;
    for (var i = 0; i < weights.length; i++) {
      var dd = Math.abs(weights[i] - w);
      if (dd < d) { d = dd; best = weights[i]; }
    }
    return best;
  }
  function pickFont(family, rng) {
    var cand = FONTS_FOR[family] || [];
    if (!cand.length) cand = FONTS.map(function (f) { return f.index; });
    // utility fonts are rarely chosen where a pretty font also covers the family
    var hasPretty = cand.some(function (ci) { return !FONTS[ci].utility; });
    var wt = function (ci) { var f = FONTS[ci]; return f.w * (f.utility && hasPretty ? 0.3 : 1); };
    var tot = 0, i;
    for (i = 0; i < cand.length; i++) tot += wt(cand[i]);
    var r = rng() * tot;
    for (i = 0; i < cand.length; i++) { r -= wt(cand[i]); if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }
  function randomStyleInto(o, family, rng, cfg) {
    var fi = pickFont(family, rng), f = FONTS[fi];
    o.fontIndex = fi;
    o.weight = f.weights[Math.floor(rng() * f.weights.length)];
    o.italic = f.italic ? rng() < cfg.pItalic : false;
  }
  // relative odds of each family for fully-fresh glyphs (latin-ish families have many pretty fonts -> show more of them)
  var FAMILY_W = { latin: 3, latinExt: 1, greek: 1.5, cyrillic: 1.5, coptic: 0.8, runes: 1.2, math: 1.2, technical: 0.8, dingbats: 0.8, braille: 0.5, geometric: 0.8 };
  var FAMILY_W_TOTAL = FAMILY_NAMES.reduce(function (a, f) { return a + (FAMILY_W[f] || 1); }, 0);
  function randomFamily(rng) {
    var r = rng() * FAMILY_W_TOTAL;
    for (var i = 0; i < FAMILY_NAMES.length; i++) { r -= (FAMILY_W[FAMILY_NAMES[i]] || 1); if (r <= 0) return FAMILY_NAMES[i]; }
    return FAMILY_NAMES[0];
  }
  function randomGlyphEntry(rng, notCh) {
    for (var n = 0; n < 6; n++) {
      var fam = randomFamily(rng);
      var arr = BY_FAMILY[fam], e = arr[Math.floor(rng() * arr.length)];
      if (e.ch !== notCh) return e;
    }
    return POOL[0];
  }
  function pickNeighbor(neighbors, rng, inkOnly) {
    // Recently changed neighbors count double -> style travels along the update wave.
    // inkOnly: skip blank-glyph neighbors (so blankness does not spread by glyph copying).
    var tot = 0, i, n;
    for (i = 0; i < neighbors.length; i++) { n = neighbors[i]; if (n && !(inkOnly && n.glyph === ' ')) tot += n.changed ? 2 : 1; }
    if (!tot) return null;
    var r = rng() * tot;
    for (i = 0; i < neighbors.length; i++) {
      n = neighbors[i]; if (!n || (inkOnly && n.glyph === ' ')) continue;
      r -= n.changed ? 2 : 1;
      if (r <= 0) return n;
    }
    return null;
  }
  var finalCache = new WeakMap();
  function resolveFinal(cfg) {
    if (!cfg.finalStyle) return null;
    var c = finalCache.get(cfg.finalStyle);
    if (c) return c;
    var fs = cfg.finalStyle, fi = fs.font in FONT_INDEX ? FONT_INDEX[fs.font] : 0, f = FONTS[fi];
    c = { fontIndex: fi, weight: nearestWeight(f.weights, fs.weight || 400), italic: !!fs.italic && f.italic };
    finalCache.set(cfg.finalStyle, c);
    return c;
  }
  // Make (font, weight, italic) consistent with glyph family: usually swap in a covering font.
  function fixStyle(o, rng, cfg) {
    var f = FONTS[o.fontIndex];
    if (f.covers.indexOf(o.family) < 0 && rng() < cfg.coverageBias) {
      o.fontIndex = pickFont(o.family, rng);
      f = FONTS[o.fontIndex];
    }
    o.weight = nearestWeight(f.weights, o.weight);
    if (o.italic && !f.italic && rng() >= cfg.pFauxItalic) o.italic = false;
  }

  /**
   * Pure step function. cell: {glyph,family,fontIndex,weight,italic,locked,phase,target,blurHint,changed}.
   * neighborStates: array of neighbor cell states (nulls allowed). progress: 0..1 for THIS cell.
   * Returns a NEW state {glyph,family,fontIndex,weight,italic,locked,blurHint,phase,target,changed}.
   * phase: 0 = resolving, 1 = relapse glitch shown, 2 = locked.
   */
  function nextCellState(cell, neighborStates, progress, rng, cfg) {
    cfg = cfg || DEFAULT_CFG;
    if (cell.locked) return cell;
    var target = cell.target;
    var o = {
      glyph: cell.glyph, family: cell.family, fontIndex: cell.fontIndex, weight: cell.weight,
      italic: cell.italic, locked: false, blurHint: 0, phase: cell.phase || 0, target: target, changed: false
    };
    var fin = resolveFinal(cfg);
    var s = sigmoidProgress(progress, cfg.sigmoidMid, cfg.sigmoidK);

    if (progress >= 1) {
      if (o.phase === 0 && rng() < cfg.pRelapse) {          // one-step relapse glitch
        var e = randomGlyphEntry(rng, target);
        o.glyph = e.ch; o.family = e.family; o.phase = 1;
        randomStyleInto(o, o.family, rng, cfg);
        o.blurHint = 0.5;
      } else {                                               // final lock
        o.glyph = target; o.family = familyOf(target); o.phase = 2; o.locked = true;
        if (fin) { o.fontIndex = fin.fontIndex; o.weight = fin.weight; o.italic = fin.italic; }
        else fixStyle(o, rng, cfg);
        if (isEmoji(o.glyph)) { o.fontIndex = 0; o.weight = 400; o.italic = false; }
        o.blurHint = 0;
      }
      o.changed = o.glyph !== cell.glyph || o.fontIndex !== cell.fontIndex || o.weight !== cell.weight || o.italic !== cell.italic;
      return o;
    }

    var nb = neighborStates || [];
    // ---- glyph channel
    // blank targets pull in later (extra exponent) so background cells keep churning visibly
    var pT = cfg.targetMax * Math.pow(s, cfg.targetPow + (target === ' ' ? cfg.blankPow : 0));
    if (rng() < pT) {
      o.glyph = target; o.family = familyOf(target);
    } else {
      var fade = 1 - s;
      var wCopy = cfg.pCopyGlyph * fade, wFam = cfg.pSameFamily * fade,
          wFresh = cfg.pFresh * fade * fade, wKeep = cfg.pKeep * (1 + 3 * s);
      var r = rng() * (wCopy + wFam + wFresh + wKeep);
      var n = pickNeighbor(nb, rng, true);
      if (r < wCopy) {
        if (n) { o.glyph = n.glyph; o.family = n.family; }
        else { var e1 = randomGlyphEntry(rng, o.glyph); o.glyph = e1.ch; o.family = e1.family; }
      } else if (r < wCopy + wFam) {
        if (n) {
          var arr = BY_FAMILY[n.family] || POOL;
          var e2 = arr[Math.floor(rng() * arr.length)];
          o.glyph = e2.ch; o.family = e2.family;
        } else { var e3 = randomGlyphEntry(rng, o.glyph); o.glyph = e3.ch; o.family = e3.family; }
      } else if (r < wCopy + wFam + wFresh) {
        var e4 = randomGlyphEntry(rng, o.glyph); o.glyph = e4.ch; o.family = e4.family;
      } /* else keep */
      if (cfg.pEmoji > 0 && rng() < cfg.pEmoji * (1 - s)) { o.glyph = EMOJI_POOL[Math.floor(rng() * EMOJI_POOL.length)]; o.family = 'latin'; }
    }
    // ---- style channel (independent roll, independent neighbor)
    var damp = 1 - cfg.lateStyleDamp * s;
    var r2 = rng();
    if (r2 < cfg.pCopyStyle * damp) {
      var m = pickNeighbor(nb, rng);
      if (m) { o.fontIndex = m.fontIndex; o.weight = m.weight; o.italic = m.italic; }
    } else if (r2 < (cfg.pCopyStyle + cfg.pFreshStyle) * damp) {
      randomStyleInto(o, o.family, rng, cfg);
    }
    if (fin && rng() < cfg.finalPull * s * s * s) { o.fontIndex = fin.fontIndex; o.weight = fin.weight; o.italic = fin.italic; }
    fixStyle(o, rng, cfg);
    if (isEmoji(o.glyph)) { o.fontIndex = 0; o.weight = 400; o.italic = false; }   // emoji: fixed neutral style, no cascade

    o.changed = o.glyph !== cell.glyph || o.fontIndex !== cell.fontIndex || o.weight !== cell.weight || o.italic !== cell.italic;
    o.blurHint = o.changed ? clamp(0.3 + 0.7 * (1 - s), 0, 1) : (cell.blurHint || 0) * cfg.blurDecay;
    return o;
  }

  /* --------------------------------------------------------------- CASCADE */
  /** Per-cell start offset (ticks, 0..span). Call once per cell at setup. */
  function staggerStart(i, cols, rows, cfg, rng) {
    var x = i % cols, y = Math.floor(i / cols), v;
    switch (cfg.staggerMode) {
      case 'ltr':    v = cols > 1 ? x / (cols - 1) : 0; break;
      case 'radial': {
        var cx = (cols - 1) / 2, cy = (rows - 1) / 2, mx = Math.hypot(cx, cy) || 1;
        v = Math.hypot(x - cx, y - cy) / mx; break;
      }
      case 'random': v = rng(); break;
      default:       v = (cols + rows) > 2 ? (x + y) / (cols + rows - 2) : 0; // diagonal
    }
    var j = cfg.staggerJitter;
    return cfg.staggerSpan * (v * (1 - j) + rng() * j);
  }
  /** Cell indices sorted by distance from (ox,oy): the order a ripple travels. */
  function cascadeOrder(cols, rows, ox, oy) {
    var idx = [];
    for (var i = 0; i < cols * rows; i++) idx.push(i);
    var d = function (i) { return Math.hypot((i % cols) - ox, Math.floor(i / cols) - oy); };
    idx.sort(function (a, b) { return d(a) - d(b) || a - b; });
    return idx;
  }
  /** Center `lines` in a cols x rows grid -> flat array of graphemes (' ' = blank). Each line is a string
   *  (split into graphemes) or an array of graphemes. Case is preserved exactly (no uppercasing). */
  function layoutText(lines, cols, rows) {
    var out = new Array(cols * rows).fill(' ');
    var y0 = Math.floor((rows - lines.length) / 2);
    lines.forEach(function (ln, li) {
      var gs = Array.isArray(ln) ? ln : splitG(ln);
      var x0 = Math.floor((cols - gs.length) / 2);
      for (var k = 0; k < gs.length; k++) {
        var x = x0 + k, y = y0 + li;
        if (x >= 0 && x < cols && y >= 0 && y < rows) out[y * cols + x] = gs[k];
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------- SIM */
  /**
   * createSim({cols, rows, target: string[] (flat, length cols*rows) | string lines joined with \n,
   *            seed, cfg}) -> sim
   * sim.step() advances one tick, returns changed cell indices. sim.cells = current states.
   * sim.cfg is live-editable (sliders). sim.done true when every cell locked.
   */
  function createSim(opts) {
    var cols = opts.cols, rows = opts.rows, n = cols * rows;
    var cfg = mergeCfg(opts.cfg);
    var rng = createRng(opts.seed == null ? 1 : opts.seed);
    var target = opts.target;
    if (typeof target === 'string') target = layoutText(target.split('\n'), cols, rows);
    else if (Array.isArray(target) && Array.isArray(target[0])) target = layoutText(target, cols, rows);   // array of grapheme lines
    var sim = { cols: cols, rows: rows, cfg: cfg, rng: rng, tick: 0, cells: [], start: [], done: false, waves: [], target: target };

    for (var i = 0; i < n; i++) {
      var e = randomGlyphEntry(rng);
      var c = { glyph: e.ch, family: e.family, fontIndex: 0, weight: 400, italic: false, locked: false, blurHint: 0.6, phase: 0, target: target[i] || ' ', changed: true };
      randomStyleInto(c, c.family, rng, cfg);
      sim.cells.push(c);
      sim.start.push(staggerStart(i, cols, rows, cfg, rng) + (c.target === ' ' ? cfg.blankDelay : 0));
    }

    sim.neighbors = function (i) {
      var x = i % cols, y = Math.floor(i / cols), out = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var xx = x + dx, yy = y + dy;
        out.push(xx >= 0 && xx < cols && yy >= 0 && yy < rows ? sim.cells[yy * cols + xx] : null);
      }
      return out;
    };
    sim.progress = function (i) { return clamp((sim.tick - sim.start[i]) / cfg.duration, 0, 1); };
    sim.totalTicks = function () { return Math.ceil(cfg.staggerSpan + cfg.blankDelay + cfg.duration) + 2; };

    function spawnWave() {
      sim.waves.push({ ox: rng.int(cols), oy: rng.int(rows), t0: sim.tick });
    }
    sim.step = function () {
      var w = cfg.wave, changed = [], k, i;
      sim.tick++;
      if ((sim.tick - 1) % w.every === 0) spawnWave();
      var maxR = (cols + rows) + 3 * w.width;
      sim.waves = sim.waves.filter(function (wv) { return w.speed * (sim.tick - wv.t0) < maxR; });
      var lead = sim.waves[sim.waves.length - 1];
      var order = lead ? cascadeOrder(cols, rows, lead.ox, lead.oy) : cascadeOrder(cols, rows, 0, 0);
      for (k = 0; k < n; k++) sim.cells[k].changed = false;
      var allLocked = true;
      for (k = 0; k < order.length; k++) {
        i = order[k];
        var cell = sim.cells[i];
        if (cell.locked) continue;
        allLocked = false;
        var p = sim.progress(i), act = w.base;
        for (var j = 0; j < sim.waves.length; j++) {
          var wv = sim.waves[j];
          var d = Math.hypot((i % cols) - wv.ox, Math.floor(i / cols) - wv.oy);
          var z = (d - w.speed * (sim.tick - wv.t0)) / w.width;
          act = Math.max(act, w.base + w.boost * Math.exp(-z * z));
        }
        if (p >= 1 || rng() < act) {                     // p>=1 always updates -> guaranteed lock
          var nx = nextCellState(cell, sim.neighbors(i), p, rng, cfg);
          sim.cells[i] = nx;
          if (nx.changed) changed.push(i);
        }
      }
      sim.done = sim.cells.every(function (c) { return c.locked; });
      return changed;
    };
    sim.text = function () { return sim.cells.map(function (c) { return c.glyph; }).join(''); };
    sim.targetText = function () { return target.join(''); };
    return sim;
  }

  /* ----------------------------------------------------------------- ATLAS */
  /**
   * Lazy canvas atlas. Slots of cellPx x cellPx; glyphs drawn white on transparent (tint in shader).
   * getUV(state) -> {u0,v0,u1,v1,x,y,w,h,ready,version}. Re-upload texture whenever atlas.version
   * differs from the version you last uploaded. LRU eviction when full (bumps version).
   * opts: {size=2048, cellPx=96, canvas, flipY=false (true -> GL-style v), onChange, fontScale=0.62,
 *        fallbackWhilePending=false}
   */
  function GlyphAtlas(opts) {
    opts = opts || {};
    this.size = opts.size || 2048;
    this.cellPx = opts.cellPx || 96;
    this.fontScale = opts.fontScale || 0.62;
    this.flipY = !!opts.flipY;
    this.onChange = opts.onChange || null;
    this.fallbackWhilePending = !!opts.fallbackWhilePending; // true: draw fallback font now, redraw when face loads
    this.canvas = opts.canvas || document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.perRow = Math.floor(this.size / this.cellPx);
    this.capacity = this.perRow * this.perRow;
    this.version = 0;
    this.slots = new Map();     // key -> {index, ready, last, key}
    this.free = [];
    for (var i = this.capacity - 1; i >= 0; i--) this.free.push(i);
    this.useClock = 0;
    this.pending = 0;
    this.loadErrors = 0;
  }
  GlyphAtlas.keyOf = function (s) { if (isEmoji(s.glyph)) return s.glyph + '|emoji'; return s.glyph + '|' + s.fontIndex + '|' + s.weight + '|' + (s.italic ? 1 : 0); };
  var EMOJI_STACK = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  /** Cheap one-time probe: does the emoji stack render a real glyph? (width of a probe emoji must be > 0 and differ from the
   *  width of an unassigned code point, which draws tofu/nothing). Cached in _emojiOk. */
  GlyphAtlas.prototype.emojiSupported = function () {
    if (this._emojiOk != null) return this._emojiOk;
    var ok = true;
    try {
      this.ctx.save(); this.ctx.font = '32px ' + EMOJI_STACK;
      var a = this.ctx.measureText('\uD83D\uDE0A').width, b = this.ctx.measureText('\uDBFF\uDFFF').width;
      this.ctx.restore();
      ok = isFinite(a) && a > 0 && a !== b;
    } catch (e) { ok = true; }
    this._emojiOk = ok; return ok;
  };
  /** Advance width in px of one grapheme at `px` (default 100) via canvas measureText. Emoji use the emoji stack. */
  GlyphAtlas.prototype.measure = function (grapheme, style, px) {
    px = px || 100;
    var ctx = this.ctx; ctx.save();
    ctx.font = isEmoji(grapheme) ? px + 'px ' + EMOJI_STACK : canvasFont(style || { fontIndex: 0, weight: 400, italic: false }, px);
    var w = ctx.measureText(grapheme).width; ctx.restore();
    return isFinite(w) ? w : 0;
  };
  GlyphAtlas.prototype._rect = function (index, ready, color) {
    var x = (index % this.perRow) * this.cellPx, y = Math.floor(index / this.perRow) * this.cellPx, S = this.size, c = this.cellPx;
    var v0 = y / S, v1 = (y + c) / S;
    if (this.flipY) { var t = v0; v0 = 1 - v1; v1 = 1 - t; }
    return { u0: x / S, v0: v0, u1: (x + c) / S, v1: v1, x: x, y: y, w: c, h: c, ready: ready, version: this.version, color: !!color };
  };
  GlyphAtlas.prototype._alloc = function () {
    if (this.free.length) return this.free.pop();
    // evict least recently used slot
    var oldest = null;
    this.slots.forEach(function (s) { if (!oldest || s.last < oldest.last) oldest = s; });
    this.slots.delete(oldest.key);
    return oldest.index;
  };
  GlyphAtlas.prototype._draw = function (slot, state) {
    var ctx = this.ctx, c = this.cellPx, x = (slot.index % this.perRow) * c, y = Math.floor(slot.index / this.perRow) * c;
    ctx.save();
    ctx.clearRect(x, y, c, c);
    ctx.beginPath(); ctx.rect(x, y, c, c); ctx.clip();
    var px = Math.round(c * this.fontScale);
    var emo = isEmoji(state.glyph), glyph = state.glyph;
    if (emo && !this.emojiSupported()) { emo = false; glyph = '?'; state = { glyph: '?', fontIndex: 0, weight: 400, italic: false }; }   // failure-only fallback
    slot.color = emo;
    ctx.font = emo ? px + 'px ' + EMOJI_STACK : canvasFont(state, px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    var m = ctx.measureText(glyph);
    var wMax = c * 0.88;
    if (m.width > wMax) { var px2 = Math.max(8, Math.floor(px * wMax / m.width)); ctx.font = emo ? px2 + 'px ' + EMOJI_STACK : canvasFont(state, px2); m = ctx.measureText(glyph); }
    // vertically center on the actual ink box when the browser reports it, else on cap-height guess
    var asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    var base = (asc != null && isFinite(asc) && (asc + desc) > 0) ? (c / 2 + (asc - desc) / 2) : (c / 2 + px * 0.35);
    ctx.fillText(glyph, x + c / 2, y + base);
    ctx.restore();
    this.version++;
    slot.ready = true;
    if (this.onChange) this.onChange(this);
  };
  GlyphAtlas.prototype._fontsReady = function (state) {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.check) return true;
    try { return document.fonts.check(canvasFont(state, 32), state.glyph); } catch (e) { return true; }
  };
  GlyphAtlas.prototype.getUV = function (state) {
    var key = GlyphAtlas.keyOf(state), slot = this.slots.get(key);
    this.useClock++;
    if (slot) { slot.last = this.useClock; return this._rect(slot.index, slot.ready, slot.color); }
    slot = { key: key, index: this._alloc(), ready: false, last: this.useClock };
    this.slots.set(key, slot);
    var snap = { glyph: state.glyph, fontIndex: state.fontIndex, weight: state.weight, italic: state.italic };
    if (isEmoji(snap.glyph) || this._fontsReady(snap)) {   // emoji: system color font, nothing to wait for
      this._draw(slot, snap);
    } else {
      // blank slot (ready:false) until the face (and the right unicode-range subset) has loaded
      var self = this; self.pending++;
      if (this.fallbackWhilePending) this._draw(slot, snap);
      else this.ctx.clearRect((slot.index % this.perRow) * this.cellPx, Math.floor(slot.index / this.perRow) * this.cellPx, this.cellPx, this.cellPx);
      document.fonts.load(canvasFont(snap, 32), snap.glyph).catch(function () { self.loadErrors++; }).then(function () {
        self.pending--;
        if (self.slots.get(key) === slot) self._draw(slot, snap);   // skip if evicted meanwhile
      });
    }
    return this._rect(slot.index, slot.ready, slot.color);
  };
  /** Preload every font (all weights with a latin sample, plus first weight x every covered family so the
   *  right unicode-range subset is fetched: runes, math, braille...). Resolves after timeoutMs at the latest. */
  GlyphAtlas.prototype.warm = function (timeoutMs) {
    if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
    var jobs = [], seen = {};
    function add(spec, text) {
      var k = spec + '|' + text; if (seen[k]) return; seen[k] = 1;
      jobs.push(document.fonts.load(spec, text).catch(function () {}));
    }
    FONTS.forEach(function (f) {
      f.weights.forEach(function (w) {
        add(w + ' 32px "' + f.name + '"', 'A' + BY_FAMILY[f.covers[0]][0].ch);
        if (f.italic) add('italic ' + w + ' 32px "' + f.name + '"', 'A' + BY_FAMILY[f.covers[0]][0].ch);
      });
      f.covers.forEach(function (fam) {
        BY_FAMILY[fam].forEach(function (e, i) { if (i % 6 === 0) add(f.weights[0] + ' 32px "' + f.name + '"', e.ch); });
      });
    });
    var all = Promise.all(jobs);
    var timeout = new Promise(function (res) { setTimeout(res, timeoutMs || 3000); });
    return Promise.race([all, timeout]);
  };
  GlyphAtlas.prototype.stats = function () {
    return { version: this.version, used: this.slots.size, capacity: this.capacity, pending: this.pending, loadErrors: this.loadErrors };
  };
  GlyphAtlas.prototype.clear = function () {
    this.ctx.clearRect(0, 0, this.size, this.size);
    this.slots.clear(); this.free = [];
    for (var i = this.capacity - 1; i >= 0; i--) this.free.push(i);
    this.version++;
  };

  return {
    POOL: POOL, FAMILIES: FAMILIES, FAMILY_NAMES: FAMILY_NAMES, BY_FAMILY: BY_FAMILY, familyOf: familyOf,
    FONTS: FONTS, FONT_INDEX: FONT_INDEX, FAMILY_W: FAMILY_W, FONTS_FOR: FONTS_FOR,
    DEFAULT_CFG: DEFAULT_CFG, mergeCfg: mergeCfg,
    mulberry32: mulberry32, createRng: createRng,
    sigmoidProgress: sigmoidProgress, nextCellState: nextCellState,
    staggerStart: staggerStart, cascadeOrder: cascadeOrder, layoutText: layoutText, createSim: createSim,
    isEmoji: isEmoji, splitGraphemes: splitG, EMOJI_STACK: EMOJI_STACK,
    GlyphAtlas: GlyphAtlas, fontStack: fontStack, canvasFont: canvasFont, googleFontsUrl: googleFontsUrl
  };
});
