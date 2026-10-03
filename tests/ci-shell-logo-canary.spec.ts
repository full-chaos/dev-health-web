import { expect, test, type Page, type Route } from "@playwright/test";
import { watchShellLogo } from "./helpers/shell-logo";

// CHAOS-8538: the logo canary (tests/shell-logo-canary.setup.ts) is only worth
// its place if it fails on the state it exists to catch. Each test here plants
// that state on the logo request and observes the failure and its message.
// The pass state is the canary itself: it runs before this project in each
// shard.
//
// The plant is on the URL that the page really requests for the logo. Each
// test reads it from the page first (no file name and no hash in this file),
// so the plant follows the logo when its file or its loader changes. When the
// logo was an optimized PNG the URL was `/_next/image?…`; a plant on that path
// reached nothing after the logo became a static SVG (CHAOS-8545), and these
// tests failed: the canary did not report.

/**
 * Loads the shell one time with no plant, reads the URL the browser used for
 * the logo, and plants `handler` on that URL for the loads that follow.
 *
 * The route is registered before the first load: a page with a route does not
 * answer a later load from the browser cache, so the planted load asks the
 * server again.
 */
async function plantOnShellLogo(page: Page, handler: (route: Route) => unknown): Promise<string> {
    let logoUrl = "";
    await page.route((url) => logoUrl !== "" && url.href === logoUrl, handler);
    const logo = watchShellLogo(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    logoUrl = await logo.expectAnswered();
    return logoUrl;
}

test.describe("app-shell logo canary", () => {
    test("fails with the URL when the logo request gets no response", async ({ page }) => {
        const stuck: string[] = [];
        // The planted defect: the request is never continued and never fulfilled.
        const logoUrl = await plantOnShellLogo(page, (route) => {
            stuck.push(route.request().url());
        });
        const logo = watchShellLogo(page);
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

        const failure = await logo.expectAnswered(1_500).then(
            () => null,
            (error: Error) => error,
        );

        expect(stuck, "the plant did not reach the logo request").toContain(logoUrl);
        expect(failure, "the canary passed while the logo request had no response").not.toBeNull();
        const message = failure?.message ?? "";
        // The message must name the request that is open.
        expect(message).toContain(`had no response after 1.5 s: GET ${logoUrl}\n`);
        expect(message).toContain("CHAOS-8538");

        await page.unrouteAll({ behavior: "ignoreErrors" });
    });

    test("fails when the logo request is answered with an error", async ({ page }) => {
        let planted = 0;
        const logoUrl = await plantOnShellLogo(page, (route) => {
            planted += 1;
            return route.fulfill({
                status: 500,
                contentType: "text/plain",
                body: "planted failure",
            });
        });
        const logo = watchShellLogo(page);
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

        const failure = await logo.expectAnswered(5_000).then(
            () => null,
            (error: Error) => error,
        );

        expect(planted, "the plant did not reach the logo request").toBeGreaterThan(0);
        expect(failure, "the canary passed while the logo response was an error").not.toBeNull();
        expect(failure?.message ?? "").toContain(
            `was answered, but the response is not an image the browser can show: GET ${logoUrl}`,
        );
    });
});
