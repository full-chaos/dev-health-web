import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";

import Home from "./page";

// Pin tests for the Investment mix block and the AI Workflow block of Home (CHAOS-7739).

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn(), getApiMeta: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { org_id: "org-1" } })) }));
vi.mock("@/components/home/BackendBanner", () => ({ BackendBanner: () => null }));
vi.mock("@/components/home/CockpitClient", () => ({
    CockpitClient: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="cockpit-client-stub">{children}</div>
    ),
}));
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/InvestmentPreview", () => ({
    InvestmentPreview: () => <div data-testid="investment-preview-stub" />,
}));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

const aiHome = (dominant: boolean) =>
    ({
        freshness: {
            latest_successful_sync_at: null,
            last_ingested_at: null,
            sources: {},
            coverage: {},
        },
        deltas: [],
        summary: [],
        tiles: {},
        constraint: { title: "", claim: "", evidence: [], experiments: [] },
        events: [],
        signals: dominant
            ? [1, 2, 3].map((n) => ({
                  id: `s${n}`,
                  title: `AI signal ${n}`,
                  category: "ai",
                  severity: "high",
                  confidence: "high",
                  metric: "ai_x",
              }))
            : [],
    }) as never;

beforeEach(() => {
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getApiMeta).mockResolvedValue(null);
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed" });
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(null as never);
});

describe("Investment mix block and AI Workflow block pinned (CHAOS-7739)", () => {
    it("Investment mix: heading, line, the two links with filter and role, and the preview", async () => {
        render(await Home({ searchParams: Promise.resolve({ lens: "em" }) }));
        expect(screen.getByRole("heading", { name: "Investment mix" })).toBeInTheDocument();
        expect(
            screen.getByText("Work allocation snapshot for the selected window."),
        ).toBeInTheDocument();
        const work = screen.getByRole("link", { name: "Open Work view" });
        expect(work.getAttribute("href")).toMatch(/^\/work\?f=.+&role=em$/);
        const evidence = screen.getByRole("link", { name: "Open evidence" });
        expect(evidence.getAttribute("href")).toContain("/explore?metric=throughput");
        expect(evidence.getAttribute("href")).toContain("role=em");
        expect(screen.getByTestId("investment-preview-stub")).toBeInTheDocument();
    });

    it("AI Workflow: one quiet secondary link when AI does not dominate", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(aiHome(false));
        render(await Home({ searchParams: Promise.resolve({}) }));
        expect(screen.getByTestId("ai-workflow-secondary-link")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-workflow-callout")).toBeNull();
        expect(
            screen.getByRole("link", { name: "Open AI Workflows" }).getAttribute("href"),
        ).toContain("/ai?f=");
    });

    it("AI Workflow: the full callout when AI dominates", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(aiHome(true));
        render(await Home({ searchParams: Promise.resolve({}) }));
        expect(screen.getByTestId("ai-workflow-callout")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-workflow-secondary-link")).toBeNull();
    });
});
