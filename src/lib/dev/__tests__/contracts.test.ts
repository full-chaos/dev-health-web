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
import {
    SCOPE_OUTCOMES_REQUIRING_RESOLVED_SCOPE,
    SCOPE_OUTCOMES_WITHOUT_RESOLVED_SCOPE,
    validateAskDevSemanticInvariants,
    validateAskDevStream,
} from "../contractValidation";

type ManifestCase = Readonly<{ case: string; path: string; sha256: string }>;
type ManifestContract = Readonly<{
    schema_version: string;
    schema: Readonly<{ path: string; sha256: string }>;
    positive: Readonly<{ path: string; sha256: string }>;
    positive_variants: readonly ManifestCase[];
    negative: readonly ManifestCase[];
}>;
type OpsManifest = Readonly<{
    schema_version: string;
    compatibility: string;
    contracts: readonly ManifestContract[];
    stream_sequences: readonly ManifestCase[];
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
    "dev_conversation_transcript.v1",
    "dev_message_request.v1",
    "dev_answer.v1",
    "dev_answer_graph_assistance.v1",
    "dev_claim.v1",
    "dev_metric_ref.v1",
    "dev_evidence_ref.v1",
    "dev_evidence_expansion.v1",
    "dev_scope.v1",
    "dev_scope_resolution.v1",
    "dev_tool_request.v1",
    "dev_tool_result.v1",
    "dev_feedback.v1",
    "dev_stream_event.v1",
    "dev_error.v1",
] as const;
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

        expect(source.source_commit).toBe("2963df821301c9d052ac83e8c8300ee5966b9eb4");
        expect(manifest.schema_version).toBe("ask_dev_contract_manifest.v1");
        expect(manifest.compatibility).toBe("additive-within-v1");
        expect(manifest.contracts.map((contract) => contract.schema_version)).toEqual(
            EXPECTED_CONTRACTS,
        );
        expect(source.files.length).toBeGreaterThan(50);
        for (const file of source.files) expect(digest(file.path)).toBe(file.sha256);
    });

    it("accepts every positive golden (and variant) and rejects every manifest negative", () => {
        const manifest = readJson<OpsManifest>("manifest.json");
        const checkedNegativePaths = new Set<string>();

        for (const contract of manifest.contracts) {
            const ajv = new Ajv2020({ allErrors: true, strict: false });
            addFormats(ajv);
            const validate = ajv.compile(readJson(contract.schema.path));
            const positive = readJson(contract.positive.path);
            expect(validate(positive), contract.schema_version).toBe(true);
            expect(validateAskDevSemanticInvariants(positive), contract.schema_version).toBe(true);
            // `positive_variants` exercises a shape the canonical positive
            // doesn't (e.g. a populated optional nested object) against this
            // build's own validator, not just ops' schema -- a variant that
            // only ajv sees is a gap this loop existed to close.
            for (const variant of contract.positive_variants) {
                const fixture = readJson(variant.path);
                expect(validate(fixture), `${contract.schema_version}/${variant.case}`).toBe(true);
                expect(
                    validateAskDevSemanticInvariants(fixture),
                    `${contract.schema_version}/${variant.case}`,
                ).toBe(true);
            }
            expect(contract.negative.length, contract.schema_version).toBeGreaterThan(0);
            for (const negative of contract.negative) {
                checkedNegativePaths.add(negative.path);
                const fixture = readJson(negative.path);
                expect(
                    validate(fixture) && validateAskDevSemanticInvariants(fixture),
                    `${contract.schema_version}/${negative.case}`,
                ).toBe(false);
            }
        }

        const copiedNegativePaths = fs
            .readdirSync(path.join(CONTRACT_ROOT, "examples/negative"))
            .map((name) => `examples/negative/${name}`);
        expect([...checkedNegativePaths].sort()).toEqual(copiedNegativePaths.sort());
    });

    // The pinned manifest only carries a dangling-evidence negative for
    // `status_facts`. The ops rule (DevToolResult.validate_evidence_closure)
    // covers six fact arrays plus three slots hanging off `actual_completion`,
    // so each of those cells is planted separately rather than inferred from the
    // one fixture ops happens to ship — a single combined case would die on the
    // first cell and leave the rest unproven.
    const DANGLING_CITATION = { evidence_ref_ids: ["ev_not_in_evidence_array"] } as const;
    const CITING_SLOTS: readonly (readonly [string, Record<string, unknown>])[] = [
        ["status_facts", { status_facts: [DANGLING_CITATION] }],
        ["graph_edges", { graph_edges: [DANGLING_CITATION] }],
        ["pull_requests", { pull_requests: [DANGLING_CITATION] }],
        ["ci_checks", { ci_checks: [DANGLING_CITATION] }],
        ["deployments", { deployments: [DANGLING_CITATION] }],
        ["incidents", { incidents: [DANGLING_CITATION] }],
        ["actual_completion", { actual_completion: { ...DANGLING_CITATION } }],
        [
            "actual_completion.required_children",
            { actual_completion: { required_children: [DANGLING_CITATION] } },
        ],
        ["actual_completion.conflicts", { actual_completion: { conflicts: [DANGLING_CITATION] } }],
    ];

    it("accepts the unmodified tool-result golden", () => {
        expect(
            validateAskDevSemanticInvariants(readJson("examples/positive/dev_tool_result.v1.json")),
        ).toBe(true);
    });

    it.each(CITING_SLOTS)("rejects a dangling evidence reference from %s", (_slot, plant) => {
        const golden = readJson<Record<string, unknown>>(
            "examples/positive/dev_tool_result.v1.json",
        );
        expect(validateAskDevSemanticInvariants({ ...golden, ...plant })).toBe(false);
    });

    it("rejects a dangling conflicting-evidence reference from a public driver judgment", () => {
        const golden = readJson<Record<string, unknown>>(
            "examples/positive/dev_answer.v1.graph_assisted.json",
        );
        const graphAssisted = structuredClone(golden.graph_assisted) as Record<string, unknown>;
        const rankedDrivers = structuredClone(graphAssisted.ranked_drivers) as Record<
            string,
            unknown
        >[];
        rankedDrivers[0] = {
            ...rankedDrivers[0],
            conflicting_evidence_ref_ids: ["ev_not_in_evidence_array"],
        };

        expect(
            validateAskDevSemanticInvariants({
                ...golden,
                graph_assisted: { ...graphAssisted, ranked_drivers: rankedDrivers },
            }),
        ).toBe(false);
    });

    // CHAOS-3298's re-pin admitted `team` to DirectScope/EntityType (ops
    // CHAOS-3301). Ops ships no team-scope golden in either contract tree, so
    // the base below is derived from the canonical repository-scope golden
    // rather than emitted by a fixture producer. It was checked against the
    // real producer before being written down: ops' own DevScope model
    // accepts this exact object, and its `validate_direct_scope` rejects
    // every mutation listed below.
    const TEAM_ENTITY_REF = {
        display_label: "Platform team",
        entity_id: "team_platform",
        entity_type: "team",
        repository_id: null,
    } as const;
    function teamScopeGolden(): Record<string, unknown> {
        return {
            ...readJson<Record<string, unknown>>("examples/positive/dev_scope.v1.json"),
            direct_scope: "team",
            entity_refs: [TEAM_ENTITY_REF],
            // A team direct scope carries no repository list of its own and
            // asserts no page surface context — both are ops invariants, not
            // conveniences of this fixture.
            repositories: [],
            team_ids: ["team_platform"],
            surface_context: null,
        };
    }
    const REJECTED_TEAM_SCOPES: readonly (readonly [string, Record<string, unknown>])[] = [
        ["team_ids empty", { team_ids: [] }],
        ["team_ids names another team", { team_ids: ["team_other"] }],
        ["team_ids carries an extra team", { team_ids: ["team_platform", "team_other"] }],
        ["repositories non-empty", { repositories: ["repo_dev_health"] }],
        [
            "entity_type is not team",
            { entity_refs: [{ ...TEAM_ENTITY_REF, entity_type: "project" }] },
        ],
        ["two entity_refs", { entity_refs: [TEAM_ENTITY_REF, TEAM_ENTITY_REF] }],
        [
            "surface context asserts a team entity",
            {
                surface_context: {
                    entity_refs: [TEAM_ENTITY_REF],
                    filter_fingerprint: "filters_01",
                    route_id: "diagnose_overview",
                },
            },
        ],
    ];

    it("accepts a well-formed team direct scope", () => {
        expect(validateAskDevSemanticInvariants(teamScopeGolden())).toBe(true);
    });

    it.each(REJECTED_TEAM_SCOPES)("rejects a team direct scope whose %s", (_case, mutation) => {
        expect(validateAskDevSemanticInvariants({ ...teamScopeGolden(), ...mutation })).toBe(false);
    });

    // The resolved/unresolved split is a hand-kept subset of a pinned enum,
    // and it fails OPEN: an outcome that ops treats as resolved but that is
    // missing from both sets here would let web accept a resolution ops
    // rejects. Read the enum out of the schema rather than restating it, so a
    // re-pin that adds a member lands in neither set and fails this.
    it("partitions every pinned ScopeResolutionOutcome into resolved or unresolved", () => {
        const schema = readJson<Record<string, Record<string, { enum?: string[] }>>>(
            "schemas/dev_scope_resolution.v1.schema.json",
        );
        const pinned = schema.$defs?.ScopeResolutionOutcome?.enum;
        // A silently-absent enum would make every assertion below vacuous.
        expect(Array.isArray(pinned) && pinned.length > 0).toBe(true);

        const overlap = [...SCOPE_OUTCOMES_REQUIRING_RESOLVED_SCOPE].filter((value) =>
            SCOPE_OUTCOMES_WITHOUT_RESOLVED_SCOPE.has(value),
        );
        expect(overlap, "an outcome cannot be both resolved and unresolved").toEqual([]);

        const partition = [
            ...SCOPE_OUTCOMES_REQUIRING_RESOLVED_SCOPE,
            ...SCOPE_OUTCOMES_WITHOUT_RESOLVED_SCOPE,
        ].sort();
        expect(partition).toEqual([...pinned!].sort());
    });

    it("validates every manifest stream sequence and exactly one terminal", () => {
        const manifest = readJson<OpsManifest>("manifest.json");
        const streamSchema = manifest.contracts.find(
            (contract) => contract.schema_version === "dev_stream_event.v1",
        );
        expect(streamSchema).toBeDefined();

        const ajv = new Ajv2020({ allErrors: true, strict: false });
        addFormats(ajv);
        const validateEvent = ajv.compile(readJson(streamSchema!.schema.path));
        const checkedStreamPaths = new Set<string>();
        for (const streamCase of manifest.stream_sequences) {
            checkedStreamPaths.add(streamCase.path);
            const events = readJson<unknown[]>(streamCase.path);
            expect(
                events.every((event) => validateEvent(event)),
                streamCase.case,
            ).toBe(true);
            expect(validateAskDevStream(events), streamCase.case).toBe(streamCase.case === "valid");
        }

        const copiedStreamPaths = fs
            .readdirSync(path.join(CONTRACT_ROOT, "examples/streams"))
            .map((name) => `examples/streams/${name}`);
        expect([...checkedStreamPaths].sort()).toEqual(copiedStreamPaths.sort());
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

    // CHAOS-3219 W4 follow-up. `fully_covered` in ops' projector
    // (contracts_v2/compat.py:303-309) requires ALL THREE required-source
    // lists to be empty before an answered outcome may become `complete`:
    // unavailable, stale AND degraded. Web's semantic mirror checked only
    // the first two, so it accepted a `complete` answer with degraded
    // required sources — a payload ops cannot emit. Same omission as the
    // rendering defect this row fixed, in a second place; there is no
    // pinned negative example for it because ops did not ship one, so the
    // case is asserted directly.
    it("rejects a complete answer that still carries degraded required sources", () => {
        const positive = readJson<Record<string, unknown>>("examples/positive/dev_answer.v1.json");
        expect(validateAskDevSemanticInvariants(positive)).toBe(true);

        const degradedWhileComplete = {
            ...positive,
            coverage: {
                ...(positive.coverage as Record<string, unknown>),
                degraded_required_sources: ["work_graph"],
            },
        };
        expect(validateAskDevSemanticInvariants(degradedWhileComplete)).toBe(false);

        // The same coverage is legitimate on a non-complete status, so the
        // rule must key on the status and not simply reject the field.
        expect(
            validateAskDevSemanticInvariants({ ...degradedWhileComplete, status: "degraded" }),
        ).toBe(true);
    });
});
