import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import type { CustomerPushBatchSummary } from "@/lib/admin/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}));

import { CustomerPushBatchList } from "./CustomerPushBatchList";

const batches: CustomerPushBatchSummary[] = [
    {
        ingestion_id: "batch-1",
        source_system: "github",
        source_instance: "acme/api",
        producer: "dev-hops-cli",
        status: "completed",
        items_received: 10,
        items_accepted: 10,
        items_rejected: 0,
        created_at: "2026-06-26T00:01:00.000Z",
        completed_at: "2026-06-26T00:02:00.000Z",
    },
    {
        ingestion_id: "batch-2",
        source_system: "github",
        source_instance: "acme/api",
        producer: "github-actions",
        status: "partial",
        items_received: 5,
        items_accepted: 4,
        items_rejected: 1,
        created_at: "2026-06-28T00:01:00.000Z",
        completed_at: "2026-06-28T00:02:00.000Z",
    },
];

describe("CustomerPushBatchList", () => {
    it("clicking anywhere on a row navigates to its drilldown (D11 — mirrors SyncJobHistory)", async () => {
        mockPush.mockReset();
        const user = userEvent.setup();
        render(
            <CustomerPushBatchList
                provider="github"
                sourceId="cps-1"
                batches={batches}
                validateHref="/validate"
                examplesHref="/examples"
            />,
        );
        await user.click(screen.getByText("Completed"));
        expect(mockPush).toHaveBeenCalledWith(
            "/org/admin/integrations/github/customer-push/cps-1/batches/batch-1",
        );
    });

    it("shows the empty state linking to both Validate and examples when no batches exist", () => {
        render(
            <CustomerPushBatchList
                provider="github"
                sourceId="cps-1"
                batches={[]}
                validateHref="/validate"
                examplesHref="/examples"
            />,
        );
        expect(screen.getByText(/no batches yet/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Validate" })).toHaveAttribute("href", "/validate");
        expect(screen.getByRole("link", { name: "CI job" })).toHaveAttribute("href", "/examples");
    });

    it("shows status badges and links each row to its drilldown", () => {
        render(
            <CustomerPushBatchList
                provider="github"
                sourceId="cps-1"
                batches={batches}
                validateHref="/validate"
                examplesHref="/examples"
            />,
        );
        expect(screen.getByText("Completed")).toBeInTheDocument();
        expect(screen.getByText("Partial")).toBeInTheDocument();
        const rowLink = screen.getByTitle("batch-1").closest("a");
        expect(rowLink).toHaveAttribute(
            "href",
            "/org/admin/integrations/github/customer-push/cps-1/batches/batch-1",
        );
    });

    it("filters by producer bucket via the chips", async () => {
        const user = userEvent.setup();
        render(
            <CustomerPushBatchList
                provider="github"
                sourceId="cps-1"
                batches={batches}
                validateHref="/validate"
                examplesHref="/examples"
            />,
        );
        await user.click(screen.getByRole("button", { name: "CI" }));
        expect(screen.queryByTitle("batch-1")).not.toBeInTheDocument();
        expect(screen.getByTitle("batch-2")).toBeInTheDocument();
    });
});
