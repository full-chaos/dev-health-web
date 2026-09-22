import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { signWebAssertion } from "./assertion";
import type { AcrRuntimeConfig } from "./config";
import { validateAcrContract } from "./contracts";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";
import { fetchBoundedJson } from "./http";
import type { OpsAuthorization } from "./ops";

const capabilitiesSchema = z
    .object({
        enabled_tools: z.array(z.enum(["context_for_task", "source_evidence", "record_episode"])),
        entitlements: z.object({ agent_context_runtime: z.boolean() }).strict(),
        limits: z
            .object({
                max_items: z.number().int().positive(),
                max_output_tokens: z.number().int().positive(),
                max_serialized_bytes: z.number().int().positive(),
                requests_per_minute: z.number().int().positive(),
            })
            .strict(),
        permissions: z
            .object({
                context_read: z.boolean(),
                episode_write: z.boolean(),
                evidence_read: z.boolean(),
            })
            .strict(),
        schema_version: z.literal("capabilities.v1"),
        service: z.literal("dev-health-acr"),
        supported_schema_versions: z.array(z.string()).min(1),
    })
    .loose();

export type AcrCapabilities = z.infer<typeof capabilitiesSchema>;

type UpstreamErrorMapper = (
    status: number,
    wireErrorCode?: string,
    retryAfterSeconds?: number,
) => AcrRuntimeError;

type AcrRequest = {
    readonly authorization: OpsAuthorization;
    readonly body?: string;
    readonly errorMapper?: UpstreamErrorMapper;
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly permissions: readonly ("context:read" | "credential:issue" | "evidence:read")[];
    readonly signal: AbortSignal;
};

type ContextPacketRequest = {
    readonly authorization: OpsAuthorization;
    readonly body: string;
    readonly signal: AbortSignal;
};

type EvidenceRequest = {
    readonly authorization: OpsAuthorization;
    readonly evidenceRefId: string;
    readonly signal: AbortSignal;
};

type DeviceApprovalRequest = {
    readonly authorization: OpsAuthorization;
    readonly body: string;
    readonly signal: AbortSignal;
};

type OAuthConsentRequest = {
    readonly authorization: OpsAuthorization;
    readonly body: string;
    readonly signal: AbortSignal;
};

const deviceApprovalResponseSchema = z
    .object({
        schema_version: z.literal("device_approval_response.v1"),
        status: z.literal("approved"),
    })
    .strict();

const deviceApprovalPreviewResponseSchema = z
    .object({
        organization_id_hint: z.string().min(1).max(128).optional(),
        schema_version: z.literal("device_approval_preview_response.v1"),
        repository_hints: z.array(z.string()).default([]),
    })
    .strict();

const oauthConsentPreviewResponseSchema = z
    .object({
        client_kind: z.string().min(1),
        client_name: z.string(),
        client_self_asserted: z.boolean(),
        expires_at: z.string().min(1),
        redirect_origin: z.string().min(1),
        resource: z.string().min(1),
        scopes: z.array(z.string()),
    })
    .strict();

export type OAuthConsentPreview = {
    readonly clientKind: string;
    readonly clientName: string;
    readonly clientSelfAsserted: boolean;
    readonly expiresAt: string;
    readonly redirectOrigin: string;
    readonly resource: string;
    readonly scopes: readonly string[];
};

const oauthConsentDecisionResponseSchema = z.object({ redirect_url: z.string().min(1) }).strict();

function clientUrl(config: AcrRuntimeConfig, path: string): URL {
    const url = new URL(path, config.apiOrigin);
    if (url.origin !== config.apiOrigin.origin || url.search !== "" || url.hash !== "") {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.configuration,
            "Agent Context Runtime is not configured.",
        );
    }
    return url;
}

// CHAOS-3791 prep: reads only the closed `error.code` enum from an
// already schema-validated body, never `message`/`details` — matches the
// existing "without exposing the upstream body" boundary in upstreamFailure.
const upstreamErrorCodeSchema = z.object({ error: z.object({ code: z.string() }).loose() }).loose();

