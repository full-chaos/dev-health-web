import type { SyncCoverageSummary } from "@/lib/admin/types";

import { CoverageBadge, healthLabel, healthTone } from "./CoverageBadge";

/**
 * The status badge of a sync configuration header. It is the coverage status label that the coverage
 * card shows (design, MAPPING A12), so the header and the card never disagree. When the coverage could
 * not be read there is no badge: a missing coverage is not a status, and the result of the last sync
 * means something else (it can be "Success" while the coverage says "Failed").
 */
export function SyncHeaderBadge({ coverage }: { readonly coverage: SyncCoverageSummary | null }) {
    if (!coverage) return null;
    return (
        <span data-testid="sync-header-badge">
            <CoverageBadge
                tone={healthTone(coverage.overall.health)}
                label={healthLabel(coverage.overall.health)}
            />
        </span>
    );
}
