import { expect, test, type Response } from "@playwright/test";

/**
 * CHAOS-12088: page JS never receives the Ops token. Measured against the PRODUCTION build
 * (`playwright.context-fabric.config.ts`), signed in through the real credentials flow against the
 * ops mock, whose token values are known: the session endpoint that `useSession` reads, every
 * same-origin answer the page gets while /dashboard loads (documents, RSC payloads, scripts, JSON)
 * and the final DOM must hold none of them. The server render must still read data with the token.
 */

/** Every token value the ops mock answers to a sign-in or a refresh (`tests/mocks/handlers.ts`). */
const OPS_TOKENS = [
    "mock-access-token-e2e",
    "mock-refresh-token-e2e",
    "mock-refreshed-token-e2e",
    "mock-refreshed-refresh-token-e2e",
];

type Scan = { url: string; hits: string[] };

/** A body read that does not end (a stream, a discarded prefetch) is counted out, loudly, not awaited. */
const BODY_READ_MS = 5_000;

function hitsIn(text: string): string[] {
    return OPS_TOKENS.filter((token) => text.includes(token));
}

test("no Ops token reaches page JS while /dashboard loads with data", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "http://127.0.0.1:3012").origin;
    const scans: Promise<Scan | null>[] = [];
    const unread: string[] = [];
    page.on("response", (response: Response) => {
        if (new URL(response.url()).origin !== origin) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`no body in ${BODY_READ_MS} ms`)),
                BODY_READ_MS,
            );
        });
        scans.push(
            Promise.race([response.text(), timedOut])
                .then((text) => ({ url: response.url(), hits: hitsIn(text) }))
                .catch((error: unknown) => {
                    // A redirect, a discarded prefetch or an unended stream: counted out, and named.
                    unread.push(`${response.status()} ${response.url()} ${String(error)}`);
                    return null;
                })
                .finally(() => clearTimeout(timer)),
        );
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    // Data the server render read from the ops mock with the session token.
    await expect(page.getByTestId("cockpit-top-change-evidence")).toHaveText("Open evidence");

    // What `useSession` reads: the signed-in user, and no token under any key.
    const session = await page.evaluate(async () => {
        const res = await fetch("/api/auth/session", { credentials: "same-origin" });
        return { status: res.status, text: await res.text() };
    });
    expect(session.status).toBe(200);
    const body = JSON.parse(session.text) as Record<string, unknown> & {
        user?: { email?: string; org_id?: string };
    };
    expect(body.user?.email).toBe("admin@devhealth.example");
    expect(body.user?.org_id).toBeTruthy();
    expect(Object.keys(body)).not.toContain("access_token");
    expect(Object.keys(body)).not.toContain("refresh_token");
    expect(hitsIn(session.text)).toEqual([]);

    // A browser update() may not write a token pair into the session.
    const planted = await page.evaluate(async () => {
        const csrf = (await (await fetch("/api/auth/csrf")).json()) as { csrfToken: string };
        const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                csrfToken: csrf.csrfToken,
                data: { activeOrg: { access_token: "planted", user: { org_id: "x" } } },
            }),
        });
        return { status: res.status, text: await res.text() };
    });
    expect(planted).toEqual({
        status: 400,
        text: JSON.stringify({ error: "unsupported_session_update" }),
    });

    const html = await page.content();
    expect(hitsIn(html)).toEqual([]);

    const results = (await Promise.all(scans)).filter((scan): scan is Scan => scan !== null);
    // No answers read means the measurement did not happen.
    expect(results.length, `answers read (unreadable: ${unread.join(", ")})`).toBeGreaterThan(3);
    // Unread answers are only redirects and prefetches the page discarded, never a stalled body.
    expect(unread.filter((line) => line.includes(`no body in ${BODY_READ_MS} ms`))).toEqual([]);
    const read = new Set(results.map((scan) => new URL(scan.url).pathname));
    // The page document and the session answer must be among the bytes read.
    expect([...read], `unreadable: ${unread.join(", ")}`).toEqual(
        expect.arrayContaining(["/dashboard", "/api/auth/session"]),
    );
    expect(results.filter((scan) => scan.hits.length > 0)).toEqual([]);
});
