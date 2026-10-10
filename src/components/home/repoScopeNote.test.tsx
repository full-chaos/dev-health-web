import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import { NOT_FILTERED_BY_REPOSITORY } from "@/lib/metrics/repoScope";
import type { CockpitSignal, HomeResponse, MetricDelta } from "@/lib/types";

import { CockpitSummary } from "./CockpitSummary";
import { HomeMonitoring } from "./HomeMonitoring";
import { RankedSignals } from "./RankedSignals";

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

const base = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    why: {},
    how: {},
};
const noRepo = { ...base, what: {} } as MetricFilter;
const oneRepo = { ...base, what: { repos: ["full-chaos/dev-health-web"] } } as MetricFilter;

const delta = (metric: string, label: string): MetricDelta => ({
    metric,
    label,
    value: 5,
    unit: "days",
    delta_pct: 10,
    spark: [
        { ts: "2026-09-01", value: 1 },
        { ts: "2026-09-02", value: 2 },
    ],
});
const DELTAS = [
    delta("cycle_time", "Cycle Time"),
    delta("review_latency", "Review Latency"),
    delta("wip_saturation", "WIP Saturation"),
    delta("blocked_work", "Blocked Work"),
    delta("throughput", "Throughput"),
    delta("deploy_freq", "Deploy Frequency"),
];

const signal = (metric: string, label: string): CockpitSignal => ({
    id: `metric:${metric}`,
    title: `${label} appears up`,
    metric,
    severity: "high",
    confidence: "medium",
    affected_scope: "org",
    evidence_count: 1,
    current_value: "9 hours",
    prior_value: "3 hours",
    delta: "+200%",
    direction: "up",
    category: "delivery",
    why_it_matters: "w",
    recommended_action: "a",
    evidence_ref: `/api/home/explain/${metric}`,
});

const home = (signals: CockpitSignal[]): HomeResponse =>
    ({
        freshness: { last_ingested_at: null, sources: { github: "ok" }, coverage: {} },
        deltas: DELTAS,
        summary: [],
        tiles: {},
        constraint: { title: "", claim: "", evidence: [], experiments: [] },
        events: [],
        health_state: { status: "at_risk", headline: "h", summary: "s" },
        signals,
    }) as unknown as HomeResponse;

