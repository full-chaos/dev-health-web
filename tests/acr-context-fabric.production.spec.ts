import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ENTITLEMENT_SCENARIOS = ["provisioned", "unprovisioned", "invalid", "error"] as const;
type EntitlementScenario = (typeof ENTITLEMENT_SCENARIOS)[number];

const viewports = [
    { name: "1280", width: 1280, height: 768 },
    { name: "768", width: 768, height: 768 },
    { name: "375", width: 375, height: 812 },
] as const;

async function setEntitlementScenario(
    request: APIRequestContext,
    scenario: EntitlementScenario,
): Promise<void> {
    const response = await request.post("http://127.0.0.1:8012/__test/entitlements", {
        data: { scenario },
    });
    expect(response.ok()).toBe(true);
}

async function expectNoAcrRequests(request: APIRequestContext): Promise<void> {
    const response = await request.get("http://127.0.0.1:8012/__test/acr-requests");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ count: 0 });
}

function recordBrowserFaults(page: Page): {
    readonly consoleErrors: string[];
    readonly pageErrors: string[];
} {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    return { consoleErrors, pageErrors };
}

async function expectHealthyBrowser(faults: ReturnType<typeof recordBrowserFaults>): Promise<void> {
    await expect.poll(() => faults.consoleErrors).toEqual([]);
    expect(faults.pageErrors).toEqual([]);
}

test.describe("Context Fabric production entitlement boundary", () => {
    test.describe.configure({ mode: "serial" });

    test("shows one current Context Fabric destination for a provisioned organization at every viewport", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");
        const faults = recordBrowserFaults(page);

        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto("/agent-context/context-packet");

            if (viewport.width < 768) {
                await page.getByRole("button", { name: "Show navigation" }).click();
            }

            const links = page.getByRole("link", { name: "Context Fabric", exact: true });
            await expect(links).toHaveCount(1);
            await expect(links).toHaveAttribute("aria-current", "page");
            await expect(links).toHaveAttribute("href", /\/agent-context\/context-packet/);
            await page.screenshot({
                path: testInfo.outputPath(`provisioned-${viewport.name}.png`),
                fullPage: true,
            });
        }

        await expectHealthyBrowser(faults);
    });

    for (const scenario of ENTITLEMENT_SCENARIOS.filter((scenario) => scenario !== "provisioned")) {
        test(`hides Context Fabric and denies the direct route when entitlement is ${scenario}`, async ({
            page,
        }, testInfo) => {
            await setEntitlementScenario(page.request, scenario);
            const faults = recordBrowserFaults(page);
            const scenarioViewports = scenario === "unprovisioned" ? viewports : [viewports[0]];
            for (const viewport of scenarioViewports) {
                await page.setViewportSize(viewport);
                await page.goto("/work");
                if (viewport.width < 768) {
                    await page.getByRole("button", { name: "Show navigation" }).click();
                }
                await expect(
                    page.getByRole("link", { name: "Context Fabric", exact: true }),
                ).toHaveCount(0);
                await page.screenshot({
                    path: testInfo.outputPath(`hidden-${scenario}-${viewport.name}.png`),
                    fullPage: true,
                });
            }

            await page.goto("/agent-context/context-packet");
            await expect(page.getByTestId("data-state-not-entitled")).toBeVisible();
            await expectNoAcrRequests(page.request);
            await expectHealthyBrowser(faults);
        });
    }

    test("closes mobile navigation with Escape and restores focus to its control", async ({
        page,
    }) => {
        await setEntitlementScenario(page.request, "provisioned");
        const faults = recordBrowserFaults(page);
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto("/agent-context/context-packet");

        const navigationControl = page.getByRole("button", { name: "Show navigation" });
        await navigationControl.click();
        await expect(page.getByRole("link", { name: "Context Fabric", exact: true })).toHaveCount(
            1,
        );
        await page.keyboard.press("Escape");

        await expect(navigationControl).toBeFocused();
        await expect(navigationControl).toHaveAttribute("aria-expanded", "false");
        await expectHealthyBrowser(faults);
    });
});
