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

    it("refuses a claim of another kind that shares the repository's canonical id (Codex r1)", () => {
        const result = structuredClone(repositoryAnswer) as unknown as {
            subject_resolution: { committed: Array<{ canonical_id: string }> };
            claimed_facts: Array<{
                subject: { kind: string; canonical_id: string; label?: string };
            }>;
        };
        const id = result.subject_resolution.committed[0]!.canonical_id;
        result.claimed_facts = result.claimed_facts.map((claim) => ({
            ...claim,
            subject: { kind: "team", canonical_id: id, label: "CHAOS" },
        }));
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

    it("takes no result after an error: the first terminal is the stream's end (Codex r1)", () => {
        const frames = capture.split("\n\n");
        const result = frames.findIndex((frame) => /^event: result$/mu.test(frame));
        const error =
            'event: error\ndata: {"schema_version":"context_fabric_investigation_event.v1","type":"error","seq":99}';
        const errorFirst = [...frames.slice(0, result), error, ...frames.slice(result)].join(
            "\n\n",
        );
        expect(terminalResultOf(errorFirst)).toBeUndefined();
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
    const STREAM_URL = `${ACR}/api/v1/context-fabric/investigations`;

    /** A real streamed response: the capture in small chunks, as the network gives it. */
    function streamed(text: string): Response {
        const bytes = new TextEncoder().encode(text);
        let at = 0;
        return new Response(
            new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (at >= bytes.length) return controller.close();
                    controller.enqueue(bytes.slice(at, at + 512));
                    at += 512;
                },
            }),
            { headers: { "content-type": "text/event-stream" } },
        );
    }

    /**
     * The real `watchResults` over a fake page: `addInitScript` runs the real in-page tee on this
     * process's own `fetch`, and `exposeBinding` installs the real handler where the tee sends.
     */
    async function recorded(respond: () => Response) {
        const scope = globalThis as unknown as Record<string, unknown> & { fetch: typeof fetch };
        const saved = scope.fetch;
        const seen: string[] = [];
        scope.fetch = (async (input: RequestInfo | URL) => {
            seen.push(String(input));
            return respond();
        }) as typeof fetch;
        const results = await watchResults({
            exposeBinding: (async (
                name: string,
                handler: (source: unknown, message: unknown) => void,
            ) => {
                scope[name] = (message: unknown) => handler({}, message);
            }) as never,
            addInitScript: (async (script: (options: unknown) => void, options: unknown) => {
                script(options);
            }) as never,
        });
        const restore = () => {
            scope.fetch = saved;
            delete scope["__askDevLiveStream"];
        };
        return { results, seen, restore, scope };
    }

    it("keeps the result of the investigation stream, while the app reads the same stream whole", async () => {
        const { results, restore, scope } = await recorded(() => streamed(capture));
        try {
            const response = await scope.fetch(STREAM_URL, {
                method: "POST",
                headers: { authorization: `Bearer ${BEARER}` },
            });
            // The app's own read of the stream is untouched.
            expect(await response.text()).toBe(capture);
            await vi.waitFor(() => expect(results).toHaveLength(1));
            expect(results[0]?.status).toBe("complete");
            expect(JSON.stringify(results)).not.toContain(BEARER);
        } finally {
            restore();
        }
    });

    it("tees no other route, no other method and no other origin", async () => {
        const { results, restore, scope } = await recorded(() => streamed(capture));
        try {
            for (const [url, method] of [
                [STREAM_URL, "GET"],
                [`${ACR}/api/v1/agent-context/evidence/ref_1`, "POST"],
                ["https://other.example/api/v1/context-fabric/investigations", "POST"],
            ] as const) {
                const response = await scope.fetch(url, { method });
                await response.text();
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(results).toEqual([]);
        } finally {
            restore();
        }
    });

    it("says so, and adds nothing, when the stream's body cannot be read", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { results, restore, scope } = await recorded(
            () =>
                new Response(
                    new ReadableStream({
                        pull(controller) {
                            controller.error(new Error("the stream broke"));
                        },
                    }),
                ),
        );
        try {
            const response = await scope.fetch(STREAM_URL, { method: "POST" });
            await response.text().catch(() => undefined);
            await vi.waitFor(() =>
                expect(warn).toHaveBeenCalledWith(
                    "watchResults: an investigation stream gave no body: the stream broke",
                ),
            );
            expect(results).toEqual([]);
            expect(repositoryScopeFailures(results[0], REPOSITORY)).toEqual([
                "no terminal result was captured for this question",
            ]);
        } finally {
            restore();
            warn.mockRestore();
        }
    });
});
