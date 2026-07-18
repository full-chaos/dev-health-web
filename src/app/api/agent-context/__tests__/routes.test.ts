import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/acr/service", () => ({
    createContextPacket: vi.fn(),
    getExpandedEvidence: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { auth } from "@/lib/auth";
import { createContextPacket, getExpandedEvidence } from "@/lib/acr/service";
import { POST } from "../context-packets/route";
import { GET } from "../evidence/[evidenceRefId]/route";

describe("agent-context API routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({
            expires: "2026-07-16T00:00:00.000Z",
            user: { id: "user-1", is_superuser: false },
        });
    });

    it("passes a narrow packet form to the server-only service and returns no-store data", async () => {
        vi.mocked(createContextPacket).mockResolvedValue({ schema_version: "context_packet.v1" });
        const request = new Request("http://web.example.test/api/agent-context/context-packets", {
            body: JSON.stringify({
                goal: "Verify request-bound assertions",
                repository: "full-chaos/dev-health-acr",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
        });

        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ schema_version: "context_packet.v1" });
        expect(vi.mocked(createContextPacket)).toHaveBeenCalledWith({
            body: {
                goal: "Verify request-bound assertions",
                repository: "full-chaos/dev-health-acr",
            },
            signal: request.signal,
        });
    });

    it("returns a safe invalid-request response without invoking ACR for malformed JSON", async () => {
        const request = new Request("http://web.example.test/api/agent-context/context-packets", {
            body: "{",
            method: "POST",
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toEqual({
            error: {
                code: acrRuntimeErrorCodes.invalidRequest,
                message: "The context request is invalid.",
                retryable: false,
            },
        });
        expect(createContextPacket).not.toHaveBeenCalled();
    });

    it("returns 413 without invoking ACR when the packet body exceeds the boundary", async () => {
        const request = new Request("http://web.example.test/api/agent-context/context-packets", {
            body: JSON.stringify({ goal: "x".repeat(64 * 1_024) }),
            method: "POST",
        });

        const response = await POST(request);

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({
            error: {
                code: acrRuntimeErrorCodes.invalidRequest,
                message: "The context request is invalid.",
                retryable: false,
            },
        });
        expect(createContextPacket).not.toHaveBeenCalled();
    });

    it("sanitizes runtime failure details from the packet response", async () => {
        vi.mocked(createContextPacket).mockRejectedValue(
            new AcrRuntimeError(acrRuntimeErrorCodes.upstream, "credential=do-not-leak", {
                retryable: true,
                status: 503,
            }),
        );
        const response = await POST(
            new Request("http://web.example.test/api/agent-context/context-packets", {
                body: JSON.stringify({ goal: "Verify", repository: "full-chaos/dev-health-acr" }),
                method: "POST",
            }),
        );

        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("credential=do-not-leak");
    });

    it("returns a safe gated response when an invalid entitlement blocks the service", async () => {
        vi.mocked(createContextPacket).mockRejectedValue(
            new AcrRuntimeError(
                acrRuntimeErrorCodes.notEntitled,
                "expired entitlement assertion is not valid",
                { status: 403 },
            ),
        );

        const response = await POST(
            new Request("http://web.example.test/api/agent-context/context-packets", {
                body: JSON.stringify({ goal: "Verify", repository: "full-chaos/dev-health-acr" }),
                method: "POST",
            }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: {
                code: acrRuntimeErrorCodes.notEntitled,
                message: "Agent Context Runtime is not available for this organization.",
                retryable: false,
            },
        });
        expect(createContextPacket).toHaveBeenCalledTimes(1);
    });

    it("strips retrieval debug information for a non-superuser browser response", async () => {
        vi.mocked(createContextPacket).mockResolvedValue({
            retrieval_debug_summary: "internal retrieval trace",
            schema_version: "context_packet.v1",
        });

        const response = await POST(
            new Request("http://web.example.test/api/agent-context/context-packets", {
                body: JSON.stringify({ goal: "Verify", repository: "full-chaos/dev-health-acr" }),
                method: "POST",
            }),
        );

        expect(await response.json()).toEqual({ schema_version: "context_packet.v1" });
    });

    it("retains retrieval debug information only for a server-authorized superuser", async () => {
        vi.mocked(auth).mockResolvedValue({
            expires: "2026-07-16T00:00:00.000Z",
            user: { id: "user-1", is_superuser: true },
        });
        vi.mocked(createContextPacket).mockResolvedValue({
            retrieval_debug_summary: "internal retrieval trace",
            schema_version: "context_packet.v1",
        });

        const response = await POST(
            new Request("http://web.example.test/api/agent-context/context-packets", {
                body: JSON.stringify({ goal: "Verify", repository: "full-chaos/dev-health-acr" }),
                method: "POST",
            }),
        );

        expect(await response.json()).toEqual({
            retrieval_debug_summary: "internal retrieval trace",
            schema_version: "context_packet.v1",
        });
    });

    it("sanitizes an unknown internal configuration failure from the packet response", async () => {
        vi.mocked(createContextPacket).mockRejectedValue(
            new Error(
                "ACR_API_ORIGIN=https://private.example.test X-ACR-Web-Assertion=secret fcacr_secret",
            ),
        );
        const response = await POST(
            new Request("http://web.example.test/api/agent-context/context-packets", {
                body: JSON.stringify({ goal: "Verify", repository: "full-chaos/dev-health-acr" }),
                method: "POST",
            }),
        );
        const responseBody = await response.text();

        expect(response.status).toBe(503);
        expect(responseBody).toContain("Agent Context Runtime is temporarily unavailable.");
        expect(responseBody).not.toMatch(/ACR_API_ORIGIN|X-ACR-Web-Assertion|fcacr_secret/u);
    });

    it("forwards only an evidence handle and repository selector into the narrowed evidence service", async () => {
        vi.mocked(getExpandedEvidence).mockResolvedValue({
            schema_version: "expanded_evidence.v1",
        });
        const request = new Request(
            "http://web.example.test/api/agent-context/evidence/evidence-123?repository=full-chaos%2Fdev-health-acr",
        );

        const response = await GET(request, {
            params: Promise.resolve({ evidenceRefId: "evidence-123" }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(vi.mocked(getExpandedEvidence)).toHaveBeenCalledWith({
            evidenceRefId: "evidence-123",
            repository: "full-chaos/dev-health-acr",
            signal: request.signal,
        });
    });

    it("does not expose a foreign evidence selector failure", async () => {
        vi.mocked(getExpandedEvidence).mockRejectedValue(
            new AcrRuntimeError(
                acrRuntimeErrorCodes.repositoryNotAvailable,
                "private repository name",
                { status: 404 },
            ),
        );

        const response = await GET(
            new Request(
                "http://web.example.test/api/agent-context/evidence/evidence-123?repository=foreign%2Frepository",
            ),
            { params: Promise.resolve({ evidenceRefId: "evidence-123" }) },
        );

        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain("private repository name");
    });

    it("sanitizes an unknown internal configuration failure from the evidence response", async () => {
        vi.mocked(getExpandedEvidence).mockRejectedValue(
            new Error("ACR_WEB_ASSERTION_KEY_FILE=/secret/key BEGIN PRIVATE KEY"),
        );
        const response = await GET(
            new Request(
                "http://web.example.test/api/agent-context/evidence/evidence-123?repository=foreign%2Frepository",
            ),
            { params: Promise.resolve({ evidenceRefId: "evidence-123" }) },
        );
        const responseBody = await response.text();

        expect(response.status).toBe(503);
        expect(responseBody).toContain("Agent Context Runtime is temporarily unavailable.");
        expect(responseBody).not.toMatch(/ACR_WEB_ASSERTION_KEY_FILE|BEGIN PRIVATE KEY/u);
    });
});
