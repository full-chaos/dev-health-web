import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11926 (plan 2.5): exactly one Ask Dev launcher is visible per breakpoint; it is hidden on
// the excluded routes and when an entitlement is off; opening it sends no request.
// The shell reads the organization's entitlements on every page load, and the mock backend serves
// the scenario that is set here. One worker keeps another spec from replacing it.
const MOCK = "http://127.0.0.1:8001";
const LAUNCHER = { name: "Open Ask Dev" } as const;

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

function askDevRequests(page: Page): string[] {
    const urls: string[] = [];
    page.on("request", (request) => {
        if (/\/api\/ask-dev|\/api\/v1\/dev|context-fabric\/investigations/u.test(request.url())) {
            urls.push(request.url());
        }
    });
    return urls;
}

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
] as const) {
    test.describe(`${viewport.name} (${viewport.width}px)`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } });

        test("shows exactly one launcher, and opening it sends no request", async ({
            page,
            request,
        }, testInfo) => {
            await setScenario(request, "provisioned");
            const requests = askDevRequests(page);
            await page.goto("/dashboard");

            const launcher = page.getByRole("button", LAUNCHER);
            // getByRole leaves out the bar that the breakpoint hides: one is the visible one.
            await expect(launcher).toHaveCount(1);
            await expect(launcher).toBeVisible();
            await expect(launcher).toHaveAttribute("aria-expanded", "false");
            await page.screenshot({
                path: testInfo.outputPath(`launcher-${viewport.name}-closed.png`),
            });

            await launcher.click();

            await expect(launcher).toHaveAttribute("aria-expanded", "true");
            await page.screenshot({
                path: testInfo.outputPath(`launcher-${viewport.name}-open.png`),
            });
            expect(requests).toEqual([]);
        });

        test("shows no launcher when agent_context_runtime is off", async ({ page, request }) => {
            await setScenario(request, "unprovisioned");
            await page.goto("/dashboard");
            await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
            await expect(page.getByRole("button", LAUNCHER)).toHaveCount(0);
        });

        test("shows no launcher on an excluded route", async ({ page, request }) => {
            await setScenario(request, "provisioned");
            await page.goto("/superadmin/context-fabric/validation");
            await expect(
                page.getByRole("heading", { name: "Context Fabric Validation", level: 1 }),
            ).toBeVisible();

            await expect(page.getByRole("button", LAUNCHER)).toHaveCount(0);

            await page.goto("/dashboard");
            await expect(page.getByRole("button", LAUNCHER)).toHaveCount(1);
        });
    });
}
