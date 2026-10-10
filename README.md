# thank-you-cards

An animated thank-you card: glass cubes resolve a message from random symbols over a generated circuit-board background. Static page, no build step.

Live page (GitHub Pages): https://kr99.github.io/thank-you-cards/

- `config.js` holds the presets (message, secondary message, palette, background, toggles). Edit it on GitHub and reload.
- Press `c` to show or hide the controls. `"hide": true` in `config.js` starts with them hidden.
- URL options: `#clean` hides controls, `#debug` shows the overlay, `?text=Hello` sets the message.
- three.js r149 and Google Fonts load from CDNs, so visitors need internet.
