/**
 * Contract tests: assert that customerPushApi calls request() with the
 * correct backend paths, methods, and query-string shapes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_request", () => ({
    request: vi.fn().mockResolvedValue({}),
}));

import { request } from "../_request";
import { customerPushApi } from "../customer-push";

const mockRequest = vi.mocked(request);

beforeEach(() => {
    mockRequest.mockClear();
});

describe("customerPushApi path contract", () => {
    it("listSources never appends a system query string — the real endpoint has no server-side filter", async () => {
        await customerPushApi.listSources();
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/sources");
    });

    it("createSource POSTs to /customer-push/sources", async () => {
        await customerPushApi.createSource({
            system: "github",
            instance: "acme/api",
            display_name: "Acme",
        });
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/sources");
        expect((mockRequest.mock.calls[0][1] as RequestInit).method).toBe("POST");
    });

    it("getSource/updateSource use /customer-push/sources/:id", async () => {
        await customerPushApi.getSource("src-1");
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/sources/src-1");

        await customerPushApi.updateSource("src-1", { enabled: false });
        expect(mockRequest.mock.calls[1][0]).toBe("/customer-push/sources/src-1");
        expect((mockRequest.mock.calls[1][1] as RequestInit).method).toBe("PATCH");
    });

    it("token endpoints use the pinned fcpush_-issuing routes", async () => {
        await customerPushApi.listTokens("src-1");
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/sources/src-1/tokens");

        await customerPushApi.createToken("src-1", {
            name: "CI",
            scopes: ["schema:read"],
        });
        expect(mockRequest.mock.calls[1][0]).toBe("/customer-push/sources/src-1/tokens");
        expect((mockRequest.mock.calls[1][1] as RequestInit).method).toBe("POST");

        await customerPushApi.rotateToken("tok-1");
        expect(mockRequest.mock.calls[2][0]).toBe("/customer-push/tokens/tok-1/rotate");

        await customerPushApi.revokeToken("tok-1");
        expect(mockRequest.mock.calls[3][0]).toBe("/customer-push/tokens/tok-1/revoke");
    });

    it("listBatches builds the query string from only the provided filters", async () => {
        await customerPushApi.listBatches("src-1", { status: "completed", producer: undefined });
        expect(mockRequest.mock.calls[0][0]).toBe(
            "/customer-push/sources/src-1/batches?status=completed",
        );
    });

    it("listBatches omits the query string entirely when no filters are set", async () => {
        await customerPushApi.listBatches("src-1", {});
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/sources/src-1/batches");
    });

    it("getBatch uses /customer-push/batches/:ingestion_id (not nested under sources)", async () => {
        await customerPushApi.getBatch("batch-1");
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/batches/batch-1");
    });

    it("schemas endpoints are public-shaped reads", async () => {
        await customerPushApi.listSchemas();
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/schemas");

        await customerPushApi.getSchema("external-ingest.v1");
        expect(mockRequest.mock.calls[1][0]).toBe("/customer-push/schemas/external-ingest.v1");
    });

    it("validate POSTs to /customer-push/sources/:id/validate", async () => {
        await customerPushApi.validate("src-1", { records: [] });
        expect(mockRequest.mock.calls[0][0]).toBe("/customer-push/sources/src-1/validate");
        expect((mockRequest.mock.calls[0][1] as RequestInit).method).toBe("POST");
    });

    it("does not expose a console-push route (D6/CC25 overrule — validate-only in v1)", () => {
        expect((customerPushApi as Record<string, unknown>).pushFromConsole).toBeUndefined();
    });
});
