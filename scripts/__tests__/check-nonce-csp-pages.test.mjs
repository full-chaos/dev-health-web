import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { checkNonceCspPages, inlineScriptsWithoutNonce } from "../check-nonce-csp-pages.mjs";

/**
 * CHAOS-12337: every page is served under the per-request nonce CSP (`src/proxy.ts`
 * `buildCspHeader`: `script-src 'self' 'nonce-…'`). A page `next build` prerenders as static HTML
 * has inline scripts without that nonce, so the browser blocks them and the page never hydrates.
 * `next dev` renders every request, so the dev-server e2e cannot see this; the build output can.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/check-nonce-csp-pages.mjs");
const DIRS = [];

const STATIC_HTML =
    '<html><head><script src="/_next/static/chunks/main.js" async=""></script></head><body><script>(self.__next_f=self.__next_f||[]).push([0])</script><script>self.__next_f.push([1,"x"])</script></body></html>';
const DYNAMIC_HTML =
    '<html><head><script src="/_next/static/chunks/main.js" nonce="abc"></script></head><body><script nonce="abc">self.__next_f.push([0])</script></body></html>';

function build(routes) {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), "nonce-csp-"));
    DIRS.push(dist);
    const manifest = { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [] };
    for (const [route, html] of Object.entries(routes)) {
        manifest.routes[route] = {
            initialRevalidateSeconds: false,
            srcRoute: route,
            dataRoute: null,
        };
        if (html === null) continue;
        const file = route === "/" ? "index.html" : `${route.slice(1)}.html`;
        fs.mkdirSync(path.dirname(path.join(dist, "server/app", file)), { recursive: true });
        fs.writeFileSync(path.join(dist, "server/app", file), html);
    }
    fs.writeFileSync(path.join(dist, "prerender-manifest.json"), JSON.stringify(manifest));
    return dist;
}

afterEach(() => {
    for (const dir of DIRS.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("inlineScriptsWithoutNonce", () => {
    it("counts inline scripts with no nonce, and never a script with src", () => {
        expect(inlineScriptsWithoutNonce(STATIC_HTML)).toBe(2);
        expect(inlineScriptsWithoutNonce(DYNAMIC_HTML)).toBe(0);
        expect(inlineScriptsWithoutNonce('<script type="application/ld+json">{}</script>')).toBe(0);
        expect(inlineScriptsWithoutNonce("<SCRIPT>x</SCRIPT>")).toBe(1);
    });
});

describe("checkNonceCspPages with the known list (CHAOS-12344)", () => {
    it("passes a listed page, and still fails an unlisted one", () => {
        const result = checkNonceCspPages({
            dist: build({ "/marketing/about": STATIC_HTML, "/ask-dev/oauth/start": STATIC_HTML }),
            known: new Map([["/marketing/about", "CHAOS-12344"]]),
        });
        expect(result.failures).toEqual([
            "/ask-dev/oauth/start: prerendered with 2 inline scripts and no nonce",
        ]);
    });

    it("fails a listed page that is fixed, so the list cannot go stale", () => {
        const result = checkNonceCspPages({
            dist: build({ "/marketing/about": DYNAMIC_HTML, "/robots.txt": null }),
            known: new Map([
                ["/marketing/about", "CHAOS-12344"],
                ["/auth/forgot-password", "CHAOS-12344"],
            ]),
        });
        expect(result.failures).toEqual([
            "/auth/forgot-password: on the known list (CHAOS-12344) but not prerendered with blocked scripts: remove it from the list",
            "/marketing/about: on the known list (CHAOS-12344) but not prerendered with blocked scripts: remove it from the list",
        ]);
    });

    it("the CLI uses the checked-in list: exactly CHAOS-12344's 15 static pages (forgot-password is fixed)", async () => {
        const { KNOWN_PRERENDERED } = await import("../check-nonce-csp-pages.mjs");
        expect([...KNOWN_PRERENDERED.keys()].sort()).toEqual([
            "/",
            "/_global-error",
            "/_not-found",
            "/marketing",
            "/marketing/about",
            "/marketing/billing-refunds-test",
            "/marketing/context-fabric",
            "/marketing/context-fabric/use-cases",
            "/marketing/cto-architecture",
            "/marketing/engineering-manager",
            "/marketing/platform-devex",
            "/marketing/privacy",
            "/marketing/security",
            "/marketing/terms",
            "/marketing/vp-engineering",
        ]);
        expect(new Set(KNOWN_PRERENDERED.values())).toEqual(new Set(["CHAOS-12344"]));
    });
});

describe("checkNonceCspPages", () => {
    it("fails a prerendered page whose inline scripts carry no nonce, by route", () => {
        const result = checkNonceCspPages({
            dist: build({ "/ask-dev/oauth/start": STATIC_HTML }),
            known: new Map(),
        });
        expect(result.failures).toEqual([
            "/ask-dev/oauth/start: prerendered with 2 inline scripts and no nonce",
        ]);
    });

    it("passes when no page is prerendered as HTML (non-HTML routes are not pages)", () => {
        const result = checkNonceCspPages({
            dist: build({ "/robots.txt": null }),
            known: new Map(),
        });
        expect(result.failures).toEqual([]);
    });

    it("fails closed when the build output has no prerender manifest", () => {
        const dist = fs.mkdtempSync(path.join(os.tmpdir(), "nonce-csp-"));
        DIRS.push(dist);
        expect(checkNonceCspPages({ dist, known: new Map() }).failures).toEqual([
            `no prerender manifest at ${path.join(dist, "prerender-manifest.json")}: run next build first`,
        ]);
    });

    it("exits 1 with the route named, and 0 when only listed pages are prerendered (the CLI)", async () => {
        const red = spawnSync(
            process.execPath,
            [SCRIPT, "--dist", build({ "/x": STATIC_HTML, "/": STATIC_HTML })],
            {
                encoding: "utf8",
            },
        );
        expect(red.status).toBe(1);
        expect(red.stderr).toContain("/x: prerendered with 2 inline scripts and no nonce");
        // The checked-in list: every listed page still prerendered (CHAOS-12344), nothing else.
        const { KNOWN_PRERENDERED } = await import("../check-nonce-csp-pages.mjs");
        const listed = Object.fromEntries(
            [...KNOWN_PRERENDERED.keys()].map((route) => [route, STATIC_HTML]),
        );
        const green = spawnSync(
            process.execPath,
            [SCRIPT, "--dist", build({ ...listed, "/robots.txt": null })],
            {
                encoding: "utf8",
            },
        );
        expect(green.status, green.stderr).toBe(0);
    });
});
