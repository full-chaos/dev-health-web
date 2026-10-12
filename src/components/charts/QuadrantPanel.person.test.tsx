import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { QuadrantPanel } from "./QuadrantPanel";

vi.mock("./QuadrantChart", () => ({
    QuadrantChart: () => <div data-testid="quadrant-chart" />,
}));

vi.mock("./InvestigationPanel", () => ({
    InvestigationPanel: () => <div data-testid="investigation-panel" />,
}));

const point = (
    entity_id: string,
    x: number,
    y: number,
    trajectory?: { x: number; y: number }[],
) => ({
    entity_id,
    entity_label: entity_id,
    x,
    y,
    window_start: "2026-01-05",
    window_end: "2026-01-12",
    evidence_link: `/evidence/${entity_id}`,
    trajectory: trajectory?.map((step, index) => ({
        ...step,
        window: `2026-01-0${index + 1}`,
    })),
});

const axes = {
    x: { metric: "churn", label: "Churn", unit: "loc" },
    y: { metric: "throughput", label: "Throughput", unit: "items" },
};

const filters = {
    scope: { level: "developer" as const, ids: ["me"] },
    window: { start: "2026-01-01", end: "2026-01-31" },
    time: { period: "30d" as const, range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
};

describe("QuadrantPanel person scope", () => {
    beforeAll(() => {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({
                matches: false,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }),
        });
    });

    it("never takes zone bands from other people's points", () => {
        render(
            <QuadrantPanel
                title="Churn x Throughput"
                description="Person quadrant"
                filters={filters}
                data={{
                    axes,
                    points: [
                        point("me", 10, 3),
                        point("other-1", 100, 30),
                        point("other-2", 400, 12),
                        point("other-3", 250, 25),
                    ],
                    annotations: [],
                }}
            />,
        );
        const toggle = screen.getByRole("checkbox", { name: /interpretive overlay/i });
        expect(toggle).toBeDisabled();
        expect(
            screen.getByText(/two or more distinct weeks in the selected range/i),
        ).toBeInTheDocument();
    });

    it("draws zone bands from the person's own weekly history", () => {
        render(
            <QuadrantPanel
                title="Churn x Throughput"
                description="Person quadrant"
                filters={filters}
                data={{
                    axes,
                    points: [
                        point("me", 40, 5, [
                            { x: 10, y: 2 },
                            { x: 25, y: 4 },
                            { x: 40, y: 5 },
                        ]),
                    ],
                    annotations: [],
                }}
            />,
        );
        expect(screen.getByRole("checkbox", { name: /interpretive overlay/i })).toBeEnabled();
    });
});
