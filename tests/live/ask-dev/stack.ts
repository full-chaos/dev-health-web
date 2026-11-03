import { readFileSync } from "node:fs";

import { expect, type Locator, type Page, type Request } from "@playwright/test";

import { type ScopedResult, terminalResultOf } from "./answer-scope";

/**
 * CHAOS-11933: what the Ask Dev live suite needs from the deployed stack.
 *
 * A measurement that did not happen must FAIL (plan §4, Phase 1): with no ACR, no stream or no data
 * this suite goes red. It has no plain `test.skip`, and `ci/live-e2e-skip-gate.mjs` reads its report:
 * a skip fails the run unless the case's own title contains `[behind a flag]` and every skip reason
 * starts with `NOT RUN` (a view behind a flag that is off, CHAOS-11946), and an expected failure fails
 * it unless its own title contains `[KNOWN GAP` and every `test.fail` reason starts with `KNOWN GAP`.
 * Neither is ever counted as a pass.
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

/** The page binding the in-page tee sends each investigation stream's text to. */
const RESULT_BINDING = "__askDevLiveStream";

/**
 * CHAOS-12637: runs IN THE PAGE (`page.addInitScript`), before the app's own scripts. It wraps
 * `fetch` so that each POST to ACR's investigations route also sends a CLONE of its response body,
 * once the stream ends, to `binding`. The app reads the original stream as it always does, so the
 * page streams as before. Nothing else is read: no request, no header, no bearer. A body that
 * cannot be read is sent as `{ error }`, so the test says why it has no result.
 *
 * CHAOS-12844: the two reads an answer is RECOVERED by are teed the same way, because a case whose
 * stream is dropped draws its answer from them: a GET of a run's events (`…/submissions/{id}/events`,
 * the run lease's attach, a stream) and a GET of a result by its id (`…/result_<32 hex>`, the replay
 * of a final id, JSON). No other route is teed: not the submission status, a thread or feedback.
 *
 * Why in the page: Chromium does not keep the body of a streamed `fetch` for the DevTools protocol,
 * so `response.text()` on Playwright's side fails with "No data found for resource with given
 * identifier" (askdev-1, 2026-11-02). Self-contained: Playwright sends its source to the page.
 */
export function teeInvestigationStreams(options: {
    readonly origin: string;
    readonly path: string;
    readonly binding: string;
}): void {
    const scope = globalThis as unknown as Record<string, unknown> & { fetch: typeof fetch };
    const original = scope.fetch.bind(globalThis);
    scope.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const response = await original(input, init);
        try {
            const request = input instanceof Request ? input : undefined;
            const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
            const href =
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const base = (globalThis as { location?: { href: string } }).location?.href;
            const url = new URL(href, base ?? options.origin);
            const send = scope[options.binding];
            const tail = url.pathname.startsWith(`${options.path}/`)
                ? url.pathname.slice(options.path.length + 1)
                : "";
            let kind: "stream" | "json" | undefined;
            if (url.origin !== options.origin) kind = undefined;
            else if (method === "POST" && url.pathname === options.path) kind = "stream";
            else if (method === "GET" && /^submissions\/[^/]+\/events$/u.test(tail))
                kind = "stream";
            else if (method === "GET" && /^result_[0-9a-f]{32}$/u.test(tail)) kind = "json";
            if (kind !== undefined && typeof send === "function") {
                const clone = response.clone();
                void (async () => {
                    const post = send as (message: {
                        body?: string;
                        error?: string;
                        kind: "stream" | "json";
                    }) => unknown;
                    const reader = clone.body?.getReader();
                    if (reader === undefined) {
                        post({ error: "the response has no body", kind });
                        return;
                    }
                    const decoder = new TextDecoder();
                    let body = "";
                    try {
                        for (;;) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            body += decoder.decode(value, { stream: true });
                        }
                        post({ body, kind });
                    } catch (error: unknown) {
                        // Ask Dev's client aborts its own fetch once it holds the terminal event,
                        // which aborts this clone too: what arrived before the abort is kept.
                        post({
                            body,
                            error: error instanceof Error ? error.message : String(error),
                            kind,
                        });
                    }
                })();
            }
        } catch {
            // The page's own fetch is never broken by the test's tee.
        }
        return response;
    };
}

/** A result read by its id (`application/json`): the result itself, or undefined when it is not one. */
function resultOfJson(body: string): ScopedResult | undefined {
    let value: unknown;
    try {
        value = JSON.parse(body);
    } catch {
        return undefined;
    }
    return typeof value === "object" &&
        value !== null &&
        typeof (value as { status?: unknown }).status === "string"
        ? (value as ScopedResult)
        : undefined;
}

