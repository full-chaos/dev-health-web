export type MetricDefinition = {
    metric: string;
    whyItMatters: string;
    suggestedActions: Array<{
        id: string;
        label: string;
        type: "experiment" | "process" | "tooling";
    }>;
};

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
    cycle_time: {
        metric: "cycle_time",
        whyItMatters:
            "Cycle time measures the speed of your delivery pipeline. High cycle time often indicates friction in code review, testing, or deployment processes.",
        suggestedActions: [
            { id: "smaller-prs", label: "Encourage smaller PRs", type: "process" },
            { id: "ci-optimization", label: "Optimize CI pipeline", type: "tooling" },
            { id: "review-sla", label: "Set review response SLAs", type: "process" },
        ],
    },
    review_latency: {
        metric: "review_latency",
        whyItMatters:
            "Review latency tracks how long code waits for feedback. Long delays here cause context switching and slow down the entire team.",
        suggestedActions: [
            { id: "code-owners", label: "Update CODEOWNERS", type: "process" },
            { id: "pair-review", label: "Try synchronous pair reviews", type: "experiment" },
            { id: "review-time", label: "Block out daily review time", type: "process" },
        ],
    },
    throughput: {
        metric: "throughput",
        whyItMatters:
            "Throughput indicates the volume of value delivered. A drop in throughput might signal blocked work, technical debt, or resource constraints.",
        suggestedActions: [
            { id: "wip-limits", label: "Review WIP limits", type: "process" },
            { id: "debt-sprint", label: "Schedule tech debt sprint", type: "process" },
        ],
    },
    wip: {
        metric: "wip",
        whyItMatters:
            "Work In Progress (WIP) represents active investment. High WIP often leads to context switching and reduced throughput.",
        suggestedActions: [
            { id: "stop-starting", label: "Stop starting, start finishing", type: "process" },
            { id: "kanban", label: "Visualize flow with Kanban", type: "tooling" },
        ],
    },
    churn: {
        metric: "churn",
        whyItMatters:
            "Code churn (rework) can indicate unclear requirements, technical debt, or flaky tests. High churn reduces overall efficiency.",
        suggestedActions: [
            { id: "spec-review", label: "Review specs before coding", type: "process" },
            { id: "refactor", label: "Refactor complex modules", type: "experiment" },
        ],
    },
    check_failure_rate: {
        metric: "check_failure_rate",
        whyItMatters:
            "High failure rates in CI/CD checks cause frustration and delays. It often points to flaky tests or brittle environments.",
        suggestedActions: [
            { id: "fix-flaky", label: "Quarantine flaky tests", type: "tooling" },
            { id: "local-repro", label: "Improve local reproduction", type: "tooling" },
        ],
    },
};

export const getMetricDefinition = (metric: string): MetricDefinition | undefined => {
    return METRIC_DEFINITIONS[metric];
};
