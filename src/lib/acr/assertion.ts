import "server-only";

import { createHash, randomUUID, sign, type KeyObject } from "node:crypto";

import type { AcrRuntimeConfig } from "./config";

type AssertionPermission = "context:read" | "credential:issue" | "evidence:read";

/**
 * Provenance of a `credential:issue` assertion (CHAOS-12095). The web server derives both values
 * itself (`resolveIssuanceProvenance` in ./ops): `sessionId` from its own Ops session token,
 * `impersonating` from the Ops status read. A value the browser sent is never used. ACR parses
 * them as the `sid` and `impersonating` claims (CHAOS-12123).
 */
export type IssuanceProvenance = {
    readonly impersonating: boolean;
    readonly sessionId?: string;
};

type WebAssertionInput = {
    readonly body: string;
    readonly config: AcrRuntimeConfig;
    readonly method: "GET" | "POST";
    readonly now?: number;
    readonly orgId: string;
    readonly path: string;
    readonly permissions: readonly AssertionPermission[];
    readonly privateKey: KeyObject;
    /** `credential:issue` only; the claims are left out of every other assertion. */
    readonly provenance?: IssuanceProvenance;
    readonly repositoryScopes: readonly string[];
    readonly subject: string;
    /** Tests only: a fixed id makes the signature reproducible (Ed25519 is deterministic). */
    readonly jti?: string;
};

function encodeCompactJson(value: object): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function bodySha256(body: string): string {
    return createHash("sha256").update(body, "utf8").digest("base64url");
}

function provenanceClaims(
    provenance: IssuanceProvenance | undefined,
): Readonly<Record<string, boolean | string>> {
    if (provenance === undefined) return {};
    return provenance.sessionId === undefined
        ? { impersonating: provenance.impersonating }
        : { impersonating: provenance.impersonating, sid: provenance.sessionId };
}

export function signWebAssertion(input: WebAssertionInput): string {
    const issuedAt = input.now ?? Math.floor(Date.now() / 1_000);
    const header = encodeCompactJson({ alg: "EdDSA", kid: input.config.keyId, typ: "JWT" });
    const claims = encodeCompactJson({
        aud: input.config.audience,
        body_sha256: bodySha256(input.body),
        exp: issuedAt + 30,
        iat: issuedAt,
        iss: input.config.issuer,
        jti: input.jti ?? randomUUID(),
        method: input.method,
        nbf: issuedAt,
        org_id: input.orgId,
        path: input.path,
        permissions: [...input.permissions],
        repository_scopes: [...input.repositoryScopes],
        sub: input.subject,
        ...provenanceClaims(input.provenance),
    });
    const signingInput = `${header}.${claims}`;
    const signature = sign(null, Buffer.from(signingInput, "utf8"), input.privateKey).toString(
        "base64url",
    );
    return `${signingInput}.${signature}`;
}

/** The approver reference's header `typ`: neither the request assertion's nor an access token's. */
export const APPROVER_REFERENCE_TYPE = "web-approver+jwt";
/** Its audience: the authorize audience of auth-service, the policy decision point. */
export const APPROVER_REFERENCE_AUDIENCE = "auth-service";
export const APPROVER_REFERENCE_ACTION = "acr.credential.issue";
/** The decision point's principal_reference bound (authorization_request.v1). */
export const APPROVER_REFERENCE_MAX_LENGTH = 1_000;
export const APPROVER_REFERENCE_HEADER = "X-ACR-Approver-Reference";
/** The session.v1 wire form of a session id, the only `sid` the decision point accepts. */
const wireSessionIdPattern = /^ses_[A-Za-z0-9_-]{22}$/u;

type ApproverReferenceInput = {
    readonly config: AcrRuntimeConfig;
    readonly impersonating: boolean;
    readonly jti?: string;
    readonly now?: number;
    readonly orgId: string;
    readonly privateKey: KeyObject;
    /** The request assertion exactly as sent: `req` is the SHA-256 of these bytes. */
    readonly requestAssertion: string;
    readonly sessionId: string;
    readonly subject: string;
};

/**
 * The approver reference (CHAOS-13587): a second token the web server signs with the request
 * assertion's key for the two approval calls. ACR checks it against the request assertion and
 * forwards only it to the policy decision point, which reads the session live. Architecture:
 * docs/auth-acr-device-approval.md. `undefined` when the sid is not a session.v1 id or the token
 * would exceed the decision point's bound.
 */
export function signApproverReference(input: ApproverReferenceInput): string | undefined {
    if (!wireSessionIdPattern.test(input.sessionId)) return undefined;
    const issuedAt = input.now ?? Math.floor(Date.now() / 1_000);
    const header = encodeCompactJson({
        alg: "EdDSA",
        kid: input.config.keyId,
        typ: APPROVER_REFERENCE_TYPE,
    });
    const claims = encodeCompactJson({
        action: APPROVER_REFERENCE_ACTION,
        aud: APPROVER_REFERENCE_AUDIENCE,
        exp: issuedAt + 30,
        iat: issuedAt,
        impersonating: input.impersonating,
        iss: input.config.issuer,
        jti: input.jti ?? randomUUID(),
        nbf: issuedAt,
        org_id: input.orgId,
        req: createHash("sha256").update(input.requestAssertion, "utf8").digest("base64url"),
        sid: input.sessionId,
        sub: input.subject,
    });
    const signingInput = `${header}.${claims}`;
    const signature = sign(null, Buffer.from(signingInput, "utf8"), input.privateKey).toString(
        "base64url",
    );
    const reference = `${signingInput}.${signature}`;
    return reference.length <= APPROVER_REFERENCE_MAX_LENGTH ? reference : undefined;
}

/**
 * The longest approver reference this config can sign: the widest claim values (uuid sub and
 * org, a session.v1 sid) with the configured issuer and kid.
 */
export function approverReferenceWorstCaseLength(config: AcrRuntimeConfig): number {
    const base64Length = (value: object) =>
        Math.ceil((Buffer.byteLength(JSON.stringify(value), "utf8") * 4) / 3);
    const uuid = "00000000-0000-0000-0000-000000000000";
    const header = base64Length({ alg: "EdDSA", kid: config.keyId, typ: APPROVER_REFERENCE_TYPE });
    const claims = base64Length({
        action: APPROVER_REFERENCE_ACTION,
        aud: APPROVER_REFERENCE_AUDIENCE,
        exp: 9_999_999_999,
        iat: 9_999_999_999,
        impersonating: false,
        iss: config.issuer,
        jti: uuid,
        nbf: 9_999_999_999,
        org_id: uuid,
        req: "A".repeat(43),
        sid: `ses_${"A".repeat(22)}`,
        sub: uuid,
    });
    return header + 1 + claims + 1 + 86;
}
