import { beforeEach, describe, expect, it, vi } from "vitest";

import CapacityRedirect from "./page";

const redirectSpy = vi.hoisted(() =>
    vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT ${url}`);
    }),
);

vi.mock("next/navigation", () => ({ redirect: redirectSpy }));

async function target(params: Record<string, string | string[] | undefined>): Promise<string> {
    await expect(CapacityRedirect({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        "NEXT_REDIRECT",
    );
    return redirectSpy.mock.calls[0][0] as string;
}

beforeEach(() => {
    redirectSpy.mockClear();
});

describe("/capacity redirects to the Completion Forecast", () => {
    it("keeps the whole query string: filter, role, origin and any other key", async () => {
        const url = new URL(
            await target({ f: "eyJhIjoxfQ", role: "em", origin: "home", tab: "x" }),
            "https://app.example",
        );

        expect(url.pathname).toBe("/plan/capacity");
        expect(url.searchParams.get("f")).toBe("eyJhIjoxfQ");
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("origin")).toBe("home");
        expect(url.searchParams.get("tab")).toBe("x");
    });

    it("keeps every value of a repeated key", async () => {
        const url = new URL(await target({ team: ["a", "b"] }), "https://app.example");

        expect(url.searchParams.getAll("team")).toEqual(["a", "b"]);
    });

    it("adds no question mark when there is no query", async () => {
        expect(await target({})).toBe("/plan/capacity");
    });
});
