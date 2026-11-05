/* lanes-frame.js: lane positions at a wall-clock time. Before window = start layout, after = solved. UMD: LanesFrame. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lanes3.js'));
  else root.LanesFrame = factory(root.Lanes3);
})(typeof self !== 'undefined' ? self : this, function (L3) {
  'use strict';
  function lanesFrame(plan, nowMs, windowStartMs) {
    var t = Math.min(Math.max((nowMs - windowStartMs) / 1000, 0), plan.D + 1);  // t=0: no op started, fills hidden
    return L3.sampleLanes(plan, t);
  }
  return { lanesFrame: lanesFrame };
});
