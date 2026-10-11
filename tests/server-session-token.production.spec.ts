import { writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * CHAOS-9229: the modules that read data on the server AND in a browser get the session read from
 * `#server-session`, and the bundler picks its variant for each module graph. This spec reads the
 * result of that choice in the PRODUCTION build (`playwright.context-fabric.config.ts`): a server
 * render must send the session token with the reads that use that session read. If the server
 * graphs got the variant with no session read, these reads would have no token, or would not
 * start (the GraphQL read needs the organization of the session).
 *
 * The document is fetched with the request API, so no browser script runs: each backend request
 * in the log comes from the server render.
 */
const MOCK = `http://127.0.0.1:${process.env.CONTEXT_FABRIC_OPS_PORT ?? "8012"}`;

type Entry = { method: string; path: string; operation: string; authorized: boolean };

const summary = (entries: Entry[]) =>
    entries.map((entry) => `${entry.method} ${entry.operation} token=${entry.authorized}`);

async function serverRenderReads(
    page: { request: APIRequestContext },
    request: APIRequestContext,
    url: string,
    label: string,
): Promise<Entry[]> {
    await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "investment-enabled" } });
    await request.post(`${MOCK}/__test/backend-log/reset`);
    const document = await page.request.get(url);
    expect(document.status(), `status of ${url}`).toBeLessThan(500);
    const log = (await (await request.get(`${MOCK}/__test/backend-log`)).json()) as Entry[];
    if (process.env.MEASURE_OUT) {
        writeFileSync(
            `${process.env.MEASURE_OUT}/server-session-token-${label}.json`,
            JSON.stringify(summary(log), null, 2),
        );
    }
    return log;
}

test("a server render sends the session token with its GraphQL read", async ({ page, request }) => {
    const log = await serverRenderReads(page, request, "/investment?tab=overview", "graphql");
    const reads = log.filter((entry) => entry.path.startsWith("/graphql"));

    // 0 reads means the measurement did not happen.
    expect(reads.length, "GraphQL reads of the server render").toBeGreaterThan(0);
    expect(summary(reads.filter((entry) => !entry.authorized))).toEqual([]);
});

test("a server render sends the session token with its REST read", async ({ page, request }) => {
    const log = await serverRenderReads(page, request, "/people/person-1", "rest");
    // The reads of the REST client. Other REST reads of the render set their own token.
    const reads = log.filter((entry) => entry.path.startsWith("/api/v1/people/"));

    // 0 reads means the measurement did not happen.
    expect(reads.length, "REST reads of the server render").toBeGreaterThan(0);
    expect(summary(reads.filter((entry) => !entry.authorized))).toEqual([]);
});
