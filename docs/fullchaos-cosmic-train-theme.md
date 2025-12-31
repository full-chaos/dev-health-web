# Fullchaos Cosmic Train Theme

Inspired by the meteoric train art, this theme mixes combustion whites, blazing oranges, and cosmic blues so every artifact feels like it’s charging through a starry tunnel.

## Palette

- **Deep Space** `#0b1024` – charcoal night-sky foundation for backgrounds.
- **Meteor Orange** `#ff5a1f` – fiery primary accent for highlights and callouts.
- **Starfire Gold** `#f7c548` – luminous glow color for glow borders or emphasis.
- **Ion Blue** `#4cc9ff` – cool neon contrast for links, buttons, and data points.

## Typography

- **Headers** – _Space Grotesk Bold_
- **Body text** – _Space Grotesk_

Use a gradient overlay or soft glow around text to echo the train’s fire trails.

## Applying the Theme

1. Set `body` backgrounds to `Deep Space` and raise contrast with thin `Starfire Gold` borders.
2. Highlight important tokens (buttons, badges, metadata) with `Meteor Orange` and outline with `Ion Blue`.
3. Pair `Ion Blue` with white text for links or data labels; reserve `Starfire Gold` for light glow effects and iconography.

## Sample CSS

```css
:root {
  --fullchaos-space: #0b1024;
  --fullchaos-meteor: #ff5a1f;
  --fullchaos-starfire: #f7c548;
  --fullchaos-ion: #4cc9ff;
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
