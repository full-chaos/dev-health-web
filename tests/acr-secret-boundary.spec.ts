import { expect, test } from "@playwright/test";

const secretPattern = /BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]/u;
const clientChunkForbiddenPattern =
    /ACR_API_ORIGIN|ACR_WEB_ASSERTION_(?:KEY_FILE|KID|ISSUER|AUDIENCE)|BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]/u;

test("keeps ACR assertion material out of browser routes, network traffic, and client chunks", async ({
    page,
}) => {
    const directAcrRequests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes("/api/v1/agent-context")) directAcrRequests.push(request.url());
    });

    await page.goto("/agent-context/context-packet");
    await expect(page.getByRole("heading", { name: "Context Packet", level: 1 })).toBeVisible();

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

    const clientChunks = await page.evaluate(async () => {
        const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.includes("/_next/static/") && url.endsWith(".js"));
        return Promise.all(urls.map(async (url) => (await fetch(url)).text()));
    });
    expect(clientChunks.join("\n")).not.toMatch(clientChunkForbiddenPattern);
});
