/**
 * Small, reusable "Preview" marker for destinations whose underlying signal is
 * not yet generally available. Distinct from {@link BetaBadge} (amber, app-wide
 * beta state): Preview is sky-toned and scoped to a single feature so users can
 * tell a preview surface apart from a finished one at a glance.
 *
 * Decorative by default; pass a `title` when the badge needs a tooltip.
 */
export function PreviewBadge({ title }: { title?: string }) {
    return (
        <span
            title={title}
            className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-400"
        >
            Preview
        </span>
    );
}
