import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import acrClientCredentialSchema from "./contracts/schemas/acr_client_credential.v1.schema.json";
import agentEpisodeSchema from "./contracts/schemas/agent_episode.v1.schema.json";
import agentEpisodeCreateSchema from "./contracts/schemas/agent_episode_create.v1.schema.json";
import capabilitiesSchema from "./contracts/schemas/capabilities.v1.schema.json";
import contextPacketSchema from "./contracts/schemas/context_packet.v1.schema.json";
import contextPacketItemSchema from "./contracts/schemas/context_packet_item.v1.schema.json";
import contextPacketRequestSchema from "./contracts/schemas/context_packet_request.v1.schema.json";
import errorSchema from "./contracts/schemas/error.v1.schema.json";
import evidenceRefSchema from "./contracts/schemas/evidence_ref.v1.schema.json";
import expandedEvidenceSchema from "./contracts/schemas/expanded_evidence.v1.schema.json";
import mcpContextForTaskRequestSchema from "./contracts/schemas/mcp_context_for_task_request.v1.schema.json";
import mcpContextForTaskResponseSchema from "./contracts/schemas/mcp_context_for_task_response.v1.schema.json";
import mcpRecordEpisodeRequestSchema from "./contracts/schemas/mcp_record_episode_request.v1.schema.json";
import mcpRecordEpisodeResponseSchema from "./contracts/schemas/mcp_record_episode_response.v1.schema.json";
import mcpSourceEvidenceRequestSchema from "./contracts/schemas/mcp_source_evidence_request.v1.schema.json";
import mcpSourceEvidenceResponseSchema from "./contracts/schemas/mcp_source_evidence_response.v1.schema.json";
import acrClientCredentialExample from "./contracts/examples/acr_client_credential.v1.json";
import agentEpisodeExample from "./contracts/examples/agent_episode.v1.json";
import agentEpisodeCreateExample from "./contracts/examples/agent_episode_create.v1.json";
import capabilitiesExample from "./contracts/examples/capabilities.v1.json";
import contextPacketExample from "./contracts/examples/context_packet.v1.json";
import contextPacketItemExample from "./contracts/examples/context_packet_item.v1.json";
import contextPacketRequestExample from "./contracts/examples/context_packet_request.v1.json";
import errorExample from "./contracts/examples/error.v1.json";
import evidenceRefExample from "./contracts/examples/evidence_ref.v1.json";
import expandedEvidenceExample from "./contracts/examples/expanded_evidence.v1.json";
import mcpContextForTaskRequestExample from "./contracts/examples/mcp_context_for_task_request.v1.json";
import mcpContextForTaskRequestFullExample from "./contracts/examples/mcp_context_for_task_request_full.v1.json";
import mcpContextForTaskResponseExample from "./contracts/examples/mcp_context_for_task_response.v1.json";
import mcpRecordEpisodeRequestExample from "./contracts/examples/mcp_record_episode_request.v1.json";
import mcpRecordEpisodeResponseExample from "./contracts/examples/mcp_record_episode_response.v1.json";
import mcpSourceEvidenceRequestExample from "./contracts/examples/mcp_source_evidence_request.v1.json";
import mcpSourceEvidenceResponseExample from "./contracts/examples/mcp_source_evidence_response.v1.json";

export const acrSchemas = {
    acrClientCredential: acrClientCredentialSchema,
    agentEpisode: agentEpisodeSchema,
    agentEpisodeCreate: agentEpisodeCreateSchema,
    capabilities: capabilitiesSchema,
    contextPacket: contextPacketSchema,
    contextPacketItem: contextPacketItemSchema,
    contextPacketRequest: contextPacketRequestSchema,
    error: errorSchema,
    evidenceRef: evidenceRefSchema,
    expandedEvidence: expandedEvidenceSchema,
    mcpContextForTaskRequest: mcpContextForTaskRequestSchema,
    mcpContextForTaskResponse: mcpContextForTaskResponseSchema,
    mcpRecordEpisodeRequest: mcpRecordEpisodeRequestSchema,
    mcpRecordEpisodeResponse: mcpRecordEpisodeResponseSchema,
    mcpSourceEvidenceRequest: mcpSourceEvidenceRequestSchema,
    mcpSourceEvidenceResponse: mcpSourceEvidenceResponseSchema,
};

const acrSchemaFiles = {
    "acr_client_credential.v1.schema.json": acrClientCredentialSchema,
    "agent_episode.v1.schema.json": agentEpisodeSchema,
    "agent_episode_create.v1.schema.json": agentEpisodeCreateSchema,
    "capabilities.v1.schema.json": capabilitiesSchema,
    "context_packet.v1.schema.json": contextPacketSchema,
    "context_packet_item.v1.schema.json": contextPacketItemSchema,
    "context_packet_request.v1.schema.json": contextPacketRequestSchema,
    "error.v1.schema.json": errorSchema,
    "evidence_ref.v1.schema.json": evidenceRefSchema,
    "expanded_evidence.v1.schema.json": expandedEvidenceSchema,
    "mcp_context_for_task_request.v1.schema.json": mcpContextForTaskRequestSchema,
    "mcp_context_for_task_response.v1.schema.json": mcpContextForTaskResponseSchema,
    "mcp_record_episode_request.v1.schema.json": mcpRecordEpisodeRequestSchema,
    "mcp_record_episode_response.v1.schema.json": mcpRecordEpisodeResponseSchema,
    "mcp_source_evidence_request.v1.schema.json": mcpSourceEvidenceRequestSchema,
    "mcp_source_evidence_response.v1.schema.json": mcpSourceEvidenceResponseSchema,
};

export const acrExamples = [
    { schema: "acr_client_credential.v1.schema.json", value: acrClientCredentialExample },
    { schema: "agent_episode.v1.schema.json", value: agentEpisodeExample },
    { schema: "agent_episode_create.v1.schema.json", value: agentEpisodeCreateExample },
    { schema: "capabilities.v1.schema.json", value: capabilitiesExample },
    { schema: "context_packet.v1.schema.json", value: contextPacketExample },
    { schema: "context_packet_item.v1.schema.json", value: contextPacketItemExample },
    { schema: "context_packet_request.v1.schema.json", value: contextPacketRequestExample },
    { schema: "error.v1.schema.json", value: errorExample },
    { schema: "evidence_ref.v1.schema.json", value: evidenceRefExample },
    { schema: "expanded_evidence.v1.schema.json", value: expandedEvidenceExample },
    {
        schema: "mcp_context_for_task_request.v1.schema.json",
        value: mcpContextForTaskRequestExample,
    },
    {
        schema: "mcp_context_for_task_request.v1.schema.json",
        value: mcpContextForTaskRequestFullExample,
    },
    {
        schema: "mcp_context_for_task_response.v1.schema.json",
        value: mcpContextForTaskResponseExample,
    },
    { schema: "mcp_record_episode_request.v1.schema.json", value: mcpRecordEpisodeRequestExample },
    {
        schema: "mcp_record_episode_response.v1.schema.json",
        value: mcpRecordEpisodeResponseExample,
    },
    {
        schema: "mcp_source_evidence_request.v1.schema.json",
        value: mcpSourceEvidenceRequestExample,
    },
    {
        schema: "mcp_source_evidence_response.v1.schema.json",
        value: mcpSourceEvidenceResponseExample,
    },
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
