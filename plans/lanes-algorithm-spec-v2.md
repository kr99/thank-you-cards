# Lanes algorithm spec v2 (planLanes4 + sampleLanes4)

Supersedes [lanes-algorithm-spec.md](lanes-algorithm-spec.md) (v1). Context: [lanes-context-digest.md](lanes-context-digest.md), [lanes-user-quotes.md](lanes-user-quotes.md). User's exact words for this design: appendix below.
Status: design agreed in chat 2026-11-05; numbers are TUNABLE constants, algorithm shape is the decision.

## Idea
Grid R rows x C cols of anonymous cubes. K shifts, alternating axis (rows, cols, rows, ...). Each shift: every lane on that axis slides a random signed distance. Each lane has a start layout A and end layout B; both have random gaps. Cubes move start->end together, so gaps open/close because spacing differs between A and B. No gap logic mid-move. Last shift: B gapless, so grid is packed at the letter lock. Glyphs show only when `stopped`.

## Constants (all overridable via `params`; defaults)
| name | default | meaning |
|---|---|---|
| K | 5 | number of shifts (axis alternates, rows first) |
| T | given | phase length; shift duration D = T/K |
| GAP_P | 0.05 | per-cell chance a cell is empty in any layout (~half of 14-wide rows have >=1 gap). No other gap rule, no cap. |
| LAMBDA | 0.5 | 0 = scale by own lane length, 1 = same scale both axes |
| CAP_ROW / CAP_COL | 1 / 2 | max |shift| = CAP * lane length (cols may exceed lane = fast full replace) |
| W_LO, W_HI | 0.5, 2 | per-lane size multiplier range, log-uniform |
| Q_FULL | 0.05 | per lane per shift: override with full replace s = +-L |
| A0_GAPS | true | initial layout A0 uses GAP_P (false = full grid) |
| seed | given | deterministic PRNG (mulberry32); same seed+params => same plan |

## Per-lane shift (pure)
```
Lref = sqrt(R*C);  L = lane length (row: C, col: R)
S = L^(1-LAMBDA) * Lref^LAMBDA
w = W_LO * (W_HI/W_LO)^u1                 // log-uniform
M = min(CAP*L, S*w)
s = round(M * u2 * (2*u3 - 1))            // product of uniforms: peak at 0
if u4 < Q_FULL: s = (u5<.5?-1:1) * L
dir = s>=0 ? +1 : -1 (s==0 -> +1);  dist = |s|
```
Front = the end cubes move toward (high index if dir>0).

## Per-lane plan for one shift
- A = occupied cells of the lane now (from previous step's end state; step 1: A0).
- B = fresh layout over [0,L): each cell empty with prob GAP_P (last step: all occupied).
- Exiting: A cubes with position + dir*dist outside [0,L). They end at that rigid-slid position (off board).
- Remaining A cubes (r of them, in order) pair j-th <-> j-th with the FRONT-most r cubes of B.
- Entering: remaining B cubes (back-most, |B|-r of them) start at B_j - dir*dist (off board) and end at B_j.
- If remaining A > |B|: surplus back-most remaining A cubes exit past the front edge. (agent may pick simplest equivalent rule; document it)
- Cubes never cross (order-preserving). Entering/exiting are clipped at render, not removed from plan.

## Time + easing
Global t in [0,T]. Step k covers [(k-1)D, kD]; tau = local/D; `u(tau) = (1-cos(pi*tau))/2` (speed ~ sin: slow-fast-slow, rests between steps). Position = from + (to-from)*u.

## API (pure, no DOM)
- `planLanes4({R, C, T, seed, params}) -> plan` : per step, per cube: `{fx,fy,tx,ty}` (row step moves x, col step moves y).
- `sampleLanes4(plan, t) -> [{x, y, stopped}]` for on-board cubes only (0<=x<C, 0<=y<R, with a half-cell clip rule documented). `stopped = t >= T`.
- Export `LANES4_DEFAULTS`.

## Property tests (write first)
1. Same seed+params => identical plan; different seed => differs.
2. At t=T: every board cell has exactly one cube, no duplicates (packed).
3. Order preserved: within a lane no two cubes cross at sampled t.
4. Gap fraction over many seeds/layouts ~ GAP_P (+-tolerance).
5. s distribution: peak at 0; P(|s|>=L) rare with Q_FULL=0 and CAP_COL=1; with Q_FULL=1 every lane |s|=L.
6. K=1, K=5 steps alternate axes; K param changes step duration only.
7. Continuity: cube end of step k == start of step k+1 (for surviving cubes).
8. LAMBDA/CAP/W params change distribution without changing code path.

## Open / unverified
- Grid size: digest says default text gives 14x3, v1 assumed 19x3. Take R,C as inputs, never hardcode.
- Backward moves: a pairing can move a cube against dir; accepted for v1, judge by eye (option: clamp B_j >= A_j along dir).
- Visual look unverified in browser (Playwright blocked; user checks by eye).
- Alternation of direction (v1/Quote 4) dropped: direction = sign(shift).

## Appendix: user's words (voice-to-text fixed; chronological)
1. "I want gaps to open and close with the movement."
2. "There is a start and end position for each cube in a shifting row, and gaps at start and end (not in the middle)."
3. "A and B need not have the same count of cubes or gaps, though I don't expect >3 gaps in any row at a given time. Overall I expect a gap in every other row on average, and a couple rows with 2 or 3 gaps, so figure out the overall percent likelihood of any position having a gap if randomized independently."
4. "Make that likelihood a constant, and base gaps on that, without any other rules determining gaps."
5. "Front and back are determined by randomized shift of N, which is rolled like 3 dice of 3 sides each (-1, 0, 1). So we will tend toward zero motion. Actually, let's choose a different random range for each row, where it is 3d{2|3|4|5} where the number of sides is randomized per row. This gives more variation in speed and feel of randomness."
6. "Number of sides can be 1,3,5,7. 1-sided means zero movement (wanted at times), and 0 is always a possibility. If a row or column is < 3*N then reduce the maximum number of sides. Or in other words, let's not try to replace more than about 1/2 of a row or column at any given time. The shifts may speed up if there is less time given. We will parameterize the number of shifts (always rows, columns, rows, columns, ...) and plan about 5 by default; the length of the phase divided by number of shifts determines the required speed of the shifts. The shift speed should move like a sine wave so the dice slide around smoothly."
7. "Let's have the die roll be 3 dice chosen so the max is the size of the row. The goal is a curve, so maybe you can simplify the formula for distance shift without using a set number of dice? What kind of distribution and how would you calculate that? So you randomize the max roll value in a linear way, then choose a random value from -max to max on a (distribution type?)..."
8. "I think I want the movement on rows and columns to look about the same, not exact, but relatively in range of each other, so we don't have columns really slow and little movement while rows shift a ton. Maybe calculate based on row AND col size, but weighted toward whatever is shifting? It might mean columns shift completely at times..."
9. "I want row movement max to be more variable, and wider. When I said in range of each other, I didn't mean 'so close you lose real movement in rows'. Remember we still want randomization of movement size... I am not sure what I want, can you try to explain in math what I am imagining visually?"
10. "Code it so we can play with the numbers a bit, without changing the whole algorithm. That's my decision. I think this algorithm is likely close. Have an Opus agent critique the conversation (my prompts, your summary of end product) and offer any questions and suggestions. Opus low effort. I do think what we have is simpler, far simpler."
