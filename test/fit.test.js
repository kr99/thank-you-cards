'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fitText, layoutBoxes } = require('../card-fit.js');
const { fakeMeasure } = require('./helpers.js');

const W = 200; // 20 chars per line at scale 1

test('short text stays on one line at scale 1', () => {
  assert.deepStrictEqual(fitText('hello world', W, fakeMeasure, { maxLines: 2 }), { lines: ['hello world'], scale: 1 });
});

test('long text wraps at word boundaries within maxW, keeping scale 1 when it fits maxLines', () => {
  const r = fitText('aaaa bbbb cccc dddd eeee ffff', W, fakeMeasure, { maxLines: 2 });
  assert.deepStrictEqual(r.lines, ['aaaa bbbb cccc dddd', 'eeee ffff']);
  assert.strictEqual(r.scale, 1);
});

test('very long text shrinks so every line fits maxLines, and no line overflows at that scale', () => {
  const text = Array(12).fill('word').join(' ');
  const r = fitText(text, W, fakeMeasure, { maxLines: 2, minScale: 0.2 });
  assert.ok(r.scale < 1);
  assert.ok(r.lines.length <= 2);
  r.lines.forEach((l) => assert.ok(fakeMeasure(l) * r.scale <= W + 1e-9, l));
  assert.strictEqual(r.lines.join(' '), text);
});

test('minScale floor is respected even when text still does not fit', () => {
  const text = Array(200).fill('word').join(' ');
  const r = fitText(text, W, fakeMeasure, { maxLines: 2, minScale: 0.5 });
  assert.strictEqual(r.scale, 0.5);
  assert.ok(r.lines.length > 2);
});

test('an unbreakable word wider than the box is split by characters', () => {
  const r = fitText('x'.repeat(45), W, fakeMeasure, { maxLines: 3 });
  assert.strictEqual(r.scale, 1);
  assert.deepStrictEqual(r.lines.map((l) => l.length), [20, 20, 5]);
});

test('typed newlines start new lines', () => {
  assert.deepStrictEqual(fitText('one\ntwo', W, fakeMeasure, { maxLines: 2 }).lines, ['one', 'two']);
});

test('layoutBoxes: m1 and m2 never intersect for any m2 length, and m2 grows with text', () => {
  let prev = 0;
  for (const n of [0, 10, 100, 300, 500, 2000]) {
    const b = layoutBoxes({ rows: 4, m2Chars: n });
    assert.ok(b.m1.y + b.m1.h <= b.m2.y + 1e-9, 'overlap at ' + n);
    assert.ok(b.m2.h >= prev);
    prev = b.m2.h;
    assert.strictEqual(b.total, b.m1.h + b.m2.h);
  }
  assert.strictEqual(layoutBoxes({ rows: 4, m2Chars: 0 }).m2.h, 0);
});
