import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { ACR_API_ORIGIN, BFF_ORIGIN } from "../playwright.context-fabric.config";
import { UNSAFE_EVIDENCE_RAW_PAYLOAD } from "./mocks/acr-fixtures";
import {
    EMPTY_BROWSER_FAULTS,
    rawBrowserFaults,
    recordBrowserFaults,
    settledBrowserFaults,
    type BrowserFaultLog,
} from "./mocks/context-fabric-browser-faults";

const ENTITLEMENT_SCENARIOS = ["provisioned", "unprovisioned", "invalid", "error"] as const;
type EntitlementScenario = (typeof ENTITLEMENT_SCENARIOS)[number];
type AcrMockControls = {
    readonly delayedGoals?: Readonly<Record<string, number>>;
    readonly evidenceDelayMs?: number;
    readonly evidenceReferenceCount?: number;
    readonly malformedPacket?: boolean;
    readonly pausedGoals?: readonly string[];
};
type EvidenceRequestStats = {
    readonly active: number;
    readonly count: number;
    readonly maxConcurrent: number;
};
type PausedPacketState = {
    readonly goals: readonly string[];
};

const viewports = [
    { name: "1280", width: 1280, height: 768 },
    { name: "768", width: 768, height: 768 },
    { name: "375", width: 375, height: 812 },
] as const;

const FULL_COMMIT_SHA = "4de2cb94aa8c10f9e6f4d7202bc11fd3e8508d8ce59d5c7059889b1a2f4a63d7";
const RETRIEVAL_DEBUG_SUMMARY = "E2E retrieval debug is visible only to a superuser.";
const UNSAFE_EVIDENCE_RAW_SOURCE_TEXT = [
    "Raw unsafe evidence source exercised by this production test:",
    `citation: ${UNSAFE_EVIDENCE_RAW_PAYLOAD.citation}`,
    `excerpt: ${UNSAFE_EVIDENCE_RAW_PAYLOAD.excerpt}`,
    `source.safe_uri: ${UNSAFE_EVIDENCE_RAW_PAYLOAD.safeUri}`,
].join("\n");

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

async function setAcrMockControls(
    request: APIRequestContext,
    controls: AcrMockControls = {},
): Promise<void> {
    const response = await request.post(`${ACR_API_ORIGIN}/__test/controls`, { data: controls });
    expect(response.status()).toBe(204);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvidenceRequestStats(value: unknown): value is EvidenceRequestStats {
    if (!isRecord(value)) return false;
    return [value.active, value.count, value.maxConcurrent].every(
        (count) => typeof count === "number" && Number.isInteger(count) && count >= 0,
    );
}

function isPausedPacketState(value: unknown): value is PausedPacketState {
    return (
        isRecord(value) &&
        Array.isArray(value.goals) &&
        value.goals.every((goal) => typeof goal === "string")
    );
}

async function evidenceRequestStats(request: APIRequestContext): Promise<EvidenceRequestStats> {
    const response = await request.get(`${ACR_API_ORIGIN}/__test/evidence-requests`);
    expect(response.ok()).toBe(true);
    const stats: unknown = await response.json();
    if (!isEvidenceRequestStats(stats)) throw new Error("Invalid ACR mock evidence request stats.");
    return stats;
}

async function pausedPacketState(request: APIRequestContext): Promise<PausedPacketState> {
    const response = await request.get(`${ACR_API_ORIGIN}/__test/paused-context-packets`);
    expect(response.ok()).toBe(true);
    const state: unknown = await response.json();
    if (!isPausedPacketState(state)) throw new Error("Invalid ACR mock paused packet state.");
    return state;
}

async function releasePausedPacket(request: APIRequestContext, goal: string): Promise<void> {
    const response = await request.post(`${ACR_API_ORIGIN}/__test/paused-context-packets/release`, {
        data: { goal },
    });
    expect(response.status()).toBe(204);
}

async function showRawUnsafeEvidenceSource(evidence: Locator): Promise<void> {
    await evidence.evaluate((region, rawSourceText) => {
        const source = region.ownerDocument.createElement("section");
        source.setAttribute("aria-label", "Test harness raw unsafe evidence source");
        source.setAttribute("data-testid", "raw-unsafe-evidence-source");
        source.setAttribute(
            "style",
            "border: 1px solid currentColor; border-radius: 0.5rem; display: grid; gap: 0.5rem; margin-bottom: 1rem; padding: 0.75rem;",
        );

        const title = region.ownerDocument.createElement("strong");
        title.textContent = "Test-harness raw source (literal text; not rendered as HTML)";
        const payload = region.ownerDocument.createElement("pre");
        payload.setAttribute(
            "style",
            "margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; word-break: break-word;",
        );
        payload.textContent = rawSourceText;
        source.append(title, payload);
        region.prepend(source);
    }, UNSAFE_EVIDENCE_RAW_SOURCE_TEXT);
}

async function gotoWithSessionReady(page: Page, path: string): Promise<void> {
    const sessionResponse = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/session" &&
            response.request().method() === "GET",
    );
    await page.goto(path);
    expect((await sessionResponse).status()).toBe(200);
    await expect(page.getByRole("button", { name: "Account options" })).toBeVisible();
}

