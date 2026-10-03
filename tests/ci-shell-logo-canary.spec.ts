import { expect, test } from "@playwright/test";
import { expectShellLogoAnswered } from "./helpers/shell-logo";

// CHAOS-8538: the logo canary (tests/shell-logo-canary.setup.ts) is only worth
// its place if it fails on the state it exists to catch. Each test here plants
// that state on the logo request and observes the failure and its message.
// The pass state is the canary itself: it runs before this project in each
// shard.

function isImageOptimizerRequest(url: URL): boolean {
    return url.pathname === "/_next/image";
}

test.describe("app-shell logo canary", () => {
    test("fails with the URL when the logo request gets no response", async ({ page }) => {
        const stuck: string[] = [];
        // The planted defect: the request is never continued and never fulfilled.
        await page.route(isImageOptimizerRequest, (route) => {
            stuck.push(route.request().url());
        });
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

        const failure = await expectShellLogoAnswered(page, 1_500).then(
            () => null,
            (error: Error) => error,
        );

        expect(failure, "the canary passed while the logo request had no response").not.toBeNull();
        const message = failure?.message ?? "";
        expect(message).toContain("had no response after 1.5 s: GET http");
        expect(message).toContain("/_next/image?");
        expect(message).toContain("CHAOS-8538");
        expect(
            stuck.some((url) => message.includes(url)),
            `the message does not name a planted request. Planted: ${stuck.join(", ")}`,
        ).toBe(true);

        await page.unrouteAll({ behavior: "ignoreErrors" });
    });

    test("fails when the logo request is answered with an error", async ({ page }) => {
        await page.route(isImageOptimizerRequest, (route) =>
            route.fulfill({ status: 500, contentType: "text/plain", body: "planted failure" }),
        );
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

        const failure = await expectShellLogoAnswered(page, 5_000).then(
            () => null,
            (error: Error) => error,
        );

        expect(failure, "the canary passed while the logo response was an error").not.toBeNull();
        expect(failure?.message ?? "").toContain("was answered, but the response is not an image");
        expect(failure?.message ?? "").toContain("/_next/image?");
    });
});
