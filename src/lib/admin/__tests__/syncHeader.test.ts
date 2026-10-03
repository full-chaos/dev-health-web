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
    it("leaves the schedule out, with no invented interval and no filler, when there is none", () => {
        const text = syncHeaderFacts({ ...base, schedule_cron: null, timezone: null });
        expect(text).toBe("Provider: github · 2 sync targets");
        expect(text).not.toMatch(/every|not scheduled|schedule/i);
    });
    it("uses the singular for one target", () => {
        expect(syncHeaderFacts({ ...base, sync_targets: ["git"] })).toContain("1 sync target ·");
    });
});
