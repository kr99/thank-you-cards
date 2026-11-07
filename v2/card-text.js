/* card-text.js - DOM-free pure text helpers for the glass card: grapheme splitting, message parsing,
 * standard-spacing layout, fit, slide, secondary message. Global CardText / CommonJS. Measurement is injected
 * as advanceFn(grapheme, styleKey) -> px so everything runs in node with a fake. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- GRAPHEMES */
  var segmenter = null;
  try { if (typeof Intl !== 'undefined' && Intl.Segmenter) segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { segmenter = null; }

  // Regex fallback: keycap | flag pair | pictographic + (VS|tone)* + (ZWJ pictographic (VS|tone)*)* | any code point + marks/VS/tone.
  var FALLBACK_RE = null;
  try {
    var PIC = '\\p{Extended_Pictographic}[\\uFE0E\\uFE0F\\u{1F3FB}-\\u{1F3FF}]*';
    FALLBACK_RE = new RegExp(
      '[0-9#*]\\uFE0F?\\u20E3' +
      '|\\p{Regional_Indicator}\\p{Regional_Indicator}' +
      '|' + PIC + '(?:\\u200D' + PIC + ')*' +
      '|[\\s\\S][\\p{M}\\uFE0E\\uFE0F\\u{1F3FB}-\\u{1F3FF}\\u200D]*', 'gu');
  } catch (e) { FALLBACK_RE = null; }

  /** segment(str, {forceFallback}) -> grapheme clusters (never throws; non-strings are coerced). */
  function segment(str, o) {
    try {
      str = (typeof str === 'string') ? str : (str == null ? '' : String(str));
      if (!str) return [];
      if (segmenter && !(o && o.forceFallback)) {
        var out = [], it = segmenter.segment(str)[Symbol.iterator](), r;
        while (!(r = it.next()).done) out.push(r.value.segment);
        return out;
      }
      if (FALLBACK_RE) { FALLBACK_RE.lastIndex = 0; return str.match(FALLBACK_RE) || []; }
      return Array.from(str);
    } catch (e) { return []; }
  }

  var EMOJI_RE = null;
  try { EMOJI_RE = new RegExp('\\p{Emoji_Presentation}|\\p{Regional_Indicator}|\\p{Extended_Pictographic}[\\uFE0F\\u{1F3FB}-\\u{1F3FF}\\u200D]|^[0-9#*]\\uFE0F?\\u20E3$', 'u'); } catch (e) { EMOJI_RE = null; }
  /** true for color-emoji graphemes (not for plain digits, (c), (R), TM). */
  function isEmoji(g) { return !!EMOJI_RE && typeof g === 'string' && g.length > 0 && EMOJI_RE.test(g); }

  /* ------------------------------------------------------------------ PARSING */
  var JUNK = null, BAD_ZWJ = null, LONE_SURR = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  try {
    // zero-width / bidi / soft-hyphen / BOM junk (ZWJ and VS handled separately)
    JUNK = /[­͏؜ᅟᅠ឴឵᠎​‌‎‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ]/g;
    BAD_ZWJ = new RegExp('(?<![\\p{Extended_Pictographic}\\uFE0F\\u{1F3FB}-\\u{1F3FF}])\\u200D|\\u200D(?![\\p{Extended_Pictographic}])', 'gu');
  } catch (e) { BAD_ZWJ = null; }
  var CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
  var INPUT_CAP = 4000;   // hard bound on work for pathological input

  function clean(str) {
    var s;
    try { s = (typeof str === 'string') ? str : (str == null ? '' : String(str)); } catch (e) { s = ''; }
    var cut = false;
    if (s.length > INPUT_CAP) { s = s.slice(0, INPUT_CAP); cut = true; }
    s = s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(LONE_SURR, '').replace(CTRL, '');
    if (JUNK) s = s.replace(JUNK, '');
    if (BAD_ZWJ) s = s.replace(BAD_ZWJ, '');
    s = s.replace(/(^|\n)[︀-️]+/g, '$1');   // stray variation selectors with nothing to modify
    return { s: s, cut: cut };
  }
  function isBlank(gs) { for (var i = 0; i < gs.length; i++) if (!/^\s+$/.test(gs[i])) return false; return true; }
  function trimLine(gs) {
    var a = 0, b = gs.length;
    while (a < b && /^\s+$/.test(gs[a])) a++;
    while (b > a && /^\s+$/.test(gs[b - 1])) b--;
    return gs.slice(a, b);
  }

  /** parseMessage(str, {maxLines=3, maxGraphemesPerLine=40, maxTotal=120}) -> {lines:[[grapheme..]..], truncated}. Never throws. */
  function parseMessage(str, o) {
    o = o || {};
    var maxLines = o.maxLines > 0 ? Math.floor(o.maxLines) : 3;
    var perLine = o.maxGraphemesPerLine > 0 ? Math.floor(o.maxGraphemesPerLine) : 40;
    var maxTotal = o.maxTotal > 0 ? Math.floor(o.maxTotal) : 120;
    var c = clean(str), truncated = c.cut;
    var lines = c.s.split('\n').map(function (l) { return trimLine(segment(l)); });
    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); truncated = true; }
    var total = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].length > perLine) { lines[i] = trimLine(lines[i].slice(0, perLine)); truncated = true; }
      if (total + lines[i].length > maxTotal) { lines[i] = trimLine(lines[i].slice(0, Math.max(0, maxTotal - total))); lines.length = i + 1; truncated = true; }
      total += lines[i].length;
    }
    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
    return { lines: lines, truncated: truncated };
  }

  /* ------------------------------------------------------------------ LAYOUT */
  function num(x) { return (typeof x === 'number' && isFinite(x)) ? x : 0; }
  /** layoutLine(advances[], {gap=0, tracking=0, align='center', maxWidth}) -> {x:[left edge per glyph], total, offset}.
   *  x[i+1] = x[i] + advances[i] + gap + tracking. With maxWidth: left=0, center=(maxWidth-total)/2, right=maxWidth-total.
   *  Without maxWidth: left=0, center=-total/2 (centered on origin), right=-total. */
  function layoutLine(advances, o) {
    o = o || {};
    var n = advances ? advances.length : 0, step = num(o.gap) + num(o.tracking), total = 0, i;
    for (i = 0; i < n; i++) total += Math.max(0, num(advances[i]));
    if (n > 1) total += (n - 1) * step;
    var al = o.align || 'center', mw = (typeof o.maxWidth === 'number' && isFinite(o.maxWidth)) ? o.maxWidth : null;
    var box = mw == null ? 0 : mw;
    var off = al === 'left' ? 0 : al === 'right' ? (mw == null ? -total : box - total) : (mw == null ? -total / 2 : (box - total) / 2);
    var x = [], cur = off;
    for (i = 0; i < n; i++) { x.push(cur); cur += Math.max(0, num(advances[i])) + step; }
    return { x: x, total: total, offset: off };
  }

  function lineAdvances(gs, advanceFn, styleKey) {
    return gs.map(function (g) { return Math.max(0, num(advanceFn(g, styleKey))); });
  }
  /** fitScale(lines, advanceFn, box{w,h}, {styleKey, gap, tracking, lineHeight=1.2, fontPx=1, maxScale=Infinity, minScale=0})
   *  advanceFn measures at fontPx. Returns the largest scale (<= maxScale) such that the widest line fits box.w and
   *  lines.length * lineHeight * fontPx * scale fits box.h. Empty content -> min(maxScale, 1). */
  function fitScale(lines, advanceFn, box, o) {
    o = o || {};
    var lh = o.lineHeight > 0 ? o.lineHeight : 1.2, fp = o.fontPx > 0 ? o.fontPx : 1, maxS = o.maxScale > 0 ? o.maxScale : Infinity;
    var wMax = 0, n = lines ? lines.length : 0;
    for (var i = 0; i < n; i++) {
      var t = layoutLine(lineAdvances(lines[i], advanceFn, o.styleKey), { gap: o.gap, tracking: o.tracking }).total;
      if (t > wMax) wMax = t;
    }
    var s = maxS;
    if (wMax > 0) s = Math.min(s, num(box && box.w) / wMax);
    if (n > 0) s = Math.min(s, num(box && box.h) / (n * lh * fp));
    if (!isFinite(s)) s = 1;
    if (o.minScale > 0) s = Math.max(s, o.minScale);
    return Math.max(0, s);
  }

  /* ------------------------------------------------------------------ SLIDE */
  var EASE = {
    linear: function (t) { return t; },
    easeInQuad: function (t) { return t * t; },
    easeOutQuad: function (t) { return t * (2 - t); },
    easeInOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    easeOutCubic: function (t) { var u = 1 - t; return 1 - u * u * u; },
    easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOutQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    smoothstep: function (t) { return t * t * (3 - 2 * t); }
  };
  /** ease(name, t) -> eased t in [0,1] (unknown name -> easeInOutCubic). All eases are monotone, ease(0)=0, ease(1)=1. */
  function ease(name, t) {
    t = num(t); t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (t === 0 || t === 1) return t;
    return (EASE[name] || EASE.easeInOutCubic)(t);
  }
  function lerpItem(a, b, e) {
    if (typeof a === 'number') return a + (b - a) * e;
    var o = {}, k;
    for (k in b) o[k] = (typeof a[k] === 'number' && typeof b[k] === 'number') ? a[k] + (b[k] - a[k]) * e : b[k];
    return o;
  }
  /** slide(from[], to[], t, easeName='easeInOutCubic') -> positions. Items are numbers or {x,y,...} objects.
   *  t<=0 returns a copy of from, t>=1 a copy of to (exact). Length = min(from.length, to.length). */
  function slide(from, to, t, easeName) {
    var n = Math.min(from ? from.length : 0, to ? to.length : 0), out = [], i;
    t = num(t);
    if (t <= 0) { for (i = 0; i < n; i++) out.push(typeof from[i] === 'number' ? from[i] : lerpItem(from[i], from[i], 0)); return out; }
    if (t >= 1) { for (i = 0; i < n; i++) out.push(typeof to[i] === 'number' ? to[i] : lerpItem(to[i], to[i], 0)); return out; }
    var e = ease(easeName || 'easeInOutCubic', t);
    for (i = 0; i < n; i++) out.push(lerpItem(from[i], to[i], e));
    return out;
  }

  /* -------------------------------------------------------------- SECONDARY */
  function wrap(gs, widthOf, maxW) {
    // greedy by words; a word wider than the line (or a script with no spaces) is broken by graphemes
    var words = [], cur = [], i;
    for (i = 0; i < gs.length; i++) {
      if (/^\s+$/.test(gs[i])) { if (cur.length) { words.push(cur); cur = []; } }
      else cur.push(gs[i]);
    }
    if (cur.length) words.push(cur);
    var lines = [], line = [], w = 0, sp = widthOf(' ');
    function flush() { if (line.length) lines.push(line); line = []; w = 0; }
    words.forEach(function (word) {
      var ww = 0; word.forEach(function (g) { ww += widthOf(g); });
      if (ww > maxW) {
        flush();
        word.forEach(function (g) {
          var gw = widthOf(g);
          if (w + gw > maxW && line.length) flush();
          line.push(g); w += gw;
        });
        return;
      }
      var add = line.length ? sp + ww : ww;
      if (line.length && w + add > maxW) { flush(); add = ww; }
      if (line.length) line.push(' ');
      line = line.concat(word); w += add;
    });
    flush();
    return lines;
  }
  /** secondaryLayout(str, box{w,h}, {advanceFn, styleKey, fontPx=1, maxScale=1, minScale=0.5, maxLines=2, lineHeight=1.2, gap, tracking, align})
   *  -> {lines:[[g..]..], positions:[{x:[..],total}..], scale, lineHeight(px, scaled), height, truncated}.
   *  Largest scale in [minScale,maxScale] (steps of 0.05) where words wrap to <= maxLines and fit box.h; otherwise
   *  clamps to minScale and truncates the last line with an ellipsis (truncated:true). */
  function secondaryLayout(str, box, o) {
    o = o || {};
    var adv = o.advanceFn || function () { return 1; };
    var maxLines = o.maxLines > 0 ? Math.floor(o.maxLines) : 2, lh = o.lineHeight > 0 ? o.lineHeight : 1.2, fp = o.fontPx > 0 ? o.fontPx : 1;
    var maxS = o.maxScale > 0 ? o.maxScale : 1, minS = o.minScale > 0 ? Math.min(o.minScale, maxS) : Math.min(0.5, maxS);
    var c = clean(str), truncated = c.cut;
    /* Typed line breaks are kept: each typed line is word-wrapped on its own, then the line lists are joined. */
    var parts = c.s.split(/\n+/).map(function (p) { return segment(p); }).filter(function (p) { return !isBlank(p); });
    var gs = [].concat.apply([], parts);
    function wrapAll(widthOf, maxW) { var out = []; parts.forEach(function (p) { out = out.concat(wrap(p, widthOf, maxW)); }); return out; }
    var bw = num(box && box.w), bh = num(box && box.h);
    if (!gs.length || !(bw > 0)) return { lines: [], positions: [], scale: maxS, lineHeight: lh * fp * maxS, height: 0, truncated: truncated };
    var lines = [], s = maxS, found = false;
    for (; s >= minS - 1e-9; s -= 0.05) {
      var sc = Math.max(s, minS), L = wrapAll(function (g) { return Math.max(0, num(adv(g, o.styleKey))) * sc + (num(o.gap) + num(o.tracking)) * sc; }, bw);
      if (L.length <= maxLines && L.length * lh * fp * sc <= bh + 1e-9) { lines = L; s = sc; found = true; break; }
      if (sc === minS) break;
    }
    if (!found) {
      s = minS;
      lines = wrapAll(function (g) { return Math.max(0, num(adv(g, o.styleKey))) * s + (num(o.gap) + num(o.tracking)) * s; }, bw);
      if (lines.length > maxLines) {
        truncated = true; lines = lines.slice(0, maxLines);
        var last = lines[maxLines - 1].slice(), wid = function (g) { return Math.max(0, num(adv(g, o.styleKey))) * s; };
        var tw = function (a) { var t = 0; a.forEach(function (g) { t += wid(g); }); return t; };
        while (last.length && tw(last) + wid('…') > bw) last.pop();
        while (last.length && /^\s+$/.test(last[last.length - 1])) last.pop();
        last.push('…'); lines[maxLines - 1] = last;
      }
    }
    var positions = lines.map(function (l) {
      var r = layoutLine(l.map(function (g) { return Math.max(0, num(adv(g, o.styleKey))) * s; }), { gap: num(o.gap) * s, tracking: num(o.tracking) * s, align: o.align || 'center', maxWidth: bw });
      return { x: r.x, total: r.total };
    });
    return { lines: lines, positions: positions, scale: s, lineHeight: lh * fp * s, height: lines.length * lh * fp * s, truncated: truncated };
  }

  return {
    segment: segment, isEmoji: isEmoji, parseMessage: parseMessage, layoutLine: layoutLine, fitScale: fitScale,
    slide: slide, ease: ease, EASES: Object.keys(EASE), secondaryLayout: secondaryLayout
  };
});
