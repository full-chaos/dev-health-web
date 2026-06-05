# Design and Style Framework: Dev Health Web

**Status: binding.** Every UI change in `dev-health-web` must conform to this framework. "Done" requires conformance **plus** visual verification (see Part F). This is the single source of truth referenced by [CHAOS-2055](https://linear.app/fullchaos/issue/CHAOS-2055/phase-31-normalize-post-phase-3-ux-consistency-and-functional-cleanup) (interaction/design normalization), [CHAOS-2031](https://linear.app/fullchaos/issue/CHAOS-2031/phase-4-add-chart-interpretation-accessibility-polish-and-production) (style rollout), and the Phase-1 trust issues.

**Why this exists.** The current inconsistencies were not caused by agents ignoring issues, the Phase-1 issues shipped with real PRs. They were caused by _explicit, per-defect_ issues producing isolated point-fixes with no shared framework to conform to. One chart says "Unattributed", another dumps raw JSON; one page resolves names, another shows `#cf3d56b4`; CTAs drift to "Re-orient in Cockpit". The fix is systemic: canonical rules + tokens + shared primitives, enforced, so every change uses them instead of inventing one-offs.

**Make it adhered-to (not just written).** Mirror this into the repo as `docs/design-system.md` and reference it from the repo agent config (`CLAUDE.md` / `AGENTS.md`) so coding agents auto-load it. The Definition of Done in Part F is the same line used in `AGENTS.md` and the Linear issue template.

---

## Part A: Interaction and content rules (design inconsistencies)

- **A1 Sidebar**, two levels: the eight decision areas — Cockpit, Diagnose, Plan, Improve, Govern, AI, Reports, Admin — plus the ACTIVE area expanded to its child destinations (inactive areas stay collapsed). Children are real destinations only — never tab subviews, never preview/unbuilt routes, never one-off metric pages without product approval. The route tree is config-driven (`src/lib/navigation/areas.ts` → `navArea.children`), so sidebar = breadcrumb = page title (A6). ([CHAOS-2075](https://linear.app/fullchaos/issue/CHAOS-2075/two-level-expandable-area-navigation), [CHAOS-2080](https://linear.app/fullchaos/issue/CHAOS-2080/j1-encode-locked-8-area-taxonomy-in-the-shared-route-config-68-areas).)
- **A2 Tabs**, sibling views _within_ one destination only. Area children (A1) are destinations, not tabs, and never appear in the sidebar as their tab subviews. The locked child destinations are: Diagnose → Overview / Flow / Investment / Landscape / People / Code / Complexity / Cognitive Load / Bottlenecks; Plan → Delivery Forecast / Capacity / Backlog Risk / Operating Review; Improve → Opportunities / Experiments / Automations; Govern → Overview / Pipelines / Tests / Quality / Coverage / Delivery Risk / Incident Correlation / Security / Feature Flags / Compounding Risk; AI → Overview / Impact / Attribution / Review Load / Test Gaps / Governance Risk / Evidence / Automations; Reports → Report Center / Weekly Review / Executive Summary / Export History; Admin → Organization / Connections / Data Confidence / Settings / Billing. Cockpit has no children. Never style a navigation exit as a tab.
- **A2a Area landings**, the area header names the area; sub-areas surface as severity-sorted signal cards (metric + state), never passive links; bubble the top sub-area signal(s) up to the area level. Dense areas may sub-group (e.g. Govern → Quality / Risk); light areas degrade gracefully; unavailable metrics use DataState, never fabricated values. ([CHAOS-2074](https://linear.app/fullchaos/issue/CHAOS-2074/area-landing-pages-severity-sorted-signal-cards).)
- **A3 Pills**, filters, scope, status, and segmented view controls only. Never for navigation, back, or primary CTAs.
- **A4 Buttons**, actions only, from the CTA registry (Part D). Don't invent verbs.
- **A5 Back links**, one pattern: `Back to Cockpit` or `Back to {parent area}`. Never styled as pills/filters. One return path per screen, remove redundant ones (e.g. `Back to Metrics View` **and** `Back to Cockpit` together).
- **A6 Page-name agreement**, sidebar label = page title = breadcrumb = route metadata. Normalize: Delivery Risk vs Risk & Quality Drag; AI Workflows vs AI Workflow Intelligence; Coverage vs Coverage Delta.
- **A7 Identity labels, full-stack contract (not a render-only rule).** Never show a raw ID/hash as a primary user-facing label. The data layer must do the resolving: **GraphQL queries/resolvers must return a resolved display name alongside any id** (e.g. `compoundingRisk` must return `scope { id, displayName }`, not a bare `scope_id`), and the frontend renders it via `EntityLabel`. Fallback order _only when the server genuinely cannot resolve_: (1) display name → (2) repo/name slug → (3) provider key with prefix → (4) shortened ID with an explicit `Unresolved` badge. A bare `#cf3d56b4` is non-compliant.
    - **Root-cause example (cockpit conclusion):** "Compounding risk appears elevated for {scope} across {scope}" is driven by `api/graphql?query=compoundingRisk&scope_id=<uuid>`. That query doesn't return a resolved scope display name, and it binds the same `scope_id` into both the subject and the scope slot, hence the UUID rendered twice ("for X across X"). The fix lives in the resolver: return `scope.displayName`, and make subject vs scope distinct fields. `EntityLabel` can only render a name the API returns, so this work spans the **GraphQL backend (**`dev_health_ops`**)** and `dev-health-web`, not the web repo alone. (Tracked: [CHAOS-2064](https://linear.app/fullchaos/issue/CHAOS-2064/bug-compoundingrisk-query-returns-unresolved-scope-id-and-duplicates).)
- **A8 No internal/impl leakage**, never render in customer copy: raw IDs, API/GraphQL paths (`/api/v1/...`, `api/graphql?query=...&scope_id=...`), graph edge names (`DEPLOYS`, `LINKED_INCIDENT`), detector/telemetry jargon, version tags (`V1 SPARKLINE`), or Linear IDs (`CHAOS-1757`). Dev-only details go behind debug mode. Remove `Debug Filters` from customer/explore views. Eyebrow / kicker labels must be meaningful context — never page-scaffolding nouns (`section`, `fixed agenda section`, `rule engine`) and never a repeat of the adjacent title.
- **A9 Never render raw data structures**, no JSON/object dumps in user-facing tables. The Evidence Table currently renders `{\"repo_id\":\"…\",\"number\":1,…}`; map to typed, labeled fields.
- **A10 Active navigation**, exactly one selected destination at a time; hover/focus must be visually distinct from selected. No two outlined/selected items at once (observed: Coverage + Delivery Risk both selected; Bottlenecks highlighted on the Coverage page).
- **A11 Empty / unavailable / error states**, use the `DataState` component with customer-safe copy ("No prior period", "Ownership data not connected yet"), never bare `--`, blank panels, or raw red error blocks ([CHAOS-2054](https://linear.app/fullchaos/issue/CHAOS-2054/bug-evidence-drawer-renders-error-block-and-blank-panel-instead-of)). Evidence drawers use the `EvidencePanel` contract or a controlled empty state.
- **A12 Evidence vs recommendation**, an "Evidence" section contains artifacts (PR/commit/review/pipeline/incident/test/deployment) with human summary + timestamp; recommendations live in a separate "Recommended next step" slot (EvidencePanel contract, PRD).

## Part B: Number, metric and data-integrity rules (style + trust)

- **B1 Formatting**, all numbers via `formatNumber` / `formatPercent`. No raw floats as labels (`74.74071428571429` → `74.7%`). Sensible precision, thousands separators, explicit units.
- **B2 Signed zero**, never render `-0%`; show `0%` or `No change`.
- **B3 Extremes**, extreme values (e.g. WIP 939%) must carry a baseline/band or interpretation; if a value looks impossible, validate the computation.
- **B4 Coherence**, numbers on one page reconcile or state their relationship (Pipelines already does this for success/failure, reuse the pattern).
- **B5 Distribution/forecast integrity**, percentiles must be monotonic. P50/P75/P90 all reading "4 weeks" is a collapse bug; assert P50 ≤ P75 ≤ P90.
- **B6 Threshold sanity**, default thresholds must be calibrated (Incident load 17.1/wk vs `Threshold 1.0/wk` reads as a wrong default).
- **B7 Resolver completeness**, a card/conclusion isn't "done" if its backing query returns an unresolved id, an empty/flat result, or a missing field that forces a placeholder. The query is part of the deliverable (see A7 root-cause example). If a query is missing or returns nothing, fix the query, don't paper over it with a UUID or "appears flat".

## Part C: Style tokens (style inconsistencies)

Use tokens only. **No hardcoded hex or px in components**, if a value is missing, add a token.

- **C1 Typography**, one locked scale: `display` 32/40, `h1` 24/32, `h2` 18/26, `h3` 15/22, `body` 14/22, `label-caps` 11/16 (+tracking), `mono` for code/IDs in dev only. Page title = h1; section header = h2; the uppercase descriptor pattern ("WIP SATURATION") = label-caps. (Finalize values, then lock; this replaces the ad-hoc per-page sizing.)
- **C2 Color roles**, semantic tokens, not raw hex: `bg`, `surface`, `surface-raised`, `border`, `text-primary`, `text-secondary`, `text-muted`, `accent` (orange), and status `positive` / `caution` / `negative` / `info`. Map status badges consistently (WATCH/ELEVATED → caution/negative; NORMAL → positive).
- **C3 Spacing**, 4px base scale (4/8/12/16/24/32/48). Standardize card padding and section gaps.
- **C4 Radius & elevation**, one radius scale (`sm` 6 / `md` 10 / `lg` 16 / `pill` 999) and one elevation set for cards/drawers.
- **C5 Charts**, one palette + conventions: sequential scale for heatmaps that **must map data variance** (Churn heatmap renders uniform cyan today), categorical palette for series, consistent axis/gridline/tooltip styling, **styled tooltips** (Pipelines shows a blank white tooltip box), and a `ChartFrame` wrapper exposing title / interpretation / threshold slots.
- **C6 Density & alignment**, consistent KPI card layout, card heights, and sparkline treatment across TestOps / Work / Coverage.

## Part D: CTA vocabulary registry (typed constants)

Approved (add new ones here before use): `Open evidence`, `Inspect associations`, `Open artifact`, `Export report`, `Apply filters`, `Reset filters`, `Copy`; navigation `Back to Cockpit`, `Back to {area}`.

Migrate: `Re-orient in Cockpit` → `Back to Cockpit`; `Back to Metrics View` → `Back to {area}`; `Open Landscapes` / `Explore Work` → use a tab or `Back to {area}`; `Open Flame` → `Open artifact` (or register Open flame graph); standalone `EVIDENCE` label → `Open evidence`.

## Part E: Shared primitives (build once, use everywhere)

The only sanctioned implementations: `EntityLabel` (A7), `DataState` (A11), `EvidencePanel` (A12), `MetricDelta` (B1/B2), `formatNumber`/`formatPercent` (B1), `BackLink` (A5), `ModeTabs` (A2), `FilterPills` (A3), `ChartFrame` + chart theme (C5), CTA constants (D). New surfaces compose these, don't re-implement. The `render-safe entity-label helper` shipped in PR #555 ([CHAOS-2034](https://linear.app/fullchaos/issue/CHAOS-2034/bug-coverage-coverage-by-repository-labels-bars-with-raw-repo-uuids)) is the seed of `EntityLabel`; consolidate everything onto it. **Note:** `EntityLabel` can only render a name the API returns, the backing query/resolver must supply `displayName` (A7/B7), so the primitive is incomplete without the matching GraphQL contract.

## Part F: Enforcement (so it is adhered to)

- **Definition of Done**, identical in `AGENTS.md` and the Linear issue template:

    > Conforms to the Design & Style Framework; uses the shared primitives; backing queries return resolved names (no unresolved ids surfaced); `npm run design-lint` passes; an after-screenshot or visual-regression assertion is attached.

- **IA preservation rule (R-guard):** No IA change may remove or relocate a reachable analytical view, route, or deep-link target unless (a) its replacement destination is named in the issue, (b) the old path redirects to it (not to a generic overview), and (c) a test asserts the destination renders real content. Enforced by the IA invariant suite in `src/lib/navigation/__tests__/`.
    - **Baseline-edit gate:** the preservation baseline (`src/lib/navigation/__fixtures__/iaPreservationBaseline.ts`) is a reviewed golden snapshot, not free-to-edit. Removing or relocating an entry in the same PR that changes behavior requires a named replacement **and** a test asserting the replacement renders real content (not mere route existence — `routePageExists` ignores the query string). Reachable redirect aliases are guarded independently of this fixture by a filesystem scan (invariant #7), so a new alias cannot go unregistered and a deleted alias/target is caught.
- **design-lint (ESLint/custom):** ban raw UUID/hash regex in JSX text and label props; ban hardcoded hex/px in components; ban non-registry CTA strings; ban `/api/`, `api/graphql`, `CHAOS-\\d+`, edge-name and detector/telemetry tokens in user-facing strings; require `formatNumber` on chart value labels.
- **Dev guard:** throw in dev if an unresolved hash reaches a primary label slot.
- **Visual gate:** tie "Done" to the Visual User Journey Evidence & UX Acceptance Coverage milestone, an after-screenshot or visual-regression assertion per fix, so "Done" means _verified_, not just merged.

---

## Secondary Reference: Theming and Tailwind Configuration

This section preserves the existing theming, Tailwind-v4, and CSS-variable reference material.

### Overview

The platform uses **Tailwind CSS v4** via `@tailwindcss/postcss`.

- **No Component Library**: We don't use shadcn, Radix UI, or any other external component library.
- **Custom Utilities**: All UI elements are built using custom Tailwind utility classes and standard HTML/React patterns.
- **Component Location**: Custom reusable components are located in `src/components/`.

### Theming Mechanism

Appearance is controlled by two HTML attributes on the `<html>` element:

1. **`data-theme`**: Controls the color mode (`light` or `dark`).
2. **`data-palette`**: Controls the color scheme (`fullchaos`, `material`, `echarts`, `fullchaos-cosmic-train`, `fullchaos-infinity-knot`, `flat`).

#### Default State

The default configuration is:

- `data-theme="dark"`
- `data-palette="fullchaos"`

#### Initialization

To prevent Flash of Unstyled Content (FOUC), a blocking script in `src/app/layout.tsx` reads `localStorage` and applies the saved theme/palette before the first paint.

### Tailwind v4 Configuration

Configuration is handled directly in `src/app/globals.css` using the `@theme` syntax. We don't use a `tailwind.config.js` or `tailwind.config.ts` file for theme extensions.

#### Theme Block

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

### CSS Variables

The system relies on CSS custom properties (variables) defined in `globals.css`. These variables change based on the active `data-theme` and `data-palette`.

#### Core Colors

| Variable            | Description                       |
| :------------------ | :-------------------------------- |
| `--background`      | Main page background color        |
| `--foreground`      | Primary text color                |
| `--ink-muted`       | Secondary/muted text color        |
| `--accent`          | Primary action/brand color        |
| `--accent-2`        | Secondary accent color            |
| `--accent-3`        | Tertiary accent color             |
| `--accent-negative` | Error or destructive action color |

#### Card System

| Variable                   | Description                               |
| :------------------------- | :---------------------------------------- |
| `--card`                   | Background color for card components      |
| `--card-stroke`            | Border color for cards                    |
| `--card-90` to `--card-60` | Semi-transparent card background variants |

#### Charting

| Variable                    | Description                        |
| :-------------------------- | :--------------------------------- |
| `--chart-grid`              | Grid line color for charts         |
| `--chart-text`              | Label and axis text color          |
| `--chart-muted`             | Muted chart elements               |
| `--chart-color-1` to `--10` | Categorical colors for data series |

#### Visual Effects

| Variable          | Description                                            |
| :---------------- | :----------------------------------------------------- |
| `--hero-gradient` | Radial gradient used for hero sections and backgrounds |

### Component Patterns

- **Utility First**: Use Tailwind utility classes for all styling.
- **Custom Components**: Build atomic components in `src/components/` (e.g., `Button`, `Card`, `Input`).
- **Charts**: Use chart-specific libraries (like ECharts) and map their theme options to the CSS variables listed above to ensure they respect the active theme/palette.
- **Layer Utilities**: Custom complex utilities (like `.btn-help`) are defined in the `@layer utilities` block in `globals.css`.

### Key Files

| File                  | Role                                                                |
| :-------------------- | :------------------------------------------------------------------ |
| `src/app/globals.css` | Canonical source for theme variables and Tailwind v4 configuration. |
| `src/app/layout.tsx`  | Applies default attributes and contains the FOUC-prevention script. |
| `postcss.config.mjs`  | Configures the PostCSS pipeline for Tailwind v4.                    |

### Theme Variants

For palette-specific guidance, see [`fullchaos-cosmic-train-theme.md`](./fullchaos-cosmic-train-theme.md) for the `fullchaos-cosmic-train` variant and [`fullchaos-infinity-knot-theme.md`](./fullchaos-infinity-knot-theme.md) for the image-inspired `fullchaos-infinity-knot` palette.
