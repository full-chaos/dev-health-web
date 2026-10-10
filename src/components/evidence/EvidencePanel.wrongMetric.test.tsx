/**
 * CHAOS-9137: the evidence drawer never draws an explain answer that is for another metric. The
 * REAL explain fetcher runs; only the transport is replaced. A refused metric (400) draws the
 * same empty state, not the drawer's load-error state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import { EvidencePanel } from "./EvidencePanel";

const { postJson } = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("@/lib/api/_shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/_shared")>()),
    postJson,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/investment",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const draw = (metric: string) =>
    render(
        <EvidencePanel
            isOpen
            onCloseAction={() => undefined}
            title="PR Rework Ratio"
            metric={metric}
            filters={filters}
        />,
    );

const cycleTimeAnswerFor = (metric: string) => ({
    metric,
    label: "Cycle Time",
    unit: "days",
    value: 4.2,
    delta_pct: -12,
    drivers: [],
    contributors: [{ id: "c1", label: "repo-gamma", value: 7, delta_pct: 1, evidence_link: "" }],
    drilldown_links: {},
});

beforeEach(() => {
    postJson.mockReset();
});

describe("EvidencePanel with an explain answer for another metric (CHAOS-9137)", () => {
    it("draws the empty state, not cycle_time's values", async () => {
        postJson.mockResolvedValue(cycleTimeAnswerFor("pr_rework_ratio"));
        draw("pr_rework_ratio");
        await waitFor(() => expect(screen.getByText("Nothing to show yet")).toBeInTheDocument());
        expect(screen.queryByText("repo-gamma")).toBeNull();
        expect(screen.queryByText(/Cycle Time/)).toBeNull();
    });

    it("draws the empty state for a refused metric (400), not the load-error state", async () => {
        postJson.mockImplementation(async () => {
            throw new Error("API error: 400");
        });
        draw("pr_rework_ratio");
        await waitFor(() => expect(screen.getByText("Nothing to show yet")).toBeInTheDocument());
        expect(screen.queryByTestId("evidence-error-state")).toBeNull();
    });

    it("still draws the load-error state for a server failure (500)", async () => {
        postJson.mockImplementation(async () => {
            throw new Error("API error: 500");
        });
        draw("pr_rework_ratio");
        await waitFor(() => expect(screen.getByTestId("evidence-error-state")).toBeInTheDocument());
    });

    it("draws an answer for the requested metric as before", async () => {
        postJson.mockResolvedValue(cycleTimeAnswerFor("cycle_time"));
        draw("cycle_time");
        await waitFor(() => expect(screen.getByText("repo-gamma")).toBeInTheDocument());
    });
});
