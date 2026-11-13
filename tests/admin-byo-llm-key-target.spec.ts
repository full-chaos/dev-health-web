import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// A stored BYO key is bound to the provider and base URL it was saved with: the form asks for the key
// again on a change of either, at the API Key field, and saves nothing.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const MESSAGE = "A new provider or base URL needs its API key entered again.";

test.describe.configure({ mode: "serial" });

// The seeded default: anthropic, a stored key, no base URL.
test.beforeEach(async ({ request }) => {
    const reset = await request.post(`${MOCK}/__test/llm-settings-unreadable`, {
        data: { unreadable: false },
    });
    expect(reset.status()).toBe(204);
});

// The save is a server action: the write is seen at the mock backend, not in the browser.
async function settingsWritesSince(request: APIRequestContext, since: number) {
    const log = (await (await request.get(`${MOCK}/__test/backend-log`)).json()) as {
        method: string;
        path: string;
        at: number;
    }[];
    return log.filter(
        (e) => e.at >= since && e.method === "PUT" && e.path === "/api/v1/admin/llm-settings",
    );
}

// The dev server can re-read the settings after the form opened and close it: each try opens the
// form again and repeats the change until the whole check holds.
async function refusedAtApiKey(page: Page, change: () => Promise<void>, shot: string) {
    const card = page.getByTestId("byo-llm-edit-body");
    const error = page.locator("#byo-api-key-error");
    await expect(async () => {
        if (!(await card.isVisible())) {
            await page
                .getByRole("button", { name: "Edit", exact: true })
                .first()
                .click({ timeout: 2000 });
        }
        await change();
        await page.getByRole("button", { name: "Save", exact: true }).click({ timeout: 2000 });
        await expect(error).toHaveText(MESSAGE, { timeout: 2000 });
        await expect(page.locator("#byo-api-key")).toHaveAttribute("aria-invalid", "true", {
            timeout: 2000,
        });
        await error.scrollIntoViewIfNeeded({ timeout: 2000 });
        await page.screenshot({ path: shot, timeout: 3000 });
    }).toPass({ timeout: 30_000 });
}

for (const viewport of [
    { name: "desktop", width: 1280, height: 1100 },
    { name: "mobile", width: 390, height: 844 },
]) {
    test.describe(`${viewport.name} (${viewport.width}px)`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } });

        test("a provider change with a stored key and no new key asks for the key", async ({
            page,
            request,
        }, testInfo) => {
            await page.goto("/org/admin/ai/byo-llm");
            const since = Date.now();
            await refusedAtApiKey(
                page,
                () => page.locator("#byo-provider").selectOption("openai", { timeout: 3000 }),
                testInfo.outputPath(`provider-change-${viewport.name}.png`),
            );
            expect(await settingsWritesSince(request, since)).toEqual([]);
        });

        test("a base URL change with a stored key and no new key asks for the key", async ({
            page,
            request,
        }, testInfo) => {
            await page.goto("/org/admin/ai/byo-llm");
            const since = Date.now();
            await refusedAtApiKey(
                page,
                () => page.locator("#byo-base-url").fill("https://8.8.8.8/v1", { timeout: 3000 }),
                testInfo.outputPath(`base-url-change-${viewport.name}.png`),
            );
            expect(await settingsWritesSince(request, since)).toEqual([]);
        });
    });
}
