/**
 * The home metric behind each Diagnose signal that is read from the home payload (value from
 * `deltas[metric]`, severity from `signals[metric]`). The other signals have no home metric.
 * One place, so the page's evidence subject names the same metric the card shows.
 */
export const DIAGNOSE_HOME_METRIC = {
    flow: "deploy_freq",
    code: "churn",
    bottleneck: "wip_saturation",
} as const satisfies Record<string, string>;
