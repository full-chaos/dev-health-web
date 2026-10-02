import { render, screen, within } from "@/test/utils";
import { STATUS_PILL } from "@/lib/statusPill";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const checkApiHealthMock = vi.fn();
const requireSessionMock = vi.fn();
const getThroughputForecastViaGraphQLMock = vi.fn();

const scopeBarSpy = vi.fn();

// The page is in the shared app shell: the layout owns the navigation, and the
// page has one scope bar.
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: (props: Record<string, unknown>) => {
        scopeBarSpy(props);
        return <section data-testid="scope-bar" />;
    },
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
    BacklogConditionCard,
    BacklogTiles,
    EstimateCoverageCard,
    ForecastContent,
    ForecastErrorState,
    NoForecastState,
    PopulationNotice,
    StatusBadge,
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
    it("renders 'Elevated' as a caution pill with an icon when active", () => {
        render(<StatusBadge active={true} />);
        const pill = screen.getByText("Elevated").closest("span") as HTMLElement;
        expect(pill.className).toContain(STATUS_PILL.caution);
        expect(pill.querySelector("svg")).not.toBeNull();
    });

    it("renders 'Normal' as a positive pill with an icon when not active", () => {
        render(<StatusBadge active={false} />);
        const pill = screen.getByText("Normal").closest("span") as HTMLElement;
        expect(pill.className).toContain(STATUS_PILL.positive);
        expect(pill.querySelector("svg")).not.toBeNull();
    });
});

// ── Tiles ─────────────────────────────────────────────────────────────────────

const tiles = (over: Partial<ThroughputForecast> = {}) => {
    const f = makeForecast(over);
    return render(
        <BacklogTiles
            overlay={f.wipCongestion}
            staleWip={f.staleWip}
            estimateCoverage={f.estimateCoverage}
        />,
    );
};

const tile = (id: string) => within(screen.getByTestId(id));

