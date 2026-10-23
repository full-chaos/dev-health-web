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

const SDK_PATH = /@sentry\/|\bSentry\b/u;
// Names that set or send scope user data. In a file that reaches the SDK by any route (import, re-export,
// dynamic import, require) these are forbidden whatever the alias is called.
const SCOPE_DATA_CALL = /\b(?:setUser|setAttributes?|captureFeedback|startSession)\b/u;
// `.logger`, `?.logger`, `["logger"]` on any receiver.
const SDK_MEMBER = /(?:\?\.|\.|\[\s*["'`])\s*(?:logger|metrics)\b/u;
// `const { logger } = Sentry` and `import / export { logger } from "@sentry/..."`.
const SDK_DESTRUCTURE = /\{[^{}]*\b(?:logger|metrics)\b[^{}]*\}\s*=(?!=)/u;
const SDK_NAMED_IMPORT =
    /\{[^{}]*\b(?:logger|metrics|setUser|setAttributes?|captureFeedback|startSession)\b[^{}]*\}\s*from\s*["'][^"']*sentry[^"']*["']/iu;
const SCOPE_UPDATE_ATTRIBUTES = /\.\s*update\s*\(\s*\{[^}]*\battributes\b/u;

// The SDK adds the scope user and the scope attributes to log, metric, session and feedback items on
// its own, partly after the scrub hooks run. A call that sets or sends them is only allowed inside
// src/lib/sentry, where the hooks and their tests live. A new call site fails here first.
export function sentryUserCallsites(source: string): string[] {
    const found: string[] = [];
    if (SDK_NAMED_IMPORT.test(source)) found.push("named import or re-export");
    if (!SDK_PATH.test(source)) return found;
    if (SCOPE_DATA_CALL.test(source)) found.push("scope data call");
    if (SDK_MEMBER.test(source)) found.push("logger or metrics member");
    if (SDK_DESTRUCTURE.test(source)) found.push("destructured logger or metrics");
    if (SCOPE_UPDATE_ATTRIBUTES.test(source)) found.push("scope update with attributes");
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
        ['import * as S from "@sentry/nextjs";\nS.logger.info("x")', 1],
        ['import * as sentry from "@sentry/nextjs";\nsentry.metrics.count("x", 1)', 1],
        ['import * as S from "@sentry/nextjs";\nS.captureFeedback({ message: "x" })', 1],
        ['import * as S from "@sentry/nextjs";\nS.startSession()', 1],
        ['import * as Sentry from "@sentry/nextjs";\nconst { setUser, logger } = Sentry;', 1],
        ['import * as Sentry from "@sentry/nextjs";\nconst { logger: log } = Sentry;', 1],
        ['export { logger } from "@sentry/nextjs";', 1],
        ['import { logger } from "@/lib/sentry/reexport";', 1],
        ['const S = await import("@sentry/nextjs");\nS.logger.info("x")', 1],
        ['const S = require("@sentry/nextjs");\nS.metrics.count("x", 1)', 1],
        ['import * as Sentry from "@sentry/nextjs";\nSentry?.logger.info("x")', 1],
        ['import * as Sentry from "@sentry/nextjs";\nSentry["logger"].info("x")', 1],
        [
            'import * as Sentry from "@sentry/nextjs";\nSentry.withScope((s) => s.update({ attributes: { a: 1 } }))',
            1,
        ],
        ['import * as Sentry from "@sentry/nextjs";\nSentry.captureException(e)', 0],
        [
            'import * as Sentry from "@sentry/nextjs";\nimport { logger } from "@/lib/logger";\nlogger.error("x")',
            0,
        ],
        ['import * as Sentry from "@sentry/nextjs";\nscope.update({ tags: { a: "b" } })', 0],
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
