import { CockpitSummary } from "@/components/home/CockpitSummary";
import { RankedSignals } from "@/components/home/RankedSignals";
import { DataConfidenceIndicator } from "@/components/home/DataConfidenceIndicator";
import { EvidenceContextCard } from "@/components/home/EvidenceContextCard";
import { HomeMonitoring } from "@/components/home/HomeMonitoring";
import { InvestigationThreads } from "@/components/home/InvestigationThreads";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { getLensFromSearchParams, getLensConfig, DEFAULT_ROLE } from "@/lib/lensContext";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { getSetupStatus } from "@/lib/admin/server";
import { SetupBanner } from "@/components/onboarding/SetupBanner";
import { auth } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { formatCoveragePct } from "@/lib/cockpit/coverage";
import { formatNumber } from "@/lib/formatters";
import { buildThreadApiUrl } from "@/lib/cockpit/evidenceRef";
import type { HomeResponse } from "@/lib/types";

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
    // The coverage counts of the meta endpoint, as served (key and number). The old header strip
    // showed the first three; the page evidence drawer lists every one.
    const coverageCounts = Object.entries(meta?.coverage ?? {}).filter(
        (entry): entry is [string, number] =>
            typeof entry[1] === "number" && Number.isFinite(entry[1]),
    );

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-10 text-foreground">
            <PageHeader
                title="Home"
                subtitle={<>System patterns over the last {filters.time.range_days} days.</>}
                actions={
                    // The page subject is the Home payload itself, for the page's scope and window.
                    <PageHeaderEvidenceAction
                        subject={{
                            title: "Home",
                            apiUrl: buildThreadApiUrl("/api/v1/home", filters),
                            filters,
                            // The served coverage of the page: read here, not in the body. First
                            // the source coverage of the Home response, then one row per coverage
                            // count that the meta endpoint served (none when it served none).
                            intro: (
                                <EvidenceFactList
                                    aria-label="Page data confidence"
                                    testId="home-evidence-coverage"
                                >
                                    <EvidenceFact
                                        label="Coverage"
                                        value={formatCoveragePct(
                                            home?.data_confidence?.coverage_pct,
                                        )}
                                    />
                                    {coverageCounts.map(([key, count]) => (
                                        <EvidenceFact
                                            key={key}
                                            label={`Coverage: ${key}`}
                                            value={formatNumber(count)}
                                        />
                                    ))}
                                </EvidenceFactList>
                            ),
                        }}
                    />
                }
            >
                {lensConfig.framing ? (
                    <p className="text-xs text-(--accent-2)/80">{lensConfig.framing}</p>
                ) : null}
            </PageHeader>

            {setupStatus ? <SetupBanner status={setupStatus} orgId={setupOrgId} /> : null}

            <ScopeBar view="home" />

            {/* Approved Home layout (prototype `cockpit()`): confidence banner, primary-signal
                hero, the ranked signals table beside the "Evidence & context" card, Monitoring,
                then Investigation threads. Nothing else is a body block. */}
            <div className="flex min-w-0 flex-col gap-4.5" data-testid="home-primary">
                {home?.data_confidence ? (
                    <DataConfidenceIndicator confidence={home.data_confidence} />
                ) : null}

                <CockpitSummary home={home} filters={filters} />

                <div className="grid gap-4.5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <RankedSignals
                        signals={home?.signals ?? []}
                        deltas={home?.deltas}
                        filters={filters}
                    />
                    <EvidenceContextCard home={home} />
                </div>

                <HomeMonitoring
                    home={home}
                    filters={filters}
                    activeRole={activeRole}
                    lensId={activeLensId}
                    initialView={
                        Array.isArray(params.monitoring) ? params.monitoring[0] : params.monitoring
                    }
                />

                <InvestigationThreads home={home} filters={filters} activeRole={activeRole} />
            </div>
        </div>
    );
}
