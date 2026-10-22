import { expect, test } from "@playwright/test";

const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ request }) => {
    await request.post(`${MOCK}/__test/prompt-cache`, { data: { enabled: false } });
});

// Tall enough that the card is on screen without scrolling under the sticky top bar.
test.use({ viewport: { width: 1280, height: 1800 } });

test("an org admin turns the prompt cache on and off from AI Setup", async ({ page }, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    const card = page.getByTestId("ai-panel-prompt-cache");
    await expect(card.getByRole("heading", { name: "Prompt cache" })).toBeVisible();
    await expect(card.getByText(/Applies to Anthropic models only/)).toBeVisible();
    await expect(card.getByText(/costs about 25% more on that part/)).toBeVisible();
    const state = card.getByTestId("prompt-cache-state");
    await expect(state).toHaveText("Off");
    await card.screenshot({ path: testInfo.outputPath("byo-prompt-cache-off.png") });

    await card.getByRole("button", { name: "Turn on" }).click();
    await expect(state).toHaveText("On");
    await expect(page.getByText("Prompt cache turned on")).toBeVisible();
    // A reload reads the stored value back.
    await page.reload();
    await expect(state).toHaveText("On");
    await card.screenshot({ path: testInfo.outputPath("byo-prompt-cache-on.png") });

    await card.getByRole("button", { name: "Turn off" }).click();
    await expect(state).toHaveText("Off");
    await page.reload();
    await expect(state).toHaveText("Off");
});

test("the card is not shown when the saved model is not on Anthropic", async ({
    page,
    request,
}) => {
    const seeded = await request.post(`${MOCK}/__test/prompt-cache`, {
        data: { enabled: false, anthropic: false },
    });
    expect(seeded.status()).toBe(204);
    await page.goto("/org/admin/ai/byo-llm");
    // The sibling card proves the page and the saved config have loaded.
    await expect(page.getByTestId("ai-panel-own-model")).toBeVisible();
    await expect(page.getByTestId("ai-panel-prompt-cache")).toHaveCount(0);
});
