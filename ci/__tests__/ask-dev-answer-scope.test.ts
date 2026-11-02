import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ expect: () => undefined }));

import {
    repositoryScopeFailures,
    terminalResultOf,
    type ScopedResult,
} from "../../tests/live/ask-dev/answer-scope";
import { ACR, watchResults } from "../../tests/live/ask-dev/stack";

/**
 * CHAOS-12637: the live review-latency page cases read what an answer is ABOUT from its result.
 * Every case here is a real served result: ask-dev's fixtures from acr's real encoder at web's ask-dev
 * pin, and web's own captured event stream. The organization answers are those results with their
 * subject moved to the organization, the one shape no fixture holds yet.
 */

const REPOSITORY = "full-chaos/dev-health-web";
const askDev = (path: string) =>
    JSON.parse(
        readFileSync(
            join(process.cwd(), "node_modules/@full-chaos/ask-dev/src/test/fixtures", path),
            "utf8",
        ),
    ) as ScopedResult;

const repositoryAnswer = askDev("served-shapes/investment-treemap.json");
const ORGANIZATION = {
    kind: "organization",
    canonical_id: "organization:70d529e0-0000-4000-8000-000000000000",
    label: "Full Chaos",
};

/**
 * The repository answer, about the organization instead. With `mentionsRepository`, its repository
 * claim stays beside an organization claim: an answer about every repository that names this one.
 */
function aboutTheOrganization(mentionsRepository: boolean): ScopedResult {
    const result = structuredClone(repositoryAnswer) as unknown as {
        subject_resolution: { committed: unknown[] };
        claimed_facts: Array<{ subject: unknown }>;
    };
    result.subject_resolution.committed = [ORGANIZATION];
    const organizationClaims = result.claimed_facts.map((claim) => ({
        ...claim,
        subject: ORGANIZATION,
    }));
    result.claimed_facts = mentionsRepository
        ? [...result.claimed_facts, ...organizationClaims]
        : organizationClaims;
    return result as unknown as ScopedResult;
}

describe("an answer about the page's repository (CHAOS-12637)", () => {
    it("the fixture is the case: a served answer that committed the repository", () => {
        expect(repositoryAnswer.subject_resolution.committed).toEqual([
            expect.objectContaining({ kind: "repository", label: REPOSITORY }),
        ]);
    });

    it("passes a served answer about the repository", () => {
        expect(repositoryScopeFailures(repositoryAnswer, REPOSITORY)).toEqual([]);
    });

    it.each<[string, ScopedResult | undefined, string]>([
        ["no result at all", undefined, "no terminal result was captured for this question"],
        [
            "a clarification",
            askDev("served-words/clarification.json"),
            "the answer did not answer: clarification_required",
        ],
        ["a no-match", askDev("served-words/no-match.json"), "the answer did not answer: no_match"],
        [
            "another repository",
            askDev("cohort-members/pull-requests.json"),
            'the answer committed repository "full-chaos/dev-health-ops", not repository "full-chaos/dev-health-web"',
        ],
        [
            "two repositories",
            askDev("served-shapes/comparison-table-served.json"),
            "the answer committed 2 subjects, not the one repository",
        ],
        [
            "a project",
            askDev("served-words/full-answer.json"),
            'the answer committed project "Ask Dev", not repository "full-chaos/dev-health-web"',
        ],
        [
            "the organization",
            aboutTheOrganization(false),
            'the answer committed organization "Full Chaos", not repository "full-chaos/dev-health-web"',
        ],
        [
            "the organization, with one claim about the repository (Codex r1v's answer)",
            aboutTheOrganization(true),
            "a claim is about the organization",
        ],
    ])("refuses %s", (_, result, failure) => {
        expect(repositoryScopeFailures(result, REPOSITORY)).toContain(failure);
    });

    it("refuses a subject of another kind that carries the repository's name", () => {
        const result = structuredClone(repositoryAnswer) as unknown as {
            subject_resolution: { committed: Array<{ kind: string }> };
        };
        result.subject_resolution.committed[0]!.kind = "project";
        expect(repositoryScopeFailures(result as unknown as ScopedResult, REPOSITORY)).toContain(
            'the answer committed project "full-chaos/dev-health-web", not repository "full-chaos/dev-health-web"',
        );
    });

    it("refuses a repository answer that holds no claim about the repository", () => {
        const result = structuredClone(repositoryAnswer) as unknown as {
            claimed_facts: unknown[];
        };
        result.claimed_facts = [];
        expect(repositoryScopeFailures(result as unknown as ScopedResult, REPOSITORY)).toEqual([
            "no claim is about the repository",
        ]);
    });

    it("refuses a repository answer with a claim about the organization", () => {
        const result = structuredClone(repositoryAnswer) as unknown as {
            claimed_facts: Array<{ subject: unknown }>;
        };
        result.claimed_facts.push({ ...result.claimed_facts[0]!, subject: ORGANIZATION });
        expect(repositoryScopeFailures(result as unknown as ScopedResult, REPOSITORY)).toEqual([
            "a claim is about the organization",
        ]);
    });
});

