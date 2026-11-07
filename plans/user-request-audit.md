# User request audit (2026-11-07)

Sources: 44 user turns in the two transcripts (06cc7555, 0b86ffde; both start with a context summary, so pre-2026-11-05 prompts exist only as summary text); plans/lanes-user-quotes.md, main-handoff-2026-11-05.md, motion-phases-design.md, lanes4-integration-plan.md. Code read-only. Dates are transcript timestamps (UTC). Line numbers are current working tree.
Cost: S <1 agent-round, M ~1-2, L 3+ or multi-module. Reversibility: two-way = easy to change later; one-way = changes share-link format / saved data.

| # | Request (user's words, grammar fixed; date) | Status | Evidence | Cost | Reversibility |
|---|---|---|---|---|---|
| 1 | "more like a draggable picklist into phases" (11-05 22:36). v1 shipped as up/down buttons; handoff said "flag again". | MISSING (drag) | no `drag` in motion-picklist.js; buttons only | M | two-way |
| 2 | Picklist/phases in the UI: "tag can be a phase boundary or effect", 2 starting phases with lengths | PARTIAL: component + `#motionpicklist` div exist, never mounted | index.html:132,168; no `MotionPicklist` in app.js | M | two-way (UI) |
| 3 | Phase scheduler drives playback: lettersRotate, slidingLanes in phase 1, lightSweep in 2, tightSpacing last, revert if earlier phase | MISSING: motion-phases.js is loaded but app.js never reads `mp`; old `t-lanes/t-sweep/t-letters` toggles still drive | index.html:167; app.js has no `MotionPhases`/`c.mp`; index.html:103,126,127 | L | one-way once `mp` is the saved format |
| 4 | URL/JSON carries the phase list: "motionPhases=phase:3s,lettersRotate,..." (format, not literal) | PARTIAL: `mp` validated in token, but app never emits or merges it | card-share.js:75,91; app.js:753 `currentCfg` has no `mp` | S (after #3) | one-way |
| 5 | Two new effects: parallax rearranging of dice; radial waveform from a point, on or off board | PARTIAL: pure math + grammar only, unused | effects-math.js (not in index.html scripts); motion-phases.js:8-12 | M | two-way |
| 6 | Sliding lanes pre-planned, alternating all-rows / all-columns rounds (Quote 1) | DONE | lanes4.js:86-90 (`k % 2`) | - | - |
| 7 | Quote 1: each round slides 50-80% of lanes, tapering to 30-50% | UNCLEAR: superseded by dice shifts (Quote 4); every lane is rolled each round (shift may be 0), no per-round lane-fraction | lanes4.js:92-95 | M if wanted | two-way |
| 8 | Empty spots/gaps in lanes, random, open/close during slide (Quote 2/4) | DONE | lanes4.js:80-82, `planLane` | - | - |
| 9 | "Holes fill in at the end; text blanks are cubes"; last shift gapless | DONE (tested) | lanes4.js:89 `last`; test/lanes-card.test.js frame t>=T = full grid | - | - |
| 10 | Glyphs "reveal only when cubes stop moving" (Quote 4) | PARTIAL: plan emits `stopped`, frame/app drop it; glyph cascade runs independently inside the lanes window | lanes4.js:113-116 vs lanes-frame4.js:16 and app.js put() | M | two-way |
| 11 | Shift dice 3d{1,3,5,7 sides}, curve distribution, row/col movement comparable, N-1 col shifts rare; "code it so we can play with the numbers" | DONE (params hidden) | lanes4.js:22-24 `LAMBDA`, `CAP_ROW/COL` | - | - |
| 12 | "Min column size of 4 even if the message does not use it" (11-06 00:00, then replaced by the "movement similar" ask in the same turn) | UNCLEAR: row count clamps to 3..5; panel R allows 1..8 default 3 | app.js:294; lanes-panel.js:9 | S | two-way |
| 13 | Lanes feature "under the sliding-rows panel (expandable)", collapsible controls (11-07 18:50) | DONE | lanes-panel.js:85 `<details>`; side-panel.js:26; index.html:153 | - | - |
| 14 | "Side panel where specific things can be configured; control sub-card is cramped" (11-07 19:01) | DONE for lanes; PARTIAL overall: other controls still in the cramped `#controls` card | index.html:153 vs 56-151 | M | two-way |
| 15 | Keep controls: rows, columns, random seed, total time, number of shifts | DONE | lanes-panel.js:8-11; lanes4.js:27-29 | - | - |
| 16 | Gap chance max .20; drop "full lane replace" (Q_FULL=0 hidden); shift-size params hidden and not in JSON; col max shift 1.9; drop "rigid" style | DONE | lanes4.js:11,23-24; card-share.js:80,88; lanes-panel.js:6; no `rigid` anywhere | - | - |
| 17 | Rows and columns of the panel saved in share link | MISSING: only `ln:{seed,T,K,GAP_P}` serialized; R/C go to `S.rowsOverride/colsOverride`, read only from `?rows=`/`?cols=` | app.js:42-43,406,753-754 | S | one-way (adds keys) |
| 18 | Play / pause, time slider | DONE | lanes-player.js; lanes-panel.js:79 | - | - |
| 19 | Loop with a hold on the final state before looping; default off | DONE for lanes window; loop/hold NOT in share payload; loops only the lanes window, not the whole card | lanes-player.js:9-16; lanes-panel.js:59-66; app.js:6 `lpOpts` | S (payload) | one-way (payload) |
| 20 | "Tick marks at the boundary of each stage (each stage can have configurable length)" | PARTIAL: ticks exist but at K equal shift boundaries; stages with configurable lengths = motion phases, unwired (#3) | lanes4.js:121-125; lanes-panel.js:71 | M (needs #3 to define "stage") | two-way |
| 21 | "All features tested and testable in the card" | PARTIAL: pure-logic node tests only; no E2E (Playwright blocked by hook) | test/*.test.js; handoff "no E2E in CI" | M | two-way |
| 22 | Message cubes stay visible; blank cubes resolve and fade first, then message cubes fade behind the letters (11-07 19:01) | PARTIAL: `blankBevel`/`messageBevel` computed and unit-tested, never read; app only stores `run.bevel` | card-timing.js:96,106-107; test/card-timing-fade.test.js; app.js:506 (only `tl.bevel`) | M (shader/uniform per-cube class) | two-way |
| 23 | Cleanup of dead old lanes code (handoff next step 4) | PARTIAL: app uses Lanes4 only, but slide-lanes.js, plan-lanes.js still loaded; lanes3.js, lanes-frame.js orphaned; `W.laneT/laneSolved`, `K.lanesSolveAt` dead; tests for old modules remain | index.html:160-161; app.js:74,267,378; test/lanes{,2,3}.test.js, slide-holes.test.js | S | two-way |
| 24 | Share link covers all settings (11-05 "always current values"; JSON from form) | PARTIAL: covered: message, effects, bg, ln visible params. Missing: R/C, loop, loopHold, `mp`, tight revert state; `LV` values changed in panel only ride via `ln` non-defaults | card-share.js:14-16,200; app.js:753-754 | S-M | one-way |
| 25 | m2 fits (no char limit), card grows vertically; placeholder default | DONE | card-fit.js, text-layer.js; config.js:3-4 | - | - |
| 26 | Gap opening smooth (not popping), T=5.5, GAP_P=.15 defaults, clearer labels | DONE | lanes4.js:23; LANES4_UI labels | - | - |
| 27 | "Controls container, regroup" | DONE | index.html:56-149 | - | - |

Honest limits: transcripts contain only 44 user turns (older turns exist only inside summaries, text truncated); items from before 11-05 are from those summaries. No browser verification was possible, so DONE means "present in code/tests", not "looks right".

## Clarifying questions (ranked by code dependent on the answer)

1. **Phases become the master timeline?** Should `mp` (phase list) replace `t-lanes/t-sweep/t-letters/t-tight` and the lanes window, with the old toggles removed, or run beside them (absent `mp` = legacy path)? Touches app.js timeline, share format, #3/#4/#20/#22. Recommend: keep legacy when `mp` absent (as handoff decided); wire the scheduler behind a "Use phases" switch; migrate toggles later.
2. **Loop scope.** Loop only the sliding-rows window, or the whole card (cascade + lanes + fade + message hold)? Recommend: whole card, hold = existing `loopHold`; lanes player keeps its own scrub only.
3. **What is a "stage" for tick marks?** The K shifts, the motion phases, or the card timeline (cascade/lanes/fade/hold)? Recommend: two tick tiers: card phases (cascade, lanes, fade, hold) on the main slider, K-shifts as minor ticks inside the lanes window.
4. **Fade order target.** Confirm: lanes end, blank cubes fade first (~250ms), then ~80ms gap, then message cubes fade behind letters. Matches existing `blankFadeMs/fadeGapMs`. Recommend: yes, wire `blankBevel/messageBevel` with these defaults; expose no UI.
5. **Reveal glyph only when cube stops.** Hold glyphs hidden/scrambled until `stopped`, or keep today's cascade running under the slide? Recommend: gate reveal on `stopped` per cube (pass `stopped` through lanesFrame4).
6. **Share link scope.** Add `R`, `C`, `loop`, `loopHold` (and `mp`) to the `ln`/top-level payload? Recommend: yes, non-default-only, inside `ln` (`ln.R`, `ln.C`, `ln.loop`, `ln.hold`); cheap now, one-way later.
7. **Draggable picklist.** Drag-and-drop now (HTML5 drag + touch fallback) or keep up/down buttons? Recommend: keep buttons plus add native HTML5 drag (no library); touch relies on buttons.
8. **Min rows.** Does "min col size 4" mean at least 4 rows (column length) always? Recommend: yes, clamp rows to min 4 in the auto rule (currently 3); allow panel override down to 3.
9. **Lane fraction per round (Quote 1: 50-80% tapering to 30-50%).** Still wanted on top of the dice shifts? Recommend: no, dice with `s=0` already leaves lanes still; drop Quote 1 unless the demo looks too busy.
10. **Move more of `#controls` into the side panel?** Recommend: move Motion fieldset (incl. picklist) into the side panel, leave Message/Look/Share in the card.
