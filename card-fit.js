/* card-fit.js STUB (Phase 0 frozen signature). UMD: CardFit global / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardFit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* fitText(text, maxW, measure, {maxLines, minScale}) -> {lines: string[], scale: number}. measure(str) -> px at scale 1. */
  function fitText(text, maxW, measure, opts) { throw new Error('not implemented'); }
  return { fitText: fitText };
});
