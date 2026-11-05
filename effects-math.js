/* effects-math.js - DOM-free pure effect math: radial wave intensity and layered parallax offsets.
 * Global EffectsMath / CommonJS. Coordinates are board units (col,row); origin may be off-board. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EffectsMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAU = 2 * Math.PI;
  var PARALLAX_LAYERS = 3;
  var DONE_TAIL_WIDTHS = 4; // front tail beyond farthest corner, in widths (exp(-16) ~ 1e-7)

  /* Intensity 0..1 of cell (col,row) at time t for a wave from {x,y} at speed v.
   * Front radius r = v*t. Ahead of front: 0. Behind front: gaussian bump on s = r - dist,
   * modulated by a cosine ripple of wavelength lambda; bump decays with s. */
  function waveAt(col, row, o, t) {
    var r = o.v * t;
    if (t < 0) return 0;
    var width = o.width === undefined ? 1.2 : o.width;
    var lambda = o.lambda === undefined ? 2 : o.lambda;
    var s = r - Math.hypot(col - o.x, row - o.y);
    if (s < 0) return 0;
    var envelope = Math.exp(-((s / width) * (s / width)));
    var ripple = 0.5 + 0.5 * Math.cos((TAU * s) / lambda);
    return envelope * ripple;
  }

  /* True once the front has passed the farthest corner by enough that intensity is negligible. */
  function waveDone(rows, cols, o, t) {
    var width = o.width === undefined ? 1.2 : o.width;
    var farthest = Math.max(
      Math.hypot(0 - o.x, 0 - o.y),
      Math.hypot(cols - 1 - o.x, 0 - o.y),
      Math.hypot(0 - o.x, rows - 1 - o.y),
      Math.hypot(cols - 1 - o.x, rows - 1 - o.y)
    );
    return o.v * t - farthest >= DONE_TAIL_WIDTHS * width;
  }

  /* Mulberry32: small seeded PRNG returning floats in [0,1). */
  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var n = a;
      n = Math.imul(n ^ (n >>> 15), n | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Per-cell offsets, row-major, length rows*cols. Each cell is assigned a depth layer
   * (seeded). Envelope s = sin(pi*u) is forced to exactly 0 at u<=0 and u>=1 so the
   * end state is unchanged. dx: near layers move +, far layers move - (opposite sign),
   * magnitude grows with depth. dz: depth offset. dy: 0 (horizontal parallax only). */
  function parallaxOffsets(rows, cols, amp, u, seed) {
    var rnd = seededRandom(seed);
    var s = u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
    var out = [];
    for (var i = 0; i < rows * cols; i++) {
      var layer = Math.floor(rnd() * PARALLAX_LAYERS);
      var depth = (layer + 1) / PARALLAX_LAYERS;
      out.push({
        dx: amp * (2 * depth - 1) * s,
        dy: 0,
        dz: amp * depth * s,
      });
    }
    return out;
  }

  return { waveAt: waveAt, waveDone: waveDone, parallaxOffsets: parallaxOffsets };
});
