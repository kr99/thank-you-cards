/* card-share.js: pure, DOM-free helpers for share tokens and pointer mapping. UMD: CardShare global / module.exports.
   Hash tokens (bare only; the artifact host drops ?query and #key=value):
     #clean  #debug  #reduced  #c.<base64url of UTF-8 JSON>   joined with '~' e.g. #clean~reduced~c.eyJt...  */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BGS = ['die', 'pcb', 'veins', 'magitech'];
  var S2 = ['off', 'fade', 'decode'], LAYS = ['grid', 'tight'];
  var MAX_TOKEN = 6000, MAX_HASH = 6200, MAX_JSON = 4500, MAX_FRAGMENT = 1800;
  var MAX_MSG = 160, MAX_LINES = 3, MAX_MSG2 = 120, MAX_LINES2 = 2;
  var BOOLS = ['letters', 'cubes', 'linked', 'lanes', 'sweep', 'hide', 'crawl', 'blur', 'runes', 'cpulse', 'pvar'];
  /* seed = simulation (glyph cascade) seed; cseed = circuit layout seed. spd/crawlK/blurPx: clamped numbers, 3 decimals. */
  var NUMS = [{ k: 'spd', lo: 0.05, hi: 2 }, { k: 'crawlK', lo: 0.001, hi: 1 }, { k: 'blurPx', lo: 0, hi: 6 }];

  /* ---- graphemes ---- */
  var seg = null;
  try { if (typeof Intl !== 'undefined' && Intl.Segmenter) seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { seg = null; }
  function isExtender(cp) {
    return cp === 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0x0300 && cp <= 0x036F) || (cp >= 0x1F3FB && cp <= 0x1F3FF) ||
      (cp >= 0xE0020 && cp <= 0xE007F) || cp === 0x20E3 || (cp >= 0x1AB0 && cp <= 0x1AFF) || (cp >= 0x20D0 && cp <= 0x20FF);
  }
  function graphemes(str) {
    var out = [], i;
    if (seg) { var it = seg.segment(str); for (var x of it) out.push(x.segment); return out; }
    var cps = Array.from(str), prevZwj = false;
    for (i = 0; i < cps.length; i++) {
      var cp = cps[i].codePointAt(0);
      if (out.length && (isExtender(cp) || prevZwj)) out[out.length - 1] += cps[i]; else out.push(cps[i]);
      prevZwj = cp === 0x200D;
    }
    return out;
  }
  /* control chars, bidi overrides/isolates, line/para separators, BOM -> removed ('\n' handled before) */
  var BAD = new RegExp('[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F\\u200E\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g');

  /* -> {text, droppedLines, truncated}. Case preserved. Lines trimmed, blank lines dropped. */
  function sanitizeInfo(s, maxLines, maxG) {
    s = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(BAD, '');
    var lines = s.split('\n').map(function (l) { return l.replace(/ {2,}/g, ' ').trim(); }).filter(Boolean);
    var dropped = lines.length > maxLines; if (dropped) lines = lines.slice(0, maxLines);
    var text = lines.join('\n'), g = graphemes(text), truncated = false;
    if (g.length > maxG) { text = g.slice(0, maxG).join('').trim(); truncated = true; }
    return { text: text, droppedLines: dropped, truncated: truncated };
  }
  function sanitizeMessage(s) { return sanitizeInfo(s, MAX_LINES, MAX_MSG).text; }
  function sanitizeMessage2(s) { return sanitizeInfo(s, MAX_LINES2, MAX_MSG2).text; }
  function clampInt(n, lo, hi) { n = Math.floor(+n); if (!isFinite(n)) return null; return Math.max(lo, Math.min(hi, n)); }

  /* Seed text -> integer 0..999999999: integer-looking text is used as is (clamped), anything else is FNV-1a hashed; empty -> null. */
  function parseSeed(t) {
    t = String(t == null ? '' : t).trim(); if (!t) return null;
    if (/^-?\d+$/.test(t)) return Math.min(999999999, Math.abs(parseInt(t, 10)));
    var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h % 1000000000;
  }
  /* Whitelist copy into a fresh object: unknown keys dropped, values clamped. Never throws. */
  function validate(o) {
    var out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    if (typeof o.m === 'string') { var m = sanitizeMessage(o.m); if (m) out.m = m; }
    if (typeof o.m2 === 'string') { var m2 = sanitizeMessage2(o.m2); if (m2) out.m2 = m2; }
    if (typeof o.s2 === 'string' && S2.indexOf(o.s2) >= 0) out.s2 = o.s2;
    if (typeof o.lay === 'string' && LAYS.indexOf(o.lay) >= 0) out.lay = o.lay;
    if (typeof o.bg === 'string' && BGS.indexOf(o.bg) >= 0) out.bg = o.bg;
    if (typeof o.pal === 'string' && /^[a-z0-9_-]{1,24}$/.test(o.pal)) out.pal = o.pal;
    if (o.seed != null && typeof o.seed !== 'object') { var sd = clampInt(o.seed, 0, 999999); if (sd !== null) out.seed = sd; }
    NUMS.forEach(function (k) { var v = o[k.k], n = +v; if (v != null && typeof v === 'number' && isFinite(n)) out[k.k] = Math.round(Math.max(k.lo, Math.min(k.hi, n)) * 1000) / 1000; });
    if (o.cseed != null && typeof o.cseed !== 'object') { var cs = clampInt(o.cseed, 0, 999999999); if (cs !== null) out.cseed = cs; }
    BOOLS.forEach(function (k) { if (typeof o[k] === 'boolean') out[k] = o[k]; else if (o[k] === 0 || o[k] === 1) out[k] = !!o[k]; });
    return out;
  }

  /* ---- UTF-8 <-> base64url ---- */
  function toBytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return Uint8Array.from(Buffer.from(str, 'utf8'));
  }
  function fromBytes(u8) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
    return Buffer.from(u8).toString('utf8');
  }
  function b64uEncode(str) {
    var u8 = toBytes(str), b;
    if (typeof Buffer !== 'undefined') b = Buffer.from(u8).toString('base64');
    else { var bin = ''; for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]); b = btoa(bin); }
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
    var b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    try {
      var u8;
      if (typeof Buffer !== 'undefined') u8 = Uint8Array.from(Buffer.from(b, 'base64'));
      else { var bin = atob(b); u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); }
      return fromBytes(u8);
    } catch (e) { return null; }
  }

  /* -> 'c.<token>' */
  function encodeConfig(cfg) { return 'c.' + b64uEncode(JSON.stringify(validate(cfg))); }
  /* 'c.<token>' or bare '<token>' (old and new format) -> validated object, or null if malformed/oversize */
  function decodeConfig(tok) {
    if (typeof tok !== 'string') return null;
    if (tok.indexOf('c.') === 0) tok = tok.slice(2);
    if (!tok || tok.length > MAX_TOKEN) return null;
    var js = b64uDecode(tok); if (js == null || js.length > MAX_JSON) return null;
    var o; try { o = JSON.parse(js); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return validate(o);
  }

  /* '#clean~c.xxx' (with or without '#') -> {clean, debug, reduced, config}. Any '=' or oversize: ignored entirely; bogus parts skipped. Never throws. */
  function parseHash(h) {
    var r = { clean: false, debug: false, reduced: false, config: null };
    try {
      if (typeof h !== 'string') return r;
      if (h.charAt(0) === '#') h = h.slice(1);
      if (!h || h.length > MAX_HASH || h.indexOf('=') >= 0) return r;
      h.split('~').forEach(function (t) {
        if (!/^[A-Za-z0-9._-]+$/.test(t)) return;
        if (t === 'clean') r.clean = true;
        else if (t === 'debug') r.debug = true;
        else if (t === 'reduced') r.reduced = true;
        else if (t.indexOf('c.') === 0) { var c = decodeConfig(t); if (c) r.config = c; }
      });
      if (r.config && r.config.hide) r.clean = true;
    } catch (e) { /* ignore */ }
    return r;
  }

  /* Fragment WITHOUT '#' (kept for the hub / older callers). */
  function buildHash(cfg, flags) {
    var p = [];
    flags = flags || {};
    if (flags.clean) p.push('clean');
    if (flags.reduced) p.push('reduced');
    p.push(encodeConfig(cfg));
    return p.join('~');
  }
  /* Fragment WITH leading '#': '#c.<token>' or '#clean~c.<token>'. */
  function buildFragment(state, opts) {
    var p = [];
    if (opts && opts.clean) p.push('clean');
    p.push(encodeConfig(state));
    return '#' + p.join('~');
  }
  /* -> {fragment, length, tooLong}; tooLong when length > MAX_FRAGMENT (about 1800). */
  function buildFragmentChecked(state, opts) {
    var f = buildFragment(state, opts);
    return { fragment: f, length: f.length, tooLong: f.length > MAX_FRAGMENT };
  }

  /* Pointer (px,py CSS px within the canvas box of w x h) -> background uv, 0..1, origin top-left.
     Inverse of the shader's uv=(su-.5)*uCover+.5 (su bottom-left origin, texture flipped so canvas top = v 0). */
  function pointerToUV(px, py, w, h, cover) {
    if (!(w > 0) || !(h > 0)) return null;
    var cx = cover && cover.x > 0 ? cover.x : 1, cy = cover && cover.y > 0 ? cover.y : 1;
    var u = (px / w - 0.5) * cx + 0.5, v = (py / h - 0.5) * cy + 0.5;
    return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
  }
  function coverFor(w, h) { var a = w / h; return { x: a > 1 ? 1 : a, y: a > 1 ? 1 / a : 1 }; }

  return { BGS: BGS, S2: S2, LAYS: LAYS, MAX_MSG: MAX_MSG, MAX_LINES: MAX_LINES, MAX_MSG2: MAX_MSG2, MAX_LINES2: MAX_LINES2, MAX_FRAGMENT: MAX_FRAGMENT,
    parseSeed: parseSeed, sanitizeMessage: sanitizeMessage, sanitizeMessage2: sanitizeMessage2, sanitizeInfo: sanitizeInfo, graphemes: graphemes, buildFragment: buildFragment, buildFragmentChecked: buildFragmentChecked, validate: validate, encodeConfig: encodeConfig, decodeConfig: decodeConfig,
    parseHash: parseHash, buildHash: buildHash, pointerToUV: pointerToUV, coverFor: coverFor };
});
