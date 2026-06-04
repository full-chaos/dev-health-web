import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { AreaOverview } from "@/components/navigation/AreaOverview";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { BackLink } from "@/components/shared/BackLink";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData, getHomeData } from "@/lib/api/home";
import { getInvestment } from "@/lib/api/investment";
import { getHeatmap, getQuadrant } from "@/lib/api/visuals";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { getInvestmentMixForHydration } from "@/lib/graphql/investmentHydration";
import { HydrateUrqlResults } from "@/lib/graphql/HydrateUrqlResults";
import { normalizeInvestmentMix } from "@/lib/investmentMix";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { LandscapeView } from "@/components/work/LandscapeView";
import { HeatmapView } from "@/components/work/HeatmapView";
import { FlowView } from "@/components/work/FlowView";
import { InvestmentView } from "@/components/work/InvestmentView";
import { CapacityView } from "@/components/work/CapacityView";
import { FlameView } from "@/components/work/FlameView";
import { EvidenceView } from "@/components/work/EvidenceView";
import { GraphView } from "@/components/work/GraphView";
import { WorkTabNav, type WorkTab } from "@/components/navigation/WorkTabNav";
import { getDiagnoseSignals } from "@/lib/areaSignals/diagnose";
import { getServerEnv } from "@/lib/config";
import {
	resolveActiveView,
	type DiagnoseView,
} from "@/lib/navigation/workPageView";

type WorkPageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const findCategory = (
	categories: Array<{ key: string; name: string; value: number }>,
	tokens: string[],
) =>
	categories.find((category) =>
		tokens.some((token) =>
			`${category.key} ${category.name}`.toLowerCase().includes(token),
		),
	);

