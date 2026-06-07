import Link from "next/link";

import { BackendBanner } from "@/components/home/BackendBanner";
import { CockpitClient } from "@/components/home/CockpitClient";
import { InvestmentPreview } from "@/components/home/InvestmentPreview";
import { CockpitSummary } from "@/components/home/CockpitSummary";
import { RankedSignals } from "@/components/home/RankedSignals";
import { AiWorkflowCallout } from "@/components/home/AiWorkflowCallout";
import { DataConfidenceIndicator } from "@/components/home/DataConfidenceIndicator";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { getLensFromSearchParams, getLensConfig, DEFAULT_ROLE } from "@/lib/lensContext";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getHomeData } from "@/lib/api/home";
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
    filters: Parameters<typeof getHomeData>[0],
): Promise<HomeResponse | null> => {
    try {
        return await getHomeData(filters);
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
    const [health, home, meta] = await Promise.all([
        checkApiHealth(),
        loadHome(filters),
        getApiMeta(),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }
    const lastIngestedAt = home?.freshness.last_ingested_at ?? null;
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
        <div className="min-h-screen bg-(image:--hero-gradient) text-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="home" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-10">
                    <header className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.4)]">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                        Status
                                    </p>
                                    <h1 className="mt-4 font-(--font-display) text-3xl leading-tight sm:text-4xl">
                                        Developer Health Ops Cockpit
                                    </h1>
                                    <p className="mt-3 max-w-xl text-sm text-(--ink-muted)">
                                        System patterns over the last {filters.time.range_days}{" "}
                                        days.
                                    </p>
                                    {lensConfig.framing ? (
                                        <p className="mt-1 text-xs text-(--accent-2)/80">
                                            {lensConfig.framing}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <BackendBanner meta={meta} />
                                <p className="text-sm text-(--ink-muted)">
                                    <ClientTimestamp
                                        value={lastIngestedAt}
                                        prefix="Last updated: "
                                    />
                                </p>
                            </div>
                        </div>
                    </header>

                    <GlobalContextBar filters={filters} />
                    <FilterBar view="home" />

                    {/* Minimal freshness indicator only — no integration status UI */}

                    {home?.data_confidence && (
                        <DataConfidenceIndicator confidence={home.data_confidence} />
                    )}

                    <CockpitSummary home={home} filters={filters} />

                    {home?.signals && home.signals.length > 0 ? (
                        <RankedSignals signals={home.signals} filters={filters} />
                    ) : null}

                    <AiWorkflowCallout
                        filters={filters}
                        activeRole={activeRole}
                        prominent={aiDominant}
                    />

                    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
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
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {prioritizedViews.map((view) => (
                                <Link
                                    key={view.id}
                                    href={withFilterParam(view.href, filters, activeRole)}
                                    className="group rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 transition hover:-translate-y-1"
                                >
                                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
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

                    <CockpitClient home={home} filters={filters} activeRole={activeRole} />

                    <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                        <div>
                            <h3 className="font-(--font-display) text-xl">Investment mix</h3>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Work allocation snapshot for the selected window.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.2em]">
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
                                    {CTA_LABELS.openInExplore}
                                </Link>
                            </div>
                        </div>
                        <InvestmentPreview filters={filters} />
                    </section>
                </main>
            </div>
        </div>
    );
}
