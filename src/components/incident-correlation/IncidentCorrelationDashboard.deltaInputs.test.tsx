import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import type { MetricFilter } from "@/lib/filters/types";
import {
    DELTA_INPUTS,
    NO_DATA_TEXT,
    NO_PRIOR_TEXT,
} from "@/lib/metrics/__tests__/deltaInputs.fixtures";

import { IncidentCorrelationDashboard, type WorkGraphEdge } from "./IncidentCorrelationDashboard";

vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: () => <div />,
    buildSankeyAdapterData: () => ({ chartNodes: [], chartLinks: [] }),
}));
// The real hooks watch the theme through matchMedia, which jsdom lacks.
vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => ({ muted: "#777777", text: "#111111" }),
    useChartTokens: () => ({ caution: "#c98500", accentHighlight: "#e8650a" }),
    useChartColors: () => ["#1", "#2", "#3"],
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => <div /> }));
vi.mock("@/components/charts/TimeseriesChart", () => ({ TimeseriesChart: () => <div /> }));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

// CHAOS-9110: the Contributors list for each of the four served inputs.
describe("incident dashboard contributors read the no-data flags", () => {
    for (const unit of [undefined, "%"]) {
        for (const input of DELTA_INPUTS) {
            it(`${unit ? "with" : "without"} the explain unit: ${input.name}`, () => {
                renderWithEvidenceDrawer(
                    <IncidentCorrelationDashboard
                        orgId="org-test"
                        deltas={[]}
                        drivers={[]}
                        contributors={[
                            {
                                id: "c1",
                                label: "repo-one",
                                display_name: "repo-one",
                                evidence_link: "/e",
                                value: input.value,
                                delta_pct: input.delta_pct,
                                has_data: input.has_data,
                                has_prior_data: input.has_prior_data,
                            },
                        ]}
                        deploysEdges={[] as WorkGraphEdge[]}
                        incidentEdges={[] as WorkGraphEdge[]}
                        filters={filters}
                        explainUnit={unit}
                    />,
                );
                const row = screen.getByText("repo-one").closest("div")!;
                const text = row.textContent ?? "";
                expect(text).not.toMatch(/0%|NaN|null|Not reported/);
                if (input.state === "no-data") {
                    expect(text).toContain(NO_DATA_TEXT);
                    expect(text).not.toMatch(/(^|[^\d.])0\s*%/);
                } else if (unit) {
                    expect(text).toMatch(/5/);
                } else if (input.state === "from-zero") expect(text).toMatch(/\+5 from 0/);
                else expect(text).toContain(NO_PRIOR_TEXT);
            });
        }
    }
});
