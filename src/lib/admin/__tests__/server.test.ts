import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies BEFORE importing the module under test
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { mockAuth } from "@/test/mocks/auth";
import {
    listUsers,
    listPlatformUsers,
    createCredential,
    deleteCredential,
    listCredentials,
    testConnection,
    listAuditLogs,
    getAuditLog,
    listIPAllowlistEntries,
    createIPAllowlistEntry,
    updateIPAllowlistEntry,
    deleteIPAllowlistEntry,
    checkIPAllowed,
    listRetentionPolicies,
    createRetentionPolicy,
    updateRetentionPolicy,
    deleteRetentionPolicy,
    executeRetentionPolicy,
    listRetentionResourceTypes,
    getOrgEntitlements,
    createSyncConfig,
    getSyncCoverage,
    getSyncJobs,
    triggerBackfill,
    getActiveBackfillJob,
    approveTeamChanges,
    dismissTeamChanges,
} from "../server";
import { COMPLETE_COVERAGE_SUMMARY, SYNC_JOB_WITH_RUN } from "./syncCoverageFixtures";

function mockSession() {
    mockAuth({ user: { id: "u-1", org_id: "org-1" } });
}

/** ISO timestamp `hours` in the past, for getActiveBackfillJob staleness fixtures. */
function hoursAgoIso(hours: number): string {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe("admin/server credential actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    describe("listCredentials", () => {
        it("returns credentials on success", async () => {
            mockSession();
            const creds = [
                {
                    id: "1",
                    provider: "github",
                    name: "default",
                    is_active: true,
                    config: {},
                    last_test_at: null,
                    last_test_success: null,
                    last_test_error: null,
                    created_at: "2025-01-01T00:00:00Z",
                    updated_at: "2025-01-01T00:00:00Z",
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(creds), { status: 200 }));

            const result = await listCredentials();
            expect(result.data).toBeDefined();
            expect(result.error).toBeUndefined();
            fetchSpy.mockRestore();
        });

        it("returns error when not authenticated", async () => {
            mockAuth(null);
            const result = await listCredentials();
            expect(result.error).toBeDefined();
        });
    });

    describe("createCredential", () => {
        it("calls revalidatePath after successful creation", async () => {
            mockSession();
            const cred = {
                id: "1",
                provider: "github",
                name: "default",
                is_active: true,
                config: {},
                last_test_at: null,
                last_test_success: null,
                last_test_error: null,
                created_at: "2025-01-01T00:00:00Z",
                updated_at: "2025-01-01T00:00:00Z",
            };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(cred), { status: 200 }));

            const result = await createCredential({
                provider: "github",
                credentials: { token: "tok" },
            });
            expect(result.data).toBeDefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/integrations", "page");
            fetchSpy.mockRestore();
        });
    });

    describe("testConnection", () => {
        it("calls revalidatePath after successful test", async () => {
            mockSession();
            const resp = { success: true, error: null, details: { user: "test" } };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

            const result = await testConnection("github", {
                name: "default",
                credentials: { token: "tok" },
            });
            expect(result.data?.success).toBe(true);
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/integrations", "page");
            fetchSpy.mockRestore();
        });
    });

    describe("deleteCredential", () => {
        it("calls revalidatePath after successful deletion", async () => {
            mockSession();
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(null, { status: 204 }));

            const result = await deleteCredential("github", "default");
            expect(result.error).toBeUndefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/integrations", "page");
            fetchSpy.mockRestore();
        });
    });
});

