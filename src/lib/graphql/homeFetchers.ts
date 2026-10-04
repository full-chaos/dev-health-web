/**
 * GraphQL fetcher for the web home/cockpit payload (CHAOS-7064, CHAOS-6084 /
 * CHAOS-7070).
 *
 * `toHomeResponse` converts the GraphQL `home` field response back into the
 * exact REST-shaped `HomeResponse` (src/lib/types.ts) so every existing
 * caller of `getHomeData` keeps reading the same snake_case field names —
 * this is a drop-in data-layer swap, not a per-caller reshape. Two fields
 * changed CONTAINER shape server-side, not just casing: `freshness.sources`
 * and `tiles` moved from a map to an ordered list (so field order is
 * explicit rather than relying on object key order); this transform folds
 * them back into records here, in one place, rather than pushing a
 * list/dict distinction onto every render site.
 */

import { cache } from "react";
import type { MetricFilter } from "@/lib/filters/types";
import { normalizeFilters } from "@/lib/api/_shared";
import type {
    HomeResponse,
    CockpitHealthStatus,
    SignalSeverity,
    SignalDirection,
    ConfidenceLevel,
    SignalCategory,
} from "@/lib/types";
import { HOME_QUERY } from "./queries";
import { translateMetricFilterToGraphQL, getOrgId } from "./investmentFetchers";
import { graphqlFetch } from "./urqlClient";
import type { HomeGraphQLResult, HomeQueryResponse } from "./types";
import type { FilterInput, HomeWindowInput } from "./__generated__/types";

/**
 * Build the `home` filters and window variables from a MetricFilter. Mirrors
 * what the REST call sent: filters pass through `normalizeFilters` (team scope
 * with no ids falls back to org) and the time window (`range_days`/
 * `compare_days`/`start_date`/`end_date`) travels as the separate `window`
 * argument. Without it the resolver silently falls back to its default
 * 14/14-day window.
 */
export function toHomeVariables(filters: MetricFilter): {
    filters: FilterInput;
    window: HomeWindowInput;
} {
    const normalized = normalizeFilters(filters);
    const { range_days, compare_days, start_date, end_date } = normalized.time;
    return {
        filters: translateMetricFilterToGraphQL(normalized),
        window: {
            rangeDays: range_days,
            compareDays: compare_days,
            startDate: start_date,
            endDate: end_date,
        },
    };
}

/**
 * Convert a GraphQL `home` field response into the REST-shaped HomeResponse.
 * Exported for the normalize-then-compare equality test — the transform is
 * the thing that must be proven correct, not just wired.
 */
export function toHomeResponse(result: HomeGraphQLResult): HomeResponse {
    return {
        freshness: {
            last_ingested_at: result.freshness.lastIngestedAt,
            latest_successful_sync_at: result.freshness.latestSuccessfulSyncAt,
            sources: Object.fromEntries(
                result.freshness.sources.map((s) => [
                    s.provider,
                    s.status as "ok" | "degraded" | "down",
                ]),
            ),
            // A coverage that is not served stays null: it is "Not reported", never 0%.
            coverage: result.freshness.coverage
                ? {
                      repos_covered_pct: result.freshness.coverage.reposCoveredPct,
                      prs_linked_to_issues_pct: result.freshness.coverage.prsLinkedToIssuesPct,
                      issues_with_cycle_states_pct:
                          result.freshness.coverage.issuesWithCycleStatesPct,
                  }
                : null,
        },
        deltas: result.deltas.map((d) => ({
            metric: d.metric,
            label: d.label,
            value: d.value,
            unit: d.unit,
            delta_pct: d.deltaPct,
            has_data: d.hasData,
            has_prior_data: d.hasPriorData,
            spark: d.spark.map((p) => ({ ts: p.ts, value: p.value })),
        })),
        rework_theme_allocation: result.reworkThemeAllocation.map((r) => ({
            theme: r.theme,
            label: r.label,
            allocation: r.allocation,
            allocation_pct: r.allocationPct,
            prs_merged: r.prsMerged,
            churn_loc: r.churnLoc,
        })),
        summary: result.summary.map((s) => ({
            id: s.id,
            text: s.text,
            evidence_link: s.evidenceLink,
        })),
        tiles: Object.fromEntries(
            result.tiles.map((t) => [
                t.key,
                { title: t.value.title, subtitle: t.value.subtitle, link: t.value.link },
            ]),
        ),
        constraint: result.constraint
            ? {
                  title: result.constraint.title,
                  claim: result.constraint.claim,
                  evidence: result.constraint.evidence.map((e) => ({
                      label: e.label,
                      link: e.link,
                  })),
                  experiments: result.constraint.experiments,
              }
            : null,
        events: result.events.map((e) => ({
            ts: e.ts,
            type: e.type,
            text: e.text,
            link: e.link,
        })),
        health_state: {
            status: result.healthState.status as CockpitHealthStatus,
            headline: result.healthState.headline,
            summary: result.healthState.summary,
        },
        signals: result.signals.map((s) => ({
            id: s.id,
            title: s.title,
            metric: s.metric,
            current_value: s.currentValue,
            prior_value: s.priorValue,
            delta: s.delta,
            direction: s.direction as SignalDirection,
            severity: s.severity as SignalSeverity,
            confidence: s.confidence as ConfidenceLevel,
            affected_scope: s.affectedScope,
            scope_entity: s.scopeEntity
                ? { id: s.scopeEntity.id, display_name: s.scopeEntity.displayName }
                : null,
            evidence_count: s.evidenceCount,
            why_it_matters: s.whyItMatters,
            recommended_action: s.recommendedAction,
            evidence_ref: s.evidenceRef,
            category: s.category as SignalCategory,
        })),
        limiting_factor: {
            claim: result.limitingFactor.claim,
            why_it_matters: result.limitingFactor.whyItMatters,
            recommended_action: result.limitingFactor.recommendedAction,
            confidence: result.limitingFactor.confidence as ConfidenceLevel,
            evidence_ref: result.limitingFactor.evidenceRef,
        },
        data_confidence: {
            level: result.dataConfidence.level as ConfidenceLevel,
            coverage_pct: result.dataConfidence.coveragePct,
            connected_sources: result.dataConfidence.connectedSources,
            missing_sources: result.dataConfidence.missingSources,
            caveats: result.dataConfidence.caveats,
        },
    };
}

/**
 * Per-request memoized GraphQL home data fetch — drop-in replacement for
 * `getHomeData` (src/lib/api/home.ts). Same signature, same React.cache()
 * dedup properties, same HomeResponse return shape. Resolves org from the
 * filter scope when available, falling back to the session (mirrors
 * `getInvestmentViaGraphQL`).
 */
export const getHomeDataViaGraphQL = cache(async function getHomeDataViaGraphQL(
    filters: MetricFilter,
): Promise<HomeResponse> {
    let contextOrgId: string | undefined;
    try {
        const { auth } = await import("@/lib/auth");
        const session = await auth();
        contextOrgId = session?.user?.org_id as string | undefined;
    } catch {
        // Unauthenticated fetch (codegen / tests): getOrgId below throws if
        // the filter scope also can't supply one.
    }

    const orgId = getOrgId(filters, contextOrgId);
    const variables = toHomeVariables(filters);

    const response = await graphqlFetch<HomeQueryResponse>(
        HOME_QUERY,
        { orgId, ...variables },
        { orgId },
    );

    return toHomeResponse(response.home);
});
