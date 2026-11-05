/* card-values.js: pure form->values JSON. UMD: CardValues global / module.exports. Needs CardShare (global or require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./card-share.js'));
  else root.CardValues = factory(root.CardShare);
})(typeof self !== 'undefined' ? self : this, function (CS) {
  'use strict';
  var KEYS = CS.KEYS;
  /* toValues(reader) -> values JSON. reader.get(key) returns the CURRENT value for a CardShare key (undefined = omit). */
  function toValues(reader) {
    var out = {};
    KEYS.forEach(function (k) { var v = reader.get(k); if (v !== undefined && v !== null) out[k] = v; });
    return out;
  }
  return { KEYS: KEYS, toValues: toValues, getValues: toValues };
});
