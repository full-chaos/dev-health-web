import { expect, test } from "@playwright/test";

test("a purpose model is set and cleared from AI Setup", async ({ page }, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    const section = page.getByRole("heading", { name: "Models per purpose" });
    await expect(section).toBeVisible();

    await page.getByRole("button", { name: "Set model" }).last().click();
    await page.getByLabel("Model", { exact: true }).fill("claude-small");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/claude-small/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("byo-purpose-saved.png"), fullPage: true });

    await page.getByRole("button", { name: "Use default" }).click();
    await expect(page.getByText(/claude-small/)).toHaveCount(0);
});
