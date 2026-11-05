# DIGEST v2
Facts only (from code read; "?" = not verified). Files: app.js, card-timing.js, glyph-engine.js, lanes3.js, lanes-frame.js, motion-phases.js, effects-math.js.

## 1. Card + timeline
```
 perspective cam, bg = circuit-board texture (full stage)
 +--------------------------+   grid cols x rows of glass cubes,
 |   [C][C][C]...[C]  row0  |   each shows one glyph; message laid
 |   [C][C][C]...[C]  row1  |   out centered (G.layoutText), blanks
 |   [C][C][C]...[C]  row2  |   = background cells
 |   msg2 strip (DOM) below |
 +--------------------------+
```
Time t=0 at play(); run.ms in ms.
| t (s) | viewer sees |
|---|---|
| 0 -> ~6 (sim ticks*75ms; ~6s per user, exact depends on text) | glyphs churn random fonts/symbols per cell, cascade ripple resolves cells to target; cells tilt (letters rotate) |
| cascadeEnd-3 -> cascadeEnd | LANES window (LANES_D=3, speed .5): plan sampled by lanesFrame |
| cascadeEnd = lock | every cell locked and act 0 -> run.lockedAt; lanes STOP (only drawn while lockedAt===null; snaps to grid) |
| +0.1 | locked hold |
| +0.1 -> +1.35 | cubes fade (bevel 1->0), sweep (sweepDur 1.2s) inside; fade = 1250ms w/ sweep else 400 |
| then 1.0s | tight slide: glyph x to proportional spacing, scale to <=1.2 |
| msg2 | starts at lock+0 (decode) or +150ms (fade), 1.6s decode / 0.9s fade, runs parallel (secondaryEarly) |
Bg: crawl ramp (2s) from 'done' (tight) else 'locked'; bg blur ramp (2s) from 'sliding'.
Timeline phases: resolving, locked, cubesFading, sliding, secondary, done; pure fn of t.

## 2. Grid
- cols = clamp(longestLine+2, 7, 42); rows = clamp(lines+2, 3, 5); overrides colsOverride/rowsOverride. Default placeholder text -> 19x3? (YOUR MESSAGE HERE = 12 + 2 -> not 19; 19x3 not verified; ? check config)
- cube K.cubeSize 0.86 (unit cell 1.0 => gap 0.14), box depth 0.86 (BoxGeometry 1,1,1 * uSize), glyph plane 1.1. Cell center x = col-(cols-1)/2, y = -(row-(rows-1)/2), z=0.
- Camera: Perspective fov 20, at z=D centered on grid (shifted down by secExtra/2); frames (rows+.8+secExtra) high, (cols+.8) wide => ~0.4 cell margin each side.
- Clip: shader has uClip/uHalf (clip beyond cols/2, rows/2) but uClip=0 and never set => NO clip, NO edge fade. Cubes at x outside grid ARE drawn if on-screen (only 0.4 cell margin visible at fit-limited axis; more on the other axis if aspect differs). Bg shows through everywhere.

## 3. Rendering API
- put(id, px, py, mx, my, laneGlass, sc): id = cell/cube index into W.cells (per-cube state); px,py grid coords (fractional ok, offscreen ok); mx,my motion-blur vec (lanes pass vx*.25, -vy*.25); laneGlass = fx.y activity floor; sc = whole-cube scale (aGly.x).
- Instanced buffers sized W.n*4 (cap 4x cells); instanceCount = n written. Extra entering cubes beyond rows*cols CAN be drawn up to 4*n, but put() requires an existing W.cells[id] (id < n) => one id can't be drawn twice; extra cubes need new cells entries / buffer rework. Not verified whether 4x buffer is used elsewhere.
- Glyph state is PER CELL INDEX (W.cells[i] = {shown, pending, u, blur, act, cx,cy,lx,ly,...}), glyph for cell i from W.sim.cells[i] (sim is per cell; cascade stagger by cell position). Cubes carry the glyph of their id; lanes move ids, so glyph rides the cube.
- Churn: sim.step() every 75ms changes cell glyph (pending=true) -> stepCell: turn out (u->1 in .07s), swap glyph at peak, un-turn (.2s; locked .3s). Cell settles when sim cell locked and act decays (actDown 1.7/s).
- Reveal: no "reveal now" API. Glyph = sim cell state; reveals only when sim locks that cell (timing from sim: duration 40 ticks per cell, stagger, ripple wave, relapse, blankDelay 12). Could be changed by editing sim; not per-cube command today. Glyph also hidden by uv=0 if atlas not ready or glyph ' '.

## 4. Lanes3 (being replaced)
- planLanes3(rows,cols,{seed,D=3,speed=.5,holes=.15,...}) -> {rows,cols,D,start(cell->id|null),rounds[{ops[{axis,index,start,dur,moves[{id,from,to}]}]}],fills[{id,cell,start,dur}]}. Planned backward from solved grid with 15% holes, forward timing; fill = hole cubes scale-in at end.
- sampleLanes(plan,t) -> per cubeId {x,y,vx,vy,s}; ease cubic in-out; x,y grid units, v in grid/s, s 0..1 (0 = hidden).
- lanesFrame(plan,nowMs,windowStartMs): t=clamp((now-start)/1000,0,D+1), returns sampleLanes. Window start = max(0, ticks*75 - D*1000). Moves stay inside grid (ops are within-row/col permutations into holes).

## 5. Other effects (S flags from config.js)
- letters (on): tilt rotX/rotY per cell, M=1.05*(1-.72p) * u. sweep (on): diagonal glow, 1.2s, across cubes at lock. crawl (on): bg speed -> x0.03 (crawlK) over 2s. blur (on): bg blur 2.7px over 2s. runes off. cpulse/pvar on (bg pulses). tight (lay=tight): slide 1s, easeInOutCubic. msg2 s2=decode. cubes false (random cube flips off; linked true). wave (effects-math radialWave: v .1-4, x,y -10..10, width1.2, lambda2) and parallax (3 depth layers, dx = amp*(2d-1)*sin(pi u)) exist as pure math; use in app? not verified.

## 6. Phase scheduler (motion-phases.js)
Text: `phase:3s,lettersRotate,slidingLanes,phase:1.5s,radialWave;x=-0.5;y=1;v=2`. ',' separates tags, ';' params. Effects: lettersRotate, slidingLanes, lightSweep, tightSpacing, revealMsg2, parallaxShift(amp 0-1), radialWave(x,y,v). Phase dur 0.5-10s (implicit first phase 3s if effects lead), max 6 phases/16 tags. phasesToTimeline -> [{effect,params,phase,t0,t1,revertAt}]; tightSpacing reverts at phase end unless final. NOT wired to app.js (app comment: "phase scheduler will supply later"; MotionPhases only loaded in index.html).

## 7. Limits / unknowns
- Not determined: actual cascade length (seconds) for given text; 19x3 default; visible margin beyond grid on wide aspect; circuit-bg internals (not read); glyph-engine createSim internals beyond cfg; whether radialWave/parallax are used in app.
- Hard: 4*n instance buffer; per-id single draw; no clip/fade; glyph reveal bound to sim lock timing; letters atlas must be ready; lanes only drawn pre-lock.
