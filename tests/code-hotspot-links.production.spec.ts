import { expect, test, type Request } from "@playwright/test";

/**
 * CHAOS-9209: the "Top hotspot" row links of `/code`, against the PRODUCTION build.
 *
 * This file runs only in the production-build suite (`playwright.context-fabric.config.ts`,
 * `pnpm test:e2e:context-fabric`): a development server does not prefetch links.
 *
 * What happened on 2026-10-10: a load of `/code` did not come to "network idle" in 45 s. The
 * API serves the link of a hotspot file as `/code?file=<path>` with the path raw (`a/b.go`). The
 * Next.js 16.3.8 router prefetched that link, read the search of the response URL in the
 * `URLSearchParams` form (`a%2Fb.go`), found it different from the raw search of the href, and
 * dropped the response with its body not read and not cancelled. That request has no end in the
 * browser. The page itself was drawn in about 0.5 s.
 */

/** The file the mock backend serves as the top hotspot (`tests/mocks/handlers.ts`, Hotspots). */
const SERVED_FILE = "internal/queryapi/server/query_route.go";
const CANONICAL_HREF = `/code?${new URLSearchParams({ file: SERVED_FILE }).toString()}`;

/** A request is "of the hotspot link" when it asks for `/code` with a `file` parameter. */
function isHotspotLinkRequest(request: Request): boolean {
    const url = new URL(request.url());
    return url.pathname === "/code" && url.searchParams.has("file");
}

test.describe("code page hotspot links (production build)", () => {
    test("the page comes to network idle, with no request for a hotspot link", async ({ page }) => {
        const hotspotLinkRequests: string[] = [];
        const withoutEnd = new Set<Request>();
        let otherPrefetch = 0;
        page.on("request", (request) => {
            if (isHotspotLinkRequest(request)) {
                hotspotLinkRequests.push(new URL(request.url()).search);
                withoutEnd.add(request);
            } else if (request.headers()["next-router-prefetch"] === "1") otherPrefetch += 1;
        });
        page.on("requestfinished", (request) => withoutEnd.delete(request));
        page.on("requestfailed", (request) => withoutEnd.delete(request));

        await page.goto("/code", { waitUntil: "load" });
        const link = page.getByTestId("repo-top-hotspot").getByRole("link");
        await expect(link).toHaveText(SERVED_FILE);
        await expect(link).toBeInViewport();
        // Soft: a raw href fails here AND the checks below still run and show their numbers.
        await expect.soft(link).toHaveAttribute("href", CANONICAL_HREF);

        // Time for the router to prefetch the links in view, and for each response to end.
        await page.waitForTimeout(5_000);

        // The measurement must be able to see a prefetch: the shell links are prefetched in a
        // production build. Zero here means the server is not a production build, and then the
        // checks below prove nothing.
        expect(otherPrefetch).toBeGreaterThan(0);
        // One link for each row: no prefetch (`prefetch={false}`).
        expect.soft(hotspotLinkRequests).toEqual([]);
        // The fault itself: a request of the page with no end.
        expect.soft(withoutEnd.size).toBe(0);
        await page.waitForLoadState("networkidle", { timeout: 15_000 });
    });

    test("a click on a hotspot link opens the code page for that file", async ({ page }) => {
        await page.goto("/code", { waitUntil: "load" });
        await page.getByTestId("repo-top-hotspot").getByRole("link").click();

        await expect(page).toHaveURL(
            (url) => url.pathname === "/code" && url.searchParams.get("file") === SERVED_FILE,
        );
        await expect(page.getByTestId("repo-top-hotspot").getByRole("link")).toHaveText(
            SERVED_FILE,
        );
        await page.waitForLoadState("networkidle", { timeout: 15_000 });
    });
});
