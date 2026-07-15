import { describe, expect, it } from "vitest";
import { projectContextPacket } from "./contextPacketProjection";

const baseForm = {
    goal: "Inspect repository access boundaries",
    repository: "full-chaos/dev-health-acr",
    taskReference: "CHAOS-2924",
};

describe("projectContextPacket", () => {
    it("projects a branch request into matching requested and resolved scopes", () => {
        const packet = projectContextPacket({ ...baseForm, branchOrCommit: "release/acr-v1" });

        expect(packet.requested_scope).toMatchObject({
            branch: "release/acr-v1",
            task_ref: "CHAOS-2924",
        });
        expect(packet.requested_scope.commit_sha).toBeUndefined();
        expect(packet.resolved_scope).toMatchObject({
            repo_slug: "full-chaos/dev-health-acr",
            branch: "release/acr-v1",
            resolution: "branch_filtered",
            fallback_reasons: [],
        });
        expect(packet.resolved_scope.commit_sha).toBeUndefined();
    });

    it("projects a commit request into matching requested and resolved scopes", () => {
        const packet = projectContextPacket({ ...baseForm, branchOrCommit: "22e472d" });

        expect(packet.requested_scope).toMatchObject({
            commit_sha: "22e472d",
            task_ref: "CHAOS-2924",
        });
        expect(packet.requested_scope.branch).toBeUndefined();
        expect(packet.resolved_scope).toMatchObject({
            repo_slug: "full-chaos/dev-health-acr",
            commit_sha: "22e472d",
            resolution: "exact_commit",
            fallback_reasons: [],
        });
        expect(packet.resolved_scope.branch).toBeUndefined();
    });

    it("clears scope fields and records repository projection when scope is removed", () => {
        const packet = projectContextPacket({ ...baseForm, branchOrCommit: "", taskReference: "" });

        expect(packet.requested_scope).toEqual({});
        expect(packet.resolved_scope).toMatchObject({
            repo_slug: "full-chaos/dev-health-acr",
            resolution: "repo_fallback",
            fallback_reasons: [
                "No branch or commit was requested; packet is projected to the repository.",
            ],
        });
        expect(packet.resolved_scope.branch).toBeUndefined();
        expect(packet.resolved_scope.commit_sha).toBeUndefined();
    });
});
