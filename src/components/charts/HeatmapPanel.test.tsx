import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import { describeArtifact, HeatmapPanel } from "./HeatmapPanel";
import type { HeatmapResponse } from "@/lib/types";

// Stub the echarts-backed chart so the panel renders in jsdom without echarts.
const { chartProps } = vi.hoisted(() => ({ chartProps: vi.fn() }));
vi.mock("./HeatmapChart", () => ({
    HeatmapChart: (props: unknown) => {
        chartProps(props);
        return <div data-testid="heatmap-chart" />;
    },
}));

vi.mock("@/lib/api/visuals", () => ({
    getHeatmap: vi.fn(),
}));

const request = {
    type: "risk" as const,
    metric: "hotspot_risk",
    scope_type: "org",
    range_days: 30,
};

const baseResponse = (cells: HeatmapResponse["cells"]): HeatmapResponse => ({
    axes: { x: ["Mon", "Tue"], y: ["auth", "billing"] },
    cells,
    legend: { unit: "risk", scale: "linear" },
    evidence: [],
});

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("HeatmapPanel — axis captions on the hours by weekdays grid (CHAOS-8568)", () => {
    const data = baseResponse([
        { x: "Mon", y: "auth", value: 5 },
        { x: "Tue", y: "billing", value: 9 },
    ]);
    const draw = (type: "temporal_load" | "risk") =>
        render(
            <HeatmapPanel
                title="Review wait density"
                description="Find the hours."
                request={{ ...request, type, scope_type: "team" }}
                initialData={data}
            />,
        );

    it("captions the axes under the temporal grid", () => {
        draw("temporal_load");
        expect(screen.getByTestId("heatmap-axis-captions")).toHaveTextContent(
            "Hour of day · day of weekReview wait density · team scope",
        );
    });

    it("turns the weekHours layout on for the temporal grid only", () => {
        chartProps.mockClear();
        draw("temporal_load");
        expect((chartProps.mock.calls.at(-1)?.[0] as { weekHours?: boolean }).weekHours).toBe(true);
        chartProps.mockClear();
        draw("risk");
        expect((chartProps.mock.calls.at(-1)?.[0] as { weekHours?: boolean }).weekHours).toBe(
            false,
        );
    });

    it("draws no caption under another heatmap", () => {
        draw("risk");
        expect(screen.queryByTestId("heatmap-axis-captions")).toBeNull();
    });
});

