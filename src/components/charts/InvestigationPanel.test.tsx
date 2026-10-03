import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lensContext.client", () => ({ useActiveRole: () => undefined }));

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import type { QuadrantResponse } from "@/lib/types";

import { InvestigationPanel } from "./InvestigationPanel";

/**
 * CHAOS-7761: the investigation panel's paths and summary (decisions L1 = A, L2 = A). Invented entity.
 * CHAOS-8060: the panel is the body of the shared evidence drawer (no header or close of its own).
 */
const filters = {
    scope: { level: "team", ids: ["t1"] },
    time: { range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as unknown as MetricFilter;
const point = {
    entity_id: "t1",
    entity_label: "Team Alpha",
    x: 4,
    y: 9,
    window_start: "2026-06-01",
    window_end: "2026-09-01",
    evidence_link: "/explore",
};
const data: QuadrantResponse = {
    axes: {
        x: { metric: "cycle_time", label: "Cycle Time", unit: "days" },
        y: { metric: "throughput", label: "Throughput", unit: "items" },
    },
    points: [point],
    annotations: [],
};

describe("InvestigationPanel", () => {
    it("keeps the six investigation paths", () => {
        render(<InvestigationPanel point={point} data={data} filters={filters} />);
        expect(screen.getByText("Explain this state")).toBeInTheDocument();
        expect(screen.getByText("View related patterns")).toBeInTheDocument();
        expect(screen.getByText("View time breakdown")).toBeInTheDocument();
        expect(screen.getByText("View flow")).toBeInTheDocument();
        const links = screen.getAllByRole("link");
        expect(links).toHaveLength(6);
    });

    it("L2: the two association paths have distinct labels and keep their targets", () => {
        render(<InvestigationPanel point={point} data={data} filters={filters} />);
        const throughput = screen.getByRole("link", { name: /Inspect throughput breakdown/u });
        const hotspots = screen.getByRole("link", { name: /Inspect code hotspots/u });
        expect(throughput.getAttribute("href")).toContain("mode=throughput");
        expect(hotspots.getAttribute("href")).toContain("mode=code_hotspots");
        expect(screen.queryByText("Inspect associations")).toBeNull();
    });

    it("L1: no fixed WIP concentration / Flow constraint tags; the summary text stays", () => {
        render(<InvestigationPanel point={point} data={data} filters={filters} />);
        expect(screen.queryByText("WIP concentration")).toBeNull();
        expect(screen.queryByText("Flow constraint")).toBeNull();
        expect(screen.getByText("Summary")).toBeInTheDocument();
        expect(
            screen.getByText("Team Alpha", { selector: "span.font-semibold" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/during the window of 2026-06-01 to 2026-09-01/u),
        ).toBeInTheDocument();
    });

    it("has no header, close button or panel chrome of its own (the drawer supplies them)", () => {
        render(<InvestigationPanel point={point} data={data} filters={filters} />);
        const body = screen.getByTestId("investigation-panel");
        expect(body.querySelector("header")).toBeNull();
        expect(body.querySelector("footer")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.queryByText("Investigation")).toBeNull();
        // The lens line stays.
        expect(screen.getByText(/^Lens: /u, { selector: "p" })).toBeInTheDocument();
    });
});
