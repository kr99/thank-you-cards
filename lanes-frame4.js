/* lanes-frame4.js: lanes4 plan + time(s) -> per-cube {id,x,y,vx,vy,s} for app.js put(). UMD: LanesFrame4.
   s = edge clip: 1 when the cell is >= half on board, fades to 0 as it leaves (x,y in cell units, v in cells/s). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lanes4.js'));
  else root.LanesFrame4 = factory(root.Lanes4);
})(typeof self !== 'undefined' ? self : this, function (L4) {
  'use strict';
  var EPS = 1 / 120;
  function edge(p, n) { return Math.min(1, Math.max(0, Math.min(p + 1, n - p) / 0.5)); }
  function lanesFrame4(plan, tSec) {
    var t = Math.min(Math.max(tSec, 0), plan.T), t0 = Math.max(0, t - EPS), t1 = Math.min(plan.T, t + EPS);
    var a = L4.sampleLanes4(plan, t0), b = L4.sampleLanes4(plan, t1), cur = L4.sampleLanes4(plan, t), bi = {}, i, out = [], dt = t1 - t0 || 1;
    for (i = 0; i < b.length; i++) bi[b[i].id != null ? b[i].id : i] = b[i];
    for (i = 0; i < cur.length; i++) {
      var c = cur[i], id = c.id != null ? c.id : i, pa = a[i] && (a[i].id != null ? a[i].id : i) === id ? a[i] : c, pb = bi[id] || c;
      out.push({ id: id, x: c.x, y: c.y, vx: (pb.x - pa.x) / dt, vy: (pb.y - pa.y) / dt, s: Math.min(edge(c.x, plan.C), edge(c.y, plan.R)) });
    }
    return out;
  }
  return { lanesFrame4: lanesFrame4 };
});
