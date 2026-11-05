'use strict';
const test = require('node:test'), assert = require('node:assert');
const CV = require('../card-values.js'), CS = require('../card-share.js');
const mk = (o) => ({ get: (k) => o[k] });
test('toValues covers every CardShare key incl hide', () => {
  const all = {}; CS.KEYS.forEach((k) => { all[k] = k === 'hide' ? true : 'x'; });
  const v = CV.toValues(mk(all));
  assert.deepStrictEqual(Object.keys(v).sort(), CS.KEYS.slice().sort());
  assert.ok('hide' in v);
});
test('toValues reflects live (unapplied) message text and drops undefined', () => {
  const v = CV.toValues(mk({ m: 'NEW TEXT', m2: undefined }));
  assert.strictEqual(v.m, 'NEW TEXT'); assert.ok(!('m2' in v));
});
test('KEYS exported', () => assert.deepStrictEqual(CV.KEYS, CS.KEYS));
