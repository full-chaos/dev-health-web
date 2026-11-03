import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CASES } from "../../tests/live/ask-dev/questions";

/**
 * CHAOS-12864: ACR reuses a stored answer, or a run, for the same question. One run has one nonce,
 * so two cases that ask the same case name share ACR's state: a full run failed cases that pass
 * alone (routed.spec.ts and terminals.spec.ts shared stages, stop, reload, long, late and ceiling;
 * terminals reused `stop` across its own cases). These pin the separation in the source.
 */
const LIVE = path.join(__dirname, "..", "..", "tests", "live", "ask-dev");
const specs = readdirSync(LIVE).filter((file) => file.endsWith(".spec.ts"));
const asked = (file: string): string[] =>
    Array.from(readFileSync(path.join(LIVE, file), "utf8").matchAll(/\bquestion\("(\w+)"\)/gu)).map(
        (match) => match[1]!,
    );

describe("the live Ask Dev cases ask their own questions (CHAOS-12864)", () => {
    it("reads the specs that ask questions", () => {
        // Discriminating: an empty read would pass every check below.
        expect(asked("routed.spec.ts").length).toBeGreaterThan(5);
        expect(asked("terminals.spec.ts").length).toBeGreaterThan(5);
    });

    it("no case name is asked by two spec files", () => {
        const files = new Map<string, Set<string>>();
        for (const file of specs) {
            for (const name of asked(file)) {
                files.set(name, (files.get(name) ?? new Set()).add(file));
            }
        }
        const shared = [...files]
            .filter(([, owners]) => owners.size > 1)
            .map(([name, owners]) => `${name}: ${[...owners].sort().join(", ")}`);
        expect(shared).toEqual([]);
    });

    it("terminals.spec.ts asks each case name once: one case, one question", () => {
        const names = asked("terminals.spec.ts");
        const repeated = names.filter((name, index) => names.indexOf(name) !== index);
        expect(repeated).toEqual([]);
    });

    it("every asked name is a planned case, so make-plan.ts writes it into the oracle's plan", () => {
        const unplanned = specs.flatMap((file) => asked(file)).filter((name) => !(name in CASES));
        expect(unplanned).toEqual([]);
    });
});
