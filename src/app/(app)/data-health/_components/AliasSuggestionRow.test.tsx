import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { CTA_LABELS } from "@/lib/design/cta";
import { AliasSuggestionRow } from "./AliasSuggestionRow";

// CHAOS-7883: the confirm button is the action color on theme tokens, no raw blue.
describe("AliasSuggestionRow", () => {
    it("shows the confirm action in the action color with a readable label", () => {
        render(
            <AliasSuggestionRow
                suggestion={{
                    unmappedIdentity: { provider: "github", displayName: "Sample User" },
                    suggestedCanonicalId: "sample-id",
                    confidence: 0.9,
                }}
            />,
        );
        const button = screen.getByRole("button", { name: CTA_LABELS.confirmMapping });
        expect(button.className).toContain("bg-(--accent-2)");
        expect(button.className).toContain("text-background");
        expect(button.className).not.toMatch(/blue-|text-white/);
        expect(screen.getByText("90% match")).toBeInTheDocument();
    });
});
