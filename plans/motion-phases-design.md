# Motion phases + lanes v2 design

Status: design only. Read-only on code. Namespace: `motion.*` (card animation), not `share.*` URL params.

## A. LANES v2

### Why current lanes fail (from code)
- `plan-lanes.js`: lane = full torus rotation; every cell in a lane moves. No blanks, so every shift drags cubes across occupied slots.
- `slide-lanes.js`: `_commit` rotates the whole lane with wrap. Perpendicular lanes overlap mid-flight (`corrX/corrY` patch continuity). Wrap = cubes cross the seam over others.
- `solve()` = inverse replay of forward log. Exact return only if log replay is exact, so letters "almost" resolve when corrections/commit-order interact.

### Options
| # | Approach | Legal gap-only? | Exact end? | Verdict |
|---|---|---|---|---|
| 1 | Backward gen from solved, gap-only moves | yes, by construction (reverse of legal is legal) | yes, by construction | RECOMMEND |
| 2 | Forward random + invented final reveal | no, must enforce per step | no, fakes last 1-2 steps | reject: fake reveal hides a bug, does not fix it |

Pick (1). Invented ending (2) is unnecessary once the walk is generated backward from the exact solved state.

### Model
```
row: [a b _ c d _ e]
     move = slide a contiguous run 1 cell into an adjacent hole
     [a b _ c d _ e] -> [a _ b c d _ e]   LEGAL (b steps into hole)
     [a b _ c d _ e] -> [a b d _ c _ e]   ILLEGAL (d jumps 2 cells over c = pass-through)
```
Rule: a move shifts a contiguous block run by 1 cell into an adjacent hole. Blocks never jump, never cross another block.

### Signature
```js
planLanes2(rng, rows, cols, { holes: 0.3, moves: 12, maxRun: 3 })
  -> { solved: Int32Array(rows*cols) /* id, -1 = hole */,
       start:  Int32Array,                 /* scrambled initial grid */
       steps:  [{ axis:'row'|'col', i, from, to }] /* forward play order */ }
```
- `solved` = target layout; holes = blank cells (spaces in the text).
- Generation: start from `solved`, apply `moves` random legal slides in reverse; `start` = result; `steps` = reverse of applied moves.

### Invariants (node tests, seeded rng)
1. Each step: multiset of non-hole ids unchanged; no id appears twice.
2. Each step: moved ids all in one lane; the slide target cell is a hole before the step; no block crosses another block (path check).
3. Determinism: same seed -> deep-equal output.
4. Replay `start` through `steps` == `solved` exactly.
5. Holes count == solved holes count at every step.

### Empty cells at end
- Holes in `solved` are the text's blank cells: they stay blank. Nothing fills them.
- Only cells that held cubes during scramble end blank-free. No rise/fade needed.
- Open: today ALL 28 cells hold cubes (permutation of full grid). Blank solved cells = visible design change.

## B. MOTION PHASES

### Grammar
```
motionPhases = tag[]          // ordered
tag          = 'phase:' dur   // dur 0.5..10, 0.1 step, max 6 phases
             | effect
effect       = lettersRotate | slidingLanes | lightSweep | tightSpacing | revealMsg2
             | parallaxShift[:amp=0..1]
             | radialWave[:x=n,y=n,v=0.1..4]     // x,y in board units, may be off-board
```
Example (shape from user): `phase:3s,lettersRotate,slidingLanes,phase:1.5s,lightSweep,phase:1s,tightSpacing,revealMsg2`
Note: example uses `3s` suffix; grammar stores bare seconds, accepts optional `s`.

### tightSpacing ambiguity: RECOMMEND
| Option | Pros | Cons |
|---|---|---|
| a. final phase only | simple, no revert state | less expressive |
| b. any phase, revert next boundary | matches user words | needs reverse tween + state |
| **c. any phase; revert at next boundary unless final** | matches user; final persists | slightly more logic |

Pick (c). Tight = `lay` layout tween; implement as `slideT` 0->1 in phase, back to 0 at boundary.

### Schema + validate (card-share.js)
- New key `mp`: array of strings, max 8 tags, each tag regex `^[A-Za-z:.,=0-9]{1,40}$`.
- Unknown tags dropped (same policy as BOOLS). Invalid phase dur -> tag dropped.
- Add to KEYS (derived), `validate()` copies `mp` whitelisted.

### Encoding
| Channel | Use | Size |
|---|---|---|
| `c.` JSON token `mp` | canonical, shared links | ~12 chars/tag, ~100 for 8 tags |
| `motionPhases=` param | hand-authoring, readable | same grammar |
RECOMMEND both; token wins on conflict. Budget: golden A = 528 chars; MAX_FRAGMENT 1800; fine.

