# Lanes4 -> main card: integration plan (2026-11-07)

Goal: replace Lanes3 in the card with lanes4 ("sliding rows"), with a collapsible control panel. Source of truth for design: [lanes-algorithm-spec-v2.md](lanes-algorithm-spec-v2.md); demo: `demo-lanes4.html` (layout reference). Agents: never run git; manager commits. Tests: `node --test 'test/*.test.js'`. TDD: stubs first (red), then green.

## User decisions (2026-11-07)
- Keep only `fresh` pairing; delete `rigid` + PAIRING param (code, tests, demo select).
- Visible params: rows, columns, seed, total time T (slide effect), number of shifts K, gap chance (UI max 0.20). Also play/pause, loop (default OFF), scrub slider with tick marks at stage boundaries.
- Hidden (config defaults only, NOT in share payload, NOT in UI): LAMBDA, CAP_ROW, CAP_COL=1.9, W_LO, W_HI, Q_FULL=0.
- Loop must hold on the final state (message visible) for `loopHold` seconds before restarting (default 2.0).
- Panel: collapsible (`<details>`) under the sliding-rows feature; other controls in it collapsed by default.

## Contracts (stable; streams code against these)
```
A  lanes4.js (UMD global Lanes4)
   LANES4_DEFAULTS            all tunables incl. hidden (CAP_COL:1.9, Q_FULL:0, GAP_P:.15, T:5.5, K:5)
   LANES4_UI                  [{key, label, help, min, max, step, default}] ONLY visible: K, T, GAP_P(max .20)
   planLanes4({R,C,T,seed,params}) -> plan   (GAP_P clamped to <= .20; unknown params ignored)
   sampleLanes4(plan,t) -> [{x,y,stopped,id}]   id stable per cube across all steps (NEW)
   stageBounds(plan) -> [t0,t1,...,tK]          K+1 ascending times, 0..T  (NEW)
B  lanes-player.js (UMD global LanesPlayer, pure)
   createPlayer({duration, stageBounds, loop=false, loopHold=2}) ->
     {tick(dtMs), play(), pause(), toggle(), seek(t), setLoop(b), setLoopHold(s),
      getState() -> {t, playing, loop, phase:'run'|'hold'|'done', progress 0..1}}
   semantics: t advances only when playing; at t>=duration: loop? hold loopHold s then restart t=0 : stop (phase 'done', t=duration)
   lanes-panel.js (UMD global LanesPanel):  mount(el, {values, onChange, player}) -> {setValues, destroy}
     renders <details> with controls from LANES4_UI + rows/cols/seed(+Reroll) + play/pause/loop/loopHold + scrub with tick marks
C  lanes-frame4.js: lanesFrame4(plan, tSec) -> per-cube {id,x,y,vx,vy,s} in the shape app.js put() expects (clip: s fades 0..1 over the edge half-cell)
   app.js: replace Lanes3 usage; lanes window ends at lock (as lanes3 did); toggle t-lanes unchanged
   card payload: visible params only, omitted when default; old lanes3 cards (?c= links) still decode
```

## Test stubs (each stream writes these as `test.todo`/failing first)
A (test/lanes4.test.js, edit):
- rigid/PAIRING removed: `params.PAIRING` ignored, no 'rigid' string in lanes4.js
- GAP_P clamped: planLanes4 with GAP_P=0.9 behaves as 0.20; LANES4_UI GAP_P max===0.20
- CAP_COL default 1.9, Q_FULL default 0; LANES4_UI has exactly keys K,T,GAP_P
- sampleLanes4 ids: unique within a frame; same id's position continuous across step boundaries
- stageBounds: length K+1, strictly ascending, first 0, last T; equal D spacing
- existing continuity / no-pop / packed-at-T / determinism tests still pass (fresh only)
B (test/lanes-player.test.js, new; pure node):
- not playing => tick does not advance t; play then tick(500) => t=0.5
- end, loop off => phase 'done', t===duration, playing false
- end, loop on => phase 'hold' for loopHold s with t===duration, then t resets to 0 and phase 'run'
- loopHold=0 loops immediately; seek clamps to [0,duration]; seek during hold ok
- setLoop at runtime; progress; stageBounds echoed in state
- lanes-panel.test.js (jsdom-free: test the pure helpers it exports): `tickPositions(bounds,duration)` -> percents; `clampGap(v)`; `describeValues`.
C (test/lanes-card.test.js, new + existing suites):
- lanesFrame4 returns one entry per cube with s in [0,1]; s=1 for on-board; 0 when fully off
- at t>=T every board cell has exactly one cube, s=1
- payload: default values => no lanes keys in token; non-default round-trips (decode(encode(x))==x); hidden params never serialized
- old lanes3-era token still decodes to same card values (golden)
- legacy playback golden tests A,B unchanged

## Streams, files, order
| stream | owns files | depends on |
|---|---|---|
| A engine | lanes4.js, test/lanes4.test.js, demo-lanes4.html | none |
| B player+panel | lanes-player.js, lanes-panel.js, test/lanes-player.test.js, test/lanes-panel.test.js, controls.css (append `.lp-` rules) | contracts only |
| C card wiring | lanes-frame4.js, app.js, index.html, test/lanes-card.test.js | A,B contracts; payload (card-values/card-share/config) LAST |

## Open questions (work around; user may course-correct)
1. **Payload shape [ONE-WAY: links in the wild]** default: short key `ln` in the `?c=` token, only non-default visible params, defaults omitted so old links never change. Schedule last.
2. **Stage ticks**: default = the K equal shifts (stageBounds). If the motion-phases scheduler (configurable per-phase length) is wired later, feed its boundaries into the same `stageBounds` slot. [two-way]
3. **Cube ids / instance buffer**: entering cubes may exceed R*C. Digest: buffer is 4n, put() needs W.cells[id]. Default: C maps ids to a pool of up to 4n instances; extra ids get a blank glyph. [two-way, but check before relying]
4. **Glyph reveal**: no per-cube reveal API; glyphs reveal when the sim locks. Default: lanes window ends at lock, glyphs churn during motion (as lanes3). `stopped` is not wired to a glyph. [two-way]
5. **T vs cascade length**: lanes window start = max(0, lock - T); if cascade < T the window is truncated. Default: truncate, log; do not change cascade timing. [two-way]
6. **Loop in the card** replays the lanes window only (not the whole cascade). [two-way]
