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

async function gotoWithSessionReady(page: Page, path: string): Promise<void> {
    const sessionResponse = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/session" &&
            response.request().method() === "GET",
    );
    await page.goto(path);
    expect((await sessionResponse).status()).toBe(200);
}

function recordBrowserFaults(page: Page): {
    readonly consoleErrors: string[];
    readonly pageErrors: string[];
    readonly sessionRequestFailures: string[];
} {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const sessionRequestFailures: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
        if (new URL(request.url()).pathname === "/api/auth/session") {
            sessionRequestFailures.push(
                `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
            );
        }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    return { consoleErrors, pageErrors, sessionRequestFailures };
}

async function expectHealthyBrowser(faults: ReturnType<typeof recordBrowserFaults>): Promise<void> {
    expect(faults.sessionRequestFailures).toEqual([]);
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
                await gotoWithSessionReady(page, "/work");
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

            await gotoWithSessionReady(page, "/agent-context/context-packet");
            await expect(page.getByTestId("data-state-not-entitled")).toBeVisible();
            if (scenario === "unprovisioned") {
                await page.screenshot({
                    path: testInfo.outputPath("denied-unprovisioned-375.png"),
                    fullPage: true,
                });
            }
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

    test("submits through the BFF, renders a live partial packet, and expands server-owned evidence", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");
        const browserRequests: string[] = [];
        page.on("request", (request) => browserRequests.push(request.url()));
        await page.goto("/agent-context/context-packet");

        await page.getByLabel(/Goal/).fill("e2e partial");
        const packetResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith("/api/agent-context/context-packets") &&
                response.request().method() === "POST",
        );
        await page.getByRole("button", { name: "Generate context" }).click();

        const bffPacketResponse = await packetResponse;
        expect({
            body: await bffPacketResponse.json(),
            contentType: bffPacketResponse.headers()["content-type"],
            status: bffPacketResponse.status(),
        }).toMatchObject({
            body: { schema_version: "context_packet.v1" },
            contentType: expect.stringContaining("application/json"),
            status: 200,
        });
        await expect(page.getByRole("heading", { name: "e2e partial" })).toBeVisible();
        await expect(page.getByText("partial", { exact: true })).toBeVisible();
        await page.screenshot({
            path: testInfo.outputPath("happy-packet-1280.png"),
            fullPage: true,
        });
        await page.setViewportSize({ width: 768, height: 768 });
        const evidenceResponse = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname.startsWith("/api/agent-context/evidence/") &&
                response.request().method() === "GET",
        );
        await page.getByRole("button", { name: "Open evidence" }).click();
        const bffEvidenceResponse = await evidenceResponse;
        expect({
            body: await bffEvidenceResponse.json(),
            status: bffEvidenceResponse.status(),
        }).toMatchObject({
            body: { schema_version: "expanded_evidence.v1" },
            status: 200,
        });
        await expect(
            page.getByText(
                "ACR Security: Implement scoped client credentials and repository authorization",
            ),
        ).toBeVisible();
        expect(browserRequests.some((url) => url.includes(":8013"))).toBe(false);
        await page.screenshot({
            path: testInfo.outputPath("expanded-evidence-768.png"),
            fullPage: true,
        });
    });

    for (const [goal, expected] of [
        ["e2e empty", "No context matched this scope"],
        ["e2e degraded", "Partial context is available"],
        ["e2e error", "Context Fabric response could not be generated"],
    ] as const) {
        test(`renders the live ${goal} terminal outcome`, async ({ page }) => {
            await setEntitlementScenario(page.request, "provisioned");
            await page.goto("/agent-context/context-packet");

            await page.getByLabel(/Goal/).fill(goal);
            await page.getByRole("button", { name: "Generate context" }).click();

            const terminalState = page.getByRole("status");
            await expect(terminalState).toContainText(expected);
            await expect(terminalState).toBeFocused();
        });
    }
});
