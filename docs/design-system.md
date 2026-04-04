# Design System

This document outlines the design system and theming architecture for the Full Chaos Dev Health web platform. It is intended for agents and developers to ensure consistency across the codebase.

## Overview

The platform uses **Tailwind CSS v4** via `@tailwindcss/postcss`. 

- **No Component Library**: We do not use shadcn, Radix UI, or any other external component library.
- **Custom Utilities**: All UI elements are built using custom Tailwind utility classes and standard HTML/React patterns.
- **Component Location**: Custom reusable components are located in `src/components/`.

## Theming Mechanism

Appearance is controlled by two HTML attributes on the `<html>` element:

1.  **`data-theme`**: Controls the color mode (`light` or `dark`).
2.  **`data-palette`**: Controls the color scheme (`fullchaos`, `material`, `echarts`, `fullchaos-cosmic-train`, `fullchaos-infinity-knot`, `flat`).

### Default State
The default configuration is:
- `data-theme="dark"`
- `data-palette="fullchaos"`

### Initialization
To prevent Flash of Unstyled Content (FOUC), a blocking script in `src/app/layout.tsx` reads `localStorage` and applies the saved theme/palette before the first paint.

## Tailwind v4 Configuration

Configuration is handled directly in `src/app/globals.css` using the `@theme` syntax. We do not use a `tailwind.config.js` or `tailwind.config.ts` file for theme extensions.

### Theme Block
The `@theme inline` block in `globals.css` maps CSS variables to Tailwind utility names:

```css
@theme inline {
  --color-background: var(--background);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-body);
  --font-mono: var(--font-mono);
}
```

## CSS Variables

The system relies on CSS custom properties (variables) defined in `globals.css`. These variables change based on the active `data-theme` and `data-palette`.

### Core Colors
| Variable | Description |
| :--- | :--- |
| `--background` | Main page background color |
| `--foreground` | Primary text color |
| `--ink-muted` | Secondary/muted text color |
| `--accent` | Primary action/brand color |
| `--accent-2` | Secondary accent color |
| `--accent-3` | Tertiary accent color |
| `--accent-negative` | Error or destructive action color |

### Card System
| Variable | Description |
| :--- | :--- |
| `--card` | Background color for card components |
| `--card-stroke` | Border color for cards |
| `--card-90` to `--card-60` | Semi-transparent card background variants |

### Charting
| Variable | Description |
| :--- | :--- |
| `--chart-grid` | Grid line color for charts |
| `--chart-text` | Label and axis text color |
| `--chart-muted` | Muted chart elements |
| `--chart-color-1` to `--10` | Categorical colors for data series |

### Visual Effects
| Variable | Description |
| :--- | :--- |
| `--hero-gradient` | Radial gradient used for hero sections and backgrounds |

## Component Patterns

- **Utility First**: Use Tailwind utility classes for all styling.
- **Custom Components**: Build atomic components in `src/components/` (e.g., `Button`, `Card`, `Input`).
- **Charts**: Use chart-specific libraries (like ECharts) and map their theme options to the CSS variables listed above to ensure they respect the active theme/palette.
- **Layer Utilities**: Custom complex utilities (like `.btn-help`) are defined in the `@layer utilities` block in `globals.css`.

## Key Files

| File | Role |
| :--- | :--- |
| `src/app/globals.css` | Canonical source for theme variables and Tailwind v4 configuration. |
| `src/app/layout.tsx` | Applies default attributes and contains the FOUC-prevention script. |
| `postcss.config.mjs` | Configures the PostCSS pipeline for Tailwind v4. |

## Theme Variants

For palette-specific guidance, see [`fullchaos-cosmic-train-theme.md`](./fullchaos-cosmic-train-theme.md) for the `fullchaos-cosmic-train` variant and [`fullchaos-infinity-knot-theme.md`](./fullchaos-infinity-knot-theme.md) for the image-inspired `fullchaos-infinity-knot` palette.