describe("repository filter note on team-scoped metrics (CHAOS-9089)", () => {
    it("Monitoring: with a repository, the four unscoped tiles carry the note and the scoped ones do not", () => {
        render(
            <HomeMonitoring
                home={home([])}
                filters={oneRepo}
                activeRole="em"
                lensId="em"
                initialView="flow"
            />,
        );
        for (const m of ["cycle_time", "wip_saturation", "blocked_work"]) {
            expect(screen.getByTestId(`monitoring-tile-${m}`)).toHaveTextContent(
                NOT_FILTERED_BY_REPOSITORY,
            );
            // The served value and change stay.
            expect(screen.getByTestId(`monitoring-tile-${m}`)).toHaveTextContent("+10%");
        }
        expect(screen.getByTestId("monitoring-tile-review_latency")).not.toHaveTextContent(
            NOT_FILTERED_BY_REPOSITORY,
        );
    });

    it("Monitoring: no note without a repository", () => {
        render(
            <HomeMonitoring
                home={home([])}
                filters={noRepo}
                activeRole="em"
                lensId="em"
                initialView="flow"
            />,
        );
        expect(screen.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeNull();
    });

    it("Ranked signals: only the unscoped metric rows carry the note", () => {
        const signals = [
            signal("deploy_freq", "Deploy Frequency"),
            signal("throughput", "Throughput"),
            signal("review_latency", "Review Latency"),
        ];
        render(<RankedSignals signals={signals} deltas={DELTAS} filters={oneRepo} />);
        const rows = screen.getAllByTestId("signal-row");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent(NOT_FILTERED_BY_REPOSITORY);
        expect(rows[1]).not.toHaveTextContent(NOT_FILTERED_BY_REPOSITORY);
        expect(within(rows[0]).getByTestId("signal-current")).toHaveTextContent("9 hours");
    });

    it("Ranked signals: no note without a repository", () => {
        const signals = [
            signal("deploy_freq", "Deploy Frequency"),
            signal("throughput", "Throughput"),
        ];
        render(<RankedSignals signals={signals} deltas={DELTAS} filters={noRepo} />);
        expect(screen.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeNull();
    });

    it("Hero: an unscoped primary signal carries the note; a scoped one does not", () => {
        const { unmount } = render(
            <CockpitSummary
                home={home([signal("blocked_work", "Blocked Work")])}
                filters={oneRepo}
            />,
        );
        expect(screen.getByTestId("cockpit-summary")).toHaveTextContent(NOT_FILTERED_BY_REPOSITORY);
        expect(screen.getByTestId("area-signal-value")).toHaveTextContent("+200%");
        unmount();
        render(
            <CockpitSummary
                home={home([signal("review_latency", "Review Latency")])}
                filters={oneRepo}
            />,
        );
        expect(screen.getByTestId("cockpit-summary")).not.toHaveTextContent(
            NOT_FILTERED_BY_REPOSITORY,
        );
    });
});

describe("served repository-filter flag and coverage (CHAOS-9078)", () => {
    const withFlag = (d: MetricDelta, flag: boolean | null | undefined): MetricDelta =>
        flag === undefined ? d : { ...d, repo_filter_applied: flag };
    const monitoring = (deltas: MetricDelta[], filters: MetricFilter) => {
        const h = { ...home([]), deltas } as HomeResponse;
        render(
            <HomeMonitoring
                home={h}
                filters={filters}
                activeRole="em"
                lensId="em"
                initialView="flow"
            />,
        );
    };

    it("flag false: the note, also on a key outside the fallback set", () => {
        monitoring([withFlag(delta("review_latency", "Review Latency"), false)], oneRepo);
        expect(screen.getByTestId("monitoring-tile-review_latency")).toHaveTextContent(
            NOT_FILTERED_BY_REPOSITORY,
        );
    });

    it("flag true or null: no note, also on one of the four fallback keys", () => {
        monitoring([withFlag(delta("cycle_time", "Cycle Time"), true)], oneRepo);
        expect(screen.getByTestId("monitoring-tile-cycle_time")).not.toHaveTextContent(
            NOT_FILTERED_BY_REPOSITORY,
        );
    });

    it("flag undefined: the fallback set decides (older backend)", () => {
        monitoring([withFlag(delta("cycle_time", "Cycle Time"), undefined)], oneRepo);
        expect(screen.getByTestId("monitoring-tile-cycle_time")).toHaveTextContent(
            NOT_FILTERED_BY_REPOSITORY,
        );
    });

    it("flag true with no data: the normal no-data text, no note", () => {
        const empty: MetricDelta = {
            ...delta("cycle_time", "Cycle Time"),
            value: 0,
            has_data: false,
            repo_filter_applied: true,
        };
        monitoring([empty], oneRepo);
        const tile = screen.getByTestId("monitoring-tile-cycle_time");
        expect(tile).toHaveTextContent("No data for this window");
        expect(tile).not.toHaveTextContent(NOT_FILTERED_BY_REPOSITORY);
    });

    it("ranked signal row follows its own served flag", () => {
        const signals = [
            signal("deploy_freq", "Deploy Frequency"),
            { ...signal("throughput", "Throughput"), repo_filter_applied: true },
            { ...signal("review_latency", "Review Latency"), repo_filter_applied: false },
        ];
        render(<RankedSignals signals={signals} deltas={DELTAS} filters={oneRepo} />);
        const rows = screen.getAllByTestId("signal-row");
        expect(rows[0]).not.toHaveTextContent(NOT_FILTERED_BY_REPOSITORY);
        expect(rows[1]).toHaveTextContent(NOT_FILTERED_BY_REPOSITORY);
    });

    it("hero: a risk signal names its coverage and keeps its severity", () => {
        const risk = {
            ...signal("compounding_risk", "Compounding risk"),
            coverage: 0.6,
            severity: "high" as const,
        };
        render(<CockpitSummary home={home([risk])} filters={noRepo} />);
        expect(screen.getByTestId("cockpit-summary")).toHaveTextContent("Based on 60% of inputs");
    });
});
