import { test, expect, type Page, type Locator } from "@playwright/test";

const gotoLinkHref = async (page: Page, link: Locator) => {
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
    if (!href) {
        throw new Error("Expected link to include an href");
    }
    await page.goto(href);
};

test("people search opens individual and metric evidence", async ({ page }) => {
    await page.goto("/people?q=alex");

    const personLink = page
        .locator('a[href*="/people/person-123"]')
        .filter({ hasText: "Alex Harper" });
    await expect(personLink).toBeVisible({ timeout: 15000 });
    await expect(personLink).toHaveAttribute("href", /\/people\/person-123\?f=/);
    await gotoLinkHref(page, personLink);
    await expect(page).toHaveURL(/\/people\/person-123(?:\?|$)/);

    const main = page.getByRole("main");
    // The person page: the shell trail replaced the "Individual view" eyebrow; the
    // single-person framing text and the return link are the page's markers.
    await expect(main.getByText("This view is scoped to one person.")).toBeVisible({
        timeout: 10000,
    });
    await expect(main.getByRole("link", { name: "Back to People" })).toBeVisible();

    const cycleTimeLink = main.locator('a[href*="/people/person-123/metrics/cycle_time"]');
    await expect(cycleTimeLink.first()).toBeVisible({ timeout: 10000 });
    await gotoLinkHref(page, cycleTimeLink.first());
    await expect(page).toHaveURL(/\/people\/person-123\/metrics\/cycle_time(?:\?|$)/);

    const prsLink = main.getByRole("link", { name: "PRs" });
    await expect(prsLink).toBeVisible({ timeout: 10000 });
    await gotoLinkHref(page, prsLink);
    await expect(main.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await expect(main.getByRole("table")).toBeVisible();
    const table = main.getByTestId("person-evidence-table");
    await expect(table.getByText("dev-health-web")).toBeVisible();
    await expect(table.getByText("Unresolved")).toBeVisible();
    await expect(table).not.toContainText("0b1f6a52-6f0b-4f4e-9d0a-1c2d3e4f5a61");
});

test("individual pages avoid comparative language", async ({ page }) => {
    const forbidden = /rank|percentile|top performer|bottom performer|score/i;

    await page.goto("/people");
    expect(await page.content()).not.toMatch(forbidden);

    await page.goto("/people/person-guardrail");
    expect(await page.content()).not.toMatch(forbidden);

    await page.goto("/people/person-guardrail/metrics/cycle_time");
    expect(await page.content()).not.toMatch(forbidden);
});
