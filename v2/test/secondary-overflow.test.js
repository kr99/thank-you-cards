'use strict';
const test = require('node:test');
const assert = require('node:assert');
const TextLayer = require('../text-layer.js');
const { fakeMeasure } = require('./helpers.js');

const MSG2 = '(placeholder: open settings to edit) lorem ipsum dolor sit amet alareklj adlkfjs 9oljgfdoi dsoj asldjfasd junk garbage this that other the quick \nbrown fox\njumps over\nthe lazy dog';
const measure = (s) => fakeMeasure(s) * 10;
const bottomOf = (lay) => Math.max(...lay.lines.map((l) => l.top + l.height));

test('secondary message: reported height is enough that every line fits inside it (no clipping)', () => {
  // Arrange: small strip; build reports the height the text needs at the floor scale
  const need = TextLayer.build({ text: MSG2, w: 300, h: 40 }, measure).height;
  // Act: lay out again in a strip of exactly that height
  const lay = TextLayer.build({ text: MSG2, w: 300, h: need }, measure);
  // Assert
  assert.ok(bottomOf(lay) <= need + 1e-6, 'bottom ' + bottomOf(lay).toFixed(1) + ' > strip ' + need.toFixed(1));
  const glyphs = lay.lines.map((l) => l.glyphs.map((x) => x.g).join('')).join('');
  assert.strictEqual(glyphs.replace(/\s/g, ''), MSG2.replace(/\s/g, ''));
});
