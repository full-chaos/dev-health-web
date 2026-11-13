import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import * as check from "../check-nonce-csp-pages.mjs";
import { scriptHash } from "../../src/lib/csp/prerenderedCsp.mjs";

const { checkNonceCspPages, inlineScripts } = check;

/**
 * CHAOS-12337 / CHAOS-12365: every page is served under the per-request nonce CSP (`src/proxy.ts`
 * `buildCspHeader`). A page `next build` prerenders is fixed HTML, so its inline scripts cannot
 * carry that nonce: the proxy allows them by the sha256 it reads from the build output it serves.
 * The check fails a prerendered page whose inline script the served CSP does not allow, and a page
 * with an inline event handler or a javascript: URL, which no hash can allow.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/check-nonce-csp-pages.mjs");
const DIRS = [];

const STATIC_HTML =
    '<html><head><script src="/_next/static/chunks/main.js" async=""></script></head><body><script>(self.__next_f=self.__next_f||[]).push([0])</script><script>self.__next_f.push([1,"x"])</script></body></html>';
const OTHER_BUILD_HTML = STATIC_HTML.replace('[1,"x"]', '[1,"y"]');
const DYNAMIC_HTML =
    '<html><head><script src="/_next/static/chunks/main.js" nonce="abc"></script></head><body><script nonce="abc">self.__next_f.push([0])</script></body></html>';
const HANDLER_HTML =
    '<html><body><script>(self.__next_f=self.__next_f||[]).push([0])</script><button onclick="go()">Go</button></body></html>';
const JS_URL_HTML = '<html><body><a href="javascript:go()">Go</a></body></html>';

function build(routes, dir = fs.mkdtempSync(path.join(os.tmpdir(), "nonce-csp-"))) {
    DIRS.push(dir);
    const manifest = { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [] };
    for (const [route, html] of Object.entries(routes)) {
        manifest.routes[route] = {
            initialRevalidateSeconds: false,
            srcRoute: route,
            dataRoute: null,
        };
        if (html === null) continue;
        const file = route === "/" ? "index.html" : `${route.slice(1)}.html`;
        fs.mkdirSync(path.dirname(path.join(dir, "server/app", file)), { recursive: true });
        fs.writeFileSync(path.join(dir, "server/app", file), html);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "prerender-manifest.json"), JSON.stringify(manifest));
    return dir;
}

afterEach(() => {
    for (const dir of DIRS.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("inlineScripts", () => {
    it("counts every executable inline script, and never a script with a src attribute", () => {
        expect(inlineScripts(STATIC_HTML)).toBe(2);
        expect(inlineScripts('<script type="application/ld+json">{}</script>')).toBe(0);
        expect(inlineScripts("<SCRIPT>x</SCRIPT>")).toBe(1);
        expect(inlineScripts('<script src="/a.js"></script><script\nsrc="/b.js"></script>')).toBe(
            0,
        );
    });

    it("counts a script whose only src-like attribute is data-src (r1 on #1670)", () => {
        expect(inlineScripts('<script data-src="/chunk.js">window.run()</script>')).toBe(1);
    });

    it("reads attributes, not their text: src= or type= inside another value does not count (r2)", () => {
        expect(
            inlineScripts(
                '<script data-note="metadata contains src=/chunk.js">window.run()</script>',
            ),
        ).toBe(1);
        expect(inlineScripts("<script data-x='type=application/json'>window.run()</script>")).toBe(
            1,
        );
        expect(inlineScripts('<script data-a="x" src="/a.js"></script>')).toBe(0);
        expect(inlineScripts("<script type=application/json>{}</script>")).toBe(0);
        expect(inlineScripts('<script SRC="/a.js" async></script>')).toBe(0);
    });

    it("reads a repeated attribute as HTML does: the first one wins (r3)", () => {
        expect(
            inlineScripts(
                '<script type="text/javascript" type="application/json">window.run()</script>',
            ),
        ).toBe(1);
        expect(
            inlineScripts('<script type="application/json" type="text/javascript">{}</script>'),
        ).toBe(0);
        expect(inlineScripts('<script src="/a.js" src="">x</script>')).toBe(0);
    });

    it("counts a nonced inline script too: a prerendered page cannot carry the per-request nonce (r1)", () => {
        expect(inlineScripts('<script nonce="build-time-value">window.run()</script>')).toBe(1);
        expect(inlineScripts(DYNAMIC_HTML)).toBe(1);
    });
});

describe("checkNonceCspPages (CHAOS-12365: served by build hash)", () => {
    it("has no known-defect list any more", () => {
        expect(check.KNOWN_PRERENDERED).toBeUndefined();
    });

    it("passes prerendered pages whose inline scripts the served CSP allows by hash", () => {
        const result = checkNonceCspPages({
            dist: build({
                "/": STATIC_HTML,
                "/marketing/about": STATIC_HTML,
                "/_not-found": STATIC_HTML,
                "/_global-error": STATIC_HTML,
                "/robots.txt": null,
            }),
        });
        expect(result.failures).toEqual([]);
        expect(result.checked).toEqual(["/", "/_global-error", "/_not-found", "/marketing/about"]);
    });

    it("fails a planted prerendered page with an inline event handler, by route", () => {
        const result = checkNonceCspPages({
            dist: build({ "/marketing/about": STATIC_HTML, "/marketing/planted": HANDLER_HTML }),
        });
        expect(result.failures).toEqual([
            "/marketing/planted: 1 inline event handler or javascript: URL, which no hash in the served CSP can allow",
        ]);
    });

    it("fails a planted prerendered page with a javascript: URL", () => {
        const result = checkNonceCspPages({ dist: build({ "/marketing/planted": JS_URL_HTML }) });
        expect(result.failures).toEqual([
            "/marketing/planted: 1 inline event handler or javascript: URL, which no hash in the served CSP can allow",
        ]);
    });

    it("fails a page whose inline script the served build does not hash (a different build)", () => {
        const served = build({ "/marketing/about": STATIC_HTML });
        const result = checkNonceCspPages({
            dist: build({ "/marketing/about": OTHER_BUILD_HTML }),
            served,
        });
        expect(result.failures).toEqual([
            `/marketing/about: inline script ${scriptHash('self.__next_f.push([1,"y"])')} is not allowed by the served CSP`,
        ]);
    });

    it("fails a page the served build does not have, and names a served copy it cannot read", () => {
        const dist = build({ "/marketing/about": STATIC_HTML });
        const served = path.join(os.tmpdir(), "nonce-csp-no-such-served-copy");
        const result = checkNonceCspPages({ dist, served });
        expect(result.failures).toEqual([
            `${path.join(served, "prerender-manifest.json")}: unreadable, so the proxy serves no hashes`,
            `/marketing/about: inline script ${scriptHash("(self.__next_f=self.__next_f||[]).push([0])")} is not allowed by the served CSP`,
            `/marketing/about: inline script ${scriptHash('self.__next_f.push([1,"x"])')} is not allowed by the served CSP`,
        ]);
    });

    it("passes when no page is prerendered as HTML (non-HTML routes are not pages)", () => {
        const result = checkNonceCspPages({ dist: build({ "/robots.txt": null }) });
        expect(result.failures).toEqual([]);
    });

    it("fails closed when the build output has no prerender manifest", () => {
        const dist = fs.mkdtempSync(path.join(os.tmpdir(), "nonce-csp-"));
        DIRS.push(dist);
        expect(checkNonceCspPages({ dist }).failures).toEqual([
            `no prerender manifest at ${path.join(dist, "prerender-manifest.json")}: run next build first`,
        ]);
    });

    it("the CLI exits 1 with the route named, and 0 on a build the served copy allows", () => {
        const red = spawnSync(
            process.execPath,
            [SCRIPT, "--dist", build({ "/x": HANDLER_HTML, "/": STATIC_HTML })],
            { encoding: "utf8" },
        );
        expect(red.status).toBe(1);
        expect(red.stderr).toContain(
            "/x: 1 inline event handler or javascript: URL, which no hash in the served CSP can allow",
        );
        const green = spawnSync(
            process.execPath,
            [SCRIPT, "--dist", build({ "/": STATIC_HTML, "/robots.txt": null })],
            { encoding: "utf8" },
        );
        expect(green.status, green.stderr).toBe(0);
    });

    it("the CLI checks the standalone copy the image ships when there is one", () => {
        const dist = build({ "/marketing/about": STATIC_HTML });
        build({ "/marketing/about": OTHER_BUILD_HTML }, path.join(dist, "standalone", ".next"));
        const stale = spawnSync(process.execPath, [SCRIPT, "--dist", dist], { encoding: "utf8" });
        expect(stale.status).toBe(1);
        expect(stale.stderr).toContain("is not allowed by the served CSP");
        expect(stale.stdout).toContain(`served from ${path.join(dist, "standalone", ".next")}`);
    });
});
