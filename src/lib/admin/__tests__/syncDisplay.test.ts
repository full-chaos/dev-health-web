import { describe, expect, it } from "vitest";
import { formatSyncBackendText, formatSyncRunStatusLabel } from "../syncDisplay";

describe("syncDisplay", () => {
    it("humanizes sync run states for the UI", () => {
        expect(formatSyncRunStatusLabel("partial_failed")).toBe("Completed with failures");
        expect(formatSyncRunStatusLabel("running")).toBe("Syncing...");
        expect(formatSyncRunStatusLabel("success")).toBe("Sync completed");
    });

    it("humanizes backend failure codes without changing normal prose", () => {
        expect(formatSyncBackendText("provider_unit_exhausted")).toBe(
            "Provider unit exhausted",
        );
        expect(formatSyncBackendText("provider_budget_contention")).toBe("Budget contention");
        expect(formatSyncBackendText("Secondary rate limit hit; backing off")).toBe(
            "Secondary rate limit hit; backing off",
        );
    });
});