describe("admin/server sync config actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    describe("createSyncConfig", () => {
        it("calls revalidatePath after successful creation", async () => {
            mockSession();
            const cfg = {
                id: "sc-1",
                name: "Nightly",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "myorg" },
                is_active: true,
                schedule_cron: null,
                timezone: null,
                last_sync_at: null,
                last_sync_success: null,
                last_sync_error: null,
                created_at: "2025-01-01T00:00:00Z",
                updated_at: "2025-01-01T00:00:00Z",
                parent_id: null,
            };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(cfg), { status: 200 }));

            const result = await createSyncConfig({
                name: "Nightly",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "myorg" },
            });
            expect(result.data).toBeDefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/sync");
            fetchSpy.mockRestore();
        });
    });

    describe("getSyncCoverage", () => {
        it("returns persisted coverage summary on success", async () => {
            mockSession();
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(JSON.stringify(COMPLETE_COVERAGE_SUMMARY), { status: 200 }),
                );

            const result = await getSyncCoverage("cfg-coverage");

            expect(result.data).toEqual(COMPLETE_COVERAGE_SUMMARY);
            expect(result.error).toBeUndefined();
            const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
            expect(url).toBe(
                "http://test-ops:8000/api/v1/admin/sync-configs/cfg-coverage/coverage",
            );
            expect(options?.headers).toMatchObject({
                Authorization: "Bearer test-token",
                "X-Org-Id": "org-1",
            });
            fetchSpy.mockRestore();
        });

        it("returns a UI-safe error result instead of leaking non-200 throws", async () => {
            mockSession();
            const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
                new Response(JSON.stringify({ detail: "coverage unavailable" }), {
                    status: 500,
                    statusText: "Internal Server Error",
                }),
            );

            await expect(getSyncCoverage("cfg-coverage")).resolves.toEqual({
                error: "coverage unavailable",
            });
            fetchSpy.mockRestore();
        });
    });

    describe("getSyncJobs", () => {
        it("passes pagination through and preserves optional sync_run enrichment", async () => {
            mockSession();
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(JSON.stringify([SYNC_JOB_WITH_RUN]), { status: 200 }),
                );

            const result = await getSyncJobs("cfg-coverage", 25, 50);

            expect(result.data?.[0]?.sync_run?.sync_run_id).toBe("run-coverage");
            const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
            expect(url).toBe(
                "http://test-ops:8000/api/v1/admin/sync-configs/cfg-coverage/jobs?limit=25&offset=50",
            );
            fetchSpy.mockRestore();
        });
    });

    describe("triggerBackfill", () => {
        it("revalidates both the list and the config detail path on success", async () => {
            mockSession();
            const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
                new Response(
                    JSON.stringify({
                        status: "accepted",
                        task_id: "task-1",
                        backfill_job_id: "job-1",
                        sync_run_id: "run-1",
                    }),
                    { status: 202 },
                ),
            );

            const result = await triggerBackfill("cfg-coverage", "2026-06-01", "2026-06-05");

            expect(result.data?.sync_run_id).toBe("run-1");
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/sync");
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/sync/cfg-coverage");
            fetchSpy.mockRestore();
        });
    });

    describe("getActiveBackfillJob", () => {
        it("returns the config's non-terminal job, filtered client-side from the org-wide list", async () => {
            mockSession();
            const jobs = [
                {
                    id: "job-other-config",
                    sync_config_id: "cfg-other",
                    status: "running",
                    since_date: "2026-06-01",
                    before_date: "2026-06-05",
                    total_chunks: 1,
                    completed_chunks: 0,
                    failed_chunks: 0,
                    progress_pct: 0,
                    error_message: null,
                    started_at: null,
                    completed_at: null,
                    created_at: "2026-06-01T00:00:00Z",
                    updated_at: "2026-06-01T00:00:00Z",
                },
                {
                    id: "job-completed",
                    sync_config_id: "cfg-coverage",
                    status: "completed",
                    since_date: "2026-05-01",
                    before_date: "2026-05-05",
                    total_chunks: 1,
                    completed_chunks: 1,
                    failed_chunks: 0,
                    progress_pct: 100,
                    error_message: null,
                    started_at: "2026-05-01T00:00:00Z",
                    completed_at: "2026-05-01T01:00:00Z",
                    created_at: "2026-05-01T00:00:00Z",
                    updated_at: "2026-05-01T01:00:00Z",
                },
                {
                    id: "job-active",
                    sync_config_id: "cfg-coverage",
                    status: "running",
                    since_date: "2026-06-20",
                    before_date: "2026-06-26",
                    total_chunks: 6,
                    completed_chunks: 3,
                    failed_chunks: 0,
                    progress_pct: 50,
                    error_message: null,
                    started_at: hoursAgoIso(1),
                    completed_at: null,
                    created_at: hoursAgoIso(1),
                    updated_at: hoursAgoIso(1),
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(
                        JSON.stringify({ items: jobs, total: jobs.length, limit: 50, offset: 0 }),
                        { status: 200 },
                    ),
                );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data?.id).toBe("job-active");
            const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
            expect(url).toBe("http://test-ops:8000/api/v1/admin/backfill-jobs?limit=50&offset=0");
            fetchSpy.mockRestore();
        });

        it("returns null when the config has no non-terminal backfill job", async () => {
            mockSession();
            const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
                new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
                    status: 200,
                }),
            );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data).toBeNull();
            fetchSpy.mockRestore();
        });

        it("treats a fanout 'planned' job as active (a just-submitted backfill must be visible)", async () => {
            mockSession();
            const jobs = [
                {
                    id: "job-planned",
                    sync_config_id: "cfg-coverage",
                    status: "planned",
                    since_date: "2026-06-20",
                    before_date: "2026-06-26",
                    total_chunks: 0,
                    completed_chunks: 0,
                    failed_chunks: 0,
                    progress_pct: 0,
                    error_message: null,
                    started_at: null,
                    completed_at: null,
                    created_at: hoursAgoIso(1),
                    updated_at: hoursAgoIso(1),
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(
                        JSON.stringify({ items: jobs, total: jobs.length, limit: 50, offset: 0 }),
                        { status: 200 },
                    ),
                );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data?.id).toBe("job-planned");
            fetchSpy.mockRestore();
        });

        it("excludes a non-terminal job older than the staleness cutoff (zombie backfill, CHAOS-2868)", async () => {
            mockSession();
            const jobs = [
                {
                    id: "job-zombie",
                    sync_config_id: "cfg-coverage",
                    status: "dispatching",
                    since_date: "2026-06-01",
                    before_date: "2026-06-05",
                    total_chunks: 0,
                    completed_chunks: 0,
                    failed_chunks: 0,
                    progress_pct: 0,
                    error_message: null,
                    started_at: null,
                    completed_at: null,
                    created_at: hoursAgoIso(48),
                    updated_at: hoursAgoIso(48),
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(
                        JSON.stringify({ items: jobs, total: jobs.length, limit: 50, offset: 0 }),
                        { status: 200 },
                    ),
                );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data).toBeNull();
            fetchSpy.mockRestore();
        });

        it("treats a zero-progress job as active when it recently started even if it was created long ago", async () => {
            mockSession();
            const jobs = [
                {
                    id: "job-late-dispatch",
                    sync_config_id: "cfg-coverage",
                    status: "dispatching",
                    since_date: "2026-06-01",
                    before_date: "2026-06-05",
                    total_chunks: 0,
                    completed_chunks: 0,
                    failed_chunks: 0,
                    progress_pct: 0,
                    error_message: null,
                    started_at: hoursAgoIso(1),
                    completed_at: null,
                    created_at: hoursAgoIso(48),
                    updated_at: hoursAgoIso(1),
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(
                        JSON.stringify({ items: jobs, total: jobs.length, limit: 50, offset: 0 }),
                        { status: 200 },
                    ),
                );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data?.id).toBe("job-late-dispatch");
            fetchSpy.mockRestore();
        });

        it("keeps a progressed job visible when its freshness timestamp is recent", async () => {
            mockSession();
            const jobs = [
                {
                    id: "job-long-running",
                    sync_config_id: "cfg-coverage",
                    status: "running",
                    since_date: "2026-06-01",
                    before_date: "2026-06-05",
                    total_chunks: 5,
                    completed_chunks: 3,
                    failed_chunks: 0,
                    progress_pct: 60,
                    error_message: null,
                    started_at: hoursAgoIso(48),
                    completed_at: null,
                    created_at: hoursAgoIso(48),
                    updated_at: hoursAgoIso(1),
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(
                        JSON.stringify({ items: jobs, total: jobs.length, limit: 50, offset: 0 }),
                        { status: 200 },
                    ),
                );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data?.id).toBe("job-long-running");
            fetchSpy.mockRestore();
        });

        it("excludes a progressed non-terminal job when its freshness timestamp is stale (CHAOS-2872)", async () => {
            mockSession();
            const jobs = [
                {
                    id: "job-progress-zombie",
                    sync_config_id: "cfg-coverage",
                    status: "running",
                    since_date: "2026-06-01",
                    before_date: "2026-06-05",
                    total_chunks: 5,
                    completed_chunks: 2,
                    failed_chunks: 0,
                    progress_pct: 40,
                    error_message: null,
                    started_at: hoursAgoIso(48),
                    completed_at: null,
                    created_at: hoursAgoIso(48),
                    updated_at: hoursAgoIso(48),
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(
                        JSON.stringify({ items: jobs, total: jobs.length, limit: 50, offset: 0 }),
                        { status: 200 },
                    ),
                );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data).toBeNull();
            fetchSpy.mockRestore();
        });

        it("treats a zero-progress job with no parseable timestamps as not stale (defensive against a malformed row, CHAOS-2868 review)", async () => {
            mockSession();
            const jobs = [
                {
                    id: "job-no-timestamps",
                    sync_config_id: "cfg-coverage",
                    status: "pending",
                    since_date: "2026-06-01",
                    before_date: "2026-06-05",
                    total_chunks: 0,
                    completed_chunks: 0,
                    failed_chunks: 0,
                    progress_pct: 0,
                    error_message: null,
                    started_at: null,
                    completed_at: null,
                    created_at: null,
                    updated_at: null,
                },
            ];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(
                        JSON.stringify({ items: jobs, total: jobs.length, limit: 50, offset: 0 }),
                        { status: 200 },
                    ),
                );

            const result = await getActiveBackfillJob("cfg-coverage");

            expect(result.data?.id).toBe("job-no-timestamps");
            fetchSpy.mockRestore();
        });
    });
});

