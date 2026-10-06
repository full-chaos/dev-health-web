import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { checkApiHealth } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import type { HomeResponse } from "@/lib/types";
import Home from "./page";

vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(async () => ({ user: { org_id: "org-1" } })),
}));

vi.mock("@/components/ClientTimestamp", () => ({
    ClientTimestamp: ({ value, prefix }: { value?: string | null; prefix?: string }) => (
        <span>
            {prefix}
            {value}
        </span>
    ),
}));
vi.mock("@/components/ServiceUnavailable", () => ({ ServiceUnavailable: () => null }));
vi.mock("@/components/home/HomeMonitoring", () => ({ HomeMonitoring: () => null }));
vi.mock("@/components/home/InvestigationThreads", () => ({ InvestigationThreads: () => null }));
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: ({ confidence }: { confidence: { level: string } }) => (
        <span data-testid="org-data-confidence">{confidence.level}</span>
    ),
}));
vi.mock("@/components/home/ScopeDataConfidenceIndicator", () => ({
    ScopeDataConfidenceIndicator: ({
        confidence,
    }: {
        confidence: { level: string; coverage_pct: number | null; last_ingested_at: string | null };
    }) => (
        <span data-testid="scope-data-confidence">
            {confidence.level}/{String(confidence.coverage_pct)}/
            {String(confidence.last_ingested_at)}
        </span>
    ),
}));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

const HOME_DATA: HomeResponse = {
    freshness: {
        last_ingested_at: "2026-07-12T00:07:00Z",
        latest_successful_sync_at: "2026-07-13T15:05:00Z",
        sources: {},
        coverage: {
            repos_covered_pct: 100,
            prs_linked_to_issues_pct: 100,
            issues_with_cycle_states_pct: 100,
        },
    },
    deltas: [],
    summary: [],
    tiles: {},
    constraint: { title: "", claim: "", evidence: [], experiments: [] },
    events: [],
};

/** The "Last sync" row of the "Evidence & context" card. */
const lastSyncRow = () => {
    const card = within(screen.getByTestId("evidence-context-card"));
    const row = card
        .getAllByTestId("evidence-fact")
        .find((candidate) => within(candidate).queryByText("Last sync") !== null);
    if (!row) throw new Error('no "Last sync" row');
    return row;
};

describe("dashboard freshness", () => {
    beforeEach(() => {
        vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
        vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed for this test" });
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(HOME_DATA);
    });

    it("renders the org-readable successful sync time, not the older metric computation time, as Last sync", async () => {
        render(await Home({ searchParams: Promise.resolve({}) }));

        expect(lastSyncRow()).toHaveTextContent("2026-07-13T15:05:00Z");
        expect(lastSyncRow()).not.toHaveTextContent("2026-07-12T00:07:00Z");
        // The header has no "Last updated" row: the card row is the one place for it.
        expect(screen.queryByText(/Last updated:/)).toBeNull();
    });

    // Changed with CHAOS-8063: the row is named "Last sync", so a metric computation (ingest) time
    // is not shown under that name. Before, the header row "Last updated" fell back to it.
    it.each([null, undefined])(
        "reads Not reported, not the metric computation time, when successful sync time is %s",
        async (latestSuccessfulSyncAt) => {
            vi.mocked(getHomeDataViaGraphQL).mockResolvedValue({
                ...HOME_DATA,
                freshness: {
                    ...HOME_DATA.freshness,
                    last_ingested_at: "2026-07-12T00:07:00Z",
                    latest_successful_sync_at: latestSuccessfulSyncAt,
                },
            });

            render(await Home({ searchParams: Promise.resolve({}) }));

            expect(lastSyncRow()).toHaveTextContent("Not reported");
            expect(lastSyncRow()).toHaveAttribute("data-reported", "false");
            expect(screen.queryByText(/2026-07-12T00:07:00Z/)).toBeNull();
        },
    );

    it("passes the served scope confidence separately from organization confidence", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue({
            ...HOME_DATA,
            data_confidence: {
                level: "high",
                coverage_pct: 92,
                connected_sources: ["github"],
                missing_sources: [],
                caveats: [],
            },
            scope_data_confidence: {
                level: "low",
                coverage_pct: 0,
                last_ingested_at: null,
                caveats: ["No repository metrics exist for this scope."],
            },
        });

        render(await Home({ searchParams: Promise.resolve({}) }));

        expect(screen.getByTestId("org-data-confidence")).toHaveTextContent("high");
        expect(screen.getByTestId("scope-data-confidence")).toHaveTextContent("low/0/null");
    });
});