/**
 * CHAOS-12637: the terminal result of every investigation this page asks, in order, read from a
 * clone of its event stream inside the page (`teeInvestigationStreams`). Only the result is kept: no
 * header, no bearer. A stream with no readable body adds nothing and says so on the console, so a
 * case that needs a result fails on its absence. Call it before the page's first navigation.
 *
 * CHAOS-12844: a result the page RECOVERS (an attach to a run's events, a replay by id) is kept
 * too, in the order it arrives: every result the page draws an answer from.
 */
export async function watchResults(
    page: Pick<Page, "exposeBinding" | "addInitScript">,
): Promise<ScopedResult[]> {
    const results: ScopedResult[] = [];
    await page.exposeBinding(
        RESULT_BINDING,
        (_source, message: { body?: string; error?: string; kind?: "stream" | "json" }) => {
            // A body cut by the client's own abort still holds the frames that came before it.
            const result =
                typeof message.body !== "string"
                    ? undefined
                    : message.kind === "json"
                      ? resultOfJson(message.body)
                      : terminalResultOf(message.body);
            if (result !== undefined) {
                results.push(result);
                return;
            }
            // Loud, not silent: the case then fails on "no terminal result", and this says why.
            console.warn(
                message.kind === "json"
                    ? `watchResults: a result read gave no result: ${message.error ?? "its body is not a result"}`
                    : `watchResults: an investigation stream gave no result: ${message.error ?? "it ended with no result event"}`,
            );
        },
    );
    await page.addInitScript(teeInvestigationStreams, {
        origin: ACR,
        path: INVESTIGATIONS_PATH,
        binding: RESULT_BINDING,
    });
    return results;
}

/** Web's route that starts an authorization: same origin, so `watchAcr` cannot see it. */
const AUTHORIZE_ROUTE = "/api/ask-dev/authorize";

/**
 * Every request of the authorization flow this page makes: web's route, and anything on ACR's
 * origin that is not a data route (the OAuth metadata, `/authorize`, `/token`, `/revoke`). P1-6
 * holds this empty. Only the method and the path are kept: a query or a body may hold a code.
 */
export function watchAuthorization(page: Pick<Page, "on">): string[] {
    const seen: string[] = [];
    page.on("request", (request) => {
        const url = new URL(request.url());
        const onAcr = url.origin === ACR && !url.pathname.startsWith("/api/v1/");
        if (onAcr || url.pathname === AUTHORIZE_ROUTE) {
            seen.push(`${request.method()} ${url.pathname}`);
        }
    });
    return seen;
}

/**
 * What a page was waiting for, if it never drew. The live config keeps traces off, because bearers
 * are on these pages, so a blank `/dev` after sign-in (4 of 44 sign-ins, all before this helper)
 * leaves this instead: each open request by method and path, the failed ones, and whether the page
 * hydrated. No header, no query, no body.
 */
