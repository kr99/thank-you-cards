/* motion-phases.js: pure, DOM-free motion phase grammar. UMD: MotionPhases global / module.exports.
   Text: 'phase:3s,lettersRotate,slidingLanes,phase:1.5s,radialWave;x=-0.5;y=1;v=2'  (',' separates tags, ';' separates params). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotionPhases = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var EFFECTS = ['lettersRotate', 'slidingLanes', 'lightSweep', 'tightSpacing', 'revealMsg2', 'parallaxShift', 'radialWave'];
  /* param spec per effect: key -> [lo, hi]; key order is canonical output order */
  var PARAMS = {
    parallaxShift: { amp: [0, 1] },
    radialWave: { x: [-10, 10], y: [-10, 10], v: [0.1, 4] }
  };
  var MAX_PHASES = 6, MAX_TAGS = 16, DUR_LO = 0.5, DUR_HI = 10, IMPLICIT_DUR = 3;
  var PHASE_RE = /^phase:(-?\d+(?:\.\d+)?)s?$/, NUM_RE = /^-?\d+(?:\.\d+)?$/;

  function round3(n) { return Math.round(n * 1000) / 1000; }
  function fmt(n) { return String(round3(n)); }

  /* text -> raw trimmed tag strings (no validation) */
  function parseMotionPhases(str) {
    return String(str == null ? '' : str).split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  }
  /* tags -> text */
  function formatMotionPhases(tags) {
    return (tags || []).join(',');
  }

  /* 'phase:3s' -> {kind:'phase', dur} | null */
  function parsePhaseTag(raw) {
    var m = PHASE_RE.exec(raw);
    if (!m) return null;
    var dur = Math.round(parseFloat(m[1]) * 10) / 10;
    if (!(dur >= DUR_LO && dur <= DUR_HI)) return null;
    return { kind: 'phase', dur: dur };
  }
  /* 'radialWave;x=-0.5;v=2' -> {kind:'effect', name, params} | null (unknown name, bad param, non-param effect with params) */
  function parseEffectTag(raw) {
    var parts = raw.split(';'), name = parts[0], spec = PARAMS[name] || {}, params = {}, i;
    if (EFFECTS.indexOf(name) < 0) return null;
    for (i = 1; i < parts.length; i++) {
      if (parts[i] === '') continue;
      var kv = parts[i].split('='), key = kv[0];
      if (kv.length !== 2 || !NUM_RE.test(kv[1]) || !spec[key]) return null;
      var r = spec[key];
      params[key] = round3(Math.max(r[0], Math.min(r[1], parseFloat(kv[1]))));
    }
    return { kind: 'effect', name: name, params: params };
  }
  /* parsed -> canonical string (params in spec order) */
  function canonical(p) {
    if (p.kind === 'phase') return 'phase:' + fmt(p.dur) + 's';
    var keys = Object.keys(PARAMS[p.name] || {}).filter(function (k) { return p.params[k] !== undefined; });
    return [p.name].concat(keys.map(function (k) { return k + '=' + fmt(p.params[k]); })).join(';');
  }
  function parseTag(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (s.indexOf('phase:') === 0) return parsePhaseTag(s);
    return parseEffectTag(s);
  }

  /* -> canonical tag list: invalid tags dropped, max 6 phases (implicit first phase counts), max 16 tags. */
  function normalize(tags) {
    var list = typeof tags === 'string' ? parseMotionPhases(tags) : (Array.isArray(tags) ? tags : []);
    var out = [], phases = 0, hasLeadingEffect = false, seenPhase = false;
    list.forEach(function (raw) {
      var p = parseTag(raw);
      if (!p || out.length >= MAX_TAGS) return;
      if (p.kind === 'phase') {
        if (phases >= MAX_PHASES) return;
        phases++; seenPhase = true;
      } else if (!seenPhase && !hasLeadingEffect) {
        hasLeadingEffect = true; phases++;
      }
      out.push(canonical(p));
    });
    return out;
  }

  /* canonical tags -> phases [{dur, t0, t1, effects:[{effect, params}]}] (implicit first phase when effects lead) */
  function buildPhases(tags) {
    var phases = [], cur = null, t = 0;
    normalize(tags).forEach(function (raw) {
      var p = parseTag(raw);
      if (p.kind === 'phase') { cur = { dur: p.dur, t0: t, t1: t + p.dur, effects: [] }; t = cur.t1; phases.push(cur); return; }
      if (!cur) { cur = { dur: IMPLICIT_DUR, t0: 0, t1: IMPLICIT_DUR, effects: [] }; t = IMPLICIT_DUR; phases.push(cur); }
      cur.effects.push({ effect: p.name, params: p.params });
    });
    return phases;
  }

  /* -> [{effect, params, phase (1-based), t0, t1, revertAt}] */
  function phasesToTimeline(tags) {
    var phases = buildPhases(tags), out = [];
    phases.forEach(function (ph, i) {
      var isFinal = i === phases.length - 1;
      ph.effects.forEach(function (e) {
        out.push({
          effect: e.effect, params: e.params, phase: i + 1, t0: ph.t0, t1: ph.t1,
          revertAt: e.effect === 'tightSpacing' && !isFinal ? ph.t1 : null
        });
      });
    });
    return out;
  }

  /* -> seconds, sum of phase durations (0 when there are no phases) */
  function totalDuration(tags) {
    var phases = buildPhases(tags);
    return phases.length ? phases[phases.length - 1].t1 : 0;
  }

  return {
    EFFECTS: EFFECTS, MAX_PHASES: MAX_PHASES, MAX_TAGS: MAX_TAGS,
    parseMotionPhases: parseMotionPhases, formatMotionPhases: formatMotionPhases,
    normalize: normalize, validate: normalize, phasesToTimeline: phasesToTimeline, totalDuration: totalDuration
  };
});
