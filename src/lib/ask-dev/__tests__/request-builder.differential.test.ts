import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateAcrContract } from "@/lib/acr/contracts";
import {
    buildConversationTurns,
    deriveParentReference,
    unsentSubjectsNotice,
} from "../conversation";
import {
    WEB_CONSUMER,
    buildInvestigationRequest,
    newRequestId,
    type InvestigationRequestInput,
} from "../request-builder";

/**
 * Differential test against the ask-dev repo's real builder. The cases and ask-dev's outputs come
 * from `scripts/ask-dev-oracle/request-oracle.generate.ts`, which EXECUTES ask-dev's code over
 * real captured results with `request_id` injected. `pnpm ask-dev-oracle:check` re-executes it
 * and diffs against the committed file.
 */
type OracleCase = {
    name: string;
    turns: never[];
    question: string;
    subjectReceipts: never[];
    structure: NonNullable<InvestigationRequestInput["structureReceipts"]>;
    expectedKinds: never[];
    raw?: { conversation: never[]; subjectHints: never[] };
    askDev: {
        conversation: unknown;
        parent: { parentResultId: string | undefined };
        request: { request_id: string; consumer: unknown } & Record<string, unknown>;
    };
};

const cases = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "oracle/request-builder.cases.json"), "utf8"),
) as OracleCase[];

function webRequest(c: OracleCase, consumer = WEB_CONSUMER) {
    const derived = deriveParentReference(c.turns);
    const parent = c.raw ? { ...derived, subjectHints: c.raw.subjectHints } : derived;
    return buildInvestigationRequest(
        {
            question: c.question,
            requestId: c.askDev.request.request_id,
            priorSubjectReceipts: c.subjectReceipts,
            structureReceipts: c.structure,
            conversation: c.raw ? c.raw.conversation : buildConversationTurns(c.turns),
            expectedKinds: c.expectedKinds,
            parentResultId: parent.parentResultId,
            subjectHints: parent.subjectHints,
        },
        consumer,
    );
}

describe("ask-dev request builder: differential vs the ask-dev repo", () => {
    it("has the cases the AC names", () => {
        expect(cases.length).toBeGreaterThanOrEqual(12);
        const names = cases.map((c) => c.name);
        expect(names).toContain("turn 2 after an answer");
        expect(names).toContain("all five structure namespaces");
    });

    for (const c of cases) {
        describe(c.name, () => {
            it("conversation and parent carry equal ask-dev's", () => {
                // A raw case hands the builder its lists as they are; the helpers are not in play,
                // and the lists must be exactly what ask-dev's builder was given.
                if (c.raw) {
                    expect(c.askDev.conversation).toEqual(c.raw.conversation);
                    expect(c.askDev.parent).toMatchObject({ subjectHints: c.raw.subjectHints });
                    return;
                }
                expect(JSON.stringify(buildConversationTurns(c.turns))).toBe(
                    JSON.stringify(c.askDev.conversation),
                );
                const parent = deriveParentReference(c.turns);
                expect(JSON.stringify(parent)).toBe(JSON.stringify(c.askDev.parent));
            });

            it("same inputs give a byte-equal request (consumer injected)", () => {
                const workbench = c.askDev.request.consumer as typeof WEB_CONSUMER;
                expect(JSON.stringify(webRequest(c, workbench))).toBe(
                    JSON.stringify(c.askDev.request),
                );
            });

            it("web metadata is separate: only `consumer` differs", () => {
                const request = webRequest(c);
                const { consumer, ...rest } = request as unknown as Record<string, unknown>;
                const { consumer: askDevConsumer, ...askDevRest } = c.askDev.request;
                expect(JSON.stringify(rest)).toBe(JSON.stringify(askDevRest));
                expect(consumer).toEqual(WEB_CONSUMER);
                expect(askDevConsumer).not.toEqual(WEB_CONSUMER);
            });

            it("is valid against the pinned request schema", () => {
                expect(
                    validateAcrContract(
                        "context_fabric_investigation_request.v1.schema.json",
                        webRequest(c),
                    ),
                ).toEqual({ valid: true, errors: [] });
            });
        });
    }
});

type WireRequest = {
    parent_result_id?: string;
    requested_scope: { subject_hints: { source: string }[] };
    conversation: { role: string }[];
    prior_subject_receipts: unknown[];
    prior_kind_receipts: unknown[];
};

