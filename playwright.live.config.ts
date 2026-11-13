import { defineConfig } from "@playwright/test";
import { nextDevNodeOptions } from "./ci/next-dev-env";

const guided =
    process.env.LIVE_GUIDED_ONBOARDING === "true" || process.env.LIVE_GUIDED_ONBOARDING === "1";

// The auth journeys tier: UI sign-in and recovery against auth-service, in their own job (the per-address login limit).
const authJourneys =
    process.env.LIVE_AUTH_JOURNEYS === "true" || process.env.LIVE_AUTH_JOURNEYS === "1";
const AUTH_JOURNEY_SPECS = /auth-(signin|recovery)-live\.spec\.ts/;

// The auth SSO tier: OIDC and SAML sign-in through the ops IdP stand-in, in its own job (enable-sso edits the stack).
const authSso = process.env.LIVE_AUTH_SSO === "true" || process.env.LIVE_AUTH_SSO === "1";
const AUTH_SSO_SPECS = /auth-sso-live\.spec\.ts/;

// The auth social tier: GitHub sign-in through the ops provider stand-in, in its own job (enable-social edits the runner's
// hosts file and binds :443).
const authSocial = process.env.LIVE_AUTH_SOCIAL === "true" || process.env.LIVE_AUTH_SOCIAL === "1";
const AUTH_SOCIAL_SPECS = /auth-social-live\.spec\.ts/;

const liveBackendUrl =
    process.env.PLAYWRIGHT_LIVE_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

// CHAOS-11933: the Ask Dev Phase 1 live acceptance suite (tests/live/ask-dev). It runs against a
// deployed stack (web, ACR, data), so it starts no server and is not part of the CI tier.
const askDev = process.env.LIVE_ASK_DEV === "true" || process.env.LIVE_ASK_DEV === "1";
const askDevWeb = process.env.ASK_DEV_LIVE_WEB ?? "http://localhost:3000";

// The web decisions passes: the Next server runs with the PDP decision client on its own, with the switch sets prod runs (F11).
// "enforce" and "classes-enforce" = AUTHZ_PLATFORM_UI=shadow + AUTHZ_DECISIONS_ENFORCE=on (prod after F11 step 4: the PDP decides);
// "shadow", "classes-legacy" and "classes-rollback" = AUTHZ_PLATFORM_UI=shadow alone (prod after step 3, and after a step 4
// rollback: legacy rules decide, the PDP verdict is only logged). tests/live/web-decisions.spec.ts runs in "enforce" and "shadow";
// tests/live/web-decisions-classes.spec.ts in the three classes passes; tests/live/web-decisions-admin-users.spec.ts in
// "admin-users-legacy" (shadow alone) and "admin-users-enforce" (shadow + enforce). The web log (JSON lines) is read by the specs.
const DECISION_MODES = [
    "enforce",
    "shadow",
    "classes-legacy",
    "classes-enforce",
    "classes-rollback",
    "admin-users-legacy",
    "admin-users-enforce",
] as const;
const webDecisions = process.env.LIVE_WEB_DECISIONS;
if (webDecisions !== undefined && !(DECISION_MODES as readonly string[]).includes(webDecisions)) {
    throw new Error(`LIVE_WEB_DECISIONS must be one of ${DECISION_MODES.join(", ")}`);
}
const decisionsEnforced =
    webDecisions === "enforce" ||
    webDecisions === "classes-enforce" ||
    webDecisions === "admin-users-enforce";
const decisionsSpec = webDecisions?.startsWith("classes-")
    ? /web-decisions-classes\.spec\.ts/
    : webDecisions?.startsWith("admin-users-")
      ? /web-decisions-admin-users\.spec\.ts/
      : /web-decisions\.spec\.ts/;
// The web server log: always for the decisions pass (the spec reads it), and for any other pass that names LIVE_WEB_LOG
// (kept as a CI artifact, so a failed sign-in shows its auth-session branch line).
const webServerLog =
    process.env.LIVE_WEB_LOG ?? (webDecisions ? "web-decisions-logs/web-server.log" : undefined);

