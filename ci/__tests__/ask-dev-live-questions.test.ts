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
/** A click on "Sign out", by its regex or its string name (codex r1 P3). */
const SIGN_OUT = /name: (?:\/sign out\/iu|["']Sign out["'])/giu;
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

    it("every case that signs out signs in to a session of its own first", () => {
        // The click on "Sign out", and the start of the test or helper it sits in.
        const unowned = specs.flatMap((file) => {
            const text = readFileSync(path.join(LIVE, file), "utf8");
            return Array.from(text.matchAll(SIGN_OUT)).flatMap((click) => {
                const before = text.slice(0, click.index);
                const start = Math.max(
                    before.lastIndexOf("\n    test("),
                    before.lastIndexOf("\ntest("),
                    before.lastIndexOf("\nasync function "),
                );
                return before.slice(start).includes("await ownSession(page)")
                    ? []
                    : [`${file}:${before.split("\n").length}`];
            });
        });
        // Discriminating: both sign-out sites are found.
        const clicks = specs.flatMap((file) =>
            Array.from(readFileSync(path.join(LIVE, file), "utf8").matchAll(SIGN_OUT)),
        );
        expect(clicks.length).toBeGreaterThanOrEqual(2);
        expect(unowned).toEqual([]);
    });

    it("each terminals case keeps the acr plan entry of the case it replaced (codex r1 P3)", () => {
        // The entry sets the oracle's delays: a Hold case on a plain entry would answer at once.
        const replaced = {
            termStalled: "stop",
            termAdmission: "ceiling",
            termBrokenSeq: "stages",
            termEndOfStream: "stop",
            termBudget: "reload",
            termMismatch: "stop",
            termMismatchOther: "stages",
            termAbandoned: "stop",
            termInProgress: "stop",
            termDeadline: "long",
            termModelDeadline: "late",
            termStreamOff: "stages",
            termAllowance: "stages",
            termOrgLimit: "stop",
            termRunEndedStalled: "stop",
            termRunEndedEos: "stop",
        } as const;
        expect(Object.keys(replaced).sort()).toEqual(
            Object.keys(CASES)
                .filter((name) => name.startsWith("term"))
                .sort(),
        );
        const moved = Object.entries(replaced)
            .filter(([name, was]) => CASES[name as keyof typeof CASES] !== CASES[was])
            .map(([name, was]) => `${name} != ${was}`);
        expect(moved).toEqual([]);
    });

    it("every asked name is a planned case, so make-plan.ts writes it into the oracle's plan", () => {
        const unplanned = specs.flatMap((file) => asked(file)).filter((name) => !(name in CASES));
        expect(unplanned).toEqual([]);
    });
});