describe("ask-dev request builder: turn 2 and authorization", () => {
    const turn2 = cases.find((c) => c.name === "turn 2 after an answer")!;
    const choice = cases.find((c) => c.name === "turn 2 after a clarification choice")!;

    it("turn 2 carries parent_result_id, the committed subject hints and the conversation", () => {
        const request = webRequest(turn2) as unknown as WireRequest;
        expect(request.parent_result_id).toBe(turn2.askDev.parent.parentResultId);
        expect(request.parent_result_id).toMatch(/^result_/u);
        expect(request.requested_scope.subject_hints[0]).toMatchObject({
            source: "ask_dev_parent_result_subject",
        });
        expect(request.conversation.map((t) => t.role)).toEqual(["user", "assistant"]);
    });

    it("turn 2 after a choice carries the receipts it was handed", () => {
        const request = webRequest(choice) as unknown as WireRequest;
        expect(request.prior_subject_receipts.length).toBe(1);
        expect(request.prior_kind_receipts.length).toBe(1);
        expect(request.parent_result_id).toBeDefined();
    });

    it("a first turn carries no parent, no hints and no conversation", () => {
        const request = webRequest(cases[0]!) as unknown as Record<string, unknown>;
        expect(request).not.toHaveProperty("parent_result_id");
        expect(request).not.toHaveProperty("requested_scope");
        expect(request).not.toHaveProperty("conversation");
    });

    it("authorization cannot ride in: planted authz fields never reach the wire", () => {
        const planted = {
            question: "q",
            requestId: "request_x",
            orgId: "org-1",
            subject: "user-1",
            repositoryScopes: ["repo-1"],
            accessToken: "tok",
            assertion: "jwt",
            permissions: ["context:read"],
        } as unknown as InvestigationRequestInput;
        const wire = JSON.stringify(buildInvestigationRequest(planted));
        for (const needle of ["org-1", "user-1", "repo-1", "tok", "jwt", "context:read"]) {
            expect(wire).not.toContain(needle);
        }
        // Planted defect check: the keys on the wire are exactly the contract's.
        const keys = Object.keys(JSON.parse(wire) as object).sort();
        expect(keys).toEqual(
            [
                "consumer",
                "options",
                "prior_subject_receipts",
                "question",
                "request_id",
                "schema_version",
                "time_context",
            ].sort(),
        );
    });

    it("nested authorization fields are dropped too: receipts, turns and hints are rebuilt field by field", () => {
        const request = buildInvestigationRequest({
            question: "q",
            requestId: newRequestId("00000000-0000-4000-8000-000000000001"),
            priorSubjectReceipts: [
                {
                    result_id: "result_1",
                    receipt_id: "receipt_12345678",
                    accessToken: "tok-receipt",
                },
            ] as never,
            structureReceipts: {
                priorKindReceipts: [
                    {
                        result_id: "result_1",
                        receipt_id: "kindr_ask_dev_9012",
                        orgId: "org-nested",
                    },
                ] as never,
            },
            conversation: [
                {
                    turn_id: "turn_1",
                    role: "user",
                    content: "c",
                    created_at: "2026-10-29T10:00:00Z",
                    subject: "user-nested",
                },
            ] as never,
            subjectHints: [
                { kind: "team", id: "team:1", label: "T", source: "s", repositoryScopes: ["x"] },
            ] as never,
        });
        const wire = JSON.stringify(request);
        for (const needle of ["tok-receipt", "org-nested", "user-nested", "repositoryScopes"]) {
            expect(wire).not.toContain(needle);
        }
        expect(
            validateAcrContract("context_fabric_investigation_request.v1.schema.json", request)
                .valid,
        ).toBe(true);
    });

    it("an unsent subject is disclosed, never dropped silently", () => {
        const c = cases.find((x) => x.name === "unknown subject kind is unsent")!;
        const parent = deriveParentReference(c.turns);
        expect(parent.unsentSubjects.map((s) => s.kind)).toEqual(["gadget"]);
        expect(unsentSubjectsNotice(parent.unsentSubjects)).toContain("gadget 1");
        expect(unsentSubjectsNotice([])).toBeUndefined();
    });

    it("keeps two distinct receipt pairs whose ids contain the separator character", () => {
        const request = buildInvestigationRequest({
            question: "q",
            requestId: newRequestId("00000000-0000-4000-8000-000000000002"),
            priorSubjectReceipts: [
                { result_id: "result_12345678|receipt_a", receipt_id: "receipt_b_12345" },
                { result_id: "result_12345678", receipt_id: "receipt_a|receipt_b_12345" },
            ],
        });
        expect(request.prior_subject_receipts).toHaveLength(2);
    });

    it("mints a request id in the ask-dev shape", () => {
        expect(newRequestId()).toMatch(/^request_[0-9a-f]{24}$/u);
        expect(newRequestId("00000000-0000-4000-8000-000000000007")).toBe(
            "request_000000000000400080000000",
        );
    });
});
