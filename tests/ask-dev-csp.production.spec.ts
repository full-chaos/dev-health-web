import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import { OPS_MOCK_ORIGIN } from "../playwright.context-fabric.config";
import { ACR_CORS, ACR_E2E_ISSUER, installCrossOriginAcr } from "./mocks/acr-browser-client";
import { INVESTIGATIONS_PATH, investigationStreamFor } from "./mocks/acr-investigation-stream";

/**
 * CHAOS-11939 (plan I-44, exit P2-6): the Ask Dev surfaces under the production CSP. Runs only in
 * the production-build suite (`playwright.context-fabric.config.ts`): `next dev` serves a different
 * CSP, with `'unsafe-eval'`, so a pass there would prove nothing.
 *
 * The answer comes through the real browser transport from a mocked ACR origin, because a
 * production build has no test-mode turns. Hostile text is planted in the result's prose, links and
 * labels, and a script that ran would set `window.__askDevPwned`.
 *
 * That the exact ACR origin is the only change `ACR_OAUTH_ISSUER` makes to the policy is pinned in
 * `src/lib/__tests__/proxy-csp.test.ts`. This suite runs with it unset, and the golden file below
 * is the policy served then.
 */
const POLICY_FILE = join(process.cwd(), "tests/fixtures/ask-dev/production-csp.txt");
const NONCE = /'nonce-[A-Za-z0-9_-]+'/u;
const QUESTION = "Which projects are at risk this quarter?";

const HOSTILE =
    '<img src=x onerror="window.__askDevPwned=1"><script>window.__askDevPwned=2</script>' +
    '<a href="javascript:window.__askDevPwned=3">a link</a> ' +
    "[md](javascript:window.__askDevPwned=4) javascript:window.__askDevPwned=5 " +
    "https://evil.example/path";

const HOSTILE_LABEL = '<img src=x onerror="window.__askDevPwned=6">';

/** Every string the render shows as prose or as a label, in any part of the result. */
const HOSTILE_KEYS = new Set([
    "deterministic_answer",
    "direct_judgment",
    "current_state",
    "label",
    "summary",
    "title",
    "name",
]);

function plant(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(plant);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            HOSTILE_KEYS.has(key) && typeof item === "string"
                ? HOSTILE
                : key === "limitations" && Array.isArray(item)
                  ? [HOSTILE]
                  : plant(item),
        ]),
    );
}

/** The real capture, with its result carrying the hostile strings. */
function hostileStream(threadId: string, submissionId: string): string {
    return investigationStreamFor(threadId, submissionId)
        .split("\n\n")
        .map((block) => {
            if (!block.includes("event: result")) return block;
            const lines = block.split("\n");
            const at = lines.findIndex((line) => line.startsWith("data: "));
            const event = plant(JSON.parse(lines[at]!.slice(6))) as {
                result: { coverage: { sources: Record<string, unknown>[] } };
            };
            // A served label: the capture predates them, and a chip shows one as its name. The
            // contract caps a label at 160 characters.
            for (const source of event.result.coverage.sources) source.label = HOSTILE_LABEL;
            lines[at] = `data: ${JSON.stringify(event)}`;
            return lines.join("\n");
        })
        .join("\n\n");
}

const EVIDENCE_PATH = "/api/v1/agent-context/evidence/";