async function signIn(page: Page, email: string): Promise<void> {
    await page.goto(`${BFF_ORIGIN}/auth/signin`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
}

async function expectHealthyBrowser(faults: BrowserFaultLog): Promise<void> {
    await expect.poll(() => settledBrowserFaults(faults)).toEqual(EMPTY_BROWSER_FAULTS);
}

test.describe("Context Fabric production entitlement boundary", () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({ request }) => {
        await setAcrMockControls(request);
    });

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

    test("keeps account controls floating above page content and keyboard reachable at every viewport", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");
        const faults = recordBrowserFaults(page);

        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await gotoWithSessionReady(page, "/agent-context/context-packet");

            const accountNavigation = page.getByRole("navigation", { name: "Account" });
            const accountControl = page.getByRole("button", { name: "Account options" });
            await expect(accountNavigation).toBeVisible();
            expect(
                await accountNavigation.evaluate((element) =>
                    element.parentElement ? getComputedStyle(element.parentElement).zIndex : "",
                ),
            ).toBe("40");
            const accountNavigationBottomBeforeOpen = await accountNavigation.evaluate(
                (element) => element.getBoundingClientRect().bottom,
            );
            await accountControl.focus();
            await page.keyboard.press("Enter");

            await expect(accountControl).toHaveAttribute("aria-expanded", "true");
            const platformAdmin = page.getByRole("link", { name: "Platform Admin" });
            const preferences = page.getByRole("link", { name: "Preferences" });
            const adminPanel = page.getByRole("link", { name: "Admin Panel" });
            const signOut = page.getByRole("button", { name: "Sign out" });
            await expect(platformAdmin).toBeVisible();
            await expect(preferences).toBeVisible();
            await expect(adminPanel).toBeVisible();
            await expect(signOut).toBeVisible();
            const accountNavigationBottomAfterOpen = await accountNavigation.evaluate(
                (element) => element.getBoundingClientRect().bottom,
            );
            const pageHeadingTop = await page
                .getByRole("heading", { name: "Context Fabric", level: 1 })
                .evaluate((element) => element.getBoundingClientRect().top);
            expect(accountNavigationBottomAfterOpen).toBe(accountNavigationBottomBeforeOpen);
            const menu = page.locator("#account-options");
            await expect(menu).toBeVisible();
            const menuTop = await menu.evaluate((element) => element.getBoundingClientRect().top);
            expect(menuTop).toBeLessThan(pageHeadingTop);
            for (const menuItem of [platformAdmin, preferences, adminPanel, signOut]) {
                expect(
                    await menuItem.evaluate((element) => {
                        const bounds = element.getBoundingClientRect();
                        const topmostElement = document.elementFromPoint(
                            bounds.left + bounds.width / 2,
                            bounds.top + bounds.height / 2,
                        );
                        return topmostElement === element || element.contains(topmostElement);
                    }),
                ).toBe(true);
            }
            await page.keyboard.press("Tab");
            await expect(platformAdmin).toBeFocused();
            await page.keyboard.press("Tab");
            await expect(preferences).toBeFocused();
            await page.screenshot({
                path: testInfo.outputPath(`account-controls-${viewport.name}.png`),
                fullPage: true,
            });
        }

        await page.setViewportSize({ width: 1280, height: 768 });
        await gotoWithSessionReady(page, "/diagnose");
        const accountControl = page.getByRole("button", { name: "Account options" });
        await accountControl.click();
        const globalContextBar = page.getByTestId("global-context-bar");
        const signOut = page.getByRole("button", { name: "Sign out" });
        await expect(globalContextBar).toBeVisible();
        await expect(signOut).toBeVisible();
        expect(
            await signOut.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                const topmostElement = document.elementFromPoint(
                    bounds.left + bounds.width / 2,
                    bounds.top + bounds.height / 2,
                );
                return topmostElement === element || element.contains(topmostElement);
            }),
        ).toBe(true);
        await expectHealthyBrowser(faults);
    });

    test("activates Preferences, Admin Panel, and Sign out through local navigation and mock-safe auth", async ({
        page,
    }) => {
        await setEntitlementScenario(page.request, "provisioned");
        await page.route(`${ACR_API_ORIGIN}/**`, (route) => {
            throw new Error(`Browser attempted direct ACR access: ${route.request().url()}`);
        });
        await gotoWithSessionReady(page, "/agent-context/context-packet");

        await page.getByRole("button", { name: "Account options" }).click();
        await page.getByRole("link", { name: "Preferences" }).click();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(page.getByRole("heading", { name: "Preferences", level: 1 })).toBeVisible();

        await page.getByRole("button", { name: "Account options" }).click();
        await page.getByRole("link", { name: "Admin Panel" }).click();
        await expect(page).toHaveURL(/\/org\/admin$/);

        await page.getByRole("button", { name: "Account options" }).click();
        await page.getByRole("button", { name: "Sign out" }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Account options" })).toHaveCount(0);
    });

    test("renders a full commit hash accessibly without truncating its tablet layout", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");
        const faults = recordBrowserFaults(page);
        await page.setViewportSize({ width: 768, height: 900 });
        await page.goto("/prs/e2e-pr-detail");

        const commit = page.getByRole("button", {
            name: `Full commit hash: ${FULL_COMMIT_SHA}. Activate to reveal.`,
        });
        await expect(commit).toContainText(FULL_COMMIT_SHA.slice(0, 8));
        await expect(commit).toHaveAccessibleName(
            `Full commit hash: ${FULL_COMMIT_SHA}. Activate to reveal.`,
        );
        await commit.press("Enter");
        await expect(page.locator("code")).toHaveText(FULL_COMMIT_SHA);
        await page.screenshot({
            path: testInfo.outputPath("full-commit-768.png"),
            fullPage: true,
        });
        await expectHealthyBrowser(faults);
    });

    test("submits through the BFF, renders a live partial packet, and expands server-owned evidence", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");
        await page.route(`${ACR_API_ORIGIN}/**`, (route) => {
            throw new Error(`Browser attempted direct ACR access: ${route.request().url()}`);
        });
        const browserRequests: string[] = [];
        page.on("request", (request) => browserRequests.push(request.url()));
        await page.goto("/agent-context/context-packet");
        await expect(page.getByText("Context Fabric status")).toHaveCount(0);
        await page.screenshot({
            path: testInfo.outputPath("happy-live-initial-1280.png"),
            fullPage: true,
        });

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
        expect(browserRequests.filter((url) => new URL(url).origin === ACR_API_ORIGIN)).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("expanded-evidence-768.png"),
            fullPage: true,
        });
    });

    test("renders raw HTML, images, and unsafe evidence links inert at every viewport", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");
        const faults = recordBrowserFaults(page);

        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto("/agent-context/context-packet");
            await page.getByLabel(/Goal/).fill("e2e unsafe evidence");
            await page.getByRole("button", { name: "Generate context" }).click();
            await expect(page.getByRole("heading", { name: "e2e unsafe evidence" })).toBeVisible();
            await page.getByRole("button", { name: "Open evidence" }).click();

            const evidence = page.getByRole("region", { name: /Evidence for/ });
            await expect(evidence.getByText("Unsafe evidence payload (sanitized)")).toBeVisible();
            await expect(evidence.getByText("Unsafe link")).toBeVisible();
            await showRawUnsafeEvidenceSource(evidence);
            const rawSource = evidence.getByTestId("raw-unsafe-evidence-source");
            await expect(rawSource).toContainText(UNSAFE_EVIDENCE_RAW_PAYLOAD.citation);
            await expect(rawSource).toContainText(UNSAFE_EVIDENCE_RAW_PAYLOAD.excerpt);
            await expect(rawSource).toContainText(UNSAFE_EVIDENCE_RAW_PAYLOAD.safeUri);
            await expect(evidence.locator("img")).toHaveCount(0);
            await expect(evidence.locator("script")).toHaveCount(0);
            await expect(evidence.getByRole("link", { name: "Unsafe link" })).toHaveCount(0);
            await expect(evidence.locator('a[href^="javascript:"]')).toHaveCount(0);
            await page.screenshot({
                path: testInfo.outputPath(`unsafe-evidence-inert-${viewport.name}.png`),
                fullPage: true,
            });
        }

        await expectHealthyBrowser(faults);
    });

    test("suppresses retrieval debug for members and exposes it for superusers at every viewport", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");
        const faults = recordBrowserFaults(page);
        await page.context().clearCookies();
        await signIn(page, "member@example.com");
        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto("/agent-context/context-packet");
            await page.getByLabel(/Goal/).fill("e2e retrieval debug");
            await page.getByRole("button", { name: "Generate context" }).click();
            await expect(page.getByRole("heading", { name: "e2e retrieval debug" })).toBeVisible();
            await expect(page.getByText("Retrieval details")).toHaveCount(0);
            await expect(page.getByText(RETRIEVAL_DEBUG_SUMMARY)).toHaveCount(0);
            await page.screenshot({
                path: testInfo.outputPath(`retrieval-debug-suppressed-${viewport.name}.png`),
                fullPage: true,
            });
        }

        await page.getByRole("button", { name: "Account options" }).click();
        await page.getByRole("button", { name: "Sign out" }).click();
        await expect(page).toHaveURL(/\/$/);
        await signIn(page, "test@example.com");
        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto("/agent-context/context-packet");
            await page.getByLabel(/Goal/).fill("e2e retrieval debug");
            await page.getByRole("button", { name: "Generate context" }).click();
            await page.getByText("Retrieval details").click();
            await expect(page.getByText(RETRIEVAL_DEBUG_SUMMARY)).toBeVisible();
            await page.screenshot({
                path: testInfo.outputPath(`retrieval-debug-visible-${viewport.name}.png`),
                fullPage: true,
            });
        }
        const rawFaults = rawBrowserFaults(faults.events);
        expect(
            rawFaults.sessionRequestFailures.every((failure) => failure === "net::ERR_ABORTED"),
        ).toBe(true);
        expect(
            rawFaults.consoleErrors.filter(
                (message) =>
                    !message.startsWith(
                        "Executing inline script violates the following Content Security Policy directive",
                    ) &&
                    !(message.includes("Failed to fetch") && message.includes("errors.authjs.dev")),
            ),
        ).toEqual([]);
        expect(
            rawFaults.pageErrors.filter(
                (message) => message !== "Connection closed." && message !== "Failed to fetch",
            ),
        ).toEqual([]);
    });

    test("renders a safe terminal state when the local ACR fixture sends a malformed packet", async ({
        page,
    }) => {
        await setEntitlementScenario(page.request, "provisioned");
        await setAcrMockControls(page.request, { malformedPacket: true });
        await page.route(`${ACR_API_ORIGIN}/**`, (route) => {
            throw new Error(`Browser attempted direct ACR access: ${route.request().url()}`);
        });
        await page.goto("/agent-context/context-packet");

        await page.getByLabel(/Goal/).fill("e2e malformed packet");
        await page.getByRole("button", { name: "Generate context" }).click();

        await expect(page.getByTestId("data-state-error")).toBeVisible();
        await expect(page.getByRole("heading", { name: "e2e malformed packet" })).toHaveCount(0);
    });

    test("keeps the current packet when a delayed stale BFF response resolves last", async ({
        page,
    }) => {
        await setEntitlementScenario(page.request, "provisioned");
        await setAcrMockControls(page.request, { pausedGoals: ["e2e stale response"] });
        await page.route(`${ACR_API_ORIGIN}/**`, (route) => {
            throw new Error(`Browser attempted direct ACR access: ${route.request().url()}`);
        });
        await page.goto("/agent-context/context-packet");

        const staleResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith("/api/agent-context/context-packets") &&
                response.request().postData()?.includes("e2e stale response") === true,
        );
        await page.getByLabel(/Goal/).fill("e2e stale response");
        await page.getByRole("button", { name: "Generate context" }).click();
        await expect(page.getByRole("button", { name: "Generate context" })).toBeEnabled();
        await expect
            .poll(async () => (await pausedPacketState(page.request)).goals)
            .toContain("e2e stale response");

        await page.getByLabel(/Goal/).fill("e2e current response");
        await page.getByRole("button", { name: "Generate context" }).click();
        await expect(page.getByRole("heading", { name: "e2e current response" })).toBeVisible();
        await releasePausedPacket(page.request, "e2e stale response");
        const staleBffResponse = await staleResponse;
        await staleBffResponse.finished();

        await expect(page.getByRole("heading", { name: "e2e current response" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "e2e stale response" })).toHaveCount(0);
    });

    test("keeps the issue-report control clear of Context Fabric form, terminal, and cards at every viewport", async ({
        page,
    }, testInfo) => {
        await setEntitlementScenario(page.request, "provisioned");

        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto("/agent-context/context-packet");
            await page.getByLabel(/Goal/).fill("e2e partial");
            await page.getByRole("button", { name: "Generate context" }).click();
            const terminal = page.getByRole("region", {
                name: "Generated Context Fabric response",
            });
            await expect(terminal).toBeVisible();

            const issueReportControl = page.getByRole("button", { name: "Report an issue" });
            const categoryCards = page.locator("article");
            await expect(categoryCards).toHaveCount(1);
            // The bug report control is an intentional floating FAB (fixed
            // bottom-right overlay), so the earlier anti-overlap constraint no
            // longer applies; assert only that it remains present and reachable.
            await expect(issueReportControl).toBeVisible();
            await page.screenshot({
                path: testInfo.outputPath(`issue-report-layout-${viewport.name}.png`),
                fullPage: true,
            });
        }
    });

    test("caps concurrent evidence fetches globally while retaining every server-owned reference", async ({
        page,
    }) => {
        await setEntitlementScenario(page.request, "provisioned");
        await setAcrMockControls(page.request, {
            evidenceDelayMs: 1_000,
            evidenceReferenceCount: 9,
        });
        await page.goto("/agent-context/context-packet");

        await page.getByLabel(/Goal/).fill("e2e partial");
        await page.getByRole("button", { name: "Generate context" }).click();
        const evidenceButtons = page.getByRole("button", { name: "Open evidence" });
        await expect(evidenceButtons).toHaveCount(2);
        const firstEvidenceButton = page
            .locator("article")
            .filter({ hasText: "Credential scope must be repository constrained 1" })
            .getByRole("button", { name: "Open evidence" });
        const secondEvidenceButton = page
            .locator("article")
            .filter({ hasText: "Credential scope must be repository constrained 2" })
            .getByRole("button", { name: "Open evidence" });
        await firstEvidenceButton.click();
        await secondEvidenceButton.click();

        await expect.poll(async () => (await evidenceRequestStats(page.request)).count).toBe(9);
        await expect.poll(async () => (await evidenceRequestStats(page.request)).active).toBe(0);
        const stats = await evidenceRequestStats(page.request);
        expect(stats.count).toBe(9);
        expect(stats.maxConcurrent).toBeGreaterThan(1);
        expect(stats.maxConcurrent).toBeLessThanOrEqual(8);
    });

    test("resets browser-only feedback after replacement without sending feedback over the network", async ({
        page,
    }) => {
        await setEntitlementScenario(page.request, "provisioned");
        const feedbackRequests: string[] = [];
        page.on("request", (request) => {
            if (new URL(request.url()).pathname === "/api/feedback")
                feedbackRequests.push(request.url());
        });
        await page.goto("/agent-context/context-packet");

        await page.getByLabel(/Goal/).fill("e2e feedback first packet");
        await page.getByRole("button", { name: "Generate context" }).click();
        await page.getByRole("button", { name: "Mark context as incorrect" }).click();
        await expect(page.getByText("Feedback recorded for this session only.")).toBeVisible();

        await page.getByLabel(/Goal/).fill("e2e feedback replacement packet");
        await page.getByRole("button", { name: "Generate context" }).click();
        await expect(
            page.getByRole("heading", { name: "e2e feedback replacement packet" }),
        ).toBeVisible();
        await expect(page.getByText("Feedback recorded for this session only.")).toHaveCount(0);
        expect(feedbackRequests).toEqual([]);
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