export function watchPageLoad(page: Page): () => Promise<string> {
    const open = new Map<Request, string>();
    const failed: string[] = [];
    const named = (request: Request) => {
        const url = new URL(request.url());
        return `${request.method()} ${url.host}${url.pathname}`;
    };
    page.on("request", (request) => open.set(request, named(request)));
    page.on("requestfinished", (request) => open.delete(request));
    page.on("requestfailed", (request) => {
        open.delete(request);
        failed.push(named(request));
    });
    return async () => {
        const hydrated = await page
            .evaluate(() =>
                Object.keys(document.querySelector("button") ?? {}).some((key) =>
                    key.startsWith("__react"),
                ),
            )
            // A closed page cannot say: that is a finding too, not a reason to drop the rest.
            .catch((error: unknown) => `unknown: ${String(error).slice(0, 80)}`);
        return JSON.stringify({ hydrated, open: [...open.values()].slice(0, 20), failed });
    };
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

/** Opens the panel on the page shown, then History, which is a user's act. */
export async function openHistory(page: Page): Promise<Locator> {
    const launcher = page.getByRole("button", { name: "Open Ask Dev" });
    await expect(launcher).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    await launcher.click();
    const panel = page.getByTestId("ask-dev-panel");
    await panel.getByTestId("ask-dev-history-toggle").click();
    return panel;
}

/**
 * The real silent authorization from the browser (CHAOS-12474). There is no page to visit and no
 * step to click: opening History runs web's route, ACR's `/authorize` and its consent, then
 * `/token`. No token at the end of it is red. It leaves this tab on /dashboard with its family held
 * and the panel closed. The panel's History read is one more ACR call.
 */
export async function authorize(page: Page): Promise<void> {
    await page.goto("/dashboard", { waitUntil: "commit" });
    const panel = await openHistory(page);
    await expect
        .poll(() => familyIdOf(page), {
            message: "this tab holds no ACR family: the silent authorization gave no token",
            timeout: 30_000,
        })
        .not.toBeNull();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
}

/** What must not say a connect step. The render has no "Reconnect" today; this would catch one. */
export const CONNECT_WORDS = /\b(?:re)?connect\b/iu;

/** What the panel says of itself: not a stored question, which may hold any word. */
export const panelChrome = (panel: Locator): Promise<string> =>
    panel.evaluate((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        for (const row of copy.querySelectorAll('[data-testid="ask-dev-history-row"]')) {
            row.remove();
        }
        return copy.textContent ?? "";
    });

/** `ASK_DEV_LIVE_ORACLE`: acr's `modeloracle`. A routed case sends nothing without it. */
export const ORACLE = process.env.ASK_DEV_LIVE_ORACLE ?? "";

/**
 * The surface a case asks from: the panel, authorized, with an empty composer. Shared by the
 * routed and the terminal cases: a spec file cannot import another.
 */
export async function panel(page: Page): Promise<{ calls: AcrCall[]; surface: Locator }> {
    const calls = watchAcr(page);
    await authorize(page);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const surface = page.getByTestId("ask-dev-panel");
    await expect(surface.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
    return { calls, surface };
}

export async function ask(surface: Locator, question: string): Promise<void> {
    const input = surface.getByRole("textbox", { name: "Ask a question" });
    await input.fill(question);
    await input.press("Enter");
}

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

/** A coverage detail as served; only the fields the fallback check reads. */
export type CoverageDetail = { source?: string; code?: string; raw?: string };

/** The codes acr's synthesis step files when it serves a facts-only fallback (CHAOS-11946). */
const SYNTHESIS_FALLBACK_CODES = new Set(["synthesis_model_failed", "synthesis_not_run"]);

/**
 * The served result's coverage details that say the answer is acr's facts-only fallback: the model
 * call failed or was not run (acr `synthesis_model_failure.go`). Pure, for any served result.
 */
export function synthesisFallbackDetails(result: unknown): CoverageDetail[] {
    const details = (result as { coverage?: { details?: unknown } } | null | undefined)?.coverage
        ?.details;
    return Array.isArray(details)
        ? (details as CoverageDetail[]).filter((detail) =>
              SYNTHESIS_FALLBACK_CODES.has(String(detail?.code)),
          )
        : [];
}

const describeDetails = (details: CoverageDetail[]): string =>
    details.map((detail) => detail.raw ?? detail.code).join(", ");

/**
 * A case that expects an answer asserts the MECHANISM (AGENTS rule 4): the answer was synthesized.
 * A view drawn on acr's fallback is not a pass (CHAOS-11946 cohort finding, CHAOS-12844). Throws,
 * so it fails a Playwright case and can be tested without Playwright.
 */
export function expectSynthesized(result: unknown, label: string): void {
    const details = synthesisFallbackDetails(result);
    if (details.length > 0) {
        throw new Error(
            `${label}: the answer is acr's fallback, not a synthesized answer (${describeDetails(details)})`,
        );
    }
}

/** A case that expects acr's fallback by design (a synthesis out of time) asserts it got one. */
export function expectFallback(result: unknown, label: string): void {
    if (synthesisFallbackDetails(result).length === 0) {
        throw new Error(
            `${label}: the answer was expected to be acr's fallback, and it carries no synthesis failure`,
        );
    }
}

/**
 * CHAOS-12844: a case that expects answers holds EVERY result its page drew (`watchResults`) to
 * `expectSynthesized`, once the page has drawn at least `count`: an answer can show before its
 * terminal result arrives. Fewer than `count` fails: a result that was never read is not a pass.
 */
export async function expectAnswersSynthesized(
    results: readonly unknown[],
    label: string,
    count = 1,
): Promise<void> {
    await expect
        .poll(() => results.length, {
            message: `${label}: the page drew fewer than ${String(count)} results`,
            timeout: 30_000,
        })
        .toBeGreaterThanOrEqual(count);
    results.forEach((result, index) =>
        expectSynthesized(result, `${label}, result ${String(index + 1)}`),
    );
}

/** CHAOS-12844: a case that expects acr's fallback by design holds every result it drew to `expectFallback`. */
export async function expectAnswersFallback(
    results: readonly unknown[],
    label: string,
): Promise<void> {
    await expect
        .poll(() => results.length, {
            message: `${label}: the page drew no result`,
            timeout: 30_000,
        })
        .toBeGreaterThan(0);
    results.forEach((result, index) =>
        expectFallback(result, `${label}, result ${String(index + 1)}`),
    );
}
