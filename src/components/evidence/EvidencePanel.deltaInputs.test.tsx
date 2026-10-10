import { render, screen, waitFor } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import {
    DELTA_INPUTS,
    FROM_ZERO_TEXT,
    NO_DATA_TEXT,
    NO_PRIOR_TEXT,
} from "@/lib/metrics/__tests__/deltaInputs.fixtures";

import { EvidencePanel } from "./EvidencePanel";

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
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

beforeEach(() => mockGetExplainData.mockReset());

const input = (name: string) => DELTA_INPUTS.find((i) => i.name.startsWith(name))!;

// CHAOS-9110: the top-level Change row and each driver / contributor row, for the four inputs.
describe("explain panel reads the no-data flags", () => {
    for (const row of DELTA_INPUTS) {
        it(`top-level Change row, ${row.name}`, async () => {
            mockGetExplainData.mockResolvedValue({
                metric: "churn_loc",
                label: "Churn LOC",
                unit: "loc",
                value: row.value,
                delta_pct: row.delta_pct,
                has_data: row.has_data,
                has_prior_data: row.has_prior_data,
                drivers: [],
                contributors: [],
                drilldown_links: {},
            });
            render(
                <EvidencePanel
                    isOpen
                    onCloseAction={() => undefined}
                    title="Churn LOC"
                    metric="churn_loc"
                    filters={filters}
                />,
            );
            await waitFor(() =>
                expect(screen.getByTestId("evidence-metric-facts")).toBeInTheDocument(),
            );
            const facts = screen.getByTestId("evidence-metric-facts").textContent ?? "";
            expect(facts).not.toMatch(/Not reported|0%|NaN|null/);
            if (row.state === "from-zero") expect(facts).toMatch(FROM_ZERO_TEXT);
            else if (row.state === "no-data") expect(facts).toContain(NO_DATA_TEXT);
            else expect(facts).toContain(NO_PRIOR_TEXT);
        });
    }

    it("driver and contributor rows, all four inputs", async () => {
        const rows = DELTA_INPUTS.map((row, i) => ({
            id: `row-${i}`,
            label: `row-${i}`,
            display_name: `Row ${i}`,
            value: row.value,
            delta_pct: row.delta_pct,
            has_data: row.has_data,
            has_prior_data: row.has_prior_data,
            evidence_link: "/x",
        }));
        mockGetExplainData.mockResolvedValue({
            metric: "churn_loc",
            label: "Churn LOC",
            unit: "loc",
            value: 9,
            delta_pct: 4,
            has_data: true,
            has_prior_data: true,
            drivers: rows,
            contributors: [],
            drilldown_links: {},
        });
        const { container } = render(
            <EvidencePanel
                isOpen
                onCloseAction={() => undefined}
                title="Churn LOC"
                metric="churn_loc"
                filters={filters}
            />,
        );
        await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
        const text = container.ownerDocument.body.textContent ?? "";
        expect(text).toMatch(FROM_ZERO_TEXT);
        expect(text).toContain(NO_DATA_TEXT);
        expect(text).toContain(NO_PRIOR_TEXT);
        // The placeholder 0 of a no-data or no-prior row is never a "(0%)" change.
        expect(text).not.toContain("(0%)");
        expect(input("b").state).toBe("no-data");
    });
});
