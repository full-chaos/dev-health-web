import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { AIMissingDataPanel } from "../AIMissingDataPanel";

describe("AIMissingDataPanel", () => {
    it("renders explicit missing metric state with required data source", () => {
        render(
            <AIMissingDataPanel
                title="Reviewer concentration"
                reason="Reviewer concentration is not in the schema."
                needed="Aggregated reviewer distribution buckets."
            />,
        );

        // Routes through DataState (detector-unavailable) — title and description render via EmptyState
        expect(screen.getByText("Reviewer concentration")).toBeInTheDocument();
        expect(screen.getByText(/Reviewer concentration is not in the schema/)).toBeInTheDocument();
        // "needed" text surfaces via DataState detail slot
        expect(screen.getByText(/Aggregated reviewer distribution buckets/)).toBeInTheDocument();
        expect(screen.getByTestId("ai-missing-data-panel")).toBeInTheDocument();
    });

    it("renders without a data source hint when needed is omitted", () => {
        render(
            <AIMissingDataPanel
                title="Hotspot file overlap"
                reason="Hotspot overlap is not available for the selected scope yet."
            />,
        );

        expect(screen.getByText("Hotspot file overlap")).toBeInTheDocument();
        expect(screen.queryByText(/Data source needed/)).not.toBeInTheDocument();
    });
});
