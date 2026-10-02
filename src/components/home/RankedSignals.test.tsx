import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, waitFor, within } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitSignal, MetricDelta } from "@/lib/types";

import {
    RANKED_SIGNALS_FIRST_ROWS,
    RANKED_SIGNALS_NONE,
    RANKED_SIGNALS_NOTE,
    RANKED_SIGNALS_NO_OTHER,
    RankedSignals,
} from "./RankedSignals";

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const makeSignal = (overrides: Partial<CockpitSignal> = {}): CockpitSignal => ({
    id: "metric:review_latency",
    title: "Review Latency appears up",
    metric: "review_latency",
    severity: "high",
    confidence: "medium",
    affected_scope: "3 repos · payments",
    evidence_count: 7,
    current_value: "0.9 hours",
    prior_value: "0.1 hours",
    delta: "+1,041%",
    direction: "up",
    category: "delivery",
    why_it_matters: "Longer reviews suggest delivery may wait on review capacity.",
    recommended_action: "Rebalance reviewer rotation.",
    evidence_ref: "/api/home/explain/review_latency",
    ...overrides,
});

/** A metric signal, as the API builds one from a served delta. */
const metric = (key: string, label: string, overrides: Partial<CockpitSignal> = {}) =>
    makeSignal({
        id: `metric:${key}`,
        title: `${label} appears up`,
        metric: key,
        evidence_ref: `/api/home/explain/${key}`,
        ...overrides,
    });

/** A risk signal about one entity: metric key `compounding_risk`, a current value only. */
const risk = (entity: string) =>
    makeSignal({
        id: `risk:repo:${entity}`,
        title: `Compounding risk appears elevated for ${entity}`,
        metric: "compounding_risk",
        current_value: "63.9 %",
        prior_value: null,
        delta: null,
        direction: "flat",
        confidence: "low",
        evidence_ref: null,
    });

/** A recommendation signal: metric = a rule id, a reference count only. */
const recommendation = makeSignal({
    id: "recommendation:review-rotation:team-1",
    title: "Review rotation appears uneven",
    metric: "review-rotation",
    current_value: "3 refs",
    prior_value: null,
    delta: null,
    direction: "flat",
});

const hero = metric("review_latency", "Review Latency");
const churn = metric("churn", "Code Churn", {
    current_value: "1,320,441 LOC",
    prior_value: "759,376 LOC",
    delta: "+74%",
    why_it_matters: "Higher churn suggests more rework.",
    recommended_action: "Inspect the files with the most rework.",
});
const throughput = metric("throughput", "Throughput", {
    title: "Throughput appears down",
    current_value: "181 items",
    prior_value: "384 items",
    delta: "-53%",
    direction: "down",
});

const METRICS: Array<[string, string]> = [
    ["review_latency", "Review Latency"],
    ["churn", "Code Churn"],
    ["throughput", "Throughput"],
    ["cycle_time", "Cycle Time"],
    ["deploy_freq", "Deploy Frequency"],
    ["wip_saturation", "WIP Saturation"],
    ["ci_success", "CI Success Rate"],
    ["rework_ratio", "Rework Ratio"],
    ["blocked_work", "Blocked Work"],
];

/** The served deltas: the API builds one metric signal per delta, and serves its label here. */
const deltas: MetricDelta[] = METRICS.map(([key, label]) => ({
    metric: key,
    label,
    value: 1,
    unit: "",
    delta_pct: 1,
    spark: [],
}));

/** The hero and eight more metric signals, in the served order of METRICS. */
const nineMetricSignals = METRICS.map(([key, label]) => metric(key, label));

const draw = (signals: CockpitSignal[], served: MetricDelta[] = deltas) =>
    render(<RankedSignals signals={signals} deltas={served} filters={filters} />);

const cellsOf = (row: HTMLElement) =>
    within(row)
        .getAllByRole("cell")
        .map((cell) => (cell.textContent ?? "").trim());

