import Link from "next/link";

import { BackendBanner } from "@/components/home/BackendBanner";
import { CockpitClient } from "@/components/home/CockpitClient";
import { InvestmentPreview } from "@/components/home/InvestmentPreview";
import { CockpitSummary } from "@/components/home/CockpitSummary";
import { RankedSignals } from "@/components/home/RankedSignals";
import { ThreadRow } from "@/components/home/ThreadRow";
import { AiWorkflowCallout } from "@/components/home/AiWorkflowCallout";
import { DataConfidenceIndicator } from "@/components/home/DataConfidenceIndicator";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { getLensFromSearchParams, getLensConfig, DEFAULT_ROLE } from "@/lib/lensContext";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { getSetupStatus } from "@/lib/admin/server";
import { SetupBanner } from "@/components/onboarding/SetupBanner";
import { auth } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { CTA_LABELS } from "@/lib/design/cta";
import { isAiDominant } from "@/lib/cockpit/aiGate";
import type { HomeResponse } from "@/lib/types";

const MONITORING_VIEWS = [
    {
        id: "dora",
        label: "DORA",
        description: "Release speed and stability.",
        focus: "Deploy frequency, cycle time, failure rate.",
        href: "/metrics?tab=dora",
    },
    {
        id: "flow",
        label: "Flow",
        description: "Idea to merge insight.",
        focus: "Review latency, throughput, WIP.",
        href: "/metrics?tab=flow",
    },
    {
        id: "throughput",
        label: "Throughput",
        description: "Delivery volume and pacing.",
        focus: "Throughput, WIP saturation, blocked work.",
        href: "/metrics?tab=throughput",
    },
];

const loadHome = async (
    filters: Parameters<typeof getHomeDataViaGraphQL>[0],
): Promise<HomeResponse | null> => {
    try {
        return await getHomeDataViaGraphQL(filters);
    } catch {
        return null;
    }
};

type HomePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams }: HomePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const lensParam = Array.isArray(params.lens) ? params.lens[0] : params.lens;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeLensId =
        getLensFromSearchParams(
            new URLSearchParams({
                ...(lensParam ? { lens: lensParam } : {}),
                ...(roleParam ? { role: roleParam } : {}),
            }),
        ) ?? "neutral";
    const lensConfig = getLensConfig(activeLensId);
    // Resolve a concrete role for child components that require RoleType.
    const activeRole = activeLensId === "neutral" ? DEFAULT_ROLE : activeLensId;

    // Run health check in parallel with data fetches to eliminate the waterfall.
    const [health, home, meta, setupResult, session] = await Promise.all([
        checkApiHealth(),
        loadHome(filters),
        getApiMeta(),
        getSetupStatus(),
        auth(),
    ]);
    // CHAOS-2678: setup-aware surface. Degrade to no banner if the C2 status
    // call fails rather than blocking the cockpit.
    const setupStatus = setupResult.data ?? null;
    const setupOrgId = session?.user?.org_id ?? null;

    if (!health.ok) {
        // The shared app shell owns the `<main>` landmark for this route.
        return <ServiceUnavailable landmark={false} />;
    }
    const lastUpdatedAt =
        home?.freshness.latest_successful_sync_at ?? home?.freshness.last_ingested_at ?? null;
    // Reorder Monitoring Views based on active lens (cockpit surface priority).
    const viewPriority: Record<string, string[]> = {
        ic: ["flow", "throughput", "dora"],
        em: ["flow", "throughput", "dora"],
        pm: ["flow", "throughput", "dora"],
        leadership: ["throughput", "dora", "flow"],
        neutral: ["flow", "throughput", "dora"],
    };
    const prioritizedViews = [...MONITORING_VIEWS].sort((a, b) => {
        const priority = viewPriority[activeLensId] ?? viewPriority.neutral;
        return priority.indexOf(a.id) - priority.indexOf(b.id);
    });

    const aiDominant = isAiDominant({ signals: home?.signals ?? null });

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-10 text-foreground">
            <PageHeader
                title="Home"
                subtitle={<>System patterns over the last {filters.time.range_days} days.</>}
            >
                {lensConfig.framing ? (
                    <p className="text-xs text-(--accent-2)/80">{lensConfig.framing}</p>
                ) : null}
                <div className="flex items-center justify-between">
                    <BackendBanner meta={meta} />
                    <p className="text-body font-medium text-(--text-secondary)">
                        <ClientTimestamp value={lastUpdatedAt} prefix="Last updated: " />
                    </p>
                </div>
            </PageHeader>

            {setupStatus ? <SetupBanner status={setupStatus} orgId={setupOrgId} /> : null}

            <ScopeBar view="home" />

            {/* Minimal freshness indicator only — no integration status UI */}

            {home?.data_confidence && <DataConfidenceIndicator confidence={home.data_confidence} />}

            <CockpitSummary home={home} filters={filters} />

            {home?.signals && home.signals.length > 0 ? (
                <RankedSignals signals={home.signals} filters={filters} />
            ) : null}

            {aiDominant ? (
                <AiWorkflowCallout filters={filters} activeRole={activeRole} prominent />
            ) : null}

            <section className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card) p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-label-caps uppercase text-(--ink-muted)">
                            Monitoring views
                        </p>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            Tabs for steady trend monitoring.
                        </p>
                    </div>
                    <Link
                        href={withFilterParam("/metrics?tab=dora", filters, activeRole)}
                        className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                    >
                        {CTA_LABELS.openMetrics}
                    </Link>
                </div>
                <div className="mt-4 grid gap-3.5 md:grid-cols-3">
                    {prioritizedViews.map((view) => (
                        <Link
                            key={view.id}
                            href={withFilterParam(view.href, filters, activeRole)}
                            className="group rounded-(--radius-md) border border-(--card-stroke) bg-background px-5 py-4.5 transition hover:-translate-y-0.5 hover:border-(--accent)"
                        >
                            <div className="flex items-center justify-between text-label-caps uppercase text-(--ink-muted)">
                                <span>{view.label}</span>
                                <span className="text-(--accent-2)">Open</span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                                {view.description}
                            </p>
                            <p className="mt-2 text-xs text-(--ink-muted)">{view.focus}</p>
                        </Link>
                    ))}
                </div>
            </section>

            <CockpitClient home={home} filters={filters} activeRole={activeRole}>
                <ThreadRow
                    id="investment-mix"
                    title="Investment mix"
                    summary="Work allocation snapshot for the selected window."
                    deferred={
                        <div className="mt-4">
                            <InvestmentPreview filters={filters} />
                        </div>
                    }
                >
                    <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.2em]">
                        <Link
                            href={withFilterParam("/work", filters, activeRole)}
                            className="text-(--accent-2)"
                        >
                            {CTA_LABELS.openWorkView}
                        </Link>
                        <Link
                            href={buildExploreUrl({
                                metric: "throughput",
                                filters,
                                role: activeRole,
                            })}
                            className="text-(--accent-2)"
                        >
                            {CTA_LABELS.openEvidence}
                        </Link>
                    </div>
                </ThreadRow>
                {aiDominant ? null : (
                    <div className="px-5 py-4">
                        <AiWorkflowCallout
                            filters={filters}
                            activeRole={activeRole}
                            prominent={false}
                        />
                    </div>
                )}
            </CockpitClient>
        </div>
    );
}
