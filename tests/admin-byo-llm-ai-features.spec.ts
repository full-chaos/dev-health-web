import { expect, test } from "@playwright/test";

const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const DESCRIPTION =
    "Off stops ACR AI features for your org, including when you use your own key. On by default once a BYO key is saved.";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ request }) => {
    await request.post(`${MOCK}/__test/service-model`, {
        data: { override: null, managed: false },
    });
});

// Tall enough that the card is on screen without scrolling under the sticky top bar.
test.use({ viewport: { width: 1280, height: 1600 } });

test("an org admin turns ACR AI features on and off from AI Setup", async ({ page }, testInfo) => {
    await page.goto("/org/admin/ai/byo-llm");
    const card = page.getByTestId("ai-panel-acr-ai-features");
    await expect(card.getByRole("heading", { name: "ACR AI features" })).toBeVisible();
    await expect(card.getByText(DESCRIPTION)).toBeVisible();
    const state = card.getByTestId("ai-features-state");
    // A saved BYO key and no override: ops serves the effective value, which is on.
    await expect(state).toHaveText("On");
    await card.screenshot({ path: testInfo.outputPath("byo-ai-features-on.png") });

    await card.getByRole("switch").click();
    await expect(state).toHaveText("Off");
    await page.reload();
    await expect(state).toHaveText("Off");
    await card.screenshot({ path: testInfo.outputPath("byo-ai-features-off.png") });

    await card.getByRole("switch").click();
    await expect(state).toHaveText("On");
    await expect(page.getByText("ACR AI features turned on")).toBeVisible();
    // A reload reads the stored value back and leaves no toast over the card.
    await page.reload();
    await expect(state).toHaveText("On");
});

test("a setting managed by billing or support is read-only", async ({
    page,
    request,
}, testInfo) => {
    const seeded = await request.post(`${MOCK}/__test/service-model`, {
        data: { override: true, managed: true },
    });
    expect(seeded.status()).toBe(204);
    await page.goto("/org/admin/ai/byo-llm");
    const card = page.getByTestId("ai-panel-acr-ai-features");
    await expect(card.getByTestId("ai-features-state")).toHaveText("On");
    await expect(
        card.getByText(
            "This setting is managed by your plan or support. Contact support to change it.",
        ),
    ).toBeVisible();
    await expect(card.getByRole("switch")).toHaveCount(0);
    await card.screenshot({ path: testInfo.outputPath("byo-ai-features-managed.png") });
});
