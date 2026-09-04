import { expect, type APIRequestContext, type Page } from "@playwright/test";

import type { DevAnswerScenario, DevCapabilitiesState } from "../mocks/devScenario";

/**
 * The mock backend's own base URL (not the Next.js app's). Existing specs
 * (acr-secret-boundary.spec.ts, acr-explorer-shell.spec.ts, …) already hit
 * `/__test/*` control endpoints on this same hardcoded port, which mirrors
 * playwright.config.ts's `PLAYWRIGHT_MOCK_PORT` default.
 */
const MOCK_SERVER_URL = "http://127.0.0.1:8001";

/** Encodes which canned dev_answer.v1 the mock should return for one question. */
export function scenarioQuestion(scenario: DevAnswerScenario, question: string): string {
    return `[[ask-dev:${scenario}]] ${question}`;
}

export async function resetAskDevMock(request: APIRequestContext): Promise<void> {
    const response = await request.post(`${MOCK_SERVER_URL}/__test/dev-reset`);
    expect(response.ok()).toBe(true);
    // Defensive: the entitlement scenario is shared global state across the
    // whole mock server process (pre-existing pattern, see
    // entitlementScenario.ts) — an earlier, unrelated spec file that left it
    // on something other than "unprovisioned" would otherwise silently turn
    // ask_dev off for every test in this file. "unprovisioned" is the
    // scenario whose features carry `ask_dev: true` by default.
    await setAskDevEntitlement(request, "unprovisioned");
}

export async function setAskDevCapabilities(
    request: APIRequestContext,
    state: DevCapabilitiesState,
): Promise<void> {
    const response = await request.post(`${MOCK_SERVER_URL}/__test/dev-capabilities`, {
        data: { state },
    });
    expect(response.ok()).toBe(true);
}

/**
 * Org-level entitlement gate (checked server-side by /dev's page.tsx via
 * getOrgEntitlements) — distinct from `setAskDevCapabilities`, which is the
 * client-side runtime capability gate. Both must independently deny access.
 */
export async function setAskDevEntitlement(
    request: APIRequestContext,
    scenario: "unprovisioned" | "ask-dev-disabled",
): Promise<void> {
    const response = await request.post(`${MOCK_SERVER_URL}/__test/entitlements`, {
        data: { scenario },
    });
    expect(response.ok()).toBe(true);
}

export async function getAskDevRequestCounts(
    request: APIRequestContext,
): Promise<{ messages: number; conversationsCreated: number; lastMessageScope: unknown }> {
    const response = await request.get(`${MOCK_SERVER_URL}/__test/dev-requests`);
    expect(response.ok()).toBe(true);
    return response.json();
}

export function askDevLauncher(page: Page) {
    return page.getByRole("button", { name: "Open Ask Dev" });
}

export function askDevComposer(page: Page) {
    return page.getByRole("textbox", { name: "Ask Dev question" });
}

export function askDevSubmit(page: Page) {
    return page.getByRole("button", { name: "Ask", exact: true });
}

/** Opens the persistent window and waits for it past the "loading" gate. */
export async function openAskDevWindow(page: Page): Promise<void> {
    await askDevLauncher(page).click();
    await expect(askDevComposer(page)).toBeVisible();
}

/** Types and submits one question via Enter, mirroring real keyboard usage. */
export async function submitAskDevQuestion(page: Page, question: string): Promise<void> {
    const composer = askDevComposer(page);
    await composer.fill(question);
    await composer.press("Enter");
}

export function askDevTranscript(page: Page) {
    return page.locator('[aria-label="Ask Dev transcript"]');
}

export function askDevAnswerArticle(page: Page) {
    return page.getByRole("article", { name: "Ask Dev answer" });
}

export function askDevRunningStatus(page: Page) {
    return page.getByRole("status");
}

export function askDevFailedAlert(page: Page) {
    return page.locator("#ask-dev-run-failed");
}
