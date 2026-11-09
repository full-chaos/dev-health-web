// CHAOS-12365: the inline scripts of the pages `next build` prerenders, and the CSP hash sources
// that allow them. One parser for the proxy (the served script-src) and the build check
// (scripts/check-nonce-csp-pages.mjs), so the two cannot disagree about a page.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Served on any path: an unknown path gets the prerendered not-found page, a failed render the global error. */
export const GLOBAL_ROUTES = ["/_not-found", "/_global-error"];

/**
 * The attributes of a tag's text, by lower-case name: quoted values are read whole, and a repeated
 * attribute keeps its first value, as HTML parsing does.
 */
function attributesOf(text) {
    const attributes = new Map();
    const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
    for (const match of text.matchAll(ATTRIBUTE)) {
        const name = match[1].toLowerCase();
        if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
    }
    return attributes;
}

/** Each <script> or <style> element: its tag name, attribute text, and the content's bounds. */
function* rawTextElements(html) {
    const OPEN = /<(script|style)\b([^>]*)>/giu;
    let match;
    while ((match = OPEN.exec(html)) !== null) {
        const name = match[1].toLowerCase();
        const start = match.index + match[0].length;
        // The content ends at the first `</name` followed by space, `/` or `>`, as the tokenizer reads it.
        const close = new RegExp(`</${name}[\\t\\n\\f\\r />]`, "iu").exec(html.slice(start));
        const end = close === null ? html.length : start + close.index;
        OPEN.lastIndex = end;
        yield { name, attributes: match[2] ?? "", start, end };
    }
}

/**
 * The text of every executable inline script: no `src` attribute, not a JSON data type. A nonce
 * attribute does not count: HTML fixed at build time cannot carry the nonce drawn per request.
 * CR LF and CR become LF, as the HTML parser makes them before the browser hashes the text.
 */
export function executableInlineScripts(html) {
    const scripts = [];
    for (const element of rawTextElements(html)) {
        if (element.name !== "script") continue;
        const attributes = attributesOf(element.attributes);
        if (attributes.has("src")) continue;
        if (/^application\/(?:ld\+)?json$/iu.test((attributes.get("type") ?? "").trim())) continue;
        scripts.push(html.slice(element.start, element.end).replace(/\r\n?/gu, "\n"));
    }
    return scripts;
}

/** Inline event handler attributes and javascript: URLs: no hash source can allow them. */
export function inlineHandlers(html) {
    let markup = "";
    let at = 0;
    for (const element of rawTextElements(html)) {
        markup += html.slice(at, element.start);
        at = element.end;
    }
    markup += html.slice(at);
    let count = 0;
    for (const tag of markup.matchAll(/<[a-z][^\s/>]*([^>]*)>/giu)) {
        for (const [name, value] of attributesOf(tag[1] ?? "")) {
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