function upstreamFailure(
    status: number,
    wireErrorCode?: string,
    retryAfterSeconds?: number,
): AcrRuntimeError {
    if (status === 401) {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.unauthenticated,
            "Authentication is required.",
            { status },
        );
    }
    if (status === 404) {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.repositoryNotAvailable,
            "The requested context is not available.",
            { status },
        );
    }
    if (status === 426) {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.incompatible,
            "Agent Context Runtime needs a compatible service version.",
            { status },
        );
    }
    if (status === 429) {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.upstream,
            "Agent Context Runtime is temporarily busy.",
            { retryable: true, retryAfterSeconds, status },
        );
    }
    // error.v1 (CHAOS-3784): both codes are always retryable: true. Hardcoded
    // here rather than trusting the wire body's own `retryable` field — web
    // decides retry policy from the closed code, not from upstream input.
    if (status === 422 && wireErrorCode === "interpretation_rejected") {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.interpretationRejected,
            "Agent Context Runtime rejected the interpretation step.",
            { retryable: true, status },
        );
    }
    if (status === 422 && wireErrorCode === "synthesis_rejected") {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.synthesisRejected,
            "Agent Context Runtime rejected the synthesis step.",
            { retryable: true, status },
        );
    }
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.upstream,
        "Agent Context Runtime is temporarily unavailable.",
        { retryable: status >= 500, status },
    );
}

// OAuth consent (CHAOS-6226): the wire codes at 400/409/410/429 mean something
// specific to a handle's lifecycle, distinct enough from the generic upstream
// fallback that the consent page needs to tell them apart to render the right
// state (429 in particular stays interactive with a wait time, never a
// terminal one). Everything else still falls through to upstreamFailure.
function oauthConsentFailure(
    status: number,
    wireErrorCode?: string,
    retryAfterSeconds?: number,
): AcrRuntimeError {
    if (status === 400) {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.invalidRequest,
            "The authorization request is invalid.",
            { status },
        );
    }
    if (status === 409) {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.alreadyCompleted,
            "This request was already completed.",
            { status },
        );
    }
    if (status === 429) {
        // ACR wire body: {"error":"slow_down"}, per-handle limit 20/min.
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.rateLimited,
            "Too many attempts. Please wait and try again.",
            { retryable: true, retryAfterSeconds, status },
        );
    }
    if (status === 410) {
        return new AcrRuntimeError(acrRuntimeErrorCodes.expired, "This request has expired.", {
            status,
        });
    }
    return upstreamFailure(status, wireErrorCode, retryAfterSeconds);
}

function ensureCapabilities(capabilities: AcrCapabilities): void {
    const schemas = capabilities.supported_schema_versions;
    if (
        !capabilities.entitlements.agent_context_runtime ||
        !capabilities.permissions.context_read ||
        !capabilities.permissions.evidence_read ||
        !capabilities.enabled_tools.includes("context_for_task") ||
        !capabilities.enabled_tools.includes("source_evidence") ||
        !schemas.includes("context_packet.v1") ||
        !schemas.includes("context_packet_request.v1") ||
        !schemas.includes("expanded_evidence.v1") ||
        capabilities.limits.max_output_tokens < 500 ||
        capabilities.limits.max_serialized_bytes < 8_192
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.incompatible,
            "Agent Context Runtime needs a compatible service version.",
            { status: 426 },
        );
    }
}

export class AcrRuntimeClient {
    constructor(private readonly config: AcrRuntimeConfig) {}

    async capabilities(
        input: Omit<AcrRequest, "body" | "method" | "path" | "permissions">,
    ): Promise<AcrCapabilities> {
        const value = await this.request({
            ...input,
            method: "GET",
            path: "/api/v1/agent-context/capabilities",
            permissions: ["context:read", "evidence:read"],
        });
        if (!validateAcrContract("capabilities.v1.schema.json", value).valid) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        const parsed = capabilitiesSchema.safeParse(value);
        if (!parsed.success) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        ensureCapabilities(parsed.data);
        return parsed.data;
    }

    async contextPacket(input: ContextPacketRequest): Promise<unknown> {
        const value = await this.request({
            ...input,
            method: "POST",
            path: "/api/v1/agent-context/context-packets",
            permissions: ["context:read"],
        });
        if (!validateAcrContract("context_packet.v1.schema.json", value).valid) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        return value;
    }

