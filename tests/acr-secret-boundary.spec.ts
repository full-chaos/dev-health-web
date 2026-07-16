import { expect, test } from "@playwright/test";

const secretPattern =
    /BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;
const clientChunkForbiddenPattern =
    /ACR_API_ORIGIN|ACR_REQUEST_TIMEOUT_MS|ACR_WEB_ASSERTION_(?:KEY_FILE|KID|ISSUER|AUDIENCE)|BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;

test("keeps ACR assertion material out of browser routes, network traffic, and client chunks", async ({
    page,
}) => {
    const directAcrRequests: string[] = [];
    const networkRecords: string[] = [];
    const networkRecordTasks: Promise<void>[] = [];
    page.on("request", (request) => {
        if (request.url().includes("/api/v1/agent-context")) directAcrRequests.push(request.url());
        networkRecords.push(request.postData() ?? "");
        networkRecordTasks.push(
            request.allHeaders().then((headers) => {
                networkRecords.push(JSON.stringify(headers));
            }),
        );
    });
    page.on("response", (response) => {
        networkRecordTasks.push(
            Promise.all([response.allHeaders(), response.text()]).then(([headers, body]) => {
                networkRecords.push(JSON.stringify(headers), body);
            }),
        );
    });

    await page.goto("/agent-context/context-packet");
    await expect(page.getByRole("heading", { name: "Context Fabric", level: 1 })).toBeVisible();

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
    await Promise.all(networkRecordTasks);
    expect(networkRecords.join("\n")).not.toMatch(secretPattern);

    const clientChunks = await page.evaluate(async () => {
        const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.includes("/_next/static/") && url.endsWith(".js"));
        return Promise.all(urls.map(async (url) => (await fetch(url)).text()));
    });
    expect(clientChunks.join("\n")).not.toMatch(clientChunkForbiddenPattern);
});
