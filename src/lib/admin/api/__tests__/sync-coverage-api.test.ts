import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../_request";
import { syncConfigsApi } from "../sync";
import type { BackfillResponse } from "../../types";
import { COVERAGE_SUMMARIES, SYNC_JOB_WITH_RUN } from "../../__tests__/syncCoverageFixtures";

function mockJsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
    return vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(body), {
            status: init.status ?? 200,
            statusText: init.statusText,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

describe("sync coverage admin API", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it.each(Object.entries(COVERAGE_SUMMARIES))(
        "passes through the %s coverage contract payload without recomputing fields",
        async (_name, payload) => {
            const fetchSpy = mockJsonResponse(payload);

            const result = await syncConfigsApi.getSyncCoverage("cfg-coverage", "token-1", "org-1");

            expect(result).toEqual(payload);
            expect(result.overall.health).toBe(payload.overall.health);
            expect(result.data_basis).toBe(payload.data_basis);
            expect(fetchSpy).toHaveBeenCalledOnce();
            const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
            expect(url).toBe(
                "http://test-ops:8000/api/v1/admin/sync-configs/cfg-coverage/coverage",
            );
            expect(options?.headers).toMatchObject({
                Authorization: "Bearer token-1",
                "X-Org-Id": "org-1",
            });
        },
    );

    it("throws a typed AdminApiError when the coverage endpoint returns non-200", async () => {
        mockJsonResponse({ detail: "coverage unavailable" }, { status: 503, statusText: "Down" });

        await expect(syncConfigsApi.getSyncCoverage("cfg-coverage")).rejects.toMatchObject({
            name: "AdminApiError",
            status: 503,
            statusText: "Down",
            detail: "coverage unavailable",
        } satisfies Partial<AdminApiError>);
    });

    it("requests paginated sync jobs and preserves sync_run enrichment", async () => {
        const fetchSpy = mockJsonResponse([SYNC_JOB_WITH_RUN]);

        const result = await syncConfigsApi.jobs("cfg-coverage", "token-1", "org-1", {
            limit: 25,
            offset: 50,
        });

        expect(result).toEqual([SYNC_JOB_WITH_RUN]);
        expect(result[0]?.sync_run?.sync_run_id).toBe("run-coverage");
        const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toBe(
            "http://test-ops:8000/api/v1/admin/sync-configs/cfg-coverage/jobs?limit=25&offset=50",
        );
        expect(options?.headers).toMatchObject({
            Authorization: "Bearer token-1",
            "X-Org-Id": "org-1",
        });
    });

    it("keeps existing job callers on current-compatible pagination defaults", async () => {
        const fetchSpy = mockJsonResponse([]);

        await syncConfigsApi.jobs("cfg-coverage");

        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toBe(
            "http://test-ops:8000/api/v1/admin/sync-configs/cfg-coverage/jobs?limit=50&offset=0",
        );
    });

    it("sends the Idempotency-Key header on a keyed backfill and none on an unkeyed one", async () => {
        const accepted: BackfillResponse = {
            status: "accepted",
            backfill_job_id: "job-1",
            occurrence_id: "occ-1",
            task_id: "occurrence:occ-1",
        };
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(
            async () =>
                new Response(JSON.stringify(accepted), {
                    status: 202,
                    headers: { "Content-Type": "application/json" },
                }),
        );
        const selector = { since: "2026-06-01T00:00:00Z", before: "2026-06-02T00:00:00Z" };

        await syncConfigsApi.backfill("cfg-1", { selector }, "token-1", "org-1", "key-1");
        await syncConfigsApi.backfill("cfg-1", { selector }, "token-1", "org-1");

        const keyed = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
        const unkeyed = fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined;
        expect(keyed?.headers).toMatchObject({ "Idempotency-Key": "key-1" });
        expect(unkeyed?.headers).not.toHaveProperty("Idempotency-Key");
    });

    it("requests paginated backfill jobs with current-compatible defaults", async () => {
        const fetchSpy = mockJsonResponse({ items: [], total: 0, limit: 50, offset: 0 });

        await syncConfigsApi.listBackfillJobs("token-1", "org-1");

        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toBe("http://test-ops:8000/api/v1/admin/backfill-jobs?limit=50&offset=0");
    });

    it("passes explicit pagination through to the backfill-jobs listing", async () => {
        const fetchSpy = mockJsonResponse({ items: [], total: 0, limit: 10, offset: 20 });

        await syncConfigsApi.listBackfillJobs("token-1", "org-1", { limit: 10, offset: 20 });

        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toBe("http://test-ops:8000/api/v1/admin/backfill-jobs?limit=10&offset=20");
    });

    it("fetches the per-provider auto-import capability map (CHAOS-4323)", async () => {
        const payload = {
            github: {
                teams: true,
                projects: false,
                members: true,
                reasons: { projects: "GitHub attributes ownership via repos, not projects." },
            },
            gitlab: { teams: true, projects: true, members: true, reasons: {} },
        };
        const fetchSpy = mockJsonResponse(payload);

        const result = await syncConfigsApi.getAutoImportCapabilities("token-1", "org-1");

        expect(result).toEqual(payload);
        const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toBe("http://test-ops:8000/api/v1/admin/sync-configs/auto-import-capabilities");
        expect(options?.headers).toMatchObject({
            Authorization: "Bearer token-1",
            "X-Org-Id": "org-1",
        });
    });
});
