# Sliding Lanes: Algorithm Spec (v3)

Source: [lanes-user-quotes.md](lanes-user-quotes.md). Context from `app.js`, `card-timing.js`, `motion-phases.js`, `config.js`, `glyph-engine.js` (cited inline). Single source of truth for `planLanes3` (new name, avoids clashing with `planLanes2`).

## 0. Real context

- Grid: `cols = clamp(longest+2, 7, 42)`, `rows = clamp(lines+2, 3, 5)` (app.js:283). Default "YOUR MESSAGE HERE" = **19x3**. Row lanes long (7..42); column lanes tiny (3..5).
- Geometry: 1 cell = 1 unit, cube 0.86 (`K.cubeSize`). Instanced `cubeMesh`; `writeInstances` sets `aPos` = cell pos + lane offset, `aMot` = lane velocity blur. **Cube id = target cell index**; it carries its own churning glyph `W.cells[id].shown`.
- Today: lanes start at `play()`, parallel to the cascade (~82 ticks x 75 ms = ~6 s); `lockedAt` waits for lanes idle; then sweep 1.2 s, tight slide 1 s; msg2 starts at `lockedAt` (decode 1.6 s).
- Phase scheduler (`motion-phases.js`, not yet wired): `phase:3s,slidingLanes;speed=0.7;holes=0.15` -> `{effect, params, t0, t1}`. **D = t1 - t0**; lanes sampled at local `t = now - t0`.

## 1. Goals as visual properties

```
DISLIKED                          WANTED (one row lane, one round)
A B C D E F                       before: A B _ C D _ E F _
  ^F flies over B..E                after:  A B C _ _ D E _ F
  (pass-through, wrap, z-hop)      order A<B<..<F kept; segments move different amounts
end: letters wrong                end: holes drop in, every cell = own cube
```

NEVER: N1 cube passes/overlaps another. N2 leaves lane, wraps, z-hops. N3 row and column motion overlap in time. N4 end != solved. N5 overruns D.
USUALLY: U1 50-80% of eligible lanes early, 30-50% late, simultaneous. U2 2+ segments per lane move different distances. U3 late rounds touch few lanes. U4 holes visible mid-plan, filled at end.

| # | Ambiguity | Assumption |
|---|---|---|
| A1 | "+5,-3,+8" rigid shifts | Impossible without wrap or passing; use gap-reshuffle (quote 2 "xx xxxx x" example) |
| A2 | "2 spins back" | Plan generated backward from solved; rounds from D/speed; last rounds low-touch |
| A3 | hole count/where | `holes` 0.15 of cells, weighted 3:1 to non-ink cells (spaces count as cubes, quote 3) |
| A4 | fill-in style | Scale 0->1 + drop in z at its cell, no lateral motion |
| A5 | axis with no movable lanes | Use the other axis; alternation breaks only then |

## 2. Data model

```ts
type Axis = 'row' | 'col';
type CubeId = number;                 // target cell index r*cols+c
type State = (CubeId | null)[];       // rows*cols, null = hole
interface Move   { id: CubeId; from: number; to: number }   // lane positions, from!==to
interface LaneOp { axis: Axis; index: number; start: number; dur: number; moves: Move[] } // seconds, local
interface Round  { axis: Axis; ops: LaneOp[] }
interface Fill   { id: CubeId; cell: number; start: number; dur: number }
interface Plan   { rows: number; cols: number; D: number; start: State; rounds: Round[]; fills: Fill[] }
interface Opts   { seed: number; D: number; speed?: number /*0.5*/; holes?: number /*0.15*/;
                   isInk?: (cell: number) => boolean; maxShiftFrac?: number /*0.5*/; tries?: number /*20*/ }
function planLanes3(rows: number, cols: number, o: Opts): Plan        // pure
function sampleLanes(p: Plan, t: number): { x: number; y: number; vx: number; vy: number; s: number }[] // per CubeId; s 0 = hidden
```

Lane `(row,i)` cells `i*cols+p`; `(col,j)` cells `p*cols+j`. RNG: mulberry32(seed), fixed call order.

## 3. Timing (derived from D, speed)

Inputs: `D` clamp [1.5, 10] s; `speed` clamp [0,1] (presets slow=0, normal=0.5, rapid=1).

```
sd     = lerp(0.9, 0.35, speed)        // base shift duration (s)
stg    = 0.3*sd ; gap = 0.2*sd ; u = sd+stg+gap   // stagger window, round gap, round slot
fill   = clamp(0.15*D, 0.3, 0.8)
A      = D - fill                      // slide budget
R      = clamp(round((A+gap)/u), 1, 10)
k      = A / (R*u - gap)               // scale: rounds fill A EXACTLY
round r (forward 0..R-1): t0 = r*u*k
  op.start = t0 + rng()*stg*k ; op.dur = sd*k     // whole lane shares one start+dur (N1 proof, §5)
  next round t0 >= this round's last end + gap*k  // N3
fills: start = A + rng()*0.5*fill ; dur = 0.5*fill   // ends <= D
ease: easeInOutCubic (CardTiming.easeIO) on every op
```

