import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// The window CustomEvent bus (lib/onboarding/telemetry.ts) had no listener, so
// every emit through it went nowhere. Funnel events leave through track.ts only.

const SRC = join(__dirname, "..", "..", "..");
const WEB_ROOT = join(SRC, "..");

// Scanned roots. e2e/ is listed so a future e2e directory is covered at once;
// it is skipped while it does not exist. src/ keeps its old scope and paths.
const EXTRA_ROOTS = ["tests", "e2e", "scripts"];

// Directory names never scanned, each with its reason.
const EXCLUDED_DIRECTORIES = new Set([
    "node_modules", // vendored third-party code
    ".next", // build output
    "test-results", // Playwright run output
    "playwright-report", // Playwright run output
    "coverage", // coverage output
]);

// File name patterns never scanned, each with its reason.
const EXCLUDED_FILES = [
    /\.d\.ts$/, // generated and ambient type declarations
    /\.generated\.[cm]?[jt]sx?$/, // generated code (codegen output)
];

function sourceFiles(directory: string, extension: RegExp): string[] {
    return readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            return EXCLUDED_DIRECTORIES.has(entry) ? [] : sourceFiles(path, extension);
        }
        if (EXCLUDED_FILES.some((pattern) => pattern.test(entry))) return [];
        return extension.test(entry) ? [path] : [];
    });
}

function scan(root: string, extension: RegExp, base: string) {
    return sourceFiles(root, extension).map((path) => ({
        path: relative(base, path),
        text: readFileSync(path, "utf8"),
    }));
}

// The guard names the bus on purpose, so it never scans itself.
const THIS_FILE = "lib/onboarding/__tests__/no-dead-bus.test.ts";
const files = scan(SRC, /\.(ts|tsx)$/, SRC).filter((file) => file.path !== THIS_FILE);

const extraRoots = EXTRA_ROOTS.filter((name) => existsSync(join(WEB_ROOT, name))).map((name) => ({
    name,
    files: scan(join(WEB_ROOT, name), /\.(ts|tsx|js|jsx|mjs|cjs)$/, WEB_ROOT),
}));

describe("onboarding funnel events leave through track.ts only", () => {
    it("scans the source tree", () => {
        expect(files.length).toBeGreaterThan(500);
    });

    it("scans every root that must exist, none empty", () => {
        const names = extraRoots.map((root) => root.name);
        expect(names).toContain("tests");
        expect(names).toContain("scripts");
        expect(extraRoots.filter((root) => root.files.length === 0)).toEqual([]);
    });

    it("nothing imports the removed emit bus or names its window event", () => {
        const offenders = [...files, ...extraRoots.flatMap((root) => root.files)]
            .filter(
                (file) =>
                    /onboarding\/telemetry["']/.test(file.text) ||
                    file.text.includes("devhealth:onboarding-event") ||
                    /\bemitOnboardingEvent(Once)?\b/.test(file.text),
            )
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    it("every funnel call site in a component uses track.ts", () => {
        const callers = files
            .filter(
                (file) =>
                    file.path.startsWith("components/") &&
                    /\btrackOnboardingEvent(Once)?\(/.test(file.text) &&
                    !file.path.includes(".test."),
            )
            .map((file) => ({
                path: file.path,
                fromTrack: /from "@\/lib\/onboarding\/track"/.test(file.text),
            }));
        expect(callers.length).toBeGreaterThanOrEqual(4);
        expect(callers.filter((caller) => !caller.fromTrack)).toEqual([]);
    });
});
