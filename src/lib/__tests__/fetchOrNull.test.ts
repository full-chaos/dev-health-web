import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above imports; mock logger before fetchOrNull imports it.
vi.mock("@/lib/logger", () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
    },
}));

import { fetchOrNull } from "@/lib/fetchOrNull";
import { logger } from "@/lib/logger";

const warnSpy = logger.warn as unknown as ReturnType<typeof vi.fn>;

describe("fetchOrNull", () => {
    beforeEach(() => {
        warnSpy.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("happy path", () => {
        it("returns the resolved value for a string", async () => {
            const result = await fetchOrNull(Promise.resolve("hello"), "string-label");
            expect(result).toBe("hello");
            expect(warnSpy).not.toHaveBeenCalled();
        });

        it("returns the resolved value for an object", async () => {
            const payload = { id: 42, name: "widget" };
            const result = await fetchOrNull(Promise.resolve(payload), "obj-label");
            expect(result).toEqual(payload);
            expect(result).toBe(payload);
        });

        it("returns the resolved value for an array", async () => {
            const arr = [1, 2, 3];
            const result = await fetchOrNull(Promise.resolve(arr), "array-label");
            expect(result).toEqual([1, 2, 3]);
        });

        it("returns falsy primitives unchanged (0, false, empty string)", async () => {
            expect(await fetchOrNull(Promise.resolve(0), "zero")).toBe(0);
            expect(await fetchOrNull(Promise.resolve(false), "false")).toBe(false);
            expect(await fetchOrNull(Promise.resolve(""), "empty")).toBe("");
            expect(warnSpy).not.toHaveBeenCalled();
        });

        it("passes through an explicit null resolution without logging a warning", async () => {
            const result = await fetchOrNull(Promise.resolve(null), "null-value");
            expect(result).toBeNull();
            expect(warnSpy).not.toHaveBeenCalled();
        });

        it("returns undefined when the promise resolves to undefined", async () => {
            const result = await fetchOrNull(Promise.resolve(undefined), "undef-value");
            expect(result).toBeUndefined();
            expect(warnSpy).not.toHaveBeenCalled();
        });

        it("awaits slow-resolving promises", async () => {
            const slow = new Promise<string>((resolve) =>
                setTimeout(() => resolve("later"), 5),
            );
            const result = await fetchOrNull(slow, "slow");
            expect(result).toBe("later");
        });
    });

    describe("error path", () => {
        it("returns null when the promise rejects with an Error", async () => {
            const err = new Error("boom");
            const result = await fetchOrNull(Promise.reject(err), "err-label");
            expect(result).toBeNull();
        });

        it("returns null for rejection with a string", async () => {
            const result = await fetchOrNull(
                Promise.reject("string reason"),
                "string-reject",
            );
            expect(result).toBeNull();
        });

        it("returns null for rejection with undefined / null", async () => {
            expect(
                await fetchOrNull(Promise.reject(undefined), "undef-reject"),
            ).toBeNull();
            expect(
                await fetchOrNull(Promise.reject(null), "null-reject"),
            ).toBeNull();
        });

        it("returns null when the underlying promise throws synchronously (async function body)", async () => {
            const thrower = (async () => {
                throw new Error("sync throw in async");
            })();
            const result = await fetchOrNull(thrower, "thrower");
            expect(result).toBeNull();
        });

        it("resolves (does not reject) when the underlying promise rejects", async () => {
            await expect(
                fetchOrNull(Promise.reject(new Error("x")), "swallow"),
            ).resolves.toBeNull();
        });
    });

    describe("logging", () => {
        it("logs a warning that includes the label and the thrown error", async () => {
            const err = new Error("network down");
            await fetchOrNull(Promise.reject(err), "home-data");
            expect(warnSpy).toHaveBeenCalledTimes(1);
            const [logArg, message] = warnSpy.mock.calls[0];
            expect(logArg).toEqual({ err, label: "home-data" });
            expect(message).toBe("fetchOrNull: home-data failed, returning null");
        });

        it("logs only once per failure", async () => {
            await fetchOrNull(Promise.reject(new Error("once")), "label1");
            expect(warnSpy).toHaveBeenCalledTimes(1);
        });

        it("propagates distinct labels into log calls", async () => {
            await fetchOrNull(Promise.reject(new Error("a")), "label-a");
            await fetchOrNull(Promise.reject(new Error("b")), "label-b");
            expect(warnSpy).toHaveBeenCalledTimes(2);
            expect(warnSpy.mock.calls[0][1]).toContain("label-a");
            expect(warnSpy.mock.calls[1][1]).toContain("label-b");
        });

        it("does not log on success even for potentially falsy values", async () => {
            await fetchOrNull(Promise.resolve(null), "null-ok");
            await fetchOrNull(Promise.resolve(undefined), "undef-ok");
            await fetchOrNull(Promise.resolve(0), "zero-ok");
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    describe("generic type behavior", () => {
        it("preserves the generic return type for typed promises", async () => {
            interface Widget {
                id: number;
            }
            const p: Promise<Widget> = Promise.resolve({ id: 7 });
            const result = await fetchOrNull(p, "typed");
            expect(result?.id).toBe(7);
        });
    });
});
