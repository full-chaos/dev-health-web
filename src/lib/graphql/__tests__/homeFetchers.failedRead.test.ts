/**
 * The Home fetcher at its boundary (CHAOS-9189): a FAILED read THROWS and writes ONE structured log
 * line; an EMPTY answer is a value and writes none. The line holds the operation, the error class,
 * the HTTP status and the elapsed time: never the served error text, an id or a token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../urqlClient", () => ({ graphqlFetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-secret-1" }, access_token: "tok-abc" }),
}));
vi.mock("@/lib/logger", () => {
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    return { logger };
});

import { graphqlFetch } from "../urqlClient";
import { classifyHomeReadFailure, getHomeDataViaGraphQL } from "../homeFetchers";
import type { HomeGraphQLResult } from "../types";
import type { MetricFilter } from "@/lib/filters/types";
import { logger } from "@/lib/logger";
import { overrideDeadlinesForTests, withDeadline } from "@/lib/serverDeadline";

const mockedFetch = vi.mocked(graphqlFetch);
const errorLog = vi.mocked(logger.error);

/** A new object per call: the fetcher is memoized per filter object. */
const filters = (): MetricFilter => ({
    scope: { level: "team", ids: ["team-payments"] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: ["acme/web"] },
    why: { work_category: [] },
    how: {},
});

/** The error `graphqlFetch` throws: the urql error is its `cause`. */
const fetchError = (message: string, cause: object) =>
    new Error(`GraphQL error: ${message}`, { cause });

const EMPTY_ANSWER: HomeGraphQLResult = {
    freshness: { lastIngestedAt: null, latestSuccessfulSyncAt: null, sources: [], coverage: null },
    deltas: [],
    reworkThemeAllocation: [],
    summary: [],
    tiles: [],
    constraint: { title: "", claim: "", evidence: [], experiments: [] },
    events: [],
    healthState: { status: "no_data", headline: "", summary: "" },
    signals: [],
    limitingFactor: {
        claim: "",
        whyItMatters: "",
        recommendedAction: "",
        confidence: "low",
        evidenceRef: null,
    },
    dataConfidence: {
        level: "low",
        coveragePct: null,
        connectedSources: [],
        missingSources: [],
        caveats: [],
    },
    scopeDataConfidence: { level: "low", coveragePct: null, lastIngestedAt: null, caveats: [] },
} as unknown as HomeGraphQLResult;

/** The one "Home read failed" line of this test, as [fields, message]. */
const homeFailureLines = () =>
    (errorLog.mock.calls as unknown as [Record<string, unknown>, string][]).filter(
        (call) => call[1] === "Home read failed",
    );

beforeEach(() => {
    mockedFetch.mockReset();
    errorLog.mockClear();
});
afterEach(() => overrideDeadlinesForTests(null));

describe("getHomeDataViaGraphQL: a failed read is loud and is not an empty answer (CHAOS-9189)", () => {
    it("HTTP 503: rejects, and writes ONE line with the operation, the class, the status and the elapsed ms", async () => {
        mockedFetch.mockRejectedValue(
            fetchError("[Network] Service Unavailable", {
                networkError: new Error("Service Unavailable"),
                response: { status: 503 },
            }),
        );

        await expect(getHomeDataViaGraphQL(filters())).rejects.toThrow("Service Unavailable");

        const lines = homeFailureLines();
        expect(lines).toHaveLength(1);
        const fields = lines[0][0];
        expect(fields).toEqual({
            operation: "home",
            error_class: "http",
            status: 503,
            elapsed_ms: expect.any(Number),
        });
        expect(fields.elapsed_ms as number).toBeGreaterThanOrEqual(0);
    });

    it("GraphQL error on a 200: class 'graphql'; the served error text, the ids and the token are not in the line", async () => {
        mockedFetch.mockRejectedValue(
            fetchError("[GraphQL] repository acme/web of team Payments not comparable", {
                graphQLErrors: [{ message: "repository acme/web of team Payments not comparable" }],
                response: { status: 200 },
            }),
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
        const written = JSON.stringify(lines[0]);
        for (const secret of ["acme", "Payments", "team-payments", "org-secret-1", "tok-abc"]) {
            expect(written).not.toContain(secret);
        }
    });

    it("deadline: class 'deadline' for the error the deadline module made", async () => {
        overrideDeadlinesForTests({ read: 5 });
        const deadline = await withDeadline(new Promise<never>(() => {}), {
            kind: "read",
            op: "graphql query Home",
            layer: "inner",
        }).catch((error: unknown) => error);
        mockedFetch.mockRejectedValue(
            fetchError("[Network] deadline", { networkError: deadline, response: undefined }),
        );

        await expect(getHomeDataViaGraphQL(filters())).rejects.toThrow();

        const lines = homeFailureLines();
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toEqual({
            operation: "home",
            error_class: "deadline",
            elapsed_ms: expect.any(Number),
        });
    });

    it("a 200 with `home: null` is a FAILED read (it throws): class 'shape', never an empty answer", async () => {
        mockedFetch.mockResolvedValue({ home: null });

        await expect(getHomeDataViaGraphQL(filters())).rejects.toBeInstanceOf(TypeError);

        const lines = homeFailureLines();
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toMatchObject({ operation: "home", error_class: "shape" });
    });

    it("an EMPTY answer (a 200 with empty lists) is a value: it resolves and writes no failure line", async () => {
        mockedFetch.mockResolvedValue({ home: EMPTY_ANSWER });

        const home = await getHomeDataViaGraphQL(filters());

        expect(home).not.toBeNull();
        expect(home.deltas).toEqual([]);
        expect(home.signals).toEqual([]);
        expect(home.health_state?.status).toBe("no_data");
        expect(homeFailureLines()).toHaveLength(0);
    });
});

describe("classifyHomeReadFailure", () => {
    it("a network failure with no response is 'network', with no status", () => {
        expect(
            classifyHomeReadFailure(
                fetchError("[Network] fetch failed", { networkError: new Error("fetch failed") }),
            ),
        ).toEqual({ error_class: "network" });
    });

    it("a value that is not an Error is 'error'", () => {
        expect(classifyHomeReadFailure("boom")).toEqual({ error_class: "error" });
    });
});
