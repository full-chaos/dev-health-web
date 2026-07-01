import { render, screen } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const checkApiHealthMock = vi.fn();
const requireSessionMock = vi.fn();
const getThroughputForecastViaGraphQLMock = vi.fn();

vi.mock("@/components/navigation/GlobalContextBar", () => ({
    GlobalContextBar: () => <div data-testid="global-context-bar" />,
}));

vi.mock("@/components/navigation/PrimaryNav", () => ({
    PrimaryNav: () => <nav data-testid="primary-nav" />,
}));

vi.mock("@/lib/api/system", () => ({
    checkApiHealth: () => checkApiHealthMock(),
}));

vi.mock("@/lib/auth", () => ({
    requireSession: () => requireSessionMock(),
}));

vi.mock("@/lib/graphql/capacityFetchers", () => ({
    getThroughputForecastViaGraphQL: (...args: unknown[]) =>
        getThroughputForecastViaGraphQLMock(...args),
}));

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn() },
}));

import {
    ForecastContent,
    ForecastErrorState,
    NoForecastState,
    StaleWipCard,
    StatusBadge,
    UnestimatedDebtCard,
    WipCongestionCard,
} from "./_components";
import type { ThroughputForecast, ThroughputRiskOverlay } from "@/lib/graphql/types";
import BacklogRiskPage from "./page";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** overlay.value = current_wip / average_wip (a ratio, NOT a count) */
function makeWipOverlay(overrides: Partial<ThroughputRiskOverlay> = {}): ThroughputRiskOverlay {
    return {
        kind: "wip",
        score: 1.0,
        label: "WIP congestion",
        value: 1.25, // ratio: current 50 / avg 40 = 1.25
        threshold: 1.25,
        active: true,
        ...overrides,
    };
}

function makeNeutralOverlay(kind: string): ThroughputRiskOverlay {
    return { kind, score: 0, label: kind, value: 0, threshold: 1, active: false };
}

function makeForecast(overrides: Partial<ThroughputForecast> = {}): ThroughputForecast {
    return {
        forecastId: "test-forecast",
        computedAt: "2026-06-10T00:00:00Z",
        teamId: null,
        backlogSize: 100,
        historyWeeks: 12,
        p50Weeks: 4,
        p75Weeks: 6,
        p90Weeks: 8,
        rollingWindows: [],
        primaryRisk: makeWipOverlay(),
        wipCongestion: makeWipOverlay(),
        staleWip: { p50AgeHours: 24, p90AgeHours: 96 },
        estimateCoverage: {
            ratio: 0.72,
            estimatedCount: 72,
            unestimatedCount: 28,
            backlogSize: 100,
        },
        reviewBottleneck: makeNeutralOverlay("review"),
        incidentLoad: makeNeutralOverlay("incident"),
        insufficientHistory: false,
        ...overrides,
    };
}

function makeSession(orgId = "org-1"): Session {
    return {
        access_token: "test-token",
        user: { id: "user-1", org_id: orgId },
        expires: "2026-07-01T00:00:00.000Z",
    } satisfies Session;
}

async function renderPage(params: Record<string, string> = {}) {
    const ui = await BacklogRiskPage({ searchParams: Promise.resolve(params) });
    render(ui as React.ReactElement);
}

beforeEach(() => {
    vi.resetAllMocks();
    checkApiHealthMock.mockResolvedValue({ ok: true });
    requireSessionMock.mockResolvedValue(makeSession());
    getThroughputForecastViaGraphQLMock.mockResolvedValue(makeForecast());
});

// ── StatusBadge ───────────────────────────────────────────────────────────────

describe("StatusBadge", () => {
    it("renders 'Elevated' when active", () => {
        render(<StatusBadge active={true} />);
        expect(screen.getByText("Elevated")).toBeInTheDocument();
    });

    it("renders 'Normal' when not active", () => {
        render(<StatusBadge active={false} />);
        expect(screen.getByText("Normal")).toBeInTheDocument();
    });
});

// ── WipCongestionCard ─────────────────────────────────────────────────────────

