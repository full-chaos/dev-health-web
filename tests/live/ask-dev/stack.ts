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
 * - `ASK_DEV_LIVE_THREAD`: a stored conversation of that user: two answers, one ref cited by both.
 * - `ASK_DEV_LIVE_PASSWORD_FILE`: a 0600 file with that user's password. Never an env value, never
 *   an argument, never a log line.
 */
export const ACR = process.env.ASK_DEV_LIVE_ACR ?? "https://acr.localhost:8443";
export const THREAD = process.env.ASK_DEV_LIVE_THREAD ?? "";
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
    readonly hasBearer: boolean;
    readonly cookie: boolean;
    status?: number;
};

/** What a case needs to repeat a call. It holds a live bearer, so it is never in `AcrCall`. */
export type AcrCallSecrets = {
    readonly bearer: string | null;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string | null;
};

// Not on the call: a failed `expect(calls)` prints its value into the error, and Playwright copies
// the error into `error-context.md` and the report.
const secrets = new WeakMap<AcrCall, AcrCallSecrets>();

export function secretsOf(call: AcrCall): AcrCallSecrets {
    const held = secrets.get(call);
    if (held === undefined) throw new Error("this call was not recorded by watchAcr");
    return held;
}

/** Every call this page makes to ACR's data routes. A bearer stays in memory; it is never logged. */
export function watchAcr(page: Pick<Page, "on">): AcrCall[] {
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
            hasBearer: headers.authorization !== undefined,
            cookie: headers.cookie !== undefined,
        };
        secrets.set(call, {
            bearer: headers.authorization?.replace(/^Bearer /u, "") ?? null,
            headers,
            body: request.postData(),
        });
        calls.push(call);
        byRequest.set(request, call);
    });
    page.on("response", (response) => {
        const call = byRequest.get(response.request());
        if (call === undefined) return;
        call.status = response.status();
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

/** This tab's ACR token family. It holds a refresh token, so only its random id leaves the page. */
export const familyIdOf = (page: Page): Promise<string | null> =>
    page.evaluate(() => {
        const family = window.sessionStorage.getItem("ask-dev:acr-family");
        return family === null ? null : (JSON.parse(family) as { familyId: string }).familyId;
    });

/**
 * The real silent authorization from the browser (CHAOS-12474). There is no page to visit and no
 * step to click: opening History is a user's act, so it runs web's route, ACR's `/authorize` and its
 * consent, then `/token`. No token at the end of it is red. It leaves this tab on /dashboard with
 * its family held and the panel closed. The panel's History read is one more ACR call.
 */
export async function authorize(page: Page): Promise<void> {
    await page.goto("/dashboard", { waitUntil: "commit" });
    const launcher = page.getByRole("button", { name: "Open Ask Dev" });
    await expect(launcher).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    await launcher.click();
    const panel = page.getByTestId("ask-dev-panel");
    await panel.getByTestId("ask-dev-history-toggle").click();
    await expect
        .poll(() => familyIdOf(page), {
            message: "this tab holds no ACR family: the silent authorization gave no token",
            timeout: 30_000,
        })
        .not.toBeNull();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
}

/** `ASK_DEV_LIVE_ORACLE`: acr's `modeloracle`. A routed case sends nothing without it. */
export const ORACLE = process.env.ASK_DEV_LIVE_ORACLE ?? "";

export const references = (surface: ReturnType<Page["getByTestId"]>) =>
    surface.locator("button.evidence-ref--open:visible");

/**
 * The stored conversation with two answers that cite one ref, on the full page. By its id: a run's
 * own conversations are newer, and they push it off History's first page. None is a red "no data".
 */
export async function openStoredAnswer(page: Page): Promise<ReturnType<Page["getByTestId"]>> {
    if (THREAD === "")
        throw new Error("ASK_DEV_LIVE_THREAD is not set: the suite has no stored data");
    await page.goto(`/dev?thread=${THREAD}`, { waitUntil: "commit" });
    const surface = page.getByTestId("ask-dev-page");
    await expect
        .poll(() => references(surface).count(), {
            message: "the stored conversation shows no evidence reference: the stack has no data",
            timeout: 20_000,
        })
        .toBeGreaterThan(0);
    await page.waitForTimeout(500);
    return surface;
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
