import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, waitFor, within } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitSignal } from "@/lib/types";

import {
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

const hero = makeSignal();
const churn = makeSignal({
    id: "metric:churn",
    title: "Code Churn appears up",
    metric: "churn",
    current_value: "1,320,441 LOC",
    prior_value: "759,376 LOC",
    delta: "+74%",
    direction: "up",
    why_it_matters: "Higher churn suggests more rework.",
    recommended_action: "Inspect the files with the most rework.",
    evidence_ref: "/api/home/explain/churn",
});
const throughput = makeSignal({
    id: "metric:throughput",
    title: "Throughput appears down",
    metric: "throughput",
    current_value: "181 items",
    prior_value: "384 items",
    delta: "-53%",
    direction: "down",
    evidence_ref: "/api/home/explain/throughput",
});

/** The served deltas: the API builds one metric signal per delta, and serves its label here. */
const deltas = [
    { metric: "review_latency", label: "Review Latency" },
    { metric: "churn", label: "Code Churn" },
    { metric: "throughput", label: "Throughput" },
].map((d) => ({ ...d, value: 1, unit: "", delta_pct: 1, spark: [] }));

const cellsOf = (row: HTMLElement) =>
    within(row)
        .getAllByRole("cell")
        .map((cell) => (cell.textContent ?? "").trim());

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// The ranked signals table of Home (CHAOS-8063): approved prototype `table(...)`, `app.js:100`.
describe("RankedSignals table", () => {
    it("is a table with the approved columns and an action column", () => {
        render(<RankedSignals signals={[hero, churn, throughput]} filters={filters} />);

        expect(screen.getByRole("heading", { name: "Ranked signals" })).toBeInTheDocument();
        const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
        expect(headers).toEqual(["Signal", "Current", "Previous", "Change", "Actions"]);
        expect(screen.queryByTestId("signal-card")).toBeNull();
    });

    it("lists the signals AFTER the primary one, in the served order", () => {
        render(
            <RankedSignals signals={[hero, churn, throughput]} deltas={deltas} filters={filters} />,
        );

        const rows = screen.getAllByTestId("signal-row");
        expect(rows).toHaveLength(2);
        expect(cellsOf(rows[0])).toEqual([
            "Code Churn",
            "1,320,441 LOC",
            "759,376 LOC",
            "↑ +74%",
            "Evidence",
        ]);
        expect(cellsOf(rows[1])).toEqual([
            "Throughput",
            "181 items",
            "384 items",
            "↓ -53%",
            "Evidence",
        ]);
        // The primary signal is the hero above the table, not a row.
        expect(screen.getByTestId("ranked-signals")).not.toHaveTextContent("Review Latency");
    });

    it("names a metric signal with the label the API served for it in deltas", () => {
        render(
            <RankedSignals
                signals={[hero, churn]}
                deltas={[
                    {
                        metric: "churn",
                        label: "Served Churn Name",
                        value: 1,
                        unit: "loc",
                        delta_pct: 1,
                        spark: [],
                    },
                ]}
                filters={filters}
            />,
        );
        expect(screen.getByTestId("signal-label").textContent).toBe("Served Churn Name");
    });

    it("keeps the served title, uncut, for a signal about one entity, so two risk rows differ", () => {
        const risk = (entity: string) =>
            makeSignal({
                id: `risk:${entity}`,
                metric: "compounding_risk",
                title: `Compounding risk appears high for ${entity}`,
            });
        render(
            <RankedSignals
                signals={[hero, risk("payments-api"), risk("billing-api")]}
                deltas={deltas}
                filters={filters}
            />,
        );
        expect(screen.getAllByTestId("signal-label").map((el) => el.textContent)).toEqual([
            "Compounding risk appears high for payments-api",
            "Compounding risk appears high for billing-api",
        ]);
    });

    it("reads Not reported for a previous value or a change the API did not serve", () => {
        render(
            <RankedSignals
                signals={[hero, { ...churn, prior_value: null, delta: null }]}
                filters={filters}
            />,
        );
        const row = screen.getByTestId("signal-row");
        expect(within(row).getByTestId("signal-previous").textContent).toBe("Not reported");
        expect(within(row).getByTestId("signal-delta").textContent).toBe("Not reported");
        // The served current value stays as served.
        expect(within(row).getByTestId("signal-current").textContent).toBe("1,320,441 LOC");
    });

    it("adds no good or bad colour to the change", () => {
        render(<RankedSignals signals={[hero, churn, throughput]} filters={filters} />);
        for (const delta of screen.getAllByTestId("signal-delta")) {
            expect(delta.className).not.toMatch(/accent|positive|negative|caution/);
        }
        expect(screen.getByText(RANKED_SIGNALS_NOTE)).toBeInTheDocument();
    });

    it("shows one plain line, and no table, when only the primary signal is served", () => {
        render(<RankedSignals signals={[hero]} filters={filters} />);
        expect(screen.getByTestId("ranked-signals-empty").textContent).toBe(
            RANKED_SIGNALS_NO_OTHER,
        );
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("shows a line that implies no clean bill of health when no signal is served", () => {
        render(<RankedSignals signals={[]} filters={filters} />);
        expect(screen.getByTestId("ranked-signals-empty").textContent).toBe(RANKED_SIGNALS_NONE);
        expect(screen.getByTestId("ranked-signals")).not.toHaveTextContent(/healthy|all clear/i);
    });

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

        render(<RankedSignals signals={[hero, churn, throughput]} filters={filters} />);

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
        render(<RankedSignals signals={[hero, churn]} filters={filters} />);
        const body = screen.getByTestId("ranked-signals");
        expect(body).not.toHaveTextContent("Higher churn suggests more rework.");
        expect(body).not.toHaveTextContent("Inspect the files with the most rework.");
    });
});
