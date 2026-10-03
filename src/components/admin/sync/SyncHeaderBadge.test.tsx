import { describe, expect, it } from "vitest";

import { COMPLETE_COVERAGE_SUMMARY } from "@/lib/admin/__tests__/syncCoverageFixtures";
import type { SyncCoverageSummary } from "@/lib/admin/types";
import { render, screen } from "@/test/utils";

import { healthLabel } from "./CoverageBadge";
import { SyncHeaderBadge } from "./SyncHeaderBadge";

describe("SyncHeaderBadge (CHAOS-8265)", () => {
    it("is the coverage status label the card shows", () => {
        const failing = {
            ...COMPLETE_COVERAGE_SUMMARY,
            overall: { ...COMPLETE_COVERAGE_SUMMARY.overall, health: "failed" },
        } as SyncCoverageSummary;
        render(<SyncHeaderBadge coverage={failing} />);
        expect(screen.getByText(healthLabel("failed"))).toBeInTheDocument();
    });

    it("is no badge at all when the coverage could not be read (missing is not a status)", () => {
        const { container } = render(<SyncHeaderBadge coverage={null} />);
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByText("Success")).not.toBeInTheDocument();
    });
});
