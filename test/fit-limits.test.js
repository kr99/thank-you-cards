'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const CS = require('../card-share.js');

const TOKEN_A = fs.readFileSync(__dirname + '/golden.test.js', 'utf8').match(/TOKEN_A = '([^']+)'/)[1];

test('m2 limits only go up (was 120 chars / 2 lines) and stay within the URL budget', () => {
  assert.ok(CS.MAX_MSG2 > 120 && CS.MAX_MSG2 <= 500);
  assert.ok(CS.MAX_LINES2 > 2);
});

test('a max-length m2 sanitizes untouched and still fits the share fragment budget', () => {
  const text2 = 'word '.repeat(CS.MAX_MSG2).slice(0, CS.MAX_MSG2).trim();
  assert.strictEqual(CS.sanitizeInfo(text2, CS.MAX_LINES2, CS.MAX_MSG2).truncated, false);
  const r = CS.buildFragmentChecked({ m: 'THANK YOU', m2: text2, s2: 'decode', bg: 'pcb', pal: 'tron' }, {});
  assert.strictEqual(r.tooLong, false);
});

test('golden token still decodes after the limit raise', () => {
  assert.strictEqual(CS.decodeConfig(TOKEN_A).m, 'THANK YOU,\nKimber!');
});
