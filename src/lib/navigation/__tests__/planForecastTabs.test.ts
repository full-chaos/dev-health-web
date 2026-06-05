import { describe, it, expect } from "vitest";

import { planForecastTabs } from "../planForecastTabs";
import { defaultMetricFilter } from "@/lib/filters/defaults";

// CHAOS-2079 / J4 remediation: the Plan forecast surfaces must expose BOTH the
// Delivery Forecast summary and the real Monte Carlo distribution as sibling
// tabs. The "Monte Carlo" tab must point at the real forecast route
// (/plan/capacity), not self-link back to the summary.
describe("planForecastTabs", () => {
  it("returns the Delivery Forecast and Monte Carlo tabs in order", () => {
    const tabs = planForecastTabs(defaultMetricFilter);
    expect(tabs.map((t) => t.id)).toEqual(["delivery-forecast", "monte-carlo"]);
    expect(tabs.map((t) => t.label)).toEqual(["Delivery Forecast", "Monte Carlo"]);
  });

  it("points Delivery Forecast at /plan/delivery-forecast", () => {
    const [delivery] = planForecastTabs(defaultMetricFilter);
    expect(delivery.href).toContain("/plan/delivery-forecast");
  });

  it("points Monte Carlo at the real forecast route /plan/capacity (not a self-link)", () => {
    const monteCarlo = planForecastTabs(defaultMetricFilter).find((t) => t.id === "monte-carlo");
    expect(monteCarlo?.href).toContain("/plan/capacity");
    expect(monteCarlo?.href).not.toContain("/plan/delivery-forecast");
  });

  it("preserves the filter param on each destination", () => {
    const tabs = planForecastTabs(defaultMetricFilter);
    for (const tab of tabs) {
      expect(tab.href).toContain("f=");
    }
  });

  it("threads the active role through when provided", () => {
    const tabs = planForecastTabs(defaultMetricFilter, "leadership");
    for (const tab of tabs) {
      expect(tab.href).toContain("role=leadership");
    }
  });
});
