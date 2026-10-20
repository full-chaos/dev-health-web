import { expect, test } from "@playwright/test";

// Tall enough that the card is on screen without scrolling under the sticky top bar.
test.use({ viewport: { width: 1280, height: 1600 } });

test("the model field suggests the provider's models and still takes free text", async ({
    page,
}, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    const hint = page.getByTestId("byo-model-hint");
    const input = page.getByLabel("Model");
    const card = page.getByTestId("byo-llm-edit-body");
    const optionCount = page.locator("#byo-model-options option");
    // The dev server can re-read the settings after the form opened and close it; each step that
    // needs the open form is retried from the top until the whole check holds.
    await expect(async () => {
        if (!(await card.isVisible())) {
            await page.getByRole("button", { name: "Edit" }).click({ timeout: 2000 });
        }
        await expect(hint).toHaveText("4 models from your provider. Any model name still works.", {
            timeout: 3000,
        });
        await expect(input).toHaveAttribute("list", "byo-model-options", { timeout: 2000 });
        await expect(optionCount).toHaveCount(4, { timeout: 2000 });
        await expect(optionCount.first()).toHaveAttribute("value", "gpt-4o", { timeout: 2000 });
        await card.screenshot({
            path: testInfo.outputPath("byo-model-picker-list.png"),
            timeout: 3000,
        });
    }).toPass({ timeout: 30_000 });

    await expect(async () => {
        if (!(await card.isVisible())) {
            await page.getByRole("button", { name: "Edit" }).click({ timeout: 2000 });
        }
        await input.fill("my-private-finetune", { timeout: 3000 });
        await expect(input).toHaveValue("my-private-finetune", { timeout: 2000 });
        await card.screenshot({
            path: testInfo.outputPath("byo-model-picker-free-text.png"),
            timeout: 3000,
        });
    }).toPass({ timeout: 30_000 });
});