export default defineConfig({
    testDir: "./tests/live",
    reporter: [
        ["html"],
        ["list"],
        // Read by ci/live-e2e-skip-gate.mjs: a skipped test fails the CI tier (CHAOS-12138).
        [
            "json",
            { outputFile: process.env.LIVE_E2E_JSON ?? "playwright-report/live-results.json" },
        ],
    ],
    // Two passes: the default backend auto-creates an org on register, the guided pass runs the
    // orgless journey (tests tagged @guided) against a backend started with
    // AUTH_AUTO_CREATE_ORG_ON_REGISTER=false.
    ...(askDev
        ? {}
        : webDecisions
          ? { grep: new RegExp(`@${webDecisions}`) }
          : guided
            ? { grep: /@guided/ }
            : { grepInvert: /@guided/ }),
    /* Run onboarding-ui first — it exercises the browser signup form and is
     sensitive to the backend's 3-per-hour register rate limit. */
    projects: authSso
        ? [
              {
                  name: "auth-sso",
                  testMatch: AUTH_SSO_SPECS,
                  timeout: 180_000,
                  // The IdP stand-in serves a job-local CA certificate; assertions and codes appear in page URLs, so no
                  // browser artifact is kept.
                  use: {
                      baseURL: "http://localhost:3002",
                      headless: true,
                      ignoreHTTPSErrors: true,
                      trace: "off",
                      screenshot: "off",
                      video: "off",
                  },
              },
          ]
        : authSocial
          ? [
                {
                    name: "auth-social",
                    testMatch: AUTH_SOCIAL_SPECS,
                    timeout: 120_000,
                    // Authorization codes and state appear in page URLs; never capture browser artifacts in this tier.
                    use: {
                        baseURL: "http://localhost:3002",
                        headless: true,
                        trace: "off",
                        screenshot: "off",
                        video: "off",
                    },
                },
            ]
          : authJourneys
            ? [
                  {
                      name: "auth-journeys",
                      testMatch: AUTH_JOURNEY_SPECS,
                      timeout: 120_000,
                      // Reset tokens appear in page URLs; never capture browser artifacts in this tier.
                      use: {
                          baseURL: "http://127.0.0.1:3002",
                          headless: true,
                          trace: "off",
                          screenshot: "off",
                          video: "off",
                      },
                  },
              ]
            : webDecisions
              ? [
                    {
                        name: `web-decisions-${webDecisions}`,
                        testMatch: decisionsSpec,
                        timeout:
                            webDecisions?.startsWith("classes-") ||
                            webDecisions?.startsWith("admin-users-")
                                ? 300_000
                                : 120_000,
                        use: { baseURL: "http://127.0.0.1:3002", headless: true },
                    },
                ]
              : askDev
                ? [
                      {
                          name: "ask-dev-live",
                          testMatch: /ask-dev\/.*\.spec\.ts/,
                          timeout: 120_000,
                          // No screenshot, trace or video: bearers are on these pages.
                          use: {
                              baseURL: askDevWeb,
                              headless: true,
                              ignoreHTTPSErrors: true,
                              screenshot: "off",
                              trace: "off",
                              video: "off",
                          },
                      },
                  ]
                : [
                      {
                          name: "onboarding-ui",
                          testMatch: /onboarding-ui\.spec\.ts/,
                          use: { baseURL: "http://127.0.0.1:3002", headless: true },
                      },
                      {
                          name: "live-api",
                          testIgnore: [
                              /onboarding-ui\.spec\.ts/,
                              /impersonation\.spec\.ts/,
                              /ask-dev\/.*\.spec\.ts/,
                              /web-decisions(-classes|-admin-users)?\.spec\.ts/,
                              AUTH_JOURNEY_SPECS,
                              AUTH_SSO_SPECS,
                              AUTH_SOCIAL_SPECS,
                          ],
                          dependencies: ["onboarding-ui"],
                          use: { baseURL: "http://127.0.0.1:3002", headless: true },
                      },
                      // CHAOS-13327: an impersonation session scopes EVERY token of the shared superuser
                      // to the target's org while it is live, so the spec that starts one runs alone,
                      // after every other live spec.
                      {
                          name: "live-impersonation",
                          testMatch: /impersonation\.spec\.ts/,
                          dependencies: ["live-api"],
                          use: { baseURL: "http://127.0.0.1:3002", headless: true },
                      },
                  ],
    // One stack, shared state and a real ACR: one worker, in order.
    ...(askDev || webDecisions || authJourneys || authSso || authSocial ? { workers: 1 } : {}),
    webServer: askDev
        ? []
        : [
              {
                  command:
                      `${process.env.LIVE_E2E_WEB_WRAPPER ?? ""} npm run dev -- --hostname 127.0.0.1 --port 3002${
                          webServerLog ? ` > ${webServerLog} 2>&1` : ""
                      }`.trim(),
                  url: "http://127.0.0.1:3002",
                  reuseExistingServer: !process.env.CI && !webDecisions,
                  timeout: 120_000,
                  env: {
                      NODE_OPTIONS: nextDevNodeOptions(),
                      PLAYWRIGHT_TEST: "true",
                      BACKEND_URL: liveBackendUrl,
                      // The Next proxy has its own register limiter (5/hour per IP, fail-closed) that answered
                      // 429 to the browser signup test in CI (CHAOS-12138). The test-mode bypass is the same
                      // one the other playwright configs use; the backend limiter is still in the path.
                      DEV_HEALTH_TEST_MODE: "true",
                      NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                      ...(guided ? { NEXT_PUBLIC_GUIDED_ONBOARDING: "true" } : {}),
                      ...(webDecisions ? { AUTHZ_PLATFORM_UI: "shadow" } : {}),
                      ...(decisionsEnforced ? { AUTHZ_DECISIONS_ENFORCE: "on" } : {}),
                      ...(webDecisions ? { LOG_FORMAT: "json", LOG_LEVEL: "info" } : {}),
                  },
              },
          ],
});
