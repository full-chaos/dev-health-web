import type {
  AIWorkflowDrilldownResult,
  AIWorkflowRootTypeInput,
  WorkUnitInvestmentDistribution,
} from "@/lib/graphql/types";

const issueInvestment: WorkUnitInvestmentDistribution = {
  workUnitId: "PROJ-101",
  themeDistribution: {
    feature_delivery: 0.72,
    quality: 0.18,
    maintenance: 0.1,
  },
  subcategoryDistribution: {
    "feature_delivery.customer": 0.46,
    "feature_delivery.roadmap": 0.26,
    "quality.testing": 0.18,
    "maintenance.debt": 0.1,
  },
  evidenceQuotes: [
    {
      quote: "Launch customer onboarding flow and verify activation telemetry.",
      sourceType: "issue",
      sourceId: "PROJ-101",
    },
  ],
};

const prInvestment: WorkUnitInvestmentDistribution = {
  workUnitId: "PR-201",
  themeDistribution: {
    feature_delivery: 0.62,
    quality: 0.28,
    operational: 0.1,
  },
  subcategoryDistribution: {
    "feature_delivery.customer": 0.42,
    "feature_delivery.enablement": 0.2,
    "quality.testing": 0.28,
    "operational.support": 0.1,
  },
  evidenceQuotes: [
    {
      quote: "Fixes PROJ-101 with reviewer sign-off and staging deployment.",
      sourceType: "pr",
      sourceId: "PR-201",
    },
  ],
};

export function demoInvestmentForRoot(
  rootType: AIWorkflowRootTypeInput,
  rootId: string,
): WorkUnitInvestmentDistribution {
  const base = rootType === "PR" ? prInvestment : issueInvestment;
  return { ...base, workUnitId: rootId };
}

export function demoWorkflowDrilldown(
  rootType: AIWorkflowRootTypeInput,
  rootId: string,
  orgId = "meridian",
): AIWorkflowDrilldownResult {
  const isPr = rootType === "PR";
  const issueId = isPr ? "PROJ-101" : rootId;
  const prId = isPr ? rootId : "PR-201";
  return {
    orgId,
    rootType,
    rootId,
    partial: false,
    dataAvailable: true,
    nodes: [
      { nodeType: "ISSUE", nodeId: issueId },
      { nodeType: "PR", nodeId: prId },
      { nodeType: "REVIEW_OUTCOME", nodeId: "review-approved" },
      { nodeType: "COMMIT", nodeId: "abc123" },
      { nodeType: "DEPLOYMENT", nodeId: "deploy-123" },
      { nodeType: "INCIDENT", nodeId: "inc-42" },
    ],
    edges: [
      {
        edgeId: "demo-issue-pr",
        sourceType: "ISSUE",
        sourceId: issueId,
        targetType: "PR",
        targetId: prId,
        edgeType: "FIXES",
        confidence: 1,
        source: "demo-fixture",
        evidence: `Fixes ${issueId}`,
        provider: "github",
        repoId: "repo:web-app",
      },
      {
        edgeId: "demo-pr-review",
        sourceType: "PR",
        sourceId: prId,
        targetType: "REVIEW_OUTCOME",
        targetId: "review-approved",
        edgeType: "HAS_REVIEW_OUTCOME",
        confidence: 0.96,
        source: "demo-fixture",
        evidence: "Approved after accessibility copy updates.",
        provider: "github",
        repoId: "repo:web-app",
      },
      {
        edgeId: "demo-pr-commit",
        sourceType: "PR",
        sourceId: prId,
        targetType: "COMMIT",
        targetId: "abc123",
        edgeType: "CONTAINS",
        confidence: 1,
        source: "demo-fixture",
        evidence: "Merge commit abc123",
        provider: "github",
        repoId: "repo:web-app",
      },
      {
        edgeId: "demo-pr-deploy",
        sourceType: "PR",
        sourceId: prId,
        targetType: "DEPLOYMENT",
        targetId: "deploy-123",
        edgeType: "DEPLOYS",
        confidence: 0.91,
        source: "demo-fixture",
        evidence: "Staging deployment completed 45 minutes after merge.",
        provider: "github",
        repoId: "repo:web-app",
      },
      {
        edgeId: "demo-deploy-incident",
        sourceType: "DEPLOYMENT",
        sourceId: "deploy-123",
        targetType: "INCIDENT",
        targetId: "inc-42",
        edgeType: "LINKED_INCIDENT",
        confidence: 0.74,
        source: "demo-fixture",
        evidence: "Incident opened inside the post-deploy observation window.",
        provider: "github",
        repoId: "repo:web-app",
      },
    ],
  };
}
