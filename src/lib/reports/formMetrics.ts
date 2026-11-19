// `value` is what a report stores in `parameters.metrics`: the report registry metric name of the product metric
// behind the label. The form offers only labels that have one. Reports saved earlier may hold the former label
// "Deployment Frequency" (ops still charts it) or labels that no longer exist here (ops skips them).
export const FORM_METRICS: { label: string; value: string }[] = [
    { label: "Deploy Frequency", value: "deployments_count" },
    { label: "Change Failure Rate", value: "change_failure_rate" },
    { label: "CI Success Rate", value: "success_rate" },
];

const FORMER_LABELS: Record<string, string> = { "Deployment Frequency": "Deploy Frequency" };

export function formMetricLabel(stored: string): string {
    return (
        FORM_METRICS.find((metric) => metric.value === stored)?.label ??
        FORMER_LABELS[stored] ??
        stored
    );
}
