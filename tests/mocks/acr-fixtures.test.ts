import { afterEach, describe, expect, it } from "vitest";
import {
    contextPacketForGoal,
    evidenceRequestStarted,
    getAcrMockEvidenceStats,
    getContextPacketDelay,
    pausedContextPacketGoals,
    releasePausedContextPackets,
    resetAcrMockControls,
    setAcrMockControls,
    waitForContextPacketRelease,
} from "./acr-fixtures";

describe("ACR mock fixtures", () => {
    afterEach(resetAcrMockControls);

    it("creates a delayed malformed packet only when the test control requests it", () => {
        expect(
            setAcrMockControls({
                delayedGoals: { "e2e stale response": 200 },
                malformedPacket: true,
            }),
        ).toBe(true);

        const packet = contextPacketForGoal("e2e stale response");

        expect(getContextPacketDelay("e2e stale response")).toBe(200);
        expect(packet).toMatchObject({ freshness: { watermarks: null } });
    });

    it("tracks concurrent evidence requests without retaining in-flight counters", () => {
        const finishFirst = evidenceRequestStarted();
        const finishSecond = evidenceRequestStarted();

        expect(getAcrMockEvidenceStats()).toEqual({ active: 2, count: 2, maxConcurrent: 2 });

        finishFirst();
        finishSecond();

        expect(getAcrMockEvidenceStats()).toEqual({ active: 0, count: 2, maxConcurrent: 2 });
    });

    it("holds a configured packet until an explicit release control resolves it", async () => {
        expect(setAcrMockControls({ pausedGoals: ["e2e stale response"] })).toBe(true);

        const release = waitForContextPacketRelease("e2e stale response");

        expect(pausedContextPacketGoals()).toEqual(["e2e stale response"]);
        expect(releasePausedContextPackets("e2e stale response")).toBe(true);
        await expect(release).resolves.toBeUndefined();
        expect(pausedContextPacketGoals()).toEqual([]);
    });

    it("rejects unsafe test controls instead of accepting arbitrary values", () => {
        expect(setAcrMockControls({ evidenceDelayMs: -1 })).toBe(false);
        expect(setAcrMockControls({ evidenceDelayMs: 60_001 })).toBe(false);
        expect(setAcrMockControls({ delayedGoals: { "e2e stale response": 60_001 } })).toBe(false);
        expect(setAcrMockControls({ malformedPacket: "yes" })).toBe(false);
    });
});
