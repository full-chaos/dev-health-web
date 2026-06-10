import { DataState } from "@/components/ui/DataState";

/**
 * Whole-view "no data exists for this scope yet" marker.
 *
 * Use when an entire AI dashboard cannot render anything meaningful because
 * upstream ingestion hasn't produced rows for the selected scope. The
 * implication is "data does not exist", not "this feature isn't built".
 *
 * For "the metric exists in spec but the schema doesn't expose it yet",
 * use {@link AIMissingDataPanel} instead.
 *
 * Internally delegates to {@link DataState} (`no-data-connected`) so the
 * canonical empty-state vocabulary is the single source of truth.
 */
export function AIEmptyState({ title, children }: { title: string; children?: string }) {
    return (
        <DataState
            variant="no-data-connected"
            title={title}
            description={
                children ??
                "Connect a GitHub provider to populate AI-assisted PR attribution and workflow evidence."
            }
        />
    );
}
