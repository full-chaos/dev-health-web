import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { CustomerPushStatusBadge } from "./CustomerPushStatusBadge";
import type { CustomerPushBatchStatus } from "@/lib/admin/types";

const STATUSES: { status: CustomerPushBatchStatus; label: string }[] = [
    { status: "accepted", label: "Accepted" },
    { status: "stream_unavailable", label: "Stream unavailable" },
    { status: "processing", label: "Processing…" },
    { status: "completed", label: "Completed" },
    { status: "partial", label: "Partial" },
    { status: "failed", label: "Failed" },
];

describe("CustomerPushStatusBadge", () => {
    it.each(STATUSES)("renders the correct label for $status", ({ status, label }) => {
        render(<CustomerPushStatusBadge status={status} />);
        expect(screen.getByText(label)).toBeInTheDocument();
    });
});
