/**
 * IncidentCorrelationDashboard tests — Vitest + jsdom (CHAOS-1746).
 *
 * Covers:
 *   - joinEdges: join logic + edge cases
 *   - buildSankeyData: node/link derivation
 *   - Component: empty state, incident rows, sub-empty-edges state
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { render } from "@/test/utils";
import {
    buildSankeyData,
    IncidentCorrelationDashboard,
    joinEdges,
    type WorkGraphEdge,
} from "./IncidentCorrelationDashboard";
import type { MetricFilter } from "@/lib/filters/types";

// ---------------------------------------------------------------------------
// Mocks — chart primitives that require canvas / echarts in jsdom
// ---------------------------------------------------------------------------

vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: ({
        nodes,
        links,
    }: {
        nodes: { name: string }[];
        links: { source: string; target: string; value: number }[];
    }) => <div data-testid="sankey-chart" data-nodes={nodes.length} data-links={links.length} />,
}));

vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: ({ categories }: { categories: string[] }) => (
        <div data-testid="horizontal-bar-chart">{categories.join(",")}</div>
    ),
}));

vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: ({ data }: { data: Array<{ day: string; value: number }> }) => (
        <div data-testid="timeseries-chart">{data.map((point) => point.value).join(",")}</div>
    ),
}));

vi.mock("@/components/metrics/MetricCard", () => ({
    MetricCard: ({ label }: { label: string }) => <div data-testid="metric-card">{label}</div>,
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/incident-correlation",
    useRouter: () => ({ refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEdge(
    edgeId: string,
    sourceId: string,
    targetId: string,
    edgeType: string,
    overrides: Partial<WorkGraphEdge> = {},
): WorkGraphEdge {
    return {
        edgeId,
        sourceType: edgeType === "DEPLOYS" ? "DEPLOYMENT" : "INCIDENT",
        sourceId,
        targetType: edgeType === "DEPLOYS" ? "INCIDENT" : "WORK_ITEM",
        targetId,
        edgeType,
        provenance: null,
        confidence: null,
        evidence: null,
        repoId: null,
        provider: null,
        ...overrides,
    };
}

function makeFilter(): MetricFilter {
    return {
        scope: { level: "repo", ids: ["my-repo"] },
        time: {
            range_days: 30,
            compare_days: 0,
            start_date: undefined,
            end_date: undefined,
        },
        who: {},
        what: {},
        why: {},
        how: {},
    };
}

// ---------------------------------------------------------------------------
// joinEdges — unit tests
// ---------------------------------------------------------------------------

describe("joinEdges", () => {
    it("returns empty array when both edge sets are empty", () => {
        expect(joinEdges([], [])).toEqual([]);
    });

    it("collects deployment IDs per incident from DEPLOYS edges", () => {
        const deploys: WorkGraphEdge[] = [
            makeEdge("d1", "dep-a", "inc-1", "DEPLOYS"),
            makeEdge("d2", "dep-b", "inc-1", "DEPLOYS"),
        ];
        const rows = joinEdges(deploys, []);
        expect(rows).toHaveLength(1);
        expect(rows[0].incidentId).toBe("inc-1");
        expect(rows[0].deploymentIds).toContain("dep-a");
        expect(rows[0].deploymentIds).toContain("dep-b");
        expect(rows[0].workItemIds).toHaveLength(0);
    });

    it("collects work-item IDs per incident from LINKED_INCIDENT edges", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "inc-1", "wi-a", "LINKED_INCIDENT"),
            makeEdge("l2", "inc-1", "wi-b", "LINKED_INCIDENT"),
        ];
        const rows = joinEdges([], incidents);
        expect(rows).toHaveLength(1);
        expect(rows[0].incidentId).toBe("inc-1");
        expect(rows[0].workItemIds).toContain("wi-a");
        expect(rows[0].workItemIds).toContain("wi-b");
        expect(rows[0].deploymentIds).toHaveLength(0);
    });

    it("joins deployment and work-item edges by shared incident ID", () => {
        const deploys: WorkGraphEdge[] = [makeEdge("d1", "dep-a", "inc-1", "DEPLOYS")];
        const incidents: WorkGraphEdge[] = [makeEdge("l1", "inc-1", "wi-a", "LINKED_INCIDENT")];
        const rows = joinEdges(deploys, incidents);
        expect(rows).toHaveLength(1);
        expect(rows[0].incidentId).toBe("inc-1");
        expect(rows[0].deploymentIds).toContain("dep-a");
        expect(rows[0].workItemIds).toContain("wi-a");
    });

    it("produces separate rows for distinct incident IDs", () => {
        const deploys: WorkGraphEdge[] = [
            makeEdge("d1", "dep-a", "inc-1", "DEPLOYS"),
            makeEdge("d2", "dep-b", "inc-2", "DEPLOYS"),
        ];
        const rows = joinEdges(deploys, []);
        expect(rows).toHaveLength(2);
        const ids = rows.map((r) => r.incidentId).sort();
        expect(ids).toEqual(["inc-1", "inc-2"]);
    });

    it("deduplicates repeated deployment IDs for the same incident", () => {
        const deploys: WorkGraphEdge[] = [
            makeEdge("d1", "dep-a", "inc-1", "DEPLOYS"),
            makeEdge("d2", "dep-a", "inc-1", "DEPLOYS"), // duplicate deployment
        ];
        const rows = joinEdges(deploys, []);
        expect(rows[0].deploymentIds).toHaveLength(1);
        expect(rows[0].deploymentIds[0]).toBe("dep-a");
    });
});

// ---------------------------------------------------------------------------
// buildSankeyData — unit tests
// ---------------------------------------------------------------------------

describe("buildSankeyData", () => {
    it("returns null when rows array is empty", () => {
        expect(buildSankeyData([])).toBeNull();
    });

    it("returns null when all incidents have no linked nodes (no links produced)", () => {
        // An incident with no deployments or work items produces no links
        const rows = [{ incidentId: "inc-1", deploymentIds: [], workItemIds: [] }];
        expect(buildSankeyData(rows)).toBeNull();
    });

    it("returns non-null with correct node and link count for a simple row", () => {
        const rows = [
            {
                incidentId: "incident-abc123",
                deploymentIds: ["deploy-xyz789"],
                workItemIds: ["work-item-lmn"],
            },
        ];
        const result = buildSankeyData(rows);
        expect(result).not.toBeNull();
        // 3 nodes: 1 incident + 1 deployment + 1 work item
        expect(result!.nodes).toHaveLength(3);
        // 2 links: deployment→incident + incident→work_item
        expect(result!.links).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// IncidentCorrelationDashboard rendering
// ---------------------------------------------------------------------------

describe("IncidentCorrelationDashboard", () => {
    const baseProps = {
        orgId: "org-test",
        deltas: [],
        drivers: [],
        contributors: [],
        deploysEdges: [] as WorkGraphEdge[],
        incidentEdges: [] as WorkGraphEdge[],
        filters: makeFilter(),
    };

    it("renders empty state when no data is available", () => {
        render(<IncidentCorrelationDashboard {...baseProps} />);
        expect(screen.getByTestId("empty-state")).toBeInTheDocument();
        expect(screen.getByText(/no incident-correlation evidence/i)).toBeInTheDocument();
    });

    it("includes orgId in empty state", () => {
        render(<IncidentCorrelationDashboard {...baseProps} orgId="org-sentinel" />);
        expect(screen.getByText(/org-sentinel/)).toBeInTheDocument();
    });

    it("renders incident linkage table when edge data is present", () => {
        const deploys = [makeEdge("d1", "dep-1", "inc-1", "DEPLOYS")];
        const incidents = [makeEdge("l1", "inc-1", "wi-1", "LINKED_INCIDENT")];
        render(
            <IncidentCorrelationDashboard
                {...baseProps}
                deploysEdges={deploys}
                incidentEdges={incidents}
            />,
        );
        expect(screen.getByTestId("incident-linkage-table")).toBeInTheDocument();
        expect(screen.getByTestId("incident-row")).toBeInTheDocument();
    });

    it("renders the SankeyChart when joined edge data produces links", () => {
        const deploys = [makeEdge("d1", "dep-1", "inc-1", "DEPLOYS")];
        const incidents = [makeEdge("l1", "inc-1", "wi-1", "LINKED_INCIDENT")];
        render(
            <IncidentCorrelationDashboard
                {...baseProps}
                deploysEdges={deploys}
                incidentEdges={incidents}
            />,
        );
        expect(screen.getByTestId("sankey-chart")).toBeInTheDocument();
    });

    it("renders sub-empty-edges state when DORA metrics exist but no edges", () => {
        const delta = {
            metric: "change_failure_rate",
            label: "Change Failure Rate",
            value: 0.05,
            unit: "%",
            delta_pct: -0.1,
            spark: [],
        };
        render(
            <IncidentCorrelationDashboard
                {...baseProps}
                deltas={[delta]}
                deploysEdges={[]}
                incidentEdges={[]}
            />,
        );
        expect(screen.getByTestId("empty-edges-state")).toBeInTheDocument();
    });

    it("renders MetricCard only for metrics present in deltas (no placeholders)", () => {
        const delta = {
            metric: "change_failure_rate",
            label: "Change Failure Rate",
            value: 0.05,
            unit: "%",
            delta_pct: -0.1,
            spark: [],
        };
        render(<IncidentCorrelationDashboard {...baseProps} deltas={[delta]} />);
        const cards = screen.getAllByTestId("metric-card");
        // Only 1 card — not 3 (deployment_frequency + mttr are absent from deltas)
        expect(cards).toHaveLength(1);
        expect(cards[0]).toHaveTextContent("Change Failure Rate");
    });

    it("renders the CFR trend chart when enough finite spark data is present", () => {
        const delta = {
            metric: "change_failure_rate",
            label: "Change Failure Rate",
            value: 0.05,
            unit: "%",
            delta_pct: -0.1,
            spark: [
                { ts: "2026-05-01", value: 0.04 },
                { ts: "2026-05-02", value: 0.06 },
            ],
        };
        render(<IncidentCorrelationDashboard {...baseProps} deltas={[delta]} />);
        expect(screen.getByTestId("cfr-trend-chart")).toBeInTheDocument();
        expect(screen.getByTestId("timeseries-chart")).toHaveTextContent("0.04,0.06");
    });

    it("renders a controlled empty state when CFR has insufficient trend data", () => {
        const delta = {
            metric: "change_failure_rate",
            label: "Change Failure Rate",
            value: 0.05,
            unit: "%",
            delta_pct: -0.1,
            spark: [{ ts: "2026-05-01", value: 0.04 }],
        };
        render(<IncidentCorrelationDashboard {...baseProps} deltas={[delta]} />);
        expect(screen.getByTestId("cfr-trend-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("cfr-trend-chart")).not.toBeInTheDocument();
    });

    it("renders a controlled empty state for zero-value associations", () => {
        const drivers = [
            {
                id: "d1",
                label: "550e8400-e29b-41d4-a716-446655440000",
                value: 0,
                delta_pct: 0,
                evidence_link: "/e/1",
            },
        ];
        render(<IncidentCorrelationDashboard {...baseProps} drivers={drivers} />);
        expect(screen.getByTestId("change-failure-associations-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("horizontal-bar-chart")).not.toBeInTheDocument();
    });

    it("renders HorizontalBarChart for drivers when explain data is present", () => {
        const drivers = [
            {
                id: "d1",
                label: "Long PR",
                value: 5,
                delta_pct: 0.3,
                evidence_link: "/e/1",
            },
            {
                id: "d2",
                label: "No tests",
                value: 3,
                delta_pct: 0.2,
                evidence_link: "/e/2",
            },
        ];
        render(<IncidentCorrelationDashboard {...baseProps} drivers={drivers} />);
        expect(screen.getByTestId("horizontal-bar-chart")).toBeInTheDocument();
    });

    it("renders the server-resolved display name for a contributor (no raw UUID)", () => {
        // CHAOS-2089: backend now resolves repo/team ids to display names.
        const contributors = [
            {
                id: "698c0211-0000-0000-0000-0000fee29c84",
                label: "meridian/billing-service",
                display_name: "meridian/billing-service",
                value: 4,
                delta_pct: 0.1,
                evidence_link: "/e/c1",
            },
        ];
        render(<IncidentCorrelationDashboard {...baseProps} contributors={contributors} />);
        expect(screen.getByText("meridian/billing-service")).toBeInTheDocument();
        expect(screen.queryByText(/698c0211-0000/)).not.toBeInTheDocument();
    });

    it("shows the Unresolved badge for a genuinely-unresolved contributor id", () => {
        // No display_name from the server -> controlled fallback, never a raw UUID.
        const contributors = [
            {
                id: "4e00fff2-df66-5028-8ebd-e4535332300b",
                label: "#4e00fff2",
                display_name: null,
                value: 2,
                delta_pct: 0.0,
                evidence_link: "/e/c2",
            },
        ];
        render(<IncidentCorrelationDashboard {...baseProps} contributors={contributors} />);
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
        expect(screen.queryByText(/4e00fff2-df66/)).not.toBeInTheDocument();
    });
});
