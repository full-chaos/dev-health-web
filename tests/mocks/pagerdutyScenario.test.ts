import { describe, expect, it } from "vitest";
import { setPagerDutyScenario, withPagerDutyCredentials } from "./pagerdutyScenario";

describe("PagerDuty mapping fixture", () => {
    it("injects a credential with a renderable OAuth configuration", () => {
        setPagerDutyScenario("mapping-fixture");

        const credentials = withPagerDutyCredentials([]);

        expect(credentials).toHaveLength(1);
        expect(credentials[0]?.config).toMatchObject({ auth_mode: "oauth" });
        setPagerDutyScenario("not-connected");
    });
});