const labels = () => screen.getAllByTestId("signal-label").map((el) => el.textContent);

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// The ranked signals table of Home (CHAOS-8063): approved prototype `table(...)`, `app.js:100`.
describe("RankedSignals table", () => {
    it("is a table with the approved columns and an action column", () => {
        draw([hero, churn, throughput]);

        expect(screen.getByRole("heading", { name: "Ranked signals" })).toBeInTheDocument();
        const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
        expect(headers).toEqual(["Signal", "Current", "Previous", "Change", "Actions"]);
        expect(screen.queryByTestId("signal-card")).toBeNull();
    });

    it("lists the metric signals AFTER the primary one, in the served order, as served", () => {
        draw([hero, churn, throughput]);

        const rows = screen.getAllByTestId("signal-row");
        expect(rows).toHaveLength(2);
        // The change is the served string with its own sign: no glyph is added.
        expect(cellsOf(rows[0])).toEqual([
            "Code Churn",
            "1,320,441 LOC",
            "759,376 LOC",
            "+74%",
            "Evidence",
        ]);
        expect(cellsOf(rows[1])).toEqual([
            "Throughput",
            "181 items",
            "384 items",
            "-53%",
            "Evidence",
        ]);
        // The primary signal is the hero above the table, not a row.
        expect(screen.getByTestId("ranked-signals")).not.toHaveTextContent("Review Latency");
    });

    it("holds only METRIC signals: a risk or a recommendation signal is not a row", () => {
        draw([hero, risk("payments-api"), churn, recommendation, risk("billing-api"), throughput]);

        expect(labels()).toEqual(["Code Churn", "Throughput"]);
        const table = screen.getByTestId("ranked-signals");
        expect(table).not.toHaveTextContent("Compounding risk");
        expect(table).not.toHaveTextContent("Review rotation");
        expect(table).not.toHaveTextContent("63.9 %");
    });

    it("tells the kind by the served metric key against the served deltas, not by the title", () => {
        // A metric signal whose title reads like a risk claim stays a row; a signal whose
        // metric key is not a served delta is not a row, whatever its title says.
        const oddTitle = metric("churn", "Code Churn", {
            title: "Compounding risk appears elevated for payments-api",
        });
        const notServed = metric("lead_time", "Lead Time", { title: "Code Churn appears up" });
        draw([hero, oddTitle, notServed]);
        expect(labels()).toEqual(["Code Churn"]);
        expect(screen.getAllByTestId("signal-row")).toHaveLength(1);
    });

    it("keeps every metric row when the primary signal is a risk signal", () => {
        draw([risk("payments-api"), hero, churn]);
        expect(labels()).toEqual(["Review Latency", "Code Churn"]);
    });

    it("names a metric signal with the label the API served for it in deltas", () => {
        draw(
            [hero, churn],
            [
                {
                    metric: "churn",
                    label: "Served Churn Name",
                    value: 1,
                    unit: "loc",
                    delta_pct: 1,
                    spark: [],
                },
            ],
        );
        expect(labels()).toEqual(["Served Churn Name"]);
    });

    it("reads Not reported for a previous value or a change the API did not serve", () => {
        draw([hero, { ...churn, prior_value: null, delta: null }]);
        const row = screen.getByTestId("signal-row");
        expect(within(row).getByTestId("signal-previous").textContent).toBe("Not reported");
        expect(within(row).getByTestId("signal-delta").textContent).toBe("Not reported");
        // The served current value stays as served.
        expect(within(row).getByTestId("signal-current").textContent).toBe("1,320,441 LOC");
    });

    it("adds no good or bad colour to the change", () => {
        draw([hero, churn, throughput]);
        for (const delta of screen.getAllByTestId("signal-delta")) {
            expect(delta.className).not.toMatch(/accent|positive|negative|caution/);
        }
        expect(screen.getByText(RANKED_SIGNALS_NOTE)).toBeInTheDocument();
    });

    it("shows one plain line, and no table, when no metric signal follows the primary one", () => {
        const { unmount } = draw([hero]);
        expect(screen.getByTestId("ranked-signals-empty").textContent).toBe(
            RANKED_SIGNALS_NO_OTHER,
        );
        expect(screen.queryByRole("table")).toBeNull();
        unmount();

        // Risk signals alone give no row either.
        draw([hero, risk("payments-api")]);
        expect(screen.getByTestId("ranked-signals-empty").textContent).toBe(
            RANKED_SIGNALS_NO_OTHER,
        );
    });

    it("shows a line that implies no clean bill of health when no signal is served", () => {
        draw([]);
        expect(screen.getByTestId("ranked-signals-empty").textContent).toBe(RANKED_SIGNALS_NONE);
        expect(screen.getByTestId("ranked-signals")).not.toHaveTextContent(/healthy|all clear/i);
    });
});

