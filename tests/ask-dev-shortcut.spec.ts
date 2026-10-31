import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11935 (plan I-19): Cmd/Ctrl+J opens and closes the Ask Dev panel, never from a field, with
// the browser default (downloads, address bar) suppressed; the Cmd/Ctrl+K palette lists an Ask Dev
// entry on the same gate as the launcher.
const MOCK = "http://127.0.0.1:8001";
const PANEL = "ask-dev-panel";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 800 } });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

/**
 * Records `defaultPrevented` of every Ctrl/Cmd+J keydown as the browser would see it: a listener on
 * `window` in the bubble phase runs after the app's `document` listener.
 */
async function recordJ(page: Page): Promise<void> {
    await page.evaluate(() => {
        const w = window as unknown as { __jPrevented: boolean[] };
        w.__jPrevented = [];
        window.addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
                w.__jPrevented.push(event.defaultPrevented);
            }
        });
    });
}

const recorded = (page: Page) =>
    page.evaluate(() => (window as unknown as { __jPrevented: boolean[] }).__jPrevented);

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test("Control+J toggles the panel and the browser default is suppressed", async ({
    page,
    request,
}) => {
    await setScenario(request, "provisioned");
    await page.goto("/dashboard");
    // Hydrated: a click on the launcher opens the panel, so the shell's listeners are attached.
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    await expect(page.getByTestId(PANEL)).toBeVisible();
    await page.getByTestId("ask-dev-panel-close").click();
    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    await recordJ(page);
    const panel = page.getByTestId(PANEL);
    await expect(panel).toHaveCount(0);

    await page.keyboard.press("Control+J");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Control+J");
    await expect(panel).toHaveCount(0);
    expect(await recorded(page)).toEqual([true, true]);
});

test("Control+J in a field does nothing and leaves the default alone", async ({
    page,
    request,
}) => {
    await setScenario(request, "provisioned");
    await page.goto("/dashboard");
    await recordJ(page);
    await page.getByTestId("command-palette-trigger").click();
    // The palette is a modal dialog: its input owns the keyboard.
    await page.getByRole("combobox", { name: "Search destinations" }).press("Control+J");
    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    expect(await recorded(page)).toEqual([false]);
});

test("the palette opens Ask Dev, and offers it only when the launcher is offered", async ({
    page,
    request,
}) => {
    await setScenario(request, "provisioned");
    await page.goto("/dashboard");
    // Hydrated: the palette trigger responds to a click before Control+K is relied on.
    await page.getByTestId("command-palette-trigger").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+K");
    // The panel action, not the "Ask Dev full page" entry of the nav row (CHAOS-12210).
    await page.getByRole("option", { name: /Open the Ask Dev panel/ }).click();
    await expect(page.getByTestId(PANEL)).toBeVisible();

    await setScenario(request, "unprovisioned");
    await page.goto("/dashboard");
    await page.getByTestId("command-palette-trigger").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await expect(page.getByRole("option", { name: /^Ask Dev/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await recordJ(page);
    await page.keyboard.press("Control+J");
    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    expect(await recorded(page)).toEqual([false]);
});
