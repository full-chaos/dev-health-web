# Styling & UX Discovery Report

**Date:** 2026-03-17
**Scope:** `dev-health-web` — Next.js frontend

---

## Current State Summary

| Area                     | Status                                             |
| ------------------------ | -------------------------------------------------- |
| Design tokens (CSS vars) | Solid — 5 palettes, light/dark, chart integration  |
| Typography               | Good — Inter + JetBrains Mono, consistent scale    |
| Component patterns       | Good — consistent card/nav/table language          |
| Dark mode                | Complete — `data-theme` + OS preference            |
| Responsive               | Good — mobile-first, `md:` / `lg:` breakpoints     |
| Animations               | Minimal — hover lifts, pulse skeletons             |
| Gradients                | Marketing only — app shell is flat `bg-background` |
| Loading states           | Weak — Suspense boundaries render nothing          |
| Empty states             | Weak — dashed borders, no helpful guidance         |

---

## Recommendations

### 1. App Shell Background — Gradient Instead of Flat Color

**Problem:** The authenticated app uses `bg-background` (solid `#0f172a` dark / `#f8fafc` light). This feels flat compared to the marketing pages which use the hero radial gradient.

**Recommendation:** Add a subtle gradient to the app shell body/layout. Not the full hero gradient, but a gentle ambient wash that adds depth.

```css
/* globals.css — new token per palette */

/* Light mode: subtle cool gradient anchored top-left */
--app-gradient: radial-gradient(
  ellipse at 10% 0%,
  color-mix(in srgb, var(--accent) 4%, var(--background)) 0%,
  var(--background) 60%
);

/* Dark mode: very subtle glow anchored top */
[data-theme="dark"] {
  --app-gradient: radial-gradient(
    ellipse at 50% -10%,
    color-mix(in srgb, var(--accent) 6%, var(--background)) 0%,
    var(--background) 50%
  );
}
```

Apply on the `(app)` layout wrapper:

```tsx
<div className="min-h-screen bg-(image:--app-gradient) bg-fixed">
```

Using `bg-fixed` keeps the gradient stationary while content scrolls — avoids visual noise.

**Risk:** Low. The gradient is derived from existing palette tokens, so it auto-adapts to all 5 palettes and both themes.

---

### 2. Card Depth & Layering

**Problem:** Cards use `bg-(--card-80)` uniformly. When cards are nested or adjacent, there's no visual hierarchy between parent and child surfaces.

**Recommendation:** Adopt a layered surface model:

| Layer     | Token          | Use                                           |
| --------- | -------------- | --------------------------------------------- |
| Page      | `--background` | Body/shell                                    |
| Surface 1 | `--card-90`    | Primary sections (metric grids, chart panels) |
| Surface 2 | `--card-80`    | Cards within sections                         |
| Surface 3 | `--card-70`    | Nested elements (table headers, filter bars)  |
| Inset     | `--card-60`    | Inputs, code blocks                           |

Some pages already do this inconsistently. Standardize across all views so nesting always darkens/lightens predictably.

---

### 3. Loading States — Skeleton Screens

**Problem:** Most routes wrap content in `<Suspense>` with no fallback, so the user sees a blank page flicker before content appears.

**Recommendation:** Add `loading.tsx` files for key routes using the existing `Skeleton` component:

Priority routes:

- `/(app)/dashboard/loading.tsx`
- `/(app)/metrics/loading.tsx`
- `/(app)/explore/loading.tsx`
- `/(app)/work/loading.tsx`

Pattern:

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
      {/* Chart skeleton */}
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  );
}
```

---

### 4. Empty States

**Problem:** Empty data sections show dashed-border placeholders with minimal text. Users don't know what action to take.

**Recommendation:** Create a shared `EmptyState` component:

```tsx
function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-3xl border border-dashed
                    border-(--card-stroke) bg-(--card-70) py-12 text-center"
    >
      <div className="rounded-full bg-(--accent)/10 p-3 text-(--accent)">{icon}</div>
      <p className="font-(--font-display) text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-(--ink-muted)">{description}</p>
      {action}
    </div>
  );
}
```

---

### 5. Table Row Hover & Zebra Striping

**Problem:** Data tables (`DataTable.tsx`) have no row hover highlight and no alternating row colors, making dense tables hard to scan.

**Recommendation:**

```css
/* Row hover */
tr:hover td {
  background: var(--card-70);
}

/* Optional zebra — use odd rows to avoid header conflict */
tbody tr:nth-child(odd) {
  background: color-mix(in srgb, var(--card) 5%, transparent);
}
```

Keep it subtle — the current minimal style is intentional, but a hover state is expected UX.

---

### 6. Micro-Animations & Transitions

**Problem:** Interactive elements have inconsistent transition timing. Some use `transition`, some `transition-colors`, some have no transition at all.

**Recommendation:** Standardize on two timing profiles:

```css
/* Fast — color/opacity changes */
.transition-fast {
  transition:
    color 150ms,
    background-color 150ms,
    border-color 150ms,
    opacity 150ms;
}

