/* motion-picklist.js: ordered picklist UI for motion phases. UMD: MotionPicklist global / module.exports.
   Pure helpers (movePure, rowModel, tightWarn) are DOM-free and tested in node.
   Tags are canonical strings from MotionPhases (phase:3s, lettersRotate, radialWave;x=1;y=2;v=3). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./motion-phases.js'));
  else root.MotionPicklist = factory(root.MotionPhases);
})(typeof self !== 'undefined' ? self : this, function (MP) {
  'use strict';

  /* UI ranges. Mirrors MotionPhases PARAMS (not exported there). */
  var PARAM_UI = {
    parallaxShift: { amp: { lo: 0, hi: 1, step: 0.05, label: 'amp' } },
    radialWave: {
      x: { lo: -10, hi: 10, step: 0.1, label: 'x' },
      y: { lo: -10, hi: 10, step: 0.1, label: 'y' },
      v: { lo: 0.1, hi: 4, step: 0.1, label: 'v' }
    }
  };
  var DUR = { lo: 0.5, hi: 10, step: 0.1 };
  var ADD_PHASE = 'phase';
  var ADD_OPTIONS = [ADD_PHASE].concat(MP.EFFECTS);
  var TIGHT_HINT = 'reverts at next phase';

  /* Pure: returns a NEW array with tags[i] moved one step in dir (-1 up, +1 down). No-op at edges. */
  function movePure(tags, i, dir) {
    var j = i + dir;
    var out = tags.slice();
    if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
    var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    return out;
  }

  /* Pure: removes tags[i] -> NEW array. */
  function removePure(tags, i) {
    return tags.filter(function (_, k) { return k !== i; });
  }

  /* Pure: tag string -> row model {kind:'phase', dur} | {kind:'effect', name, params} | null when invalid. */
  function rowModel(tag) {
    var s = String(tag == null ? '' : tag).trim();
    if (s.indexOf('phase:') === 0) {
      var m = /^phase:(-?\d+(?:\.\d+)?)s?$/.exec(s);
      return m ? { kind: 'phase', dur: parseFloat(m[1]) } : null;
    }
    var parts = s.split(';'), name = parts[0], params = {};
    if (MP.EFFECTS.indexOf(name) < 0) return null;
    for (var i = 1; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (kv.length === 2) params[kv[0]] = parseFloat(kv[1]);
    }
    return { kind: 'effect', name: name, params: params };
  }

  /* Pure: row model -> canonical tag string (clamped via MP.normalize; '' if rejected). */
  function buildTag(model) {
    var raw;
    if (model.kind === 'phase') raw = 'phase:' + model.dur + 's';
    else {
      var keys = Object.keys(PARAM_UI[model.name] || {});
      raw = [model.name].concat(keys.filter(function (k) { return model.params[k] !== undefined; })
        .map(function (k) { return k + '=' + model.params[k]; })).join(';');
    }
    var out = MP.normalize([raw]);
    return out.length ? out[0] : '';
  }

  /* Pure: true when tightSpacing sits outside the final phase, so it reverts at the next phase. */
  function tightReverts(tags) {
    return MP.phasesToTimeline(tags).some(function (e) { return e.effect === 'tightSpacing' && e.revertAt !== null; });
  }

  /* Pure: text import -> {tags} | {error}. Empty input is an error (no phases to show). */
  function importText(text) {
    var raw = MP.parseMotionPhases(text);
    if (!raw.length) return { error: 'Empty. Paste a comma list such as phase:3s,lettersRotate' };
    var tags = MP.normalize(raw);
    if (tags.length !== raw.length) return { error: 'Some tags are invalid or out of range; check names, params and 0.5-10s durations' };
    return { tags: tags };
  }

  /* ---------------- DOM ---------------- */
  function el(doc, tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function numInput(doc, attrs, value, onCommit) {
    var inp = el(doc, 'input', 'mp-num');
    inp.type = 'number';
    inp.min = attrs.lo; inp.max = attrs.hi; inp.step = attrs.step;
    inp.value = value;
    inp.setAttribute('aria-label', attrs.aria);
    inp.addEventListener('change', function () { onCommit(inp.value); });
    return inp;
  }

  function create(rootEl, opts) {
    var doc = rootEl.ownerDocument;
    var onChange = (opts && opts.onChange) || function () {};
    var tags = MP.normalize(['phase:3s', 'phase:3s']);
    var list = el(doc, 'ol', 'mp-list');
    list.setAttribute('aria-label', 'Motion steps');
    var addSel = el(doc, 'select', 'mp-add');
    addSel.setAttribute('aria-label', 'Add step');
    ADD_OPTIONS.forEach(function (o) { addSel.appendChild(el(doc, 'option', null, o === ADD_PHASE ? 'phase boundary' : o)); });
    var addBtn = el(doc, 'button', 'mp-btn', 'Add');
    addBtn.type = 'button';
    var addRow = el(doc, 'div', 'mp-addrow');
    addRow.appendChild(addSel); addRow.appendChild(addBtn);
    var hint = el(doc, 'p', 'mp-hint');
    hint.hidden = true;
    var ioTa = el(doc, 'textarea', 'mp-io');
    ioTa.rows = 2; ioTa.spellcheck = false; ioTa.setAttribute('aria-label', 'Motion text');
    var applyBtn = el(doc, 'button', 'mp-btn', 'Apply'); applyBtn.type = 'button';
    var ioErr = el(doc, 'p', 'mp-err'); ioErr.setAttribute('role', 'alert'); ioErr.hidden = true;
    var ioRow = el(doc, 'div', 'mp-iorow');
    ioRow.appendChild(ioTa); ioRow.appendChild(applyBtn);
    rootEl.textContent = '';
    rootEl.classList.add('mp-root');
    [list, addRow, hint, ioRow, ioErr].forEach(function (n) { rootEl.appendChild(n); });

    function commit(next) { tags = next; render(); onChange(tags.slice()); }

    function rowControls(i, model) {
      var box = el(doc, 'span', 'mp-ctrls');
      if (model.kind === 'phase') {
        box.appendChild(el(doc, 'span', 'mp-name', 'phase'));
        box.appendChild(numInput(doc, { lo: DUR.lo, hi: DUR.hi, step: DUR.step, aria: 'Phase ' + (i + 1) + ' duration seconds' }, model.dur,
          function (v) { var t = buildTag({ kind: 'phase', dur: parseFloat(v) }); if (t) replaceAt(i, t); else render(); }));
        box.appendChild(el(doc, 'span', 'mp-unit', 's'));
      } else {
        box.appendChild(el(doc, 'span', 'mp-name', model.name));
        var specs = PARAM_UI[model.name] || {};
        Object.keys(specs).forEach(function (k) {
          var s = specs[k];
          var cur = model.params[k] !== undefined ? model.params[k] : s.lo;
          box.appendChild(el(doc, 'span', 'mp-plabel', s.label));
          box.appendChild(numInput(doc, { lo: s.lo, hi: s.hi, step: s.step, aria: model.name + ' ' + k }, cur,
            function (v) {
              var p = {}; Object.keys(model.params).forEach(function (q) { p[q] = model.params[q]; });
              p[k] = parseFloat(v);
              var t = buildTag({ kind: 'effect', name: model.name, params: p });
              if (t) replaceAt(i, t); else render();
            }));
        });
      }
      return box;
    }

    function replaceAt(i, tag) {
      var next = tags.slice(); next[i] = tag; commit(next);
    }

    function rowButtons(i) {
      var box = el(doc, 'span', 'mp-moves');
      var up = el(doc, 'button', 'mp-btn mp-up', 'Up'); up.type = 'button'; up.setAttribute('aria-label', 'Move step ' + (i + 1) + ' up');
      var dn = el(doc, 'button', 'mp-btn mp-down', 'Down'); dn.type = 'button'; dn.setAttribute('aria-label', 'Move step ' + (i + 1) + ' down');
      var rm = el(doc, 'button', 'mp-btn mp-rm', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove step ' + (i + 1));
      up.addEventListener('click', function () { commit(movePure(tags, i, -1)); });
      dn.addEventListener('click', function () { commit(movePure(tags, i, 1)); });
      rm.addEventListener('click', function () { commit(removePure(tags, i)); });
      box.appendChild(up); box.appendChild(dn); box.appendChild(rm);
      return box;
    }

    function render() {
      list.textContent = '';
      tags.forEach(function (tag, i) {
        var model = rowModel(tag);
        var li = el(doc, 'li', 'mp-row');
        li.dataset.index = i;
        li.appendChild(el(doc, 'span', 'mp-idx', String(i + 1)));
        if (model) li.appendChild(rowControls(i, model));
        li.appendChild(rowButtons(i));
        li.addEventListener('keydown', function (e) {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          commit(movePure(tags, i, e.key === 'ArrowUp' ? -1 : 1));
          var again = list.querySelectorAll('.mp-row')[e.key === 'ArrowUp' ? i - 1 : i + 1];
          if (again) { var b = again.querySelector('.mp-up'); if (b) b.focus(); }
        });
        list.appendChild(li);
      });
      var warn = tightReverts(tags);
      hint.hidden = !warn;
      hint.textContent = warn ? 'tightSpacing: ' + TIGHT_HINT : '';
      ioTa.value = MP.formatMotionPhases(tags);
    }

    addBtn.addEventListener('click', function () {
      var v = addSel.value;
      var tag = v === ADD_PHASE ? 'phase:3s' : buildTag(defaultModel(v));
      if (!tag) return;
      commit(MP.normalize(tags.concat([tag])));
    });

    applyBtn.addEventListener('click', function () {
      var r = importText(ioTa.value);
      if (r.error) { ioErr.textContent = r.error; ioErr.hidden = false; return; }
      ioErr.hidden = true;
      commit(r.tags);
    });

    function defaultModel(name) {
      var params = {};
      Object.keys(PARAM_UI[name] || {}).forEach(function (k) { params[k] = PARAM_UI[name][k].lo; });
      return name in PARAM_UI ? { kind: 'effect', name: name, params: params } : { kind: 'effect', name: name, params: {} };
    }

    render();
    return {
      get: function () { return tags.slice(); },
      set: function (next) { tags = MP.normalize(next || []); render(); },
      destroy: function () { rootEl.textContent = ''; rootEl.classList.remove('mp-root'); }
    };
  }

  return {
    create: create, movePure: movePure, removePure: removePure, rowModel: rowModel,
    buildTag: buildTag, tightReverts: tightReverts, importText: importText,
    PARAM_UI: PARAM_UI, TIGHT_HINT: TIGHT_HINT
  };
});
