import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { STATUS_PILL } from "@/lib/statusPill";
import { NODE_TYPE_COLOR_SOURCE, nodeTypeDotClass } from "@/lib/workGraphNodeColors";
import { NodeDetailPanel } from "../GraphView";
import { confidenceToneClass } from "./ConfidencePanel";
import { InvestmentExplainer } from "./InvestmentExplainer";
import { ReadWithContextCard } from "./ReadWithContextCard";

// The confidence pills on status tokens and the node dots on the explorer's series colors
// (CHAOS-7882). Pill contrast (4.5:1, light and dark) is held by lib/__tests__/statusPill.test.tsx
// for these same STATUS_PILL classes.

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/diagnose/work-graph",
}));
vi.mock("@/lib/graphql/hooks", () => ({
    useWorkGraphEdges: vi.fn(),
    useWorkGraphFlow: vi.fn(),
    useWorkGraphArtifacts: vi.fn(),
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => <div /> }));
vi.mock("@/components/charts/WorkGraphExplorer", () => ({
    WorkGraphExplorer: () => <div />,
    WorkGraphLegend: () => <div />,
    WorkGraphLayerToggles: () => <div />,
}));
vi.mock("next/link", () => ({
    default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...p}>
            {children}
        </a>
    ),
}));

const explained = (level?: string) => ({
    data: {
        summary: "Effort appears to lean toward feature delivery.",
        top_findings: [],
        confidence: { level, quality_mean: 0.48, quality_stddev: 0.14, drivers: [] },
        what_to_check_next: [],
        anti_claims: [],
        status: "valid",
    },
    filtersKey: "k",
    focus: { theme: null, subcategory: null },
});
const pillOf = (text: string) =>
    screen.getAllByText(text).find((e) => e.className.includes("rounded-full"))!;

const EXPECTED = [
    ["high", STATUS_PILL.positive],
    ["moderate", STATUS_PILL.caution],
    ["low", STATUS_PILL.negative],
    [undefined, STATUS_PILL.muted],
    ["something-new", STATUS_PILL.muted],
] as const;

describe("confidence pills use status tokens", () => {
    it.each(EXPECTED)("level %s -> the matching STATUS_PILL tone", (level, tone) => {
        expect(confidenceToneClass(level)).toBe(tone);
    });

    it.each(EXPECTED.slice(0, 4))("the explainer pill for %s has that tone", (level, tone) => {
        render(
            <InvestmentExplainer
                mixExplanation={explained(level) as never}
                mixExplainKey="k"
                isExplainingMix={false}
                onRegenerate={() => {}}
            />,
        );
        expect(pillOf(level ?? "unknown").className).toContain(tone);
    });

    it.each(EXPECTED.slice(0, 4))("the context card pill for %s has that tone", (level, tone) => {
        render(
            <ReadWithContextCard
                mixExplanation={explained(level) as never}
                mixExplainKey="k"
                teamCategoryFlow={null}
                repoTeamFlow={null}
                isCoverageLoading={false}
                confidenceHref="/investment?tab=confidence"
            >
                <p>explanation</p>
            </ReadWithContextCard>,
        );
        expect(pillOf(level ?? "unknown").className).toContain(tone);
    });
});

describe("node detail dots equal the explorer's node colors", () => {
    const types = Object.keys(NODE_TYPE_COLOR_SOURCE) as Array<keyof typeof NODE_TYPE_COLOR_SOURCE>;

    it.each(types)("%s: the dot is the series color the explorer's map names", (type) => {
        const source = NODE_TYPE_COLOR_SOURCE[type];
        const { container } = render(
            <NodeDetailPanel
                node={{ id: "n1", type }}
                incomingEdges={[]}
                outgoingEdges={[]}
                onClose={() => {}}
            />,
        );
        const dot = container.querySelector("span.w-3.h-3") as HTMLElement;
        expect(dot.className).toContain(
            source === "negative" ? "bg-(--negative)" : `bg-(--chart-color-${source + 1})`,
        );
        expect(dot.className).toContain(nodeTypeDotClass(type));
    });

    it("INCIDENT is the negative status color, as in the explorer", () => {
        expect(NODE_TYPE_COLOR_SOURCE.INCIDENT).toBe("negative");
    });

    it("the explorer draws with this same map (no copy of it in the component)", () => {
        const explorer = readFileSync(
            join(process.cwd(), "src/components/charts/WorkGraphExplorer.tsx"),
            "utf8",
        );
        expect(explorer).toContain('from "@/lib/workGraphNodeColors"');
        expect(explorer).not.toMatch(/const NODE_TYPE_COLOR_SOURCE\b/u);
        expect(explorer).toMatch(/NODE_TYPE_COLOR_SOURCE\[type\]/u);
    });

    it("the 11 dots keep 11 different colors", () => {
        expect(new Set(types.map((t) => nodeTypeDotClass(t))).size).toBe(types.length);
    });
});
