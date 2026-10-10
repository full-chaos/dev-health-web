/**
 * Home with a FAILED Home read, an EMPTY answer and a normal answer (CHAOS-9189).
 *
 * A failed read is not an empty window: the hero and every Home section fed by the answer draw the
 * failed-read state or text. The page is rendered with its real sections; only the reads are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { checkApiHealth } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import type { CockpitSignal, HomeResponse } from "@/lib/types";
import Home from "./page";

vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(async () => ({ user: { org_id: "org-1" } })),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

const FAILED = "Could not be read";
/** The text the backend answered with: it must never reach the screen. */
const BACKEND_TEXT = "Service Unavailable: team Payments";

const EMPTY_HOME: HomeResponse = {
    freshness: {
        last_ingested_at: null,
        latest_successful_sync_at: null,
        sources: { github: "ok" },
        coverage: null,
    },
    deltas: [],
    summary: [],
    tiles: {},
    constraint: { title: "", claim: "", evidence: [], experiments: [] },
    events: [],
    health_state: { status: "no_data", headline: "", summary: "" },
    signals: [],
};

const SIGNAL: CockpitSignal = {
    id: "metric:review_latency",
    title: "Review Latency appears up",
    metric: "review_latency",
    current_value: "0.9 hours",
    prior_value: "0.1 hours",
    delta: "+1,041%",
    direction: "up",
    severity: "critical",
    confidence: "medium",
    affected_scope: "3 repos",
    evidence_count: 7,
    why_it_matters: "Longer reviews suggest delivery may wait on review capacity.",
    recommended_action: "Rebalance reviewer rotation.",
    evidence_ref: "/api/home/explain/review_latency",
    category: "delivery",
};

const NORMAL_HOME: HomeResponse = {
    ...EMPTY_HOME,
    health_state: { status: "at_risk", headline: "Review latency", summary: "Reviews are slow." },
    signals: [SIGNAL],
    deltas: [
        {
            metric: "review_latency",
            label: "Review Latency",
            value: 0.9,
            unit: "hours",
            delta_pct: 1041,
            spark: [],
        },
    ],
};

const renderHome = async () => render(await Home({ searchParams: Promise.resolve({}) }));
const primary = () => within(screen.getByTestId("home-primary"));

/** The words of an EMPTY or a "nothing found" state. None may stand for a failed read. */
const EMPTY_STATE_TEXTS = [
    "No data",
    "No data for this window.",
    "Enabled but no findings",
    "No data connected",
    "No signals in this window.",
    "Not reported",
    "Evidence will appear once data is ingested.",
];

describe("Home: a failed read is not an empty window (CHAOS-9189)", () => {
    beforeEach(() => {
        vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
        vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed for this test" });
    });

    it("FAILED read: the hero and every Home section say the read failed, never 'No data'", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockRejectedValue(new Error(BACKEND_TEXT));
        await renderHome();

        // Hero: the failed-read state, in place of the no-data panel.
        const hero = within(screen.getByTestId("cockpit-summary"));
        expect(hero.getByTestId("cockpit-read-failed")).toHaveTextContent(FAILED);
        expect(hero.getByTestId("cockpit-read-failed")).toHaveAttribute("data-variant", "error");
        expect(hero.queryByTestId("cockpit-no-data")).toBeNull();
        expect(hero.queryByTestId("cockpit-top-change-empty")).toBeNull();

        // Ranked signals, Evidence & context, Monitoring, Investigation threads.
        expect(screen.getByTestId("ranked-signals-failed")).toHaveTextContent(FAILED);
        expect(screen.queryByTestId("ranked-signals-empty")).toBeNull();
        const facts = within(screen.getByTestId("evidence-context-card")).getAllByTestId(
            "evidence-fact",
        );
        expect(facts).toHaveLength(3);
        for (const fact of facts) expect(fact).toHaveTextContent(FAILED);
        expect(screen.getByTestId("monitoring-read-failed")).toHaveTextContent(FAILED);
        expect(screen.queryByTestId("monitoring-tiles")).toBeNull();
        expect(screen.getByTestId("thread-row-recent-events")).toHaveTextContent(FAILED);
        expect(screen.getByTestId("thread-row-compounding-risk")).toHaveTextContent(FAILED);

        // No empty-state wording anywhere in the Home body, and no backend text on the page.
        for (const text of EMPTY_STATE_TEXTS) expect(primary().queryByText(text)).toBeNull();
        expect(document.body).not.toHaveTextContent("Service Unavailable");
        expect(document.body).not.toHaveTextContent("Payments");
    });

    it("EMPTY answer: the no-data state stays, and nothing says the read failed", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(EMPTY_HOME);
        await renderHome();

        expect(screen.getByTestId("cockpit-no-data")).toHaveTextContent("No data for this window.");
        expect(screen.getByTestId("ranked-signals-empty")).toHaveTextContent(
            "No signals in this window.",
        );
        expect(screen.getByTestId("data-state-detector-enabled-no-findings")).toBeInTheDocument();
        expect(screen.queryByTestId("cockpit-read-failed")).toBeNull();
        expect(screen.queryByTestId("monitoring-read-failed")).toBeNull();
        expect(primary().queryByText(FAILED)).toBeNull();
    });

    it("NORMAL answer: the served signal and tile are drawn, with no failed-read state", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(NORMAL_HOME);
        await renderHome();

        expect(screen.getByTestId("cockpit-summary")).toHaveTextContent(
            "Review Latency appears up",
        );
        expect(screen.getByTestId("cockpit-summary")).toHaveTextContent("+1,041%");
        expect(screen.getByTestId("monitoring-tiles")).toBeInTheDocument();
        expect(screen.queryByTestId("cockpit-read-failed")).toBeNull();
        expect(screen.queryByTestId("cockpit-no-data")).toBeNull();
        expect(primary().queryByText(FAILED)).toBeNull();
    });
});
