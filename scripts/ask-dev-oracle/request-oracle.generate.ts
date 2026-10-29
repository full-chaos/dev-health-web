import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";

/**
 * Differential oracle producer. Executes the REAL ask-dev request builder and conversation
 * helpers (from ASK_DEV_DIR) over cases built from real captured ACR results, with `request_id`
 * injected, and writes the cases plus ask-dev's output to ORACLE_OUT.
 *
 *   ASK_DEV_DIR=<ask-dev checkout> ORACLE_OUT=<file> \
 *     pnpm exec vitest run -c scripts/ask-dev-oracle/vitest.oracle.config.ts
 *
 * The web test (`request-builder.differential.test.ts`) replays each case through the web port and
 * demands equal bytes. `pnpm ask-dev-oracle:check` regenerates and diffs against the committed
 * file, so drift in ask-dev's builder cannot go unseen (freshness by execution, not by digest).
 */

let counter = 0;
vi.mock("node:crypto", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:crypto")>();
    const randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
        counter += 1;
        // ask-dev keeps the first 24 hex digits, so the counter sits in the first group.
        const head = counter.toString(16).padStart(8, "0");
        return `${head}-0000-4000-8000-000000000000`;
    };
    return { ...actual, default: { ...actual, randomUUID }, randomUUID };
});

const CAPTURES = path.resolve(import.meta.dirname, "../../src/lib/ask-dev/__tests__/captures");

type Json = Record<string, unknown>;

function capture(name: string): Json {
    const raw = JSON.parse(readFileSync(path.join(CAPTURES, name), "utf8")) as Json;
    return (raw.result as Json | undefined) ?? raw;
}

function receipts(value: unknown, out: { result_id: string; receipt_id: string }[] = []) {
    if (Array.isArray(value)) value.forEach((entry) => receipts(entry, out));
    else if (value !== null && typeof value === "object") {
        for (const [key, entry] of Object.entries(value as Json)) {
            if (key === "receipt_id" && typeof entry === "string") {
                out.push({ result_id: (value as Json).result_id as string, receipt_id: entry });
            } else receipts(entry, out);
        }
    }
    return out;
}

