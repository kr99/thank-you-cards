# Critic: motion-phases-design.md vs code (read-only)

Base: C:\projects\thank-you-cards\ (design: plans\motion-phases-design.md)

## Q1 cubes slide under cubes: CONFIRMED (model level)
- plan-lanes.js:29-15 applyRounds: full torus rotation, every cell in lane moves.
- slide-lanes.js:62-89 _commit: all cells of lane shifted with mod wrap.
- slide-lanes.js:71-72,80 corrX/corrY patch continuity; decay tau 0.16 (:71).
- Visual overlap mid-flight not rendered-verified.

## Issues
| # | Sev | Issue | Evidence | Fix |
|---|---|---|---|---|
| 1 | HIGH | Holes unsupported. grid = Int32 ids, no -1; _commit rotates holes with lane | slide-lanes.js:92,69-73; verify() rejects v<0 at :403-407; app.js:532-540 put(st.id) | Add run-into-hole primitive (`_commitRun`); -1 guard in app.js draw and verify; planLanes2 steps map to it |
| 2 | HIGH | Legacy mapping uses TL defaults; app uses different values | app.js:467-470 (fade 1250+50 or 400, secMs 900/1600, delay 150, secondaryEarly true); card-timing.js:84 TL fade 700, secMs 1200 | Golden test compares to tlOpts() output, not TL |
| 3 | HIGH | Lanes and sweep not timeline-driven; no phase hook | lanes start in play() app.js:371-374; solve at laneT>1.5 app.js:575; sweep at allSettled app.js:586 | Phase binding for slidingLanes/lightSweep needs explicit offsets, or drop phase binding for them |
| 4 | HIGH | Min 0.5s dur cannot express 100ms lockedHold | card-timing.js:84 lockedHoldMs 100 | Allow 0.1 min or model hold as fixed pre-phase |
| 5 | HIGH | `motionPhases=` param channel dead on hash | card-share.js:121 parseHash rejects any '=' | Drop channel 2; token only |
| 6 | MED | tag regex excludes '-' (off-board negative origin) | design regex `^[A-Za-z:.,=0-9]{1,40}$` | Add '-' |
| 7 | MED | comma split ambiguous with radialWave x=,y=,v= | design grammar | Attach '=' tokens to prior effect |
| 8 | MED | User example already = 8 tags (max); radialWave/parallax overflow, silently dropped | design max 8 | Count effects, not params; raise cap |
| 9 | MED | tightSpacing revert impossible: slideT pinned 1 after sliding | card-timing.js:108 | Add reverse tween state |
| 10 | MED | tight needs W.tlay; silent fallback | app.js:470 `!!W.tlay` | Fail loud in validate or test |
| 11 | MED | P5 shader lives in app.js:68-98, not parallel-safe with S1/S2 | app.js:68-98 | Serialize P5 after S2 |
| 12 | MED | Missing contracts: planLanes2<->SlideLanes API, motionPhasesOf in currentCfg/apply | app.js:722,748 | Add to freeze list F4 |
| 13 | LOW | Baseline `node --test test/` claim not run | test/ has 14 test files | Run before S-series |

## Revised confidence (was -> now)
| Decision | Was | Now | Why |
|---|---|---|---|
| Backward gen (option 1) | 80 | 55 | engine needs new move primitive (#1) |
| Holes = text blanks | 55 | 55 | unchanged; draw/verify change added |
| tightSpacing option c | 70 | 60 | no revert in timeline (#9) |
| mp token + param | 75 | 60 | hash '=' rule (#5), caps (#8) |
| Legacy mapping keeps golden A | 65 | 35 | TL vs tlOpts (#2), lanes/sweep not timeline (#3) |
| Picklist = buttons v1 | 85 | 85 | no contrary evidence |
