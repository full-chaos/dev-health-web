/**
 * Contract tests: assert that retentionApi and auditApi call request()
 * with the correct backend paths after the /retention-policies and
 * /audit-logs rename.
 *
 * platformAuditApi is intentionally excluded — its /platform/audit-logs
 * path was already correct and must not be changed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the request module before importing the API modules
vi.mock("../_request", () => ({
    request: vi.fn().mockResolvedValue({}),
}));

import { request } from "../_request";
import { retentionApi } from "../retention";
import { auditApi, platformAuditApi } from "../audit";
import { llmSettingsApi } from "../llm-settings";

const mockRequest = vi.mocked(request);

beforeEach(() => {
    mockRequest.mockClear();
});

// ---------------------------------------------------------------------------
// retentionApi — all paths must use /retention-policies
// ---------------------------------------------------------------------------
describe("retentionApi path contract", () => {
    it("list uses /retention-policies?limit=...&offset=...", async () => {
        await retentionApi.list(10, 5);
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/retention-policies?limit=10&offset=5");
    });

    it("get uses /retention-policies/:id", async () => {
        await retentionApi.get("abc-123");
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/retention-policies/abc-123");
    });

    it("create uses /retention-policies", async () => {
        await retentionApi.create({
            name: "test",
            resource_type: "repo",
            max_age_days: 30,
        } as Parameters<typeof retentionApi.create>[0]);
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/retention-policies");
    });

    it("update uses /retention-policies/:id", async () => {
        await retentionApi.update("abc-123", { max_age_days: 60 } as Parameters<
            typeof retentionApi.update
        >[1]);
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/retention-policies/abc-123");
    });

    it("delete uses /retention-policies/:id", async () => {
        await retentionApi.delete("abc-123");
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/retention-policies/abc-123");
    });

    it("execute uses /retention-policies/:id/execute", async () => {
        await retentionApi.execute("abc-123");
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/retention-policies/abc-123/execute");
    });

    it("resourceTypes uses /retention-policies/resource-types", async () => {
        await retentionApi.resourceTypes();
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/retention-policies/resource-types");
    });

    it("does NOT use the old /retention prefix", async () => {
        await retentionApi.list();
        const path = mockRequest.mock.calls[0][0] as string;
        expect(path).not.toMatch(/^\/retention(?!-policies)/);
    });
});

// ---------------------------------------------------------------------------
// auditApi — all paths must use /audit-logs
// ---------------------------------------------------------------------------
describe("auditApi path contract", () => {
    it("list uses /audit-logs?...", async () => {
        await auditApi.list(undefined, 20, 0);
        expect(mockRequest).toHaveBeenCalledOnce();
        const path = mockRequest.mock.calls[0][0] as string;
        expect(path).toMatch(/^\/audit-logs\?/);
    });

    it("get uses /audit-logs/:id", async () => {
        await auditApi.get("log-456");
        expect(mockRequest).toHaveBeenCalledOnce();
        expect(mockRequest.mock.calls[0][0]).toBe("/audit-logs/log-456");
    });

    it("does NOT use the old /audit prefix (without -logs)", async () => {
        await auditApi.list();
        const path = mockRequest.mock.calls[0][0] as string;
        expect(path).not.toMatch(/^\/audit(?!-logs)/);
    });
});

// ---------------------------------------------------------------------------
// platformAuditApi — must remain on /platform/audit-logs (unchanged)
// ---------------------------------------------------------------------------
describe("platformAuditApi path contract (must not be changed)", () => {
    it("list uses /platform/audit-logs?...", async () => {
        await platformAuditApi.list();
        expect(mockRequest).toHaveBeenCalledOnce();
        const path = mockRequest.mock.calls[0][0] as string;
        expect(path).toMatch(/^\/platform\/audit-logs\?/);
    });
});

describe("llmSettingsApi budget contract", () => {
    it("reads the enforceable organization budget from the v1 admin path", async () => {
        await llmSettingsApi.budget("token", "org-1");

        expect(mockRequest).toHaveBeenCalledWith("/llm-settings/budget", {}, "token", "org-1");
    });

    it("preserves an explicit zero hard stop in the settings payload", async () => {
        await llmSettingsApi.upsert(
            { provider: "openai", budget_limit_micro_usd: 0 },
            "token",
            "org-1",
        );

        expect(mockRequest).toHaveBeenCalledWith(
            "/llm-settings",
            {
                method: "PUT",
                body: JSON.stringify({ provider: "openai", budget_limit_micro_usd: 0 }),
            },
            "token",
            "org-1",
        );
    });
});
