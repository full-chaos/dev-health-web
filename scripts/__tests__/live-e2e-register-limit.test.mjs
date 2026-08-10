/**
 * Guards the registration-limit override for the live-e2e backend.
 *
 * Ops defaults `AUTH_REGISTER_LIMIT` to `3/hour` per IP. The live suite is
 * self-bootstrapping — nearly every describe group registers its own user — and
 * in CI every request arrives from a single IP, so past the third registration
 * the run is talking to a throttle rather than the API. The tests that depend on
 * those identities then skip or fail for reasons unrelated to what they assert,
 * which is the most expensive kind of red: it looks like a product failure.
 *
 * Three things have to hold, and the second and third are the ones a
 * well-meaning edit breaks:
 *
 * 1. the override is present at all;
 * 2. it is in the step that actually starts the API — an env var in a
 *    neighbouring step is inert, and inert in a way nothing would report;
 * 3. it is genuinely permissive. Narrowing it to a tidy-looking `10/hour` would
 *    re-introduce the throttle for a suite that registers more users than that,
 *    and the symptom would again be unrelated tests failing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WORKFLOW_PATH = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    ".github",
    "workflows",
    "live-e2e.yml",
);

const START_STEP = "name: Start dev-health-ops API";

/** The text of one workflow step, by its `name:` line. */
function stepBlock(source, stepName) {
    const start = source.indexOf(stepName);
    if (start === -1) throw new Error(`Workflow step "${stepName}" not found in live-e2e.yml.`);
    const rest = source.slice(start + stepName.length);
    const nextStep = rest.search(/\n\s*- name:/u);
    return nextStep === -1 ? rest : rest.slice(0, nextStep);
}

function registerLimit(block) {
    const match = /AUTH_REGISTER_LIMIT:\s*"?(\d+)\/(second|minute|hour|day)"?/u.exec(block);
    if (!match) return null;
    return { count: Number(match[1]), per: match[2] };
}

describe("live-e2e backend raises the registration limit", () => {
    it("sets AUTH_REGISTER_LIMIT in the step that starts the API", () => {
        const block = stepBlock(readFileSync(WORKFLOW_PATH, "utf8"), START_STEP);
        expect(registerLimit(block)).not.toBeNull();
    });

    it("sets it permissively enough for a suite that registers many users", () => {
        const limit = registerLimit(stepBlock(readFileSync(WORKFLOW_PATH, "utf8"), START_STEP));
        expect(limit).not.toBeNull();
        // Well above the number of registrations the live suite performs, and far
        // above the 3/hour production default this overrides.
        expect(limit.per).toBe("hour");
        expect(limit.count).toBeGreaterThanOrEqual(100);
    });

    it("does not rely on the variable appearing somewhere else in the workflow", () => {
        // An override in another step would be inert. Assert the API-start step
        // carries it rather than merely that the file mentions it once.
        const source = readFileSync(WORKFLOW_PATH, "utf8");
        const occurrences = source.match(/AUTH_REGISTER_LIMIT:/gu) ?? [];
        const inStartStep = registerLimit(stepBlock(source, START_STEP)) !== null;
        expect(inStartStep).toBe(true);
        expect(occurrences.length).toBeGreaterThan(0);
    });
});
