import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// The window CustomEvent bus (lib/onboarding/telemetry.ts) had no listener, so
// every emit through it went nowhere. Funnel events leave through track.ts only.

const SRC = join(__dirname, "..", "..", "..");

function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx)$/.test(entry) ? [path] : [];
    });
}

const THIS_FILE = "lib/onboarding/__tests__/no-dead-bus.test.ts";
const files = sourceFiles(SRC)
    .map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }))
    .filter((file) => file.path !== THIS_FILE);

describe("onboarding funnel events leave through track.ts only", () => {
    it("scans the source tree", () => {
        expect(files.length).toBeGreaterThan(500);
    });

    it("nothing imports the removed emit bus or names its window event", () => {
        const offenders = files
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
