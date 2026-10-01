import { render, screen } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatMetricValue } from "@/lib/formatters";
import { buildExploreUrl } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { sortDeltasByRole } from "@/lib/metrics/catalog";
import type { HomeResponse, MetricDelta } from "@/lib/types";

import { CockpitClient } from "./CockpitClient";

// Pin tests for the Key Shifts tiles (CHAOS-7738, 5.1b): written green on the code before the
// Monitoring / Key Shifts restyle and kept green after it.

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/",
}));

afterEach(() => {
    vi.restoreAllMocks();
});

const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const delta = (
    metric: string,
    label: string,
    value: number,
    unit: string,
    delta_pct: number,
): MetricDelta => ({ metric, label, value, unit, delta_pct, spark: [] });

const DELTAS: MetricDelta[] = [
    delta("cycle_time", "Cycle Time", 48, "hours", -12),
    delta("review_latency", "Review Latency", 6, "hours", -5),
    delta("wip", "WIP", 8, "items", 10),
    delta("churn", "Code Churn", 18, "%", 3),
    delta("throughput", "Throughput", 120, "items", 7),
    delta("deploy_freq", "Deploy Frequency", 14, "deploys", 22),
    delta("wip_saturation", "WIP Saturation", 90, "%", 4),
    delta("change_failure_rate", "Change Failure Rate", 5, "%", -2),
    delta("blocked_work", "Blocked Work", 3, "items", 1),
    delta("lead_time", "Lead Time", 9, "days", 6),
];

const makeHome = (deltas: MetricDelta[] = DELTAS): HomeResponse =>
    ({
        freshness: {
            last_ingested_at: null,
            sources: {},
            coverage: {
                repos_covered_pct: 0,
                prs_linked_to_issues_pct: 0,
                issues_with_cycle_states_pct: 0,
            },
        },
        deltas,
        summary: [],
        tiles: {},
        constraint: { title: "", claim: "", evidence: [], experiments: [] },
        events: [],
    }) as HomeResponse;

const tiles = () => [...screen.getByTestId("key-shifts-grid").querySelectorAll("a")];
const labelOf = (a: Element) => a.querySelector("p")?.textContent ?? "";

describe("Key Shifts tiles pinned (CHAOS-7738)", () => {
    it.each(["ic", "em", "pm", "leadership", "neutral"])(
        "%s: the tiles follow sortDeltasByRole, in full order, and no more than eight",
        (role) => {
            render(<CockpitClient home={makeHome()} filters={filters} activeRole={role} />);
            const expected = sortDeltasByRole(DELTAS, role)
                .slice(0, 8)
                .map((d) => d.label);
            expect(tiles().map(labelOf)).toEqual(expected);
            expect(tiles()).toHaveLength(8);
        },
    );

    it("shows every delta when there are fewer than eight", () => {
        render(
            <CockpitClient home={makeHome(DELTAS.slice(0, 3))} filters={filters} activeRole="ic" />,
        );
        expect(tiles()).toHaveLength(3);
    });

    it("each tile value is formatMetricValue(value, unit)", () => {
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="em" />);
        for (const d of sortDeltasByRole(DELTAS, "em").slice(0, 8)) {
            const tile = tiles().find((a) => labelOf(a) === d.label);
            expect(tile).toBeTruthy();
            expect(tile?.textContent).toContain(formatMetricValue(d.value, d.unit));
        }
    });

    it("polarity: for a lower-is-better metric an increase is the bad tone, for higher-is-better the good tone", () => {
        const home = makeHome([
            delta("cycle_time", "Cycle Time", 48, "hours", 12),
            delta("deploy_freq", "Deploy Frequency", 14, "deploys", 12),
        ]);
        render(<CockpitClient home={home} filters={filters} activeRole="ic" />);
        const cycle = tiles().find((a) => labelOf(a) === "Cycle Time") as Element;
        const deploy = tiles().find((a) => labelOf(a) === "Deploy Frequency") as Element;
        const tone = (tile: Element) => tile.querySelector("span.inline-flex") as HTMLElement;
        expect(tone(cycle)).toHaveClass("text-(--accent-negative)");
        expect(tone(deploy)).toHaveClass("text-(--positive)");
        // The sign and the arrow are text, so the tone is never the only signal.
        expect(tone(cycle).textContent).toBe("↑ +12%");
        expect(tone(deploy).textContent).toBe("↑ +12%");
    });

    it("polarity: a decrease flips the tones, and zero is muted with no arrow", () => {
        const home = makeHome([
            delta("cycle_time", "Cycle Time", 48, "hours", -12),
            delta("deploy_freq", "Deploy Frequency", 14, "deploys", -12),
            delta("churn", "Code Churn", 18, "%", 0),
        ]);
        render(<CockpitClient home={home} filters={filters} activeRole="ic" />);
        const tone = (label: string) =>
            tiles()
                .find((a) => labelOf(a) === label)
                ?.querySelector("span.inline-flex") as HTMLElement;
        expect(tone("Cycle Time")).toHaveClass("text-(--positive)");
        expect(tone("Deploy Frequency")).toHaveClass("text-(--accent-negative)");
        expect(tone("Code Churn")).toHaveClass("text-(--ink-muted)");
        expect(tone("Code Churn").textContent).not.toMatch(/↑|↓/);
    });

    it("a delta that cannot be computed is the labelled 'No prior period' state, never 0%", () => {
        const home = makeHome([delta("cycle_time", "Cycle Time", 48, "hours", Number.NaN)]);
        render(<CockpitClient home={home} filters={filters} activeRole="ic" />);
        const text = tiles()[0].textContent ?? "";
        expect(text).toContain("No prior period");
        expect(text).not.toContain("0%");
    });

    it("each tile links to its evidence page with metric, role and the filter", () => {
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="pm" />);
        for (const d of sortDeltasByRole(DELTAS, "pm").slice(0, 8)) {
            const tile = tiles().find((a) => labelOf(a) === d.label);
            expect(tile).toHaveAttribute(
                "href",
                buildExploreUrl({ metric: d.metric, filters, role: "pm" }),
            );
        }
    });

    it("the section 'Open evidence' link carries the role and the filter but no metric", () => {
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="pm" />);
        const row = screen.getByTestId("key-shifts-row");
        const link = [...row.querySelectorAll("a")].find((a) => a.textContent === "Open evidence");
        expect(link).toHaveAttribute("href", buildExploreUrl({ filters, role: "pm" }));
        expect(link?.getAttribute("href")).not.toContain("metric=");
    });

    it("keeps the heading, the subtitle and the test ids; the grid holds only tile links", () => {
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="ic" />);
        const row = screen.getByTestId("key-shifts-row");
        expect(row).toHaveTextContent("Key Shifts");
        expect(row).toHaveTextContent("Metric movements ordered for your role.");
        const grid = screen.getByTestId("key-shifts-grid");
        expect(grid.querySelectorAll("a").length).toBe(grid.querySelectorAll("*[href]").length);
    });
});
