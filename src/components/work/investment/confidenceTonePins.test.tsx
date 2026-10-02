import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { NodeDetailPanel } from "../GraphView";
import { CONFIDENCE_TONE } from "./ConfidencePanel";
import { InvestmentExplainer } from "./InvestmentExplainer";
import { ReadWithContextCard } from "./ReadWithContextCard";

// Pins of the confidence pills and the node-type dots before the palette move (CHAOS-7882).

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

const LEVELS = ["high", "moderate", "low", undefined] as const;
const pillOf = (text: string) =>
    screen.getAllByText(text).find((e) => e.className.includes("rounded-full"))!;

describe("confidence pills (pins)", () => {
    it("CONFIDENCE_TONE has one entry each for high, moderate and low, all different", () => {
        expect(Object.keys(CONFIDENCE_TONE).sort()).toEqual(["high", "low", "moderate"]);
        expect(new Set(Object.values(CONFIDENCE_TONE)).size).toBe(3);
    });

    it.each(LEVELS)("the explainer pill for %s shows the level word, or 'unknown'", (level) => {
        render(
            <InvestmentExplainer
                mixExplanation={explained(level) as never}
                mixExplainKey="k"
                isExplainingMix={false}
                onRegenerate={() => {}}
            />,
        );
        expect(pillOf(level ?? "unknown")).toBeInTheDocument();
    });

    it.each(LEVELS)("the context card pill for %s shows the level word, or 'unknown'", (level) => {
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
        expect(pillOf(level ?? "unknown")).toBeInTheDocument();
    });

    it("the three levels and 'unknown' get four different pill classes in the explainer", () => {
        const seen = new Set<string>();
        for (const level of LEVELS) {
            const { unmount } = render(
                <InvestmentExplainer
                    mixExplanation={explained(level) as never}
                    mixExplainKey="k"
                    isExplainingMix={false}
                    onRegenerate={() => {}}
                />,
            );
            seen.add(pillOf(level ?? "unknown").className);
            unmount();
        }
        expect(seen.size).toBe(4);
    });
});

const TYPES = [
    "ISSUE",
    "PR",
    "COMMIT",
    "FILE",
    "RELEASE",
    "FEATURE_FLAG",
    "AI_WORKFLOW_RUN",
    "DIFF",
    "REVIEW_OUTCOME",
    "DEPLOYMENT",
    "INCIDENT",
] as const;

describe("node detail panel dots (pins)", () => {
    it("every node type has a filled 3x3 dot, and the 11 dot classes are all different", () => {
        const classes = new Set<string>();
        for (const type of TYPES) {
            const { container, unmount } = render(
                <NodeDetailPanel
                    node={{ id: "n1", type }}
                    incomingEdges={[]}
                    outgoingEdges={[]}
                    onClose={() => {}}
                />,
            );
            const dot = container.querySelector("span.w-3.h-3") as HTMLElement;
            expect(dot, type).not.toBeNull();
            expect(dot.className, type).toMatch(/\bbg-/);
            classes.add(dot.className);
            unmount();
        }
        expect(classes.size).toBe(TYPES.length);
    });
});
