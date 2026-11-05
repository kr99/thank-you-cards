/* card-values.js STUB (Phase 0 frozen signature). UMD: CardValues global / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardValues = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* getValues(form) -> values JSON; keys are exactly CardShare.KEYS (derived from BOOLS/NUMS, incl. 'hide'). */
  function getValues(form) { throw new Error('not implemented'); }
  return { getValues: getValues };
});
