import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../urqlClient", () => ({
    graphqlFetch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));

import { graphqlFetch } from "../urqlClient";
import { getHomeDataViaGraphQL, toHomeResponse } from "../homeFetchers";
import type { HomeGraphQLResult } from "../types";
import type { MetricFilter } from "@/lib/filters/types";

const mockedFetch = vi.mocked(graphqlFetch);

const baseFilters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: [] },
    why: { work_category: [] },
    how: {},
};

/**
 * Full HomeGraphQLResult fixture. `freshness.sources` and `tiles` are the
 * two fields that changed CONTAINER shape server-side (map -> ordered
 * list) — deliberately given 2+ entries and an order that would NOT
 * round-trip correctly under a naive index-based conversion, so the test
 * actually exercises the key-preserving reconstruction.
 */
const graphqlFixture: HomeGraphQLResult = {
    freshness: {
        lastIngestedAt: "2026-09-28T00:00:00Z",
        latestSuccessfulSyncAt: "2026-09-28T01:00:00Z",
        sources: [
            { provider: "github", status: "ok" },
            { provider: "jira", status: "degraded" },
        ],
        coverage: {
            reposCoveredPct: 0.9,
            prsLinkedToIssuesPct: 0.8,
            issuesWithCycleStatesPct: 0.7,
        },
    },
    deltas: [
        {
            metric: "throughput",
            label: "Throughput",
            value: 42,
            unit: "prs/week",
            deltaPct: 0.1,
            spark: [{ ts: "2026-09-27", value: 40 }],
        },
    ],
    reworkThemeAllocation: [
        {
            theme: "feature_delivery",
            label: "Feature Delivery",
            allocation: 0.5,
            allocationPct: 50,
            prsMerged: 10,
            churnLoc: 100,
        },
    ],
    summary: [{ id: "s1", text: "Summary sentence", evidenceLink: "/evidence/s1" }],
    tiles: [
        { key: "dora", value: { title: "DORA", subtitle: "Release speed", link: "/metrics" } },
        {
            key: "flow",
            value: { title: "Flow", subtitle: "Idea to merge", link: "/metrics?tab=flow" },
        },
    ],
    constraint: {
        title: "Constraint",
        claim: "Review latency is the bottleneck",
        evidence: [{ label: "PRs waiting", link: "/evidence" }],
        experiments: ["Add a reviewer rotation"],
    },
    events: [{ ts: "2026-09-27T00:00:00Z", type: "deploy", text: "Deploy v1", link: "/events/1" }],
    healthState: {
        status: "watch",
        headline: "Review latency rising",
        summary: "Watch review latency this week.",
        asOf: "2026-09-28T00:00:00Z",
    },
    signals: [
        {
            id: "sig-1",
            title: "Review latency",
            metric: "review_latency_hours",
            currentValue: "18h",
            priorValue: "12h",
            delta: "+6h",
            direction: "up",
            severity: "high",
            confidence: "high",
            affectedScope: "org",
            evidenceCount: 5,
            whyItMatters: "Slower reviews slow delivery.",
            recommendedAction: "Add reviewer capacity.",
            evidenceRef: "ref-1",
            category: "delivery",
            scopeEntity: { id: "team-1", displayName: "Platform" },
        },
    ],
    limitingFactor: {
        claim: "Review capacity is the constraint",
        whyItMatters: "It caps throughput.",
        recommendedAction: "Add reviewers.",
        confidence: "high",
        evidenceRef: "ref-2",
    },
    dataConfidence: {
        level: "high",
        coveragePct: 0.85,
        connectedSources: ["github", "jira"],
        missingSources: [],
        caveats: [],
    },
};

