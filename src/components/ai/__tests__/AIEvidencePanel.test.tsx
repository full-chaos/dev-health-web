import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

vi.mock("../AIEvidenceExplorer", () => ({
    AIEvidenceExplorer: () => <div data-testid="explorer-stub" />,
}));

import { AIEvidencePanel } from "../AIEvidencePanel";

describe("AIEvidencePanel", () => {
    it("keeps the heading, intro text, test id and the explorer", () => {
        render(<AIEvidencePanel filter={{ startDate: "2026-04-01", endDate: "2026-05-01" }} />);
        const panel = screen.getByTestId("ai-evidence-panel");
        expect(panel).toHaveTextContent("Evidence by pull request");
        expect(panel).toHaveTextContent(
            "Pick an AI-attributed PR to see its Work Graph evidence — nodes and edges with provenance. Filtered to the current range, repo, and work type.",
        );
        expect(screen.getByTestId("explorer-stub")).toBeInTheDocument();
    });
});
