/**
 * Bottlenecks with an `f` that names a service id. The Review Load × Review Latency quadrant is
 * not read (it has no service filter): it is empty and carries the reason the review wait heatmap
 * serves for the same request, or none when the heatmap serves none (CHAOS-14489).
 */
import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";

const { quadrantSpy, quadrantRequests, heatmapReason } = vi.hoisted(() => ({
    quadrantSpy: vi.fn(),
    quadrantRequests: [] as Array<Record<string, unknown>>,
    heatmapReason: { value: null as string | null },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/bottleneck",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: (props: Record<string, unknown>) => {
        quadrantSpy(props);
        return <div data-testid="quadrant-panel" />;
    },
}));
vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: () => <div data-testid="heatmap-panel" />,
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: () => <div data-testid="evidence-panel" />,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: async () => ({ deltas: [] }),
}));
vi.mock("@/lib/api/home", () => ({ getExplainData: async () => null }));
vi.mock("@/lib/ask-dev/load-page-scope-entities", () => ({
    loadScopePageEntities: async () => [],
}));
// The query API as it answers today: the quadrant has no service filter (an org request, or the
// team grain for scope_type=service), so it plots the org's team point. The heatmap reason is set
// per case.
vi.mock("@/lib/api/visuals", () => ({
    getQuadrant: async (request: Record<string, unknown>) => {
        quadrantRequests.push(request);
        return {
            axes: {
                x: { metric: "review_load", label: "Review Load", unit: "" },
                y: { metric: "review_latency", label: "Review Latency", unit: "hours" },
            },
            points: [
                {
                    entity_id: "team-a",
                    entity_label: "Team A",
                    x: 8.2,
                    y: 6.754,
                    window_start: "2026-11-01",
                    window_end: "2026-11-14",
                    evidence_link: "/x",
                },
            ],
            annotations: [],
            filter_empty_reason: null,
        };
    },
    getHeatmap: async () => ({
        axes: { x: { buckets: [] }, y: { buckets: [] } },
        cells: [],
        filter_empty_reason: heatmapReason.value,
    }),
}));

import BottleneckPage from "./page";

const drawServiceScope = async () => {
    quadrantSpy.mockClear();
    quadrantRequests.length = 0;
    const f = encodeFilterParam({
        ...defaultMetricFilter,
        scope: { level: "service", ids: ["service-does-not-exist"] },
    });
    render(await BottleneckPage({ searchParams: Promise.resolve({ f }) }));
    const data = quadrantSpy.mock.calls.at(-1)?.[0]?.data as
        { points?: unknown[]; filter_empty_reason?: string | null } | null | undefined;
    return {
        requested: quadrantRequests.map((request) => request.scope_type),
        points: data?.points?.length ?? 0,
        reason: data?.filter_empty_reason,
    };
};

describe("Bottlenecks: named service scope (CHAOS-14489)", () => {
    it("the heatmap serves service_not_found: the quadrant shows it and is not read", async () => {
        heatmapReason.value = "service_not_found";
        expect(await drawServiceScope()).toEqual({
            requested: [],
            points: 0,
            reason: "service_not_found",
        });
    });

    it("the heatmap serves no reason: the quadrant is empty with no reason", async () => {
        heatmapReason.value = null;
        expect(await drawServiceScope()).toEqual({ requested: [], points: 0, reason: undefined });
    });
});
