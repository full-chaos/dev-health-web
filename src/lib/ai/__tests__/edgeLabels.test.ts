import { describe, expect, it } from "vitest";
import { edgeEndName, edgeTypeWords, nodeTypeWords } from "../edgeLabels";

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
        expect(nodeTypeWords("pr")).toBe("PR");
        expect(nodeTypeWords("ai_workflow_run")).toBe("AI workflow run");
    });
});

// CHAOS-8113: an edge has no name fields. The name of an edge end is the served displayName of the
// node with the same type and id. It is a lookup: nothing is read out of the id.
describe("edgeEndName", () => {
    const PR = "11111111-1111-1111-1111-111111111111:42";
    const nodes = [
        { nodeType: "pr", nodeId: PR, displayName: "Add feature flag" },
        { nodeType: "deployment", nodeId: "dep-1", displayName: "production deploy" },
        { nodeType: "ai_workflow_run", nodeId: "run-1", displayName: null },
        { nodeType: "issue", nodeId: "blank", displayName: "   " },
        { nodeType: "commit", nodeId: "no-field" },
    ];

    it("gives the served name of the node with the same type and id", () => {
        expect(edgeEndName(nodes, "pr", PR)).toBe("Add feature flag");
        expect(edgeEndName(nodes, "deployment", "dep-1")).toBe("production deploy");
    });

    it("does not take the name of a node with the same id and another type", () => {
        expect(edgeEndName(nodes, "issue", PR)).toBeNull();
        expect(edgeEndName(nodes, "pr", "dep-1")).toBeNull();
    });

    it.each([
        ["a null name", "ai_workflow_run", "run-1"],
        ["a blank name", "issue", "blank"],
        ["no name field (an older answer)", "commit", "no-field"],
        ["no such node", "pr", "missing"],
    ])("gives null for %s: never the id, never a part of it", (_name, type, id) => {
        expect(edgeEndName(nodes, type, id)).toBeNull();
    });

    it("gives null when the answer has no nodes", () => {
        expect(edgeEndName([], "pr", PR)).toBeNull();
        expect(edgeEndName(undefined, "pr", PR)).toBeNull();
    });
});
