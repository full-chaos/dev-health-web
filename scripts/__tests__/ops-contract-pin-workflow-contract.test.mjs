import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");

const GATE_STEP = "Run the web auth-profile CI gate";
const PIN_STEP = "Verify the pin names an immutable commit";
const CHECKOUT_REPO = "path: .ops-contract";
const PIN_REF = "ref: ${{ steps.ops-contract-pin.outputs.sha }}";
const GATE_INPUTS = [
    "WEB_ENDPOINT_PROFILE_SCHEMA",
    "WEB_CREDENTIAL_CLASSES",
    "WEB_CREDENTIAL_CLASSES_SCHEMA",
];
// Allowlists, not blocklists: any step key or executed line outside these
// sets is a violation, whatever form the weakening takes.
const GATE_KEYS = new Set(["name", "env", "run"]);
const PIN_KEYS = new Set(["name", "run"]);
const CHECKOUT_KEYS = new Set(["name", "uses", "with"]);
const GATE_RUN_LINE = "bash ci/run_tests.sh auth-profiles-gate";
const PIN_COMMAND = [
    "set -euo pipefail",
    'sha="${{ steps.ops-contract-pin.outputs.sha }}"',
    "if ! printf '%s' \"$sha\" | grep -Eq '^[0-9a-f]{40}$'; then",
    "cat >&2 <<EOF",
    "exit 1",
    "fi",
];

function stepKeys(step) {
    const keys = [];
    for (const line of step.split("\n")) {
        const m = /^ {12}- ([\w-]+):|^ {14}([\w-]+):/.exec(line);
        if (m) keys.push(m[1] || m[2]);
    }
    return keys;
}

// The lines the shell executes: the `run: |` block, dedented, with heredoc
// bodies (data, not commands) removed.
function executedLines(step) {
    const lines = step.split("\n");
    const start = lines.findIndex((l) => /^ {14}run:\s*\|\s*$/.test(l));
    if (start < 0) return null;
    const out = [];
    let terminator = null;
    for (const raw of lines.slice(start + 1)) {
        if (!/^ {18}/.test(raw) && raw.trim() !== "") break;
        const line = raw.slice(18);
        if (terminator !== null) {
            if (line === terminator) terminator = null;
            continue;
        }
        const here = /<<-?'?(\w+)'?\s*$/.exec(line);
        if (here) terminator = here[1];
        out.push(line.trim());
    }
    return out;
}

function disallowedKeys(step, allowed, label, found) {
    for (const key of stepKeys(step)) {
        if (!allowed.has(key)) found.push(`${label} step has disallowed key: ${key}`);
    }
}