describe("WipCongestionCard — ratio semantics", () => {
    it("renders the congestion ratio as '×N.NN vs typical', never as a raw count", () => {
        render(<WipCongestionCard overlay={makeWipOverlay({ value: 1.25 })} backlogSize={100} />);
        expect(screen.getByText(/×1\.25 vs typical/i)).toBeInTheDocument();
    });

    it("shows Elevated badge when overlay is active", () => {
        render(<WipCongestionCard overlay={makeWipOverlay({ active: true })} backlogSize={100} />);
        expect(screen.getByText("Elevated")).toBeInTheDocument();
    });

    it("shows Normal badge when overlay is not active", () => {
        render(
            <WipCongestionCard
                overlay={makeWipOverlay({ value: 0.9, active: false })}
                backlogSize={100}
            />,
        );
        expect(screen.getByText("Normal")).toBeInTheDocument();
    });

    it("shows the real backlog count as 'Open Items'", () => {
        render(<WipCongestionCard overlay={makeWipOverlay()} backlogSize={200} />);
        expect(screen.getByText("200")).toBeInTheDocument();
        expect(screen.getByText("Open Items")).toBeInTheDocument();
    });

    it("does not fabricate a WIP-vs-backlog percentage", () => {
        render(<WipCongestionCard overlay={makeWipOverlay({ value: 1.25 })} backlogSize={100} />);
        // The ratio 1.25 / 100 = 1.25% would be false — assert it is absent
        expect(screen.queryByText(/1\.25%/)).not.toBeInTheDocument();
    });

    it("handles backlogSize=0 without NaN or crash", () => {
        expect(() =>
            render(<WipCongestionCard overlay={makeWipOverlay()} backlogSize={0} />),
        ).not.toThrow();
        expect(screen.getByText("0")).toBeInTheDocument();
    });
});

describe("StaleWipCard", () => {
    it("renders p90 WIP age as an age signal, not a count", () => {
        render(<StaleWipCard staleWip={{ p50AgeHours: 24, p90AgeHours: 96 }} />);
        expect(screen.getByText("4 days")).toBeInTheDocument();
        expect(screen.getByText("90th percentile age of in-progress items")).toBeInTheDocument();
        expect(screen.getByText("Median in-progress age: 1 day")).toBeInTheDocument();
        expect(screen.queryByText(/items stuck/i)).not.toBeInTheDocument();
    });

    it("pluralizes rounded day labels from the displayed value", () => {
        render(<StaleWipCard staleWip={{ p50AgeHours: null, p90AgeHours: 24.1 }} />);
        expect(screen.getByText("1 day")).toBeInTheDocument();
        expect(screen.queryByText("1 days")).not.toBeInTheDocument();
    });

    it("renders a genuine no-data state when WIP age is missing", () => {
        render(<StaleWipCard staleWip={null} />);
        expect(screen.getByText("WIP age unavailable")).toBeInTheDocument();
        expect(screen.queryByText("WIP age not yet connected")).not.toBeInTheDocument();
    });
});

describe("UnestimatedDebtCard", () => {
    it("renders populated estimate coverage from the frozen GraphQL response", () => {
        render(
            <UnestimatedDebtCard
                estimateCoverage={{
                    ratio: 0.72,
                    estimatedCount: 72,
                    unestimatedCount: 28,
                    backlogSize: 100,
                }}
            />,
        );

        expect(screen.getByTestId("unestimated-debt-count")).toHaveTextContent("28 unestimated");
        expect(screen.getByText("72% estimate coverage")).toBeInTheDocument();
        expect(screen.getByText("Estimated")).toBeInTheDocument();
        expect(screen.getByText("Unestimated")).toBeInTheDocument();
        expect(screen.getByText("Open backlog")).toBeInTheDocument();
    });

    it("renders connected-but-zero backlog copy without showing 0%", () => {
        render(
            <UnestimatedDebtCard
                estimateCoverage={{
                    ratio: null,
                    estimatedCount: 0,
                    unestimatedCount: 0,
                    backlogSize: 0,
                }}
            />,
        );

        expect(screen.getByText("No open backlog")).toBeInTheDocument();
        expect(screen.getByText(/estimate coverage is connected/i)).toBeInTheDocument();
        expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
    });

    it("renders unavailable copy when estimate coverage is missing", () => {
        render(<UnestimatedDebtCard estimateCoverage={null} />);

        expect(screen.getByText("Estimate coverage unavailable")).toBeInTheDocument();
        expect(screen.queryByText("Estimate coverage not yet connected")).not.toBeInTheDocument();
    });
});

