import { expect, test, type Page, type Request, type Response } from "@playwright/test";

const CONTEXT_FABRIC_VALIDATION_PATH = "/superadmin/context-fabric/validation";

const secretPattern =
    /BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;
const clientChunkForbiddenPattern =
    /ACR_API_ORIGIN|ACR_REQUEST_TIMEOUT_MS|ACR_WEB_ASSERTION_(?:KEY_FILE|KID|ISSUER|AUDIENCE)|BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;

test.beforeEach(async ({ request }) => {
    const response = await request.post("http://127.0.0.1:8001/__test/entitlements", {
        data: { scenario: "provisioned" },
    });
    expect(response.ok()).toBe(true);
});

// Server actions are answered through page.route: the guard reads the FULL response body before the
// page sees it. Chromium cancels the end of a server action's response stream once the action result is
// decoded, and a cancelled response has no readable body, so reading it afterwards is not
// possible; every other response is still read with response.text() and a read failure still fails.
// Known limit: server-action responses are buffered in the guard spec.
async function watchNetwork(
    page: Page,
    origin: string,
    options: { mutateActionBody?: (body: string) => string } = {},
) {
    const directAcrRequests: string[] = [];
    const networkRecords: string[] = [];
    const networkRecordTasks: Promise<void>[] = [];
    const interceptedActions = new Set<Request>();
    const actionCounts = { intercepted: 0, scanned: 0 };

    await page.route(
        (url) => url.origin === origin,
        async (route) => {
            const request = route.request();
            if (request.method() !== "POST" || !("next-action" in request.headers())) {
                await route.fallback();
                return;
            }
            actionCounts.intercepted += 1;
            interceptedActions.add(request);
            const response = await route.fetch();
            const body = await response.text();
            networkRecords.push(
                request.url(),
                JSON.stringify(response.headers()),
                options.mutateActionBody ? options.mutateActionBody(body) : body,
            );
            actionCounts.scanned += 1;
            await route.fulfill({ response, body });
        },
    );
    const onRequest = (request: Request) => {
        if (request.url().includes("/api/v1/agent-context")) directAcrRequests.push(request.url());
        networkRecords.push(request.postData() ?? "");
        networkRecordTasks.push(
            request.allHeaders().then((headers) => {
                networkRecords.push(JSON.stringify(headers));
            }),
        );
    };
    const onResponse = (response: Response) => {
        networkRecordTasks.push(
            (async () => {
                const headers = await response.allHeaders();
                networkRecords.push(response.url(), JSON.stringify(headers));

                // The body of an intercepted server action was scanned in full by the route handler.
                if (interceptedActions.has(response.request())) return;
                // Chromium does not expose redirect response bodies through CDP. Their
                // browser-visible URL, Location, and other headers remain covered,
                // while every non-redirect response body is still inspected below.
                if (response.status() >= 300 && response.status() < 400) return;
                networkRecords.push(await response.text());
            })(),
        );
    };
    page.on("request", onRequest);
    page.on("response", onResponse);

    // Stop recording, then wait for every record already started: a response that arrives after the
    // test body has finished is not part of what this test observed and must not outlive it.
    const stop = async () => {
        page.off("request", onRequest);
        page.off("response", onResponse);
        await page.unrouteAll({ behavior: "wait" });
        await Promise.all(networkRecordTasks);
    };
    return { directAcrRequests, networkRecords, stop, actionCounts };
}

const ACTION_PROBE = async ([path, cancelBody]: [string, boolean]) => {
    const response = await fetch(path, {
        body: "[]",
        headers: { "content-type": "text/plain;charset=UTF-8", "next-action": "0".repeat(40) },
        method: "POST",
    });
    if (cancelBody && response.body) {
        const reader = response.body.getReader();
        await reader.cancel();
        return response.status;
    }
    await response.text();
    return response.status;
};

test("keeps ACR assertion material out of browser routes, network traffic, and client chunks", async ({
    baseURL,
    page,
}) => {
    const { directAcrRequests, networkRecords, stop, actionCounts } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await expect(page).toHaveURL(new RegExp(`${CONTEXT_FABRIC_VALIDATION_PATH}$`));
    await expect(
        page.getByRole("heading", {
            name: "Context Fabric Validation",
            exact: true,
            level: 1,
        }),
    ).toBeVisible();

    const routeResult = await page.evaluate(async () => {
        const response = await fetch("/api/agent-context/context-packets", {
            body: JSON.stringify({
                goal: "Inspect a safe server boundary",
                repository: "foreign/repository",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
        });
        return { body: await response.text(), status: response.status };
    });

    expect(routeResult.status).toBeGreaterThanOrEqual(400);
    expect(routeResult.body).not.toMatch(secretPattern);
    expect(directAcrRequests).toEqual([]);

    // One server action of this guard's own, so the interception is always exercised.
    await page.evaluate(ACTION_PROBE, [CONTEXT_FABRIC_VALIDATION_PATH, false]);

    const clientChunks = await page.evaluate(async () => {
        const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.includes("/_next/static/") && url.endsWith(".js"));
        return Promise.all(urls.map(async (url) => (await fetch(url)).text()));
    });
    await stop();
    expect(actionCounts.intercepted).toBeGreaterThan(0);
    expect(actionCounts.scanned).toBe(actionCounts.intercepted);
    expect(networkRecords.join("\n")).not.toMatch(secretPattern);
    expect(clientChunks.join("\n")).not.toMatch(clientChunkForbiddenPattern);
});

test("scans the full body of a server action response for secret material", async ({
    baseURL,
    page,
}) => {
    const { networkRecords, stop, actionCounts } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
        { mutateActionBody: (body) => `${body}\nfcacr_PLANTED0123456789` },
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await page.evaluate(ACTION_PROBE, [CONTEXT_FABRIC_VALIDATION_PATH, false]);
    await stop();

    expect(actionCounts.intercepted).toBeGreaterThan(0);
    expect(actionCounts.scanned).toBe(actionCounts.intercepted);
    expect(networkRecords.join("\n")).toMatch(secretPattern);
});

test("a server action response the page cancels mid-stream is still scanned and does not fail the guard", async ({
    baseURL,
    page,
}) => {
    const { networkRecords, stop, actionCounts } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await page.evaluate(ACTION_PROBE, [CONTEXT_FABRIC_VALIDATION_PATH, true]);
    await stop();

    expect(actionCounts.intercepted).toBeGreaterThan(0);
    expect(actionCounts.scanned).toBe(actionCounts.intercepted);
    expect(networkRecords.join("\n")).not.toMatch(secretPattern);
});
