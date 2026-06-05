import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

// Plan forecast sub-views (CHAOS-2079 / J4 remediation). The two surfaces share
// one ModeTabs strip so they read as sibling views of the same Plan screen:
//   - "Delivery Forecast" → rolling-throughput summary (P50/P75/P90 weeks, risk
//     overlays) at /plan/delivery-forecast.
//   - "Monte Carlo" → the real percentile distribution forecast
//     (ConfidenceBandChart + ThroughputHistogram) at /plan/capacity.
export type PlanForecastView = "delivery-forecast" | "monte-carlo";

export type PlanForecastTab = {
  id: PlanForecastView;
  label: string;
  href: string;
};

/**
 * Build the shared Plan forecast tab strip, preserving the active filter +
 * role context on every destination.
 */
export function planForecastTabs(filters: MetricFilter, role?: string): PlanForecastTab[] {
  return [
    {
      id: "delivery-forecast",
      label: "Delivery Forecast",
      href: withFilterParam("/plan/delivery-forecast", filters, role),
    },
    {
      id: "monte-carlo",
      label: "Monte Carlo",
      href: withFilterParam("/plan/capacity", filters, role),
    },
  ];
}
