import { readFileSync } from "node:fs";

import { expect, type Page, type Request } from "@playwright/test";

/**
 * CHAOS-11933: what the Ask Dev live suite needs from the deployed stack.
 *
 * A measurement that did not happen must FAIL (plan §4, Phase 1): with no ACR, no stream or no data
 * this suite goes red. It has no `test.skip`, and `ci/live-e2e-skip-gate.mjs` reads its report.
 *
 * - `ASK_DEV_LIVE_WEB`: web's origin, default `http://localhost:3000`.
 * - `ASK_DEV_LIVE_ACR`: ACR's issuer origin, default `https://acr.localhost:8443`.
 * - `ASK_DEV_LIVE_EMAIL`: the signed-in user, default `admin@test.com`.
 * - `ASK_DEV_LIVE_PASSWORD_FILE`: a 0600 file with that user's password. Never an env value, never
 *   an argument, never a log line.
 */
export const ACR = process.env.ASK_DEV_LIVE_ACR ?? "https://acr.localhost:8443";
export const EMAIL = process.env.ASK_DEV_LIVE_EMAIL ?? "admin@test.com";
export const EVIDENCE_PATH = "/api/v1/agent-context/evidence/";
export const INVESTIGATIONS_PATH = "/api/v1/context-fabric/investigations";

function password(): string {
    const file = process.env.ASK_DEV_LIVE_PASSWORD_FILE;
    if (file === undefined || file === "") {
        throw new Error("ASK_DEV_LIVE_PASSWORD_FILE is not set: the suite cannot sign in");
    }
    const value = readFileSync(file, "utf8").trim();
    if (value === "") throw new Error("the password file is empty");
    return value;
}

export type AcrCall = {
    readonly method: string;
    readonly path: string;
    readonly query: URLSearchParams;
    readonly bearer: string | null;
    readonly cookie: boolean;
    status?: number;
};

/** Every call this page makes to ACR's data routes. A bearer stays in memory; it is never logged. */
export function watchAcr(page: Page): AcrCall[] {
    const calls: AcrCall[] = [];
    const byRequest = new Map<Request, AcrCall>();
    page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin !== ACR || !url.pathname.startsWith("/api/v1/")) return;
        const headers = request.headers();
        const call: AcrCall = {
            method: request.method(),
            path: url.pathname,
            query: url.searchParams,
            bearer: headers.authorization?.replace(/^Bearer /u, "") ?? null,
            cookie: headers.cookie !== undefined,
        };
        calls.push(call);
        byRequest.set(request, call);
    });
    page.on("response", (response) => {
        const call = byRequest.get(response.request());
        if (call !== undefined) call.status = response.status();
    });
    return calls;
}

/** A question to ACR. The suite counts these: only a routed case may send one. */
export const investigations = (calls: readonly AcrCall[]): readonly AcrCall[] =>
    calls.filter((call) => call.method === "POST" && call.path === INVESTIGATIONS_PATH);

/** The dev server and the production build both hydrate late; a click before that does nothing. */
async function hydrated(page: Page): Promise<void> {
    await page.waitForFunction(() => document.readyState === "complete");
    await page.waitForTimeout(1_500);
}

export async function signIn(page: Page): Promise<void> {
    await page.goto("/auth/signin?callbackUrl=/dashboard", { waitUntil: "commit" });
    await expect(page.getByLabel(/email/iu)).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    await page.getByLabel(/email/iu).fill(EMAIL);
    await page.getByLabel(/password/iu).fill(password());
    try {
        // A click before the form hydrates does nothing, so it is sent again.
        await expect(async () => {
            await page.getByRole("button", { name: /sign in/iu }).click({ timeout: 5_000 });
            await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 10_000 });
        }).toPass({ timeout: 45_000 });
    } catch (error) {
        // Playwright's failure snapshot records a field's value: the password must not be in it.
        await page.getByLabel(/password/iu).clear();
        throw error;
    }
}

/** The real OAuth flow from the browser: ACR's authorize, the consent page, the callback, /token. */
export async function connect(page: Page): Promise<void> {
    await page.goto("/ask-dev/oauth/start?return=%2Fdashboard", { waitUntil: "commit" });
    await page.waitForURL((url) => url.pathname === "/dashboard", {
        timeout: 60_000,
        waitUntil: "commit",
    });
    await expect(page.getByRole("button", { name: "Open Ask Dev" })).toBeVisible({
        timeout: 30_000,
    });
    await hydrated(page);
}

export const references = (surface: ReturnType<Page["getByTestId"]>) =>
    surface.locator("button.evidence-ref--open:visible");

/** A stored conversation with an evidence reference, from History. None is a red "no data". */
export async function openStoredAnswer(
    surface: ReturnType<Page["getByTestId"]>,
    page: Page,
): Promise<void> {
    const rows = surface.getByTestId("ask-dev-history-row");
    await expect(rows.first(), "History lists no conversation: the stack has no data").toBeVisible({
        timeout: 20_000,
    });
    await rows.first().locator("button, a").first().click();
    await expect
        .poll(() => references(surface).count(), {
            message: "the stored conversation shows no evidence reference: the stack has no data",
            timeout: 20_000,
        })
        .toBeGreaterThan(0);
    await page.waitForTimeout(500);
}

export async function evidenceState(page: Page): Promise<string> {
    const body = page.getByTestId("ask-dev-evidence-body");
    await expect(body).toBeVisible({ timeout: 20_000 });
    await expect(body).not.toHaveAttribute("data-state", "loading", { timeout: 20_000 });
    return (await body.getAttribute("data-state")) ?? "";
}

export const closeEvidence = (page: Page) =>
    page
        .getByRole("dialog", { name: "Evidence & Context" })
        .getByRole("button", { name: "Close" })
        .click();
