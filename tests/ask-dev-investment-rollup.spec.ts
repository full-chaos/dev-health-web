import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// CHAOS-12178: the owning-team roll-up label on investment claims about a project, in the real Ask
// Dev panel, from two real scrubbed kiac answers taken after the R1 pin bump (acr #1800). The
// panel's test-mode answer source reads the answer from session storage.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const KEY = "ask-dev:test-mode-answer";
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: unknown }).result;
const PROJECTS = capture("kiac_projects_feature_investment_rollup.event.json");
const THEME_MIX = capture("kiac_project_theme_mix_rollup.event.json");
const LABEL = "Owning team's roll-up · 0 own work units in this window";

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, answer: unknown, theme?: "light" | "dark"): Promise<void> {
    await page.addInitScript(
        ([key, value, mode]) => {
            window.sessionStorage.setItem(key, value);
            if (mode) window.localStorage.setItem("theme", mode);
        },
        [KEY, JSON.stringify(answer), theme ?? ""] as const,
    );
}

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

async function openPanel(page: Page, mobile = false): Promise<Locator> {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    return mobile
        ? page.getByRole("dialog", { name: "Ask Dev" })
        : page.getByRole("complementary", { name: "Ask Dev" });
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("ranking: the 11 projects served the roll-up are labelled, the others are not", async ({
        page,
    }, testInfo) => {
        await seed(page, PROJECTS, "dark");
        const panel = await openPanel(page);
        const ranking = panel.getByTestId("ask-dev-ranking");
        await expect(ranking.getByTestId("ask-dev-ranking-row")).toHaveCount(19);
        const labels = ranking.getByTestId("ask-dev-investment-rollup");
        await expect(labels).toHaveCount(11);
        await expect(labels.first()).toBeVisible();
        await expect(labels.first().locator("[aria-hidden=true]")).toHaveText(LABEL);
        await labels.first().scrollIntoViewIfNeeded();
        await panel.screenshot({ path: testInfo.outputPath("rollup-ranking-desktop-dark.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });

    test("drivers: the roll-up driver is labelled, the project-native one is not", async ({
        page,
    }, testInfo) => {
        await seed(page, PROJECTS, "dark");
        const panel = await openPanel(page);
        const drivers = panel.getByTestId("ask-dev-answer-driver");
        const rollup = drivers.filter({ hasText: "Synthetic Project November: investment mix" });
        const native = drivers.filter({ hasText: "Synthetic Project Tango: investment mix" });
        await expect(rollup.getByTestId("ask-dev-investment-rollup")).toHaveCount(1);
        await expect(native.getByTestId("ask-dev-investment-rollup")).toHaveCount(0);
        await rollup.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: testInfo.outputPath("rollup-drivers-desktop-dark.png") });
    });

    test("one project's theme mix: its driver is labelled (light)", async ({ page }, testInfo) => {
        await seed(page, THEME_MIX, "light");
        const panel = await openPanel(page);
        const label = panel
            .getByTestId("ask-dev-answer-driver")
            .getByTestId("ask-dev-investment-rollup");
        await expect(label).toHaveCount(1);
        await label.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: testInfo.outputPath("rollup-theme-mix-desktop-light.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const [name, answer] of [
        ["ranking", PROJECTS],
        ["theme-mix", THEME_MIX],
    ] as const) {
        test(`${name}: the label fits the sheet with no sideways scroll`, async ({
            page,
        }, testInfo) => {
            await seed(page, answer);
            const sheet = await openPanel(page, true);
            const label = sheet.getByTestId("ask-dev-investment-rollup").first();
            await expect(label).toBeVisible();
            await label.scrollIntoViewIfNeeded();
            await sheet.screenshot({ path: testInfo.outputPath(`rollup-${name}-mobile.png`) });
            const answerBox = sheet.getByTestId("ask-dev-answer");
            for (const box of [answerBox, sheet])
                expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
                    true,
                );
            expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        });
    }
});