describe("admin/server user list actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it("listUsers includes org header and q query", async () => {
        mockSession();
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

        const result = await listUsers("alice");

        expect(result.error).toBeUndefined();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toContain("/api/v1/admin/users?q=alice");
        expect(options?.headers).toMatchObject({
            Authorization: "Bearer test-token",
            "X-Org-Id": "org-1",
        });
        fetchSpy.mockRestore();
    });

    it("listPlatformUsers omits org header and supports q query", async () => {
        mockSession();
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

        const result = await listPlatformUsers("bob");

        expect(result.error).toBeUndefined();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toContain("/api/v1/admin/users?q=bob");
        const headers = options?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer test-token");
        expect(headers["X-Org-Id"]).toBeUndefined();
        fetchSpy.mockRestore();
    });
});

describe("admin/server entitlement actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it("gets current org entitlements with the current org token", async () => {
        mockSession();
        const entitlements = {
            org_id: "org-1",
            tier: "enterprise",
            licensed_users: null,
            licensed_repos: null,
            features: { capacity_forecast: true },
            features_override: null,
            limits_override: null,
            expires_at: null,
            is_valid: true,
            limits: {},
        };
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response(JSON.stringify(entitlements), { status: 200 }));

        const result = await getOrgEntitlements("org-1");

        expect(result.data?.features.capacity_forecast).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toBe("http://test-ops:8000/api/v1/licensing/entitlements/org-1");
        expect(options?.headers).toMatchObject({
            Authorization: "Bearer test-token",
            "X-Org-Id": "org-1",
        });
        fetchSpy.mockRestore();
    });
});

