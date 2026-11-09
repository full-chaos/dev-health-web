/**
 * CHAOS-12337 / CHAOS-12365: every page is served under the per-request CSP from `src/proxy.ts`
 * (`script-src 'self' 'nonce-…'`). A page `next build` prerenders is fixed HTML, so its inline
 * scripts cannot carry the nonce drawn per request. The proxy allows them by their sha256, read from
 * the build output it serves (src/lib/csp/prerenderedScriptHashes.ts), with the same parser as this
 * check (src/lib/csp/prerenderedCsp.mjs).
 *
 * This check reads the build output and the copy the server serves (by default the standalone copy
 * the image ships, when there is one) and fails:
 * - a prerendered page whose inline script the CSP served for its path does not allow (a page the
 *   served copy lacks, or a copy from a different build);
 * - a prerendered page with an inline event handler or a javascript: URL, which no hash allows;
 * - a served copy it cannot read (the proxy would serve no hashes, and every such page is blocked).
 *
 * Usage: node scripts/check-nonce-csp-pages.mjs [--dist .next] [--served <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    executableInlineScripts,
    htmlFileFor,
    inlineHandlers,
    readPrerenderedHashes,
    scriptHash,
    scriptHashSources,
} from "../src/lib/csp/prerenderedCsp.mjs";

/** Executable inline scripts in a page (the shared parser). */
export function inlineScripts(html) {
    return executableInlineScripts(html).length;
}

/** A request path that the proxy serves this prerendered page for. */
function requestPathFor(route) {
    // The not-found page answers any unknown path; the global-error page any failed render.
    if (route === "/_not-found") return "/check-nonce-csp-pages/no-such-page";
    if (route === "/_global-error") return "/check-nonce-csp-pages/any-page";
    return route;
}

export function checkNonceCspPages({ dist, served = dist }) {
    const manifestPath = path.join(dist, "prerender-manifest.json");
    if (!fs.existsSync(manifestPath)) {
        return {
            checked: [],
            failures: [`no prerender manifest at ${manifestPath}: run next build first`],
        };
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const servedHashes = readPrerenderedHashes(served);
    const checked = [];
    const failures = servedHashes.unreadable.map(
        (file) => `${file}: unreadable, so the proxy serves no hashes`,
    );
    for (const route of Object.keys(manifest.routes ?? {}).sort()) {
        const file = htmlFileFor(dist, route);
        if (!fs.existsSync(file)) continue;
        checked.push(route);
        const html = fs.readFileSync(file, "utf8");
        const allowed = new Set(scriptHashSources(servedHashes, requestPathFor(route)));
        for (const script of executableInlineScripts(html)) {
            const source = scriptHash(script);
            if (!allowed.has(source)) {
                failures.push(`${route}: inline script ${source} is not allowed by the served CSP`);
            }
        }
        const handlers = inlineHandlers(html);
        if (handlers > 0) {
            failures.push(
                `${route}: ${handlers} inline event handler${handlers === 1 ? "" : "s"} or javascript: URL${handlers === 1 ? "" : "s"}, which no hash in the served CSP can allow`,
            );
        }
    }
    return { checked, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const option = (name) => {
        const at = process.argv.indexOf(name);
        return at === -1 ? undefined : process.argv[at + 1];
    };
    const dist = path.resolve(option("--dist") ?? ".next");
    const standalone = path.join(dist, "standalone", ".next");
    const served = path.resolve(
        option("--served") ?? (fs.existsSync(standalone) ? standalone : dist),
    );
    const { checked, failures } = checkNonceCspPages({ dist, served });
    console.log(
        `check:nonce-csp-pages: ${checked.length} prerendered page(s) checked in ${dist}, served from ${served}`,
    );
    if (failures.length > 0) {
        for (const failure of failures) console.error(`  FAIL ${failure}`);
        console.error(
            "A prerendered page runs only the inline scripts the proxy hashes from the served build output: no event handler attributes or javascript: URLs, and serve the same build the check read.",
        );
        process.exit(1);
    }
}
