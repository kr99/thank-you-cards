# Lanes context digest (facts only; source: README, config.js, card-timing.js, app.js, motion-phases.js, effects-math.js)

## The card
Animated thank-you card. Glass cubes in a grid over a generated circuit-board background (tron palette, "pcb"). Cubes show random symbols that decode into the message, then cubes fade, letters remain.
```
+--------------------------------------+   (19 cols x 3 rows, default msg)
| [?][#][λ][Y][O][U][R][ ][M]...[E]    |   each [x] = glass cube, 1 glyph
| ... message centered on middle row   |   rows above/below = non-letter cubes
| ... (msg2 strip appears below later) |
+--------------------------------------+
```
## Grid / cubes
- cols = clamp(longest line+2, 7, 42); rows = clamp(lines+2, 3, 5). Default "YOUR MESSAGE HERE" = 19x3 (57 cells). Fallback 7x4. `cols`/`rows` URL overrides exist.
- Every cell is a cube (letters AND blanks/filler); message glyphs sit centered, rest are symbol/blank cubes.
- Cell pitch 1 unit; cube size 0.86 (K.cubeSize); glyph size 1.1; fov 20. Depth: unit BoxGeometry scaled by uSize (z-depth value not verified).
- Render: three.js r149, ONE InstancedMesh (BoxGeometry, custom shader), buffer capacity 4*cells (extra instances = wrap-around copies for toroidal lanes). Per-instance attrs: aPos (x,y,z world), aCube (cube rotation x,y), aLet (letter tilt), aUV (glyph atlas), aFx (blur, activity/glass, shine, seed), aMot (motion vector, lane velocity*.25), aGly (glyph scale/shift). Cell may be skipped (hole = no cube). Clip uniform discards fragments outside grid box while lanes are active.

## Timeline today (run.ms from play start; pure fn of t)
| Phase | Duration | Notes |
|---|---|---|
| resolving | until all cells locked+settled AND lanes idle | glyph sim ticks 75 ms; lanes run HERE, parallel with decode |
| locked | 100 ms | |
| cubesFading | max(1250 ms w/ sweep, 400 ms w/o) | light sweep plays here; bevel 1->0 |
| sliding | 1000 ms (tight only) | easeInOutCubic |
| secondary | delay 0/150 + 1600 (decode)/900 (fade) | msg2 starts at lockedAt+delay (secondaryEarly), parallel with fade/slide |
| done | | |
- Lanes: started at play start (planLanes2 hole plan: start -> rounds -> fill -> solved); legacy solve at 1.5 s (K.lanesSolveAt) only if not hole-plan. Lanes finish BEFORE "locked" (settled requires lanes idle).
- Config today: lay=tight, lanes/sweep/crawl/blur/cpulse/pvar on, runes off, cubes(flip) off, letters(tilt) on, linked on, mode2=decode.

## Other effects (1 line each)
- letters (lettersRotate): glyphs tilt in cube per sim progress (maxTilt 1.05 rad), settle on lock.
- cubes: whole cubes flip by 90/180 deg randomly while active.
- lightSweep: diagonal gaussian shine band across cubes, 1.2 s, once at lock.
- crawl: bg time scale ramps speed(0.65) -> x crawlK 0.03 over 2 s after locked (or done if tight).
- blur: bg blur ramps to 2.7 px over 2 s from sliding start.
- runes: bg circuit tips use runes (off in config). cpulse: bg pulses on hover/click.
- tightSpacing: grid glyphs slide x to proportional typographic positions + scale (<=1.2x).
- revealMsg2: secondary message fade/decode strip below.
- parallaxShift (EffectsMath): per-cell seeded 3 depth layers, dx +/- and dz offset, envelope sin(pi*u), 0 at ends. radialWave: ripple intensity from origin (x,y), speed v, gaussian width 1.2, wavelength 2.
- Background: pcb circuit texture, redrawn 30 fps at 1024 px.

## New phase scheduler (motion-phases.js; NOT yet wired into app.js)
- Text: `phase:3s,lettersRotate,slidingLanes,phase:1.5s,radialWave;x=-0.5;y=1;v=2`. `,` separates tags, `;` params.
- `phase:<dur>` dur 0.5..10 s (0.1 rounding), max 6 phases, 16 tags; effects before any phase form implicit 3 s phase 1.
- Effects: lettersRotate, slidingLanes, lightSweep, tightSpacing, revealMsg2, parallaxShift(amp 0..1), radialWave(x,y -10..10, v .1..4).
- Each effect binds to its phase: {effect, params, phase, t0, t1} in seconds; tightSpacing reverts at phase end unless final phase.

## Lanes start/end state
- Start: full grid of cubes, all cells present (random symbols). End: all cells back at grid positions, letters formed by cubes on the message row.
- Holes (cells with no cube) allowed mid-animation by hole plan.

## Performance
- Frame dt clamp 2 s, consumed in <=50 ms slices; max 40 sim ticks/frame. No target fps stated for cubes (bg 30 fps). Debug overlay shows fps.

## Not determined
- Cube depth (z) value; lane row/col directions/velocity limits (lane code excluded); whether motion-phases will replace timeline().