describe("RankedSignals first five rows and 'Show all signals'", () => {
    it("shows the first five rows and one control that names the count of all rows", () => {
        draw(nineMetricSignals);

        expect(RANKED_SIGNALS_FIRST_ROWS).toBe(5);
        expect(labels()).toEqual([
            "Code Churn",
            "Throughput",
            "Cycle Time",
            "Deploy Frequency",
            "WIP Saturation",
        ]);
        const toggle = screen.getByTestId("ranked-signals-toggle");
        // Eight metric rows follow the hero: the count is of served rows, hidden ones included.
        expect(toggle).toHaveTextContent("Show all signals (8)");
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByText(RANKED_SIGNALS_NOTE)).toBeInTheDocument();
    });

    it("expands the rest in place, in the served order, and folds back", async () => {
        draw(nineMetricSignals);
        const toggle = screen.getByTestId("ranked-signals-toggle");

        await userEvent.click(toggle);
        expect(labels()).toEqual(METRICS.slice(1).map(([, label]) => label));
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(toggle).toHaveTextContent("Show fewer signals");
        // In place: every row has its Evidence action, and the note line stays.
        expect(screen.getAllByTestId("signal-open-evidence")).toHaveLength(8);
        expect(screen.getByText(RANKED_SIGNALS_NOTE)).toBeInTheDocument();

        await userEvent.click(toggle);
        expect(screen.getAllByTestId("signal-row")).toHaveLength(5);
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("has no control when five rows or fewer are served", () => {
        // The hero and exactly five rows.
        draw(nineMetricSignals.slice(0, 6));
        expect(screen.getAllByTestId("signal-row")).toHaveLength(5);
        expect(screen.queryByTestId("ranked-signals-toggle")).toBeNull();
    });

    it("counts metric rows only: risk signals do not raise the count or the rows", () => {
        draw([...nineMetricSignals.slice(0, 6), risk("a"), risk("b"), risk("c")]);
        expect(screen.getAllByTestId("signal-row")).toHaveLength(5);
        expect(screen.queryByTestId("ranked-signals-toggle")).toBeNull();
    });
});

describe("RankedSignals evidence", () => {
    it("each row's Evidence opens the shared drawer for THAT signal, populated via evidence_ref", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        metric: "throughput",
                        label: "Throughput",
                        value: 181,
                        unit: "items",
                        delta_pct: -53,
                        summary: "Throughput appears lower in this window.",
                        evidence: [
                            {
                                id: "PR-1",
                                title: "Shorten review queue",
                                url: "/prs/PR-1",
                                type: "pr",
                                meta: "merged in 2d",
                            },
                        ],
                        actions: [],
                        provenance: {
                            source: "workGraphEdges",
                            quality: "high",
                            last_sync: "2026-05-20T00:00:00Z",
                            identity_confidence: 0.92,
                        },
                    }),
            }),
        );

        draw([hero, churn, throughput]);

        const buttons = screen.getAllByTestId("signal-open-evidence");
        expect(buttons).toHaveLength(2);
        // Each button names its own signal for assistive technology.
        expect(buttons[1]).toHaveAccessibleName("Evidence: Throughput appears down");
        await userEvent.click(buttons[1]);

        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        // The served signal title is the subject of the drawer.
        expect(within(drawer).getByTestId("evidence-subject")).toHaveTextContent(
            "Throughput appears down",
        );
        // The signal's served why and action are read here, not in the page body.
        expect(within(drawer).getByTestId("signal-why")).toHaveTextContent(
            "Longer reviews suggest delivery may wait on review capacity.",
        );
        expect(within(drawer).getByTestId("signal-recommended-action")).toHaveTextContent(
            "Rebalance reviewer rotation.",
        );
        await waitFor(() =>
            expect(within(drawer).getByTestId("evidence-facts")).toBeInTheDocument(),
        );
        // Populated with a real artifact, not an empty drawer.
        expect(within(drawer).getByText("Shorten review queue")).toBeInTheDocument();
        expect(within(drawer).getByTestId("evidence-facts")).toHaveTextContent("workGraphEdges");
        expect(global.fetch).toHaveBeenCalledWith("/api/home/explain/throughput");
    });

    it("keeps the why and the recommended action out of the page body", () => {
        draw([hero, churn]);
        const body = screen.getByTestId("ranked-signals");
        expect(body).not.toHaveTextContent("Higher churn suggests more rework.");
        expect(body).not.toHaveTextContent("Inspect the files with the most rework.");
    });
});
