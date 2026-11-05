/* card-fit.js. UMD: CardFit global / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardFit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STEP = 0.05;

  /* Greedy word wrap of one paragraph; width of s is measure(s) * scale. Over-wide words are split by characters. */
  function wrapPara(p, maxW, measure, scale) {
    var out = [], cur = '', words = p.split(/\s+/).filter(Boolean);
    function w(s) { return measure(s) * scale; }
    words.forEach(function (word) {
      var next = cur ? cur + ' ' + word : word;
      if (w(next) <= maxW + 1e-9) { cur = next; return; }
      if (cur) { out.push(cur); cur = ''; }
      while (w(word) > maxW + 1e-9 && word.length > 1) {
        var k = word.length - 1;
        while (k > 1 && w(word.slice(0, k)) > maxW + 1e-9) k--;
        out.push(word.slice(0, k)); word = word.slice(k);
      }
      cur = word;
    });
    if (cur) out.push(cur);
    return out;
  }

  /* fitText(text, maxW, measure, {maxLines, minScale}) -> {lines, scale}. measure(str) -> px at scale 1.
   * Wraps by measured width; while lines > maxLines the scale is reduced stepwise and the text re-wrapped, down to minScale. */
  function fitText(text, maxW, measure, opts) {
    opts = opts || {};
    var maxLines = opts.maxLines > 0 ? opts.maxLines : 2, minScale = opts.minScale > 0 ? Math.min(opts.minScale, 1) : 0.5;
    var paras = String(text == null ? '' : text).split(/\n/).filter(function (p) { return p.trim(); });
    function wrapAll(s) { return [].concat.apply([], paras.map(function (p) { return wrapPara(p, maxW, measure, s); })); }
    var s = 1, lines = wrapAll(s);
    while (lines.length > maxLines && s > minScale + 1e-9) {
      s = Math.max(minScale, Math.round((s - STEP) * 1e6) / 1e6);
      lines = wrapAll(s);
    }
    return { lines: lines, scale: s };
  }

  /* Pure vertical layout in grid-cell units: m1 (primary, rows + 0.8) above m2 (secondary strip), disjoint by construction.
   * m2 strip height grows with message length (about 60 chars per extra line). */
  function layoutBoxes(o) {
    var rows = o.rows > 0 ? o.rows : 1, n = o.m2Chars > 0 ? o.m2Chars : 0;
    var m1h = rows + 0.8, m2h = n ? 1.5 + 0.4 * Math.max(0, Math.ceil(n / 60) - 2) : 0;
    return { m1: { y: 0, h: m1h }, m2: { y: m1h, h: m2h }, total: m1h + m2h };
  }

  return { fitText: fitText, layoutBoxes: layoutBoxes };
});
