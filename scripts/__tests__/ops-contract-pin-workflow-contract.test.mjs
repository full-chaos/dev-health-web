import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");

// The ops-contract pin gate is five consecutive steps of the quality job.
// Each is compared line for line to its canonical definition, so any key,
// value, command, ordering or inserted step outside it is a violation,
// whatever form the weakening takes. Comments are dropped before comparing
// and heredoc bodies (message text, not commands) are collapsed.
const PIN_OUTPUT_ID = "id: ops-contract-pin";
const SHAPE_NAME = "Verify the pin names an immutable commit";
const RESOLVE_NAME = "Verify the pinned ops commit is resolvable";
const CHECKOUT_PATH = "path: .ops-contract";
const GATE_NAME = "Run the web auth-profile CI gate";

const CANONICAL = [
    {
        label: "pin-output",
        marker: PIN_OUTPUT_ID,
        lines: [
            "            - name: *",
            "              id: ops-contract-pin",
            `              run: echo "sha=$(tr -d '[:space:]' < ci/ops-contract.pin)" >> "$GITHUB_OUTPUT"`,
        ],
    },
    {
        label: "pin-shape",
        marker: SHAPE_NAME,
        lines: [
            "            - name: *",
            "              run: |",
            "                  set -euo pipefail",
            '                  sha="${{ steps.ops-contract-pin.outputs.sha }}"',
            `                  if ! printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then`,
            "                    cat >&2 <<EOF",
            "                    exit 1",
            "                  fi",
        ],
    },
    {
        label: "pin-resolvable",
        marker: RESOLVE_NAME,
        lines: [
            "            - name: *",
            "              run: |",
            "                  set -euo pipefail",
            '                  sha="${{ steps.ops-contract-pin.outputs.sha }}"',
            '                  if git fetch --depth 1 https://github.com/full-chaos/dev-health-ops.git "$sha" >/dev/null 2>&1; then',
            "                    exit 0",
            "                  fi",
            "                  cat >&2 <<EOF",
            "                  exit 1",
        ],
    },
    {
        label: "ops checkout",
        marker: CHECKOUT_PATH,
        lines: [
            "            - name: *",
            "              uses: actions/checkout@<sha>",
            "              with:",
            "                  repository: full-chaos/dev-health-ops",
            "                  ref: ${{ steps.ops-contract-pin.outputs.sha }}",
            "                  path: .ops-contract",
            "                  persist-credentials: false",
            "                  sparse-checkout: |",
            "                      contracts/auth/v1/endpoint-profile.schema.json",
            "                      contracts/auth/v1/credential-classes.json",
            "                      contracts/auth/v1/credential-classes.schema.json",
            "                  sparse-checkout-cone-mode: false",
        ],
    },
    {
        label: "gate",
        marker: GATE_NAME,
        lines: [
            "            - name: *",
            "              env:",
            "                  WEB_ENDPOINT_PROFILE_SCHEMA: ${{ github.workspace }}/.ops-contract/contracts/auth/v1/endpoint-profile.schema.json",
            "                  WEB_CREDENTIAL_CLASSES: ${{ github.workspace }}/.ops-contract/contracts/auth/v1/credential-classes.json",
            "                  WEB_CREDENTIAL_CLASSES_SCHEMA: ${{ github.workspace }}/.ops-contract/contracts/auth/v1/credential-classes.schema.json",
            "              run: bash ci/run_tests.sh auth-profiles-gate",
        ],
    },
];

// The environment the five steps run in: the workflow has no top-level env or
// defaults, and the quality job's only env is the wire-parity root.
const WORKFLOW_KEYS = new Set(["name", "on", "permissions", "concurrency", "jobs"]);
const JOB_KEYS = new Set(["name", "needs", "if", "runs-on", "timeout-minutes", "env", "steps"]);
const JOB_ENV = ["        env:", "            WIRE_PARITY_OPS_ROOT: dev-health-ops-parity"];

// Steps are the `- ` items at the job-steps indent. Comments are dropped so a
// decoy in a comment cannot satisfy a check.
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
        if (cur && !/^\s*#/.test(line)) cur.push(line.replace(/\s#\s.*$/, "").trimEnd());
    }
    return out;
}

function normalize(lines) {
    const out = [];
    let terminator = null;
    for (const line of lines) {
        if (line.trim() === "") continue;
        if (terminator !== null) {
            if (line.trim() === terminator) terminator = null;
            continue;
        }
        const here = /<<-?'?(\w+)'?\s*$/.exec(line);
        if (here) terminator = here[1];
        out.push(
            line
                .replace(/^( *(?:- )?)name:.*$/, "$1name: *")
                .replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@<sha>"),
        );
    }
    return out;
}

