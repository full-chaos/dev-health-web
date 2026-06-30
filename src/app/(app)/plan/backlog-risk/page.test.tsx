import { render, screen } from "@/test/utils";
import { describe, expect, it } from "vitest";

import {
    ForecastContent,
    NoForecastState,
    StaleWipCard,
    StatusBadge,
    WipCongestionCard,
} from "./_components";
import type { ThroughputForecast, ThroughputRiskOverlay } from "@/lib/graphql/types";

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
        reviewBottleneck: makeNeutralOverlay("review"),
        incidentLoad: makeNeutralOverlay("incident"),
        insufficientHistory: false,
        ...overrides,
    };
}

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

// ── NoForecastState ───────────────────────────────────────────────────────────

describe("NoForecastState", () => {
    it("renders the insufficient-confidence empty state", () => {
        render(<NoForecastState />);
        expect(screen.getByText("Not enough throughput history")).toBeInTheDocument();
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

    it("renders live Stale WIP and leaves Unestimated Debt unavailable", () => {
        render(<ForecastContent forecast={makeForecast()} />);
        expect(screen.getByText("4 days")).toBeInTheDocument();
        expect(screen.getByText("Estimate coverage not yet connected")).toBeInTheDocument();
    });

    it("does not leak internal metric field names in empty-state copy", () => {
        render(<ForecastContent forecast={makeForecast()} />);
        // DataState detail copy must never expose implementation vocabulary
        expect(screen.queryByText(/wip_age_p90_hours/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/rollup/i)).not.toBeInTheDocument();
    });
});
