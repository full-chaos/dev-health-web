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
const SWALLOWS = [
    [/\|\|\s*true\b/, "|| true"],
    [/\|\|\s*:(\s|$)/, "|| :"],
    [/;\s*exit\s+0\b/, "; exit 0"],
    [/\bset\s+\+e\b/, "set +e"],
    [/continue-on-error\s*:/, "continue-on-error"],
    [/^\s*if\s*:\s*(false|\$\{\{\s*false\s*\}\})\s*$/m, "if: false"],
];

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
        for (const key of GATE_INPUTS) {
            if (!new RegExp(`^\\s+${key}:\\s*\\S`, "m").test(gate)) {
                found.push(`gate step does not set ${key}`);
            }
        }
        if (!/^\s+run:\s*bash ci\/run_tests\.sh auth-profiles-gate\s*$/m.test(gate)) {
            found.push("gate step does not run auth-profiles-gate");
        }
        for (const [re, label] of SWALLOWS) {
            if (re.test(gate)) found.push(`gate step swallows failure: ${label}`);
        }
    }

    const pin = findStep(text, PIN_STEP);
    if (!pin) {
        found.push("pin-shape step missing");
    } else {
        if (!pin.includes("[0-9a-f]{40}")) {
            found.push("pin-shape step lacks the full 40-hex check in its own command");
        }
        for (const [re, label] of SWALLOWS) {
            if (re.test(pin)) found.push(`pin-shape step swallows failure: ${label}`);
        }
    }

    const checkout = findStep(text, CHECKOUT_REPO);
    if (!checkout) {
        found.push("ops checkout step missing");
    } else if (!checkout.includes(PIN_REF)) {
        found.push("ops checkout ref is not bound to the pin step output");
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
            "gate step does not run auth-profiles-gate",
        ],
        [
            "gate swallows failure with || true",
            () => mutate(GATE_RUN, `${GATE_RUN} || true`),
            "|| true",
        ],
        ["gate swallows failure with || :", () => mutate(GATE_RUN, `${GATE_RUN} || :`), "|| :"],
        [
            "gate swallows failure with ; exit 0",
            () => mutate(GATE_RUN, `${GATE_RUN}; exit 0`),
            "; exit 0",
        ],
        [
            "gate step continue-on-error",
            () =>
                mutate(STEP_NAME_LINE, `${STEP_NAME_LINE}\n              continue-on-error: true`),
            "continue-on-error",
        ],
        [
            "gate step if: false",
            () => mutate(STEP_NAME_LINE, `${STEP_NAME_LINE}\n              if: false`),
            "if: false",
        ],
        [
            "pin regex loosened with a decoy comment",
            () =>
                mutate("grep -Eq '^[0-9a-f]{40}$'", "grep -Eq '^[a-z0-9]+$' # [0-9a-f]{40} decoy"),
            "pin-shape step lacks the full 40-hex check",
        ],
        [
            "pin-shape step swallows failure",
            () =>
                mutate(
                    "                    exit 1\n                  fi\n",
                    "                    exit 1\n                  fi\n                  true || :\n",
                ),
            "pin-shape step swallows failure",
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
