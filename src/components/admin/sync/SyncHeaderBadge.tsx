import type { SyncConfig, SyncCoverageSummary } from "@/lib/admin/types";

import { CoverageBadge, healthLabel, healthTone } from "./CoverageBadge";
import { persistedStatus } from "./syncConfigTableModel";
import { SyncStatusBadge } from "./SyncStatusBadge";

/**
 * The status badge beside the name of a sync configuration. It is the coverage status label that the
 * coverage card shows (design, MAPPING A12), so the header and the card never disagree. When the
 * coverage could not be read, it falls back to the last sync result, as the page showed before, so the
 * header is never empty.
 */
export function SyncHeaderBadge({
    config,
    coverage,
}: {
    readonly config: SyncConfig;
    readonly coverage: SyncCoverageSummary | null;
}) {
    if (coverage) {
        return (
            <span data-testid="sync-header-badge" data-source="coverage">
                <CoverageBadge
                    tone={healthTone(coverage.overall.health)}
                    label={healthLabel(coverage.overall.health)}
                />
            </span>
        );
    }
    return (
        <span data-testid="sync-header-badge" data-source="last-sync">
            <SyncStatusBadge status={persistedStatus(config)} />
        </span>
    );
}
