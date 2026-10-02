// The tabs of the Metrics page: which metrics each shows and its landscape. Kept out of the page
// file so a test can check that every metric on a tab has a catalog polarity.
export type QuadrantType = "churn_throughput" | "cycle_throughput" | "wip_throughput";

export type MetricTab = {
    id: string;
    label: string;
    description: string;
    metrics: string[];
    highlight: string;
    quadrant: {
        type: QuadrantType;
        title: string;
        description: string;
    };
};

export const METRIC_TABS: MetricTab[] = [
    {
        id: "dora",
        label: "DORA",
        description: "Release speed and stability.",
        metrics: ["deploy_freq", "cycle_time", "change_failure_rate", "review_latency"],
        highlight: "deploy_freq",
        quadrant: {
            type: "churn_throughput",
            title: "Churn × Throughput landscape",
            description: "Operating modes under change volume and delivery pace.",
        },
    },
    {
        id: "flow",
        label: "Flow",
        description: "From idea to merge.",
        metrics: ["cycle_time", "review_latency", "throughput", "wip_saturation"],
        highlight: "cycle_time",
        quadrant: {
            type: "cycle_throughput",
            title: "Cycle Time × Throughput landscape",
            description: "Coordination debt and delivery efficiency.",
        },
    },
    {
        id: "throughput",
        label: "Throughput",
        description: "Delivery volume and pacing.",
        metrics: ["throughput", "deploy_freq", "wip_saturation", "blocked_work"],
        highlight: "throughput",
        quadrant: {
            type: "wip_throughput",
            title: "WIP × Throughput landscape",
            description: "Work-in-progress saturation and delivery capacity.",
        },
    },
];
