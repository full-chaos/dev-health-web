import { describe, expect, it } from "vitest";

import { COMPLETE_COVERAGE_SUMMARY } from "@/lib/admin/__tests__/syncCoverageFixtures";
import type { SyncConfig, SyncCoverageSummary } from "@/lib/admin/types";
import { render, screen } from "@/test/utils";

import { healthLabel } from "./CoverageBadge";
import { SyncHeaderBadge } from "./SyncHeaderBadge";

const config = {
    id: "c",
    last_sync_at: "2026-10-01T00:00:00Z",
    last_sync_success: true,
} as SyncConfig;

describe("SyncHeaderBadge (CHAOS-8265)", () => {
    it("is the coverage status label, not the last sync result", () => {
        const failing = {
            ...COMPLETE_COVERAGE_SUMMARY,
            overall: { ...COMPLETE_COVERAGE_SUMMARY.overall, health: "failed" },
        } as SyncCoverageSummary;
        render(<SyncHeaderBadge config={config} coverage={failing} />);
        // The last sync succeeded, the coverage says failed: the header follows the coverage.
        expect(screen.getByText(healthLabel("failed"))).toBeInTheDocument();
        expect(screen.queryByText("Success")).not.toBeInTheDocument();
    });

    it("falls back to the last sync result when there is no coverage", () => {
        render(<SyncHeaderBadge config={config} coverage={null} />);
        expect(screen.getByText("Success")).toBeInTheDocument();
    });
});
