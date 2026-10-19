import { expect, test } from "@playwright/test";

test("an org admin turns ACR AI features on and off from AI Setup", async ({ page }, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    await expect(page.getByRole("heading", { name: "ACR AI features" })).toBeVisible();
    await expect(
        page.getByText(
            "Off stops ACR AI features for your org, including when you use your own key. On by default once a BYO key is saved.",
        ),
    ).toBeVisible();
    const state = page.getByTestId("ai-features-state");
    await expect(state).toHaveText("Off");

    await page.getByRole("button", { name: "Turn on" }).click();
    await expect(state).toHaveText("On");
    await page.getByRole("heading", { name: "ACR AI features" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("byo-ai-features-on.png"), fullPage: true });

    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(state).toHaveText("Off");
    await page.screenshot({ path: testInfo.outputPath("byo-ai-features-off.png"), fullPage: true });
});
