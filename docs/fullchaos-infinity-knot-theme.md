# Fullchaos Infinity Knot Theme

> This document describes the `fullchaos-infinity-knot` palette variant. For the general design system (theming mechanism, CSS variables, Tailwind v4 configuration), see [`design-system.md`](./design-system.md).

Inspired by the braided infinity mark in the reference image, this theme balances hot ember oranges against electric cyan over charcoal neutrals so dashboards feel kinetic without losing legibility.

## Palette

- **Charcoal Core** `#101722` – anchor background for dark surfaces and high-contrast UI shells.
- **Signal Orange** `#f89d28` – primary action colour pulled from the brightest loop strokes.
- **Ember Edge** `#f05a1a` – hotter orange-red used for emphasis, alerts, and energetic borders.
- **Electric Cyan** `#14bdd6` – cool counterweight for links, secondary emphasis, and chart accents.
- **Steel Mist** `#6f7d8d` – neutral support tone for muted metadata, grids, and chart balancing.
- **Porcelain White** `#f7f5f2` – warm light-mode background derived from the image backdrop.

## Typography

- **Headers** – _Inter SemiBold_ or _Inter Bold_
- **Body text** – _Inter_

Keep typography clean and structured so the palette carries the drama instead of the type system.

## Applying the Theme

1. Use `Signal Orange` for primary actions and top-line KPI emphasis.
2. Use `Electric Cyan` for navigation affordances, secondary callouts, and cool-side chart series.
3. Use `Ember Edge` sparingly for active states, glows, and “hot path” alerts.
4. Ground dense screens with `Charcoal Core` and `Steel Mist` so the warm/cool accents stay readable.

## Sample CSS

```css
:root {
    --fullchaos-charcoal-core: #101722;
    --fullchaos-signal-orange: #f89d28;
    --fullchaos-ember-edge: #f05a1a;
    --fullchaos-electric-cyan: #14bdd6;
    --fullchaos-steel-mist: #6f7d8d;
    --fullchaos-porcelain-white: #f7f5f2;
}

body {
    background: var(--fullchaos-charcoal-core);
    color: #f5f7fb;
}

.metric-hero {
    background: linear-gradient(
        120deg,
        var(--fullchaos-signal-orange),
        var(--fullchaos-ember-edge) 45%,
        var(--fullchaos-electric-cyan)
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.card-accent {
    border-color: color-mix(in srgb, var(--fullchaos-electric-cyan) 35%, transparent);
    box-shadow: 0 0 32px color-mix(in srgb, var(--fullchaos-ember-edge) 24%, transparent);
}
```
