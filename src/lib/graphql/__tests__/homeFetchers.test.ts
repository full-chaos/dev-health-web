import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";

vi.mock("../urqlClient", () => ({
    graphqlFetch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));

import { graphqlFetch } from "../urqlClient";
import { getHomeDataViaGraphQL, toHomeResponse } from "../homeFetchers";
import { HOME_QUERY } from "../queries";
import type { HomeGraphQLResult } from "../types";
import type { MetricFilter } from "@/lib/filters/types";
import { handlers } from "../../../../tests/mocks/handlers";

const mockedFetch = vi.mocked(graphqlFetch);
const mockServer = setupServer(...handlers);

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

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
            hasData: true,
            hasPriorData: true,
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
            attribution: {
                items: 4,
                sources: [
                    { source: "NATIVE_TEAM", items: 2, share: 0.5 },
                    { source: "UNASSIGNED", items: 2, share: 0.5 },
                ],
                confidence: [
                    { confidence: "HIGH", items: 2, share: 0.5 },
                    { confidence: "NONE", items: 2, share: 0.5 },
                ],
            },
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
    scopeDataConfidence: {
        level: "medium",
        coveragePct: 50,
        lastIngestedAt: "2026-09-28T01:00:00Z",
        caveats: ["Repository metrics are partial for this window."],
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
                has_data: true,
                has_prior_data: true,
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
                attribution: {
                    items: 4,
                    sources: [
                        { source: "NATIVE_TEAM", items: 2, share: 0.5 },
                        { source: "UNASSIGNED", items: 2, share: 0.5 },
                    ],
                    confidence: [
                        { confidence: "HIGH", items: 2, share: 0.5 },
                        { confidence: "NONE", items: 2, share: 0.5 },
                    ],
                },
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
        expect(result.scope_data_confidence).toEqual({
            level: "medium",
            coverage_pct: 50,
            last_ingested_at: "2026-09-28T01:00:00Z",
            caveats: ["Repository metrics are partial for this window."],
        });
    });

    it("handles a null scopeEntity (org-wide signal) without inventing one", () => {
        const result = toHomeResponse({
            ...graphqlFixture,
            signals: [{ ...graphqlFixture.signals[0], scopeEntity: null }],
        });

        expect(result.signals?.[0].scope_entity).toBeNull();
    });

    it("keeps absent signal attribution distinct from served UNASSIGNED and NONE buckets", () => {
        const result = toHomeResponse({
            ...graphqlFixture,
            signals: [{ ...graphqlFixture.signals[0], attribution: null }],
        });

        expect(result.signals?.[0].attribution).toBeNull();
    });

    it("keeps a coverage that is not served as null: never three zeros", () => {
        // The contract's `freshness.coverage` is nullable. Missing is not 0%.
        const result = toHomeResponse({
            ...graphqlFixture,
            freshness: { ...graphqlFixture.freshness, coverage: null },
        });

        expect(result.freshness.coverage).toBeNull();
    });

    it("keeps each absent coverage denominator distinct from an observed zero", () => {
        const result = toHomeResponse({
            ...graphqlFixture,
            freshness: {
                ...graphqlFixture.freshness,
                coverage: {
                    reposCoveredPct: null,
                    prsLinkedToIssuesPct: 0,
                    issuesWithCycleStatesPct: null,
                },
            },
        });

        expect(result.freshness.coverage).toEqual({
            repos_covered_pct: null,
            prs_linked_to_issues_pct: 0,
            issues_with_cycle_states_pct: null,
        });
    });

    it("keeps an empty selected scope distinct from a measured zero", () => {
        const emptyScope = toHomeResponse({
            ...graphqlFixture,
            scopeDataConfidence: {
                ...graphqlFixture.scopeDataConfidence,
                coveragePct: null,
                lastIngestedAt: null,
                caveats: ["The selected scope has no repositories."],
            },
        });
        const measuredZero = toHomeResponse({
            ...graphqlFixture,
            scopeDataConfidence: {
                ...graphqlFixture.scopeDataConfidence,
                coveragePct: 0,
                lastIngestedAt: null,
                caveats: ["No repository metrics exist for this scope."],
            },
        });

        expect(emptyScope.scope_data_confidence).toMatchObject({ coverage_pct: null });
        expect(measuredZero.scope_data_confidence).toMatchObject({ coverage_pct: 0 });
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

    it("maps explicit no-data facts without treating a served zero as data", () => {
        const result = toHomeResponse({
            ...graphqlFixture,
            deltas: [
                {
                    ...graphqlFixture.deltas[0],
                    value: 0,
                    deltaPct: -100,
                    hasData: false,
                    hasPriorData: false,
                },
            ],
            summary: [],
            events: [],
            constraint: null,
            healthState: {
                ...graphqlFixture.healthState,
                status: "no_data",
                headline: "",
                summary: "",
            },
            signals: [],
        });

        expect(result.deltas[0]).toMatchObject({
            value: 0,
            delta_pct: -100,
            has_data: false,
            has_prior_data: false,
        });
        expect(result.constraint).toBeNull();
        expect(result.health_state).toEqual({ status: "no_data", headline: "", summary: "" });
    });
});

