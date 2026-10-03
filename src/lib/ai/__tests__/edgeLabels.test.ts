import { describe, expect, it } from "vitest";
import { edgeTypeWords, nodeTypeWords, pullRequestNumber } from "../edgeLabels";

describe("edgeLabels", () => {
    it("maps edge tokens to words, any case", () => {
        expect(edgeTypeWords("has_ai_workflow")).toBe("Has AI workflow");
        expect(edgeTypeWords("DEPLOYS")).toBe("Deploys");
        expect(edgeTypeWords("IS_BLOCKED_BY")).toBe("Blocked by");
    });
    it("makes an unknown token readable, never raw", () => {
        expect(edgeTypeWords("some_new_edge")).toBe("Some new edge");
        expect(nodeTypeWords("custom_node")).toBe("Custom node");
    });
    it("names node types", () => {
        expect(nodeTypeWords("pr")).toBe("Pull request");
        expect(nodeTypeWords("ai_workflow_run")).toBe("AI workflow run");
    });
    it("reads the PR number only from a pr node id", () => {
        expect(pullRequestNumber("pr", "11111111-1111-1111-1111-111111111111:42")).toBe("42");
        expect(pullRequestNumber("issue", "abc:42")).toBeNull();
        expect(pullRequestNumber("pr", "no-number")).toBeNull();
    });
});
