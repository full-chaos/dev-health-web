import { describe, expect, it, vi } from "vitest";

import { MetricTile } from "@/app/(app)/operating-review/MetricTile";
import { HomeMonitoring } from "@/components/home/HomeMonitoring";
import type { MetricFilter } from "@/lib/filters/types";
import type { OperatingReviewMetric } from "@/lib/graphql/types";
import type { HomeResponse, MetricDelta } from "@/lib/types";
import { render, screen, within } from "@/test/utils";

import {
    NOT_MEASURED_YET,
    NO_DATA_FOR_WINDOW,
    NO_DEPLOYMENTS,
    NO_INCIDENT_DATA,
    NO_MERGED_PULL_REQUESTS,
    NO_REVIEW_DATA,
    NO_REWORK_SIGNAL,
    noDataText,
} from "../metricDisplay";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

// CHAOS-9043: why a change failure rate has no value. One mapping, three surfaces here (the
// explain panel has its own file).
const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
};

type Case = {
    name: string;
    /** Metric key of the served row; change failure rate unless a case says otherwise. */
    metric?: string;
    hasData?: boolean;
    state?: string | null;
    value: number;
    /** The text the value slot must show; null = a drawn number. */
    message: string | null;
    drawn?: RegExp;
};

const CASES: Case[] = [
    {
        name: "measured 25",
        hasData: true,
        state: "measured",
        value: 25,
        message: null,
        drawn: /25/,
    },
    { name: "measured 0", hasData: true, state: "measured", value: 0, message: null, drawn: /^0/ },
    {
        name: "unknown_no_incident_evidence",
        hasData: false,
        state: "unknown_no_incident_evidence",
        value: 0,
        message: NO_INCIDENT_DATA,
    },
    {
        name: "not_applicable_no_deployments",
        hasData: false,
        state: "not_applicable_no_deployments",
        value: 0,
        message: NO_DEPLOYMENTS,
    },
    // CHAOS-9074: why the PR rework ratio has no value.
    {
        name: "rework: measured 0",
        metric: "pr_rework_ratio",
        hasData: true,
        state: "measured",
        value: 0,
        message: null,
        drawn: /^0/,
    },
    {
        name: "rework: unknown_no_review_evidence",
        metric: "pr_rework_ratio",
        hasData: false,
        state: "unknown_no_review_evidence",
        value: 0,
        message: NO_REVIEW_DATA,
    },
    {
        name: "rework: not_applicable_no_rework_signal",
        metric: "pr_rework_ratio",
        hasData: false,
        state: "not_applicable_no_rework_signal",
        value: 0,
        message: NO_REWORK_SIGNAL,
    },
    {
        name: "rework: not_applicable_no_merged_pull_requests",
        metric: "pr_rework_ratio",
        hasData: false,
        state: "not_applicable_no_merged_pull_requests",
        value: 0,
        message: NO_MERGED_PULL_REQUESTS,
    },
    {
        name: "rework: unknown future state",
        metric: "pr_rework_ratio",
        hasData: false,
        state: "something_new",
        value: 0,
        message: NO_DATA_FOR_WINDOW,
    },
    {
        name: "null state, no data",
        hasData: false,
        state: null,
        value: 0,
        message: NO_DATA_FOR_WINDOW,
    },
    {
        name: "unknown future state, no data",
        hasData: false,
        state: "something_new",
        value: 0,
        message: NO_DATA_FOR_WINDOW,
    },
    // An API before this change: no flag, no state. It reads as data, exactly as before.
    { name: "field absent", value: 4, message: null, drawn: /4/ },
];

function expectSlot(slot: HTMLElement, c: Case) {
    if (c.message === null) {
        expect(slot).toHaveAttribute("data-value-kind", "value");
        expect(slot).toHaveTextContent(c.drawn as RegExp);
    } else {
        expect(slot).toHaveAttribute("data-value-kind", "message");
        expect(slot).toHaveTextContent(c.message);
        expect(slot.textContent).not.toMatch(/\b0\s*%|^0/);
        expect(slot.textContent).not.toContain("unknown_no_incident");
        expect(slot.textContent).not.toContain("something_new");
    }
}

