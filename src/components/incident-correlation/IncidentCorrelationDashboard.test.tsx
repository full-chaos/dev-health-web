/**
 * IncidentCorrelationDashboard tests — Vitest + jsdom (CHAOS-1746).
 *
 * Covers:
 *   - joinEdges: join logic + edge cases (corrected to real backend semantics)
 *   - buildSankeyData: node/link derivation
 *   - buildSankeyAdapterData: ECharts adapter collision regression (CHAOS-2118)
 *   - Component: empty state, incident rows, sub-empty-edges state
 *
 * Backend edge semantics (models.py / ai_workflow.py):
 *   DEPLOYS:          source = PR,         target = deployment
 *   LINKED_INCIDENT:  source = deployment,  target = incident
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
import { buildSankeyAdapterData } from "@/components/charts/SankeyChart";
import type { MetricFilter } from "@/lib/filters/types";

// ---------------------------------------------------------------------------
// Mocks — chart primitives that require canvas / echarts in jsdom
// ---------------------------------------------------------------------------

vi.mock("@/components/charts/SankeyChart", async (importOriginal) => {
    // Import the real module so buildSankeyAdapterData remains testable
    const real = await importOriginal<typeof import("@/components/charts/SankeyChart")>();
    return {
        ...real,
        // Only replace the default React component (needs canvas/echarts)
        SankeyChart: ({
            nodes,
            links,
        }: {
            nodes: { name: string }[];
            links: { source: string; target: string; value: number }[];
        }) => (
            <div data-testid="sankey-chart" data-nodes={nodes.length} data-links={links.length} />
        ),
    };
});

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

/**
 * Build a WorkGraphEdge with correct sourceType/targetType per real backend:
 *   DEPLOYS:          sourceType = PR,         targetType = DEPLOYMENT
 *   LINKED_INCIDENT:  sourceType = DEPLOYMENT,  targetType = INCIDENT
 */
