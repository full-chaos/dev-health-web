import { describe, expect, it } from "vitest";

import { prWorkflowRootId } from "../workflowRootId";

describe("prWorkflowRootId", () => {
    it("encodes the backend edge-id format exactly (repo:number)", () => {
        // ops work_graph/extractors/ai_workflow.py: pr_id = f"{repo_id}:{pr_number}".
        // A divergent scheme (e.g. "repo-2#1020") would silently match zero
        // edges in aiWorkflowDrilldown.
        expect(prWorkflowRootId("repo-2", 1020)).toBe("repo-2:1020");
        expect(prWorkflowRootId("repo-2", 1020)).not.toBe("repo-2#1020");
    });

    it("keeps UUID repo ids verbatim", () => {
        expect(prWorkflowRootId("0b6f9e1c-9a1a-4f4e-8c39-7a1d2e3f4a5b", 7)).toBe(
            "0b6f9e1c-9a1a-4f4e-8c39-7a1d2e3f4a5b:7",
        );
    });
});
