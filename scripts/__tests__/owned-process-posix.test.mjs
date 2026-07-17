import { describe, expect, it, vi } from "vitest";
import { processGroupExists, processGroupIsOwned } from "../owned-process-posix.mjs";

describe("POSIX owned-process cleanup", () => {
    it("keeps polling an owned process group when an existence probe is temporarily permission denied", () => {
        const permissionDenied = Object.assign(new Error("permission denied"), { code: "EPERM" });
        const kill = vi.fn(() => {
            throw permissionDenied;
        });

        expect(processGroupExists(123, kill)).toBe(true);
    });

    it("refuses a numerically reused process group when its retained member identity differs", () => {
        const member = { pgid: 123, pid: 456, startedAt: "Thu Jul 16 21:00:00 2026" };
        const inspect = vi.fn(() => ({ ...member, startedAt: "Thu Jul 16 21:00:01 2026" }));

        expect(processGroupIsOwned({ groupId: 123, member }, inspect)).toBe(false);
    });

    it("requires a retained member in the original process group before cleanup", () => {
        const member = { pgid: 123, pid: 456, startedAt: "Thu Jul 16 21:00:00 2026" };
        const inspect = vi.fn(() => member);

        expect(processGroupIsOwned({ groupId: 123, member }, inspect)).toBe(true);
    });
});