describe("BacklogTiles", () => {
    it("writes the congestion ratio as 'N.NN×' like /plan, with 'vs typical' and the threshold, never a raw count", () => {
        tiles({ wipCongestion: makeWipOverlay({ value: 1.25, threshold: 1.25 }) });

        expect(tile("tile-wip-congestion").getByText("1.25×")).toBeInTheDocument();
        expect(
            tile("tile-wip-congestion").getByText("vs typical · threshold 1.25×"),
        ).toBeInTheDocument();
        expect(screen.queryByText(/×1\.25/)).toBeNull();
    });

    it("shows Elevated or Normal as a pill in the congestion tile", () => {
        const first = tiles({ wipCongestion: makeWipOverlay({ active: true }) });
        expect(tile("tile-wip-congestion").getByText("Elevated")).toBeInTheDocument();
        first.unmount();

        tiles({ wipCongestion: makeWipOverlay({ value: 0.9, active: false }) });
        expect(tile("tile-wip-congestion").getByText("Normal")).toBeInTheDocument();
    });

    it("does not fabricate a WIP-vs-backlog percentage", () => {
        tiles({ wipCongestion: makeWipOverlay({ value: 1.25 }) });
        expect(screen.queryByText(/1\.25%/)).not.toBeInTheDocument();
    });

    it("renders WIP ages as ages, not counts: P90 and median", () => {
        tiles({ staleWip: { p50AgeHours: 24, p90AgeHours: 96 } });

        expect(tile("tile-stale-wip").getByText("4 days")).toBeInTheDocument();
        expect(
            tile("tile-stale-wip").getByText("90th percentile age of in-progress items"),
        ).toBeInTheDocument();
        expect(tile("tile-median-wip-age").getByText("1 day")).toBeInTheDocument();
        expect(screen.queryByText(/items stuck/i)).not.toBeInTheDocument();
    });

    it("pluralizes rounded day labels from the displayed value", () => {
        tiles({ staleWip: { p50AgeHours: null, p90AgeHours: 24.1 } });
        expect(screen.getByText("1 day")).toBeInTheDocument();
        expect(screen.queryByText("1 days")).not.toBeInTheDocument();
    });

    it("shows a dash and 'No data' (never 0) when WIP age is missing", () => {
        tiles({ staleWip: null });

        for (const id of ["tile-stale-wip", "tile-median-wip-age"]) {
            expect(tile(id).getByText("—")).toBeInTheDocument();
            expect(tile(id).getByText("No data")).toBeInTheDocument();
        }
    });

    it("shows the unestimated count and the coverage in the fourth tile", () => {
        tiles();

        expect(tile("tile-unestimated").getByText("28 items")).toBeInTheDocument();
        expect(tile("tile-unestimated").getByText("72% estimate coverage")).toBeInTheDocument();
    });

    it("shows a real 0 and 'No open backlog' for a connected, empty backlog, without 0%", () => {
        tiles({
            estimateCoverage: {
                ratio: null,
                estimatedCount: 0,
                unestimatedCount: 0,
                backlogSize: 0,
            },
        });

        expect(tile("tile-unestimated").getByText("0")).toBeInTheDocument();
        expect(tile("tile-unestimated").getByText("No open backlog")).toBeInTheDocument();
        expect(screen.queryByText(/0%/)).toBeNull();
    });

    it("shows a dash and 'No data' when estimate coverage is missing or not computed", () => {
        const first = tiles({ estimateCoverage: null });
        expect(tile("tile-unestimated").getByText("—")).toBeInTheDocument();
        expect(tile("tile-unestimated").getByText("No data")).toBeInTheDocument();
        first.unmount();

        tiles({
            estimateCoverage: {
                ratio: null,
                estimatedCount: 0,
                unestimatedCount: 5,
                backlogSize: 5,
            },
        });
        expect(tile("tile-unestimated").getByText("—")).toBeInTheDocument();
        expect(tile("tile-unestimated").getByText("No data")).toBeInTheDocument();
    });
});

// ── Backlog condition ─────────────────────────────────────────────────────────

describe("BacklogConditionCard", () => {
    it("shows the real backlog count as 'Open items · WIP panel', and handles 0 without NaN", () => {
        const first = render(
            <BacklogConditionCard overlay={makeWipOverlay()} backlogSize={200} staleWip={null} />,
        );
        expect(screen.getByText("Open items · WIP panel")).toBeInTheDocument();
        expect(screen.getByText("200")).toBeInTheDocument();
        first.unmount();

        render(<BacklogConditionCard overlay={makeWipOverlay()} backlogSize={0} staleWip={null} />);
        expect(screen.getByText("0")).toBeInTheDocument();
        expect(screen.queryByText(/NaN/)).toBeNull();
    });

    it("keeps the threshold sentence and the note that panels are not one status", () => {
        render(
            <BacklogConditionCard
                overlay={makeWipOverlay({ threshold: 1.25 })}
                backlogSize={10}
                staleWip={{ p50AgeHours: 24, p90AgeHours: 96 }}
            />,
        );

        expect(
            screen.getByText(/Threshold 1\.25× — ratio of current WIP to recent average/),
        ).toBeInTheDocument();
        expect(screen.getByText(/do not flatten the panels into one status/)).toBeInTheDocument();
        expect(screen.getByText("P90 work age")).toBeInTheDocument();
        expect(screen.getByText("Median work age")).toBeInTheDocument();
    });

    it("renders a genuine no-data state when WIP age is missing, and no age rows", () => {
        render(
            <BacklogConditionCard overlay={makeWipOverlay()} backlogSize={10} staleWip={null} />,
        );

        expect(screen.getByText("WIP age unavailable")).toBeInTheDocument();
        expect(screen.queryByText("P90 work age")).toBeNull();
        expect(screen.queryByText("WIP age not yet connected")).not.toBeInTheDocument();
    });
});