function topLevelKeys(text) {
    return text
        .split("\n")
        .map((l) => /^([\w-]+):/.exec(l))
        .filter(Boolean)
        .map((m) => m[1]);
}

function qualityJobHeader(text) {
    const lines = text.split("\n");
    const start = lines.findIndex((l) => l === "    quality:");
    if (start < 0) return null;
    const end = lines.findIndex((l, i) => i > start && l === "        steps:");
    return end < 0 ? null : lines.slice(start + 1, end);
}

function violations(text) {
    const found = [];

    for (const key of topLevelKeys(text)) {
        if (!WORKFLOW_KEYS.has(key)) found.push(`workflow has disallowed top-level key: ${key}`);
    }

    const header = qualityJobHeader(text);
    if (!header) {
        found.push("quality job header missing");
    } else {
        for (const line of header) {
            const m = /^ {8}([\w-]+):/.exec(line);
            if (m && !JOB_KEYS.has(m[1])) found.push(`quality job has disallowed key: ${m[1]}`);
        }
        const at = header.findIndex((l) => l === JOB_ENV[0]);
        if (at < 0 || header[at + 1] !== JOB_ENV[1] || /^ {12}/.test(header[at + 2] ?? "")) {
            found.push("quality job env differs from the canonical definition");
        }
    }

    const all = steps(text);
    const indices = [];
    for (const spec of CANONICAL) {
        const hits = all.map((s, i) => [s, i]).filter(([s]) => s.join("\n").includes(spec.marker));
        if (hits.length === 0) {
            found.push(`${spec.label} step missing`);
            continue;
        }
        if (hits.length > 1) found.push(`${spec.label} step is not unique`);
        const [step, index] = hits[0];
        indices.push(index);
        const got = normalize(step);
        if (JSON.stringify(got) !== JSON.stringify(spec.lines)) {
            found.push(`${spec.label} step differs from the canonical definition`);
        }
    }
    if (indices.length === CANONICAL.length) {
        const consecutive = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
        if (!consecutive) found.push("pin gate steps are not consecutive");
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
    const GATE_NAME_LINE = `- name: ${GATE_NAME} (CHAOS-3273 guardrail G-1)`;
    const CHECKOUT_NAME_LINE = "- name: Checkout pinned ops-owned auth contract";
    const GRID = "              ";
    const gateDiffers = "gate step differs";
    const shapeDiffers = "pin-shape step differs";
    const checkoutDiffers = "ops checkout step differs";
    const controls = [
        [
            "gate block moved into a job the aggregate does not require",
            () => {
                const first = "            - name: Read the pinned ops-owned contract commit\n";
                const lastLine = "              run: bash ci/run_tests.sh auth-profiles-gate\n";
                const a = real.indexOf(first);
                const b = real.indexOf(lastLine, a) + lastLine.length;
                const block = real.slice(a, b);
                const anchor = "            - name: Run design lint\n";
                return (real.slice(0, a) + real.slice(b))
                    .replace(anchor, block + anchor)
                    .replace(
                        "    design-lint:\n        name: Design lint\n        needs: [changes]\n        if: needs.changes.outputs.code == 'true'",
                        "    design-lint:\n        name: Design lint\n        needs: [changes]\n        if: false",
                    );
            },
            "pin-output step missing",
        ],
        [
            "aggregate no longer needs the quality job",
            () =>
                mutate(
                    "needs: [changes, format, quality, build,",
                    "needs: [changes, format, build,",
                ),
            "aggregate",
        ],
        [
            "aggregate no longer checks the quality result",
            () => mutate("\"${{ needs.quality.result }}\" != 'success' || ", ""),
            "aggregate",
        ],
        [
            "gate step deleted",
            () => mutate(GATE_NAME_LINE, "- name: renamed away"),
            "gate step missing",
        ],
        ...[
            "WEB_ENDPOINT_PROFILE_SCHEMA",
            "WEB_CREDENTIAL_CLASSES",
            "WEB_CREDENTIAL_CLASSES_SCHEMA",
        ].map((key) => [
            `gate input ${key} dropped`,
            () => mutate(`${key}: $`, `${key}_X: $`),
            gateDiffers,
        ]),
        [
            "gate inputs pointed at a moving checkout",
            () =>
                mutate(
                    "WEB_CREDENTIAL_CLASSES: ${{ github.workspace }}/.ops-contract/",
                    "WEB_CREDENTIAL_CLASSES: ${{ github.workspace }}/dev-health-ops-parity/",
                ),
            gateDiffers,
        ],
        [
            "gate no longer runs auth-profiles-gate",
            () => mutate(GATE_RUN, "run: echo skipped"),
            gateDiffers,
        ],
        [
            "gate swallows failure with || true",
            () => mutate(GATE_RUN, `${GATE_RUN} || true`),
            gateDiffers,
        ],
        [
            "gate swallows failure with || :",
            () => mutate(GATE_RUN, `${GATE_RUN} || :`),
            gateDiffers,
        ],
        [
            "gate swallows failure with ; exit 0",
            () => mutate(GATE_RUN, `${GATE_RUN}; exit 0`),
            gateDiffers,
        ],
        [
            "gate step continue-on-error",
            () => mutate(GATE_NAME_LINE, `${GATE_NAME_LINE}\n${GRID}continue-on-error: true`),
            gateDiffers,
        ],
        [
            "gate step if: false",
            () => mutate(GATE_NAME_LINE, `${GATE_NAME_LINE}\n${GRID}if: false`),
            gateDiffers,
        ],
        [
            "gate step skipped by a composite false condition",
            () => mutate(GATE_NAME_LINE, `${GATE_NAME_LINE}\n${GRID}if: \${{ false && true }}`),
            gateDiffers,
        ],
        [
            "gate step bash shadowed through PATH",
            () =>
                mutate(
                    "              env:\n                  WEB_ENDPOINT_PROFILE_SCHEMA",
                    "              env:\n                  PATH: ${{ github.workspace }}/.github/noop-bin\n                  WEB_ENDPOINT_PROFILE_SCHEMA",
                ),
            gateDiffers,
        ],
        [
            "pin regex loosened with a decoy comment",
            () =>
                mutate("grep -Eq '^[0-9a-f]{40}$'", "grep -Eq '^[a-z0-9]+$' # [0-9a-f]{40} decoy"),
            shapeDiffers,
        ],
        [
            "pin regex weakened to accept any ref, decoy text left in an echo",
            () =>
                mutate(
                    "if ! printf '%s' \"$sha\" | grep -Eq '^[0-9a-f]{40}$'; then",
                    "echo \"grep -Eq '^[0-9a-f]{40}$'\" >/dev/null\n                  if ! printf '%s' \"$sha\" | grep -Eq '^[a-z0-9]+$'; then",
                ),
            shapeDiffers,
        ],
        [
            "pin-shape step swallows failure",
            () =>
                mutate(
                    "                    exit 1\n                  fi\n",
                    "                    exit 1\n                  fi\n                  true || :\n",
                ),
            shapeDiffers,
        ],
        [
            "pin-shape step deleted",
            () => mutate(SHAPE_NAME, "Something else entirely"),
            "pin-shape step missing",
        ],
        [
            "pin-resolvable step swallows failure",
            () =>
                mutate(
                    "                    exit 0\n",
                    "                    exit 0\n                  true || :\n",
                ),
            "pin-resolvable step differs",
        ],
        [
            "checkout ref rewired to a floating branch",
            () =>
                mutate(
                    "ref: ${{ steps.ops-contract-pin.outputs.sha }}\n                  path: .ops-contract",
                    "ref: main\n                  path: .ops-contract",
                ),
            checkoutDiffers,
        ],
        [
            "checkout ref floating, pin expression left in the step name",
            () =>
                mutate(
                    CHECKOUT_NAME_LINE,
                    `- name: "ref: \${{ steps.ops-contract-pin.outputs.sha }}"`,
                ).replace(
                    "ref: ${{ steps.ops-contract-pin.outputs.sha }}\n                  path: .ops-contract",
                    "ref: main\n                  path: .ops-contract",
                ),
            checkoutDiffers,
        ],
        [
            "checkout step skipped",
            () => mutate(CHECKOUT_NAME_LINE, `${CHECKOUT_NAME_LINE}\n${GRID}if: false`),
            checkoutDiffers,
        ],
        [
            "step inserted between checkout and gate",
            () =>
                mutate(
                    `            - name: ${GATE_NAME}`,
                    `            - run: echo "PATH=/tmp/shadow:$PATH" >> "$GITHUB_ENV"\n            - name: ${GATE_NAME}`,
                ),
            "pin gate steps are not consecutive",
        ],
        [
            "job env redirects PATH",
            () =>
                mutate(
                    "            WIRE_PARITY_OPS_ROOT: dev-health-ops-parity\n",
                    "            WIRE_PARITY_OPS_ROOT: dev-health-ops-parity\n            PATH: /tmp/shadow\n",
                ),
            "quality job env differs",
        ],
        [
            "workflow-level env added",
            () => mutate("\njobs:\n", "\nenv:\n    PATH: /tmp/shadow\n\njobs:\n"),
            "workflow has disallowed top-level key: env",
        ],
    ];

    it.each(controls)("negative control: %s", (_label, build, expected) => {
        const mutated = build();
        expect(mutated).not.toBe(real);
        expect(violations(mutated).join("\n")).toContain(expected);
    });
});
