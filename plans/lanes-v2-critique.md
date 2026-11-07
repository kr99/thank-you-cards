# Lanes v2 critique

## A. Questions (ranked by code impact)
1. Rigid slide or reshuffle? Pairing remaining-A to FRONT-most B means a lane with s=0 still moves cubes whenever A gaps != B gaps, and some cubes move backward. Is "s=0 = zero movement" (Quote 6) required? If yes, B must be derived from A (rigid slide + entering cubes + independent gap toggles), not drawn fresh.
2. Rows full-replace: Quote 6 says "not more than ~1/2 of a row"; Quote 8 allows full replace for columns only. Spec allows it for rows too (Q_FULL, CAP_ROW=1). Keep?
3. Speed: Quote 7 asked for max randomized "in a linear way"; spec uses log-uniform W. Linear OK, or is log-uniform the intended "wider, more variable" (Quote 9)?
4. Easing: speed hits 0 at every step boundary (no true rest). Want a hold (dwell) between shifts, or is the touch-zero enough?
5. Gap cap: Quote 3 "don't expect >3 gaps" vs Quote 4 "no other rules". Confirm no cap (spec choice) — at GAP_P=0.05, C=14, P(>3)~0.4%, fine.
6. Grid: 14x3 or 19x3? 3-tall cols with LAMBDA=0.5 get S~4.4, w up to 2 -> cap 6 = 2L: columns nearly always fully replace. Intended?

## B. Suggestions
- Replace "front-most pairing + surplus rule" with: cube i target = A_i + s; then drop/insert cubes to match B by index from the back edge. Reason: one rule, rigid feel, no backward moves, no surplus branch.
- If keeping fresh B: clamp target >= origin along dir (already in Open). Reason: kills backward cubes cheaply.
- Last step: only last-axis lanes are gapless; assert entering count = L - r >= 0 always. Reason: test 2 depends on it; off-board cubes from prior steps must be dropped, not carried.
- Drop cubes ending off board from the plan after each step. Reason: "clipped at render, not removed" grows cube count unbounded across K.
- Define half-cell clip concretely (render if -0.5 < x < C-0.5). Reason: spec leaves it to the agent.
- Small L: round() on S*w*u2*u3 makes |s|<=1 dominate for L=3. Fine, but test it on 14x3.

## C. Cut
- Q_FULL: CAP_COL=2 already yields full replaces; redundant knob.
- A0_GAPS: pick one (gaps on) — YAGNI.
- LAMBDA or W range: both scale magnitude; keep W, fix LAMBDA unless tuning proves need.
- Test 8 (code path unchanged) — not testable meaningfully; drop.
