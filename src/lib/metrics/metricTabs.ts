// The tabs of the Metrics page: which metrics each shows and its landscape. Kept out of the page
// file so a test can check that every metric on a tab has a catalog polarity.
import { getTabSet, type TabIdOf } from "@/lib/navigation/tabs";

export type QuadrantType = "churn_throughput" | "cycle_throughput" | "wip_throughput";

export type MetricTabData = {
    description: string;
    metrics: string[];
    highlight: string;
    quadrant: {
        type: QuadrantType;
        title: string;
        description: string;
    };
};

const METRIC_TAB_DATA: Record<TabIdOf<"metrics">, MetricTabData> = {
    dora: {
        description: "Release speed and stability.",
        metrics: ["deploy_freq", "cycle_time", "change_failure_rate", "review_latency"],
        highlight: "deploy_freq",
        quadrant: {
            type: "churn_throughput",
            title: "Churn × Throughput landscape",
            description: "Operating modes under change volume and delivery pace.",
        },
    },
    flow: {
        description: "From idea to merge.",
        metrics: ["cycle_time", "review_latency", "throughput", "wip_saturation"],
        highlight: "cycle_time",
        quadrant: {
            type: "cycle_throughput",
            title: "Cycle Time × Throughput landscape",
            description: "Coordination debt and delivery efficiency.",
        },
    },
    throughput: {
        description: "Delivery volume and pacing.",
        metrics: ["throughput", "deploy_freq", "wip_saturation", "blocked_work"],
        highlight: "throughput",
        quadrant: {
            type: "wip_throughput",
            title: "WIP × Throughput landscape",
            description: "Work-in-progress saturation and delivery capacity.",
        },
    },
};

export type MetricTab = MetricTabData & { id: TabIdOf<"metrics">; label: string };

/** The Metrics tabs: the id, label and order come from the tab registry, the data from above. */
export const METRIC_TABS: MetricTab[] = getTabSet("metrics").tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    ...METRIC_TAB_DATA[tab.id],
}));
