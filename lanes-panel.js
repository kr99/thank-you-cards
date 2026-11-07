/* lanes-panel.js: collapsible "Sliding rows" control panel. Pure helpers are node-testable; mount() builds DOM. UMD: LanesPanel. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.LanesPanel = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var GAP_MAX = 0.20;
  var GRID = [ // key, label, help, min, max, step, default
    ['R', 'Rows', 'Grid height in cubes', 1, 8, 1, 3],
    ['C', 'Columns', 'Grid width in cubes', 3, 30, 1, 14],
    ['seed', 'Random seed', 'Same seed + settings = same animation', 0, 9999, 1, 7]
  ];
  function tickPositions(bounds, duration) {
    if (!(duration > 0)) return [];
    return (bounds || []).map(function (b) { return Math.min(Math.max(b / duration, 0), 1) * 100; });
  }
  function clampGap(v) { v = +v; return isFinite(v) ? Math.min(Math.max(v, 0), GAP_MAX) : 0; }
  function describeValues(v) {
    return v.R + ' rows x ' + v.C + ' columns, seed ' + v.seed + ', ' + v.T + ' s, ' + v.K + ' shifts, ' + Math.round(v.GAP_P * 100) + '% gaps';
  }
  function mount(el, opts) {
    opts = opts || {};
    var noop = { setValues: function () {}, sync: function () {}, redrawMarks: function () {}, destroy: function () {} };
    var doc = el && (el.ownerDocument || (typeof document !== 'undefined' && document));
    if (!el || !doc) return noop;
    var ui = opts.ui || (root.Lanes4 && root.Lanes4.LANES4_UI) || [], player = opts.player;
    var values = Object.assign({}, opts.values), inputs = {}, outs = {};
    function h(tag, props) {
      var n = doc.createElement(tag); Object.assign(n, props);
      for (var i = 2; i < arguments.length; i++) n.append(arguments[i]);
      return n;
    }
    function emit(k, v) {
      values[k] = v; if (outs[k]) outs[k].textContent = v;
      if (opts.onChange) opts.onChange(Object.assign({}, values), k);
    }
    function row(spec) {
      var k = spec[0], max = k === 'GAP_P' ? GAP_MAX : spec[4];
      var i = h('input', { type: 'range', min: spec[3], max: max, step: spec[5], value: values[k] != null ? values[k] : spec[6] });
      var o = h('output', { textContent: i.value }); inputs[k] = i; outs[k] = o;
      i.addEventListener('input', function () {
        var v = parseFloat(i.value); if (!isFinite(v)) v = spec[6];
        emit(k, k === 'GAP_P' ? clampGap(v) : v);
      });
      var kids = [i, o];
      if (k === 'seed') {
        var b = h('button', { type: 'button', textContent: 'Reroll' });
        b.addEventListener('click', function () { i.value = Math.floor(Math.random() * 10000); emit(k, +i.value); });
        kids.push(b);
      }
      return h('div', { className: 'lp-row', title: spec[2] },
        h('div', { className: 'lp-n', textContent: spec[1] }, h('small', { textContent: spec[2] })),
        h.apply(null, ['div', { className: 'lp-ctl' }].concat(kids)));
    }
    function group(name, rows) { return h.apply(null, ['details', { className: 'lp-group' }, h('summary', { textContent: name })].concat(rows)); }
    var uiRows = ui.map(function (u) { return row([u.key, u.label, u.help, u.min, u.max, u.step, u.default]); });
    var grid = group('Grid', GRID.map(row)), shuffle = group('Timing and gaps', uiRows);
    var play = h('button', { type: 'button', className: 'lp-play', textContent: 'Play' });
    var loop = h('input', { type: 'checkbox', checked: false });
    var hold = h('input', { type: 'number', min: 0, max: 10, step: 0.5, value: 2 });
    var scrub = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0 });
    var marks = h('div', { className: 'lp-marks' });
    var pb = group('Playback', [
      h('div', { className: 'lp-row' }, play,
        h('label', { className: 'lp-n' }, loop, ' Loop', h('small', { textContent: 'Replay after the final message has been shown' })),
        h('label', { className: 'lp-n' }, 'Loop hold (s) ', hold, h('small', { textContent: 'How long the finished message stays before restarting' }))),
      h('div', { className: 'lp-scrub' }, scrub, marks)]);
    function drawMarks() {
      if (!player) return;
      var s = player.getState(); marks.textContent = '';
      tickPositions(s.stageBounds, s.duration).forEach(function (p) { marks.append(h('span', { className: 'lp-tick', style: { left: p + '%' } })); });
    }
    function sync() {
      if (!player) return;
      var s = player.getState(); play.textContent = s.playing ? 'Pause' : 'Play';
      scrub.value = Math.round(s.progress * 1000);
    }
    if (player) {
      play.addEventListener('click', function () { player.toggle(); sync(); });
      loop.addEventListener('change', function () { player.setLoop(loop.checked); });
      hold.addEventListener('change', function () { player.setLoopHold(parseFloat(hold.value)); });
      scrub.addEventListener('input', function () { player.seek(scrub.value / 1000 * player.getState().duration); });
      drawMarks();
    }
    var box = h('details', { className: 'lp' }, h('summary', { textContent: 'Sliding rows' }), grid, shuffle, pb);
    el.append(box);
    return {
      setValues: function (v) {
        Object.assign(values, v);
        Object.keys(inputs).forEach(function (k) { if (v[k] != null) { inputs[k].value = v[k]; outs[k].textContent = v[k]; } });
      },
      sync: sync, redrawMarks: drawMarks,
      destroy: function () { box.remove(); }
    };
  }
  return { tickPositions: tickPositions, clampGap: clampGap, describeValues: describeValues, mount: mount, GAP_MAX: GAP_MAX };
});
