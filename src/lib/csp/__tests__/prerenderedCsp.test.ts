import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
    executableInlineScripts,
    inlineHandlers,
    readPrerenderedHashes,
    scriptHash,
    scriptHashSources,
} from "../prerenderedCsp.mjs";

/**
 * CHAOS-12365: a page `next build` prerenders is fixed HTML, so its inline scripts cannot carry the
 * per-request nonce. The proxy allows them by their sha256, read from the build output it serves.
 * This module is the one parser shared by the proxy and the build check.
 */

const DIRS: string[] = [];

function dist(routes: Record<string, string | null>, manifest?: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prerendered-csp-"));
    DIRS.push(dir);
    const entries: Record<string, object> = {};
    for (const [route, html] of Object.entries(routes)) {
        entries[route] = { initialRevalidateSeconds: false, srcRoute: route, dataRoute: null };
        if (html === null) continue;
        const file = path.join(dir, "server/app", route === "/" ? "index.html" : `${route}.html`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
    }
    fs.writeFileSync(
        path.join(dir, "prerender-manifest.json"),
        manifest ?? JSON.stringify({ version: 4, routes: entries, dynamicRoutes: {} }),
    );
    return dir;
}

afterEach(() => {
    for (const dir of DIRS.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const page = (body: string) => `<html><head></head><body>${body}</body></html>`;

describe("executableInlineScripts", () => {
    it("returns the text of each inline script, and skips src and JSON data scripts", () => {
        expect(
            executableInlineScripts(
                page(
                    '<script src="/a.js"></script><script>one()</script><script type="application/json">{}</script>' +
                        '<script type="application/ld+json">{}</script><SCRIPT type="module">two()</SCRIPT>',
                ),
            ),
        ).toEqual(["one()", "two()"]);
    });

    it("keeps a nonced inline script: build-time HTML cannot carry the request nonce", () => {
        expect(executableInlineScripts('<script nonce="x">run()</script>')).toEqual(["run()"]);
    });

    it("ends the script where the browser does: at </script followed by space, / or >", () => {
        expect(
            executableInlineScripts("<script>a('</scriptx>')</script >b<script>c()</script/>"),
        ).toEqual(["a('</scriptx>')", "c()"]);
    });

    it("normalizes CR LF and CR to LF, as the HTML parser does before it hashes", () => {
        expect(executableInlineScripts("<script>a()\r\nb()\rc()</script>")).toEqual([
            "a()\nb()\nc()",
        ]);
    });

    it("reads attributes, not their text: src= inside another value is still inline", () => {
        expect(executableInlineScripts('<script data-note="src=/x.js">run()</script>')).toEqual([
            "run()",
        ]);
    });
});

describe("executableInlineScripts follows the HTML parsing states (CHAOS-13396)", () => {
    it.each([
        ["a comment", page("<!-- <script>c()</script> -->")],
        ["a quoted attribute", page('<div title="<script>a()</script>"></div>')],
        ["<title>", "<html><head><title><script>t()</script></title></head><body></body></html>"],
        ["<textarea>", page("<textarea><script>x()</script></textarea>")],
    ])("gives no script for script-like text inside %s", (_where, html) => {
        expect(executableInlineScripts(html)).toEqual([]);
    });

    it("reads a double-escaped script body whole, to the </script> that ends it", () => {
        expect(
            executableInlineScripts(page("<script><!--<script></script>still()</script>")),
        ).toEqual(["<!--<script></script>still()"]);
    });

    it("hashes an SVG script's text as the parser decodes it", () => {
        expect(executableInlineScripts(page("<svg><script>a&lt;b()</script></svg>"))).toEqual([
            "a<b()",
        ]);
    });
});

describe("scriptHash", () => {
    it("is the CSP source of the script text's sha256, base64", () => {
        expect(scriptHash("alert(1)")).toBe(
            "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='",
        );
        // Next 16.4.2's flight bootstrap, as hashed from a production build (a3219d61).
        expect(scriptHash("(self.__next_f=self.__next_f||[]).push([0])")).toBe(
            "'sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo='",
        );
    });
});

describe("inlineHandlers", () => {
    it("counts event handler attributes and javascript: URLs, which no hash can allow", () => {
        expect(inlineHandlers(page('<button onclick="go()">x</button>'))).toBe(1);
        expect(
            inlineHandlers(page('<a href="javascript:go()">x</a><img src=x ONERROR=go()>')),
        ).toBe(2);
        expect(inlineHandlers(page('<form action=" JavaScript:go()"></form>'))).toBe(1);
    });

    it("does not read text inside a script or style element, or an ordinary attribute", () => {
        expect(
            inlineHandlers(
                page(
                    '<script>self.__next_f.push([1,"<a onclick=\\"x\\" href=\\"javascript:y\\">"])</script>' +
                        '<style>a[onclick]{color:red}</style><a href="/marketing" data-x="onclick">x</a>',
                ),
            ),
        ).toBe(0);
    });
});

describe("inlineHandlers follows the HTML parsing states (CHAOS-13396)", () => {
    it("does not count a handler inside a comment or <textarea>", () => {
        expect(
            inlineHandlers(
                page('<!-- <a onclick="x()">x</a> --><textarea><img src=x onerror=y()></textarea>'),
            ),
        ).toBe(0);
    });
});

describe("readPrerenderedHashes", () => {
    it("hashes each prerendered page's inline scripts by route, and skips non-HTML routes", () => {
        const dir = dist({
            "/": page("<script>root()</script>"),
            "/marketing/about": page('<script src="/a.js"></script><script>about()</script>'),
            "/robots.txt": null,
        });
        const hashes = readPrerenderedHashes(dir);
        expect(hashes.unreadable).toEqual([]);
        expect([...hashes.routes.entries()]).toEqual([
            ["/", [scriptHash("root()")]],
            ["/marketing/about", [scriptHash("about()")]],
        ]);
    });

    it("names an unreadable manifest and returns no hashes, without throwing", () => {
        const missing = path.join(os.tmpdir(), "prerendered-csp-no-such-dist");
        expect(readPrerenderedHashes(missing)).toEqual({
            routes: new Map(),
            unreadable: [path.join(missing, "prerender-manifest.json")],
        });
        const garbled = dist({}, "{not json");
        expect(readPrerenderedHashes(garbled)).toEqual({
            routes: new Map(),
            unreadable: [path.join(garbled, "prerender-manifest.json")],
        });
    });

    it("names an HTML file it cannot read, and still hashes the other pages", () => {
        const dir = dist({ "/marketing": page("<script>m()</script>") });
        const manifest = JSON.parse(
            fs.readFileSync(path.join(dir, "prerender-manifest.json"), "utf8"),
        );
        manifest.routes["/marketing/terms"] = { initialRevalidateSeconds: false };
        fs.writeFileSync(path.join(dir, "prerender-manifest.json"), JSON.stringify(manifest));
        // A directory where the HTML file should be: it exists, and reading it fails.
        fs.mkdirSync(path.join(dir, "server/app/marketing/terms.html"), { recursive: true });
        const hashes = readPrerenderedHashes(dir);
        expect(hashes.unreadable).toEqual([path.join(dir, "server/app/marketing/terms.html")]);
        expect([...hashes.routes.keys()]).toEqual(["/marketing"]);
    });
});

describe("scriptHashSources", () => {
    const hashes = {
        routes: new Map([
            ["/marketing/about", ["'sha256-A'", "'sha256-G1'"]],
            ["/_not-found", ["'sha256-G1'", "'sha256-N'"]],
            ["/_global-error", ["'sha256-E'"]],
        ]),
        unreadable: [],
    };

    it("gives a prerendered route its own hashes plus the not-found and global-error ones, once each", () => {
        expect(scriptHashSources(hashes, "/marketing/about")).toEqual([
            "'sha256-A'",
            "'sha256-G1'",
            "'sha256-N'",
            "'sha256-E'",
        ]);
        expect(scriptHashSources(hashes, "/marketing/about/")).toEqual(
            scriptHashSources(hashes, "/marketing/about"),
        );
    });

    it("gives any other path only the not-found and global-error hashes: any path can 404", () => {
        expect(scriptHashSources(hashes, "/dashboard")).toEqual([
            "'sha256-G1'",
            "'sha256-N'",
            "'sha256-E'",
        ]);
    });

    it("gives nothing when the build output gave nothing", () => {
        expect(
            scriptHashSources({ routes: new Map(), unreadable: ["x"] }, "/marketing/about"),
        ).toEqual([]);
    });
});
