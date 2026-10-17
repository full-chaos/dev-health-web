import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import { SyncNeedsAttention } from "./SyncNeedsAttention";
import type { IntegrationDataset } from "@/lib/admin/types";

const marked: IntegrationDataset = {
    id: "d1",
    integration_id: "i1",
    dataset_key: "work-items",
    is_enabled: true,
    unavailable_reason: "needs_attention:time_limit",
    unavailable_since: "2026-07-01T06:00:00.000Z",
    unavailable_last_seen_at: "2026-07-02T06:00:00.000Z",
};

describe("SyncNeedsAttention", () => {
    it("renders nothing when no dataset has a marker", () => {
        const { container } = renderWithEvidenceDrawer(
            <SyncNeedsAttention datasets={[{ ...marked, unavailable_reason: null }]} />,
        );
        expect(container.querySelector('[data-testid="sync-needs-attention"]')).toBeNull();
    });

    it("shows the badge and one-line reason, with detail in the evidence drawer", async () => {
        renderWithEvidenceDrawer(<SyncNeedsAttention datasets={[marked]} />);
        const row = screen.getByTestId("sync-attention-row");
        expect(within(row).getByText("Needs attention")).toBeInTheDocument();
        expect(within(row).getByText("A run reached its time limit.")).toBeInTheDocument();
        expect(screen.queryByTestId("sync-attention-evidence")).toBeNull();

        await userEvent.click(screen.getByTestId("sync-attention-evidence-open"));
        const evidence = await screen.findByTestId("sync-attention-evidence");
        expect(within(evidence).getByText("Failing since")).toBeInTheDocument();
        expect(within(evidence).getByText("Last failure")).toBeInTheDocument();
    });

    it("says so when the read failed", () => {
        renderWithEvidenceDrawer(<SyncNeedsAttention datasets={[]} failed />);
        expect(screen.getByRole("status")).toBeInTheDocument();
    });
});
