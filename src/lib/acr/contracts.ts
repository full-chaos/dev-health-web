import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import agentEpisodeCreateSchema from "./contracts/schemas/agent_episode_create.v1.schema.json";
import agentEpisodeSchema from "./contracts/schemas/agent_episode.v1.schema.json";
import capabilitiesSchema from "./contracts/schemas/capabilities.v1.schema.json";
import contextPacketItemSchema from "./contracts/schemas/context_packet_item.v1.schema.json";
import contextPacketRequestSchema from "./contracts/schemas/context_packet_request.v1.schema.json";
import contextPacketSchema from "./contracts/schemas/context_packet.v1.schema.json";
import errorSchema from "./contracts/schemas/error.v1.schema.json";
import evidenceRefSchema from "./contracts/schemas/evidence_ref.v1.schema.json";
import expandedEvidenceSchema from "./contracts/schemas/expanded_evidence.v1.schema.json";
import contextPacketExample from "./contracts/examples/context_packet.v1.json";
import expandedEvidenceExample from "./contracts/examples/expanded_evidence.v1.json";

export const acrSchemas = {
    agentEpisodeCreate: agentEpisodeCreateSchema,
    agentEpisode: agentEpisodeSchema,
    capabilities: capabilitiesSchema,
    contextPacketItem: contextPacketItemSchema,
    contextPacketRequest: contextPacketRequestSchema,
    contextPacket: contextPacketSchema,
    error: errorSchema,
    evidenceRef: evidenceRefSchema,
    expandedEvidence: expandedEvidenceSchema,
};

const acrSchemaFiles = {
    "agent_episode_create.v1.schema.json": agentEpisodeCreateSchema,
    "agent_episode.v1.schema.json": agentEpisodeSchema,
    "capabilities.v1.schema.json": capabilitiesSchema,
    "context_packet_item.v1.schema.json": contextPacketItemSchema,
    "context_packet_request.v1.schema.json": contextPacketRequestSchema,
    "context_packet.v1.schema.json": contextPacketSchema,
    "error.v1.schema.json": errorSchema,
    "evidence_ref.v1.schema.json": evidenceRefSchema,
    "expanded_evidence.v1.schema.json": expandedEvidenceSchema,
};

export const acrExamples = [
    { schema: "context_packet.v1.schema.json", value: contextPacketExample },
    { schema: "expanded_evidence.v1.schema.json", value: expandedEvidenceExample },
] as const;

const ajv = new Ajv2020({
    allErrors: true,
    strictRequired: false,
    strictSchema: true,
    strictTypes: false,
});
addFormats(ajv);
for (const [schemaName, schema] of Object.entries(acrSchemaFiles))
    ajv.addSchema(schema, schemaName);

type ValidationResult = {
    readonly valid: boolean;
    readonly errors: readonly string[];
};

export function validateAcrContract(schema: string, value: unknown): ValidationResult {
    const validator = ajv.getSchema(schema);
    if (validator === undefined) return { valid: false, errors: ["schema is unavailable"] };
    if (validator(value)) return { valid: true, errors: [] };
    return {
        valid: false,
        errors: (validator.errors ?? []).map(
            (error) => `${error.instancePath} ${error.message ?? error.keyword}`,
        ),
    };
}
