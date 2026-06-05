import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/feedback/route";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn(async () => ({
        user: { id: "test-user-1", email: "test@example.com" },
        access_token: "test-token",
    })),
}));

vi.mock("@/lib/rate-limit", () => ({
    isRateLimited: vi.fn(async () => false),
}));

const payload = {
    title: "Feedback title",
    description: "Feedback description",
    type: "bug",
    url: "http://localhost/page",
    userAgent: "Vitest",
    timestamp: "2026-01-01T00:00:00.000Z",
};

const mockLinearResponse = {
    data: {
        issueCreate: {
            success: true,
            issue: {
                id: "issue-1",
                identifier: "CHAOS-879",
                url: "https://linear.app/chaos/issue/CHAOS-879",
            },
        },
    },
};

describe("POST /api/feedback CSRF origin validation", () => {
    beforeEach(() => {
        process.env.LINEAR_API_KEY = "linear-key";
        process.env.LINEAR_TEAM_ID = "team-id";
        process.env.NEXTAUTH_URL = "https://app.example.com/some/path";

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(mockLinearResponse), { status: 200 })),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
        delete process.env.LINEAR_API_KEY;
        delete process.env.LINEAR_TEAM_ID;
        delete process.env.NEXTAUTH_URL;
    });

    it("allows request with matching origin", async () => {
        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                origin: "https://app.example.com",
            },
            body: JSON.stringify(payload),
        });

        const response = await POST(request);

        expect(response.status).toBe(200);
    });

    it("returns 403 for mismatching origin", async () => {
        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                origin: "https://evil.example.com",
            },
            body: JSON.stringify(payload),
        });

        const response = await POST(request);
        const body = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(403);
        expect(body).toEqual({ success: false, error: "Forbidden" });
    });

    it("allows request without origin header", async () => {
        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const response = await POST(request);

        expect(response.status).toBe(200);
    });
});
