/* text-layer.js. UMD. Pure layout of the secondary message: build(cfg, measure) -> {lines, fontPx, scale}. No DOM, no background. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./card-fit.js'), require('./card-text.js'));
  else root.TextLayer = factory(root.CardFit, root.CardText);
})(typeof self !== 'undefined' ? self : this, function (CF, CT) {
  'use strict';
  /* cfg {text, w, h}: strip size in px. measure(str) -> width in px at a 100px font.
   * Returns {lines:[{top,height,glyphs:[{g,left}]}], fontPx, scale}; empty lines for empty text. */
  function build(cfg, measure) {
    if (!cfg.text) return { lines: [], fontPx: 0, scale: 0 };
    var bw = cfg.w * .94, maxPx = Math.max(11, Math.min(30, cfg.h * .36));
    var LH = 1.25, boxH = cfg.h * .92, fitMeasure = function (s) { return measure(s) / 100 * maxPx; };
    var fit = { scale: 1 }, sc, ml;
    for (sc = 1; sc >= .3; sc = Math.round((sc - .05) * 100) / 100) {   // largest scale whose wrapped lines also fit the strip height
      ml = Math.max(1, Math.floor(boxH / (LH * maxPx * sc)));
      fit = CF.fitText(cfg.text, bw, fitMeasure, { maxLines: ml, minScale: sc });
      if (fit.lines.length <= ml) break;
    }
    var lay = CT.secondaryLayout(cfg.text, { w: bw, h: boxH * 4 }, { advanceFn: measure, fontPx: 100, maxScale: maxPx * fit.scale / 100, minScale: maxPx * fit.scale / 100, maxLines: 99, lineHeight: LH });
    var top = Math.max(0, (cfg.h - lay.height) / 2), left = (cfg.w - bw) / 2;
    return {
      fontPx: 100 * lay.scale, scale: lay.scale,
      lines: lay.lines.map(function (gs, li) {
        return { top: top + li * lay.lineHeight, height: lay.lineHeight, glyphs: gs.map(function (g, k) { return { g: g, left: left + lay.positions[li].x[k] }; }) };
      })
    };
  }
  return { build: build };
});
