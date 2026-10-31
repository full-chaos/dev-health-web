import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// CHAOS-12173: saved BYO settings whose key the configured encryption key cannot decrypt (go-api's 409
// llm_settings_undecryptable, CHAOS-12172). The card says so and offers Replace and Remove; a transient
// read failure still offers Retry only.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const MESSAGE = "The saved key can no longer be read. Replace or remove it.";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ request }) => {
    const reset = await request.post(`${MOCK}/__test/llm-settings-unreadable`, {
        data: { unreadable: false },
    });
    expect(reset.status()).toBe(204);
});

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(async (target) => {
        const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
        const node = document.querySelector(target);
        if (!node) return ["target not found"];
        const result = await axe.run(node);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
    }, selector);
}

for (const viewport of [
    { name: "desktop", width: 1280, height: 1100 },
    { name: "mobile", width: 390, height: 844 },
]) {
    test.describe(`${viewport.name} (${viewport.width}px)`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } });

        test("unreadable settings offer Replace and Remove; Remove clears them", async ({
            page,
            request,
        }, testInfo) => {
            const seeded = await request.post(`${MOCK}/__test/llm-settings-unreadable`, {
                data: { unreadable: true, purposes: ["explain"] },
            });
            expect(seeded.status()).toBe(204);
            await page.goto("/org/admin/ai/byo-llm");
            const card = page.getByTestId("byo-llm-unreadable");
            await expect(card).toContainText(MESSAGE);
            await expect(card.getByTestId("byo-llm-unreadable-scope")).toHaveText(
                "The default configuration or the Explanations model override cannot be read.",
            );
            await expect(card.getByRole("button", { name: "Replace" })).toBeVisible();
            await expect(card.getByRole("button", { name: "Remove" })).toBeVisible();
            await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
            await page.waitForLoadState("networkidle");
            await card.scrollIntoViewIfNeeded();
            await page.screenshot({ path: testInfo.outputPath(`unreadable-${viewport.name}.png`) });
            expect(await axeViolations(page, "[data-testid=byo-llm-unreadable]")).toEqual([]);
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth,
                ),
            ).toBe(true);

            await card.getByRole("button", { name: "Remove" }).click();
            await card.getByRole("button", { name: "Confirm remove?" }).click();
            await expect(page.getByText("BYO-LLM settings removed.")).toBeVisible();
            await expect(page.getByTestId("byo-llm-unreadable")).toHaveCount(0);
            // Read again: nothing saved, so the setup form, and no read error anywhere on the page.
            await expect(page.getByLabel(/api key/i).first()).toBeVisible();
            await expect(page.getByText("Could not be read")).toHaveCount(0);
            await page.screenshot({ path: testInfo.outputPath(`removed-${viewport.name}.png`) });
        });
    });
}

test("a transient read failure still offers Retry only", async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
    const seeded = await request.post(`${MOCK}/__test/llm-settings-unreadable`, {
        data: { unreadable: false, transient: true },
    });
    expect(seeded.status()).toBe(204);
    await page.goto("/org/admin/ai/byo-llm");
    await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible();
    await expect(page.getByTestId("byo-llm-unreadable")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("transient-desktop.png") });
});

test("Replace takes a new key and the saved settings read again", async ({ page, request }) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await request.post(`${MOCK}/__test/llm-settings-unreadable`, { data: { unreadable: true } });
    await page.goto("/org/admin/ai/byo-llm");
    await page.getByTestId("byo-llm-unreadable").getByRole("button", { name: "Replace" }).click();
    await expect(page.getByTestId("byo-llm-unreadable")).toHaveCount(0);
    await expect(page.getByLabel(/api key/i).first()).toHaveValue("");
});
