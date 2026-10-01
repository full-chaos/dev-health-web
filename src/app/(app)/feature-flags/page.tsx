import { FeatureFlagTable } from "@/components/feature-flags/FeatureFlagTable";
import { SeverityPill } from "@/components/feature-flags/SeverityPill";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { DataState } from "@/components/ui/DataState";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchFeatureFlagsData, fetchFeatureFlagList } from "@/lib/feature-flags/fetchers";
import { FF_MEASURES } from "@/lib/feature-flags/constants";
import { getServerEnv } from "@/lib/config";
import { fetchFlagPage } from "./actions";
import { fetchOrNull } from "@/lib/fetchOrNull";

type FeatureFlagsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FeatureFlagsPage({ searchParams }: FeatureFlagsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const rangeDays = filters?.time?.range_days ?? 14;
    const today = new Date();
    const endDate = filters?.time?.end_date ?? today.toISOString().slice(0, 10);
    const startDate =
        filters?.time?.start_date ??
        new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);

    // fetchFeatureFlagsData re-throws on total failure (honest over silent-zero).
    // Catch it here so a flags-fetch error degrades to a page-local error rather
    // than rejecting the whole Promise.all and hitting the (app)/error.tsx boundary
    // (which replaces the entire app shell including the sidebar).
    const [health, ffData, flagList] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(
            fetchFeatureFlagsData({ startDate, endDate }, isTestMode),
            "feature-flags/data",
        ),
        fetchFeatureFlagList(0, 20),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    if (!ffData) {
        return (
            // Rendered inside the shared app shell: the layout owns the navigation, the
            // page padding and the `<main>` landmark.
            <div className="flex min-w-0 flex-1 flex-col gap-8">
                <DataState
                    variant="error"
                    title="Feature flags unavailable"
                    message="Unable to load feature flag metrics. Try refreshing the page."
                />
            </div>
        );
    }

    const { summary } = ffData;

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="Feature Flags"
                subtitle="Flag activity, release friction, and telemetry coverage."
            />

            <section className="grid gap-4 lg:grid-cols-2">
                <MetricCard
                    label={FF_MEASURES.ACTIVE_FLAGS.label}
                    value={summary.activeFlags}
                    unit=""
                    delta={summary.activeFlagsDelta}
                    spark={summary.activeFlagsSpark}
                    caption={FF_MEASURES.ACTIVE_FLAGS.description}
                />

                <div className="relative">
                    <MetricCard
                        label={FF_MEASURES.RELEASE_FRICTION_DELTA.label}
                        value={summary.releaseFrictionDelta ?? undefined}
                        unit="%"
                        spark={summary.releaseFrictionSpark}
                        caption={`Severity: ${summary.releaseFrictionSeverity ?? "unavailable"}`}
                    />
                    <SeverityPill
                        severity={summary.releaseFrictionSeverity}
                        className="absolute right-4 top-4"
                    />
                </div>

                <MetricCard
                    label={FF_MEASURES.RELEASE_ERROR_RATE_DELTA.label}
                    value={summary.releaseErrorRateDelta ?? undefined}
                    unit="%"
                    spark={summary.releaseErrorRateSpark}
                    caption={FF_MEASURES.RELEASE_ERROR_RATE_DELTA.description}
                />

                <MetricCard
                    label={FF_MEASURES.COVERAGE_RATIO.label}
                    value={summary.coverageRatio ?? undefined}
                    unit="%"
                    delta={summary.coverageRatioDelta}
                    spark={summary.coverageRatioSpark}
                    caption={FF_MEASURES.COVERAGE_RATIO.description}
                />
            </section>

            <section>
                <h2 className="mb-4 text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Flag Registry
                </h2>
                <FeatureFlagTable initialData={flagList} fetchAction={fetchFlagPage} />
            </section>
        </div>
    );
}
