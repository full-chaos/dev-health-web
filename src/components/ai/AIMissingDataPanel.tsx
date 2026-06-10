import { DataState } from "@/components/ui/DataState";

type AIMissingDataPanelProps = {
    title: string;
    reason: string;
    needed?: string;
};

/**
 * Per-card "this metric is intentionally not shipped yet" marker.
 *
 * Use when a specific card in an otherwise-populated dashboard cannot
 * render because the underlying signal isn't exposed in the schema yet or
 * was deliberately deferred (e.g. reviewer concentration, deferred until
 * an aggregate-only distribution ships without per-person ranking). The
 * implication is "this is on the roadmap; here's the data source needed",
 * not "data does not exist".
 *
 * For whole-view "no data exists for this scope" coverage, use
 * {@link AIEmptyState} instead.
 *
 * Internally delegates to {@link DataState} (`detector-unavailable`) so the
 * canonical empty-state vocabulary is the single source of truth. The
 * `needed` prop maps to DataState's `detail` slot.
 */
export function AIMissingDataPanel({ title, reason, needed }: AIMissingDataPanelProps) {
    return (
        <DataState
            variant="detector-unavailable"
            title={title}
            description={reason}
            detail={needed}
            data-testid="ai-missing-data-panel"
        />
    );
}
