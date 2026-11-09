// CHAOS-12365: the inline scripts of the pages `next build` prerenders, and the CSP hash sources
// that allow them. One parser for the proxy (the served script-src) and the build check
// (scripts/check-nonce-csp-pages.mjs), so the two cannot disagree about a page.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parse } from "parse5";

/** Served on any path: an unknown path gets the prerendered not-found page, a failed render the global error. */
export const GLOBAL_ROUTES = ["/_not-found", "/_global-error"];

/**
 * Each element of the page as the browser's HTML parser builds it (parse5, scripting on), template
 * contents included. Text inside a comment, an attribute, <title>, <textarea> or <noscript> is not an
 * element, so it is never read as markup.
 */
function* elementsOf(html) {
    const pending = [parse(html, { scriptingEnabled: true })];
    while (pending.length > 0) {
        const node = pending.pop();
        if (node.tagName !== undefined) yield node;
        if (node.content !== undefined) pending.push(node.content);
        if (node.childNodes !== undefined) pending.push(...[...node.childNodes].reverse());
    }
}

/** The element's attributes by lower-case name; the parser keeps the first of a repeated one. */
function attributesOf(element) {
    return new Map(
        element.attrs.map((attribute) => [attribute.name.toLowerCase(), attribute.value]),
    );
}

/**
 * The text of every executable inline script, HTML or SVG: no `src` attribute, not a JSON data type.
 * A nonce attribute does not count: HTML fixed at build time cannot carry the nonce drawn per
 * request. The text is the script's child text as the parser produced it (CR LF and CR already LF),
 * which is what the browser hashes.
 */
export function executableInlineScripts(html) {
    const scripts = [];
    for (const element of elementsOf(html)) {
        if (element.tagName !== "script") continue;
        const attributes = attributesOf(element);
        if (attributes.has("src")) continue;
        if (/^application\/(?:ld\+)?json$/iu.test((attributes.get("type") ?? "").trim())) continue;
        scripts.push(
            element.childNodes
                .filter((child) => child.nodeName === "#text")
                .map((child) => child.value)
                .join(""),
        );
    }
    return scripts;
}

/** Inline event handler attributes and javascript: URLs: no hash source can allow them. */
export function inlineHandlers(html) {
    let count = 0;
    for (const element of elementsOf(html)) {
        for (const [name, value] of attributesOf(element)) {
            if (/^on[a-z]+$/u.test(name)) count += 1;
            else if (
                ["href", "src", "action", "formaction"].includes(name) &&
                /^javascript:/iu.test(value.trim())
            )
                count += 1;
        }
    }
    return count;
}

/** The CSP source that allows a script with this text. */
export function scriptHash(text) {
    return `'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

export function htmlFileFor(dist, route) {
    const relative = route === "/" ? "index.html" : `${route.replace(/^\//u, "")}.html`;
    return path.join(dist, "server", "app", relative);
}

/** The prerendered routes that have an HTML page, or the manifest path that could not be read. */
export function prerenderedHtmlRoutes(dist) {
    const manifestPath = path.join(dist, "prerender-manifest.json");
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
        return { routes: [], unreadable: manifestPath };
    }
    const routes = Object.keys(manifest?.routes ?? {})
        .sort()
        .filter((route) => fs.existsSync(htmlFileFor(dist, route)));
    return { routes, unreadable: undefined };
}

/**
 * The hash sources of each prerendered page's inline scripts, by route, read from a build output.
 * Never throws: a file it cannot read is named in `unreadable` and gives no hash, so its page stays
 * blocked.
 */
export function readPrerenderedHashes(dist) {
    const routes = new Map();
    const unreadable = [];
    const listed = prerenderedHtmlRoutes(dist);
    if (listed.unreadable !== undefined) return { routes, unreadable: [listed.unreadable] };
    for (const route of listed.routes) {
        const file = htmlFileFor(dist, route);
        try {
            routes.set(
                route,
                executableInlineScripts(fs.readFileSync(file, "utf8")).map(scriptHash),
            );
        } catch {
            unreadable.push(file);
        }
    }
    return { routes, unreadable };
}

/** A request path as a prerendered route: one trailing slash is dropped, "/" stays. */
function routeOf(pathname) {
    return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * The hash sources the CSP of a response for this path allows: the path's own prerendered page,
 * then the not-found and global-error pages, each source once.
 */
export function scriptHashSources(hashes, pathname) {
    const sources = [routeOf(pathname), ...GLOBAL_ROUTES].flatMap(
        (route) => hashes.routes.get(route) ?? [],
    );
    return [...new Set(sources)];
}
