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
});
