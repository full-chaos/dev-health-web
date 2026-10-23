import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../../..");
const SKIP = new Set(["node_modules", ".next", ".git", "__tests__", "test", "tests", "e2e"]);
const SENTRY_DIR = path.join("src", "lib", "sentry") + path.sep;

function walk(dir: string, top: boolean, out: string[]): void {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            if (!top) walk(full, false, out);
        } else if (/\.(?:[cm]?[jt]sx?)$/u.test(name) && !/\.test\./u.test(name)) {
            out.push(full);
        }
    }
}

function sourceFiles(): string[] {
    const files: string[] = [];
    walk(path.join(ROOT, "src"), false, files);
    walk(ROOT, true, files);
    return files;
}

const NAMESPACE_CALL =
    /\bSentry\s*\.\s*(?:logger|metrics|setUser|setAttributes?|captureFeedback|startSession)\b/u;
const SCOPE_CALL = /\.\s*(?:setUser|setAttributes?)\s*\(/u;
const NAMED_IMPORT =
    /import\s*(?:type\s*)?\{[^}]*\b(?:logger|metrics|setUser|setAttributes?|captureFeedback|startSession)\b[^}]*\}\s*from\s*["']@sentry\//u;

// The SDK adds the scope user and the scope attributes to log, metric, session and feedback items on
// its own, partly after the scrub hooks run. A call that sets or sends them is only allowed inside
// src/lib/sentry, where the hooks and their tests live. A new call site fails here first.
export function sentryUserCallsites(source: string): string[] {
    const found: string[] = [];
    if (NAMESPACE_CALL.test(source)) found.push("namespace call");
    if (NAMED_IMPORT.test(source)) found.push("named import");
    if (/\bSentry\b|@sentry\//u.test(source) && SCOPE_CALL.test(source)) found.push("scope call");
    return found;
}

describe("Sentry call sites outside src/lib/sentry", () => {
    it("scans the source tree", () => {
        expect(sourceFiles().length).toBeGreaterThan(100);
    });

    it.each([
        ['Sentry.setUser({ id: "a" })', 1],
        ["Sentry.logger.info('x')", 1],
        ["Sentry.metrics.count('x', 1)", 1],
        ["Sentry.captureFeedback({ message: 'x' })", 1],
        ["Sentry.startSession()", 1],
        ["Sentry.getCurrentScope().setAttributes({ a: 1 })", 1],
        ['import { logger } from "@sentry/nextjs"', 1],
        ['import { setUser as put } from "@sentry/nextjs"', 1],
        ['import * as Sentry from "@sentry/nextjs";\nSentry.withScope((s) => s.setUser({}))', 1],
        [
            'import * as Sentry from "@sentry/nextjs";\nSentry.withScope((s) => s.setAttribute("a", 1))',
            1,
        ],
        ['import * as Sentry from "@sentry/nextjs";\nSentry.captureException(e)', 0],
        ['import * as Sentry from "@sentry/nextjs";\nscope.setTag("a", "b")', 0],
        ["element.setAttribute('a', 'b')", 0],
        ["await setUserPassword(id, password)", 0],
        ["logger.info('x')", 0],
    ])("flags a call site: %s", (source, count) => {
        expect(sentryUserCallsites(source).length > 0).toBe(count === 1);
    });

    it("has no call that sets or sends scope user data outside the scrub module", () => {
        const offenders: string[] = [];
        for (const file of sourceFiles()) {
            const relative = path.relative(ROOT, file);
            if (relative.startsWith(SENTRY_DIR)) continue;
            const found = sentryUserCallsites(readFileSync(file, "utf8"));
            if (found.length > 0) offenders.push(`${relative}: ${found.join(", ")}`);
        }
        expect(offenders).toEqual([]);
    });
});