it("writes the oracle", async () => {
    const out = process.env.ORACLE_OUT;
    if (out === undefined || out === "") throw new Error("ORACLE_OUT is required");
    const { buildInvestigationRequest } = await import("@/lib/acr/client");
    const { buildConversationTurns, deriveParentReference } = await import("@/lib/conversation");
    const { STRUCTURE_RECEIPT_PREFIX, SUBJECT_KIND_VOCABULARY } = await import("@/lib/contracts");

    const results = [
        capture("context_fabric_investigation_result.v1.json"),
        capture("context_fabric_investigation_result_origin_state.v1.json"),
        capture("context_fabric_investigation_result_render_shapes.v1.json"),
        capture("context_fabric_investigation_result_unsupported.v1.json"),
    ];
    const first = results[0]!;
    const realReceipts = results.flatMap((r) =>
        receipts(r).map((x) => ({ ...x, result_id: r.result_id as string })),
    );
    const kindr = realReceipts.filter((r) => r.receipt_id.startsWith("kindr_"));
    const subjectR = realReceipts.filter(
        (r) => !/^(kindr|ancr|handr|winr|candr)_/u.test(r.receipt_id),
    );
    const rid = first.result_id as string;
    // Namespaces the captures do not carry take the prefix ask-dev's own table defines.
    const synth = (member: keyof typeof STRUCTURE_RECEIPT_PREFIX, n: number) => ({
        result_id: rid,
        receipt_id: `${STRUCTURE_RECEIPT_PREFIX[member]}${String(n).padStart(4, "0")}`,
    });

    const answered = (id: number, result: Json, answer?: string) => ({
        role: "assistant" as const,
        id,
        createdAt: "2026-10-29T10:00:0" + String(id % 10) + "Z",
        outcome: {
            kind: "answered" as const,
            result: {
                deterministic_answer: answer ?? (result.deterministic_answer as string),
                result_id: result.result_id as string,
                subject_resolution: {
                    committed: (result.subject_resolution as { committed: unknown[] }).committed,
                },
            },
        },
    });
    const user = (id: number, question: string) => ({
        role: "user" as const,
        id,
        question,
        createdAt: "2026-10-29T10:00:0" + String(id % 10) + "Z",
    });
    const committed = (first.subject_resolution as { committed: Json[] }).committed;
    const withKinds = (kinds: string[]): Json => ({
        ...first,
        subject_resolution: {
            committed: kinds.map((kind, i) => ({
                ...committed[0],
                kind,
                canonical_id: `${kind}:${String(i)}`,
                label: `${kind} ${String(i)}`,
            })),
        },
    });
    const manyTurns = Array.from({ length: 30 }, (_, i) =>
        user(i * 2 + 1, `question ${String(i)}`),
    );

    const cases: {
        name: string;
        turns: unknown[];
        question: string;
        subjectReceipts: unknown[];
        structure: Json;
        expectedKinds: string[];
        /** Bypasses the helpers and hands the builder these lists as they are (its own caps). */
        raw?: { conversation: unknown[]; subjectHints: unknown[] };
    }[] = [
        {
            name: "fresh question",
            turns: [],
            question: "What is blocking delivery?",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
        {
            name: "real subject and kind receipts",
            turns: [],
            question: "Show the team",
            subjectReceipts: subjectR.slice(0, 1),
            structure: { priorKindReceipts: kindr.slice(0, 1) },
            expectedKinds: [],
        },
        {
            name: "all five structure namespaces",
            turns: [],
            question: "Which one?",
            subjectReceipts: [],
            structure: {
                priorKindReceipts: [synth("expected_kind", 1)],
                priorAnchorReceipts: [synth("subject_anchor", 2)],
                priorHandleReceipts: [synth("subject_handle", 3)],
                priorWindowReceipts: [synth("window", 4)],
                priorCandidateReceipts: [synth("subject_candidate", 5)],
            },
            expectedKinds: [],
        },
        {
            name: "duplicate receipts collapse",
            turns: [],
            question: "dupes",
            subjectReceipts: [...subjectR.slice(0, 1), ...subjectR.slice(0, 1)],
            structure: {
                priorKindReceipts: [
                    synth("expected_kind", 1),
                    synth("expected_kind", 1),
                    synth("expected_kind", 2),
                ],
            },
            expectedKinds: [],
        },
        {
            name: "receipts cap at 20",
            turns: [],
            question: "cap",
            subjectReceipts: Array.from({ length: 25 }, (_, i) => ({
                result_id: rid,
                receipt_id: `receipt_${String(i)}`,
            })),
            structure: {
                priorCandidateReceipts: Array.from({ length: 25 }, (_, i) =>
                    synth("subject_candidate", i),
                ),
            },
            expectedKinds: [],
        },
        {
            name: "expected kinds dedupe",
            turns: [],
            question: "which repositories",
            subjectReceipts: [],
            structure: {},
            expectedKinds: ["repository", "team", "repository"],
        },
        {
            name: "builder-level caps: 60 turns, 60 hints, every kind twice",
            turns: [],
            question: "caps",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [
                ...(SUBJECT_KIND_VOCABULARY as readonly string[]),
                ...(SUBJECT_KIND_VOCABULARY as readonly string[]),
            ],
            raw: {
                conversation: Array.from({ length: 60 }, (_, i) => ({
                    turn_id: `turn_${String(i)}`,
                    role: i % 2 === 0 ? "user" : "assistant",
                    content: `content ${String(i)}`,
                    created_at: "2026-10-29T10:00:00Z",
                })),
                subjectHints: Array.from({ length: 60 }, (_, i) => ({
                    kind: "repository",
                    id: `repository:${String(i)}`,
                    label: `repo ${String(i)}`,
                    source: "ask_dev_parent_result_subject",
                })),
            },
        },
        {
            name: "turn 2 after an answer",
            turns: [user(1, "What is blocking delivery?"), answered(2, first)],
            question: "and last month?",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
        {
            name: "turn 2 after a clarification choice",
            turns: [user(1, "Show the team"), answered(2, results[1]!)],
            question: "Show the team",
            // Receipts issued by the SAME result the follow-up's parent names.
            subjectReceipts: subjectR
                .filter((r) => r.result_id === results[1]!.result_id)
                .slice(0, 1),
            structure: {
                priorKindReceipts: kindr
                    .filter((r) => r.result_id === results[1]!.result_id)
                    .slice(0, 1),
            },
            expectedKinds: [],
        },
        {
            name: "pending and failed turns are not threaded",
            turns: [
                user(1, "a"),
                {
                    role: "assistant",
                    id: 2,
                    createdAt: "2026-10-29T10:00:02Z",
                    outcome: { kind: "failed" },
                },
                user(3, "b"),
                {
                    role: "assistant",
                    id: 4,
                    createdAt: "2026-10-29T10:00:04Z",
                    outcome: { kind: "pending" },
                },
            ],
            question: "c",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
        {
            name: "blank and invisible answers are not threaded",
            turns: [
                user(1, "q"),
                answered(2, results[3]!, ""),
                user(3, "q2"),
                answered(4, first, "​  "),
                user(5, "q3"),
                answered(6, first),
            ],
            question: "next",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
        {
            name: "unknown subject kind is unsent",
            turns: [user(1, "q"), answered(2, withKinds(["team", "gadget"]))],
            question: "follow up",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
        {
            name: "more than 50 hints are capped",
            turns: [
                user(1, "q"),
                answered(2, withKinds(Array.from({ length: 55 }, () => "repository"))),
            ],
            question: "follow up",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
        {
            name: "long timeline keeps the latest 20 turns",
            turns: [...manyTurns, answered(100, first)],
            question: "latest",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
        {
            name: "a non-answered last turn carries no parent",
            turns: [
                user(1, "q"),
                answered(2, first),
                user(3, "q2"),
                {
                    role: "assistant",
                    id: 4,
                    createdAt: "2026-10-29T10:00:04Z",
                    outcome: { kind: "failed" },
                },
            ],
            question: "retry",
            subjectReceipts: [],
            structure: {},
            expectedKinds: [],
        },
    ];

    const produced = cases.map((c) => {
        const conversation = c.raw
            ? (c.raw.conversation as never)
            : buildConversationTurns(c.turns as never);
        const derived = deriveParentReference(c.turns as never);
        const parent = c.raw ? { ...derived, subjectHints: c.raw.subjectHints as never } : derived;
        // The request_id is the one the mocked randomUUID hands out, read back from the wire object.
        const request = buildInvestigationRequest(
            c.question,
            c.subjectReceipts as never,
            c.structure as never,
            conversation,
            c.expectedKinds as never,
            parent.parentResultId,
            parent.subjectHints,
        );
        return { ...c, askDev: { conversation, parent, request } };
    });
    expect(new Set(produced.map((p) => p.askDev.request.request_id)).size).toBe(produced.length);
    writeFileSync(out, `${JSON.stringify(produced, null, 2)}\n`);
});
