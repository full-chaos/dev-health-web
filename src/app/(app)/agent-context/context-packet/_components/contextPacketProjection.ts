import type { ACRContextPacketV1 } from "@/lib/acr/generated";
import { SAMPLE_CONTEXT_PACKET } from "./samplePacket";

export type ContextPacketRequestForm = {
    readonly goal: string;
    readonly repository: string;
    readonly branchOrCommit: string;
    readonly taskReference: string;
};

const REPOSITORY_PROJECTION_REASON =
    "No branch or commit was requested; packet is projected to the repository.";
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

function requestedScope(form: ContextPacketRequestForm): ACRContextPacketV1["requested_scope"] {
    const scope = form.branchOrCommit.trim();
    if (!scope) {
        return form.taskReference ? { task_ref: form.taskReference } : {};
    }
    const scopeField = COMMIT_SHA_PATTERN.test(scope) ? { commit_sha: scope } : { branch: scope };
    return form.taskReference ? { ...scopeField, task_ref: form.taskReference } : scopeField;
}

function resolvedScope(form: ContextPacketRequestForm): ACRContextPacketV1["resolved_scope"] {
    const scope = form.branchOrCommit.trim();
    const repository = {
        repo_id: SAMPLE_CONTEXT_PACKET.resolved_scope.repo_id,
        repo_slug: form.repository,
    };
    if (!scope) {
        return {
            ...repository,
            resolution: "repo_fallback",
            fallback_reasons: [REPOSITORY_PROJECTION_REASON],
        };
    }
    if (COMMIT_SHA_PATTERN.test(scope)) {
        return {
            ...repository,
            commit_sha: scope,
            resolution: "exact_commit",
            fallback_reasons: [],
        };
    }
    return {
        ...repository,
        branch: scope,
        resolution: "branch_filtered",
        fallback_reasons: [],
    };
}

export function projectContextPacket(form: ContextPacketRequestForm): ACRContextPacketV1 {
    return {
        ...SAMPLE_CONTEXT_PACKET,
        goal: form.goal,
        repository: { ...SAMPLE_CONTEXT_PACKET.repository, slug: form.repository },
        requested_scope: requestedScope(form),
        resolved_scope: resolvedScope(form),
    };
}
