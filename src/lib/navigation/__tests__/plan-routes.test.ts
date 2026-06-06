import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "src/app/(app)");
const readRoute = (route: string) => readFileSync(join(appRoot, route, "page.tsx"), "utf8");

describe("Plan route placement", () => {
    it("renders the Delivery Forecast dashboard directly on /plan", () => {
        const source = readRoute("plan");

        expect(source).toContain("getThroughputForecastViaGraphQL");
        expect(source).toContain("Delivery confidence");
        expect(source).toContain("Rolling throughput");
        expect(source).toContain("Primary risk callout");
        expect(source).not.toContain("AreaOverview");
    });

    it("keeps /plan/delivery-forecast as a redirect alias to /plan", () => {
        const source = readRoute("plan/delivery-forecast");

        expect(source).toContain('import { redirect } from "next/navigation"');
        expect(source).toContain('redirect(`/plan${suffix ? `?${suffix}` : ""}`)');
        expect(source).not.toContain("getThroughputForecastViaGraphQL");
    });

    it("renders Capacity Forecast as one Monte Carlo method view with no tab strip", () => {
        const source = readRoute("plan/capacity");

        expect(source).toContain("Capacity Forecast");
        expect(source).toContain("CapacityView");
        expect(source).toContain("completion projection");
        expect(source).toContain("throughput distribution");
        expect(source).toContain("confidence bands");
        expect(source).not.toContain("ModeTabs");
        expect(source).not.toContain("planForecastTabs");
        expect(source).not.toContain("Monte Carlo Forecast");
    });
});