describe("toHomeResponse (CHAOS-7064 normalize-then-compare equality proof)", () => {
    it("reconstructs freshness.sources as an order-preserving dict from the GraphQL list", () => {
        const result = toHomeResponse(graphqlFixture);

        expect(result.freshness.sources).toEqual({ github: "ok", jira: "degraded" });
        // Order-independence: rebuilding from a reversed list still produces
        // the same dict content (a dict has no meaningful key order for
        // equality — this is the "normalize" half of the proof).
        const reversed = toHomeResponse({
            ...graphqlFixture,
            freshness: {
                ...graphqlFixture.freshness,
                sources: [...graphqlFixture.freshness.sources].reverse(),
            },
        });
        expect(reversed.freshness.sources).toEqual(result.freshness.sources);
    });

    it("reconstructs tiles as a key-preserving dict from the GraphQL ordered list", () => {
        const result = toHomeResponse(graphqlFixture);

        expect(result.tiles).toEqual({
            dora: { title: "DORA", subtitle: "Release speed", link: "/metrics" },
            flow: { title: "Flow", subtitle: "Idea to merge", link: "/metrics?tab=flow" },
        });
    });

    it("maps every other field 1:1 by name (camelCase -> snake_case), no data loss", () => {
        const result = toHomeResponse(graphqlFixture);

        expect(result.freshness.last_ingested_at).toBe("2026-09-28T00:00:00Z");
        expect(result.freshness.latest_successful_sync_at).toBe("2026-09-28T01:00:00Z");
        expect(result.freshness.coverage).toEqual({
            repos_covered_pct: 0.9,
            prs_linked_to_issues_pct: 0.8,
            issues_with_cycle_states_pct: 0.7,
        });
        expect(result.deltas).toEqual([
            {
                metric: "throughput",
                label: "Throughput",
                value: 42,
                unit: "prs/week",
                delta_pct: 0.1,
                spark: [{ ts: "2026-09-27", value: 40 }],
            },
        ]);
        expect(result.rework_theme_allocation).toEqual([
            {
                theme: "feature_delivery",
                label: "Feature Delivery",
                allocation: 0.5,
                allocation_pct: 50,
                prs_merged: 10,
                churn_loc: 100,
            },
        ]);
        expect(result.summary).toEqual([
            { id: "s1", text: "Summary sentence", evidence_link: "/evidence/s1" },
        ]);
        expect(result.constraint).toEqual({
            title: "Constraint",
            claim: "Review latency is the bottleneck",
            evidence: [{ label: "PRs waiting", link: "/evidence" }],
            experiments: ["Add a reviewer rotation"],
        });
        expect(result.events).toEqual([
            { ts: "2026-09-27T00:00:00Z", type: "deploy", text: "Deploy v1", link: "/events/1" },
        ]);
        expect(result.health_state).toEqual({
            status: "watch",
            headline: "Review latency rising",
            summary: "Watch review latency this week.",
        });
        expect(result.signals).toEqual([
            {
                id: "sig-1",
                title: "Review latency",
                metric: "review_latency_hours",
                current_value: "18h",
                prior_value: "12h",
                delta: "+6h",
                direction: "up",
                severity: "high",
                confidence: "high",
                affected_scope: "org",
                scope_entity: { id: "team-1", display_name: "Platform" },
                evidence_count: 5,
                why_it_matters: "Slower reviews slow delivery.",
                recommended_action: "Add reviewer capacity.",
                evidence_ref: "ref-1",
                category: "delivery",
            },
        ]);
        expect(result.limiting_factor).toEqual({
            claim: "Review capacity is the constraint",
            why_it_matters: "It caps throughput.",
            recommended_action: "Add reviewers.",
            confidence: "high",
            evidence_ref: "ref-2",
        });
        expect(result.data_confidence).toEqual({
            level: "high",
            coverage_pct: 0.85,
            connected_sources: ["github", "jira"],
            missing_sources: [],
            caveats: [],
        });
    });

    it("handles a null scopeEntity (org-wide signal) without inventing one", () => {
        const result = toHomeResponse({
            ...graphqlFixture,
            signals: [{ ...graphqlFixture.signals[0], scopeEntity: null }],
        });

        expect(result.signals?.[0].scope_entity).toBeNull();
    });

    it("keeps a coverage that is not served as null: never three zeros", () => {
        // The contract's `freshness.coverage` is nullable. Missing is not 0%.
        const result = toHomeResponse({
            ...graphqlFixture,
            freshness: { ...graphqlFixture.freshness, coverage: null },
        });

        expect(result.freshness.coverage).toBeNull();
    });

    it("handles empty freshness.sources and tiles as empty dicts, not undefined", () => {
        const result = toHomeResponse({
            ...graphqlFixture,
            freshness: { ...graphqlFixture.freshness, sources: [] },
            tiles: [],
        });

        expect(result.freshness.sources).toEqual({});
        expect(result.tiles).toEqual({});
    });
});

describe("getHomeDataViaGraphQL", () => {
    beforeEach(() => {
        mockedFetch.mockReset();
    });

    it("resolves org from the filter scope and forwards translated filters", async () => {
        mockedFetch.mockResolvedValueOnce({ home: graphqlFixture });

        const result = await getHomeDataViaGraphQL(baseFilters);

        expect(mockedFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockedFetch.mock.calls[0];
        expect(callArgs[1]).toMatchObject({
            orgId: "org-1",
            filters: expect.objectContaining({ scope: { level: "ORG", ids: ["org-1"] } }),
        });
        expect(callArgs[2]).toEqual({ orgId: "org-1" });
        expect(result).toEqual(toHomeResponse(graphqlFixture));
    });

    it("forwards the selected time window and never drops it", async () => {
        mockedFetch.mockResolvedValueOnce({ home: graphqlFixture });

        await getHomeDataViaGraphQL({
            ...baseFilters,
            time: {
                range_days: 90,
                compare_days: 30,
                start_date: "2026-06-01",
                end_date: "2026-08-30",
            },
        });

        expect(mockedFetch.mock.calls[0][1]).toMatchObject({
            window: {
                rangeDays: 90,
                compareDays: 30,
                startDate: "2026-06-01",
                endDate: "2026-08-30",
            },
        });
    });

    it("falls back team scope with no ids to org, as the REST call did", async () => {
        mockedFetch.mockResolvedValueOnce({ home: graphqlFixture });

        await getHomeDataViaGraphQL({
            ...baseFilters,
            scope: { level: "team", ids: [] },
        });

        expect(mockedFetch.mock.calls[0][1]).toMatchObject({
            filters: { scope: { level: "ORG", ids: [] } },
        });
    });
});
