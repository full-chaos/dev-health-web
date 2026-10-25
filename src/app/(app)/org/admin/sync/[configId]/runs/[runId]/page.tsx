import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import {
    SYNC_RUN_UNIT_PAGE_SIZE,
    SyncRunDetailLive,
} from "@/components/admin/sync/SyncRunDetailLive";
import { getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import { getServerEnv } from "@/lib/config";
import { backToArea } from "@/lib/design/cta";
import { SAMPLE_SYNC_RUN, SAMPLE_SYNC_RUN_UNIT_SUMMARY } from "@/data/syncRunDetailSample";
import { readSyncRunAttention, type SyncRunAttention } from "@/lib/admin/syncRunAttention";
import type { SyncRun, SyncRunUnitSummary } from "@/lib/admin/types";

interface PageProps {
    params: Promise<{ configId: string; runId: string }>;
}

export default async function SyncRunDetailPage({ params }: PageProps) {
    const { configId, runId } = await params;

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    let run: SyncRun;
    let summary: SyncRunUnitSummary | null;
    let unitsError: string | null = null;
    let attention: SyncRunAttention | null = null;

    if (isTestMode) {
        // Render deterministic sample data without hitting the admin API so the
        // page is exercisable in Playwright/test mode (web AGENTS test-mode rule).
        run = SAMPLE_SYNC_RUN;
        summary = SAMPLE_SYNC_RUN_UNIT_SUMMARY;
    } else {
        const [runResult, unitsResult, attentionResult] = await Promise.all([
            getSyncRunStatus(runId),
            getSyncRunUnits(runId, { limit: SYNC_RUN_UNIT_PAGE_SIZE, offset: 0 }),
            readSyncRunAttention(runId),
        ]);
        attention = attentionResult;

        if (runResult.error || !runResult.data) {
            notFound();
        }

        run = runResult.data;

        // withErrorHandling RETURNS { error } (never throws), so a 401/404/500
        // from the units endpoint surfaces here. Do NOT fabricate an empty
        // summary — that would render "No data yet"/"Units (0)" as if the run
        // had no units, violating render-persisted-backend-state-only. Pass the
        // error through so the units region renders an explicit notice while the
        // (successful) run header still shows.
        if (unitsResult.error || !unitsResult.data) {
            summary = null;
            unitsError = READ_FAILED_MESSAGE;
        } else {
            summary = unitsResult.data;
        }
    }

    return (
        <div className="space-y-8">
            <Link
                href={`/org/admin/sync/${configId}`}
                className="inline-flex items-center text-sm font-medium text-(--ink-muted) hover:text-(--accent-2)"
            >
                {backToArea("config")}
            </Link>

            <AdminHeader title="Sync run" description="Run details" />

            <SyncRunDetailLive
                // Force remount on run navigation (CHAOS-2794): App Router can
                // reuse this mounted client component across
                // /runs/[runId] pushes, and initialRun/initialSummary are
                // only read into state ONCE (useState initializer), so
                // without this key a client-side nav to a different run
                // would keep showing the PREVIOUS run's state.
                key={run.id}
                initialRun={run}
                initialSummary={summary}
                initialUnitsError={unitsError}
                initialAttention={attention}
                testMode={isTestMode}
            />
        </div>
    );
}
