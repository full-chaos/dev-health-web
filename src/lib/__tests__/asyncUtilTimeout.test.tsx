import { describe, expect, it } from "vitest";
import { getConfig } from "@testing-library/react";
import { ASYNC_UTIL_TIMEOUT_MS } from "@/test/setup";

describe("testing-library async wait (CHAOS-13439)", () => {
    it("waits a bounded 5 s, not the 1 s default", () => {
        expect(ASYNC_UTIL_TIMEOUT_MS).toBe(5_000);
        expect(getConfig().asyncUtilTimeout).toBe(ASYNC_UTIL_TIMEOUT_MS);
    });
});
