import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { getQuadrant } from "@/lib/api/visuals";
import { checkApiHealth } from "@/lib/api/system";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { navTrailForPathname } from "@/lib/navigation/areas";
import { getRoleConfig } from "@/lib/roleContext";

const QUADRANT_CARDS = [
	{
		type: "cycle_throughput" as const,
		title: "Cycle Time × Throughput",
		description: "Operating modes under time in flight and delivery pace.",
	},
	{
		type: "churn_throughput" as const,
		title: "Churn × Throughput",
		description: "Operating modes under change volume and delivery pace.",
	},
];

type LandscapePageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const scopeTypeMap: Record<string, "org" | "team" | "repo" | "person"> = {
	org: "org",
	team: "team",
	repo: "repo",
	developer: "person",
	person: "person",
};

export default async function LandscapePage({
	searchParams,
}: LandscapePageProps) {
	const params = (await searchParams) ?? {};
	const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);

	const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
	const activeRole = typeof roleParam === "string" ? roleParam : undefined;
	const roleConfig = getRoleConfig(roleParam);
	const primaryType = roleConfig.primaryQuadrant;

	const bucketParam = Array.isArray(params.bucket)
		? params.bucket[0]
		: params.bucket;
	const bucket = bucketParam === "month" ? "month" : "week";

	const scopeType = scopeTypeMap[filters.scope.level] ?? "org";
	const scopeId = filters.scope.ids[0] ?? "";
	const canQuery = scopeType !== "person" || Boolean(scopeId);

	const quadrantPromises = canQuery
		? QUADRANT_CARDS.map((card) =>
				fetchOrNull(
					getQuadrant({
						type: card.type,
						scope_type: scopeType,
						scope_id: scopeId,
						range_days: filters.time.range_days,
						start_date: filters.time.start_date,
						end_date: filters.time.end_date,
						bucket,
					}),
					`landscape/quadrant-${card.type}`,
				),
			)
		: QUADRANT_CARDS.map(() => Promise.resolve(null));

	const [health, ...quadrantData] = await Promise.all([
		checkApiHealth(),
		...quadrantPromises,
	]);

	if (!health.ok) {
		return <ServiceUnavailable />;
	}

	const primaryCardIndex = QUADRANT_CARDS.findIndex(
		(card) => card.type === primaryType,
	);
	const primaryCard =
		primaryCardIndex >= 0
			? QUADRANT_CARDS[primaryCardIndex]
			: QUADRANT_CARDS[0];
	const primaryData =
		quadrantData[primaryCardIndex >= 0 ? primaryCardIndex : 0];
	const otherCards = QUADRANT_CARDS.filter(
		(card) => card.type !== primaryCard.type,
	);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
				<PrimaryNav filters={filters} active="landscape" role={activeRole} />
				<main className="flex min-w-0 flex-1 flex-col gap-8">
					<header className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<Breadcrumbs items={navTrailForPathname("/landscape")} />
							<p className="mt-4 text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
								Diagnose
							</p>
							<h1 className="mt-2 font-(--font-display) text-3xl">Landscape</h1>
							<p className="mt-2 text-sm text-(--ink-muted)">
								Operating modes across paired pressures.
							</p>
							<p className="mt-3 text-sm text-(--ink-muted)">
								Select a dot to investigate.
							</p>
						</div>
						<BackLink
							href={withFilterParam("/work", filters, activeRole)}
							area="Diagnose"
						/>
					</header>

					<GlobalContextBar filters={filters} />
					<FilterBar condensed view="landscape" />

					{!canQuery && (
						<section className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
							Individual landscapes are available from the individual view.
						</section>
					)}

					<section className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
						<span>Bucket</span>
						<Link
							href={withFilterParam(
								"/landscape?bucket=week",
								filters,
								activeRole,
							)}
							className={`rounded-full border px-3 py-1 ${
								bucket === "week"
									? "border-(--accent) bg-(--accent)/15 text-foreground"
									: "border-(--card-stroke)"
							}`}
						>
							{CTA_LABELS.week}
						</Link>
						<Link
							href={withFilterParam(
								"/landscape?bucket=month",
								filters,
								activeRole,
							)}
							className={`rounded-full border px-3 py-1 ${
								bucket === "month"
									? "border-(--accent) bg-(--accent)/15 text-foreground"
									: "border-(--card-stroke)"
							}`}
						>
							{CTA_LABELS.month}
						</Link>
					</section>

					<section className="flex flex-col gap-10">
						<div className="rounded-3xl border border-(--accent-2)/30 bg-(--accent-2)/5 p-6 sm:p-8">
							<div className="mb-6 flex items-center justify-between">
								<span className="rounded-full bg-(--accent-2)/20 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.25em] text-(--accent-2)">
									Lens: {roleConfig.label}
								</span>
							</div>
							<QuadrantPanel
								key={primaryCard.type}
								title={primaryCard.title}
								description={primaryCard.description}
								data={primaryData}
								filters={filters}
								chartHeight={420}
								emptyState="Quadrant data unavailable for this scope."
							/>
						</div>

						<div className="flex flex-col gap-8">
							{otherCards.map((card) => {
								const cardIndex = QUADRANT_CARDS.findIndex(
									(item) => item.type === card.type,
								);
								return (
									<div key={card.type}>
										<QuadrantPanel
											title={card.title}
											description={card.description}
											data={quadrantData[cardIndex]}
											filters={filters}
											chartHeight={320}
											emptyState="Quadrant data unavailable for this scope."
										/>
									</div>
								);
							})}
						</div>
					</section>
				</main>
			</div>
		</div>
	);
}
