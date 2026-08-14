"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

const COVERAGE_REFRESH_INTERVAL_MS = 5000;

/**
 * Owns backfill as an OPERATIONAL action on the config detail page
 * (CHAOS-2795): the coverage summary's "Backfill" CTA and every timeline gap
 * row's "Backfill this gap" action open the wizard in place here instead of
 * deep-linking to the edit page. Also hosts the persisted in-progress status
 * (CHAOS-2795) so it survives navigation.
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
    const [wizardWindow, setWizardWindow] = useState<SyncCoverageBackfillWindow | null>(null);

    useEffect(() => {
        if (testMode || coverage?.projection_refreshing !== true) return undefined;
        const interval = setInterval(() => router.refresh(), COVERAGE_REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [coverage?.projection_refreshing, router, testMode]);

    const openWizard = (range?: SyncCoverageBackfillWindow) => {
        const suggestions = coverage?.backfill_windows;
        setWizardWindow(range ?? (suggestions?.length === 1 ? suggestions[0] : null));
        setIsWizardOpen(true);
    };
    const closeWizard = () => setIsWizardOpen(false);

    return (
        <>
            {coverage?.projection_refreshing === true && (
                <div
                    role="status"
                    aria-label="Coverage update in progress"
                    className="flex items-start gap-3 rounded-xl border border-(--info)/40 bg-(--info)/10 p-4 text-sm"
                >
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
            />

            {isWizardOpen && (
                <BackfillWizard
                    configId={configId}
                    onCloseAction={closeWizard}
                    initialWindow={wizardWindow ?? undefined}
                    suggestedWindows={coverage?.backfill_windows}
                    datasets={coverage?.datasets ?? []}
                    sources={coverage?.sources ?? []}
                    testMode={testMode}
                />
            )}
        </>
    );
}
