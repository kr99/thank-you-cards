/* bg-layer.js. UMD. Thin wrapper over CircuitBG: owns variant/seed/palette/draw. No text knowledge; CB is injected. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Background = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function create(CB, opts) {
    var inst = CB.create(opts), layer = { canvas: inst.canvas, inst: inst, palette: 'tron' };
    function has(f) { return typeof inst[f] === 'function'; }
    layer.setPalette = function (n) {
      n = n || 'tron';
      if (!(CB.palettes && Object.prototype.hasOwnProperty.call(CB.palettes, n))) n = 'tron';
      layer.palette = n;
      if (has('setPalette')) { try { inst.setPalette(n); } catch (e) { layer.palette = 'tron'; } }
    };
    layer.setVariant = function (v) { inst.setVariant(v); layer.setPalette(layer.palette); };
    layer.setSeed = function (n) { if (has('setSeed')) inst.setSeed(n); };
    layer.draw = function (t) { inst.update(t); return layer.canvas; };
    return layer;
  }
  return { create: create };
});
