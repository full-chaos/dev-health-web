import Link from "next/link";
import { redirect } from "next/navigation";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { AreaOverview } from "@/components/navigation/AreaOverview";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { BackLink } from "@/components/shared/BackLink";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData, getHomeData } from "@/lib/api/home";
import { getHeatmap } from "@/lib/api/visuals";
import { CTA_LABELS } from "@/lib/design/cta";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { MetricCard } from "@/components/metrics/MetricCard";
import { HeatmapView } from "@/components/work/HeatmapView";
import { FlameView } from "@/components/work/FlameView";
import { EvidenceView } from "@/components/work/EvidenceView";
import { GraphView } from "@/components/work/GraphView";
import { WorkTabNav, type WorkTab } from "@/components/navigation/WorkTabNav";
import { getDiagnoseSignals } from "@/lib/areaSignals/diagnose";
import { getServerEnv } from "@/lib/config";
import {
	resolveActiveView,
	resolveRemovedWorkTabRedirect,
	WORK_TABS,
	type DiagnoseView,
} from "@/lib/navigation/workPageView";

type WorkPageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type SearchParamsRecord = { [key: string]: string | string[] | undefined };

const buildRedirectTarget = (
	targetPath: string,
	params: SearchParamsRecord,
) => {
	const nextParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (key !== "tab" && key !== "view") {
			if (typeof value === "string") {
				nextParams.set(key, value);
			} else {
				for (const entry of value ?? []) {
					nextParams.append(key, entry);
				}
			}
		}
	}
	const query = nextParams.toString();
	return query ? `${targetPath}?${query}` : targetPath;
};

const workOverviewLinks = [
	{
		id: "heatmap",
		title: "Heatmap",
		description: "Review wait density by weekday and hour.",
		href: "/work?view=work&tab=heatmap",
	},
	{
		id: "flame",
		title: "Flame",
		description:
			"Icicle-style decomposition for elapsed time, throughput, and hotspots.",
		href: "/work?view=work&tab=flame",
	},
	{
		id: "evidence",
		title: CTA_LABELS.evidence,
		description: "Inspectable WIP and blocked-work drivers with source links.",
		href: "/work?view=work&tab=evidence",
	},
	{
		id: "graph",
		title: "Work Graph",
		description:
			"Relationship topology across work, PRs, code, releases, and incidents.",
		href: "/work?view=work&tab=graph",
	},
] as const;

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
	const removedTabRedirect = resolveRemovedWorkTabRedirect(
		typeof tabParam === "string" ? tabParam : undefined,
	);
	if (removedTabRedirect) {
		redirect(buildRedirectTarget(removedTabRedirect, params));
	}
	const activeTab: WorkTab =
		typeof tabParam === "string" &&
		(WORK_TABS as readonly string[]).includes(tabParam)
			? (tabParam as WorkTab)
			: "overview";

	const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
	const activeView: DiagnoseView = resolveActiveView(viewParam, tabParam);

	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);
	const scopeId = filters.scope.ids[0] ?? "";

	const env = getServerEnv();
	const isTestMode =
		env.DEV_HEALTH_TEST_MODE === "true" ||
		env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

	const [
		health,
		home,
		wipExplain,
		blockedExplain,
		reviewHeatmap,
		diagnoseSignals,
	] = await Promise.all([
		checkApiHealth(),
		fetchOrNull(getHomeData(filters), "work/home-data"),
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
		getDiagnoseSignals(filters, isTestMode),
	]);

	if (!health.ok && !isTestMode) {
		return <ServiceUnavailable />;
	}

	const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
	const placeholderDeltas = !home?.deltas?.length;
	const pageTitle = activeView === "work" ? "Work" : "Diagnose";
	const pageSubtitle =
		activeView === "work"
			? "Inspect engineering work through evidence, topology, load, and graph-based views."
			: "Investigate flow, investment, landscape, people, code, complexity, cognitive load, and bottlenecks from one durable area.";
	const getMetric = (metric: string) =>
		deltas.find((item) => item.metric === metric);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
				<PrimaryNav filters={filters} active="diagnose" role={activeRole} />
				<main className="flex min-w-0 flex-1 flex-col gap-8">
					<header className="flex flex-col gap-4">
						<BackLink href={withFilterParam("/", filters, activeRole)} />
						<div>
							<p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
								{activeView === "work" ? "Diagnose" : "Overview"}
							</p>
							<h1 className="mt-2 font-(--font-display) text-3xl">
								{pageTitle}
							</h1>
							<p className="mt-2 text-sm text-(--ink-muted)">{pageSubtitle}</p>
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

							{activeTab === "overview" && (
								<section className="flex flex-col gap-6">
									<div className="grid gap-4 lg:grid-cols-3">
										<MetricCard
											label={getMetric("throughput")?.label ?? "Throughput"}
											href={buildExploreUrl({
												metric: "throughput",
												filters,
												role: activeRole,
											})}
											value={
												placeholderDeltas
													? undefined
													: getMetric("throughput")?.value
											}
											unit={getMetric("throughput")?.unit}
											delta={
												placeholderDeltas
													? undefined
													: getMetric("throughput")?.delta_pct
											}
											spark={getMetric("throughput")?.spark}
											caption="Delivery volume"
										/>
										<MetricCard
											label={
												getMetric("wip_saturation")?.label ?? "WIP Saturation"
											}
											href={buildExploreUrl({
												metric: "wip_saturation",
												filters,
												role: activeRole,
											})}
											value={
												placeholderDeltas
													? undefined
													: getMetric("wip_saturation")?.value
											}
											unit={getMetric("wip_saturation")?.unit}
											delta={
												placeholderDeltas
													? undefined
													: getMetric("wip_saturation")?.delta_pct
											}
											spark={getMetric("wip_saturation")?.spark}
											caption="Work in progress"
										/>
										<MetricCard
											label={getMetric("blocked_work")?.label ?? "Blocked Work"}
											href={buildExploreUrl({
												metric: "blocked_work",
												filters,
												role: activeRole,
											})}
											value={
												placeholderDeltas
													? undefined
													: getMetric("blocked_work")?.value
											}
											unit={getMetric("blocked_work")?.unit}
											delta={
												placeholderDeltas
													? undefined
													: getMetric("blocked_work")?.delta_pct
											}
											spark={getMetric("blocked_work")?.spark}
											caption="Blocked items"
										/>
									</div>

									<div className="grid gap-4 md:grid-cols-2">
										{workOverviewLinks.map((item) => (
											<Link
												key={item.id}
												href={withFilterParam(item.href, filters, activeRole)}
												className="rounded-3xl border border-(--card-stroke) bg-card p-5 transition hover:border-(--accent)/40 hover:bg-(--card-80)"
											>
												<p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
													Workbench view
												</p>
												<h2 className="mt-2 font-(--font-display) text-xl">
													{item.title}
												</h2>
												<p className="mt-2 text-sm text-(--ink-muted)">
													{item.description}
												</p>
											</Link>
										))}
									</div>
								</section>
							)}

							{activeTab === "heatmap" && (
								<HeatmapView
									filters={filters}
									scopeId={scopeId}
									reviewHeatmap={reviewHeatmap}
								/>
							)}

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