export default async function WorkPage({ searchParams }: WorkPageProps) {
	const params = (await searchParams) ?? {};
	const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
	const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
	const originParam = Array.isArray(params.origin)
		? params.origin[0]
		: params.origin;
	const activeRole = typeof roleParam === "string" ? roleParam : undefined;
	const activeOrigin =
		typeof originParam === "string" ? originParam : undefined;

	const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
	const activeTab: WorkTab =
		typeof tabParam === "string" &&
		[
			"landscape",
			"heatmap",
			"flow",
			"investment",
			"capacity",
			"flame",
			"evidence",
			"graph",
		].includes(tabParam)
			? (tabParam as WorkTab)
			: "landscape";

	const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
	// resolveActiveView preserves legacy /work?tab=<workTab> deep links: when
	// `view` is absent but a valid `tab` is present it returns "work" so the Work
	// content branch renders and the existing `tab` logic picks the sub-view.
	const activeView: DiagnoseView = resolveActiveView(viewParam, tabParam);

	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);
	const scopeId = filters.scope.ids[0] ?? "";
	const quadrantScope: "org" | "team" | "repo" | "developer" =
		filters.scope.level === "developer"
			? "developer"
			: filters.scope.level === "team" || filters.scope.level === "repo"
				? filters.scope.level
				: "org";

	const env = getServerEnv();
	const isTestMode =
		env.DEV_HEALTH_TEST_MODE === "true" ||
		env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

	// When GraphQL transport is enabled we use the hydration-aware fetcher so
	// the client-side <InvestmentView> useQuery resolves from cache instead of
	// triggering a second network round-trip (CHAOS-1276 Phase C). Falls back
	// to the REST path when GraphQL is disabled or session has no org_id.
	const graphqlEnabled = runtimeConfig.useGraphQLAnalytics();
	let hydrationOrgId: string | undefined;
	if (graphqlEnabled) {
		const { auth } = await import("@/lib/auth");
		const session = await auth();
		hydrationOrgId = session?.user?.org_id as string | undefined;
	}

	const investmentFetch =
		graphqlEnabled && hydrationOrgId
			? fetchOrNull(
					getInvestmentMixForHydration(filters, hydrationOrgId),
					"work/investment-hydration",
				)
			: fetchOrNull(
					getInvestment(filters).then((data) => ({
						data,
						hydrationPayload: null,
					})),
					"work/investment",
				);

	// Resolve the area's sub-area signals and the borrowed Work metric content
	// in parallel — no waterfall.
	const [
		health,
		home,
		investmentResult,
		wipExplain,
		blockedExplain,
		reviewHeatmap,
		cycleThroughput,
		wipThroughput,
		reviewLoadLatency,
		diagnoseSignals,
	] = await Promise.all([
		checkApiHealth(),
		fetchOrNull(getHomeData(filters), "work/home-data"),
		investmentFetch,
		fetchOrNull(
			getExplainData({ metric: "wip_saturation", filters }),
			"work/explain-wip_saturation",
		),
		fetchOrNull(
			getExplainData({ metric: "blocked_work", filters }),
			"work/explain-blocked_work",
		),
		fetchOrNull(
			getHeatmap({
				type: "temporal_load",
				metric: "review_wait_density",
				scope_type: filters.scope.level,
				scope_id: scopeId,
				range_days: filters.time.range_days,
				start_date: filters.time.start_date,
				end_date: filters.time.end_date,
			}),
			"work/review-heatmap",
		),
		fetchOrNull(
			getQuadrant({
				type: "cycle_throughput",
				scope_type: quadrantScope,
				scope_id: scopeId,
				range_days: filters.time.range_days,
				bucket: "week",
				start_date: filters.time.start_date,
				end_date: filters.time.end_date,
			}),
			"work/cycle-throughput-quadrant",
		),
		fetchOrNull(
			getQuadrant({
				type: "wip_throughput",
				scope_type: quadrantScope,
				scope_id: scopeId,
				range_days: filters.time.range_days,
				bucket: "week",
				start_date: filters.time.start_date,
				end_date: filters.time.end_date,
			}),
			"work/wip-throughput-quadrant",
		),
		fetchOrNull(
			getQuadrant({
				type: "review_load_latency",
				scope_type: quadrantScope,
				scope_id: scopeId,
				range_days: filters.time.range_days,
				bucket: "week",
				start_date: filters.time.start_date,
				end_date: filters.time.end_date,
			}),
			"work/review-load-latency-quadrant",
		),
		getDiagnoseSignals(filters, isTestMode),
	]);

	if (!health.ok && !isTestMode) {
		return <ServiceUnavailable />;
	}

	const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
	const placeholderDeltas = !home?.deltas?.length;
	const investment = investmentResult?.data ?? null;
	const investmentHydrationPayload = investmentResult?.hydrationPayload ?? null;
	const investmentMix = investment ? normalizeInvestmentMix(investment) : null;

	const investmentCategoriesForSummary = investmentMix
		? Object.entries(investmentMix.theme_distribution).map(([key, value]) => ({
				key,
				name: key.replace(/[_-]+/g, " "),
				value,
			}))
		: [];

	const planned = investmentMix
		? (findCategory(investmentCategoriesForSummary, [
				"planned",
				"roadmap",
				"feature",
			]) ?? null)
		: null;
	const unplanned = investmentMix
		? (findCategory(investmentCategoriesForSummary, [
				"unplanned",
				"interrupt",
				"incident",
				"support",
				"ops",
				"run",
			]) ?? null)
		: null;
	const plannedTotal =
		planned && unplanned ? planned.value + unplanned.value : 0;
	const plannedPct = plannedTotal ? (planned?.value ?? 0) / plannedTotal : null;
	const unplannedPct = plannedTotal
		? (unplanned?.value ?? 0) / plannedTotal
		: null;

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
				<PrimaryNav filters={filters} active="diagnose" role={activeRole} />
				<main className="flex min-w-0 flex-1 flex-col gap-8">
					<header className="flex flex-col gap-4">
						<BackLink href={withFilterParam("/", filters, activeRole)} />
						<div>
							{/* A6: the area is named by the AREA ("Diagnose"), not a borrowed leaf. */}
							<p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
								Diagnose
							</p>
							<h1 className="mt-2 font-(--font-display) text-3xl">Diagnose</h1>
							<p className="mt-2 text-sm text-(--ink-muted)">
								Investigate flow, investment, landscape, people, code,
								complexity, cognitive load, and bottlenecks from one durable
								area.
							</p>
						</div>
					</header>

					<GlobalContextBar filters={filters} origin={activeOrigin} />
					<FilterBar view="work" />

					{activeView === "work" ? (
						<>
							<WorkTabNav
								activeTab={activeTab}
								filters={filters}
								role={activeRole}
							/>

							{activeTab === "landscape" && (
								<LandscapeView
									filters={filters}
									activeRole={activeRole}
									deltas={deltas}
									placeholderDeltas={placeholderDeltas}
									investmentMix={investmentMix}
									cycleThroughput={cycleThroughput}
									wipThroughput={wipThroughput}
									reviewLoadLatency={reviewLoadLatency}
									planned={planned}
									unplanned={unplanned}
									plannedPct={plannedPct}
									unplannedPct={unplannedPct}
								/>
							)}

							{activeTab === "heatmap" && (
								<HeatmapView
									filters={filters}
									scopeId={scopeId}
									reviewHeatmap={reviewHeatmap}
								/>
							)}

							{activeTab === "flow" && (
								<FlowView filters={filters} activeRole={activeRole} />
							)}

							{activeTab === "investment" && (
								<>
									<HydrateUrqlResults payload={investmentHydrationPayload} />
									<InvestmentView filters={filters} activeRole={activeRole} />
								</>
							)}

							{activeTab === "capacity" && <CapacityView filters={filters} />}

							{activeTab === "flame" && <FlameView filters={filters} />}

							{activeTab === "evidence" && (
								<EvidenceView
									filters={filters}
									activeRole={activeRole}
									wipExplain={wipExplain}
									blockedExplain={blockedExplain}
								/>
							)}

							{activeTab === "graph" && (
								<GraphView filters={filters} activeRole={activeRole} />
							)}
						</>
					) : (
						<AreaOverview
							areaId="diagnose"
							signals={diagnoseSignals}
							filters={filters}
							role={activeRole}
							title="Related workflows"
							description="Diagnostic sub-areas, ordered by severity."
						/>
					)}
				</main>
			</div>
		</div>
	);
}
