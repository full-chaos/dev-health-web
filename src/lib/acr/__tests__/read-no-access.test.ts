import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { Transport } from "@/lib/auth/authorize/client";

const seam = vi.hoisted(() => ({ transport: null as Transport | null }));
vi.mock("../authorizeTransport", () => ({ loadAuthorizeTransport: () => seam.transport }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { auth } from "@/lib/auth";
import { acrRuntimeErrorCodes } from "../errors";
import { createContextPacket, getExpandedEvidence } from "../service";

const server = setupServer();
const dirs: string[] = [];
const acr = { calls: 0 };
const SELECTED = "acme/repo-001";

const noAccessListing: Transport = async () => ({
    status: 200,
    body: JSON.stringify({
        schema_version: "authorization_decision.v1",
        decision_id: "dec_" + "A".repeat(26),
        organization_id: "org-123",
        policy_revision: 1,
        principal_id: "prn_abc",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        allowed: false,
        reason_code: "grant_absent",
    }),
});

function installServers(): void {
    server.use(
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
        http.post("http://ops.example.test/graphql", () =>
            HttpResponse.json({
                data: { catalog: { __typename: "CatalogResult", values: [] } },
            }),
        ),
        http.all("https://acr.example.test/*", () => {
            acr.calls += 1;
            return HttpResponse.json({}, { status: 500 });
        }),
    );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
    acr.calls = 0;
    const pair = generateKeyPairSync("ed25519");
    const dir = mkdtempSync(join(tmpdir(), "acr-noaccess-key-"));
    dirs.push(dir);
    const keyFile = join(dir, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    vi.stubEnv("ACR_API_ORIGIN", "https://acr.example.test");
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "5000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("BACKEND_URL", "http://ops.example.test");
    vi.mocked(auth).mockResolvedValue({
        access_token: "header.payload.signature-of-the-session-token",
        expires: "2026-07-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123" },
    });
    installServers();
    seam.transport = noAccessListing;
});
afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

type Call = (repository: string | null) => Promise<unknown>;
const signal = new AbortController().signal;
const routes: readonly [string, Call][] = [
    [
        "context",
        (repository) =>
            createContextPacket({
                body: { goal: "verify", ...(repository === null ? {} : { repository }) },
                signal,
            }),
    ],
    [
        "evidence",
        (repository) => getExpandedEvidence({ evidenceRefId: "evidence-123", repository, signal }),
    ],
];

describe.each([
    ["ACR_SCOPES_FROM_GRANTS on", "true"],
    ["ACR_SCOPES_FROM_GRANTS off (legacy)", "false"],
])("no-access reader, %s", (_name, flag) => {
    beforeEach(() => vi.stubEnv("ACR_SCOPES_FROM_GRANTS", flag));

    it.each(routes)(
        "%s read with a selected repository: 404 repository_not_available, 0 acr calls",
        async (_route, call) => {
            await expect(call(SELECTED)).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.repositoryNotAvailable,
                status: 404,
            });
            expect(acr.calls).toBe(0);
        },
    );

    it.each(routes)(
        "%s read without a selected repository: 400 invalid_request, 0 acr calls",
        async (_route, call) => {
            await expect(call(null)).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.invalidRequest,
                status: 400,
            });
            expect(acr.calls).toBe(0);
        },
    );
});