describe("admin/server audit log actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    describe("listAuditLogs", () => {
        it("returns audit logs on success", async () => {
            mockSession();
            const resp = {
                items: [
                    {
                        id: "al-1",
                        org_id: "org-1",
                        user_id: "u-1",
                        action: "user.login",
                        resource_type: "user",
                        resource_id: "u-1",
                        description: null,
                        changes: null,
                        request_metadata: null,
                        status: "success",
                        error_message: null,
                        created_at: "2025-01-01T00:00:00Z",
                    },
                ],
                total: 1,
                limit: 50,
                offset: 0,
            };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

            const result = await listAuditLogs();
            expect(result.data).toBeDefined();
            expect(result.data?.items).toHaveLength(1);
            expect(result.error).toBeUndefined();
            fetchSpy.mockRestore();
        });

        it("returns error when not authenticated", async () => {
            mockAuth(null);
            const result = await listAuditLogs();
            expect(result.error).toBeDefined();
        });
    });

    describe("getAuditLog", () => {
        it("returns a single audit log on success", async () => {
            mockSession();
            const log = {
                id: "al-1",
                org_id: "org-1",
                user_id: "u-1",
                action: "user.login",
                resource_type: "user",
                resource_id: "u-1",
                description: null,
                changes: null,
                request_metadata: null,
                status: "success",
                error_message: null,
                created_at: "2025-01-01T00:00:00Z",
            };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(log), { status: 200 }));

            const result = await getAuditLog("al-1");
            expect(result.data).toBeDefined();
            expect(result.data?.id).toBe("al-1");
            fetchSpy.mockRestore();
        });
    });
});

