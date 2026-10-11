import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * CHAOS-9223: events queued before a hard navigation reach the backend. Production build:
 * `playwright.context-fabric.config.ts`. The queue sends on a 10 s timer or at 10 events, so a
 * page load that ends sooner lost its events before the fix.
 */
const MOCK = `http://127.0.0.1:${process.env.CONTEXT_FABRIC_OPS_PORT ?? "8012"}`;
const PATH = "/api/v1/product-telemetry/events";
const ROUTES = ["/metrics", "/investment", "/metrics", "/investment", "/metrics"];

type Entry = { method: string; path: string; variables: string };

async function received(request: APIRequestContext) {
    const log = (await (await request.get(`${MOCK}/__test/backend-log`)).json()) as Entry[];
    const posts = log.filter((e) => e.method === "POST" && e.path === PATH);
    const ids = posts.flatMap((p) => {
        const body = JSON.parse(p.variables.replace(/^\{\}/, "")) as {
            events?: { eventId: string }[];
        };
        return (body.events ?? []).map((ev) => ev.eventId);
    });
    return { posts: posts.length, ids };
}

test("events queued before each hard navigation are received, once", async ({ page, request }) => {
    await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "investment-enabled" } });
    await request.post(`${MOCK}/__test/backend-log/reset`);

    for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
    }
    // Leave the last page too.
    await page.goto("about:blank");
    await page.waitForTimeout(1000);

    const { posts, ids } = await received(request);
    // Every page load queues at least session_started/page_viewed/feature_viewed.
    expect(posts, "send attempts for 5 hard page loads").toBeGreaterThanOrEqual(ROUTES.length);
    expect(ids.length).toBeGreaterThanOrEqual(ROUTES.length * 3);
    expect(new Set(ids).size, "no event is received twice").toBe(ids.length);
});
