import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/lib/auth";
import { apiClient } from "@/lib/apiClient";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(auth).mockReset();
});

describe("apiClient.buildUrl", () => {
    it("skips empty values while keeping falsy primitives", () => {
        const url = new URL(
            apiClient.buildUrl("/api/v1/test", {
                a: "one",
                b: "",
                c: undefined,
                d: 0,
                e: false,
            }),
        );

        expect(url.pathname).toBe("/api/v1/test");
        expect(url.searchParams.get("a")).toBe("one");
        expect(url.searchParams.has("b")).toBe(false);
        expect(url.searchParams.has("c")).toBe(false);
        expect(url.searchParams.get("d")).toBe("0");
        expect(url.searchParams.get("e")).toBe("false");
    });
});

describe("apiClient.request", () => {
    it("does not share in-flight responses across authenticated sessions", async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            access_token: "token-a",
            expires: "2099-01-01T00:00:00Z",
            user: { id: "user-a" },
        });

        let releaseFetches: (() => void) | undefined;
        const fetchesMayComplete = new Promise<void>((resolve) => {
            releaseFetches = resolve;
        });
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
            await fetchesMayComplete;
            const authorization = new Headers(init?.headers).get("Authorization");
            return Response.json({ authorization });
        });

        const first = apiClient.getJson<{ authorization: string }>("/api/v1/home");
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        vi.mocked(auth).mockResolvedValueOnce({
            access_token: "token-b",
            expires: "2099-01-01T00:00:00Z",
            user: { id: "user-b" },
        });
        const second = apiClient.getJson<{ authorization: string }>("/api/v1/home");

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        releaseFetches?.();

        await expect(Promise.all([first, second])).resolves.toEqual([
            { authorization: "Bearer token-a" },
            { authorization: "Bearer token-b" },
        ]);
    });
});
