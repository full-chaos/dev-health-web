import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { QuadrantPanel } from "./QuadrantPanel";

// CHAOS-8060: a quadrant dot opens the ONE shared evidence drawer. The investigation content is
// the drawer body; the inline side panel is gone. Invented entities.

const chartProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));

// The echarts chart is replaced by one button per point that selects it, as a dot click does.
vi.mock("./QuadrantChart", () => ({
    QuadrantChart: (props: {
        data: QuadrantResponse;
        onPointSelectAction: (point: QuadrantPoint) => void;
    }) => {
        chartProps.last = props;
        return (
            <div data-testid="quadrant-chart">
                {props.data.points.map((point) => (
                    <button
                        key={point.entity_id}
                        type="button"
                        onClick={() => props.onPointSelectAction(point)}
                    >
                        dot {point.entity_label}
                    </button>
                ))}
            </div>
        );
    },
}));
vi.mock("@/lib/lensContext.client", () => ({ useActiveRole: () => undefined }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/landscape",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "team", ids: [] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as unknown as MetricFilter;

const point = (id: string, label: string, x: number, y: number): QuadrantPoint => ({
    entity_id: id,
    entity_label: label,
    x,
    y,
    window_start: "2026-06-01",
    window_end: "2026-09-01",
    evidence_link: `/api/v1/explain?metric=throughput&scope_id=${id}`,
});

const data: QuadrantResponse = {
    axes: {
        x: { metric: "cycle_time", label: "Cycle Time", unit: "days" },
        y: { metric: "throughput", label: "Throughput", unit: "items" },
    },
    points: [point("t1", "Team Alpha", 4.2, 18), point("t2", "Team Beta", 1.1, 7)],
    annotations: [],
};

const panel = () => (
    <QuadrantPanel
        title="Delivery landscape"
        description="Cycle time against throughput."
        data={data}
        filters={filters}
        showViewGuide={false}
    />
);

describe("QuadrantPanel evidence drawer", () => {
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
    beforeEach(() => {
        chartProps.last = null;
    });

    it("gives the chart the served points unchanged (coordinates stay as production draws them)", () => {
        render(panel());
        expect((chartProps.last?.data as QuadrantResponse).points).toEqual(data.points);
    });

    it("opens the shared drawer from a dot: the point is the subject and the investigation paths are the body", async () => {
        render(panel());
        expect(screen.queryByRole("dialog")).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "dot Team Alpha" }));

        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(drawer).getByTestId("evidence-subject")).toHaveTextContent("Team Alpha");
        const body = within(drawer).getByTestId("investigation-panel");
        expect(within(body).getAllByRole("link")).toHaveLength(6);
        expect(within(body).getByText("Explain this state")).toBeInTheDocument();
        // One path only: no inline side panel next to the chart.
        expect(document.querySelector("aside")).toBeNull();
        expect(screen.getAllByTestId("investigation-panel")).toHaveLength(1);
    });

    it("keeps the point's evidence link as the 'Explain this state' path", async () => {
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "dot Team Beta" }));

        const explain = screen.getByRole("link", { name: /Explain this state/u });
        const url = new URL(explain.getAttribute("href") ?? "", "http://local");
        expect(url.pathname).toBe("/explore");
        expect(url.searchParams.get("api")).toBe("/api/v1/explain?metric=throughput&scope_id=t2");
    });

    it("marks the point as selected while the drawer is open and clears it on close", async () => {
        render(panel());
        // Not selected: the chip is a button.
        const chip = () => screen.queryByRole("button", { name: "Team Alpha" });
        expect(chip()).not.toBeNull();

        await userEvent.click(chip() as HTMLElement);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        // Selected: the chip is plain text, not a button.
        expect(chip()).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(chip()).not.toBeNull();
    });

    it("replaces the subject when another dot is selected: still one drawer", async () => {
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "dot Team Alpha" }));
        await userEvent.click(screen.getByRole("button", { name: "dot Team Beta" }));

        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(screen.getByTestId("evidence-subject")).toHaveTextContent("Team Beta");
        // The first point is not selected any more.
        expect(screen.queryByRole("button", { name: "Team Alpha" })).not.toBeNull();
    });

    it("closes the drawer when the user follows an investigation path", async () => {
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "dot Team Alpha" }));
        const path = screen.getByRole("link", { name: /View flow/u });
        path.addEventListener("click", (event) => event.preventDefault());

        await userEvent.click(path);

        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