function makeEdge(
    edgeId: string,
    sourceId: string,
    targetId: string,
    edgeType: string,
    overrides: Partial<WorkGraphEdge> = {},
): WorkGraphEdge {
    return {
        edgeId,
        sourceType: edgeType === "DEPLOYS" ? "PR" : "DEPLOYMENT",
        sourceId,
        targetType: edgeType === "DEPLOYS" ? "DEPLOYMENT" : "INCIDENT",
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

    it("collects deployment IDs per incident from LINKED_INCIDENT edges", () => {
        // LINKED_INCIDENT: source=deployment, target=incident
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT"),
            makeEdge("l2", "dep-b", "inc-1", "LINKED_INCIDENT"),
        ];
        const rows = joinEdges([], incidents);
        expect(rows).toHaveLength(1);
        expect(rows[0].incidentId).toBe("inc-1");
        expect(rows[0].deploymentIds).toContain("dep-a");
        expect(rows[0].deploymentIds).toContain("dep-b");
        expect(Object.values(rows[0].prIdsByDeployment).flat()).toHaveLength(0);
    });

    it("collects PR IDs per incident via deployment join from DEPLOYS edges", () => {
        // LINKED_INCIDENT: dep-a → inc-1
        // DEPLOYS:         pr-x → dep-a, pr-y → dep-a
        const incidents: WorkGraphEdge[] = [makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT")];
        const deploys: WorkGraphEdge[] = [
            makeEdge("d1", "pr-x", "dep-a", "DEPLOYS"),
            makeEdge("d2", "pr-y", "dep-a", "DEPLOYS"),
        ];
        const rows = joinEdges(deploys, incidents);
        expect(rows).toHaveLength(1);
        expect(rows[0].incidentId).toBe("inc-1");
        const allPrs = Object.values(rows[0].prIdsByDeployment).flat();
        expect(allPrs).toContain("pr-x");
        expect(allPrs).toContain("pr-y");
    });

    it("joins DEPLOYS and LINKED_INCIDENT edges via shared deploymentId", () => {
        // dep-a is the shared deployment: PR→dep-a (DEPLOYS), dep-a→inc-1 (LINKED_INCIDENT)
        const deploys: WorkGraphEdge[] = [makeEdge("d1", "pr-a", "dep-a", "DEPLOYS")];
        const incidents: WorkGraphEdge[] = [makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT")];
        const rows = joinEdges(deploys, incidents);
        expect(rows).toHaveLength(1);
        expect(rows[0].incidentId).toBe("inc-1");
        expect(rows[0].deploymentIds).toContain("dep-a");
        expect(rows[0].prIdsByDeployment["dep-a"]).toContain("pr-a");
    });

    it("produces separate rows for distinct incident IDs", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT"),
            makeEdge("l2", "dep-b", "inc-2", "LINKED_INCIDENT"),
        ];
        const rows = joinEdges([], incidents);
        expect(rows).toHaveLength(2);
        const ids = rows.map((r) => r.incidentId).sort();
        expect(ids).toEqual(["inc-1", "inc-2"]);
    });

    it("deduplicates repeated deployment IDs for the same incident", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT"),
            makeEdge("l2", "dep-a", "inc-1", "LINKED_INCIDENT"), // duplicate
        ];
        const rows = joinEdges([], incidents);
        expect(rows[0].deploymentIds).toHaveLength(1);
        expect(rows[0].deploymentIds[0]).toBe("dep-a");
    });

    // CHAOS-2119: incident display name comes from LINKED_INCIDENT targetDisplayName
    it("carries LINKED_INCIDENT targetDisplayName as incidentDisplayName (CHAOS-2119)", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "4e00fff2-df66-5028-8ebd-e4535332300b", "LINKED_INCIDENT", {
                targetDisplayName: "INC-2025-404",
            }),
        ];

        const rows = joinEdges([], incidents);

        expect(rows).toHaveLength(1);
        expect(rows[0].incidentId).toBe("4e00fff2-df66-5028-8ebd-e4535332300b");
        expect(rows[0].incidentDisplayName).toBe("INC-2025-404");
    });

    it("sets incidentDisplayName to null when LINKED_INCIDENT has no targetDisplayName (CHAOS-2119)", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "uuid-inc-1", "LINKED_INCIDENT", {
                targetDisplayName: null,
            }),
        ];
        const rows = joinEdges([], incidents);
        expect(rows[0].incidentDisplayName).toBeNull();
    });

    // CHAOS-2119: deployment display name from LINKED_INCIDENT sourceDisplayName
    it("populates deploymentDisplayNames from LINKED_INCIDENT sourceDisplayName (CHAOS-2119)", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-uuid-abc", "inc-uuid-001", "LINKED_INCIDENT", {
                sourceDisplayName: "payments-deploy-47",
                targetDisplayName: "INC-2025-001",
            }),
        ];

        const rows = joinEdges([], incidents);

        expect(rows).toHaveLength(1);
        expect(rows[0].deploymentDisplayNames).toEqual({ "dep-uuid-abc": "payments-deploy-47" });
    });

    // CHAOS-2119: PR display name from DEPLOYS sourceDisplayName
    it("populates prDisplayNames from DEPLOYS sourceDisplayName (CHAOS-2119)", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT"),
        ];
        const deploys: WorkGraphEdge[] = [
            makeEdge("d1", "pr-uuid-abc", "dep-a", "DEPLOYS", {
                sourceDisplayName: "Fix: null pointer in checkout #847",
            }),
        ];

        const rows = joinEdges(deploys, incidents);

        expect(rows).toHaveLength(1);
        expect(rows[0].prDisplayNames).toEqual({
            "pr-uuid-abc": "Fix: null pointer in checkout #847",
        });
    });

    it("first non-null display name wins for incident (LINKED_INCIDENT)", () => {
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT", {
                targetDisplayName: "INC-CANONICAL",
            }),
            makeEdge("l2", "dep-b", "inc-1", "LINKED_INCIDENT", {
                targetDisplayName: "INC-STALE",
            }),
        ];
        const rows = joinEdges([], incidents);
        expect(rows[0].incidentDisplayName).toBe("INC-CANONICAL");
    });

    // CHAOS-2118: prIdsByDeployment must preserve which PR caused which deployment
    it("prIdsByDeployment preserves PR→deployment association (no cross-join)", () => {
        // Two deployments, each triggered by a distinct PR.
        // dep-a → inc-1 (LINKED_INCIDENT), pr-1 → dep-a (DEPLOYS)
        // dep-b → inc-1 (LINKED_INCIDENT), pr-2 → dep-b (DEPLOYS)
        const incidents: WorkGraphEdge[] = [
            makeEdge("l1", "dep-a", "inc-1", "LINKED_INCIDENT"),
            makeEdge("l2", "dep-b", "inc-1", "LINKED_INCIDENT"),
        ];
        const deploys: WorkGraphEdge[] = [
            makeEdge("d1", "pr-1", "dep-a", "DEPLOYS"),
            makeEdge("d2", "pr-2", "dep-b", "DEPLOYS"),
        ];
        const rows = joinEdges(deploys, incidents);
        expect(rows).toHaveLength(1);
        // dep-a should only contain pr-1 (not pr-2)
        expect(rows[0].prIdsByDeployment["dep-a"]).toEqual(["pr-1"]);
        // dep-b should only contain pr-2 (not pr-1)
        expect(rows[0].prIdsByDeployment["dep-b"]).toEqual(["pr-2"]);
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
        // An incident with no deployments or PRs produces no links
        const rows = [{ incidentId: "inc-1", deploymentIds: [], prIdsByDeployment: {} }];
        expect(buildSankeyData(rows)).toBeNull();
    });

    it("returns non-null with correct node and link count for a simple row", () => {
        // 1 PR → 1 deployment → 1 incident: 3 nodes, 2 links
        const rows = [
            {
                incidentId: "inc-abc123",
                deploymentIds: ["dep-xyz789"],
                prIdsByDeployment: { "dep-xyz789": ["pr-lmn456"] },
            },
        ];
        const result = buildSankeyData(rows);
        expect(result).not.toBeNull();
        expect(result!.nodes).toHaveLength(3);
        expect(result!.links).toHaveLength(2);
    });

    it("uses incidentDisplayName for incident Sankey node labels", () => {
        const rows = [
            {
                incidentId: "4e00fff2-df66-5028-8ebd-e4535332300b",
                incidentDisplayName: "INC-2025-404",
                deploymentIds: ["dep-xyz789"],
                prIdsByDeployment: { "dep-xyz789": ["pr-lmn456"] },
            },
        ];

        const result = buildSankeyData(rows);

        expect(result).not.toBeNull();
        expect(result!.nodes).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: "INC-2025-404" })]),
        );
        expect(result!.nodes).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ name: "inc:4e00fff2" })]),
        );
    });

    // CHAOS-2118: collision regression — identical display names must not merge nodes
    it("produces separate nodes for two incidents with the same display name (CHAOS-2118)", () => {
        const rows = [
            {
                incidentId: "uuid-inc-aaa",
                incidentDisplayName: "Production Outage",
                deploymentIds: ["dep-001"],
                prIdsByDeployment: {},
            },
            {
                incidentId: "uuid-inc-bbb",
                incidentDisplayName: "Production Outage", // same label, different id
                deploymentIds: ["dep-002"],
                prIdsByDeployment: {},
            },
        ];

        const result = buildSankeyData(rows);

        expect(result).not.toBeNull();
        // 4 nodes: 2 incidents (distinct composite keys) + 2 deployments
        expect(result!.nodes).toHaveLength(4);
        // Each incident node is type-namespaced — id = "incident:<uuid>"
        expect(result!.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: "incident:uuid-inc-aaa", name: "Production Outage" }),
                expect.objectContaining({ id: "incident:uuid-inc-bbb", name: "Production Outage" }),
            ]),
        );
        // Links target the composite key, not the collapsed display name
        expect(result!.links).toHaveLength(2);
        const linkTargets = result!.links.map((l) => l.target).sort();
        expect(linkTargets).toEqual(
            ["incident:uuid-inc-aaa", "incident:uuid-inc-bbb"].sort(),
        );
    });

    // CHAOS-2118: uniqueness for deployments with the same display name
    it("produces separate deployment nodes even when their labels collide (CHAOS-2118)", () => {
        const rows = [
            {
                incidentId: "uuid-inc-aaa",
                incidentDisplayName: "INC-A",
                deploymentIds: ["dep-111", "dep-222"],
                prIdsByDeployment: {},
                deploymentDisplayNames: {
                    "dep-111": "deploy/main",
                    "dep-222": "deploy/main", // same label, different id
                },
            },
        ];

        const result = buildSankeyData(rows);

        expect(result).not.toBeNull();
        // 3 nodes: 1 incident + 2 deployments (not collapsed despite same label)
        expect(result!.nodes).toHaveLength(3);
        expect(result!.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: "deployment:dep-111" }),
                expect.objectContaining({ id: "deployment:dep-222" }),
            ]),
        );
    });

    // WARNING 1: cross-type UUID collision — same raw UUID for different types
    it("produces separate nodes for deployment and incident with the same raw UUID (WARNING 1)", () => {
        const sharedUuid = "aaaa1111-0000-0000-0000-000000000000";
        const rows = [
            {
                incidentId: sharedUuid,   // incident with this UUID
                deploymentIds: [sharedUuid], // deployment with the SAME UUID
                prIdsByDeployment: {},
            },
        ];

        const result = buildSankeyData(rows);

        expect(result).not.toBeNull();
        // Both nodes exist — not merged
        expect(result!.nodes).toHaveLength(2);
        expect(result!.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: `incident:${sharedUuid}` }),
                expect.objectContaining({ id: `deployment:${sharedUuid}` }),
            ]),
        );
    });

    // CHAOS-2119: resolved labels surface in nodes
    it("uses server-resolved deployment and PR display names (CHAOS-2119)", () => {
        const rows = [
            {
                incidentId: "uuid-inc-001",
                incidentDisplayName: "INC-2025-001",
                deploymentIds: ["dep-uuid-abc"],
                prIdsByDeployment: { "dep-uuid-abc": ["pr-uuid-xyz"] },
                deploymentDisplayNames: { "dep-uuid-abc": "payments-service deploy #42" },
                prDisplayNames: { "pr-uuid-xyz": "Fix: checkout null pointer" },
            },
        ];

        const result = buildSankeyData(rows);

        expect(result).not.toBeNull();
        expect(result!.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "deployment:dep-uuid-abc",
                    name: "payments-service deploy #42",
                }),
                expect.objectContaining({
                    id: "pr:pr-uuid-xyz",
                    name: "Fix: checkout null pointer",
                }),
            ]),
        );
        // No short-id fallback rendered when name is resolved
        const names = result!.nodes.map((n) => n.name);
        expect(names).not.toContain("dep:dep-uuid");
        expect(names).not.toContain("pr:pr-uuid-x");
    });

    // CHAOS-2118 cross-join regression: multi-deployment incident with distinct PR sets
    // must only produce the true PR→deployment edges, never false cross-links.
    it("does not cross-join PRs to unrelated deployments (CHAOS-2118 regression)", () => {
        // pr-a caused dep-a; pr-b caused dep-b.
        // The false edges pr-a→dep-b and pr-b→dep-a must NOT appear.
        const rows = [
            {
                incidentId: "inc-multi",
                deploymentIds: ["dep-a", "dep-b"],
                prIdsByDeployment: {
                    "dep-a": ["pr-a"],
                    "dep-b": ["pr-b"],
                },
            },
        ];

        const result = buildSankeyData(rows);

        expect(result).not.toBeNull();
        // True edges: pr-a→dep-a, pr-b→dep-b, dep-a→inc-multi, dep-b→inc-multi = 4 links
        expect(result!.links).toHaveLength(4);

        const prAToDep = result!.links.filter(
            (l) => l.source === "pr:pr-a" && l.target === "deployment:dep-a",
        );
        const prBToDep = result!.links.filter(
            (l) => l.source === "pr:pr-b" && l.target === "deployment:dep-b",
        );
        expect(prAToDep).toHaveLength(1);
        expect(prBToDep).toHaveLength(1);

        // Assert the false cross-links are absent
        const falseLinks = result!.links.filter(
            (l) =>
                (l.source === "pr:pr-a" && l.target === "deployment:dep-b") ||
                (l.source === "pr:pr-b" && l.target === "deployment:dep-a"),
        );
        expect(falseLinks).toHaveLength(0);
    });

    // CHAOS-2119: unresolved fallback uses controlled short-id prefix
    it("falls back to short-id prefix for unresolved deployment/PR nodes (CHAOS-2119)", () => {
        const rows = [
            {
                incidentId: "uuid-inc-001",
                incidentDisplayName: "INC-2025-001",
                deploymentIds: ["abcdef12-0000-0000-0000-000000000000"],
                prIdsByDeployment: {
                    "abcdef12-0000-0000-0000-000000000000": ["12345678-0000-0000-0000-000000000000"],
                },
                deploymentDisplayNames: { "abcdef12-0000-0000-0000-000000000000": null },
                prDisplayNames: { "12345678-0000-0000-0000-000000000000": null },
            },
        ];

        const result = buildSankeyData(rows);

        expect(result).not.toBeNull();
        expect(result!.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "deployment:abcdef12-0000-0000-0000-000000000000",
                    name: "dep:abcdef12",
                }),
                expect.objectContaining({
                    id: "pr:12345678-0000-0000-0000-000000000000",
                    name: "pr:12345678",
                }),
            ]),
        );
    });
});

