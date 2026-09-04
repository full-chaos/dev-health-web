"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshControl } from "@/components/admin/RefreshControl";
import { SyncCoverageSummaryCard } from "./SyncCoverageSummaryCard";
import { SyncCoverageTimeline } from "./SyncCoverageTimeline";
import { BackfillStatus } from "./BackfillStatus";
import { BackfillWizard } from "./BackfillWizard";
import type {
    BackfillJob,
    SyncCoverageBackfillWindow,
    SyncCoverageSummary,
} from "@/lib/admin/types";

interface BackfillOperationsProps {
    configId: string;
    coverage: SyncCoverageSummary | null;
    coverageError?: string | null;
    isActive: boolean;
    /** Persisted active backfill job (live fetch or test-mode sample); see BackfillStatus. */
    activeBackfillJob: BackfillJob | null;
    testMode?: boolean;
}

/**
 * Owns backfill as an OPERATIONAL action on the config detail page
 * (CHAOS-2795): the coverage summary's "Backfill" CTA and every timeline gap
 * row's "Backfill this gap" action open the wizard in place here instead of
 * deep-linking to the edit page. Also hosts the persisted in-progress status
 * (CHAOS-2795) so it survives navigation.
 *
 * CHAOS-4318: while a coverage projection is refreshing, this used to poll
 * `router.refresh()` on a timer. The Python API replicas are a scarce
 * resource, so it now fetches once on mount/navigation and otherwise only on
 * an explicit Refresh click (with a last-updated timestamp).
 */
export function BackfillOperations({
    configId,
    coverage,
    coverageError,
    isActive,
    activeBackfillJob,
    testMode = false,
}: BackfillOperationsProps) {
    const router = useRouter();
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [wizardWindows, setWizardWindows] = useState<SyncCoverageBackfillWindow[]>([]);
    const [isRefreshing, startRefresh] = useTransition();

    // `coverage` is a fresh prop from the server on every render this
    // component receives new data for (including after router.refresh()).
    // Re-synced synchronously during render when the reference changes — the
    // documented React pattern for resetting state from props (mirrors
    // BackfillStatus's `backfillJobSyncKey`) — so this needs no useEffect
    // (react-hooks/set-state-in-effect).
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(() =>
        testMode ? null : new Date().toISOString(),
    );
    const [syncedCoverage, setSyncedCoverage] = useState(coverage);
    if (coverage !== syncedCoverage) {
        setSyncedCoverage(coverage);
        if (!testMode) setLastUpdatedAt(new Date().toISOString());
    }

    function handleRefresh() {
        startRefresh(() => {
            router.refresh();
        });
    }

    const openWizard = (range?: SyncCoverageBackfillWindow | SyncCoverageBackfillWindow[]) => {
        const suggestions = coverage?.backfill_windows;
        setWizardWindows(
            Array.isArray(range)
                ? range
                : range
                  ? [range]
                  : suggestions?.length === 1
                    ? [suggestions[0]]
                    : [],
        );
        setIsWizardOpen(true);
    };
    const closeWizard = () => setIsWizardOpen(false);

    return (
        <>
            {coverage?.projection_refreshing === true && (
                <div
                    role="status"
                    aria-label="Coverage update in progress"
                    className="flex items-start justify-between gap-3 rounded-xl border border-(--info)/40 bg-(--info)/10 p-4 text-sm"
                >
                    <div className="flex items-start gap-3">
                        <span aria-hidden="true" className="text-(--info)">
                            ↻
                        </span>
                        <div>
                            <p className="font-medium text-foreground">Updating coverage</p>
                            <p className="mt-1 text-(--ink-muted)">
                                Showing the last completed coverage while this sync is updating it.
                            </p>
                        </div>
                    </div>
                    {!testMode && (
                        <RefreshControl
                            onRefresh={handleRefresh}
                            lastUpdatedAt={lastUpdatedAt}
                            isRefreshing={isRefreshing}
                        />
                    )}
                </div>
            )}

            <SyncCoverageSummaryCard
                configId={configId}
                coverage={coverage}
                error={coverageError}
                isActive={isActive}
                onBackfillAction={() => openWizard()}
            />

            <BackfillStatus
                key={activeBackfillJob?.id ?? "none"}
                initialJob={activeBackfillJob}
                testMode={testMode}
            />

            <SyncCoverageTimeline
                coverage={coverage}
                error={coverageError}
                onBackfillWindowAction={openWizard}
                onBackfillWindowsAction={openWizard}
            />

            {isWizardOpen && (
                <BackfillWizard
                    configId={configId}
                    onCloseAction={closeWizard}
                    initialWindows={wizardWindows}
                    suggestedWindows={coverage?.backfill_windows}
                    datasets={coverage?.datasets ?? []}
                    sources={coverage?.sources ?? []}
                    testMode={testMode}
                />
            )}
        </>
    );
}
