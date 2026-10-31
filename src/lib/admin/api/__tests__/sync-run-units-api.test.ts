import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncConfigsApi } from "../sync";

function mockUnits() {
    return vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ units: [], unit_count: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

describe("sync run units admin API", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it("reads the whole run when no query is given", async () => {
        const fetchSpy = mockUnits();
        await syncConfigsApi.getSyncRunUnits("run-1", "token-1", "org-1");
        expect(fetchSpy.mock.calls[0]?.[0]).toBe(
            "http://test-ops:8000/api/v1/admin/sync-runs/run-1/units",
        );
    });

    it("sends the page and every filter as query parameters, skipping unset ones", async () => {
        const fetchSpy = mockUnits();
        await syncConfigsApi.getSyncRunUnits("run-1", "token-1", "org-1", {
            limit: 100,
            offset: 200,
            status: "failed,retrying",
            dataset_key: "git",
            source_id: undefined,
            since: "2026-06-01T00:00:00.000Z",
            before: "",
        });
        const url = new URL(fetchSpy.mock.calls[0]?.[0] as string);
        expect(url.pathname).toBe("/api/v1/admin/sync-runs/run-1/units");
        expect(Object.fromEntries(url.searchParams)).toEqual({
            limit: "100",
            offset: "200",
            status: "failed,retrying",
            dataset_key: "git",
            since: "2026-06-01T00:00:00.000Z",
        });
    });
});
