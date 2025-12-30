import { describe, expect, it } from "vitest";

import { SANKEY_MODES, buildSankeyDataset } from "@/lib/sankey";

describe("buildSankeyDataset", () => {
  SANKEY_MODES.forEach((mode) => {
    it(`builds ${mode.id} with nodes and links`, () => {
      const dataset = buildSankeyDataset(mode.id);
      expect(dataset.nodes.length).toBeGreaterThan(0);
      expect(dataset.links.length).toBeGreaterThan(0);
      const names = dataset.nodes.map((node) => node.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it("builds state flow with issue, PR, and deployment nodes", () => {
    const dataset = buildSankeyDataset("state");
    const names = dataset.nodes.map((node) => node.name);
    expect(names).toContain("Issue Backlog");
    expect(names).toContain("PR Draft");
    expect(names).toContain("Deployment Build");
  });
});
