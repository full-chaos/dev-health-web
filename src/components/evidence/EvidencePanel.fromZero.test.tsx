import { render, screen, waitFor } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";

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

const contrib = (id: string, over: object) => ({
    id,
    label: id,
    value: 7,
    delta_pct: 4,
    evidence_link: "/x",
    ...over,
});

const explain = (over: object) => ({
    metric: "churn_loc",
    label: "Churn LOC",
    unit: "loc",
    value: 5,
    delta_pct: null,
    has_data: true,
    has_prior_data: true,
    drivers: [],
    contributors: [],
    drilldown_links: {},
    ...over,
});

const drawn = async (payload: object) => {
    mockGetExplainData.mockResolvedValue(payload);
    const view = render(
        <EvidencePanel
            isOpen
            onCloseAction={() => undefined}
            title="Churn LOC"
            metric="churn_loc"
            filters={filters}
        />,
    );
    await waitFor(() => expect(screen.getByTestId("evidence-metric-facts")).toBeInTheDocument());
    return view;
};

const NEVER = /NaN|null|held steady/;

beforeEach(() => mockGetExplainData.mockReset());

// CHAOS-9069: the explain panel tells a number, no prior data and a change from zero apart.
describe("explain panel change from zero", () => {
    it("top-level change: '+5 LOC from 0', no percent", async () => {
        await drawn(explain({}));
        const facts = screen.getByTestId("evidence-metric-facts");
        expect(facts).toHaveTextContent("Change");
        expect(facts).toHaveTextContent("+5 LOC from 0");
        expect(facts.textContent).not.toMatch(NEVER);
        expect(facts.textContent).not.toContain("0%");
    });

    it("flags absent: still from zero", async () => {
        await drawn(explain({ has_data: undefined, has_prior_data: undefined }));
        expect(screen.getByTestId("evidence-metric-facts")).toHaveTextContent("+5 LOC from 0");
    });

    it("a served 0: 0%", async () => {
        await drawn(explain({ delta_pct: 0 }));
        expect(screen.getByTestId("evidence-metric-facts")).toHaveTextContent("0%");
    });

    it("a number: as today", async () => {
        await drawn(explain({ delta_pct: -50 }));
        expect(screen.getByTestId("evidence-metric-facts")).toHaveTextContent("-50%");
    });

    it("no prior: no change text", async () => {
        await drawn(explain({ has_prior_data: false }));
        const facts = screen.getByTestId("evidence-metric-facts");
        expect(facts.textContent).not.toContain("from 0");
        expect(facts.textContent).not.toContain("0%");
    });

    it("driver and contributor rows: '(+7 LOC from 0)', never '(0%)'", async () => {
        const { container } = await drawn(
            explain({
                drivers: [contrib("drv-a", { delta_pct: null })],
                contributors: [
                    contrib("con-b", { delta_pct: null, value: -3 }),
                    contrib("con-c", { delta_pct: 0 }),
                    contrib("con-d", { delta_pct: null, has_prior_data: false }),
                ],
            }),
        );
        const text = container.ownerDocument.body.textContent ?? "";
        expect(text).toContain("(+7 LOC from 0)");
        expect(text).toContain("(-3 LOC from 0)");
        expect(text).toContain("(0%)");
        // con-d has no prior data: its note is empty, so (0%) occurs once only (con-c).
        expect(text.match(/\(0%\)/g)).toHaveLength(1);
        expect(text).not.toMatch(NEVER);
    });
});
