import { describe, expect, it } from "vitest";

import { syncHeaderFacts } from "../syncHeader";
import type { SyncConfig } from "../types";

const base = {
    provider: "github",
    sync_targets: ["git", "prs"],
    schedule_cron: "0 * * * *",
    timezone: "UTC",
} as SyncConfig;

describe("syncHeaderFacts (CHAOS-8242)", () => {
    it("lists the provider, the target count and the stored schedule text, as served", () => {
        expect(syncHeaderFacts(base)).toBe(
            "Provider: github · 2 sync targets · Schedule: 0 * * * * (UTC)",
        );
    });
    it("says Not scheduled, never an invented interval, when there is no schedule", () => {
        const text = syncHeaderFacts({ ...base, schedule_cron: null, timezone: null });
        expect(text).toBe("Provider: github · 2 sync targets · Not scheduled");
        expect(text).not.toMatch(/every/i);
    });
    it("uses the singular for one target", () => {
        expect(syncHeaderFacts({ ...base, sync_targets: ["git"] })).toContain("1 sync target ·");
    });
});
