# Metric Coherence Rules

Customer-facing surfaces must present numbers that a reasonable viewer can trust and
reconcile. A page full of figures that silently contradict each other, deltas that show a
bare `--`, or extreme values with no interpretation erodes confidence faster than missing
data does. These rules are the canonical contract every metric surface in `dev-health-web`
follows. They were introduced with **CHAOS-2033** and apply to all new and edited pages.

## Why this exists

Dev Health's philosophy is _inspectable, trustworthy signals_ — not judgment. A number the
viewer cannot reconcile reads as a bug, not a signal. The fixes below are cheap (mostly
copy and small guards) and keep the product honest.

---

## Rule 1 — Figures on a page must reconcile, or state the relationship

If two or more figures on the same surface _look_ like they should add up or relate but
don't, the page MUST either make them reconcile or explain the relationship in copy.

- Prefer **explaining the denominator** over forcing arithmetic. Most "mismatches" are
  different denominators, not errors.
- Example (Pipelines): _Success Rate_ and _Failure Rate_ are shares of **completed** runs
  and need not sum to 100% (runs can be cancelled or skipped). _Failure Patterns_ shows the
  failure rate **within each group** — a different denominator from the headline Failure
  Rate, so the values are not directly comparable. The page states this directly under the
  metric tiles.

**Checklist:** for every pair of related numbers, can a viewer explain why they differ? If
not, add a one-line caveat or a shared denominator.

## Rule 2 — Never render a bare `--` delta

A bare `--` in a delta slot is ambiguous: is it zero, missing, loading, or broken? Replace
it with either a **real period-over-period delta** or an **explicit labeled state**.

- Allowed labeled states: **"No prior period"** (no comparison window exists),
  **"Insufficient history"** (fewer than two data points).
- `MetricCard` owns the platform default: when `delta` is `undefined`/`null` it renders the
  `deltaUnavailableLabel` prop (default **"No prior period"**) with a `title` tooltip — never
  `--`. Pass `deltaUnavailableLabel="Insufficient history"` where that reason is more
  accurate.
- Where a real delta _can_ be computed cheaply (e.g. first-vs-last bucket of a timeseries),
  compute and pass it rather than falling back to a label.

```tsx
// Period-over-period change (%); undefined when history is insufficient.
function getDelta(buckets: { value: number }[]) {
    if (buckets.length < 2) return undefined;
    const prev = buckets[0].value;
    const curr = buckets[buckets.length - 1].value;
    if (prev === 0) return undefined;
    return ((curr - prev) / Math.abs(prev)) * 100;
}
```

The same rule applies to **inline** delta cells (e.g. metric tables), not just `MetricCard`.

## Rule 3 — Extreme values carry a baseline / cap / interpretation note

A value like **WIP Saturation 950%** is alarming without context. Any metric that can
exceed an intuitive bound (100%, a count baseline, etc.) MUST surface a short note that
explains the baseline and how to read large values.

- Say what the baseline means (e.g. _"100% = work in progress matched to typical
  throughput"_).
- Say whether the metric is **capped or uncapped** and why (Dev Health leaves saturation
  **uncapped** so severity stays visible: 950% reads as ~9.5× baseline, not a data error).
- Keep it to one or two muted sentences near the value.

## Rule 4 — Empty / null states are customer-safe

When a dimension genuinely has no data, render a plain-language empty state
(_"No failure data for this window or scope"_) rather than a degenerate chart, a silent
`None` bucket, or internal phrasing (_"telemetry/metadata not available"_). Null/unknown
grouping keys are bucketed into an explicit, labeled category (e.g. **"Unattributed"**) with
a visible caveat — never a silent `None` (see CHAOS-2032).

---

## Reviewer checklist

Before merging any page that renders metrics:

- [ ] Related figures reconcile, or a caveat explains the denominator. (Rule 1)
- [ ] No bare `--` deltas anywhere — real delta or labeled state. (Rule 2)
- [ ] Extreme/unbounded values carry a baseline/cap/interpretation note. (Rule 3)
- [ ] Empty/null/unknown states are customer-safe and labeled. (Rule 4)
