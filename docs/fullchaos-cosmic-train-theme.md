# Fullchaos Cosmic Train Theme

Inspired by the meteoric train art, this theme mixes combustion whites, blazing comet tails, and galactic blues so every artifact feels like it’s charging through a starry tunnel.

## Palette

- **Deep Nebula** `#090b1d` – velvet night-sky foundation for backgrounds.
- **Streaking Flame** `#ffb035` – blazing comet tail accent for highlights and callouts.
- **Burning Ember** `#ff5f1f` – molten glow for borders or emphasis.
- **Galactic Blue** `#63d7ff` – cool cosmic contrast for links, buttons, and data points.

## Typography

- **Headers** – _Space Grotesk Bold_
- **Body text** – _Space Grotesk_

Use a gradient overlay or soft glow around text to echo the train’s fire trails.

## Applying the Theme

1. Set `body` backgrounds to `Deep Nebula` and raise contrast with thin `Burning Ember` borders.
2. Highlight important tokens (buttons, badges, metadata) with `Streaking Flame` and outline them with `Galactic Blue`.
3. Pair `Galactic Blue` with white text for links or data labels; reserve `Burning Ember` for glowing edges and iconography.

## Sample CSS

```css
:root {
  --fullchaos-space: #090b1d;
  --fullchaos-meteor: #ffb035;
  --fullchaos-starfire: #ff5f1f;
  --fullchaos-ion: #63d7ff;
}

body {
  background: var(--fullchaos-space);
  color: #f5f3f0;
  font-family: "Space Grotesk", system-ui, sans-serif;
}

.highlight {
  border: 1px solid var(--fullchaos-starfire);
  background: radial-gradient(circle at top center, rgba(247,197,72,0.2), transparent 60%);
  box-shadow: 0 0 25px rgba(255,90,31,0.4);
}

a {
  color: var(--fullchaos-ion);
  text-decoration: none;
}

a:hover {
  color: var(--fullchaos-meteor);
}
```

Link to this guide from `README.md` or any onboarding doc to make the palette discoverable for future content creators.