// ── NoForecastState ───────────────────────────────────────────────────────────

describe("NoForecastState", () => {
    it("renders the insufficient-confidence empty state", () => {
        render(<NoForecastState />);
        expect(screen.getByText("Not enough throughput history")).toBeInTheDocument();
    });
});

describe("ForecastErrorState", () => {
    it("renders a visually distinct fetch-failure state", () => {
        render(<ForecastErrorState />);
        expect(screen.getByTestId("backlog-risk-fetch-error")).toBeInTheDocument();
        expect(screen.getByText("Backlog risk could not load")).toBeInTheDocument();
    });
});

// ── ForecastContent ───────────────────────────────────────────────────────────

describe("ForecastContent", () => {
    it("renders WIP congestion section with ratio from fixture", () => {
        render(
            <ForecastContent
                forecast={makeForecast({
                    wipCongestion: makeWipOverlay({ value: 1.5, active: true }),
                })}
            />,
        );
        expect(screen.getByText(/×1\.50 vs typical/i)).toBeInTheDocument();
        expect(screen.getByText("Elevated")).toBeInTheDocument();
    });

    it("renders live Stale WIP and live Unestimated Debt", () => {
        render(<ForecastContent forecast={makeForecast()} />);
        expect(screen.getByText("4 days")).toBeInTheDocument();
        expect(screen.getByText("28 unestimated")).toBeInTheDocument();
        expect(screen.getByText("72% estimate coverage")).toBeInTheDocument();
    });

    it("does not leak internal metric field names in empty-state copy", () => {
        render(<ForecastContent forecast={makeForecast()} />);
        // DataState detail copy must never expose implementation vocabulary
        expect(screen.queryByText(/wip_age_p90_hours/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/rollup/i)).not.toBeInTheDocument();
    });
});

describe("BacklogRiskPage GraphQL states", () => {
    it("renders populated estimate coverage from a mocked GraphQL forecast", async () => {
        getThroughputForecastViaGraphQLMock.mockResolvedValue(
            makeForecast({
                estimateCoverage: {
                    ratio: 0.6,
                    estimatedCount: 30,
                    unestimatedCount: 20,
                    backlogSize: 50,
                },
            }),
        );

        await renderPage();

        expect(getThroughputForecastViaGraphQLMock).toHaveBeenCalledWith("org-1", {
            teamIds: null,
            workScopeId: null,
            historyWeeks: 12,
        });
        expect(screen.getByText("20 unestimated")).toBeInTheDocument();
        expect(screen.getByText("60% estimate coverage")).toBeInTheDocument();
    });

    it("renders connected-but-zero backlog from a mocked GraphQL forecast without 0%", async () => {
        getThroughputForecastViaGraphQLMock.mockResolvedValue(
            makeForecast({
                backlogSize: 0,
                estimateCoverage: {
                    ratio: null,
                    estimatedCount: 0,
                    unestimatedCount: 0,
                    backlogSize: 0,
                },
            }),
        );

        await renderPage();

        expect(screen.getByText("No open backlog")).toBeInTheDocument();
        expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
    });

    it("renders error copy when the mocked GraphQL forecast rejects", async () => {
        getThroughputForecastViaGraphQLMock.mockRejectedValue(new Error("GraphQL failed"));

        await renderPage();

        expect(screen.getByTestId("backlog-risk-fetch-error")).toBeInTheDocument();
        expect(screen.getByText("Backlog risk could not load")).toBeInTheDocument();
        expect(screen.queryByText("Not enough throughput history")).not.toBeInTheDocument();
    });
});
