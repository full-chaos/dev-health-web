import { describe, it, expect } from "vitest";

import { CTA_LABELS, CTA_LABEL_VALUES, backToArea } from "@/lib/design/cta";

describe("CTA registry (Part D)", () => {
  it("exposes the approved Part D verbs with canonical phrasing", () => {
    expect(CTA_LABELS).toMatchObject({
      openEvidence: "Open evidence",
      inspectAssociations: "Inspect associations",
      openArtifact: "Open artifact",
      exportReport: "Export report",
      applyFilters: "Apply filters",
      resetFilters: "Reset filters",
      copy: "Copy",
      backToCockpit: "Back to Cockpit",
    });
  });

  it("does not retain the retired drift labels", () => {
    const values = Object.values(CTA_LABELS);
    expect(values).not.toContain("Re-orient in cockpit");
    expect(values).not.toContain("Open Landscapes");
    expect(values).not.toContain("Explore Work");
    expect(values).not.toContain("Open Flame");
  });

  it("renders a canonical contextual return path via backToArea", () => {
    expect(backToArea("Metrics")).toBe("Back to Metrics");
    expect(backToArea("Explore")).toBe("Back to Explore");
  });

  it("exports the literal registry values for tests / allowlisting", () => {
    expect(CTA_LABEL_VALUES).toContain("Open evidence");
    expect(CTA_LABEL_VALUES).toHaveLength(Object.keys(CTA_LABELS).length);
  });
});
