import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { AIViolationsList } from "../AIViolationsList";
import type { AiGovernanceViolationRow } from "@/lib/graphql/__generated__/types";

const violation: AiGovernanceViolationRow = {
    ruleId: "human-review-required",
    severity: "high",
    subjectType: "pr",
    subjectId: "123",
    teamId: "team-a",
    repoId: "repo-a",
    observedAt: "2026-05-01T00:00:00Z",
    evidence: "AI PR missing human review evidence",
};

describe("AIViolationsList", () => {
    it("renders loading state", () => {
        render(<AIViolationsList violations={[]} loading />);
        expect(screen.getByText("Loading governance findings…")).toBeInTheDocument();
    });

    it("renders empty state", () => {
        render(<AIViolationsList violations={[]} />);
        expect(screen.getByText(/No PR-scoped governance violations appear/)).toBeInTheDocument();
    });

    it("renders populated PR violations", () => {
        render(<AIViolationsList violations={[violation]} />);
        expect(screen.getByText("human-review-required")).toBeInTheDocument();
        expect(screen.getByText("PR 123")).toBeInTheDocument();
    });

    it("keeps the count, severity word, rule, PR, evidence text and the 8-row cap", () => {
        const many = Array.from({ length: 10 }, (_, n) => ({
            ...violation,
            subjectId: String(100 + n),
            evidence: `evidence ${n}`,
        }));
        render(<AIViolationsList violations={many} />);
        const list = screen.getByTestId("ai-violations-list");
        expect(list).toHaveTextContent("Security findings");
        expect(list).toHaveTextContent(
            "Recent PR-scoped policy violations associated with AI workflow artifacts.",
        );
        expect(screen.getByText("10")).toBeInTheDocument();
        expect(screen.getAllByText("high")).toHaveLength(8);
        expect(screen.getByText("PR 100")).toBeInTheDocument();
        expect(screen.getByText("evidence 7")).toBeInTheDocument();
        expect(screen.queryByText("PR 108")).not.toBeInTheDocument();
    });
});
