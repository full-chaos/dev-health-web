import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { AcrCapabilities } from "./client";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";

const canonicalRepositorySlug = z
    .string()
    .trim()
    .max(512)
    .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u);

const contextPacketFormSchema = z
    .object({
        branch: z.string().trim().max(512).optional(),
        branchOrCommit: z.string().trim().max(512).optional(),
        commitSha: z
            .string()
            .trim()
            .regex(/^[0-9a-f]{7,64}$/iu)
            .optional(),
        goal: z.string().trim().min(1).max(4_000),
        repository: canonicalRepositorySlug,
        taskReference: z.string().trim().max(1_024).optional(),
    })
    .strict();

const evidenceSelectionSchema = z
    .object({
        evidenceRefId: z
            .string()
            .trim()
            .min(8)
            .max(256)
            .regex(/^[A-Za-z0-9._-]+$/u),
        repository: canonicalRepositorySlug,
    })
    .strict();

export type ContextPacketForm = z.infer<typeof contextPacketFormSchema>;
export type EvidenceSelection = z.infer<typeof evidenceSelectionSchema>;

type PacketLimits = Pick<
    AcrCapabilities["limits"],
    "max_items" | "max_output_tokens" | "max_serialized_bytes"
>;

function parseAtBoundary<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.invalidRequest,
            "The context request is invalid.",
            { status: 400 },
        );
    }
    return parsed.data;
}

export function parseContextPacketForm(value: unknown): ContextPacketForm {
    return parseAtBoundary(contextPacketFormSchema, value);
}

export function parseEvidenceSelection(value: unknown): EvidenceSelection {
    return parseAtBoundary(evidenceSelectionSchema, value);
}

export function contextPacketRequest(
    form: ContextPacketForm,
    limits: PacketLimits,
    includeDebug = false,
): object {
    const implicitCommit = /^[0-9a-f]{7,64}$/iu.test(form.branchOrCommit ?? "")
        ? form.branchOrCommit
        : undefined;
    const commit = form.commitSha ?? implicitCommit;
    const branch = form.branch ?? (commit === undefined ? form.branchOrCommit : undefined);
    const scope = commit === undefined ? (branch ? { branch } : {}) : { commit_sha: commit };
    return {
        client: { name: "dev-health-web", version: "0.1.0" },
        goal: form.goal,
        options: {
            include_debug: includeDebug,
            include_low_confidence: false,
            max_items: Math.min(30, limits.max_items),
            max_output_tokens: Math.min(4_000, limits.max_output_tokens),
            max_serialized_bytes: Math.min(262_144, limits.max_serialized_bytes),
        },
        repository: { slug: form.repository },
        request_id: randomUUID(),
        schema_version: "context_packet_request.v1",
        scope: { ...scope, ...(form.taskReference ? { task_ref: form.taskReference } : {}) },
    };
}
