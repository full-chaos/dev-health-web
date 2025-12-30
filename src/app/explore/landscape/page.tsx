import Link from "next/link";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getQuadrant } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { getRoleConfig } from "@/lib/roleContext";

const QUADRANT_CARDS = [
  {
    type: "churn_throughput" as const,
    title: "Churn × Throughput",
    description: "Differentiate refactor-heavy and delivery-heavy operating modes.",
    heatmapHref: "/code",
  },
  {
    type: "cycle_throughput" as const,
    title: "Cycle Time × Throughput",
    description: "Highlight delivery momentum under cycle time pressure.",
    heatmapHref: "/work",
  },
  {
    type: "wip_throughput" as const,
    title: "WIP × Throughput",
    description: "Read product direction and role clarity under load.",
    heatmapHref: "/work",
  },
  {
    type: "review_load_latency" as const,
    title: "Review Load × Review Latency",
    description: "Highlight collaboration health and ownership distribution under review pressure.",
    heatmapHref: "/work",
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

export default async function LandscapePage({ searchParams }: LandscapePageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const roleConfig = getRoleConfig(roleParam);
  const primaryType = roleConfig.primaryQuadrant;
  const secondaryType = roleConfig.secondaryQuadrant;

  const bucketParam = Array.isArray(params.bucket) ? params.bucket[0] : params.bucket;
  const bucket = bucketParam === "month" ? "month" : "week";

  const scopeType = scopeTypeMap[filters.scope.level] ?? "org";
  const scopeId = filters.scope.ids[0] ?? "";

  const canQuery = scopeType !== "person" || Boolean(scopeId);
  const quadrantData = canQuery
    ? await Promise.all(
      QUADRANT_CARDS.map((card) =>
        getQuadrant({
          type: card.type,
          scope_type: scopeType,
          scope_id: scopeId,
          range_days: filters.time.range_days,
          start_date: filters.time.start_date,
          end_date: filters.time.end_date,
          bucket,
        }).catch(() => null)
      )
    )
    : QUADRANT_CARDS.map(() => null);

  const primaryCardIndex = QUADRANT_CARDS.findIndex(
    (card) => card.type === primaryType
  );
  const primaryCard =
    primaryCardIndex >= 0 ? QUADRANT_CARDS[primaryCardIndex] : QUADRANT_CARDS[0];
  const primaryData =
    quadrantData[primaryCardIndex >= 0 ? primaryCardIndex : 0];

  // Order remaining cards: secondary first, then others
  const otherCards = QUADRANT_CARDS.filter(
    (card) => card.type !== primaryCard.type
  ).sort((a, b) => {
    if (a.type === secondaryType) return -1;
    if (b.type === secondaryType) return 1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="landscape" role={roleParam as string} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                Explore
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Landscape Quadrants
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Classify system modes under competing pressures without ranking teams or people.
              </p>
              <p className="mt-3 text-sm text-(--ink-muted)">
                Explore system operating modes across multiple pressure pairs.
              </p>
              <p className="mt-2 text-xs text-(--ink-muted)">
                Each view highlights a different pressure pair. Investigation steps are shared.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={withFilterParam("/explore", filters, roleParam as string)}
                className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
              >
                Back to Explore
              </Link>
            </div>
          </header>

          <FilterBar condensed view="explore" />

          {!canQuery && (
            <section className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
              Individual landscapes are available from the individual view.
            </section>
          )}

          <section className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
            <span>Bucket</span>
            <Link
              href={withFilterParam(`/explore/landscape?bucket=week`, filters, roleParam as string)}
              className={`rounded-full border px-3 py-1 ${bucket === "week"
                ? "border-(--accent) bg-(--accent)/15 text-foreground"
                : "border-(--card-stroke)"
                }`}
            >
              Week
            </Link>
            <Link
              href={withFilterParam(`/explore/landscape?bucket=month`, filters, roleParam as string)}
              className={`rounded-full border px-3 py-1 ${bucket === "month"
                ? "border-(--accent) bg-(--accent)/15 text-foreground"
                : "border-(--card-stroke)"
                }`}
            >
              Month
            </Link>
          </section>

          <section className="flex flex-col gap-10">
            <div className="rounded-[40px] border border-(--accent-2)/30 bg-(--accent-2)/5 p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <span className="rounded-full bg-(--accent-2)/20 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-(--accent-2)">
                  Primary Lens: {roleConfig.label}
                </span>
              </div>
              <QuadrantPanel
                key={primaryCard.type}
                title={primaryCard.title}
                description={primaryCard.description}
                data={primaryData}
                filters={filters}
                chartHeight={420}
                relatedLinks={[
                  {
                    label: "Open heatmaps",
                    href: withFilterParam(primaryCard.heatmapHref, filters, roleParam as string),
                  },
                ]}
                emptyState="Quadrant data unavailable for this scope."
              />
            </div>

            <div className="flex flex-col gap-8">
              {otherCards.map((card) => {
                const cardIndex = QUADRANT_CARDS.findIndex(
                  (item) => item.type === card.type
                );
                const isSecondary = card.type === secondaryType;
                return (
                  <div
                    key={card.type}
                    className={isSecondary ? "rounded-[32px] border border-(--card-stroke) bg-(--card-80) p-4" : ""}
                  >
                    {isSecondary && (
                      <div className="mb-4 px-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--ink-muted)">
                          Secondary Context
                        </span>
                      </div>
                    )}
                    <QuadrantPanel
                      title={card.title}
                      description={card.description}
                      data={quadrantData[cardIndex]}
                      filters={filters}
                      chartHeight={320}
                      relatedLinks={[
                        {
                          label: "Open heatmaps",
                          href: withFilterParam(card.heatmapHref, filters, roleParam as string),
                        },
                      ]}
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
