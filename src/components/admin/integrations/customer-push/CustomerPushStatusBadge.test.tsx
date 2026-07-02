import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { CustomerPushStatusBadge } from "./CustomerPushStatusBadge";
import type { CustomerPushBatchStatus } from "@/lib/admin/types";

describe("CustomerPushStatusBadge", () => {
    const cases: Array<[CustomerPushBatchStatus, string]> = [
        ["accepted", "Accepted"],
        ["stream_unavailable", "Stream unavailable"],
        ["processing", "Processing…"],
        ["completed", "Completed"],
        ["partial", "Partial"],
        ["failed", "Failed"],
    ];

    it.each(cases)("renders the correct label for status %s", (status, label) => {
        render(<CustomerPushStatusBadge status={status} />);
        expect(screen.getByText(label)).toBeInTheDocument();
    });
});
