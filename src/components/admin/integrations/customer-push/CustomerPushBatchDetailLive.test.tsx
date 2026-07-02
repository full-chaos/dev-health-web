import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import type { CustomerPushBatchDetail } from "@/lib/admin/types";

const mockGetCustomerPushBatch = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    getCustomerPushBatch: (...args: unknown[]) => mockGetCustomerPushBatch(...args),
}));

import { CustomerPushBatchDetailLive } from "./CustomerPushBatchDetailLive";

const completedBatch: CustomerPushBatchDetail = {
    ingestion_id: "batch-1",
    org_id: "org-1",
    status: "completed",
    attempts: 1,
    source_system: "github",
    source_instance: "acme/api",
    producer: "dev-hops-cli",
    producer_version: "0.1.0",
    schema_version: "external-ingest.v1",
    window_started_at: "2026-06-25T00:00:00.000Z",
    window_ended_at: "2026-06-26T00:00:00.000Z",
    items_received: 10,
    items_accepted: 10,
    items_rejected: 0,
    record_counts: { "pull_request.v1": 10 },
    recompute_status: "dispatched",
    error_summary: null,
    created_at: "2026-06-26T00:01:00.000Z",
    updated_at: "2026-06-26T00:01:00.000Z",
    completed_at: "2026-06-26T00:02:00.000Z",
    rejected_records: [],
    rejected_records_total: 0,
    rejected_records_limit: 50,
    rejected_records_offset: 0,
};

const partialBatch: CustomerPushBatchDetail = {
    ...completedBatch,
    status: "partial",
    items_accepted: 8,
    items_rejected: 2,
    error_summary: {
        total_rejected: 2,
        stored_rejections: 2,
        truncated: false,
        top_codes: [{ code: "missing_external_id", count: 2 }],
    },
    rejected_records_total: 1,
    rejected_records: [
        {
            index: 1,
            kind: "pull_request.v1",
            external_id: "PR#1",
            code: "missing_external_id",
            path: "records[1].externalId",
            message: "externalId is required",
        },
    ],
};

describe("CustomerPushBatchDetailLive", () => {
    it("renders the clean 'No rejected records' empty state when items_rejected === 0", () => {
        render(<CustomerPushBatchDetailLive initialBatch={completedBatch} testMode />);
        expect(screen.getByText("No rejected records.")).toBeInTheDocument();
    });

    it("renders the rejected-records table when items_rejected > 0", () => {
        render(<CustomerPushBatchDetailLive initialBatch={partialBatch} testMode />);
        expect(screen.getByText("records[1].externalId")).toBeInTheDocument();
        expect(screen.getByText("externalId is required")).toBeInTheDocument();
    });

    it("never polls in testMode, even for a non-terminal batch", async () => {
        render(
            <CustomerPushBatchDetailLive
                initialBatch={{ ...completedBatch, status: "processing" }}
                testMode
            />,
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mockGetCustomerPushBatch).not.toHaveBeenCalled();
    });

    it("does not poll a batch that is already in a terminal status, even outside testMode", async () => {
        render(<CustomerPushBatchDetailLive initialBatch={completedBatch} />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mockGetCustomerPushBatch).not.toHaveBeenCalled();
    });
});
