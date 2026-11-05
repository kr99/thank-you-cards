'use strict';
// Contract: layout (markup grouping + controls.css) is separate from behavior (app.js, id-only access).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), js = read('app.js');
const EXEMPT = new Set(['stage', 'gl', 'sec', 'status', 'ctrl', 'showctl', 'replayfloat']); // stage + clean-mode bar
const sec = (html.match(/<section id="controls"[\s\S]*?<\/section>/) || [''])[0];
const groups = [...sec.matchAll(/<fieldset data-group="([\w-]+)"[^>]*>([\s\S]*?)<\/fieldset>/g)];
const grouped = groups.map(g => g[2]).join('\n');

function referencedIds() {
  const ids = new Set();
  for (const m of js.matchAll(/\$\('([\w-]+)'\)/g)) ids.add(m[1]);
  for (const m of js.matchAll(/\bsw\('(\w+)'/g)) ids.add('t-' + m[1]);
  for (const m of js.matchAll(/\[((?:'\w+',?\s*)+)\]\.forEach\(function \(k\) \{ \$\('t-' \+ k\)/g))
    for (const k of m[1].match(/\w+/g)) ids.add('t-' + k);
  for (const m of js.matchAll(/rangeBind\('(\w+)'/g)) { ids.add(m[1]); ids.add(m[1] + '-o'); }
  return [...ids].filter(i => !EXEMPT.has(i));
}

test('#controls section exists with fieldset[data-group] groups', () => {
  assert.ok(sec, '<section id="controls"> missing');
  assert.ok(groups.length >= 3, 'need groups');
  assert.ok(!/<fieldset(?![^>]*data-group)/.test(sec), 'every fieldset needs data-group');
});

test('every control id app.js references lives inside a fieldset[data-group] in #controls', () => {
  const ids = referencedIds();
  assert.ok(ids.length > 25, 'extraction sanity: ' + ids.length);
  for (const id of ids) assert.ok(new RegExp('\\bid="' + id + '"').test(grouped), 'not in a group: ' + id);
});

test('every interactive element in #controls is grouped', () => {
  const all = [...sec.matchAll(/<(?:button|input|select|textarea)\b[^>]*\bid="([\w-]+)"/g)].map(m => m[1]);
  assert.ok(all.length > 25, 'no controls found');
  for (const id of all) assert.ok(new RegExp('\\bid="' + id + '"').test(grouped), 'ungrouped: ' + id);
});

test('controls.css linked; no inline layout styles in #controls', () => {
  assert.ok(/<link[^>]+href="controls\.css"/.test(html), 'controls.css not linked');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'controls.css')));
  assert.ok(sec && !/style="[^"]*"/.test(sec), 'inline style in #controls');
});

test('app.js reaches controls by id only (no positional DOM traversal)', () => {
  assert.ok(!/\.(parentNode|parentElement|children|firstChild|nextSibling|previousSibling|nextElementSibling|closest)\b/.test(js.replace(/\/\/.*$/gm, '')), 'positional DOM access in app.js');
});
