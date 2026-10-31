import { expect, test, type APIRequestContext } from "@playwright/test";

// CHAOS-12170 race canary (a of 2). The mock's entitlement scenario is process-global: a spec that
// sets it must never overlap another spec that sets it. This file and its pair set OPPOSITE
// scenarios at staggered times and hold them across a reload; run in parallel they read each
// other's scenario and fail, run in the serial entitlement-scenario project they pass. Each
// entitlement-flipping spec belongs to that project (playwright.config.ts).
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test("with entitlements provisioned, the Ask Dev launcher stays visible for the whole test", async ({
    page,
    request,
}) => {
    await page.waitForTimeout(0);
    await setScenario(request, "provisioned");
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Open Ask Dev" })).toBeVisible({
        timeout: 10_000,
    });
    // Hold the scenario across a later page load: a parallel spec's flip would show here.
    await page.waitForTimeout(2000);
    await page.reload();
    await expect(page.getByRole("button", { name: "Open Ask Dev" })).toBeVisible({
        timeout: 10_000,
    });
});
