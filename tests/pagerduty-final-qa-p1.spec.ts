import { expect, test } from "@playwright/test";
import {
    captureScenario,
    collectBrowserSignals,
    resizeForScenario,
    setPagerDutyScenario,
    type QaScenario,
} from "./pagerduty-final-qa.helpers";

test.describe.configure({ mode: "serial" });

async function openSetup(
    page: import("@playwright/test").Page,
    scenario: QaScenario,
): Promise<ReturnType<typeof collectBrowserSignals>> {
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty");
    return signals;
}

test("P1 PagerDuty credentials use generic row actions", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "08-generic-credential-row-actions",
        priority: "P1",
        title: "PagerDuty credentials use generic row actions",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "mapping-fixture");
    const signals = await openSetup(page, scenario);
    const credentialsRegion = page.getByRole("region", { name: "PagerDuty credentials" });
    await expect(credentialsRegion.getByRole("table")).toBeVisible();
    await expect(credentialsRegion.getByRole("button", { name: "Manage" })).toBeVisible();
    await expect(credentialsRegion.getByRole("button", { name: "Test" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check connection status" })).toHaveCount(0);
    await captureScenario(page, testInfo, scenario, signals);
});
