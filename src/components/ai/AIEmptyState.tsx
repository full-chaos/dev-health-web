import type { ReactNode } from "react";

/**
 * Whole-view "no data exists for this scope yet" marker.
 *
 * Use when an entire AI dashboard cannot render anything meaningful because
 * upstream ingestion hasn't produced rows for the selected scope. The
 * implication is "data does not exist", not "this feature isn't built".
 *
 * For "the metric exists in spec but the schema doesn't expose it yet",
 * use {@link AIMissingDataPanel} instead.
 */
export function AIEmptyState({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-80) p-6 text-sm text-(--ink-muted)">
            <p className="font-medium text-foreground">{title}</p>
            <p className="mt-2">
                {children ??
                    "Connect a GitHub provider to populate AI-assisted PR attribution and workflow evidence."}
            </p>
        </div>
    );
}
