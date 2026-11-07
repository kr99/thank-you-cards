'use strict';
const test = require('node:test');
const assert = require('node:assert');
const TextLayer = require('../text-layer.js');
const Background = require('../bg-layer.js');

test('TextLayer.build needs only a measurer (no background)', () => {
  const m = (s) => String(s).length * 50;           // width at 100px font
  const L = TextLayer.build({ text: 'hello world again', w: 400, h: 120 }, m);
  assert.ok(L.lines.length >= 1 && L.fontPx > 0);
  L.lines.forEach((ln) => { assert.ok(ln.glyphs.length > 0); assert.ok(Number.isFinite(ln.top)); });
  assert.deepStrictEqual(TextLayer.build({ text: 'hello world again', w: 400, h: 120 }, m), L);
  assert.strictEqual(TextLayer.build({ text: '', w: 400, h: 120 }, m).lines.length, 0);
});

test('Background drives variant/seed/palette/draw against a fake CB (no text)', () => {
  const calls = [];
  const inst = { canvas: { id: 'c' }, setVariant: (v) => calls.push('v:' + v), setSeed: (n) => calls.push('s:' + n),
    setPalette: (p) => calls.push('p:' + p), update: (t) => calls.push('u:' + t) };
  const CB = { palettes: { tron: 1, ember: 1 }, create: (o) => { calls.push('create:' + o.variant); return inst; } };
  const bg = Background.create(CB, { variant: 'pcb', seed: 7 });
  bg.setPalette('ember'); bg.setVariant('pcb'); bg.setSeed(3); bg.draw(1.5);
  assert.deepStrictEqual(calls, ['create:pcb', 'p:ember', 'v:pcb', 'p:ember', 's:3', 'u:1.5']);
  assert.strictEqual(bg.canvas, inst.canvas);
  bg.setPalette('nope'); assert.strictEqual(bg.palette, 'tron');
});