// ── Estimate coverage ─────────────────────────────────────────────────────────

describe("EstimateCoverageCard", () => {
    it("renders populated estimate coverage from the frozen GraphQL response", () => {
        render(
            <EstimateCoverageCard
                estimateCoverage={{
                    ratio: 0.72,
                    estimatedCount: 72,
                    unestimatedCount: 28,
                    backlogSize: 100,
                }}
            />,
        );

        const card = within(screen.getByTestId("unestimated-debt-card"));
        expect(card.getByText("Coverage")).toBeInTheDocument();
        expect(card.getByText("72%")).toBeInTheDocument();
        expect(card.getByText("Estimated")).toBeInTheDocument();
        expect(card.getByText("72")).toBeInTheDocument();
        expect(card.getByText("Unestimated")).toBeInTheDocument();
        expect(card.getByText("28")).toBeInTheDocument();
        expect(card.getByText("Open backlog · estimates panel")).toBeInTheDocument();
        expect(card.getByText("100")).toBeInTheDocument();
        expect(card.getByText("Missing estimates remain explicit.")).toBeInTheDocument();
    });

    it("renders connected-but-zero backlog copy without showing 0%", () => {
        render(
            <EstimateCoverageCard
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
        render(<EstimateCoverageCard estimateCoverage={null} />);

        expect(screen.getByText("Estimate coverage unavailable")).toBeInTheDocument();
        expect(screen.queryByText("Estimate coverage not yet connected")).not.toBeInTheDocument();
    });

    it("renders the not-computed copy when the backlog exists but the ratio is missing", () => {
        render(
            <EstimateCoverageCard
                estimateCoverage={{
                    ratio: null,
                    estimatedCount: 0,
                    unestimatedCount: 5,
                    backlogSize: 5,
                }}
            />,
        );

        expect(screen.getByTestId("unestimated-debt-ratio-unavailable")).toBeInTheDocument();
    });
});

// ── Population notice ─────────────────────────────────────────────────────────

describe("PopulationNotice", () => {
    const coverage = (backlogSize: number) => ({
        ratio: 0.5,
        estimatedCount: 1,
        unestimatedCount: 1,
        backlogSize,
    });

    it("names both counts when the WIP panel and the estimate panel differ", () => {
        render(<PopulationNotice wipCount={51} estimateCoverage={coverage(59)} />);

        const notice = screen.getByTestId("population-notice");
        expect(notice).toHaveTextContent(
            "The WIP panel counts 51 open items and the estimate panel counts 59. The two populations are not reconciled.",
        );
    });

    it("says '1 open item' in the singular", () => {
        render(<PopulationNotice wipCount={1} estimateCoverage={coverage(2)} />);

        expect(screen.getByTestId("population-notice")).toHaveTextContent(
            "The WIP panel counts 1 open item and the estimate panel counts 2.",
        );
    });

    it("shows nothing when the two counts are equal, or when there is no estimate coverage", () => {
        const first = render(<PopulationNotice wipCount={51} estimateCoverage={coverage(51)} />);
        expect(screen.queryByTestId("population-notice")).toBeNull();
        first.unmount();

        render(<PopulationNotice wipCount={51} estimateCoverage={null} />);
        expect(screen.queryByTestId("population-notice")).toBeNull();
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
    it("renders a visually distinct fetch-failure state: the danger notice, with the same words", () => {
        render(<ForecastErrorState />);
        const notice = screen.getByTestId("backlog-risk-fetch-error");
        expect(notice).toHaveAttribute("data-notice-variant", "danger");
        expect(within(notice).getByText("Backlog risk could not load")).toBeInTheDocument();
        expect(
            within(notice).getByText(
                /The forecast request failed\. Retry after the data service recovers/,
            ),
        ).toBeInTheDocument();
    });
});

// ── ForecastContent ───────────────────────────────────────────────────────────

describe("ForecastContent", () => {
    it("draws four joined tiles, then the two cards as Sections with the prototype descriptions", () => {
        render(<ForecastContent forecast={makeForecast()} />);

        expect(screen.getByTestId("backlog-tiles")).toHaveAttribute("data-columns", "4");
        const condition = within(screen.getByTestId("backlog-condition"));
        expect(
            condition.getByRole("heading", { level: 2, name: "Backlog condition" }),
        ).toBeInTheDocument();
        expect(
            condition.getByText(
                "Normal congestion and aging work can coexist; do not flatten the panels into one status.",
            ),
        ).toBeInTheDocument();
        const coverage = within(screen.getByTestId("unestimated-debt-card"));
        expect(
            coverage.getByRole("heading", { level: 2, name: "Estimate coverage" }),
        ).toBeInTheDocument();
        expect(coverage.getByText("Missing estimates remain explicit.")).toBeInTheDocument();
        expect(coverage.getAllByTestId("evidence-fact")).toHaveLength(4);
    });

    it("renders the congestion tile with the ratio from the fixture", () => {
        render(
            <ForecastContent
                forecast={makeForecast({
                    wipCongestion: makeWipOverlay({ value: 1.5, active: true }),
                })}
            />,
        );
        expect(
            within(screen.getByTestId("tile-wip-congestion")).getByText("1.50×"),
        ).toBeInTheDocument();
        expect(screen.getByText("Elevated")).toBeInTheDocument();
    });

    it("renders live stale WIP and live unestimated work", () => {
        render(<ForecastContent forecast={makeForecast()} />);
        expect(screen.getAllByText("4 days").length).toBeGreaterThan(0);
        expect(screen.getByText("28 items")).toBeInTheDocument();
        expect(screen.getByText("72% estimate coverage")).toBeInTheDocument();
    });

    it("shows the two cards: Backlog condition and Estimate coverage", () => {
        render(<ForecastContent forecast={makeForecast()} />);
        expect(
            within(screen.getByTestId("backlog-condition")).getByRole("heading", {
                name: "Backlog condition",
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Estimate coverage" })).toBeInTheDocument();
    });

    it("shows the population notice only when the two counts differ", () => {
        const first = render(
            <ForecastContent
                forecast={makeForecast({
                    backlogSize: 51,
                    estimateCoverage: {
                        ratio: 0,
                        estimatedCount: 0,
                        unestimatedCount: 59,
                        backlogSize: 59,
                    },
                })}
            />,
        );
        expect(screen.getByTestId("population-notice")).toBeInTheDocument();
        first.unmount();

        render(<ForecastContent forecast={makeForecast()} />);
        expect(screen.queryByTestId("population-notice")).toBeNull();
    });

    it("does not leak internal metric field names in empty-state copy", () => {
        render(<ForecastContent forecast={makeForecast()} />);
        expect(screen.queryByText(/wip_age_p90_hours/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/rollup/i)).not.toBeInTheDocument();
    });
});

describe("BacklogRiskPage in the shared app shell", () => {
    it("has the shared header: one h1 and the subtitle, and no in-page back link", async () => {
        await renderPage({ origin: "cockpit" });

        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Backlog Risk");
        expect(
            screen.getByText(
                "WIP congestion, stale items, and unestimated debt — signals that reduce delivery predictability before they appear in cycle time.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Back to/ })).toBeNull();
        expect(screen.queryByRole("main")).toBeNull();
    });

    it("has one scope bar with no page filters and the origin: the page had the global context bar alone", async () => {
        await renderPage({ origin: "cockpit" });

        expect(scopeBarSpy).toHaveBeenCalledWith({ pageFilters: false, origin: "cockpit" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
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
        expect(screen.getByText("20 items")).toBeInTheDocument();
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

        expect(screen.getAllByText("No open backlog").length).toBeGreaterThan(0);
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
