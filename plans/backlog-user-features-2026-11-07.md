# Backlog: features the user recalls wanting (2026-11-07). ON HOLD until the open questions in the chat are answered.

User's words, grammar fixed. Status: all NOT STARTED. Cross-ref: [user-request-audit.md](user-request-audit.md), [lanes4-integration-plan.md](lanes4-integration-plan.md).

| # | Request | Notes / question | Cost | Reversibility |
|---|---|---|---|---|
| B1 | Drop the "die" background | delete option + code; old links using it need a fallback | S | one-way for old links |
| B2 | Make "veins" background slightly more circuitry-like | tuning of existing bg | S | two-way |
| B3 | Add a "stained wood" background pattern | new bg; procedural noise/grain shader, no assets | M | two-way |
| B4 | Palette: pick colors from a picker | native `<input type="color">` exists, no library needed; no alpha; styling limited. MUI only if the card moves to React (it is vanilla) | S | two-way |
| B5 | Remove anchor (`#`) params; query params only | changes link format: old `#...` links must still load (read-and-redirect) or break. Interacts with B6 | M | ONE-WAY |
| B6 | New version of the card to avoid backward-compat issues: two different pages | v1 page frozen as-is, v2 page for new work. Decide: file layout (`/` stays v1, `v2/` new?), shared modules, how links pick the page. Interacts with B5 | L | ONE-WAY |
| B7 | Pulses from a clicked circuit are not timed exactly the same | add per-branch random jitter to pulse timing | S | two-way |
| B8 | New circuit bg ("2-layer board"): lay out circuits so pulses tend to travel to other components/places; fewer gaps, "laid out, full circuit board" feel; component symbols (can/resistor/other); a couple of mysterious triangle/circle parts; blurred frosted-IC symbols that change brightness/color when a pulse reaches them, never legible; one symbol inside/overlaid on another (e.g. iota inside omega), outer/inner symbol lists customizable later | needs: router/layout algorithm (2 layers + vias), pulse graph over the netlist, blurred-glyph pass. Design first (Opus low-effort critique of the algorithm), then implement | L | two-way (new bg option) |

## Questions to ask when un-held
1. B5+B6 together: v2 page = query-only params; v1 keeps anchors forever (frozen)? Recommend yes: it removes the compat problem entirely.
2. B1: delete "die" from v2 only, or both?
3. B8: algorithm choice and grid/density need a visual reference; offer a demo page like demo-lanes4.html first.
