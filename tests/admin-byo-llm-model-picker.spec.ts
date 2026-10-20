import { expect, test } from "@playwright/test";

// Tall enough that the card is on screen without scrolling under the sticky top bar.
test.use({ viewport: { width: 1280, height: 1600 } });

test("the model field suggests the provider's models and still takes free text", async ({
    page,
}, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    // A click before hydration, or a settings re-read that closes the form, needs a retry:
    // repeat the open until the list hint shows.
    const hint = page.getByTestId("byo-model-hint");
    await expect(async () => {
        if (!(await page.getByTestId("byo-llm-edit-body").isVisible())) {
            await page.getByRole("button", { name: "Edit" }).click({ timeout: 2000 });
        }
        await expect(hint).toHaveText("4 models from your provider. Any model name still works.", {
            timeout: 3000,
        });
    }).toPass({ timeout: 30_000 });
    const input = page.getByLabel("Model");
    await expect(input).toHaveAttribute("list", "byo-model-options");
    await expect(page.locator("#byo-model-options option")).toHaveCount(4);
    await expect(page.locator("#byo-model-options option").first()).toHaveAttribute(
        "value",
        "gpt-4o",
    );

    const card = page.getByTestId("byo-llm-edit-body");
    await card.screenshot({ path: testInfo.outputPath("byo-model-picker-list.png") });

    await input.fill("my-private-finetune");
    await expect(input).toHaveValue("my-private-finetune");
    await card.screenshot({ path: testInfo.outputPath("byo-model-picker-free-text.png") });
});