describe("HeatmapPanel — hotspot evidence contract (CHAOS-2035)", () => {
    it("shows an explicit flat-data state instead of a uniform grid", () => {
        const data = baseResponse([
            { x: "Mon", y: "auth", value: 5 },
            { x: "Tue", y: "billing", value: 5 },
        ]);

        render(
            <HeatmapPanel
                title="Hotspot concentration"
                description="Where churn accumulates."
                request={request}
                initialData={data}
                flatStateLabel="No hotspot variance in this window"
            />,
        );

        expect(screen.getByTestId("heatmap-flat-state")).toHaveTextContent(
            "No hotspot variance in this window",
        );
        expect(screen.queryByTestId("heatmap-chart")).not.toBeInTheDocument();
    });

    it("shows the served unit in the head as an info pill (prototype pill('hours', 'info')), not caps text", () => {
        const data = {
            ...baseResponse([
                { x: "Mon", y: "auth", value: 5 },
                { x: "Tue", y: "billing", value: 9 },
            ]),
            legend: { unit: "hours", scale: "linear" as const },
        };
        render(
            <HeatmapPanel
                title="Review wait density"
                description="Where review wait accumulates."
                request={request}
                initialData={data}
            />,
        );
        const pill = screen.getByTestId("heatmap-unit");
        expect(pill.textContent).toBe("hours");
        expect(pill.className).toContain("bg-(--info-wash)");
        expect(pill.className).toContain("text-(--info)");
        expect(pill.className).not.toMatch(/uppercase|tracking-/u);
    });

    it("heads the evidence box in sentence case, not caps", () => {
        render(
            <HeatmapPanel
                title="Review wait density"
                description="Where review wait accumulates."
                request={request}
                initialData={baseResponse([
                    { x: "Mon", y: "auth", value: 5 },
                    { x: "Tue", y: "billing", value: 9 },
                ])}
                evidenceTitle="PR evidence"
            />,
        );
        const head = screen.getByTestId("heatmap-evidence-title");
        expect(head.textContent).toBe("PR evidence");
        expect(head.className).not.toMatch(/uppercase|tracking-/u);
    });

    it("renders a default summary and human-readable typed artifacts — never raw paths/UUIDs/JSON", () => {
        const data: HeatmapResponse = {
            ...baseResponse([
                { x: "Mon", y: "auth", value: 1 },
                { x: "Tue", y: "billing", value: 9 },
            ]),
            evidence: [
                {
                    path: "src/services/auth/login.ts",
                    value: 12,
                    ts: "2026-05-01T00:00:00Z",
                },
                { work_item_id: UUID },
            ],
        };

        render(
            <HeatmapPanel
                title="Hotspot concentration"
                description="Where churn accumulates."
                request={request}
                initialData={data}
                evidenceTitle="Hotspot evidence"
                defaultSummary="Leading hotspots: Auth Service. Higher values lean toward concentrated change."
            />,
        );

        // Variance present → the chart renders (not the flat state).
        expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
        expect(screen.queryByTestId("heatmap-flat-state")).not.toBeInTheDocument();

        // Default summary is shown before any cell is selected.
        expect(screen.getByText(/Leading hotspots: Auth Service/)).toBeInTheDocument();

        // File artifact: render-safe basename, full path only in the tooltip.
        const fileLabel = screen.getByText("login.ts");
        expect(fileLabel).toHaveAttribute("title", "src/services/auth/login.ts");
        expect(screen.queryByText("src/services/auth/login.ts")).not.toBeInTheDocument();

        // UUID work item degrades to a stable short label — never the bare UUID.
        expect(screen.getByText("#550e8400")).toBeInTheDocument();
        expect(screen.queryByText(UUID)).not.toBeInTheDocument();

        // No raw JSON dump of the evidence object.
        expect(screen.queryByText(/work_item_id/)).not.toBeInTheDocument();
    });
});

describe("describeArtifact — unresolved-id crash guard (heatmap cell click)", () => {
    const UUID = "550e8400-e29b-41d4-a716-446655440000";

    it("does not throw on a UUID id without a name in development mode", () => {
        // The dev-only unresolved-id assertion previously threw here. Because
        // describeArtifact runs inside a render-time useMemo, that throw escaped
        // the fetch try/catch and tripped the route error boundary on cell click.
        vi.stubEnv("NODE_ENV", "development");
        try {
            const item = { work_item_id: UUID, value: 3 };
            expect(() => describeArtifact(item, 0)).not.toThrow();
            const out = describeArtifact(item, 0);
            expect(out.label).toBe("#550e8400");
            expect(out.title).toBe(UUID);
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it("prefers an explicit name when present", () => {
        const out = describeArtifact({ work_item_id: UUID, name: "Login flow" }, 0);
        expect(out.label).toBe("Login flow");
    });
});

describe("HeatmapPanel — failed and embedded", () => {
    it("shows the shared error card, not the dashed empty box, when the read failed", () => {
        render(
            <HeatmapPanel
                title="T"
                description="D"
                request={request}
                initialData={null}
                emptyState="empty words"
                failed
            />,
        );
        expect(screen.getByRole("heading", { name: "Could not be read" })).toBeInTheDocument();
        expect(screen.queryByText("empty words")).toBeNull();
    });

    it("keeps the empty words for an empty read", () => {
        render(
            <HeatmapPanel
                title="T"
                description="D"
                request={request}
                initialData={null}
                emptyState="empty words"
            />,
        );
        expect(screen.getByText("empty words")).toBeInTheDocument();
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("embedded draws no own heading and no unit pill (the Section card owns them)", () => {
        render(
            <HeatmapPanel
                title="Own title"
                description="D"
                request={request}
                initialData={baseResponse([{ x: "Mon", y: "auth", value: 5 }])}
                embedded
            />,
        );
        expect(screen.queryByRole("heading", { name: "Own title" })).toBeNull();
        expect(screen.queryByTestId("heatmap-unit")).toBeNull();
        expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
    });
});
