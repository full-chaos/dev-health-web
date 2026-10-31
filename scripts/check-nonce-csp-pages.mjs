/**
 * Build check: no page is prerendered under the nonce CSP (CHAOS-12337).
 *
 * `src/proxy.ts` sends every page `script-src 'self' 'nonce-<per request>'`. Next puts that nonce
 * on its inline scripts only when it renders the page per request. A page that `next build`
 * prerenders as static HTML has inline scripts with no nonce, so the browser blocks them, the page
 * never hydrates, and a client page shows nothing. `next dev` renders every request, so the dev
 * server e2e cannot see this; the build output can.
 *
 * The check reads `<dist>/prerender-manifest.json` and the HTML of every prerendered route
 * (`<dist>/server/app/<route>.html`). A route with an inline `<script>` that has no `nonce`
 * attribute fails, by name. A route with no HTML (an image, robots.txt) is not a page.
 *
 * It fails closed: no manifest is a failure ("run next build first"), never a pass.
 *
 * `KNOWN_PRERENDERED` lists the pages that already had this defect when the check was added, each
 * with the ticket that fixes it (CHAOS-12344). A listed page passes while it is still prerendered
 * with blocked scripts. A listed page that is no longer prerendered that way fails ("remove it from
 * the list"), so the list only shrinks and never hides a fixed page. Any other page fails.
 *
 * Usage: node scripts/check-nonce-csp-pages.mjs [--dist .next]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_TAG = /<script\b([^>]*)>/giu;

/** Pages prerendered with blocked scripts on main when this check was added (CHAOS-12337). */
export const KNOWN_PRERENDERED = new Map(
    [
        "/",
        "/_global-error",
        "/_not-found",
        "/auth/forgot-password",
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
    ].map((route) => [route, "CHAOS-12344"]),
);

/** Inline scripts (no `src`) with no `nonce` attribute. Data scripts (`type="application/…"`) do not run. */
export function inlineScriptsWithoutNonce(html) {
    let count = 0;
    for (const match of html.matchAll(SCRIPT_TAG)) {
        const attributes = match[1] ?? "";
        if (/\bsrc\s*=/iu.test(attributes)) continue;
        if (/\btype\s*=\s*["']?application\/(?:ld\+)?json/iu.test(attributes)) continue;
        if (/\bnonce\s*=/iu.test(attributes)) continue;
        count += 1;
    }
    return count;
}

function htmlFileFor(dist, route) {
    const relative = route === "/" ? "index.html" : `${route.replace(/^\//u, "")}.html`;
    return path.join(dist, "server", "app", relative);
}

export function checkNonceCspPages({ dist, known = KNOWN_PRERENDERED }) {
    const manifestPath = path.join(dist, "prerender-manifest.json");
    if (!fs.existsSync(manifestPath)) {
        return {
            checked: [],
            failures: [`no prerender manifest at ${manifestPath}: run next build first`],
        };
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const checked = [];
    const failures = [];
    const stillBlocked = new Set();
    for (const route of Object.keys(manifest.routes ?? {}).sort()) {
        const file = htmlFileFor(dist, route);
        if (!fs.existsSync(file)) continue;
        checked.push(route);
        const blocked = inlineScriptsWithoutNonce(fs.readFileSync(file, "utf8"));
        if (blocked > 0 && known.has(route)) {
            stillBlocked.add(route);
        } else if (blocked > 0) {
            failures.push(
                `${route}: prerendered with ${blocked} inline script${blocked === 1 ? "" : "s"} and no nonce`,
            );
        }
    }
    for (const [route, ticket] of known) {
        if (!stillBlocked.has(route)) {
            failures.push(
                `${route}: on the known list (${ticket}) but not prerendered with blocked scripts: remove it from the list`,
            );
        }
    }
    failures.sort();
    return { checked, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const at = process.argv.indexOf("--dist");
    const dist = path.resolve(at === -1 ? ".next" : process.argv[at + 1]);
    const { checked, failures } = checkNonceCspPages({ dist });
    console.log(`check:nonce-csp-pages: ${checked.length} prerendered page(s) checked in ${dist}`);
    if (failures.length > 0) {
        for (const failure of failures) console.error(`  FAIL ${failure}`);
        console.error(
            'A page served under the nonce CSP must render per request (export const dynamic = "force-dynamic", or await connection()).',
        );
        process.exit(1);
    }
}
