import { test, expect, Page } from "@playwright/test";

import { decodeFilter } from "../src/lib/filters/encode";
import { clickUntilUrl } from "./helpers/nav";

const getFilterParam = (url: string) => new URL(url).searchParams.get("f");

const waitForFilterParam = async (page: Page) => {
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("f"), {
        timeout: 10000,
    });
    const value = getFilterParam(page.url());
    expect(value).toBeTruthy();
    return value as string;
};

// The drawer filter these specs set is the Work category (Why section). The developer control is not in any
// drawer any more: no query reads developers where it was offered (CHAOS-7796).
const updateWorkCategoryFilter = async (page: Page, value: string, previous: string) => {
    // Click "Filters" button to expand the advanced filters panel. Anchor the
    // name so it targets only the advanced toggle, not the adjacent "Reset
    // filters" CTA (CHAOS-2058 registry label) under substring matching.
    await expect(page.getByRole("button", { name: /^Filters$/ })).toBeVisible({
        timeout: 15000,
    });
    await page.getByRole("button", { name: /^Filters$/ }).click();
    await page.locator("summary", { hasText: "Why" }).click();
    await page.getByPlaceholder("feature, maintenance").fill(value);
    await page.waitForFunction(
        (prev) => {
            const current = new URL(window.location.href).searchParams.get("f");
            return Boolean(current && current !== prev);
        },
        previous,
        { timeout: 10000 },
    );
    const nextValue = getFilterParam(page.url());
    expect(nextValue).toBeTruthy();

    // Close the filters again. On a page with the scope bar they are in a modal
    // drawer (Escape closes it, and the button's name then carries the active
    // count); on the other pages the "Filters" button toggles the inline panel.
    if (await page.getByRole("dialog", { name: "Filters" }).isVisible()) {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Filters" })).toBeHidden();
    } else {
        await page.getByRole("button", { name: /^Filters$/ }).click();
    }

    return nextValue as string;
};

const expectFilterParam = async (page: Page, expected: string) => {
    await page.waitForFunction(
        (value) => new URL(window.location.href).searchParams.get("f") === value,
        expected,
    );
};

const expectWorkCategoryFilter = async (page: Page, expected: string) => {
    await expect
        .poll(() => {
            const encoded = getFilterParam(page.url());
            const filters = decodeFilter(encoded);
            return filters.why.work_category?.join(",") ?? "";
        })
        .toBe(expected);
};

test.describe("filter propagation", () => {
    test("primary area routes retain filter param", async ({ page }) => {
        await page.goto("/dashboard");
        const initialFilter = await waitForFilterParam(page);
        const updatedFilter = await updateWorkCategoryFilter(page, "feature", initialFilter);

        const nav = page.locator("aside nav");
        const areas = [
            { label: /^Diagnose$/, path: "/diagnose" },
            { label: /^Plan$/, path: "/plan" },
            { label: /^Improve$/, path: "/improve" },
            { label: /^Govern$/, path: "/govern" },
            { label: /^AI$/, path: "/ai" },
            { label: /^Home$/, path: "/dashboard" },
        ];

        for (const area of areas) {
            await clickUntilUrl(
                page,
                nav.getByRole("link", { name: area.label }),
                new RegExp(`${area.path}(?:[?#].*)?$`),
            );
            await expectFilterParam(page, updatedFilter);
            await expectWorkCategoryFilter(page, "feature");
        }
    });

    test("diagnose child routes retain filter param", async ({ page }) => {
        await page.goto("/dashboard");
        const initialFilter = await waitForFilterParam(page);
        const updatedFilter = await updateWorkCategoryFilter(page, "maintenance", initialFilter);

        const nav = page.locator("aside nav");
        await clickUntilUrl(
            page,
            nav.getByRole("link", { name: /^Diagnose$/ }),
            /\/diagnose(?:[?#].*)?$/,
        );

        for (const child of [
            { label: /^Flow$/, path: "/metrics" },
            { label: /^Investment$/, path: "/investment" },
            { label: /^Landscape$/, path: "/landscape" },
        ]) {
            const children = page.getByTestId("nav-children-diagnose");
            await clickUntilUrl(
                page,
                children.getByRole("link", { name: child.label }),
                new RegExp(`${child.path}(?:[?#].*)?$`),
            );
            await expectFilterParam(page, updatedFilter);
            await expectWorkCategoryFilter(page, "maintenance");
            await page.goto(`/diagnose?f=${updatedFilter}`);
        }
    });

    test("filter change updates URL and persists across nav", async ({ page }) => {
        // Not /investment: its page, scope bar included, sits behind the `investment_view` entitlement
        // (UpgradeGate), so an org without it has no Filters button there.
        await page.goto("/bottleneck");
        const initialFilter = await waitForFilterParam(page);
        const updatedFilter = await updateWorkCategoryFilter(page, "feature", initialFilter);
        expect(updatedFilter).not.toBe(initialFilter);

        const nav = page.locator("aside nav");
        await clickUntilUrl(
            page,
            nav.getByRole("link", { name: /^Govern$/ }),
            /\/govern(?:[?#].*)?$/,
        );
        await expectFilterParam(page, updatedFilter);
        await expectWorkCategoryFilter(page, "feature");
    });
});
