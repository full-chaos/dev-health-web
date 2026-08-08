import { defineConfig } from "@playwright/test";

/**
 * CHAOS-3219 Phase 4 Lane 4d — Context Fabric Validation access matrix.
 *
 * Follows the armed-or-throw precedent set by
 * `playwright.ask-dev-acceptance.config.ts`: this file throws during
 * configuration unless the canonical Ops Compose launcher supplied every
 * variable below. The Phase 4 plan's closing constraint is that all Phase-4
 * specs run against the Compose stack via the launcher, never against dev
 * mocks — and a gate that quietly degrades to mocks, or quietly runs nothing,
 * is worse than no gate because it reads as coverage.
 *
 * Two separate properties are enforced here, and they are NOT the same thing:
 *
 *  - ARMING (this file): the run was configured against a real Compose stack.
 *  - EXECUTION (`Wave4ExecutedCountReporter`): the run actually measured
 *    something. A config that throws correctly but is never invoked by CI is
 *    still zero coverage; a config that is invoked but matches no tests exits 0.
 *    Only the reporter can catch the second case.
 *
 * Neither property implies CI invocation. Wiring this config into a workflow is
 * Phase 5 Lane 5c's deliverable, and until that lands this suite produces no
 * release evidence — see CHAOS-3510's dependency note.
 */

function requireArmed(name: string, expected: string, remedy: string): void {
    if (process.env[name] !== expected) {
        throw new Error(
            `Ask Dev Wave 4 access matrix was not armed: ${name} must be exactly "${expected}". ` +
                `${remedy} This gate must never skip silently.`,
        );
    }
}

function requireNonEmpty(name: string, remedy: string): void {
    if (!process.env[name]?.trim()) {
        throw new Error(`Ask Dev Wave 4 access matrix requires ${name}. ${remedy}`);
    }
}

requireArmed(
    "ASK_DEV_LIVE_ACCEPTANCE",
    "1",
    "Run the canonical Ops acceptance launcher (scripts/acceptance/run_ask_dev_compose.sh).",
);
requireArmed(
    "ASK_DEV_COMPOSE_WEB_READY",
    "1",
    "The Web service must be the Compose-booted one; a separately started Web process is not release evidence.",
);
requireArmed(
    "ASK_DEV_WAVE4_ACCESS_MATRIX",
    "1",
    "This lane is armed independently of the Phase 1 acceptance spec so a launcher that predates it cannot appear to have run it.",
);

// The access matrix creates and signs in as real non-superadmin identities
// against the live Ops API. Without these it would silently fall back to the
// helper defaults and prove the matrix for the wrong tenant.
requireNonEmpty(
    "TEST_SUPERUSER_EMAIL",
    "The seeded platform admin is the only actor permitted to provision the matrix's other identities.",
);
requireNonEmpty("TEST_SUPERUSER_PASSWORD", "Supplied by the Ops acceptance launcher.");
requireNonEmpty(
    "PLAYWRIGHT_LIVE_BACKEND_URL",
    "The matrix provisions identities and reads capabilities over the real Ops REST API, not through the browser only.",
);

// ACR arming must be DECLARED, not inferred. Entitlement non-coupling is the
// claim that Ask Dev availability does not depend on ACR being enabled; a run
// that does not know which side of that toggle it is on cannot assert it, and
// would happily "prove" non-coupling while never varying the variable. "0" and
// "1" are both valid — silence is not.
if (!["0", "1"].includes(process.env.ASK_DEV_ACCEPTANCE_ACR ?? "")) {
    throw new Error(
        'Ask Dev Wave 4 access matrix requires ASK_DEV_ACCEPTANCE_ACR to be exactly "0" or "1". ' +
            "The entitlement non-coupling rows assert against the declared ACR arming state; an " +
            "undeclared one would let the suite pass without ever knowing what it tested.",
    );
}

// Written by prepare_ask_dev_acceptance.py's provision_multi_org() — carries
// primary_org_id, second_org_id and disabled_entitlement_org_id under
// schema_version "ask_dev_acceptance_org_ids.v1". The entitlement rows read the
// deliberately-unentitled org from here rather than mutating the primary org's
// policy, so entitlement and the emergency kill switch stay distinguishable.
requireNonEmpty(
    "ASK_DEV_ACCEPTANCE_ORG_IDS",
    "Point it at the launcher's ASK_DEV_ACCEPTANCE_ORG_IDS_OUTPUT artifact (default /tmp/ask-dev-acceptance-org-ids.json).",
);

const RESULTS_DIRECTORY =
    process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/ask-dev-wave4";
const HTML_REPORT_DIRECTORY =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/ask-dev-wave4";
const JUNIT_PATH = process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ?? `${RESULTS_DIRECTORY}/junit.xml`;

export default defineConfig({
    testDir: "./tests/live",
    testMatch: /ask-dev-wave4-access-matrix\.spec\.ts/,
    outputDir: RESULTS_DIRECTORY,
    reporter: [
        ["list"],
        ["junit", { outputFile: JUNIT_PATH }],
        ["html", { open: "never", outputFolder: HTML_REPORT_DIRECTORY }],
        // Last, so its verdict is the one that decides the exit code. Proven
        // load-bearing: with an all-skipped suite Playwright exits 0 and this
        // reporter is the only thing that turns it into a 1.
        ["./tests/live/wave4ExecutedCountReporter.ts"],
    ],
    fullyParallel: false,
    workers: 1,
    // A release gate must not launder a real failure into a pass by retrying.
    retries: 0,
    // Matrix rows provision users and orgs over the live API before asserting.
    timeout: 120_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: process.env.ASK_DEV_ACCEPTANCE_WEB_URL ?? "http://127.0.0.1:3002",
        headless: true,
        // Kept unconditionally: this suite's artifacts are the evidence bundle
        // for acceptance groups 6 and 7, not just failure triage.
        trace: "on",
        screenshot: "only-on-failure",
    },
});