// ---------------------------------------------------------------------------
// buildSankeyAdapterData — real ECharts adapter tests (CHAOS-2118 CRITICAL 1)
// Tests the actual adapter logic, NOT the mocked SankeyChart component.
// ---------------------------------------------------------------------------

describe("buildSankeyAdapterData", () => {
    it("assigns distinct ECharts keys to nodes with identical display names (CHAOS-2118)", () => {
        // Two incident nodes with the same display name — adapter must not collapse them.
        const nodes = [
            { id: "incident:uuid-aaa", name: "Production Outage", group: "incident" },
            { id: "incident:uuid-bbb", name: "Production Outage", group: "incident" },
        ];
        const links = [
            { source: "deployment:dep-001", target: "incident:uuid-aaa", value: 1 },
            { source: "deployment:dep-002", target: "incident:uuid-bbb", value: 1 },
        ];

        const { chartNodes, chartLinks } = buildSankeyAdapterData(nodes, links);

        // Both nodes must have distinct ECharts names (internal keys)
        const chartNames = chartNodes.map((n) => n.name);
        expect(new Set(chartNames).size).toBe(2);
        expect(chartNames).toContain("incident:uuid-aaa");
        expect(chartNames).toContain("incident:uuid-bbb");

        // Links must map to the correct distinct keys
        const linkTargets = chartLinks.map((l) => l.target).sort();
        expect(linkTargets).toEqual(["incident:uuid-aaa", "incident:uuid-bbb"].sort());
    });

    it("preserves display names in labelByKey for tooltip rendering", () => {
        const nodes = [
            { id: "incident:uuid-aaa", name: "Production Outage", group: "incident" },
            { id: "incident:uuid-bbb", name: "Production Outage", group: "incident" },
        ];
        const { labelByKey } = buildSankeyAdapterData(nodes, []);

        expect(labelByKey.get("incident:uuid-aaa")).toBe("Production Outage");
        expect(labelByKey.get("incident:uuid-bbb")).toBe("Production Outage");
    });

    it("resolves links that reference nodes by their composite id", () => {
        const nodes = [
            { id: "deployment:dep-1", name: "deploy/main", group: "deployment" },
            { id: "incident:inc-1", name: "INC-001", group: "incident" },
        ];
        const links = [{ source: "deployment:dep-1", target: "incident:inc-1", value: 1 }];

        const { chartLinks } = buildSankeyAdapterData(nodes, links);

        expect(chartLinks[0].source).toBe("deployment:dep-1");
        expect(chartLinks[0].target).toBe("incident:inc-1");
    });

    it("handles legacy name-based links (no id on node) without collision for distinct names", () => {
        const nodes = [
            { name: "Alpha", group: "deployment" },
            { name: "Beta", group: "incident" },
        ];
        const links = [{ source: "Alpha", target: "Beta", value: 1 }];

        const { chartNodes, chartLinks } = buildSankeyAdapterData(nodes, links);

        expect(chartNodes[0].name).toBe("deployment:Alpha");
        expect(chartNodes[1].name).toBe("incident:Beta");
        expect(chartLinks[0].source).toBe("deployment:Alpha");
        expect(chartLinks[0].target).toBe("incident:Beta");
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
        // LINKED_INCIDENT: dep-1 → inc-1 gives one incident row
        const incidents = [makeEdge("l1", "dep-1", "inc-1", "LINKED_INCIDENT")];
        render(
            <IncidentCorrelationDashboard
                {...baseProps}
                deploysEdges={[]}
                incidentEdges={incidents}
            />,
        );
        expect(screen.getByTestId("incident-linkage-table")).toBeInTheDocument();
        expect(screen.getByTestId("incident-row")).toBeInTheDocument();
    });

    it("renders the SankeyChart when joined edge data produces links", () => {
        // dep-1 → inc-1 produces a deployment→incident link in the Sankey
        const incidents = [makeEdge("l1", "dep-1", "inc-1", "LINKED_INCIDENT")];
        render(
            <IncidentCorrelationDashboard
                {...baseProps}
                deploysEdges={[]}
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
        expect(screen.getByTestId("horizontal-bar-chart")).toHaveTextContent("Long PR,No tests");
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

    it("incident table renders server-resolved name for a UUID incident id (CHAOS-2089)", () => {
        // LINKED_INCIDENT carries targetDisplayName = resolved incident name.
        // joinEdges must propagate it to IncidentRow.incidentDisplayName.
        // EntityLabel must render the resolved name, never the raw UUID.
        const incidents = [
            makeEdge("l1", "dep-a", "4e00fff2-df66-5028-8ebd-e4535332300b", "LINKED_INCIDENT", {
                targetDisplayName: "INC-2025-001",
            }),
        ];
        render(
            <IncidentCorrelationDashboard
                {...baseProps}
                deploysEdges={[]}
                incidentEdges={incidents}
            />,
        );
        expect(screen.getByTestId("incident-linkage-table")).toBeInTheDocument();
        expect(screen.getByText("INC-2025-001")).toBeInTheDocument();
        expect(screen.queryByText(/4e00fff2-df66/)).not.toBeInTheDocument();
    });

    it("incident table shows Unresolved badge for a UUID incident id with no display name (CHAOS-2089)", () => {
        // When targetDisplayName is null (backend could not resolve), EntityLabel
        // degrades to a controlled short token + Unresolved badge — never raw UUID.
        const incidents = [
            makeEdge("l1", "dep-a", "698c0211-0000-0000-0000-0000fee29c84", "LINKED_INCIDENT", {
                targetDisplayName: null,
            }),
        ];
        render(
            <IncidentCorrelationDashboard
                {...baseProps}
                deploysEdges={[]}
                incidentEdges={incidents}
            />,
        );
        expect(screen.getByTestId("incident-linkage-table")).toBeInTheDocument();
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
        expect(screen.queryByText(/698c0211-0000/)).not.toBeInTheDocument();
    });
});
