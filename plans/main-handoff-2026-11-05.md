# Main handoff: thank-you-cards (2026-11-05)

Repo kr99/thank-you-cards, branch `claude/trusting-noether-ob96qp` (no PR yet). Live: https://kr99.github.io/thank-you-cards/ (unreachable from sandbox). Work dir `C:\projects\thank-you-cards`. Worktrees in `.claude/worktrees/` (untracked, in `.git/info/exclude` on the other machine).

## State (pushed HEAD 614c860 + uncommitted docs)
node tests: `node --test 'test/*.test.js'` -> 102 pass (Node 22 needs the glob). Never browser-verified since lanes3 wiring.

| Area | Status | Where |
|---|---|---|
| Share link ignored unapplied edits | FIXED (currentValuesJson + buildShareUrl) | card-values.js, card-share.js, app.js |
| Placeholder default msg | DONE ("YOUR MESSAGE HERE" + m2 placeholder; Kimber's card = `?c=` link) | config.js |
| m2 cutoff (incl. newlines) | FIXED: strip grows vertically | card-fit.js, text-layer.js, test/secondary-overflow.test.js |
| Controls container/regroup | DONE (`#controls`, 4 fieldsets, controls.css) | index.html, controls.css |
| Text/bg render split | PARTIAL (m2 layer + background only; cube text/lanes stay in app.js) | text-layer.js, bg-layer.js |
| Motion phases grammar+validate+scheduler | DONE, NOT WIRED into playback | motion-phases.js, `mp` in card-share.js |
| Picklist UI (up/down, text import/export) | DONE as component, NOT WIRED | motion-picklist.js, controls.css `.mp-` |
| radialWave/parallax math | DONE, NOT USED in app | effects-math.js |
| Lanes v3 (Opus spec v1) | WIRED in app.js, UNSEEN in browser | lanes3.js, lanes-frame.js |
| Lanes v4 (user Quote 4 redirect) | SPEC IN PROGRESS | see Next |

## NEXT (in order)
1. **Opus agent `a3e0685fb7348f56c`** is writing `plans/lanes-algorithm-spec-v2.md` (<=900 words; reads quotes + old spec + DIGEST v2). If lost: relaunch Opus with budget <=45k tokens/8 calls, inputs only [lanes-user-quotes.md](lanes-user-quotes.md) (4 quotes), [lanes-algorithm-spec.md](lanes-algorithm-spec.md), [lanes-context-digest.md](lanes-context-digest.md); core of Quote 4: each lane gets ONE overall determined slide (whole-lane replace or +-1), cubes roll off one end, new cubes enter other end, random gaps open/close during the slide, cubes anonymous, glyphs reveal only after cubes stop, final round closes all gaps; keep alternation, taper 50-80%->30-50%, duration D + speed param, lanes end at letter lock.
2. **Sonnet implements** the v2 spec as pure `planLanes4`+`sampleLanes` (tdd, node tests), then a second Sonnet wires it into app.js replacing Lanes3. Needs a per-cube "reveal glyph when stopped" hook (digest: none exists today).
3. **Phase scheduler wiring** (serial, app.js): `mp` present -> new scheduler, absent -> legacy path UNCHANGED (golden tests A,B guard this). tightSpacing reverts at next boundary unless in final phase. Wire picklist get/set into currentValuesJson/mergeCfg; replace t-lanes/t-sweep/t-letters later.
4. Cleanup: remove dead slide-lanes.js, plan-lanes.js (planLanes, planLanes2), W.laneT/laneSolved, K.lanesSolveAt after user OKs the new look.
5. Open PR only if user asks.

## Decisions made (user-approved unless noted)
- Replace default msg in place. Controls = container+CSS only (no JSON renderer). Fit = wrap then shrink then grow height; m1 never overlaps m2.
- Holes fill in at END; text blanks are cubes. Lanes END when letters lock (option b). tightSpacing option c (any phase, revert unless final). Agent decisions (not asked): `mp` lives in the `?c=` token only (no `motionPhases=` URL param; `parseHash` rejects `=`), effect params use `;` not `,`, <=16 tags, <=6 phases of 0.5-10s, picklist v1 = up/down buttons (user said "draggable": drag is v2, flag again), radialWave origin may be off-board, holes 15%.
- Legacy-flag->phase mapping REJECTED (critic: breaks golden playback). Instead absent `mp` = old path.

## User preferences / process rules learned
- Voice-to-text: fix spelling before quoting. Style: honey/caveman, telegraphic, tables, ASCII diagrams + code snippets in questions.
- Manager delegates all tool work; TDD (red before green); decide reversible things, ask on risky ones with confidence scores.
- **Opus is very expensive**: tiny budgets, give it digests not code. DON'T STOP running agents (user was upset; use budgets/messages instead). Always give agents token+time budgets.
- Give design agents real card/effects/timing context via a Sonnet-written digest ([lanes-context-digest.md](lanes-context-digest.md)).
- User asked: fresh vs fork? All agents so far were FRESH (no fork).
- Report stats (tokens, tool calls) at end.

## Environment gotchas
- Agents' git is blocked by an rtk worktree guard: manager must commit/merge: `git -C <worktree> add/commit`, `git merge worktree-agent-<id>`, and reset new worktrees from outside (`git -C <wt> reset --hard claude/trusting-noether-ob96qp`) right after launching; tell agents to wait for files (`ls`, sleep 20) and never run git.
- Playwright is blocked by a user PreToolUse hook (suggests browser-use skill needing profile confirmation); do not bypass. The user eyeballs animations in their browser (`start index.html`; card hides controls, press `c`).
- three.js CDN blocked in sandbox; smoke test used local three@0.149.0 (`THREE_JS` env) on the other machine; not installed here.
- Co-author trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File index
Design: [motion-phases-design.md](motion-phases-design.md), [motion-phases-critic.md](motion-phases-critic.md), [lanes-algorithm-spec.md](lanes-algorithm-spec.md) (v1, Opus), [lanes-user-quotes.md](lanes-user-quotes.md), [lanes-context-digest.md](lanes-context-digest.md). Earlier design/critic from scratchpad on the other machine is not preserved (design.md summarized in memory only).

## Unverified / risks
- Lanes3 look in browser; lanes window vs real lock (estimated from dry-run ticks); grid size (digest says rule gives 14x3 for placeholder, spec assumed 19x3); lightSweep/tight with lanes; mid-run lane toggle.
- Overlap of m1/m2 only unit-tested + one older screenshot.
- Tests assert pure logic only; no E2E in CI.

## Stats so far (approx, subagent tokens / tool calls)
Design 106k/8; critic 87k/6; phase0 93k/14; fit 100k/20; lanes 93k/19; share 97k/33; merges 88k/14,83k/12; placeholder 79k/11; controls 104k/20; render split 104k/15; newline fix ~99k/45; motion design 91k/15; motion critic 78k/8; P1 75k/17 (+9k failed run); P2 82k/26; P3 58k/14; picklist 85k/23; lanes engine v2 96k/34; Opus spec v1 ~90k/26 (+ one stopped run); Sonnet digests 67k/7, 75k/8; lanes3 impl 61k/11; lanes3 wiring 67k/27. Total ~2.0M tokens, ~420 calls. Opus v2 pending.
