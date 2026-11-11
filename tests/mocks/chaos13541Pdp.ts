/**
 * CHAOS-13541 consent screenshot: the workload-token exchange and the /v1/authorize answer the mock
 * server gives the web server of playwright.chaos-13541.config.ts. Delete with that config after the PR is merged.
 */
import path from "node:path";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/chaos-13541");

/** Byte-for-byte copy of ops 0369263dcc228913de5444508bcee46085e80aa1 contracts/auth/v1/examples/authorization_decision/decision-valid-reason-repository-allowlist-too-large.json. */
export const PDP_DECISION_FILE = path.join(
    FIXTURE_DIR,
    "decision-valid-reason-repository-allowlist-too-large.json",
);

export const WORKLOAD_SUBJECT_FILE = path.join(FIXTURE_DIR, "workload-subject.fake");
export const WORKLOAD_ISSUER = "https://workload.e2e.test";
export const WORKLOAD_AUDIENCE = "auth-service";
export const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
export const JWT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:jwt";

const base64url = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

/** The workload token the exchange issues: only its claims are read by the web server. */
export const WORKLOAD_TOKEN = [
    base64url(JSON.stringify({ alg: "none", typ: "JWT" })),
    base64url(
        JSON.stringify({
            iss: WORKLOAD_ISSUER,
            aud: WORKLOAD_AUDIENCE,
            principal_type: "workload",
        }),
    ),
    "chaos-13541-mock",
].join(".");