/* Standard — transforms, layout */
.transition-standard {
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

Add page-level entrance animation for content sections:

```css
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-up {
  animation: fade-up 300ms ease-out;
}
```

Apply `animate-fade-up` to the main content wrapper in each page.

---

### 7. Filter Bar Visual Separation

**Problem:** The filter bar blends into the content below it — no visual boundary between controls and data.

**Recommendation:** Give the filter bar its own surface:

```tsx
<div className="sticky top-0 z-10 -mx-6 border-b border-(--card-stroke)
                bg-(--background)/80 px-6 py-3 backdrop-blur-sm">
  <FilterBarClient ... />
</div>
```

The `backdrop-blur-sm` + semi-transparent background creates a frosted-glass effect that visually separates filters from scrolling content while keeping them accessible.

---

### 8. Sidebar Active State Enhancement

**Problem:** The active nav item uses `border-(--accent) bg-(--accent)/15` which is functional but subtle. Users might miss which page they're on.

**Recommendation:** Add a left accent bar for the active state:

```css
/* Active nav item */
.nav-active {
  position: relative;
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
.nav-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 25%;
  height: 50%;
  width: 3px;
  border-radius: 9999px;
  background: var(--accent);
}
```

---

### 9. Spacing Standardization

**Problem:** Card padding alternates between `p-4`, `p-5`, and `p-6` with no clear rule.

**Recommendation:** Adopt a consistent scale:

| Context          | Padding | Gap     |
| ---------------- | ------- | ------- |
| Section wrapper  | `p-5`   | `gap-6` |
| Card content     | `p-4`   | `gap-4` |
| Nested element   | `p-3`   | `gap-3` |
| Compact (metric) | `p-4`   | `gap-2` |

Audit and align existing uses. No visual change for most, but makes future work predictable.

---

### 10. Accent Gradient for Key Metric Values

**Problem:** Large metric numbers (`text-2xl font-semibold`) are plain white/dark text. They don't draw the eye to the most important data.

**Recommendation:** For hero metrics (dashboard cockpit, top-level DORA scores), apply a subtle gradient text effect:

```css
.metric-hero {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

Use sparingly — only 1–2 hero values per page, not every metric card.

---

### 11. Focus Ring Consistency

**Problem:** Some interactive elements use `focus:ring-2 ring-(--accent)`, others have no visible focus indicator.

**Recommendation:** Add a global focus-visible style:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: inherit;
}
```

This ensures keyboard navigation works everywhere and meets WCAG 2.1 AA (2.4.7 Focus Visible).

---

### 12. Error Page Styling

**Problem:** Auth error page exists but uses minimal styling. App-level error boundaries need consistent treatment.

**Recommendation:** Create a shared `ErrorCard` component matching the design system:

```tsx
function ErrorCard({ title, message, action }: Props) {
  return (
    <div
      className="mx-auto max-w-md rounded-3xl border border-(--accent-negative)/30
                    bg-(--card-80) p-8 text-center"
    >
      <div
        className="mx-auto mb-4 h-12 w-12 rounded-full bg-(--accent-negative)/10
                      flex items-center justify-center text-(--accent-negative)"
      >
        ⚠
      </div>
      <h2 className="font-(--font-display) text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-(--ink-muted)">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
```

---

## Priority Matrix

| #   | Recommendation                | Impact | Effort | Priority |
| --- | ----------------------------- | ------ | ------ | -------- |
| 1   | App shell gradient background | High   | Low    | **P1**   |
| 3   | Skeleton loading states       | High   | Medium | **P1**   |
| 7   | Filter bar frosted glass      | Medium | Low    | **P1**   |
| 6   | Micro-animations (fade-up)    | Medium | Low    | **P2**   |
| 5   | Table row hover               | Medium | Low    | **P2**   |
| 11  | Focus ring consistency        | Medium | Low    | **P2**   |
| 2   | Card depth layering           | Medium | Medium | **P2**   |
| 4   | Empty state component         | Medium | Medium | **P2**   |
| 8   | Sidebar active indicator      | Low    | Low    | **P3**   |
| 9   | Spacing standardization       | Low    | Medium | **P3**   |
| 10  | Gradient hero metrics         | Low    | Low    | **P3**   |
| 12  | Error card component          | Low    | Medium | **P3**   |

---

## What's Already Good

These areas need **no changes** — they're well-executed:

- **Palette system** — 5 themes with automatic dark/light is excellent
- **CSS variable architecture** — clean, extensible, no hardcoded colors
- **Chart theme integration** — dynamic CSS var reading with MutationObserver is sophisticated
- **Typography** — Inter + JetBrains Mono is a solid professional pairing
- **Rounded corner scale** — consistent `rounded-lg → 2xl → 3xl` hierarchy
- **Responsive layout** — mobile-first with sensible breakpoints
- **Theme persistence** — synchronous `theme-init.js` prevents FOUC
