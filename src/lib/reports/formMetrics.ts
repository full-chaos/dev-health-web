// `value` is what a report stores in `parameters.metrics`: the report registry metric name where the label has
// one. A label with no product chain yet (CHAOS-14111) keeps sending the label, which ops still maps for old reports.
export const FORM_METRICS: { label: string; value: string }[] = [
    { label: "Deployment Frequency", value: "Deployment Frequency" },
    { label: "Lead Time", value: "Lead Time" },
    { label: "Change Failure Rate", value: "change_failure_rate" },
    { label: "Time to Restore", value: "Time to Restore" },
    { label: "Test Coverage", value: "Test Coverage" },
    { label: "CI Success Rate", value: "success_rate" },
];

export function formMetricLabel(stored: string): string {
    return FORM_METRICS.find((metric) => metric.value === stored)?.label ?? stored;
}