    async evidence(input: EvidenceRequest): Promise<unknown> {
        const value = await this.request({
            ...input,
            method: "GET",
            path: `/api/v1/agent-context/evidence/${encodeURIComponent(input.evidenceRefId)}`,
            permissions: ["evidence:read"],
        });
        if (!validateAcrContract("expanded_evidence.v1.schema.json", value).valid) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        return value;
    }

    async deviceApproval(input: DeviceApprovalRequest): Promise<{ readonly status: "approved" }> {
        const value = await this.request({
            ...input,
            method: "POST",
            path: "/api/v1/oauth/device_approval",
            permissions: ["credential:issue"],
        });
        const parsed = deviceApprovalResponseSchema.safeParse(value);
        if (!parsed.success) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        return { status: parsed.data.status };
    }

    async deviceApprovalPreview(input: DeviceApprovalRequest): Promise<{
        readonly organizationIdHint?: string;
        readonly repositoryHints: readonly string[];
    }> {
        const value = await this.request({
            ...input,
            method: "POST",
            path: "/api/v1/oauth/device_approval",
            permissions: ["credential:issue"],
        });
        const parsed = deviceApprovalPreviewResponseSchema.safeParse(value);
        if (!parsed.success) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        return {
            ...(parsed.data.organization_id_hint === undefined
                ? {}
                : { organizationIdHint: parsed.data.organization_id_hint }),
            repositoryHints: parsed.data.repository_hints,
        };
    }

    async oauthConsentPreview(input: OAuthConsentRequest): Promise<OAuthConsentPreview> {
        const value = await this.request({
            ...input,
            errorMapper: oauthConsentFailure,
            method: "POST",
            path: "/authorize/consent",
            permissions: ["credential:issue"],
        });
        const parsed = oauthConsentPreviewResponseSchema.safeParse(value);
        if (!parsed.success) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        return {
            clientKind: parsed.data.client_kind,
            clientName: parsed.data.client_name,
            clientSelfAsserted: parsed.data.client_self_asserted,
            expiresAt: parsed.data.expires_at,
            redirectOrigin: parsed.data.redirect_origin,
            resource: parsed.data.resource,
            scopes: parsed.data.scopes,
        };
    }

    async oauthConsentDecide(
        input: OAuthConsentRequest,
    ): Promise<{ readonly redirectUrl: string }> {
        const value = await this.request({
            ...input,
            errorMapper: oauthConsentFailure,
            method: "POST",
            path: "/authorize/consent",
            permissions: ["credential:issue"],
        });
        const parsed = oauthConsentDecisionResponseSchema.safeParse(value);
        if (!parsed.success) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        // Passed through unchanged — ACR is the only party allowed to build it.
        return { redirectUrl: parsed.data.redirect_url };
    }

    private async request(input: AcrRequest): Promise<unknown> {
        const body = input.body ?? "";
        const response = await fetchBoundedJson({
            body: input.body,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-ACR-Client-Version": "0.1.0",
                "X-ACR-Web-Assertion": signWebAssertion({
                    body,
                    config: this.config,
                    method: input.method,
                    orgId: input.authorization.orgId,
                    path: input.path,
                    permissions: input.permissions,
                    privateKey: this.config.privateKey,
                    repositoryScopes: input.authorization.repositoryScopes,
                    subject: input.authorization.subject,
                }),
                "X-Request-ID": randomUUID(),
            },
            method: input.method,
            signal: input.signal,
            timeoutMs: this.config.timeoutMs,
            url: clientUrl(this.config, input.path),
        });
        if (response.status >= 200 && response.status < 300) return response.value;
        if (!validateAcrContract("error.v1.schema.json", response.value).valid) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            );
        }
        const wireError = upstreamErrorCodeSchema.safeParse(response.value);
        const mapper = input.errorMapper ?? upstreamFailure;
        throw mapper(
            response.status,
            wireError.success ? wireError.data.error.code : undefined,
            response.retryAfterSeconds,
        );
    }
}
