const test = require('node:test'), assert = require('node:assert');
const { parseState, serializeState, KEY } = require('../side-panel.js');
test('parseState: only "1" is open; junk/null => default closed', () => {
  assert.equal(parseState('1'), true); assert.equal(parseState('0'), false);
  assert.equal(parseState(null), false); assert.equal(parseState('yes'), false); assert.equal(parseState(undefined), false);
});
test('serializeState round-trips', () => {
  assert.equal(serializeState(true), '1'); assert.equal(serializeState(false), '0');
  assert.equal(parseState(serializeState(true)), true); assert.equal(parseState(serializeState(0)), false);
  assert.equal(typeof KEY, 'string');
});
