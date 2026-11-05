'use strict';
const test = require('node:test');
const assert = require('node:assert');
const CS = require('../card-share.js');

const TOKEN_A = 'eyJtIjoiVEhBTksgWU9VLFxuS2ltYmVyISIsIm0yIjoiSSByZWFsbHkgYXBwcmVjaWF0ZWQgdGhlIHRpbWUgYW5kIHRob3VnaHRmdWwgaW50ZXJ2aWV3IHF1ZXN0aW9ucywgYW5kIGxvb2sgZm9yd2FyZCB0byBoZWFyaW5nIGZyb20geW91IGFnYWlu8J-YiiIsInMyIjoiZGVjb2RlIiwibGF5IjoidGlnaHQiLCJiZyI6InBjYiIsInBhbCI6InRyb24iLCJzZWVkIjoxMSwic3BkIjowLjY1LCJjcmF3bEsiOjAuMDMsImJsdXJQeCI6Mi43LCJjc2VlZCI6OTA2NTM3LCJsZXR0ZXJzIjp0cnVlLCJjdWJlcyI6ZmFsc2UsImxpbmtlZCI6dHJ1ZSwibGFuZXMiOnRydWUsInN3ZWVwIjp0cnVlLCJjcmF3bCI6dHJ1ZSwiYmx1ciI6dHJ1ZSwicnVuZXMiOmZhbHNlLCJjcHVsc2UiOnRydWUsInB2YXIiOnRydWV9';

test('golden: token A (bare form) decodes to known fields', () => {
  const c = CS.decodeConfig(TOKEN_A);
  assert.ok(c, 'decodes');
  assert.strictEqual(c.m, 'THANK YOU,\nKimber!');
  assert.strictEqual(c.m2, 'I really appreciated the time and thoughtful interview questions, and look forward to hearing from you again\u{1F60A}');
  assert.strictEqual(c.spd, 0.65);
  assert.strictEqual(c.s2, 'decode');
  assert.strictEqual(c.bg, 'pcb');
  assert.strictEqual(c.seed, 11);
  assert.strictEqual(c.cseed, 906537);
  assert.strictEqual(c.crawlK, 0.03);
  assert.strictEqual(c.blurPx, 2.7);
  assert.strictEqual(c.cubes, false);
  assert.strictEqual(c.letters, true);
  assert.strictEqual(c.runes, false);
});

test('golden: "c." prefixed form decodes identically', () => {
  assert.deepStrictEqual(CS.decodeConfig('c.' + TOKEN_A), CS.decodeConfig(TOKEN_A));
});

test('golden: encode(decode(token)) round-trips', () => {
  const c = CS.decodeConfig(TOKEN_A);
  const t = CS.encodeConfig(c);
  assert.ok(t.startsWith('c.'));
  assert.deepStrictEqual(CS.decodeConfig(t), c);
});
