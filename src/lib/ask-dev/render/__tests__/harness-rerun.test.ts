import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateAcrContract } from "@/lib/acr/contracts";
import {
    buildConversationTurns,
    deriveParentReference,
    type ConversationSourceTurn,
} from "@/lib/ask-dev/conversation";
import { validateInvestigationResult } from "@/lib/ask-dev/investigation-result";
import { buildInvestigationRequest } from "@/lib/ask-dev/request-builder";

/**
 * CHAOS-11941 (E8 design §13.2 (h)): the I-08 validation harness and the I-10 request-builder path,
 * re-run on the E8 capture set. Every capture is a valid ACR answer under web's pin, and every one
 * can be the parent of a follow-up the builder turns into a schema-valid request.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- captured JSON */
const WEB = path.resolve(import.meta.dirname, "../../../../..");
const manifest = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "../__oracle__/MANIFEST.json"), "utf8"),
) as {
    captures: { file: string }[];
};
const captures = manifest.captures.map(({ file }) => {
    const parsed = JSON.parse(readFileSync(path.join(WEB, file), "utf8"));
    return {
        file: path.basename(file),
        result: parsed?.result && typeof parsed.result === "object" ? parsed.result : parsed,
    };
});

describe("I-08 and I-10 harnesses on the E8 capture set", () => {
    it("covers every manifest capture", () => {
        expect(captures.length).toBe(manifest.captures.length);
        expect(captures.length).toBeGreaterThanOrEqual(36);
    });

    it.each(captures.map((c) => [c.file, c.result]))("%s validates (I-08)", (_file, result) => {
        expect(validateInvestigationResult(result)).toMatchObject({ valid: true });
    });

    it.each(captures.map((c) => [c.file, c.result]))(
        "%s parents a schema-valid follow-up (I-10)",
        (_file, result: any) => {
            const turns: ConversationSourceTurn[] = [
                {
                    role: "user",
                    id: 1,
                    question: result.question,
                    createdAt: "2026-10-30T20:00:00Z",
                },
                {
                    role: "assistant",
                    id: 2,
                    createdAt: "2026-10-30T20:00:05Z",
                    outcome: { kind: "answered", result },
                },
            ];
            const parent = deriveParentReference(turns);
            const request = buildInvestigationRequest({
                question: "And over the last 90 days?",
                requestId: "request_e8harness0001",
                conversation: buildConversationTurns(turns),
                parentResultId: parent.parentResultId,
                subjectHints: parent.subjectHints,
            });
            expect(
                validateAcrContract("context_fabric_investigation_request.v1.schema.json", request),
            ).toEqual({
                valid: true,
                errors: [],
            });
        },
    );
});