| D \ speed | slow (sd .9) | normal (.625) | rapid (.35) |
|---|---|---|---|
| 2 s (fill .30) | R1, shift 1.31 s | R2, .61 s | R3, .40 s |
| 3 s (fill .45) | R2, .91 s | R3, .59 s | R5, .35 s |
| 5 s (fill .75) | R3, .99 s | R5, .58 s | R8, .36 s |

Short D degrades by fewer rounds (min 1) then compression (k<1); never by overlapping rounds. Tag params (add to `PARAMS.slidingLanes` in motion-phases.js): `speed [0,1]`, `holes [0.05,0.3]`, `seed` optional. D comes from the phase, not a param.

## 4. Algorithm (backward from solved)

```
1 S = [0..n-1]; H = max(1, round(holes*n)); pick H hole cells by weighted draw (non-ink w=3, ink w=1);
  fills = those ids; set S[c]=null. S_R = S.
2 forward axis[0] = rng()<.5 ? row : col; axis[r] alternates.
3 for r = R-1 down to 0:                       // build S_r from S_{r+1}
    ax = axis[r]; elig = lanes on ax with >=1 cube and >=1 hole
    if elig empty: ax = other; elig = recompute; if still empty: R = rounds built so far -> stop
    f  = lerp(rand(.5,.8), rand(.3,.5), r/(R-1 || 1))
    m  = clamp(round(f*|elig|), 1, |elig|); lanes = shuffle(elig).slice(0,m)
    for each lane L (len N, cubes c_1..c_q in order at p_1<..<p_q):
       repeat tries: pick q distinct sorted slots p' from 0..N-1 uniformly
         accept if some p'_i != p_i and max|p'_i-p_i| <= ceil(maxShiftFrac*N)
       fallback: move one cube adjacent to a hole by 1 into it
       write cubes at p' in S_r; forward Move{id, from:p'_i, to:p_i} (skip equal)
4 start = S_0; assign timing (§3) in forward order; recompute k if R shrank.
```

Order-preserving reslot: order kept both directions, so forward is legal too. Multi-shift falls out: segments split/merge with random spacing.

## 5. Rendering contract

`sampleLanes(p,t)`: replay ops whose `start+dur <= t` into positions; active op: `pos = from + (to-from)*ease((t-start)/dur)`. Identical ease+timing in a lane => gaps interpolate linearly between values >= 1 => no overlap. `vx,vy` = d pos/dt (feeds `aMot` x 0.25). `s`: 1 for non-hole ids; fill ids 0 until start, then ease 0->1. app: loop ids not cells; `put(id, x, y, vx*.25, -vy*.25, glass)`; no wrap duplicates; `uClip` may stay.

## 6. Composition

- Same phase OK: `lettersRotate` (rotation per cube), `radialWave`/`parallaxShift` (additive), `lightSweep` (reads rendered x,y).
- Not same phase: `tightSpacing` (also writes x per id) -> validator warns; lanes must end first. `revealMsg2` fine (separate DOM strip).
- Lanes never gate `lockedAt` when driven by phases; phase t1 is the end.

**Conflicts:** (1) lanes run inside the ~6 s cascade; D=2 s ends while glyphs still churn, so letters "resolve" by cascade, not slides. (2) 19x3: column lanes are 3 cells; column rounds barely move. (3) `lanesSolveAt` path goes dead.

## 7. Tests (node, pure)

1. same seed+opts => deep-equal plan; other seed differs.
2. replay start+rounds+fills => `S[c]===c` for all c.
3. each op: ids order along lane unchanged after op.
4. moves stay in lane, 0<=pos<N, `|to-from| <= ceil(.5N)`.
5. round ops share axis; lanes unique per round; every op has >=1 move.
6. consecutive rounds alternate axis unless other axis had 0 eligible.
7. lane count per round within taper band (by round fraction, rounded, min 1).
8. no cell double-occupied after any round; id multiset conserved.
9. fills cover exactly hole cells, all empty before fill.
10. duration fit: for D in {1.5,2,3,5,10} x speed {0,.5,1}: max(op end, fill end) <= D+1e-9, last fill end within 0.5*fill of D, R matches §3 table.
11. no time overlap: every op of round r+1 starts >= every end of round r.
12. sampleLanes at 50 t in a lane: adjacent cube gap >= 1-1e-9; at t=D all at solved cells, s=1.
13. 1x1, 1xN, 3x7 with holes=.05: no throw; 1xN has no col ops; 1x1 -> 0 rounds, fills only.

## 8. Edge cases

Few holes/tiny grid: R shrinks, k recomputed (D exact). Blank rows: plain cubes. 1xN: row lanes only. holes .3: maxShift caps long slides.

## 9. Cut for v1

Ink-weighted holes (uniform first), z-drop on fill (scale only), seed param, validator warning. Keep: backward build, order-preserving reslot, exact D fit, tests 1-12.

## Revision log

- v1 rigid shifts with wrap, per-cube stagger -> wrap = jump (N2); stagger lets cubes catch up (N1); ignores D.
- v2 order-preserving reslot, lane-shared timing, backward build -> few holes empty rounds; full-lane leaps; overruns D when slow.
- v3 eligibility + axis fallback + R shrink, maxShift, fallback step, exact-fit k, composition/conflicts from real timeline.
