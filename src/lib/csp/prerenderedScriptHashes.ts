import path from "node:path";
import { logger } from "@/lib/logger";
import { readPrerenderedHashes, scriptHashSources } from "./prerenderedCsp.mjs";

type PrerenderedHashes = ReturnType<typeof readPrerenderedHashes>;

const byBuildOutput = new Map<string, PrerenderedHashes>();

/** The build output this server serves: Next's distDir, from the working directory it runs in. */
function buildOutputDir(): string {
    return path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        process.env.NEXT_DIST_DIR || ".next",
    );
}

/**
 * CHAOS-12365: the hash sources that let a response for this path run the inline scripts of the
 * pages `next build` prerendered (its own page, plus the not-found and global-error pages any path
 * can get). Read once per build output from the HTML the server serves, so they cannot go stale.
 *
 * Production only: a development server prerenders nothing. A file that cannot be read gives no
 * hash, so its page stays blocked; it is named in one warning and never stops a request.
 */
export function prerenderedScriptSources(pathname: string): string[] {
    if (process.env.NODE_ENV !== "production") return [];
    const dir = buildOutputDir();
    let hashes = byBuildOutput.get(dir);
    if (hashes === undefined) {
        hashes = readPrerenderedHashes(dir);
        byBuildOutput.set(dir, hashes);
        const log = logger.child({ module: "csp" });
        for (const file of hashes.unreadable) {
            log.warn(
                { path: file },
                "prerendered page script hashes unavailable: the build output cannot be read, so these pages stay blocked",
            );
        }
    }
    return scriptHashSources(hashes, pathname);
}
