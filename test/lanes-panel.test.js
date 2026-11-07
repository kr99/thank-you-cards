const test = require('node:test'), assert = require('node:assert');
const { tickPositions, clampGap, describeValues, mount } = require('../lanes-panel.js');
test('tickPositions => percents', () => {
  assert.deepEqual(tickPositions([0, 1, 4], 4), [0, 25, 100]);
  assert.deepEqual(tickPositions([], 4), []); assert.deepEqual(tickPositions([0, 1], 0), []);
});
test('clampGap to [0,.20]', () => {
  assert.equal(clampGap(0.9), 0.2); assert.equal(clampGap(-1), 0); assert.equal(clampGap(0.1), 0.1); assert.equal(clampGap(NaN), 0);
});
test('describeValues is plain English', () => {
  assert.equal(describeValues({ R: 3, C: 14, seed: 7, T: 5.5, K: 5, GAP_P: 0.15 }), '3 rows x 14 columns, seed 7, 5.5 s, 5 shifts, 15% gaps');
});
test('mount without DOM is a safe no-op', () => {
  const m = mount(null, {}); assert.equal(typeof m.setValues, 'function'); m.destroy();
});
test('mount builds details with stub DOM', () => {
  const mkEl = (tag) => ({ tag, children: [], style: {}, dataset: {}, append(...k) { this.children.push(...k); }, addEventListener() {}, appendChild(k) { this.children.push(k); }, remove() {}, setAttribute() {} });
  const doc = { createElement: mkEl, createTextNode: (t) => t };
  const el = mkEl('div'); el.ownerDocument = doc;
  const ui = [{ key: 'K', label: 'Shifts', help: 'h', min: 1, max: 12, step: 1, default: 5 }];
  const m = mount(el, { ui, values: { R: 3, C: 14, seed: 7, T: 5.5, K: 5, GAP_P: 0.15 }, onChange() {}, player: require('../lanes-player.js').createPlayer({ duration: 5, stageBounds: [0, 5] }) });
  assert.equal(el.children[0].tag, 'details'); m.destroy();
});
