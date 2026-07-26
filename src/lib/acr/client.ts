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

type AcrRequest = {
    readonly authorization: OpsAuthorization;
    readonly body?: string;
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

const deviceApprovalResponseSchema = z
    .object({
        schema_version: z.literal("device_approval_response.v1"),
        status: z.literal("approved"),
    })
    .strict();

const deviceApprovalPreviewResponseSchema = z
    .object({
        schema_version: z.literal("device_approval_preview_response.v1"),
        repository_hints: z.array(z.string()),
    })
    .strict();

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

function upstreamFailure(status: number): AcrRuntimeError {
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
            { retryable: true, status },
        );
    }
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.upstream,
        "Agent Context Runtime is temporarily unavailable.",
        { retryable: status >= 500, status },
    );
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

    async deviceApprovalPreview(
        input: DeviceApprovalRequest,
    ): Promise<{ readonly repositoryHints: readonly string[] }> {
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
        return { repositoryHints: parsed.data.repository_hints };
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
        throw upstreamFailure(response.status);
    }
}
