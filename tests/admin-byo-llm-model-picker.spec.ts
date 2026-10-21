import { expect, test } from "@playwright/test";

// Tall enough that the card is on screen without scrolling under the sticky top bar.
test.use({ viewport: { width: 1280, height: 1600 } });

test("the model field is a select from the platform catalog and still takes a typed name", async ({
    page,
}, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    const hint = page.getByTestId("byo-model-hint");
    const select = page.locator("select#byo-model");
    const card = page.getByTestId("byo-llm-edit-body");
    // The dev server can re-read the settings after the form opened and close it; each step that
    // needs the open form is retried from the top until the whole check holds.
    await expect(async () => {
        if (!(await card.isVisible())) {
            await page.getByRole("button", { name: "Edit" }).click({ timeout: 2000 });
        }
        await expect(select).toBeVisible({ timeout: 3000 });
        await expect(select.locator("option[value='gpt-4o']")).toHaveCount(1, { timeout: 2000 });
        await expect(hint).toContainText("models", { timeout: 2000 });
        await card.screenshot({
            path: testInfo.outputPath("byo-model-select.png"),
            timeout: 3000,
        });
    }).toPass({ timeout: 30_000 });

    await expect(async () => {
        if (!(await card.isVisible())) {
            await page.getByRole("button", { name: "Edit" }).click({ timeout: 2000 });
        }
        await select.selectOption("__other__", { timeout: 3000 });
        const other = page.getByLabel("Other model name");
        await other.fill("my-private-finetune", { timeout: 3000 });
        await expect(other).toHaveValue("my-private-finetune", { timeout: 2000 });
        await card.screenshot({
            path: testInfo.outputPath("byo-model-other.png"),
            timeout: 3000,
        });
    }).toPass({ timeout: 30_000 });
});

test("changing the provider refreshes the select without a key", async ({ page }) => {
    await page.goto("/org/admin/ai/byo-llm");
    const card = page.getByTestId("byo-llm-edit-body");
    await expect(async () => {
        if (!(await card.isVisible())) {
            await page.getByRole("button", { name: "Edit" }).click({ timeout: 2000 });
        }
        await page.getByLabel("Provider").selectOption("anthropic", { timeout: 3000 });
        await expect(page.locator("select#byo-model option[value='claude-haiku-5-5']")).toHaveCount(
            1,
            { timeout: 3000 },
        );
    }).toPass({ timeout: 30_000 });
});
