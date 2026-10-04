import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "src/app/(app)");
const readRoute = (route: string) => readFileSync(join(appRoot, route, "page.tsx"), "utf8");

describe("Plan route placement", () => {
    it("renders the Delivery Forecast dashboard directly on /plan", () => {
        const source = readRoute("plan");

        expect(source).toContain("getThroughputForecastViaGraphQL");
        expect(source).toContain("Open items");
        expect(source).toContain("Rolling throughput");
        // The primary risk is folded into the Risk checks inset, not a stand-alone callout.
        expect(source).toContain("forecast.primaryRisk.label");
        expect(source).not.toContain("Primary risk callout");
        expect(source).not.toContain("AreaOverview");
    });

    it("labels forecast bands with the GraphQL percentile fields actually rendered", () => {
        const source = readRoute("plan");

        expect(source).toContain('["P50 forecast", forecast.p50Weeks]');
        expect(source).toContain('["P75 forecast", forecast.p75Weeks]');
        expect(source).toContain('["P90 forecast", forecast.p90Weeks]');
        expect(source).not.toContain('["P85", forecast.p75Weeks]');
        expect(source).not.toContain('["P95", forecast.p90Weeks]');
    });

    it("keeps /plan/delivery-forecast as a redirect alias to /plan", () => {
        const source = readRoute("plan/delivery-forecast");

        expect(source).toContain('import { redirect } from "next/navigation"');
        expect(source).toContain('redirect(`/plan${suffix ? `?${suffix}` : ""}`)');
        expect(source).not.toContain("getThroughputForecastViaGraphQL");
    });

    it("renders Completion Forecast as one Monte Carlo method view with no tab strip", () => {
        const source = readRoute("plan/capacity");

        expect(source).toContain("Completion Forecast");
        expect(source).toContain("CapacityView");
        // The subtitle names only what the page draws: the Completion range card (CHAOS-8477).
        expect(source).toContain("Monte Carlo is the method behind this completion range.");
        // CHAOS-7990: the page draws no throughput distribution, so the subtitle names none.
        expect(source).not.toContain("throughput distribution");
        // The burn-down chart and its bands are not on the page.
        expect(source).not.toContain("completion projection");
        expect(source).not.toContain("confidence bands");
        expect(source).not.toContain("ModeTabs");
        expect(source).not.toContain("planForecastTabs");
        expect(source).not.toContain("Monte Carlo Forecast");
    });
});
