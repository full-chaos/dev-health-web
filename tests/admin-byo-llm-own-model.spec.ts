import { expect, test } from "@playwright/test";

const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ request }) => {
    await request.post(`${MOCK}/__test/own-model`, { data: { enabled: true } });
});

// Tall enough that the card is on screen without scrolling under the sticky top bar.
test.use({ viewport: { width: 1280, height: 1800 } });

test("an org admin turns the saved own model off and on from AI Setup", async ({
    page,
}, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    const card = page.getByTestId("ai-panel-own-model");
    await expect(card.getByRole("heading", { name: "Use your own model" })).toBeVisible();
    await expect(
        card.getByText(/The readiness check and the model list still use your saved key/),
    ).toBeVisible();
    const state = card.getByTestId("own-model-state");
    await expect(state).toHaveText("On");
    await card.screenshot({ path: testInfo.outputPath("byo-own-model-on.png") });

    await card.getByRole("switch").click();
    await expect(state).toHaveText("Off");
    await expect(page.getByText("Own model turned off")).toBeVisible();
    // A reload reads the stored value back; the saved provider settings stay on the page.
    await page.reload();
    await expect(state).toHaveText("Off");
    await expect(page.getByTestId("ai-panel-own-model")).toBeVisible();
    await card.screenshot({ path: testInfo.outputPath("byo-own-model-off.png") });

    await card.getByRole("switch").click();
    await expect(state).toHaveText("On");
    await page.reload();
    await expect(state).toHaveText("On");
});

test("a seeded off state reads off after a load", async ({ page, request }) => {
    const seeded = await request.post(`${MOCK}/__test/own-model`, { data: { enabled: false } });
    expect(seeded.status()).toBe(204);
    await page.goto("/org/admin/ai/byo-llm");
    await expect(page.getByTestId("ai-panel-own-model").getByTestId("own-model-state")).toHaveText(
        "Off",
    );
});