const mockIPEntry = {
    id: "ip-1",
    org_id: "org-1",
    ip_range: "10.0.0.0/8",
    description: "Office network",
    is_active: true,
    created_by_id: "u-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    expires_at: null,
};

describe("admin/server IP allowlist actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    describe("listIPAllowlistEntries", () => {
        it("returns entries on success", async () => {
            mockSession();
            const resp = { items: [mockIPEntry], total: 1, limit: 50, offset: 0 };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

            const result = await listIPAllowlistEntries();
            expect(result.data).toBeDefined();
            expect(result.data?.items).toHaveLength(1);
            expect(result.error).toBeUndefined();
            fetchSpy.mockRestore();
        });

        it("returns error when not authenticated", async () => {
            mockAuth(null);
            const result = await listIPAllowlistEntries();
            expect(result.error).toBeDefined();
        });

        it("returns human-readable error when backend returns feature gate detail", async () => {
            mockSession();
            const featureGateBody = {
                detail: {
                    error: "feature_not_licensed",
                    feature: "ip_allowlist",
                    required_tier: "enterprise",
                    current_tier: "free",
                },
            };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(featureGateBody), { status: 402 }));

            const result = await listIPAllowlistEntries();
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe("string");
            expect(result.error).toContain("enterprise");
            expect(result.error).toContain("free");
            expect(result.error).not.toContain("{");
            fetchSpy.mockRestore();
        });
    });

    describe("createIPAllowlistEntry", () => {
        it("calls revalidatePath after successful creation", async () => {
            mockSession();
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(mockIPEntry), { status: 200 }));

            const result = await createIPAllowlistEntry({
                ip_range: "10.0.0.0/8",
                description: "Office",
            });
            expect(result.data).toBeDefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/ip-allowlist");
            fetchSpy.mockRestore();
        });
    });

    describe("updateIPAllowlistEntry", () => {
        it("calls revalidatePath after successful update", async () => {
            mockSession();
            const updated = { ...mockIPEntry, is_active: false };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }));

            const result = await updateIPAllowlistEntry("ip-1", { is_active: false });
            expect(result.data).toBeDefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/ip-allowlist");
            fetchSpy.mockRestore();
        });
    });

    describe("deleteIPAllowlistEntry", () => {
        it("calls revalidatePath after successful deletion", async () => {
            mockSession();
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(null, { status: 204 }));

            const result = await deleteIPAllowlistEntry("ip-1");
            expect(result.error).toBeUndefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/ip-allowlist");
            fetchSpy.mockRestore();
        });
    });

    describe("checkIPAllowed", () => {
        it("returns check result on success", async () => {
            mockSession();
            const resp = { allowed: true, ip_address: "10.0.0.1" };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

            const result = await checkIPAllowed("10.0.0.1");
            expect(result.data).toBeDefined();
            expect(result.data?.allowed).toBe(true);
            fetchSpy.mockRestore();
        });
    });
});

const mockRetentionPolicy = {
    id: "rp-1",
    org_id: "org-1",
    resource_type: "audit_logs",
    retention_days: 90,
    description: "Keep audit logs for 90 days",
    is_active: true,
    last_run_at: null,
    last_run_deleted_count: null,
    next_run_at: null,
    created_by_id: "u-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
};

