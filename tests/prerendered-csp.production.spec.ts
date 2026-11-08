import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import {
    executableInlineScripts,
    htmlFileFor,
    prerenderedHtmlRoutes,
    scriptHash,
} from "../src/lib/csp/prerenderedCsp.mjs";

/**
 * CHAOS-12365: every page `next build` prerenders, served by the production build under the
 * per-request CSP, in a real browser: no CSP violation, React hydrates, and an in-app link
 * navigates on the client. The pages come from the build's own prerender manifest, so a new
 * prerendered page is surveyed without an edit here, and a build with no page to survey fails.
 *
 * `/_global-error` has no URL (it shows only when the root layout fails), so its scripts are
 * checked in the served policy instead. `/_not-found` is reached through an unknown path.
 */
const DIST = join(process.cwd(), ".next");
const NOT_FOUND_PATH = "/marketing/prerendered-csp-no-such-page";
const ROUTES = prerenderedHtmlRoutes(DIST).routes;
const SURVEYED = ROUTES.filter((route) => route !== "/_global-error");

declare global {
    interface Window {
        __cspViolations?: string[];
        __navMarker?: string;
    }
}

function buildScripts(route: string): string[] {
    return executableInlineScripts(readFileSync(htmlFileFor(DIST, route), "utf8"));
}

function scriptSrc(policy: string | undefined): string {
    return (policy ?? "").split("; ").find((part) => part.startsWith("script-src ")) ?? "";
}

test.use({ storageState: { cookies: [], origins: [] } });

test("the production build has prerendered pages to survey, /_global-error among them", () => {
    expect(SURVEYED.length).toBeGreaterThan(0);
    expect(ROUTES).toContain("/_global-error");
});

for (const route of SURVEYED) {
    test(`${route}: no CSP violation, hydrated, client navigation`, async ({ page }) => {
        await page.addInitScript(() => {
            window.__cspViolations = [];
            document.addEventListener("securitypolicyviolation", (event) => {
                window.__cspViolations?.push(
                    `${event.effectiveDirective} ${event.blockedURI} ${event.sample}`,
                );
            });
        });
        const consoleCsp: string[] = [];
        page.on("console", (message) => {
            if (/Content Security Policy/iu.test(message.text())) consoleCsp.push(message.text());
        });

        const response = await page.goto(route === "/_not-found" ? NOT_FOUND_PATH : route);
        expect(response).not.toBeNull();
        if (route === "/_not-found") expect(response?.status()).toBe(404);

        const script = scriptSrc(response?.headers()["content-security-policy"]);
        expect(script).not.toContain("'unsafe-inline'");
        for (const text of buildScripts(route)) expect(script).toContain(scriptHash(text));

        await page.waitForLoadState("networkidle");
        expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
        expect(consoleCsp).toEqual([]);
        await expect
            .poll(() =>
                page.evaluate(() =>
                    [...document.querySelectorAll("body *")].some((element) =>
                        Object.keys(element).some((key) => key.startsWith("__reactFiber$")),
                    ),
                ),
            )
            .toBe(true);

        const here = new URL(page.url()).pathname;
        const href = await page.evaluate((current) => {
            const link = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')].find(
                (anchor) =>
                    new URL(anchor.href).pathname !== current &&
                    !anchor.target &&
                    anchor.offsetParent !== null,
            );
            link?.setAttribute("data-csp-nav", "1");
            return link?.getAttribute("href") ?? null;
        }, here);
        if (href === null) return;
        await page.evaluate(() => (window.__navMarker = "kept"));
        await page.click('a[data-csp-nav="1"]');
        await page.waitForURL((url) => url.pathname !== here);
        expect(await page.evaluate(() => window.__navMarker), `client navigation to ${href}`).toBe(
            "kept",
        );
    });
}

test("/_global-error: its inline scripts are allowed on every document response", async ({
    request,
}) => {
    const response = await request.get("/auth/signin");
    const script = scriptSrc(response.headers()["content-security-policy"]);
    const scripts = buildScripts("/_global-error");
    expect(scripts.length).toBeGreaterThan(0);
    for (const text of scripts) expect(script).toContain(scriptHash(text));
});
