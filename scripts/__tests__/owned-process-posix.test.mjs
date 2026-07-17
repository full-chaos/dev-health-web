import { describe, expect, it, vi } from "vitest";
import { processGroupExists } from "../owned-process-posix.mjs";

describe("POSIX owned-process cleanup", () => {
    it("keeps polling an owned process group when an existence probe is temporarily permission denied", () => {
        const permissionDenied = Object.assign(new Error("permission denied"), { code: "EPERM" });
        const kill = vi.fn(() => {
            throw permissionDenied;
        });

        expect(processGroupExists(123, kill)).toBe(true);
    });
});