describe("admin/server retention policy actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    describe("listRetentionPolicies", () => {
        it("returns policies on success", async () => {
            mockSession();
            const resp = {
                items: [mockRetentionPolicy],
                total: 1,
                limit: 50,
                offset: 0,
            };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

            const result = await listRetentionPolicies();
            expect(result.data).toBeDefined();
            expect(result.data?.items).toHaveLength(1);
            expect(result.error).toBeUndefined();
            fetchSpy.mockRestore();
        });

        it("returns error when not authenticated", async () => {
            mockAuth(null);
            const result = await listRetentionPolicies();
            expect(result.error).toBeDefined();
        });
    });

    describe("createRetentionPolicy", () => {
        it("calls revalidatePath after successful creation", async () => {
            mockSession();
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(
                    new Response(JSON.stringify(mockRetentionPolicy), { status: 200 }),
                );

            const result = await createRetentionPolicy({
                resource_type: "audit_logs",
                retention_days: 90,
            });
            expect(result.data).toBeDefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/retention");
            fetchSpy.mockRestore();
        });
    });

    describe("updateRetentionPolicy", () => {
        it("calls revalidatePath after successful update", async () => {
            mockSession();
            const updated = { ...mockRetentionPolicy, retention_days: 180 };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }));

            const result = await updateRetentionPolicy("rp-1", {
                retention_days: 180,
            });
            expect(result.data).toBeDefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/retention");
            fetchSpy.mockRestore();
        });
    });

    describe("deleteRetentionPolicy", () => {
        it("calls revalidatePath after successful deletion", async () => {
            mockSession();
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(null, { status: 204 }));

            const result = await deleteRetentionPolicy("rp-1");
            expect(result.error).toBeUndefined();
            expect(revalidatePath).toHaveBeenCalledWith("/org/admin/retention");
            fetchSpy.mockRestore();
        });
    });

    describe("executeRetentionPolicy", () => {
        it("returns execution result on success", async () => {
            mockSession();
            const resp = { deleted_count: 42, error: null };
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

            const result = await executeRetentionPolicy("rp-1", true);
            expect(result.data).toBeDefined();
            expect(result.data?.deleted_count).toBe(42);
            fetchSpy.mockRestore();
        });
    });

    describe("listRetentionResourceTypes", () => {
        it("returns resource types on success", async () => {
            mockSession();
            const types = ["audit_logs", "metrics", "work_items"];
            const fetchSpy = vi
                .spyOn(global, "fetch")
                .mockResolvedValue(new Response(JSON.stringify(types), { status: 200 }));

            const result = await listRetentionResourceTypes();
            expect(result.data).toBeDefined();
            expect(result.data).toHaveLength(3);
            fetchSpy.mockRestore();
        });
    });
});

describe("admin/server team drift-review actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it("approveTeamChanges posts change_ids (not change_indices)", async () => {
        mockSession();
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response(JSON.stringify({ approved: 2 }), { status: 200 }));

        const result = await approveTeamChanges("team-1", ["chg-1", "chg-2"]);

        expect(result.error).toBeUndefined();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toContain("/api/v1/admin/teams/team-1/approve-changes");
        const body = JSON.parse(String(options?.body ?? "{}"));
        expect(body).toMatchObject({
            change_ids: ["chg-1", "chg-2"],
            approve_all: false,
        });
        expect(body).not.toHaveProperty("change_indices");
        fetchSpy.mockRestore();
    });

    it("dismissTeamChanges posts change_ids (not change_indices)", async () => {
        mockSession();
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response(JSON.stringify({ dismissed: 1 }), { status: 200 }));

        const result = await dismissTeamChanges("team-1", ["chg-9"]);

        expect(result.error).toBeUndefined();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toContain("/api/v1/admin/teams/team-1/dismiss-changes");
        const body = JSON.parse(String(options?.body ?? "{}"));
        expect(body).toMatchObject({ change_ids: ["chg-9"], dismiss_all: false });
        expect(body).not.toHaveProperty("change_indices");
        fetchSpy.mockRestore();
    });
});