describe("the terminal result of a captured event stream (CHAOS-12637)", () => {
    const capture = readFileSync(
        join(
            process.cwd(),
            "src/lib/ask-dev/acr-transport/__tests__/captures/context_fabric_investigation_event_stream.v1.sse",
        ),
        "utf8",
    );

    it("reads the result event of a real stream, and nothing else", () => {
        const result = terminalResultOf(capture);
        expect(result?.status).toBe("complete");
        expect(result?.subject_resolution.committed).toEqual([
            expect.objectContaining({ kind: "project", label: "Ask Dev" }),
        ]);
        // A project answer is not about the repository: the check reads it so.
        expect(repositoryScopeFailures(result, REPOSITORY)).toContain(
            'the answer committed project "Ask Dev", not repository "full-chaos/dev-health-web"',
        );
    });

    it("reads frames that end in CRLF as frames that end in LF", () => {
        expect(terminalResultOf(capture.replace(/\n/gu, "\r\n"))).toEqual(
            terminalResultOf(capture),
        );
    });

    it("finds no result in a stream that ends in an error", () => {
        const errorOnly = capture
            .split("\n\n")
            .filter((frame) => !/^event: result$/mu.test(frame))
            .join("\n\n");
        expect(terminalResultOf(errorOnly)).toBeUndefined();
    });
});

describe("the live suite's result record (CHAOS-12637)", () => {
    const BEARER = "fcacr_sentinel_do_not_print";
    const capture = readFileSync(
        join(
            process.cwd(),
            "src/lib/ask-dev/acr-transport/__tests__/captures/context_fabric_investigation_event_stream.v1.sse",
        ),
        "utf8",
    );

    function respond(
        responses: ReadonlyArray<{ url: string; method: string; text: () => Promise<string> }>,
    ) {
        let listener: ((value: unknown) => void) | undefined;
        const results = watchResults({
            on: ((name: string, handler: (value: unknown) => void) => {
                if (name === "response") listener = handler;
            }) as never,
        });
        for (const { url, method, text } of responses) {
            listener!({
                request: () => ({
                    url: () => url,
                    method: () => method,
                    headers: () => ({ authorization: `Bearer ${BEARER}` }),
                }),
                text,
            });
        }
        return results;
    }

    it("keeps the result of the investigation stream, and no bearer", async () => {
        const results = respond([
            {
                url: `${ACR}/api/v1/context-fabric/investigations`,
                method: "POST",
                text: async () => capture,
            },
        ]);
        await vi.waitFor(() => expect(results).toHaveLength(1));
        expect(results[0]?.status).toBe("complete");
        expect(JSON.stringify(results)).not.toContain(BEARER);
    });

    it("reads no other route, no other method and no other origin", async () => {
        const read = vi.fn(async () => capture);
        const results = respond([
            { url: `${ACR}/api/v1/context-fabric/investigations`, method: "GET", text: read },
            { url: `${ACR}/api/v1/agent-context/evidence/ref_1`, method: "POST", text: read },
            {
                url: "https://other.example/api/v1/context-fabric/investigations",
                method: "POST",
                text: read,
            },
        ]);
        await Promise.resolve();
        expect(read).not.toHaveBeenCalled();
        expect(results).toEqual([]);
    });

    it("adds nothing when the browser gives no body back, so the case fails on its absence", async () => {
        const results = respond([
            {
                url: `${ACR}/api/v1/context-fabric/investigations`,
                method: "POST",
                text: async () => {
                    throw new Error("No resource with given identifier found");
                },
            },
        ]);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(results).toEqual([]);
        expect(repositoryScopeFailures(results[0], REPOSITORY)).toEqual([
            "no terminal result was captured for this question",
        ]);
    });
});
