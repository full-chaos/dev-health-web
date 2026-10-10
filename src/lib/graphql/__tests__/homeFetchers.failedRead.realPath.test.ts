/**
 * The Home read through the REAL server GraphQL client (CHAOS-9189): only `fetch`, the session and
 * the logger are replaced. It proves the log line reads the HTTP status and the error class from
 * what the real client throws, not from a shape made by a test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stallingFetch } from "@/test/stallFetch";

const { error } = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger", () => {
    const l = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error, child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/origin", () => ({
    getBackendUrl: () => "http://backend.test",
    resolveOrigin: () => "http://backend.test",
}));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ access_token: "tok-abc", user: { org_id: "org-secret-1" } }),
}));

import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import type { MetricFilter } from "@/lib/filters/types";
import { overrideDeadlinesForTests } from "@/lib/serverDeadline";

const filters = (): MetricFilter => ({
    scope: { level: "team", ids: ["team-payments"] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: ["acme/web"] },
    why: { work_category: [] },
    how: {},
});

const homeFailureLines = () => error.mock.calls.filter(([, msg]) => msg === "Home read failed");
const respond = (status: number, body: string) =>
    vi.fn(
        async () => new Response(body, { status, headers: { "content-type": "application/json" } }),
    );

beforeEach(() => error.mockClear());
afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.unstubAllGlobals();
});

describe("Home read through the real GraphQL client: one loud line per failure (CHAOS-9189)", () => {
    it("HTTP 503: rejects; the line says http 503 and holds no served text, id or token", async () => {
        vi.stubGlobal("fetch", respond(503, "upstream failed for team Payments"));

        await expect(getHomeDataViaGraphQL(filters())).rejects.toThrow();

        const lines = homeFailureLines();
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toEqual({
            operation: "home",
            error_class: "http",
            status: 503,
            elapsed_ms: expect.any(Number),
        });
        const written = JSON.stringify(lines[0]);
        for (const secret of ["Payments", "team-payments", "acme", "org-secret-1", "tok-abc"]) {
            expect(written).not.toContain(secret);
        }
    });

    it("a 200 with GraphQL errors: rejects; the line says graphql 200, without the error text", async () => {
        vi.stubGlobal(
            "fetch",
            respond(
                200,
                JSON.stringify({ errors: [{ message: "repository acme/web not comparable" }] }),
            ),
        );

        await expect(getHomeDataViaGraphQL(filters())).rejects.toThrow();

        const lines = homeFailureLines();
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toEqual({
            operation: "home",
            error_class: "graphql",
            status: 200,
            elapsed_ms: expect.any(Number),
        });
        expect(JSON.stringify(lines[0])).not.toContain("acme");
    });

    it("a 200 with `home: null`: rejects (a failed read, not an empty answer); the line says shape", async () => {
        vi.stubGlobal("fetch", respond(200, JSON.stringify({ data: { home: null } })));

        await expect(getHomeDataViaGraphQL(filters())).rejects.toThrow();

        const lines = homeFailureLines();
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toMatchObject({ operation: "home", error_class: "shape" });
    });

    it("a read that never answers: rejects at the read deadline; the line says deadline", async () => {
        overrideDeadlinesForTests({ read: 40, auth: 40, outerMargin: 60 });
        vi.stubGlobal("fetch", stallingFetch());

        await expect(getHomeDataViaGraphQL(filters())).rejects.toThrow();

        const lines = homeFailureLines();
        expect(lines).toHaveLength(1);
        const fields = lines[0][0] as { error_class: string; elapsed_ms: number };
        expect(fields).toEqual({
            operation: "home",
            error_class: "deadline",
            elapsed_ms: expect.any(Number),
        });
        // The deadline handling is unchanged: the read ends at its 40 ms deadline, not later.
        expect(fields.elapsed_ms).toBeGreaterThanOrEqual(35);
        expect(fields.elapsed_ms).toBeLessThan(2000);
    });
});
