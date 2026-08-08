import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({
        user: { id: "test-user-1", email: "test@example.com" },
        access_token: "test-token",
    }),
}));

// Redis is the only rate-limit backend (CHAOS-3589 removed the in-memory
// fallback), so tests choose per case whether it is reachable.
const redisState = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/redis", () => ({
    getRedis: () => redisState.client,
    _resetRedisClient: vi.fn(),
}));

/**
 * Minimal fixed-window counter with the same contract `rate-limit.ts` drives:
 * one EVAL that increments and anchors a TTL, and a TTL read for Retry-After.
 */
function fakeRedis() {
    const counts = new Map<string, number>();
    return {
        eval: async (_script: string, _numKeys: number, key: string) => {
            const next = (counts.get(key) ?? 0) + 1;
            counts.set(key, next);
            return next;
        },
        ttl: async () => 3600,
    };
}
describe("POST /api/feedback", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        // Default: Redis reachable, so the limiter actually enforces.
        redisState.client = fakeRedis();
        // Clear environment variables
        delete process.env.LINEAR_API_KEY;
        delete process.env.LINEAR_TEAM_ID;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns 503 when LINEAR_API_KEY is missing", async () => {
        process.env.LINEAR_TEAM_ID = "team-123";
        delete process.env.LINEAR_API_KEY;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(503);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Feedback service not configured");
    });

    it("returns 503 when LINEAR_TEAM_ID is missing", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        delete process.env.LINEAR_TEAM_ID;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(503);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Feedback service not configured");
    });

    it("returns 400 when title is empty", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Title is required");
    });

    it("returns 400 when title is only whitespace", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "   ",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(400);
        expect(data.error).toBe("Title is required");
    });

    it("returns 400 when description is empty", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Description is required");
    });

    it("returns 400 when description is only whitespace", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "   ",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(400);
        expect(data.error).toBe("Description is required");
    });

    it("returns 400 when type is invalid", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "invalid",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Invalid feedback type");
    });

    it("returns 200 with success response on valid bug submission", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-123",
                                    identifier: "ENG-456",
                                    url: "https://linear.app/issue/ENG-456",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as {
            success: boolean;
            issueId?: string;
            issueUrl?: string;
        };

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.issueId).toBe("ENG-456");
        expect(data.issueUrl).toBe("https://linear.app/issue/ENG-456");

        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalledOnce();
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[0]).toBe("https://api.linear.app/graphql");
        expect(callArgs[1]?.method).toBe("POST");
        expect(callArgs[1]?.headers).toEqual({
            Authorization: "key-123",
            "Content-Type": "application/json",
        });

        const body = JSON.parse(callArgs[1]?.body as string);
        expect(body.variables.input.teamId).toBe("team-123");
        expect(body.variables.input.title).toBe("Test Bug");
        expect(body.variables.input.priority).toBe(2); // bug priority
    });

    it("returns 200 with success response on valid feature submission", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-789",
                                    identifier: "ENG-789",
                                    url: "https://linear.app/issue/ENG-789",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "New Feature",
                description: "Feature description",
                type: "feature",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as {
            success: boolean;
            issueId?: string;
            issueUrl?: string;
        };

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify priority mapping for feature
        const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
        expect(body.variables.input.priority).toBe(3); // feature priority
    });

    it("returns 200 with success response on valid question submission", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-999",
                                    identifier: "ENG-999",
                                    url: "https://linear.app/issue/ENG-999",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Question",
                description: "Question description",
                type: "question",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as {
            success: boolean;
            issueId?: string;
            issueUrl?: string;
        };

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify priority mapping for question
        const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
        expect(body.variables.input.priority).toBe(4); // question priority
    });

    it("includes metadata in description sent to Linear", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-123",
                                    identifier: "ENG-456",
                                    url: "https://linear.app/issue/ENG-456",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const testUrl = "http://example.com/page";
        const testUserAgent = "Mozilla/5.0 Test";
        const testTimestamp = "2024-01-01T12:00:00Z";

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Original description",
                type: "bug",
                url: testUrl,
                userAgent: testUserAgent,
                timestamp: testTimestamp,
            }),
        });

        await POST(request);

        const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
        const description = body.variables.input.description;

        expect(description).toContain("Original description");
        expect(description).toContain(`URL: ${testUrl}`);
        expect(description).toContain(`User Agent: ${testUserAgent}`);
        expect(description).toContain(`Timestamp: ${testTimestamp}`);
        expect(description).toContain("Type: bug");
    });

    it("returns 500 when Linear API returns error response", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        errors: [{ message: "Authentication failed" }],
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Failed to submit feedback");
    });

    it("returns 500 when Linear API returns non-ok status", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi
            .fn()
            .mockImplementation(() =>
                Promise.resolve(new Response("Internal Server Error", { status: 500 })),
            );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Failed to submit feedback");
    });

    it("returns 500 when issueCreate.success is false", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: false,
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Failed to submit feedback");
    });

    it("returns 500 when issue is missing from response", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: null,
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Failed to submit feedback");
    });

    it("returns 429 when rate limit is exceeded (6th request from same IP)", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-123",
                                    identifier: "ENG-456",
                                    url: "https://linear.app/issue/ENG-456",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const testIp = "192.168.1.1";

        // Make 5 successful requests
        for (let i = 0; i < 5; i++) {
            const request = new Request("http://localhost/api/feedback", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-forwarded-for": testIp,
                },
                body: JSON.stringify({
                    title: `Test Bug ${i}`,
                    description: "Test description",
                    type: "bug",
                    url: "http://example.com",
                    userAgent: "Mozilla/5.0",
                    timestamp: "2024-01-01T00:00:00Z",
                }),
            });

            const response = await POST(request);
            expect(response.status).toBe(200);
        }

        // 6th request should be rate limited
        const rateLimitedRequest = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-forwarded-for": testIp,
            },
            body: JSON.stringify({
                title: "Test Bug 6",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(rateLimitedRequest);
        const data = (await response.json()) as { success: boolean; error?: string };

        expect(response.status).toBe(429);
        expect(data.success).toBe(false);
        expect(data.error).toBe("Rate limit exceeded. Please try again later.");
    });

    it("is NOT rate limited when Redis is unavailable (fail-open, CHAOS-3589)", async () => {
        // This route passes no `failClosed`, so with the in-memory fallback gone
        // an unreachable Redis means no limit at all — requests are no longer
        // silently counted in-process. Asserted here so the degraded posture is a
        // stated property of the route rather than an accident of the limiter.
        //
        // NOTE: this is a real reduction in protection during a Redis outage.
        // Flipping this route to `failClosed: true` is a one-line change and is
        // pending a call from the team lead.
        redisState.client = null;
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        // A fresh Response per call: one instance would have its body consumed by
        // the first read and fail every subsequent request.
        global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "i",
                                    identifier: "ENG-1",
                                    url: "https://linear.app/i",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        const { POST } = await import("@/app/api/feedback/route");
        const body = JSON.stringify({
            title: "Test Bug",
            description: "Test description",
            type: "bug",
            url: "http://example.com",
            userAgent: "Mozilla/5.0",
            timestamp: "2024-01-01T00:00:00Z",
        });

        for (let i = 0; i < 8; i++) {
            const response = await POST(
                new Request("http://localhost/api/feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.9" },
                    body,
                }),
            );
            expect(response.status).toBe(200);
        }
    });

    it("allows requests from different users independently", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-123",
                                    identifier: "ENG-456",
                                    url: "https://linear.app/issue/ENG-456",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { auth } = await import("@/lib/auth");
        const mockedAuth = vi.mocked(auth);
        const { POST } = await import("@/app/api/feedback/route");

        // Make 5 requests as user-1 (default mock)
        for (let i = 0; i < 5; i++) {
            const request = new Request("http://localhost/api/feedback", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-forwarded-for": "192.168.1.1",
                },
                body: JSON.stringify({
                    title: `Test Bug ${i}`,
                    description: "Test description",
                    type: "bug",
                    url: "http://example.com",
                    userAgent: "Mozilla/5.0",
                    timestamp: "2024-01-01T00:00:00Z",
                }),
            });

            await POST(request);
        }

        // Switch to user-2 — should get its own independent rate limit
        mockedAuth.mockResolvedValue({
            user: { id: "test-user-2", email: "test2@example.com" },
            access_token: "test-token-2",
        } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

        for (let i = 0; i < 5; i++) {
            const request = new Request("http://localhost/api/feedback", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-forwarded-for": "192.168.1.2",
                },
                body: JSON.stringify({
                    title: `Test Bug ${i}`,
                    description: "Test description",
                    type: "bug",
                    url: "http://example.com",
                    userAgent: "Mozilla/5.0",
                    timestamp: "2024-01-01T00:00:00Z",
                }),
            });

            const response = await POST(request);
            expect(response.status).toBe(200);
        }
    });

    it("handles missing x-forwarded-for header gracefully", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-123",
                                    identifier: "ENG-456",
                                    url: "https://linear.app/issue/ENG-456",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Test Bug",
                description: "Test description",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
    });

    it("trims whitespace from title and description", async () => {
        process.env.LINEAR_API_KEY = "key-123";
        process.env.LINEAR_TEAM_ID = "team-123";

        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: {
                            issueCreate: {
                                success: true,
                                issue: {
                                    id: "issue-123",
                                    identifier: "ENG-456",
                                    url: "https://linear.app/issue/ENG-456",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            ),
        );

        global.fetch = mockFetch;

        const { POST } = await import("@/app/api/feedback/route");

        const request = new Request("http://localhost/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "  Test Bug  ",
                description: "  Test description  ",
                type: "bug",
                url: "http://example.com",
                userAgent: "Mozilla/5.0",
                timestamp: "2024-01-01T00:00:00Z",
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
        expect(body.variables.input.title).toBe("Test Bug");
        expect(body.variables.input.description).toContain("Test description");
    });
});
