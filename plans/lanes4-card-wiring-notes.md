# Lanes4 card wiring notes (stream C)
## Integration points (app.js, pre-edit line numbers)
- :4-5 globals L3/LF/LANES_D/SPEED -> L4/LF4. :257 W.lanes/laneT/laneSolved.
- :293-303 instance buffer N=W.n*4 (cap 4n cubes). :374-379 play(): same-seed dry-run sim gives cascade `ticks`; window start `laneStartMs = max(0, ticks*tickMs - D*1000)`.
- :519 `ls = LF.lanesFrame(W.lanes, run.ms, W.laneStartMs)` only while `run.lockedAt===null`. :520 put(id,...) does `c=W.cells[id]`, `W.so.dx[id]/sc[id]`.
- :540-546 loop over ls (skip s<=0), else grid. :613-619 `t-lanes` toggle. :720 currentCfg (`lanes:S.lanes`), :746 applyHash.
- index.html:126 `#t-lanes` switch (mount panel right after it), :170-171 script tags.
- card-share.js: BOOLS has `lanes`; validate() whitelist (:60); KEYS (:186) feeds card-values.toValues. config.js: `lanes:true`.
## Open questions
3 ids/buffer: buffer is 4n so up to 4n cubes fit. put() needs a cell: id>=W.n -> shared blank stand-in cell (shown=null, no glyph, act 0), W.so lookups guarded (`W.so.dx[id]||0`, `sc||1`). Evidence: app.js:293 N=W.n*4; :521 c=W.cells[id].
4 glyph reveal: no per-cube API (sim bound to cell index, reveals at sim lock, :575). Keep churn during motion; `stopped` unused. Window ends at lock (:519 gate) so grid snaps.
5 T vs cascade: window start = max(0, ticks*tickMs - T*1000) (mirrors :378); truncated if cascade<T. lanes t = (run.ms - start)/1000 via player.
6 loop: replays window only: player.seek(0)+hold; during hold/replay lanes drawn even though lockedAt set (override gate with `laneReplay`).
## Payload (phase 3)
key `ln`: object {rows?,cols?,seed?,T?,K?,GAP_P?}? Decision: only visible non-default {K,T,GAP_P(<=.2),seed}; rows/cols follow text grid (overrides exist as colsOverride/rowsOverride). Hidden never serialized. Old tokens have no `ln` -> unchanged.
