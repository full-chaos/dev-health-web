import { expect, test, type ConsoleMessage, type Page, type Request } from "@playwright/test";

const CONTEXT_FABRIC_VALIDATION_PATH = "/superadmin/context-fabric/validation";

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
    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await expect(page).toHaveURL(new RegExp(`${CONTEXT_FABRIC_VALIDATION_PATH}$`));
    await expect(
        page.getByRole("heading", {
            name: "Context Fabric Validation",
            exact: true,
            level: 1,
        }),
    ).toBeVisible();
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

test.describe("Context Fabric Validation", () => {
    test.beforeEach(async ({ request }) => {
        const response = await request.post("http://127.0.0.1:8001/__test/entitlements", {
            data: { scenario: "provisioned" },
        });
        expect(response.ok()).toBe(true);
    });

    test("renders the deterministic sample packet in platform administration and stays out of Diagnose navigation", async ({
        page,
    }) => {
        const faults = browserFaults(page);
        const requests = noAcrRequests(page);
        await page.goto("/diagnose");
        await expect(page.getByRole("link", { name: "Context Fabric", exact: true })).toHaveCount(
            0,
        );
        await expect(
            page.getByRole("link", { name: "Context Fabric Validation", exact: true }),
        ).toHaveCount(0);

        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);

        await expect(page).toHaveURL(new RegExp(`${CONTEXT_FABRIC_VALIDATION_PATH}$`));
        await expect(
            page.getByRole("heading", {
                name: "Context Fabric Validation",
                exact: true,
                level: 1,
            }),
        ).toBeVisible();
        await expect(page.getByRole("link", { name: /Context Fabric Validation/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
        await expect(page.getByRole("heading", { name: "Pressure", level: 2 })).toBeVisible();
        await expect(page.getByText("Context Fabric status")).toBeVisible();
        await expect(
            page.getByRole("region", { name: "Context Fabric diagnostics" }),
        ).toBeVisible();
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

    test("puts mobile platform navigation before validation content at 375px", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const health = await openExplorer(page);
        const validationLink = page.getByRole("link", { name: /Context Fabric Validation/ });
        const validationHeading = page.getByRole("heading", {
            name: "Context Fabric Validation",
            exact: true,
            level: 1,
        });
        const [navigationBox, headingBox] = await Promise.all([
            validationLink.boundingBox(),
            validationHeading.boundingBox(),
        ]);

        expect(navigationBox?.y).toBeLessThan(headingBox?.y ?? Number.POSITIVE_INFINITY);
        await expectHealthyExplorer(health);
    });

    test("renders partial coverage with available context and no ACR request", async ({ page }) => {
        const faults = browserFaults(page);
        const requests = noAcrRequests(page);
        await page.goto(`${CONTEXT_FABRIC_VALIDATION_PATH}?state=partial`);

        await expect(page.getByRole("heading", { name: "Pressure", level: 2 })).toBeVisible();
        await expect(page.getByText("Coverage is partial.")).toBeVisible();
        await expect.poll(() => requests).toEqual([]);
        expect(faults.consoleErrors).toEqual([]);
        expect(faults.pageErrors).toEqual([]);
        expect(faults.failedRequests).toEqual([]);
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
            await page.goto(`${CONTEXT_FABRIC_VALIDATION_PATH}?state=${scenario[0]}`);

            await expect(page.getByTestId(scenario[1])).toBeVisible();
            await expect.poll(() => requests).toEqual([]);
            expect(faults.consoleErrors).toEqual([]);
            expect(faults.pageErrors).toEqual([]);
            expect(faults.failedRequests).toEqual([]);
        });
    }
});