// Steps are the `- ` items at the job-steps indent. Comments are dropped
// so a decoy in a comment cannot satisfy a check.
function steps(text) {
    const out = [];
    let cur = null;
    for (const line of text.split("\n")) {
        if (/^ {12}- /.test(line)) {
            cur = [];
            out.push(cur);
        } else if (cur && /^ {0,11}\S/.test(line) && !/^\s*#/.test(line)) {
            cur = null;
        }
        if (cur && !/^\s*#/.test(line)) cur.push(line.replace(/\s#\s.*$/, ""));
    }
    return out.map((lines) => lines.join("\n"));
}

function findStep(text, marker) {
    return steps(text).find((s) => s.includes(marker));
}

function violations(text) {
    const found = [];

    const gate = findStep(text, GATE_STEP);
    if (!gate) {
        found.push("gate step missing");
    } else {
        disallowedKeys(gate, GATE_KEYS, "gate", found);
        for (const key of GATE_INPUTS) {
            if (!new RegExp(`^\\s+${key}:\\s*\\S`, "m").test(gate)) {
                found.push(`gate step does not set ${key}`);
            }
        }
        const run = gate.split("\n").filter((l) => /^ {14}run:/.test(l));
        if (run.length !== 1 || run[0].trim() !== `run: ${GATE_RUN_LINE}`) {
            found.push("gate run command is not the single canonical auth-profiles-gate line");
        }
    }

    const pin = findStep(text, PIN_STEP);
    if (!pin) {
        found.push("pin-shape step missing");
    } else {
        disallowedKeys(pin, PIN_KEYS, "pin-shape", found);
        const cmd = executedLines(pin);
        if (!cmd || JSON.stringify(cmd) !== JSON.stringify(PIN_COMMAND)) {
            found.push("pin-shape step executed command differs from the canonical 40-hex check");
        }
    }

    const checkout = findStep(text, CHECKOUT_REPO);
    if (!checkout) {
        found.push("ops checkout step missing");
    } else {
        disallowedKeys(checkout, CHECKOUT_KEYS, "ops checkout", found);
        if (!checkout.includes(PIN_REF)) {
            found.push("ops checkout ref is not bound to the pin step output");
        }
    }

    return found;
}

const real = fs.readFileSync(WORKFLOW, "utf8");

function mutate(from, to) {
    expect(real.includes(from), `mutation anchor not found: ${from}`).toBe(true);
    return real.replace(from, to);
}

describe("ops-contract pin gate workflow contract", () => {
    it("the real workflow satisfies every property", () => {
        expect(violations(real)).toEqual([]);
    });

    const GATE_RUN = "run: bash ci/run_tests.sh auth-profiles-gate";
    const STEP_NAME_LINE = `- name: ${GATE_STEP} (CHAOS-3273 guardrail G-1)`;
    const controls = [
        [
            "gate step deleted",
            () => mutate(STEP_NAME_LINE, "- name: renamed away"),
            "gate step missing",
        ],
        ...GATE_INPUTS.map((key) => [
            `gate input ${key} dropped`,
            () => mutate(`${key}: $`, `${key}_X: $`),
            `gate step does not set ${key}`,
        ]),
        [
            "gate no longer runs auth-profiles-gate",
            () => mutate(GATE_RUN, "run: echo skipped"),
            "gate run command is not the single canonical",
        ],
        [
            "gate swallows failure with || true",
            () => mutate(GATE_RUN, `${GATE_RUN} || true`),
            "gate run command is not the single canonical",
        ],
        [
            "gate swallows failure with || :",
            () => mutate(GATE_RUN, `${GATE_RUN} || :`),
            "gate run command is not the single canonical",
        ],
        [
            "gate swallows failure with ; exit 0",
            () => mutate(GATE_RUN, `${GATE_RUN}; exit 0`),
            "gate run command is not the single canonical",
        ],
        [
            "gate step continue-on-error",
            () =>
                mutate(STEP_NAME_LINE, `${STEP_NAME_LINE}\n              continue-on-error: true`),
            "disallowed key: continue-on-error",
        ],
        [
            "gate step if: false",
            () => mutate(STEP_NAME_LINE, `${STEP_NAME_LINE}\n              if: false`),
            "disallowed key: if",
        ],
        [
            "pin regex loosened with a decoy comment",
            () =>
                mutate("grep -Eq '^[0-9a-f]{40}$'", "grep -Eq '^[a-z0-9]+$' # [0-9a-f]{40} decoy"),
            "pin-shape step executed command differs",
        ],
        [
            "pin regex weakened to accept any ref, decoy text left in an echo",
            () =>
                mutate(
                    "if ! printf '%s' \"$sha\" | grep -Eq '^[0-9a-f]{40}$'; then",
                    "echo \"grep -Eq '^[0-9a-f]{40}$'\" >/dev/null\n                  if ! printf '%s' \"$sha\" | grep -Eq '^[a-z0-9]+$'; then",
                ),
            "pin-shape step executed command differs",
        ],
        [
            "gate step skipped by a composite false condition",
            () =>
                mutate(
                    STEP_NAME_LINE,
                    `${STEP_NAME_LINE}\n              if: \${{ false && true }}`,
                ),
            "gate step has disallowed key: if",
        ],
        [
            "gate inputs pointed at a moving checkout",
            () =>
                mutate(
                    "WEB_CREDENTIAL_CLASSES: ${{ github.workspace }}/.ops-contract/",
                    "WEB_CREDENTIAL_CLASSES: ${{ github.workspace }}/dev-health-ops-parity/",
                ),
            "WEB_CREDENTIAL_CLASSES",
        ],
        [
            "checkout ref floating, pin expression left in the step name",
            () =>
                mutate(
                    "- name: Checkout pinned ops-owned auth contract",
                    '- name: "ref: ${{ steps.ops-contract-pin.outputs.sha }}"',
                ).replace(
                    "ref: ${{ steps.ops-contract-pin.outputs.sha }}\n                  path: .ops-contract",
                    "ref: main\n                  path: .ops-contract",
                ),
            "ops checkout ref is not bound",
        ],
        [
            "gate step bash shadowed through PATH",
            () =>
                mutate(
                    "              env:\n                  WEB_ENDPOINT_PROFILE_SCHEMA",
                    "              env:\n                  PATH: ${{ github.workspace }}/.github/noop-bin\n                  WEB_ENDPOINT_PROFILE_SCHEMA",
                ),
            "PATH",
        ],
        [
            "pin-shape step swallows failure",
            () =>
                mutate(
                    "                    exit 1\n                  fi\n",
                    "                    exit 1\n                  fi\n                  true || :\n",
                ),
            "pin-shape step executed command differs",
        ],
        [
            "pin-shape step deleted",
            () => mutate(PIN_STEP, "Something else entirely"),
            "pin-shape step missing",
        ],
        [
            "checkout ref rewired to a floating branch",
            () => mutate(PIN_REF, "ref: main"),
            "ops checkout ref is not bound",
        ],
    ];

    it.each(controls)("negative control: %s", (_label, build, expected) => {
        const mutated = build();
        expect(mutated).not.toBe(real);
        expect(violations(mutated).join("\n")).toContain(expected);
    });
});