describe("noDataText: the one mapping", () => {
    it("maps the ruled states and falls back for null, absent and unknown", () => {
        expect(noDataText("change_failure_rate", "unknown_no_incident_evidence")).toBe(
            "No incident data for this window",
        );
        expect(noDataText("change_failure_rate", "not_applicable_no_deployments")).toBe(
            "No deployments in this window",
        );
        expect(noDataText("pr_rework_ratio", "unknown_no_review_evidence")).toBe(
            "No review data for this window",
        );
        expect(noDataText("pr_rework_ratio", "not_applicable_no_rework_signal")).toBe(
            "Rework is not measurable for this provider",
        );
        expect(noDataText("pr_rework_ratio", "not_applicable_no_merged_pull_requests")).toBe(
            "No merged pull requests in this window",
        );
        expect(noDataText("pr_rework_ratio", "something_new")).toBe("No data for this window");
        expect(noDataText("change_failure_rate", null)).toBe("No data for this window");
        expect(noDataText("change_failure_rate", undefined)).toBe("No data for this window");
        expect(noDataText("change_failure_rate", "something_new")).toBe("No data for this window");
        expect(noDataText("change_failure_rate", "constructor")).toBe("No data for this window");
        expect(noDataText("revert_rate", null)).toBe("Not measured yet");
        expect(NOT_MEASURED_YET).toBe("Not measured yet");
    });
});

describe("operating review tile", () => {
    const metric = (c: Case): OperatingReviewMetric => ({
        key: c.metric ?? "change_failure_rate",
        label: "Metric",
        value: c.value,
        unit: "ratio",
        ...(c.hasData === undefined ? {} : { hasData: c.hasData }),
        ...(c.state === undefined ? {} : { rateState: c.state }),
        delta: {
            value: c.value,
            priorValue: 0.5,
            absolute: 0,
            percent: 0,
            status: "",
            hasPriorData: true,
        },
    });
    it.each(CASES)("$name", (c) => {
        render(<MetricTile metric={metric(c)} narrow={false} />);
        expectSlot(screen.getByTestId("metric-value"), c);
    });

    it("a not-measured state is no value even when the flag is missing", () => {
        render(
            <MetricTile
                metric={metric({
                    name: "x",
                    state: "unknown_no_incident_evidence",
                    value: 0,
                    message: NO_INCIDENT_DATA,
                })}
                narrow={false}
            />,
        );
        expect(screen.getByTestId("metric-value")).toHaveTextContent(NO_INCIDENT_DATA);
    });

    it("revert_rate says Not measured yet; deployment_failure_rate draws its value", () => {
        const revert: OperatingReviewMetric = {
            key: "revert_rate",
            label: "Revert rate",
            value: 0,
            unit: "ratio",
            hasData: false,
            delta: {
                value: 0,
                priorValue: 0,
                absolute: 0,
                percent: 0,
                status: "",
                hasPriorData: false,
            },
        };
        const { unmount } = render(<MetricTile metric={revert} narrow={false} />);
        expect(screen.getByTestId("metric-value")).toHaveTextContent("Not measured yet");
        unmount();
        render(
            <MetricTile
                metric={{
                    ...revert,
                    key: "deployment_failure_rate",
                    label: "Deployment failure rate",
                    value: 0.1,
                    hasData: true,
                }}
                narrow={false}
            />,
        );
        expect(screen.getByTestId("metric-value")).toHaveAttribute("data-value-kind", "value");
        expect(screen.getByText("Deployment failure rate")).toBeInTheDocument();
    });
});

describe("Home card", () => {
    const row = (c: Case): MetricDelta => ({
        metric: "change_failure_rate",
        label: "Metric",
        value: c.value,
        unit: "%",
        delta_pct: 0,
        ...(c.hasData === undefined ? {} : { has_data: c.hasData }),
        ...(c.state === undefined ? {} : { rate_state: c.state }),
        spark: [],
    });
    // The Home monitoring groups do not hold the PR rework ratio: those cases are not drawn here.
    it.each(CASES.filter((c) => !c.metric))("$name", (c) => {
        const home = {
            freshness: { last_ingested_at: null, sources: {}, coverage: {} },
            deltas: [row(c)],
            summary: [],
            tiles: {},
            constraint: { title: "", claim: "", evidence: [], experiments: [] },
            events: [],
        } as unknown as HomeResponse;
        render(
            <HomeMonitoring
                home={home}
                filters={filters}
                activeRole="em"
                lensId="em"
                initialView="dora"
            />,
        );
        expectSlot(
            within(screen.getByTestId("monitoring-tile-change_failure_rate")).getByTestId(
                "metric-value",
            ),
            c,
        );
    });
});
