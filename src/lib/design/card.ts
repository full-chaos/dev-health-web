/**
 * Canonical card surface (framework C4) — the one sanctioned card treatment:
 * surface fill, hairline `--border` stroke, `--radius-lg`, `--elevation-card`.
 *
 * Compose with layout/padding utilities at the call site (`p-4`,
 * `p-(--space-card)`, …). Interactive emphasis (hover/active) should move the
 * stroke to `--card-stroke-active`, never to a brighter static border
 * (CHAOS-2067).
 */
export const CARD_SURFACE =
    "rounded-(--radius-lg) border border-(--border) bg-(--surface) shadow-(--elevation-card)";

export function cardClassName(className = ""): string {
    return `${CARD_SURFACE} ${className}`.trim();
}
