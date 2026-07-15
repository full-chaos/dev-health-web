import { expect, test, type ConsoleMessage, type Page, type Request } from "@playwright/test";

const noAcrRequests = (page: Page) => {
    const requests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes("/api/v1/agent-context")) requests.push(request.url());
    });
    return requests;
};

const NEXT_DEV_EVAL_CSP_MESSAGE = "eval() is not supported in this environment.";

const browserFaults = (page: Page) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
        if (message.type() === "error" && !message.text().startsWith(NEXT_DEV_EVAL_CSP_MESSAGE)) {
            consoleErrors.push(message.text());
        }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request: Request) => failedRequests.push(request.url()));
    return { consoleErrors, pageErrors, failedRequests };
};

async function openExplorer(page: Page) {
    const faults = browserFaults(page);
    const requests = noAcrRequests(page);
    await page.goto("/agent-context/context-packet");
    await expect(page.getByRole("heading", { name: "Context Packet", level: 1 })).toBeVisible();
    return { faults, requests };
}

async function expectHealthyExplorer({
    faults,
    requests,
}: Awaited<ReturnType<typeof openExplorer>>) {
    await expect.poll(() => requests).toEqual([]);
    expect(faults.consoleErrors).toEqual([]);
    expect(faults.pageErrors).toEqual([]);
    expect(faults.failedRequests).toEqual([]);
}

test.describe("Context Packet Explorer", () => {
    test("renders the deterministic sample packet and exposes its Diagnose navigation entry", async ({
        page,
    }) => {
        const faults = browserFaults(page);
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
        expect(faults.consoleErrors).toEqual([]);
        expect(faults.pageErrors).toEqual([]);
        expect(faults.failedRequests).toEqual([]);
    });

    test("focuses the invalid goal, updates the visible packet, and keeps the browser boundary silent", async ({
        page,
    }) => {
        const health = await openExplorer(page);
        const goal = page.getByLabel(/Goal/);

        await goal.fill("");
        await page.getByRole("button", { name: "Generate context" }).click();

        await expect(goal).toBeFocused();
        await expect(goal).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByText("Goal is required.")).toBeVisible();

        await goal.fill("Verify the repository authorization boundary");
        await page.getByRole("button", { name: "Generate context" }).click();

        await expect(
            page.getByRole("heading", { name: "Verify the repository authorization boundary" }),
        ).toBeVisible();
        await expectHealthyExplorer(health);
    });

    test("opens the named evidence region with keyboard activation", async ({ page }) => {
        const health = await openExplorer(page);
        const disclosure = page.getByRole("button", { name: "Open evidence" });

        await disclosure.focus();
        await page.keyboard.press("Space");

        await expect(disclosure).toHaveAttribute("aria-expanded", "true");
        await expect(
            page.getByRole("region", { name: /Evidence for Credential scope/ }),
        ).toBeVisible();
        await expectHealthyExplorer(health);
    });

    for (const scenario of [
        ["not-entitled", "data-state-not-entitled"],
        ["loading", "data-state-loading"],
        ["empty", "data-state-empty"],
        ["error", "data-state-error"],
    ] as const) {
        test(`renders ${scenario[0]} without an ACR request`, async ({ page }) => {
            const faults = browserFaults(page);
            const requests = noAcrRequests(page);
            await page.goto(`/agent-context/context-packet?state=${scenario[0]}`);

            await expect(page.getByTestId(scenario[1])).toBeVisible();
            await expect.poll(() => requests).toEqual([]);
            expect(faults.consoleErrors).toEqual([]);
            expect(faults.pageErrors).toEqual([]);
            expect(faults.failedRequests).toEqual([]);
        });
    }
});
