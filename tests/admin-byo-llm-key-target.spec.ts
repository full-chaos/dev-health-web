import { expect, test } from "@playwright/test";

// A stored BYO key is bound to the provider and base URL it was saved with: the form asks for the key
// again on a change of either, at the API Key field, and saves nothing.
const MESSAGE = "A new provider or base URL needs its API key entered again.";

for (const viewport of [
    { name: "desktop", width: 1280, height: 1100 },
    { name: "mobile", width: 390, height: 844 },
]) {
    test.describe(`${viewport.name} (${viewport.width}px)`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } });

        test("a provider change with a stored key and no new key asks for the key", async ({
            page,
        }, testInfo) => {
            await page.goto("/org/admin/ai/byo-llm");
            await page.getByRole("button", { name: "Edit", exact: true }).first().click();
            await page.locator("#byo-provider").selectOption("openai");
            let saved = false;
            page.on("request", (request) => {
                if (request.method() === "PUT" && request.url().includes("/llm-settings"))
                    saved = true;
            });
            await page.getByRole("button", { name: "Save", exact: true }).click();
            const error = page.locator("#byo-api-key-error");
            await expect(error).toHaveText(MESSAGE);
            await expect(page.locator("#byo-api-key")).toHaveAttribute("aria-invalid", "true");
            expect(saved).toBe(false);
            await error.scrollIntoViewIfNeeded();
            await page.screenshot({
                path: testInfo.outputPath(`provider-change-${viewport.name}.png`),
            });
        });

        test("a base URL change with a stored key and no new key asks for the key", async ({
            page,
        }, testInfo) => {
            await page.goto("/org/admin/ai/byo-llm");
            await page.getByRole("button", { name: "Edit", exact: true }).first().click();
            await page.locator("#byo-base-url").fill("https://8.8.8.8/v1");
            await page.getByRole("button", { name: "Save", exact: true }).click();
            const error = page.locator("#byo-api-key-error");
            await expect(error).toHaveText(MESSAGE);
            await error.scrollIntoViewIfNeeded();
            await page.screenshot({
                path: testInfo.outputPath(`base-url-change-${viewport.name}.png`),
            });
        });
    });
}
