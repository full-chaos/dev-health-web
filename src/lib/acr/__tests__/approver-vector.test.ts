// CHAOS-13587: the cross-implementation vector of the approver reference. This test RUNS the real
// signers (signWebAssertion, signApproverReference) with a fixed key, clock and ids; Ed25519 is
// deterministic, so the bytes are stable. It fails when the committed vector differs from what the
// signers emit now. ACR (pair check) and ops (policy decision point) verify the same file with their
// real Go verifiers. Refresh: UPDATE_VECTORS=1 pnpm vitest run src/lib/acr/__tests__/approver-vector.test.ts
import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { signApproverReference, signWebAssertion } from "../assertion";
import type { AcrRuntimeConfig } from "../config";

const VECTOR_FILE = join(__dirname, "vectors", "web-approver.v1.json");

// A test-only Ed25519 seed. Only its public key goes in the vector.
const SEED = Buffer.from("8f3c1a5e7b9d2f4a6c8e0b1d3f5a7c9e1b3d5f7a9c0e2b4d6f8a1c3e5b7d9f0a", "hex");
const privateKey = createPrivateKey({
    format: "der",
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), SEED]),
    type: "pkcs8",
});
const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });

const CLOCK = 1_800_000_000; // 2027-01-15T08:00:00Z
const KID = "web-test-1";
const config: AcrRuntimeConfig = {
    apiOrigin: new URL("https://acr.example.test"),
    audience: "acr-api",
    issuer: "https://www.fullchaos.dev",
    keyId: KID,
    privateKey,
    timeoutMs: 5_000,
};

// V1 shape: `sub` is the auth-service sign-in answer's user.id (ops userInfo: the canonical uuid of
// the principal id) and `sid` the session.v1 wire id (ops sessionid.Wire) of the Ops access token.
// Hand-shaped here; the ops vector cell checks both against the real ops builders.
const PRINCIPAL = {
    org_id: "3f9a1c77-2e4b-4d10-b5c8-6a7e9d0b1c23",
    session_uuid: "7d0c3e52-91b4-4f7a-8a63-0e5b9c2d4f10",
    sid: "ses_fQw-UpG0T3qKYw5bnC1PEA",
    user_id: "5e5510aa-6a1e-4c4e-9d3b-2b7f0c1a9e01",
} as const;

type Call = { readonly body: string; readonly path: string };

const DEVICE: Call = {
    body: JSON.stringify({
        repository_scopes: ["*"],
        schema_version: "device_approval_request.v1",
        user_code: "ALU23456",
    }),
    path: "/api/v1/oauth/device_approval",
};
const CONSENT: Call = {
    body: JSON.stringify({ action: "approve", handle: "H".repeat(43), repository_scopes: ["*"] }),
    path: "/authorize/consent",
};

function assertion(call: Call, jti: string): string {
    return signWebAssertion({
        body: call.body,
        config,
        jti,
        method: "POST",
        now: CLOCK,
        orgId: PRINCIPAL.org_id,
        path: call.path,
        permissions: ["credential:issue"],
        privateKey,
        repositoryScopes: ["*"],
        subject: PRINCIPAL.user_id,
    });
}

function reference(requestAssertion: string, jti: string, now = CLOCK): string {
    const signed = signApproverReference({
        config,
        impersonating: false,
        jti,
        now,
        orgId: PRINCIPAL.org_id,
        privateKey,
        requestAssertion,
        sessionId: PRINCIPAL.sid,
        subject: PRINCIPAL.user_id,
    });
    if (signed === undefined) throw new Error("the vector reference was not signed");
    return signed;
}

function buildVector(): string {
    const deviceAssertion = assertion(DEVICE, "00000000-0000-4000-8000-0000000000a1");
    const deviceReference = reference(deviceAssertion, "00000000-0000-4000-8000-0000000000b1");
    const consentAssertion = assertion(CONSENT, "00000000-0000-4000-8000-0000000000a2");
    const consentReference = reference(consentAssertion, "00000000-0000-4000-8000-0000000000b2");
    const lateReference = reference(
        deviceAssertion,
        "00000000-0000-4000-8000-0000000000b4",
        CLOCK + 5,
    );
    const cases = [
        {
            name: "V1 device approval pair",
            ...DEVICE,
            web_assertion: deviceAssertion,
            approver_reference: deviceReference,
            expect: { acr_pair: "accept", pdp_reference: "accept" },
        },
        {
            name: "V2 consent pair",
            ...CONSENT,
            web_assertion: consentAssertion,
            approver_reference: consentReference,
            expect: { acr_pair: "accept", pdp_reference: "accept" },
        },
        {
            name: "V3 reference of V1 with the assertion of V2: req differs",
            ...CONSENT,
            web_assertion: consentAssertion,
            approver_reference: deviceReference,
            expect: { acr_pair: "refuse", pdp_reference: "accept" },
        },
        {
            name: "V4 reference that outlives its assertion",
            ...DEVICE,
            web_assertion: deviceAssertion,
            approver_reference: lateReference,
            expect: { acr_pair: "refuse", pdp_reference: "accept" },
        },
        {
            name: "V5 the two tokens in each other's header",
            ...DEVICE,
            web_assertion: deviceReference,
            approver_reference: deviceAssertion,
            expect: { acr_pair: "refuse", pdp_reference: "refuse" },
        },
    ];
    const vector = {
        schema_version: "web_approver_vector.v1",
        source_repository: "full-chaos/dev-health-web",
        producer: "src/lib/acr/__tests__/approver-vector.test.ts",
        clock: CLOCK,
        issuer: config.issuer,
        assertion_audience: config.audience,
        jwks: { keys: [{ ...publicJwk, alg: "EdDSA", kid: KID, use: "sig" }] },
        principal: PRINCIPAL,
        method: "POST",
        cases,
    };
    return `${JSON.stringify(vector, null, 2)}\n`;
}

describe("approver reference vector", () => {
    it("is exactly what the real signers emit", () => {
        const built = buildVector();
        if (process.env.UPDATE_VECTORS === "1") writeFileSync(VECTOR_FILE, built);
        // Compared as JSON: the formatter may re-wrap the file; every token string must be equal.
        expect(JSON.parse(readFileSync(VECTOR_FILE, "utf8"))).toEqual(JSON.parse(built));
    });
});