### Backward compat
- Keep all legacy keys in `validate()` (golden tests read them).
- `motionPhasesOf(cfg)`: if `mp` absent, derive from legacy flags: `lanes`->slidingLanes, `sweep`->lightSweep, `letters`->lettersRotate, `lay=tight`->tightSpacing, `s2!=off`->revealMsg2, phases from timeline defaults (`TL`).
- Golden A (lanes:true, sweep:true, letters:true, lay tight) must map to same playback. Test: `phasesToTimeline(motionPhasesOf(A))` == legacy timeline output for the same t grid.
- Golden B only differs in spd/crawlK; untouched.

### Scheduler (pure)
```
phasesToTimeline(list) -> [{ effect, t0, t1, phase }]
  phase boundaries = cumulative phase:<dur>
  effects bind to the phase they sit in (start at phase t0, end at phase t1)
```
Testable in node with `card-timing.js` (`timeline()` already phase-based: resolving->locked->cubesFading->sliding->secondary->done).
Note: `secondaryEarly` and `TL` constants are the legacy phases; map them, do not rewrite.

### Effect params
- `radialWave`: origin x,y (board units, may be off-board), speed v. Wave front r = v*(t - t0); cell intensity = exp(-((dist - r)^2)). Pure function; shader needs one uniform (origin, speed).
- `parallaxShift`: per-cell offset = amp * depth(cell); depth from row index. Pure.

### UI
| Option | a11y | touch | Effort |
|---|---|---|---|
| HTML5 DnD | poor (no keyboard) | broken on touch | low |
| up/down buttons + Alt+Arrow | good | good | low |
| pointer-event drag | ok with keyboard fallback | good | high |
RECOMMEND up/down buttons + keyboard in v1. Drag = v2.
- Place inside `fieldset[data-group="motion"]` (index.html line ~115; existing t-lanes/t-sweep sit there). `controls.test.js` requires every referenced id to live in a grouped fieldset. controls.css owns layout.
- Replace `t-lanes`, `t-sweep`, `t-letters` switches with the picklist; keep ids until migrated.

## C. DEPENDENCY MAP

```
FREEZE FIRST (contracts)
  [F1] mp grammar + validate()     (card-share.js)
  [F2] phasesToTimeline output     (pure, card-timing.js)
  [F3] planLanes2 signature + invariants

PARALLEL after freeze
  [P1] planLanes2 + node tests          needs F3   (plan-lanes.js new fn)
  [P2] phasesToTimeline + node tests    needs F2   (card-timing.js)
  [P3] mp validate + motionPhasesOf     needs F1   (card-share.js)
  [P4] picklist UI (buttons)            needs F1   (index.html motion fieldset, controls.css)
  [P5] radialWave/parallaxShift shader  needs F2   (circuit-bg.js / glyph-engine)

SEQUENTIAL (touch app.js)
  [S1] wire P1 into play() replacing planLanes        needs P1
  [S2] wire P2 into drawFrame/timeline                needs P2,P3
  [S3] golden play-equivalence test                   needs P3,S2
```
Conflict zones: app.js (S1,S2 serial); index.html motion fieldset (P4 only).

### Confidence (0-100) on hard-to-reverse decisions
| Decision | Conf | Owner |
|---|---|---|
| Backward gen (option 1) | 80 | recommend, you decide |
| Holes = text blanks, solved grid has blanks | 55 | ASK user |
| tightSpacing option c | 70 | recommend |
| `mp` token key + readable param | 75 | recommend |
| Legacy mapping keeps golden playback | 65 | verify with S3 test |
| Picklist = buttons v1 | 85 | recommend |

Decide yourself: encoding, UI buttons, tightSpacing (c), param grammar.
Ask user: blank cells in solved state (design change), max phases/durations, whether radialWave origin must allow off-board.

## Top 5 open questions
1. Blank cells in solved text layout: OK to add (changes look)?
2. tightSpacing in non-final phase: revert-at-boundary acceptable?
3. Max phases (6) and dur range (0.5-10 s) right?
4. Off-board radialWave origin: clamp or allow?
5. Drag reorder now, or buttons first?

## Weakest assumptions (critic)
1. "Cubes slide under cubes" comes from rigid torus lane moves + corrections; NOT verified in renderer.
2. Legacy flags map 1:1 to phases with same playback; not tested.
3. Backward generation with holes yields visually good scrambles (maxRun, hole density untuned).

## Baseline concern
`node --test test/` currently reports a top-level failure (not located; check before S-series work).
