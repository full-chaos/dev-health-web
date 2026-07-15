import { expect, test, type Page } from "@playwright/test";

const noAcrRequests = (page: Page) => {
    const requests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes("/api/v1/agent-context")) requests.push(request.url());
    });
    return requests;
};

test.describe("Context Packet Explorer", () => {
    test("renders the deterministic sample packet and exposes its Diagnose navigation entry", async ({
        page,
    }) => {
        const requests = noAcrRequests(page);
        await page.goto("/agent-context/context-packet");

        await expect(page.getByRole("heading", { name: "Context Packet", level: 1 })).toBeVisible();
        await expect(page.getByRole("link", { name: "Diagnose", exact: true })).toHaveAttribute(
            "data-active",
            "true",
        );
        await expect(page.getByRole("heading", { name: "Pressure", level: 2 })).toBeVisible();
        await expect(page.getByText("Packet status")).toBeVisible();
        await expect.poll(() => requests).toEqual([]);
    });

    for (const scenario of [
        ["not-entitled", "data-state-not-entitled"],
        ["loading", "data-state-loading"],
        ["empty", "data-state-empty"],
        ["error", "data-state-error"],
    ] as const) {
        test(`renders ${scenario[0]} without an ACR request`, async ({ page }) => {
            const requests = noAcrRequests(page);
            await page.goto(`/agent-context/context-packet?state=${scenario[0]}`);

            await expect(page.getByTestId(scenario[1])).toBeVisible();
            await expect.poll(() => requests).toEqual([]);
        });
    }
});
