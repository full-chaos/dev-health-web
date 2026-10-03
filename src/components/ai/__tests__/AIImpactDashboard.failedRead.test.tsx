import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

const { mockSummary, mockComparison } = vi.hoisted(() => ({
    mockSummary: vi.fn(),
    mockComparison: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIImpact", () => ({
    useAIImpactSummary: mockSummary,
    useAIComparison: mockComparison,
}));

import { AIImpactDashboard } from "../AIImpactDashboard";

const HOSTILE =
    "[GraphQL] aiImpactSummary is served by query-api and has no Python implementation (cmd/query-api/query_route.go)";
const filter = { startDate: "2026-04-20", endDate: "2026-05-19" };
const ok = { data: undefined, fetching: false, error: undefined };

describe("AIImpactDashboard: a failed read (CHAOS-8434)", () => {
    afterEach(() => {
        cleanup();
        vi.resetAllMocks();
    });

    it.each([
        ["the summary read", { ...ok, error: new Error(HOSTILE) }, ok],
        ["the comparison read", ok, { ...ok, error: new Error(HOSTILE) }],
    ])("fails with %s: plain sentence, never the backend text", (_name, summary, comparison) => {
        mockSummary.mockReturnValue(summary);
        mockComparison.mockReturnValue(comparison);
        const { container } = render(<AIImpactDashboard filter={filter} />);

        expect(screen.getByText("AI impact data could not load")).toBeInTheDocument();
        expect(screen.getByText("Could not be read")).toBeInTheDocument();
        expect(container.textContent).not.toContain("query-api");
        expect(container.textContent).not.toContain("Python");
    });
});
