import { render, screen, within } from "@/test/utils";
import { describe, expect, it } from "vitest";

import { THROUGHPUT_FORECAST_QUERY } from "@/lib/graphql/queries";
import type {
    ThroughputBacklogState,
    ThroughputForecast,
    ThroughputRiskOverlay,
} from "@/lib/graphql/types";

import { BacklogConditionCard, ForecastContent } from "./_components";

// CHAOS-14088: the Backlog condition card says when its open-item count is not a current measurement
// (ops backlogState STALE / NO_ROWS, CHAOS-8167). The number stays as served.

function overlay(): ThroughputRiskOverlay {
    return {
        kind: "wip",
        score: 0,
        label: "WIP congestion",
        value: 1,
        threshold: 1.25,
        active: false,
    };
}

function forecast(overrides: Partial<ThroughputForecast> = {}): ThroughputForecast {
    const neutral = (kind: string) => ({ ...overlay(), kind, label: kind });
    return {
        forecastId: "f",
        computedAt: "2026-10-02T00:00:00Z",
        teamId: "t7",
        backlogSize: 0,
        historyWeeks: 12,
        rollingWindows: [],
        primaryRisk: neutral("none"),
        wipCongestion: overlay(),
        staleWip: null,
        estimateCoverage: null,
        reviewBottleneck: neutral("review"),
        incidentLoad: neutral("incident_load"),
        insufficientHistory: true,
        ...overrides,
    };
}

function card(
    backlogState?: ThroughputBacklogState | null,
    backlogAsOfDay?: string | null,
    backlogSize = 0,
) {
    return render(
        <BacklogConditionCard
            overlay={overlay()}
            backlogSize={backlogSize}
            staleWip={null}
            backlogState={backlogState}
            backlogAsOfDay={backlogAsOfDay}
        />,
    );
}

describe("Backlog condition: backlog state caption", () => {
    it("STALE names the day the backlog is read from, and keeps the served number", () => {
        card("STALE", "2025-05-03", 0);
        const caption = screen.getByTestId("backlog-state-caption");
        expect(caption).toHaveTextContent("Stale as of May 3, 2025");
        expect(caption).toHaveAttribute("data-state", "STALE");
        const facts = within(screen.getByTestId("backlog-condition-facts"));
        expect(facts.getByText("Open items · WIP panel")).toBeInTheDocument();
        expect(facts.getByText("0")).toBeInTheDocument();
    });

    it("STALE with a served sum keeps that sum", () => {
        card("STALE", "2026-05-01", 7);
        expect(screen.getByTestId("backlog-state-caption")).toHaveTextContent(
            "Stale as of May 1, 2026",
        );
        expect(
            within(screen.getByTestId("backlog-condition-facts")).getByText("7"),
        ).toBeInTheDocument();
    });

    it("NO_ROWS says there are no backlog rows", () => {
        card("NO_ROWS", null, 0);
        const caption = screen.getByTestId("backlog-state-caption");
        expect(caption).toHaveTextContent("No backlog rows");
        expect(caption).toHaveAttribute("data-state", "NO_ROWS");
    });

    it.each<[ThroughputBacklogState | null | undefined]>([
        ["MEASURED"],
        ["SUPPLIED"],
        [null],
        [undefined],
    ])("%s shows no caption", (state) => {
        card(state, state === "MEASURED" ? "2026-10-01" : null, 4);
        expect(screen.queryByTestId("backlog-state-caption")).toBeNull();
        expect(
            within(screen.getByTestId("backlog-condition-facts")).getByText("4"),
        ).toBeInTheDocument();
    });

    it("the page content passes the served state and day to the card", () => {
        render(
            <ForecastContent
                forecast={forecast({ backlogState: "STALE", backlogAsOfDay: "2025-05-03" })}
            />,
        );
        expect(
            within(screen.getByTestId("backlog-condition")).getByTestId("backlog-state-caption"),
        ).toHaveTextContent("Stale as of May 3, 2025");
    });
});

describe("THROUGHPUT_FORECAST_QUERY", () => {
    it("selects backlogState and backlogAsOfDay after backlogSize, and grainCount on estimateCoverage", () => {
        expect(THROUGHPUT_FORECAST_QUERY).toMatch(
            /backlogSize\n\s+backlogState\n\s+backlogAsOfDay\n\s+historyWeeks/,
        );
        expect(THROUGHPUT_FORECAST_QUERY).toMatch(/backlogSize\n\s+grainCount\n\s+\}/);
    });
});