describe("shared Home GraphQL fixture", () => {
    it("maps the producer-required scope confidence object through the mock transport", async () => {
        const response = await fetch("http://mock.dev-health.test/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: HOME_QUERY, variables: { orgId: "org-1" } }),
        });

        expect(response.ok).toBe(true);
        const payload = (await response.json()) as { data: { home: HomeGraphQLResult } };
        const mapped = toHomeResponse(payload.data.home);

        expect(payload.data.home.scopeDataConfidence).toEqual({
            level: "medium",
            coveragePct: 50,
            lastIngestedAt: expect.any(String),
            caveats: ["Repository coverage appears partial for the selected scope and window."],
        });
        expect(mapped.scope_data_confidence).toEqual({
            level: "medium",
            coverage_pct: 50,
            last_ingested_at: payload.data.home.scopeDataConfidence.lastIngestedAt,
            caveats: ["Repository coverage appears partial for the selected scope and window."],
        });
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

describe("toHomeResponse rateState (CHAOS-9043)", () => {
    const withDelta = (extra: object) => ({
        ...graphqlFixture,
        deltas: [{ ...graphqlFixture.deltas[0], ...extra }],
    });

    it("carries a served rateState to rate_state", () => {
        const out = toHomeResponse(withDelta({ rateState: "unknown_no_incident_evidence" }));
        expect(out.deltas[0].rate_state).toBe("unknown_no_incident_evidence");
    });

    it("leaves rate_state out when none is served (null or absent), as before", () => {
        expect("rate_state" in toHomeResponse(withDelta({ rateState: null })).deltas[0]).toBe(
            false,
        );
        expect("rate_state" in toHomeResponse(graphqlFixture).deltas[0]).toBe(false);
    });
});

describe("toHomeResponse coverage and repoFilterApplied (CHAOS-9078)", () => {
    const withDelta = (extra: object) => ({
        ...graphqlFixture,
        deltas: [{ ...graphqlFixture.deltas[0], ...extra }],
    });
    const withSignal = (extra: object) => ({
        ...graphqlFixture,
        signals: [{ ...graphqlFixture.signals[0], ...extra }],
    });

    it("carries the served flag on a delta, null and false included", () => {
        expect(toHomeResponse(withDelta({ repoFilterApplied: false })).deltas[0]).toMatchObject({
            repo_filter_applied: false,
        });
        expect(toHomeResponse(withDelta({ repoFilterApplied: null })).deltas[0]).toMatchObject({
            repo_filter_applied: null,
        });
    });

    it("leaves the flag out when it is not served (older backend)", () => {
        expect("repo_filter_applied" in toHomeResponse(graphqlFixture).deltas[0]).toBe(false);
        expect("repo_filter_applied" in toHomeResponse(graphqlFixture).signals![0]).toBe(false);
    });

    it("carries a served signal coverage and flag", () => {
        const out = toHomeResponse(withSignal({ coverage: 0.6, repoFilterApplied: null }));
        expect(out.signals![0]).toMatchObject({ coverage: 0.6, repo_filter_applied: null });
        expect(toHomeResponse(withSignal({ coverage: null })).signals![0].coverage).toBeNull();
    });
});

describe("toHomeResponse rateCoverage (CHAOS-9141)", () => {
    const withDelta = (extra: object) => ({
        ...graphqlFixture,
        deltas: [{ ...graphqlFixture.deltas[0], ...extra }],
    });

    it("keeps a null as null", () => {
        expect(
            toHomeResponse(withDelta({ rateCoverage: null })).deltas[0].rate_coverage,
        ).toBeNull();
    });

    it("keeps 0 as 0 (a value, not a missing one)", () => {
        expect(toHomeResponse(withDelta({ rateCoverage: 0 })).deltas[0].rate_coverage).toBe(0);
    });

    it("keeps 0.6 as 0.6 (a fraction, never a percent)", () => {
        expect(toHomeResponse(withDelta({ rateCoverage: 0.6 })).deltas[0].rate_coverage).toBe(0.6);
    });

    it("leaves the key out when the answer has none (absent)", () => {
        expect("rate_coverage" in toHomeResponse(graphqlFixture).deltas[0]).toBe(false);
    });
});

describe("toHomeResponse repository link fields", () => {
    const withDelta = (extra: object) => ({
        ...graphqlFixture,
        deltas: [{ ...graphqlFixture.deltas[0], ...extra }],
    });

    it("maps the four fields to the snake_case shape", () => {
        const d = toHomeResponse(
            withDelta({
                repoLinkState: "linked",
                repoLinkBasis: { native: 3, explicitText: 2, heuristic: 1 },
                repoLinkMultiRepoItems: 4,
                repoLinkCoverage: { linkedItems: 6, itemsInWindow: 10 },
            }),
        ).deltas[0];
        expect(d.repo_link_state).toBe("linked");
        expect(d.repo_link_basis).toEqual({ native: 3, explicit_text: 2, heuristic: 1 });
        expect(d.repo_link_multi_repo_items).toBe(4);
        expect(d.repo_link_coverage).toEqual({ linked_items: 6, items_in_window: 10 });
    });

    it("keeps null as null and 0 as 0", () => {
        const d = toHomeResponse(
            withDelta({
                repoLinkState: null,
                repoLinkBasis: null,
                repoLinkMultiRepoItems: 0,
                repoLinkCoverage: { linkedItems: 0, itemsInWindow: 0 },
            }),
        ).deltas[0];
        expect(d.repo_link_state).toBeNull();
        expect(d.repo_link_basis).toBeNull();
        expect(d.repo_link_multi_repo_items).toBe(0);
        expect(d.repo_link_coverage).toEqual({ linked_items: 0, items_in_window: 0 });
    });

    it("leaves the keys out when the answer has none (absent)", () => {
        const d = toHomeResponse(graphqlFixture).deltas[0];
        for (const k of [
            "repo_link_state",
            "repo_link_basis",
            "repo_link_multi_repo_items",
            "repo_link_coverage",
        ]) {
            expect(k in d).toBe(false);
        }
    });
});

describe("toHomeResponse filter empty reason", () => {
    it.each(["repository_not_in_team", "repository_not_found", "some_future_value"])(
        "passes %s through unchanged",
        (reason) => {
            expect(
                toHomeResponse({ ...graphqlFixture, filterEmptyReason: reason })
                    .filter_empty_reason,
            ).toBe(reason);
        },
    );

    it("keeps null as null", () => {
        expect(
            toHomeResponse({ ...graphqlFixture, filterEmptyReason: null }).filter_empty_reason,
        ).toBeNull();
    });

    it("leaves the key out when the answer has none (absent)", () => {
        expect("filter_empty_reason" in toHomeResponse(graphqlFixture)).toBe(false);
    });
});
