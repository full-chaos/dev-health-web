import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { getHomeData } from "@/lib/api/home";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import type { HomeResponse } from "@/lib/types";
import Home from "./page";

vi.mock("@/lib/api/home", () => ({ getHomeData: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn(), getApiMeta: vi.fn() }));
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
vi.mock("@/components/filters/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("@/components/home/AiWorkflowCallout", () => ({ AiWorkflowCallout: () => null }));
vi.mock("@/components/home/BackendBanner", () => ({ BackendBanner: () => null }));
vi.mock("@/components/home/CockpitClient", () => ({ CockpitClient: () => null }));
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/InvestmentPreview", () => ({ InvestmentPreview: () => null }));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/navigation/GlobalContextBar", () => ({ GlobalContextBar: () => null }));
vi.mock("@/components/navigation/PrimaryNav", () => ({ PrimaryNav: () => null }));
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

describe("dashboard freshness", () => {
    beforeEach(() => {
        vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
        vi.mocked(getApiMeta).mockResolvedValue({
            backend: "clickhouse",
            version: "test",
            last_ingest_at: null,
            coverage: {},
            limits: {},
            supported_endpoints: [],
        });
        vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed for this test" });
        vi.mocked(getHomeData).mockResolvedValue(HOME_DATA);
    });

    it("renders the org-readable successful sync time instead of older metric computation time", async () => {
        render(await Home({ searchParams: Promise.resolve({}) }));

        expect(screen.getByText("Last updated: 2026-07-13T15:05:00Z")).toBeInTheDocument();
    });

    it.each([null, undefined])(
        "falls back to metric computation time when successful sync time is %s",
        async (latestSuccessfulSyncAt) => {
            vi.mocked(getHomeData).mockResolvedValue({
                ...HOME_DATA,
                freshness: {
                    ...HOME_DATA.freshness,
                    last_ingested_at: "2026-07-12T00:07:00Z",
                    latest_successful_sync_at: latestSuccessfulSyncAt,
                },
            });

            render(await Home({ searchParams: Promise.resolve({}) }));

            expect(screen.getByText("Last updated: 2026-07-12T00:07:00Z")).toBeInTheDocument();
        },
    );
});
