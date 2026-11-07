'use strict';
/* Fake measurer: width = chars * 10 (grapheme-unaware on purpose, deterministic). */
function fakeMeasure(s) { return String(s).length * 10; }
/* mulberry32 seeded rng -> () => float in [0,1) */
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
module.exports = { fakeMeasure, seededRng };
