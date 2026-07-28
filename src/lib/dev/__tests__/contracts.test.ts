import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
    AGENT_CONTEXT_RUNTIME_FEATURE,
    ASK_DEV_FEATURE,
    BYO_LLM_FEATURE,
    devCapabilitiesFromEntitlements,
} from "../entitlements";

type ManifestCase = Readonly<{ case: string; path: string; sha256: string }>;
type ManifestContract = Readonly<{
    schema_version: string;
    schema: Readonly<{ path: string; sha256: string }>;
    positive: Readonly<{ path: string; sha256: string }>;
    negative: readonly ManifestCase[];
}>;
type OpsManifest = Readonly<{
    schema_version: string;
    compatibility: string;
    contracts: readonly ManifestContract[];
}>;
type SourceManifest = Readonly<{
    source_commit: string;
    files: readonly Readonly<{ path: string; sha256: string }>[];
}>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_ROOT = path.resolve(HERE, "../contracts");
const EXPECTED_CONTRACTS = [
    "dev_capabilities.v1",
    "dev_conversation.v1",
    "dev_conversation_summary.v1",
    "dev_message_request.v1",
    "dev_answer.v1",
    "dev_claim.v1",
    "dev_metric_ref.v1",
    "dev_evidence_ref.v1",
    "dev_scope.v1",
    "dev_scope_resolution.v1",
    "dev_tool_request.v1",
    "dev_tool_result.v1",
    "dev_feedback.v1",
    "dev_stream_event.v1",
    "dev_error.v1",
] as const;
const PYDANTIC_ONLY_INVARIANTS = new Set([
    "dev_answer.v1/unknown_evidence_id",
    "dev_answer.v1/unknown_metric_id",
    "dev_answer.v1/invalid_scope",
    "dev_answer.v1/invalid_complete_state",
    "dev_claim.v1/ungrounded_observation",
    "dev_message_request.v1/oversized_question",
    "dev_scope.v1/repository_scope_without_repository",
    "dev_scope_resolution.v1/ambiguous_without_candidates",
    "dev_stream_event.v1/private_reasoning_payload",
]);

function readJson<T>(relativePath: string): T {
    return JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, relativePath), "utf8")) as T;
}

function digest(relativePath: string): string {
    return createHash("sha256")
        .update(fs.readFileSync(path.join(CONTRACT_ROOT, relativePath)))
        .digest("hex");
}

describe("Ask Dev generated contract boundary", () => {
    it("pins every canonical contract and every copied artifact to the ops commit", () => {
        const source = readJson<SourceManifest>("source.json");
        const manifest = readJson<OpsManifest>("manifest.json");

        expect(source.source_commit).toBe("8a48c918cdc44752a01b7530b75f3f5ce5b34df6");
        expect(manifest.schema_version).toBe("ask_dev_contract_manifest.v1");
        expect(manifest.compatibility).toBe("additive-within-v1");
        expect(manifest.contracts.map((contract) => contract.schema_version)).toEqual(
            EXPECTED_CONTRACTS,
        );
        expect(source.files.length).toBeGreaterThan(50);
        for (const file of source.files) expect(digest(file.path)).toBe(file.sha256);
    });

    it("accepts every positive golden and records a real negative for every schema", () => {
        const manifest = readJson<OpsManifest>("manifest.json");
        const schemaOnlyGaps = new Set<string>();

        for (const contract of manifest.contracts) {
            const ajv = new Ajv2020({ allErrors: true, strict: false });
            addFormats(ajv);
            const validate = ajv.compile(readJson(contract.schema.path));
            expect(validate(readJson(contract.positive.path)), contract.schema_version).toBe(true);
            expect(contract.negative.length, contract.schema_version).toBeGreaterThan(0);
            for (const negative of contract.negative) {
                if (validate(readJson(negative.path))) {
                    schemaOnlyGaps.add(`${contract.schema_version}/${negative.case}`);
                }
            }
        }

        // JSON Schema cannot express cross-object ID closure, byte-length, or
        // stream ordering. These exact cases are rejected by the canonical
        // Pydantic/stream validators and are pinned here so a new false pass is loud.
        expect(schemaOnlyGaps).toEqual(PYDANTIC_ONLY_INVARIANTS);
    });

    it("keeps Ask Dev, BYO LLM, and ACR decisions independent and fail-closed", () => {
        expect(devCapabilitiesFromEntitlements(undefined)).toMatchObject({
            schema_version: "dev_capabilities.v1",
            ask_dev: false,
            byo_llm: false,
            agent_context_runtime: false,
        });
        expect(
            devCapabilitiesFromEntitlements({
                [ASK_DEV_FEATURE]: true,
                [BYO_LLM_FEATURE]: false,
                [AGENT_CONTEXT_RUNTIME_FEATURE]: false,
            }),
        ).toMatchObject({ ask_dev: true, byo_llm: false, agent_context_runtime: false });
        expect(
            devCapabilitiesFromEntitlements({
                [ASK_DEV_FEATURE]: false,
                [BYO_LLM_FEATURE]: true,
                [AGENT_CONTEXT_RUNTIME_FEATURE]: true,
            }),
        ).toMatchObject({ ask_dev: false, byo_llm: true, agent_context_runtime: true });
    });
});
