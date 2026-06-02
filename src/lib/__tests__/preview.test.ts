import { describe, it, expect } from "vitest";
import { PREVIEW_FEATURES, isPreviewFeature } from "@/lib/preview";

describe("preview feature registry", () => {
  it("marks ai-opportunities (AI Automations) as a preview feature", () => {
    expect(isPreviewFeature("ai-opportunities")).toBe(true);
    expect(PREVIEW_FEATURES["ai-opportunities"].label).toBeTruthy();
  });

  it("returns false for features that are generally available", () => {
    expect(isPreviewFeature("ai-impact")).toBe(false);
    expect(isPreviewFeature("home")).toBe(false);
    expect(isPreviewFeature("unknown-id")).toBe(false);
  });
});
