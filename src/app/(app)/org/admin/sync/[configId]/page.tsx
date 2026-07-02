import { notFound } from "next/navigation";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncStatusBadge } from "@/components/admin/sync/SyncStatusBadge";
import { SyncCoverageSummaryCard } from "@/components/admin/sync/SyncCoverageSummaryCard";
import { SyncCoverageTimeline } from "@/components/admin/sync/SyncCoverageTimeline";
import { SyncJobHistory } from "@/components/admin/sync/SyncJobHistory";
import { SyncProgressBar } from "@/components/admin/sync/SyncProgressBar";
import { TestConnectionButton } from "@/components/admin/sync/TestConnectionButton";
import { getServerEnv } from "@/lib/config";
import { getSyncConfig, getSyncJobs, getSyncCoverage, getCurrentOrg } from "@/lib/admin/server";
import {
    SAMPLE_SYNC_CONFIG,
    SAMPLE_SYNC_JOBS,
    SYNC_COVERAGE_SAMPLES,
    resolveSyncCoverageSampleScenario,
} from "@/data/syncCoverageSample";
import type { SyncConfig, SyncCoverageSummary, SyncJob } from "@/lib/admin/types";

interface PageProps {
    params: Promise<{ configId: string }>;
    /** `coverage_scenario` selects a sample scenario in DEV_HEALTH_TEST_MODE only. */
    searchParams: Promise<{ coverage_scenario?: string }>;
}

export default async function SyncConfigDetailPage({ params, searchParams }: PageProps) {
    const { configId } = await params;
    const { coverage_scenario: coverageScenario } = await searchParams;

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    let config: SyncConfig;
    let jobs: SyncJob[];
    let coverage: SyncCoverageSummary | null;
    let coverageError: string | null = null;
    let orgId: string;

    if (isTestMode) {
        // Render deterministic sample data without hitting the admin API so the
        // page is exercisable in Playwright/test mode (web AGENTS test-mode rule).
        config = SAMPLE_SYNC_CONFIG;
        jobs = SAMPLE_SYNC_JOBS;
        coverage = SYNC_COVERAGE_SAMPLES[resolveSyncCoverageSampleScenario(coverageScenario)];
        orgId = "sample-org";
    } else {
        const [configResult, jobsResult, coverageResult, orgResult] = await Promise.all([
            getSyncConfig(configId),
            getSyncJobs(configId),
            getSyncCoverage(configId),
            getCurrentOrg(),
        ]);

        if (configResult.error || !configResult.data) {
            notFound();
        }

        config = configResult.data;
        jobs = jobsResult.data ?? [];
        orgId = orgResult.data?.id ?? "";

        // withErrorHandling RETURNS { error } (never throws), so a failed
        // coverage fetch surfaces here. Do NOT fabricate an empty summary —
        // pass the error through so the coverage card/timeline render an
        // explicit notice while the rest of the page still renders.
        if (coverageResult.error || !coverageResult.data) {
            coverage = null;
            coverageError = coverageResult.error ?? "Coverage summary is unavailable.";
        } else {
            coverage = coverageResult.data;
        }
    }

    const getStatus = () => {
        if (!config.last_sync_at) return "never";
        return config.last_sync_success ? "success" : "failed";
    };

    return (
        <div className="space-y-8">
            <AdminHeader title={config.name} description={`Provider: ${config.provider}`}>
                <TestConnectionButton provider={config.provider} credentialId={config.credential_id} />
            </AdminHeader>

            <SyncProgressBar configId={config.id} provider={config.provider} orgId={orgId} />

            <SyncCoverageSummaryCard
                configId={config.id}
                coverage={coverage}
                error={coverageError}
                isActive={config.is_active}
            />

            <SyncCoverageTimeline configId={config.id} coverage={coverage} error={coverageError} />

            <details className="group space-y-4 rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <summary className="cursor-pointer text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                    Sync details
                </summary>

                <div className="mt-4 grid gap-6 md:grid-cols-3">
                    <div>
                        <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                            Current Status
                        </h3>
                        <div className="mt-2">
                            <SyncStatusBadge status={getStatus()} className="text-sm px-3 py-1" />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                            Last Sync
                        </h3>
                        <p className="mt-2 text-lg font-medium text-foreground">
                            <ClientTimestamp value={config.last_sync_at} fallback="Never" />
                        </p>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                            Active
                        </h3>
                        <p className="mt-2 text-lg font-medium text-foreground">
                            {config.is_active ? "Yes" : "No"}
                        </p>
                    </div>
                </div>

                {config.sync_targets.length > 0 && (
                    <div className="mt-6 space-y-2">
                        <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                            Sync Targets
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {config.sync_targets.map((target) => (
                                <span
                                    key={target}
                                    className="rounded-full bg-(--card-70) px-3 py-1 text-xs font-medium text-foreground"
                                >
                                    {target}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {config.last_sync_error && (
                    <div className="mt-6 rounded-lg border border-(--negative)/20 bg-(--negative)/10 p-4 text-sm text-(--negative)">
                        <span className="font-medium">Last sync error:</span> {config.last_sync_error}
                    </div>
                )}
            </details>

            <div className="space-y-4">
                <h2 className="text-lg font-medium text-foreground">Job History</h2>
                <SyncJobHistory jobs={jobs} configId={config.id} testMode={isTestMode} />
            </div>
        </div>
    );
}