/** ACR's own example, with its served strings hostile. */
function hostileEvidence(): unknown {
    const example = JSON.parse(
        readFileSync(
            join(process.cwd(), "src/lib/acr/contracts/examples/expanded_evidence.v1.json"),
            "utf8",
        ),
    ) as { evidence: Record<string, unknown> };
    return {
        ...example,
        availability: "redacted",
        evidence: { ...example.evidence, citation: HOSTILE },
        excerpt: HOSTILE,
        redaction_reason: HOSTILE,
        structured_fields: { note: HOSTILE },
    };
}

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${OPS_MOCK_ORIGIN}/__test/entitlements`, {
        data: { scenario },
    });
    expect(response.ok()).toBe(true);
}

/** Records every CSP violation in the page: a blocked script or handler reads as a failure. */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
    await page.addInitScript(() => {
        const seen: string[] = [];
        (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
        document.addEventListener("securitypolicyviolation", (event) => {
            seen.push(`${event.violatedDirective}: ${event.blockedURI}`);
        });
    });
    return () =>
        page.evaluate(
            () => (window as unknown as { __cspViolations: string[] }).__cspViolations ?? [],
        );
}

/** The browser client on, and the mocked ACR answering the stream. The first question authorizes. */
async function connect(page: Page, baseURL: string | undefined): Promise<void> {
    const web = new URL(baseURL ?? "http://127.0.0.1:3012").origin;
    await installCrossOriginAcr(page.context(), web, ACR_E2E_ISSUER);
    await page.context().route(
        (url) => url.origin === ACR_E2E_ISSUER && url.pathname === INVESTIGATIONS_PATH,
        async (route) => {
            const request = route.request();
            if (request.method() !== "POST") return route.fallback();
            const headers = await request.allHeaders();
            await route.fulfill({
                status: 200,
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": web,
                    "Access-Control-Expose-Headers": ACR_CORS.exposeHeaders,
                    Vary: "Origin",
                },
                body: hostileStream(
                    headers["x-acr-thread-id"] ?? "",
                    headers["x-acr-submission-id"] ?? "",
                ),
            });
        },
    );
    // CHAOS-12105: an evidence read, with hostile text in every served string the drawer shows.
    await page.context().route(
        (url) => url.origin === ACR_E2E_ISSUER && url.pathname.startsWith(EVIDENCE_PATH),
        async (route) => {
            if (route.request().method() !== "GET") return route.fallback();
            await route.fulfill({
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": web,
                    "Access-Control-Expose-Headers": ACR_CORS.exposeHeaders,
                    Vary: "Origin",
                },
                body: JSON.stringify(hostileEvidence()),
            });
        },
    );
    await page.goto("/dashboard");
}

async function ask(surface: Locator): Promise<Locator> {
    const input = surface.getByRole("textbox", { name: "Ask a question" });
    await expect(input).toBeEnabled();
    await input.fill(QUESTION);
    await input.press("Enter");
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect(answer).toBeVisible();
    return answer;
}

/** The hostile text is on screen as text, and nothing in the answer acts on it. */
async function expectInert(page: Page, answer: Locator): Promise<void> {
    // Not vacuous: prose, a label and a finding each reached the answer, as text.
    const planted = "<img src=x onerror=";
    await expect(answer.getByTestId("answer-panel")).toContainText(planted);
    await expect(answer.getByRole("group", { name: "Coverage", exact: true })).toContainText(
        planted,
    );
    // The same words as a limitation: the render folds that one into the finding.
    await expect(answer.getByRole("group", { name: "Remaining work", exact: true })).toContainText(
        planted,
    );
    // A real URL in that text is the one link it can make, and it leaves this page's opener alone.
    const link = answer.getByTestId("answer-panel").locator('a[href^="https://evil.example"]');
    await expect(link.first()).toHaveAttribute("rel", /noopener/u);
    expect(
        await answer.locator("img[onerror], script, iframe, object, embed, [onclick]").count(),
    ).toBe(0);
    const hrefs = await answer
        .locator("a[href]")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    for (const href of hrefs) expect(href.toLowerCase()).not.toContain("javascript:");
    expect(await page.evaluate(() => "__askDevPwned" in window)).toBe(false);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

for (const path of ["/dashboard", "/dev"]) {
    test(`${path}: the served policy is the recorded one, and only its own scripts run`, async ({
        page,
    }) => {
        const response = await page.goto(path);
        const policy = response?.headers()["content-security-policy"] ?? "";
        expect(policy.replace(NONCE, "'nonce-N'")).toBe(readFileSync(POLICY_FILE, "utf8").trim());

        const script = policy.split("; ").find((part) => part.startsWith("script-src "));
        expect(script).not.toContain("'unsafe-eval'");
        expect(script).not.toContain("'unsafe-inline'");
        const nonce = NONCE.exec(policy)?.[0].slice("'nonce-".length, -1);
        expect(nonce).toBeDefined();

        // The policy allows 'self', so an external script of this origin needs no nonce. Every
        // inline script does, and no external script comes from anywhere else.
        const scripts = await page.locator("script").evaluateAll((nodes) =>
            nodes.map((node) => ({
                src: (node as HTMLScriptElement).src,
                nonce: (node as HTMLScriptElement).nonce,
            })),
        );
        const inline = scripts.filter((one) => one.src === "");
        expect(inline.length).toBeGreaterThan(0);
        expect(new Set(inline.map((one) => one.nonce))).toEqual(new Set([nonce]));
        const origin = new URL(page.url()).origin;
        for (const { src } of scripts) if (src !== "") expect(new URL(src).origin).toBe(origin);
    });
}

test("each document gets its own nonce", async ({ page }) => {
    const first = await page.goto("/dashboard");
    const second = await page.goto("/dashboard");
    const nonceOf = (value: string | undefined) => NONCE.exec(value ?? "")?.[0];
    expect(nonceOf(first?.headers()["content-security-policy"])).toBeDefined();
    expect(nonceOf(second?.headers()["content-security-policy"])).not.toBe(
        nonceOf(first?.headers()["content-security-policy"]),
    );
});

test("this is a production build: a valid test-mode turn draws nothing", async ({ page }) => {
    // The same real capture the development specs draw through this key: there it shows.
    const capture = JSON.parse(
        readFileSync(
            join(
                process.cwd(),
                "tests/fixtures/ask-dev/captures/kiac_project_status_partial.event.json",
            ),
            "utf8",
        ),
    ) as { result: { deterministic_answer: string } };
    await page.addInitScript((turn) => {
        window.sessionStorage.setItem("ask-dev:test-mode-answer", turn);
    }, JSON.stringify(capture.result));
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page.getByRole("complementary", { name: "Ask Dev" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("article", { name: "Answer" })).toHaveCount(0);
});

test("the render's code loads on the panel's first open, not with the page", async ({ page }) => {
    // Text the render's own chunk holds, and web's code does not.
    const renderMarker = "Ask Dev conversation";
    const scripts: Promise<boolean>[] = [];
    page.on("response", (response) => {
        if (!response.url().includes("/_next/static/") || !response.url().endsWith(".js")) return;
        scripts.push(response.text().then((text) => text.includes(renderMarker)));
    });
    const renderLoaded = async () => (await Promise.all(scripts)).some(Boolean);

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    expect(scripts.length).toBeGreaterThan(0);
    expect(await renderLoaded()).toBe(false);

    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    await expect(page.getByRole("region", { name: renderMarker })).toBeVisible();
    expect(await renderLoaded()).toBe(true);
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("the panel opens, answers, and hostile text is inert", async ({ page, baseURL }) => {
        const violations = await watchViolations(page);
        await connect(page, baseURL);
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const answer = await ask(page.getByRole("complementary", { name: "Ask Dev" }));
        await expectInert(page, answer);
        expect(await violations()).toEqual([]);
    });

    test("an evidence reference opens in the drawer, and hostile text is inert", async ({
        page,
        baseURL,
    }) => {
        const violations = await watchViolations(page);
        await connect(page, baseURL);
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const answer = await ask(page.getByRole("complementary", { name: "Ask Dev" }));
        await answer.locator("button.evidence-ref--open:visible").last().click();
        const body = page.getByTestId("ask-dev-evidence-body");
        await expect(body).toHaveAttribute("data-state", "redacted");
        await expect(body).toContainText("<img src=x onerror=");
        expect(
            await body.locator("img[onerror], script, iframe, object, embed, [onclick]").count(),
        ).toBe(0);
        const hrefs = await body
            .locator("a[href]")
            .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
        for (const href of hrefs) expect(href.toLowerCase()).not.toContain("javascript:");
        expect(await page.evaluate(() => "__askDevPwned" in window)).toBe(false);
        expect(await violations()).toEqual([]);
    });

    test("/dev answers, and hostile text is inert", async ({ page, baseURL }) => {
        const violations = await watchViolations(page);
        await connect(page, baseURL);
        await page.goto("/dev");
        const answer = await ask(page.getByTestId("ask-dev-page-conversation"));
        await expectInert(page, answer);
        expect(await violations()).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the sheet opens, answers, and hostile text is inert", async ({ page, baseURL }) => {
        const violations = await watchViolations(page);
        await connect(page, baseURL);
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const answer = await ask(page.getByRole("dialog", { name: "Ask Dev" }));
        await expectInert(page, answer);
        expect(await violations()).toEqual([]);
    });
});
