/* plan-lanes.js STUB (Phase 0 frozen signature). UMD: PlanLanes global / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlanLanes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* planLanes(rng, rows, cols, opts) -> rounds [{axis: 'row'|'col', moves: [{i, d}]}]. rng() in [0,1). */
  function planLanes(rng, rows, cols, opts) { throw new Error('not implemented'); }
  return { planLanes: planLanes };
});
