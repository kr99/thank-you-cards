# thank-you-cards

An animated thank-you card: glass cubes resolve a message from random symbols over a generated circuit-board background. Static page, no build step.

Live page (GitHub Pages): https://kr99.github.io/thank-you-cards/

- `config.js` holds the presets (message, secondary message, palette, background, toggles). Edit it on GitHub and reload.
- Press `c` to show or hide the controls. `"hide": true` in `config.js` starts with them hidden.
- Share link: **Copy share link** in the controls builds `?c=<base64url of the JSON settings>`. Tick "use #anchor" for `#c=<token>` instead (the anchor is never sent to the server).
  Base64 is obfuscation, not encryption: anyone can decode the link. Unknown keys are dropped and values are clamped.
- Config order, later wins: defaults < `config.js` < saved browser state < `?c=` < `#c=` / `#c.` token. A link never loads saved state.
- Other URL options: `#clean` hides controls, `#debug` shows the overlay, `?text=Hello` sets the message.
- three.js r149 and Google Fonts load from CDNs, so visitors need internet.
