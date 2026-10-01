import { STATUS_PILL } from "@/lib/statusPill";

/**
 * Small, reusable "Preview" marker for destinations whose underlying signal is
 * not yet generally available. Distinct from {@link BetaBadge} (caution tone, app-wide
 * beta state): Preview is info-toned and scoped to a single feature so users can
 * tell a preview surface apart from a finished one at a glance.
 *
 * Decorative by default; pass a `title` when the badge needs a tooltip.
 */
export function PreviewBadge({ title }: { title?: string }) {
    return (
        <span
            title={title}
            className={`rounded-full border px-2 py-0.5 text-label-caps font-semibold uppercase tracking-[0.15em] ${STATUS_PILL.info}`}
        >
            Preview
        </span>
    );
}
